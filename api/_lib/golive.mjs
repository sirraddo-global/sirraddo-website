// Going live: put an approved customer website on Cloudflare Pages with their domain, keep it updated,
// pause it when the renewal is 14+ days overdue and restore it when paid, and forward their business email.
// Everything about it is kept in customer_requests.hosting (JSON).
import { getPreviewById, getRequest, updateRequest, saveHosting, esc, reference, customerEmail, customerEmailConfigured, sendCustomerEmail } from "./store.mjs";
import { buildSiteModel, exportFiles, slugify, SITE_LOOK, SITE_LOOK_NOTES } from "./sitegen.mjs";
import { ensureStoreToken } from "./shop.mjs";
import { ensureStatsKey } from "./stats.mjs";
import { shownReviews } from "./reviews.mjs";
import { submitToGoogle, googleSearchConfigured } from "./google-search.mjs";
import { balance } from "./docs.mjs";
import { applyRules, todayLagos, daysBetween } from "./automation.mjs";
import {
  cloudflareConfigured, ensureZone, findZone, cf, zoneStatus, getProject, createProject, deploy, attachDomain, domainStatuses,
  startForwarding, addressVerified, createForwardRules, setRulesEnabled, rollbackDeployment,
} from "./cloudflare.mjs";

class Bad extends Error {}
export { Bad as GoLiveError };

export function normDomain(input) {
  const d = String(input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(d) ? d : "";
}
// Money still owed on the project: the site may go on the free .pages.dev address, never on their domain.
export const owing = (r) => r?.quote_amount != null && balance(r) > 0;
export const BALANCE_GRACE_DAYS = 7;

const need = () => {
  if (!cloudflareConfigured()) throw new Bad("Cloudflare isn't connected yet. Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Netlify (see Setup status).");
};

// 1. Add the customer's domain to Cloudflare. Returns the nameservers to set at the registrar.
// "Restore previous version": puts the version before the current one back live (e.g. the owner dislikes a new look).
// The site then waits for the owner's OK before our next improvements ("Ask me first"), so 7am doesn't undo it.
export async function restorePrevious(id) {
  need();
  const row = await getRequest(id);
  const h = row.hosting || {};
  if (!h.project) throw new Bad("This site isn't published yet");
  if (h.pausedAt) throw new Bad("The site is paused. Restore it first.");
  const list = h.history || [];
  const cur = list.findIndex((v) => v.id === h.deploymentId);
  const prev = list[cur >= 0 ? cur + 1 : 1];
  if (!prev) throw new Bad("There's no earlier version saved for this site yet (versions are kept from now on).");
  await rollbackDeployment(h.project, prev.id);
  await saveHosting(id, { deploymentId: prev.id, look: prev.look, restoredAt: new Date().toISOString(), restoredFrom: h.deploymentId, lookMode: "ask", lookAsked: SITE_LOOK,
    history: list.filter((v) => v.id !== h.deploymentId) });
  return getRequest(id);
}

// Tell the owner (our customer) their website got our latest improvements, or ask first if they chose that.
// What's new for this website: store-only improvements aren't news for other websites.
export function lookNotesFor(r) {
  const isStore = r?.interest === "Online Store";
  return (SITE_LOOK_NOTES[SITE_LOOK] || []).filter((n) => isStore || !/^Online stores/i.test(n));
}
export async function tellNewLook(r, mode) {
  const to = customerEmail(r);
  if (!to || !customerEmailConfigured()) return false;
  const notes = lookNotesFor(r);
  if (!notes.length) return false;
  const { manageLink, manageTitle } = await import("./manage.mjs");
  const { changeLink } = await import("./changes.mjs");
  const manage = (await manageLink(r.id).catch(() => null))?.url;
  const change = await changeLink(r.id).catch(() => null);
  const site = r.website_url || (r.hosting?.domain ? `https://${r.hosting.domain}` : r.hosting?.pagesUrl) || "";
  const btn = (href, text) => `<p><a href="${esc(href)}" style="display:inline-block;background:#13254F;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">${esc(text)}</a></p>`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2433">
<p>Hello ${esc(String(r.name || "").split(" ")[0] || "there")},</p>
<p>${mode === "ask" ? "We've made improvements to all the websites we build, and a new version is ready for yours. As you asked, we haven't changed your website yet." : `We've made improvements to all the websites we build, and <b>your website${site ? ` (${esc(site.replace(/^https?:\/\//, ""))})` : ""} now has them</b>. Your text, photos, prices and colours stay the same.`}</p>
<p><b>What's new:</b></p><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
${mode === "ask" ? (manage ? `<p>To update your website now, open your ${esc(manageTitle(r))} link, tick <b>Update my website to the new version</b> and tap Save.</p>${btn(manage, "Open " + manageTitle(r))}` : "") : (site ? btn(site, "See your website") : "")}
<p><b>Don't like something?</b> Reply to this email${change ? ` or use your <a href="${esc(change)}">Request a change link</a>` : ""} and tell us what you'd like different. We'll adjust it for you at no cost.</p>
${mode === "ask" ? "" : manage ? `<p style="color:#4A5568;font-size:13px">Prefer to approve improvements before they reach your website? Open your <a href="${esc(manage)}">${esc(manageTitle(r))} link</a> and choose <b>Ask me first</b> under Website improvements.</p>` : ""}
<p>SIRRADDO GLOBAL LIMITED</p></div>`;
  await sendCustomerEmail(to, mode === "ask" ? "A new version of your website is ready" : "Your website has been improved", html);
  return true;
}

// "Emails to info@x and sales@x arrive in owner@gmail.com; receipts@x arrives in acc@gmail.com."
export function emailNote(email, domain) {
  const groups = {};
  for (const l of email.locals || []) (groups[inboxFor(email, l)] ||= []).push(`${l}@${domain}`);
  return Object.entries(groups).map(([inbox, list]) => `Emails to ${list.join(", ")} arrive in ${inbox}.`).join(" ");
}
async function everyInboxVerified(email) {
  for (const inbox of inboxesOf(email)) if (!(await addressVerified(inbox))) return false;
  return true;
}
// Inboxes still waiting for the Cloudflare confirmation tap (for the admin hint).
export async function unconfirmedInboxes(email) {
  const out = [];
  for (const inbox of inboxesOf(email)) if (!(await addressVerified(inbox).catch(() => false))) out.push(inbox);
  return out;
}

export async function addDomain(id, input) {
  need();
  const domain = normDomain(input);
  if (!domain) throw new Bad("That domain doesn't look right. Example: adasalon.com.ng");
  if (domain === OWN_DOMAIN) throw new Bad(`${OWN_DOMAIN} is our own website. Use name.${OWN_DOMAIN} or the customer's domain.`);
  if (domain.endsWith("." + OWN_DOMAIN)) return addFreeAddress(id, domain);
  const zone = await ensureZone(domain);
  const row = await getRequest(id);
  const h = row.hosting || {};
  await saveHosting(id, { domain, zoneId: zone.id, zoneStatus: zone.status, nameservers: zone.name_servers || [], attached: h.domain === domain ? h.attached : false });
  if (!row.handover?.domain) await updateRequest(id, { handover: { ...(row.handover || {}), domain } });
  return checkHosting(id);
}

// Free address on our own domain (theirname.sirraddo.com.ng) for one-page sites: a record in our zone,
// no nameservers to change. Only one simple name, never one of ours, never one that's already in use.
export const OWN_DOMAIN = (process.env.OWN_DOMAIN || "sirraddo.com.ng").toLowerCase();
const RESERVED = new Set(["www", "mail", "email", "api", "admin", "staff", "app", "apps", "pay", "shop", "store", "demo", "files", "cdn", "ftp", "smtp", "imap", "pop",
  "webmail", "cpanel", "ns1", "ns2", "blog", "help", "support", "status", "test", "dev", "staging", "zappi", "zappipay", "taskverse", "sirraddo", "invoices", "receipts", "info"]);
// What to do once, when the Cloudflare key can't make free addresses yet.
const FREE_SETUP = (why) => `${why} One-time fix (about 3 minutes):
1. On your phone, open dash.cloudflare.com and sign in.
2. Tap your profile (top right) → My Profile → API Tokens.
3. Find the token SIRRADDO uses (the one saved in Admin → Settings → Keys & connections) and tap Edit. If you're not sure which, tap Create Token → Custom token.
4. Under Permissions make sure it has: Zone · DNS · Edit and Zone · Zone · Read (plus the ones already there: Cloudflare Pages · Edit, Zone · Zone · Edit, Email Routing).
5. Under Zone Resources choose "Include · All zones" (or add ${OWN_DOMAIN} to the list).
6. Tap Continue to summary → Update token. If you made a new token, copy it and paste it in Admin → Settings → Keys & connections → Cloudflare token (never in a chat).
7. Come back here and tap Add again.
If ${OWN_DOMAIN} is in a different Cloudflare account from your customers' sites, the token and the account ID in Settings must be for the account that has ${OWN_DOMAIN}.`;
async function addFreeAddress(id, domain) {
  const sub = domain.slice(0, -(OWN_DOMAIN.length + 1));
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(sub) || sub.length < 3) throw new Bad(`Use one simple name before .${OWN_DOMAIN}, e.g. kassytreats.${OWN_DOMAIN} (letters, numbers and dashes).`);
  if (RESERVED.has(sub)) throw new Bad(`${domain} is kept for SIRRADDO. Pick another name.`);
  const zone = await findZone(OWN_DOMAIN).catch(() => null);
  if (!zone) throw new Bad(FREE_SETUP(`Cloudflare can't find ${OWN_DOMAIN} with the key saved in Admin.`));
  // Make sure the key may change our records (a test record, removed at once) before anything is promised.
  try {
    const t = await cf(`/zones/${zone.id}/dns_records`, { method: "POST", body: { type: "TXT", name: `_sirraddo-check.${OWN_DOMAIN}`, content: "free-address permission check", ttl: 60 } });
    if (t?.id) await cf(`/zones/${zone.id}/dns_records/${t.id}`, { method: "DELETE" }).catch(() => {});
  } catch (e) {
    if (e.status === 401 || e.status === 403 || /auth|permission|10000|9109/i.test(e.message)) throw new Bad(FREE_SETUP(`The Cloudflare key saved in Admin isn't allowed to add records to ${OWN_DOMAIN}.`));
    throw e;
  }
  const used = await cf(`/zones/${zone.id}/dns_records?name=${encodeURIComponent(domain)}&per_page=20`);
  const row = await getRequest(id);
  const ours = (used || []).every((r) => r.type === "CNAME" && /\.pages\.dev$/.test(r.content) && (row.hosting?.project ? r.content === `${row.hosting.project}.pages.dev` : false));
  if ((used || []).length && !ours) throw new Bad(`${domain} is already in use. Pick another name.`);
  await saveHosting(id, { domain, zoneId: zone.id, zoneStatus: zone.status, nameservers: [], sub: true, attached: false });
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
  if (active && h.project && !h.attached && !h.pausedAt && !owing(row)) {
    await attachDomain(h.project, h.zoneId, h.domain);
    patch.attached = true;
    await updateRequest(id, { website_url: `https://${h.domain}` });
  }
  if (h.project) {
    const st = await domainStatuses(h.project).catch(() => ({}));
    if (st[h.domain]) patch.domainStatus = st[h.domain];
  }
  if (active && h.email?.status === "verifying" && (await everyInboxVerified(h.email))) {
    const map = Object.fromEntries(h.email.locals.map((l) => [l, inboxFor(h.email, l)]));
    const rules = await createForwardRules(h.zoneId, h.domain, h.email.locals, map);
    patch.email = { ...h.email, status: h.pausedAt ? "paused" : "active", rules };
    if (h.pausedAt) await setRulesEnabled(h.zoneId, rules, false);
  }
  // Submit to Google (Search Console) by itself once the domain works; tries again on later checks if Google
  // isn't ready yet. Stops after 40 tries (about a month of mornings) and shows why in admin.
  const gs = h.google || {};
  if (active && (patch.attached || h.attached) && !h.pausedAt && googleSearchConfigured() && gs.step !== "done" && (gs.tries || 0) < 40) {
    const owners = [row.handover?.gbp_owner, row.brief?.gbp_gmail, row.email].filter((x) => /@(gmail|googlemail)\.com$/i.test(String(x || "").trim()));
    patch.google = await submitToGoogle({ zoneId: h.zoneId, domain: h.domain, ownerEmails: owners }, gs);
  }
  if (Object.keys(patch).length) await saveHosting(id, patch);
  // Email forwarding just started working: republish so the site shows info@theirdomain instead of their Gmail.
  if (patch.email?.status === "active" && h.project) await publish(id, { force: true }).catch((e) => console.error("republish after email", id, e));
  return getRequest(id);
}

function filesFor(row) {
  const site = buildSiteModel(row);
  const { pages, images } = exportFiles(site);
  return { site, pages, images };
}
// Reads one of our stored photos (straight from storage on Netlify; no web request per photo).
async function loadPhoto(url) {
  const { readStoredFile } = await import("./platform.mjs");
  const data = await readStoredFile(url);
  if (!data) throw new Bad("Couldn't read a photo. Try again.");
  return data;
}
// Photos not on Cloudflare yet are shown from our server until the next publish uploads them.
function pointPending(pages, pending) {
  if (!pending.length) return pages;
  return pages.map((p) => {
    let html = p.html;
    for (const x of pending) html = html.split("/" + x.path).join(x.url).split(x.path).join(x.url);
    return { path: p.name, data: html };
  });
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
  await ensureStoreToken(id);
  await ensureStatsKey(id);
  const row = await getPreviewById(id);
  if (!row) throw new Bad("Not found");
  if (!row.draft_md) throw new Bad("Write the website text first");
  const full = await getRequest(id);
  const h = full.hosting || {};
  if (h.pausedAt && !force) throw new Bad("This site is paused. Use Restore instead.");
  const owed = owing(full);
  if (!force && owed) throw new Bad(`The balance (${balance(full)}) isn't paid yet.`);
  row.reviews = await shownReviews(id).catch(() => null);
  const { pages, images } = filesFor(row);
  const project = await pickProject(row, h);
  const dep = await deploy(project, pages.map((p) => ({ path: p.name, data: p.html })), {
    list: images, known: h.photoHashes || {}, load: loadPhoto, budgetMs: Number(process.env.PUBLISH_PHOTO_MS) || 6000,
    pages: (pending) => pointPending(pages, pending).map((p) => (p.data !== undefined ? p : { path: p.name, data: p.html })),
  });
  const ph = dep?.photos || { known: {}, pending: [] };
  // The last few versions, newest first, so "Restore previous version" can put one back.
  const history = dep?.id ? [{ id: dep.id, at: new Date().toISOString(), look: SITE_LOOK }, ...(h.history || []).filter((v) => v.id !== dep.id)].slice(0, 6) : h.history || [];
  const patch = { photoHashes: ph.known, photosLeft: ph.pending.length, photosTotal: images.length,
    project, pagesUrl: `https://${project}.pages.dev`, publishedAt: new Date().toISOString(), look: SITE_LOOK, orderPage: pages.some((p) => p.name === "order.html"), deploymentId: dep?.id || null, history, pausedAt: null, pauseReason: null,
    // When it first went online with money still owed (auto-pauses after BALANCE_GRACE_DAYS).
    owingSince: owed ? h.owingSince || new Date().toISOString() : null };
  let attached = h.attached && h.project === project;
  if (h.zoneId && !attached && !owed) {
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
  return { row: await getRequest(id), url: fields.website_url, firstTime: Boolean(fields.project_stage), waitingForDomain: Boolean(h.domain && !attached), owed, photosLeft: ph.pending.length, photosTotal: images.length };
}

function holdingPage(name) {
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(name)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,Arial,sans-serif;background:#F5F7FB;color:#1B2433;text-align:center;padding:20px}
.c{max-width:440px;background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:28px}h1{color:#13254F;font-size:1.4rem}</style></head>
<body><div class="c"><h1>${esc(name)}</h1><p>This website is temporarily unavailable.</p>
<p style="color:#4A5568;font-size:.9rem">If you are the owner, contact SIRRADDO on <a href="https://wa.me/2348167550937">WhatsApp</a> to switch it back on.</p></div></body></html>`;
}

// 3. Pause (renewal overdue) and restore (paid). Pausing shows a short "temporarily unavailable" page and stops email forwarding.
export async function pause(id, reason = "manual") {
  need();
  const row = await getRequest(id);
  const h = row.hosting || {};
  if (!h.project) throw new Bad("This site isn't published yet");
  if (h.pausedAt) return row;
  const name = row.brief?.business_name || row.business || row.name;
  const page = holdingPage(name);
  await deploy(h.project, [{ path: "index.html", data: page }, { path: "404.html", data: page }]);
  if (h.email?.rules?.length) await setRulesEnabled(h.zoneId, h.email.rules, false).catch(() => {});
  await saveHosting(id, { pausedAt: new Date().toISOString(), pauseReason: reason, ...(h.email ? { email: { ...h.email, status: h.email.rules?.length ? "paused" : h.email.status } } : {}) });
  return getRequest(id);
}
export async function restore(id) {
  // Restored by hand with money still owed: a fresh 7 days before it pauses again.
  const row = await getRequest(id);
  if (owing(row)) await saveHosting(id, { owingSince: null });
  const out = await publish(id, { force: true });
  return out.row;
}

// Which inbox each address goes to: routes override the main inbox for some addresses (e.g. receipts -> accountant).
export const inboxFor = (email, local) => email?.routes?.[local] || email?.to;
export const inboxesOf = (email) => [...new Set([email?.to, ...Object.values(email?.routes || {})].filter(Boolean))];
const validInbox = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

// 4. Email forwarding: e.g. info@ and sales@theirdomain -> their Gmail, and optionally receipts@ -> their accountant.
// Cloudflare first emails each new inbox a link to confirm. routesText: lines like "receipts accountant@gmail.com".
export async function setupEmail(id, localsText, to, routesText = "") {
  { const r0 = await getRequest(id); if (r0?.hosting?.sub) throw new Bad("Free .sirraddo.com.ng addresses don't include email. Buy their own domain for business email."); }
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
  const routes = {};
  for (const line of String(routesText || "").split(/\n|,|;/).map((s) => s.trim()).filter(Boolean)) {
    const m = line.match(/^([a-z0-9._-]{1,40})(?:@\S*)?\s*(?:[:=→>-]+\s*|\s+)(\S+@\S+)$/i);
    if (!m) throw new Bad(`"${line}": write the address name, then the inbox, e.g. receipts accountant@gmail.com`);
    const local = m[1].toLowerCase(), inbox = m[2].toLowerCase();
    if (!validInbox(inbox)) throw new Bad(`${inbox} isn't an email address`);
    if (inbox.endsWith("@" + h.domain)) throw new Bad(`${local}@: forward to an inbox outside their domain (e.g. Gmail)`);
    if (!locals.includes(local)) locals.push(local);
    if (inbox !== to) routes[local] = inbox;
  }
  if (locals.length > 10) throw new Bad("Up to 10 addresses");
  const email = { locals, to, routes };
  // Each inbox gets Cloudflare's confirmation email once; inboxes confirmed before start straight away.
  let allVerified = true;
  for (const inbox of inboxesOf(email)) allVerified = (await startForwarding(h.zoneId, inbox)).verified && allVerified;
  await saveHosting(id, { email: { ...email, status: "verifying", rules: h.email?.rules || [], sentAt: new Date().toISOString(), alreadyVerified: allVerified }, lastError: null });
  const emails = locals.map((l) => `${l}@${h.domain}`).join("\n");
  await updateRequest(id, { handover: { ...(row.handover || {}), emails, notes: !row.handover?.notes || /^Emails to /.test(row.handover.notes) ? emailNote(email, h.domain) : row.handover.notes } });
  return checkHosting(id);
}

// After a project payment: put a balance-paused site back, or connect the domain now that it's paid.
export async function afterProjectPayment(id) {
  if (!cloudflareConfigured()) return null;
  const row = await getRequest(id);
  const h = row?.hosting || {};
  if (!h.project || owing(row)) return row;
  if (h.pausedAt && h.pauseReason === "balance") return restore(id);
  if (!h.pausedAt) {
    if (h.owingSince) await saveHosting(id, { owingSince: null });
    if (h.zoneId && !h.attached) return checkHosting(id);
  }
  return getRequest(id);
}

// ---------- Daily ----------
// Returns lines for the morning email.
export async function dailyHosting(all, now = new Date()) {
  const out = { photos: [], refreshed: [], lookAsked: [], activated: [], paused: [], balancePaused: [], restored: [], unpublished: [], ready: [], errors: [] };
  if (!cloudflareConfigured()) return out;
  const today = todayLagos(now);
  for (const r of all) {
    const h = r.hosting || {};
    try {
      // Also sites already live but not yet submitted to Google (Search Console), until done (max 40 tries).
      const googlePending = h.zoneStatus === "active" && h.attached && !h.pausedAt && googleSearchConfigured() && h.google?.step !== "done" && (h.google?.tries || 0) < 40;
      if (h.zoneId && (h.zoneStatus !== "active" || (h.project && !h.attached) || h.email?.status === "verifying" || googlePending)) {
        const before = h.zoneStatus;
        const after = await checkHosting(r.id);
        if (before !== "active" && after.hosting?.zoneStatus === "active") out.activated.push(after);
      }
      const reason = h.pauseReason || "renewal"; // pauses from before reasons were kept were all renewals
      if (h.project && !h.pausedAt && owing(r) && h.owingSince && daysBetween(h.owingSince.slice(0, 10), today) >= BALANCE_GRACE_DAYS) {
        out.balancePaused.push(await pause(r.id, "balance"));
      } else if (h.project && !h.pausedAt && r.renewal_due && daysBetween(r.renewal_due, today) >= 15) {
        out.paused.push(await pause(r.id, "renewal"));
      } else if (h.project && h.pausedAt && reason === "renewal" && r.renewal_due && daysBetween(today, r.renewal_due) > 0) {
        out.restored.push(await restore(r.id)); // renewal paid (due date moved on)
      } else if (h.project && h.pausedAt && reason === "balance" && !owing(r)) {
        out.restored.push(await restore(r.id)); // balance paid
      }
      const unpublishedEdits = h.project && !h.pausedAt && h.publishedAt && [r.draft_at, r.design_at].some((t) => t && Date.parse(t) > Date.parse(h.publishedAt));
      if (unpublishedEdits) out.unpublished.push(r);
      // A big store whose photos didn't all fit in one publish: carry on uploading (a few sites per morning).
      else if (h.project && !h.pausedAt && h.publishedAt && h.photosLeft > 0 && h.look === SITE_LOOK && out.photos.length < 3) {
        await publish(r.id, { force: true }); out.photos.push(r);
      }
      // New look for customer sites (after an update of ours), a few per morning. Skipped when they have edits not yet
      // published. The owner is emailed what changed. If they chose "Ask me first", we only ask; they update it with
      // their Manage link (or it updates next time they save something there).
      else if (h.project && !h.pausedAt && h.publishedAt && h.look !== SITE_LOOK && !owing(r)) {
        // Nothing visible changes for this website (e.g. store-only improvements on a business site): update it quietly.
        if (!lookNotesFor(r).length) {
          if (out.refreshed.length < 15) { await publish(r.id); out.refreshed.push(r); }
        } else if (h.lookMode === "ask") {
          if (h.lookAsked !== SITE_LOOK && out.lookAsked.length < 15) {
            await tellNewLook(r, "ask").catch((e) => console.error("new look email", r.id, e));
            await saveHosting(r.id, { lookAsked: SITE_LOOK });
            out.lookAsked.push(r);
          }
        } else if (out.refreshed.length < 15) {
          await publish(r.id);
          await tellNewLook(r, "done").catch((e) => console.error("new look email", r.id, e));
          out.refreshed.push(r);
        }
      }
      if (!h.project && r.preview_status === "approved" && r.quote_amount != null && balance(r) === 0) out.ready.push(r);
    } catch (e) {
      console.error("hosting check failed", r.id, e);
      out.errors.push({ r, msg: e.message });
      await saveHosting(r.id, { lastError: String(e.message).slice(0, 300), lastErrorAt: new Date().toISOString() }).catch(() => {});
    }
  }
  return out;
}
export const hostingRef = (r) => `${esc(r.name)} (${reference(r.id)})`;
