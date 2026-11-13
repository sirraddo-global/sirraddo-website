// Going live: put an approved customer website on Cloudflare Pages with their domain, keep it updated,
// pause it when the renewal is 14+ days overdue and restore it when paid, and forward their business email.
// Everything about it is kept in customer_requests.hosting (JSON).
import { getPreviewById, getRequest, updateRequest, saveHosting, esc, reference } from "./store.mjs";
import { buildSiteModel, exportFiles, slugify } from "./sitegen.mjs";
import { balance } from "./docs.mjs";
import { applyRules, todayLagos, daysBetween } from "./automation.mjs";
import {
  cloudflareConfigured, ensureZone, zoneStatus, getProject, createProject, deploy, attachDomain, domainStatuses,
  startForwarding, addressVerified, createForwardRules, setRulesEnabled,
} from "./cloudflare.mjs";

class Bad extends Error {}
export { Bad as GoLiveError };

export function normDomain(input) {
  const d = String(input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) ? d : "";
}
const need = () => {
  if (!cloudflareConfigured()) throw new Bad("Cloudflare isn't connected yet. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Vercel (see Setup status).");
};

// 1. Add the customer's domain to Cloudflare. Returns the nameservers to set at the registrar.
export async function addDomain(id, input) {
  need();
  const domain = normDomain(input);
  if (!domain) throw new Bad("That domain doesn't look right. Example: adasalon.com.ng");
  const zone = await ensureZone(domain);
  const row = await getRequest(id);
  const h = row.hosting || {};
  await saveHosting(id, { domain, zoneId: zone.id, zoneStatus: zone.status, nameservers: zone.name_servers || [], attached: h.domain === domain ? h.attached : false });
  if (!row.handover?.domain) await updateRequest(id, { handover: { ...(row.handover || {}), domain } });
  return checkHosting(id);
}

// Re-check the domain; connect it once active; finish email forwarding once the inbox is verified.
export async function checkHosting(id) {
  const row = await getRequest(id);
  const h = row?.hosting || {};
  if (!h.zoneId || !cloudflareConfigured()) return row;
  const patch = {};
  if (h.zoneStatus !== "active") {
    const z = await zoneStatus(h.zoneId);
    patch.zoneStatus = z.status;
    if (z.name_servers?.length) patch.nameservers = z.name_servers;
  }
  const active = (patch.zoneStatus || h.zoneStatus) === "active";
  if (active && h.project && !h.attached && !h.pausedAt) {
    await attachDomain(h.project, h.zoneId, h.domain);
    patch.attached = true;
    await updateRequest(id, { website_url: `https://${h.domain}` });
  }
  if (h.project) {
    const st = await domainStatuses(h.project).catch(() => ({}));
    if (st[h.domain]) patch.domainStatus = st[h.domain];
  }
  if (active && h.email?.status === "verifying" && (await addressVerified(h.email.to))) {
    const rules = await createForwardRules(h.zoneId, h.domain, h.email.locals, h.email.to);
    patch.email = { ...h.email, status: h.pausedAt ? "paused" : "active", rules };
    if (h.pausedAt) await setRulesEnabled(h.zoneId, rules, false);
  }
  if (Object.keys(patch).length) await saveHosting(id, patch);
  return getRequest(id);
}

function filesFor(row) {
  const site = buildSiteModel(row);
  const { pages, images } = exportFiles(site);
  return { site, pages, images };
}
async function fetchImages(images) {
  const out = [];
  for (const im of images) {
    const r = await fetch(im.url);
    if (!r.ok) throw new Bad(`Couldn't fetch a photo (${r.status}). Try again.`);
    out.push({ path: im.path, data: Buffer.from(await r.arrayBuffer()) });
  }
  return out;
}
async function pickProject(row, h) {
  if (h.project) {
    if (!(await getProject(h.project))) await createProject(h.project);
    return h.project;
  }
  const base = slugify(row.brief?.business_name || row.business || row.name).slice(0, 50) || `site-${row.id}`;
  for (const name of [base, `${base}-${row.id}`, `${base}-${row.id}-sgl`]) {
    if (await getProject(name)) continue; // taken (another customer, or someone else's on pages.dev)
    try {
      await createProject(name);
      return name;
    } catch (e) {
      if (!/already|exists|taken/i.test(e.message)) throw e;
    }
  }
  throw new Bad("Couldn't find a free project name on Cloudflare. Try again.");
}

// 2. Publish (or update) the website. Marks the project Live the first time.
export async function publish(id, { force = false } = {}) {
  need();
  const row = await getPreviewById(id);
  if (!row) throw new Bad("Not found");
  if (!row.draft_md) throw new Bad("Write the website text first");
  const full = await getRequest(id);
  const h = full.hosting || {};
  if (h.pausedAt && !force) throw new Bad("This site is paused. Use Restore instead.");
  if (!force && full.quote_amount != null && balance(full) > 0) throw new Bad(`The balance (${balance(full)}) isn't paid yet.`);
  const { pages, images } = filesFor(row);
  const files = [...pages.map((p) => ({ path: p.name, data: p.html })), ...(await fetchImages(images))];
  files.push({ path: "404.html", data: pages[0].html });
  const project = await pickProject(row, h);
  const dep = await deploy(project, files);
  const patch = { project, pagesUrl: `https://${project}.pages.dev`, publishedAt: new Date().toISOString(), deploymentId: dep?.id || null, pausedAt: null };
  let attached = h.attached && h.project === project;
  if (h.zoneId && !attached) {
    const z = await zoneStatus(h.zoneId).catch(() => null);
    if (z) patch.zoneStatus = z.status;
    if (z?.status === "active") { await attachDomain(project, h.zoneId, h.domain); attached = true; }
  }
  patch.attached = Boolean(attached);
  await saveHosting(id, patch);
  const fields = { website_url: attached ? `https://${h.domain}` : patch.pagesUrl };
  if (full.project_stage !== "live") fields.project_stage = "live";
  let updated = await updateRequest(id, fields);
  if (fields.project_stage) updated = (await applyRules(updated, { project_stage: "live" })) || updated;
  if (h.email?.status === "paused") {
    await setRulesEnabled(h.zoneId, h.email.rules, true).catch(() => {});
    await saveHosting(id, { email: { ...h.email, status: "active" } });
  }
  return { row: await getRequest(id), url: fields.website_url, firstTime: Boolean(fields.project_stage), waitingForDomain: Boolean(h.domain && !attached) };
}

function holdingPage(name) {
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(name)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,Arial,sans-serif;background:#F5F7FB;color:#1B2433;text-align:center;padding:20px}
.c{max-width:440px;background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:28px}h1{color:#13254F;font-size:1.4rem}</style></head>
<body><div class="c"><h1>${esc(name)}</h1><p>This website is temporarily unavailable.</p>
<p style="color:#4A5568;font-size:.9rem">If you are the owner, contact SIRRADDO on <a href="https://wa.me/2348167550937">WhatsApp</a> to switch it back on.</p></div></body></html>`;
}

// 3. Pause (renewal overdue) and restore (paid). Pausing shows a short "temporarily unavailable" page and stops email forwarding.
export async function pause(id) {
  need();
  const row = await getRequest(id);
  const h = row.hosting || {};
  if (!h.project) throw new Bad("This site isn't published yet");
  if (h.pausedAt) return row;
  const name = row.brief?.business_name || row.business || row.name;
  const page = holdingPage(name);
  await deploy(h.project, [{ path: "index.html", data: page }, { path: "404.html", data: page }]);
  if (h.email?.rules?.length) await setRulesEnabled(h.zoneId, h.email.rules, false).catch(() => {});
  await saveHosting(id, { pausedAt: new Date().toISOString(), ...(h.email ? { email: { ...h.email, status: h.email.rules?.length ? "paused" : h.email.status } } : {}) });
  return getRequest(id);
}
export async function restore(id) {
  const out = await publish(id, { force: true });
  return out.row;
}

// 4. Email forwarding: e.g. info@ and sales@theirdomain -> their Gmail. Cloudflare first emails them a link to confirm.
export async function setupEmail(id, localsText, to) {
  need();
  const row = await getRequest(id);
  const h = row.hosting || {};
  if (!h.zoneId) throw new Bad("Add their domain first");
  if (h.zoneStatus !== "active") throw new Bad("Their domain isn't active on Cloudflare yet (nameservers). Tap Check now.");
  const locals = [...new Set(String(localsText || "").split(/[\s,;]+/).map((s) => s.replace(/@.*$/, "").toLowerCase()).filter((s) => /^[a-z0-9._-]{1,40}$/.test(s)))].slice(0, 10);
  if (!locals.length) throw new Bad("Write the address names, e.g. info, sales");
  to = String(to || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Bad("Enter the inbox to forward to, e.g. theirname@gmail.com");
  if (to.endsWith("@" + h.domain)) throw new Bad("Forward to an inbox outside their domain (e.g. Gmail)");
  await startForwarding(h.zoneId, to);
  await saveHosting(id, { email: { locals, to, status: "verifying", rules: [] } });
  const emails = locals.map((l) => `${l}@${h.domain}`).join("\n");
  await updateRequest(id, { handover: { ...(row.handover || {}), emails, notes: row.handover?.notes || `Emails to ${locals.map((l) => l + "@" + h.domain).join(", ")} arrive in ${to}.` } });
  return checkHosting(id);
}

// ---------- Daily ----------
// Returns lines for the morning email.
export async function dailyHosting(all, now = new Date()) {
  const out = { activated: [], paused: [], restored: [], unpublished: [], ready: [], errors: [] };
  if (!cloudflareConfigured()) return out;
  const today = todayLagos(now);
  for (const r of all) {
    const h = r.hosting || {};
    try {
      if (h.zoneId && (h.zoneStatus !== "active" || (h.project && !h.attached) || h.email?.status === "verifying")) {
        const before = h.zoneStatus;
        const after = await checkHosting(r.id);
        if (before !== "active" && after.hosting?.zoneStatus === "active") out.activated.push(after);
      }
      if (h.project && !h.pausedAt && r.renewal_due && daysBetween(r.renewal_due, today) >= 15) {
        out.paused.push(await pause(r.id));
      } else if (h.project && h.pausedAt && r.renewal_due && daysBetween(today, r.renewal_due) > 0) {
        out.restored.push(await restore(r.id)); // renewal paid (due date moved on)
      }
      if (h.project && !h.pausedAt && h.publishedAt && [r.draft_at, r.design_at].some((t) => t && Date.parse(t) > Date.parse(h.publishedAt))) out.unpublished.push(r);
      if (!h.project && r.preview_status === "approved" && r.quote_amount != null && balance(r) === 0) out.ready.push(r);
    } catch (e) {
      console.error("hosting check failed", r.id, e);
      out.errors.push({ r, msg: e.message });
    }
  }
  return out;
}
export const hostingRef = (r) => `${esc(r.name)} (${reference(r.id)})`;
