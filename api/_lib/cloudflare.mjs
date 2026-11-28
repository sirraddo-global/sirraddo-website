// Cloudflare: hosting customer websites on Cloudflare Pages (free), their domains (DNS zones) and email forwarding.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Netlify. The token needs (Custom token):
//   Account · Cloudflare Pages · Edit
//   Account · Email Routing Addresses · Edit
//   Zone · Zone · Edit, Zone · DNS · Edit, Zone · Email Routing Rules · Edit   (Zone resources: All zones from the account)
import { blake3 } from "@noble/hashes/blake3.js";

const API = "https://api.cloudflare.com/client/v4";
export const cloudflareConfigured = () => Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
const acct = () => process.env.CLOUDFLARE_ACCOUNT_ID;

class CfError extends Error {}
export async function cf(path, { method = "GET", body, token, form, ok404 = false } = {}) {
  const headers = { Authorization: `Bearer ${token || process.env.CLOUDFLARE_API_TOKEN}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  const j = await res.json().catch(() => ({}));
  if (ok404 && res.status === 404) return null;
  if (!res.ok || j.success === false) {
    const msg = (j.errors || []).map((e) => `${e.message}${e.code ? " (" + e.code + ")" : ""}`).join("; ") || `HTTP ${res.status}`;
    throw Object.assign(new CfError(`Cloudflare: ${msg}`), { status: res.status, codes: (j.errors || []).map((e) => e.code) });
  }
  return j.result;
}

// ---------- Domains (zones) ----------
export async function findZone(domain) {
  const list = await cf(`/zones?name=${encodeURIComponent(domain)}&account.id=${acct()}`);
  return list?.[0] || null;
}
// Adds the domain to Cloudflare (if needed). Returns { id, status: "pending"|"active", name_servers }.
export async function ensureZone(domain) {
  const found = await findZone(domain);
  if (found) return found;
  return cf(`/zones`, { method: "POST", body: { name: domain, account: { id: acct() }, type: "full" } });
}
export async function zoneStatus(zoneId) {
  return cf(`/zones/${zoneId}`);
}

// Point name (apex "@" or "www") at target, replacing any old website records at that exact name.
async function pointName(zoneId, domain, name, target) {
  const fqdn = name === "@" ? domain : `${name}.${domain}`;
  const existing = await cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(fqdn)}&per_page=50`);
  let ok = false;
  for (const r of existing || []) {
    if (!["A", "AAAA", "CNAME"].includes(r.type)) continue;
    if (r.type === "CNAME" && r.content === target) { ok = true; continue; }
    await cf(`/zones/${zoneId}/dns_records/${r.id}`, { method: "DELETE" });
  }
  if (!ok) await cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: { type: "CNAME", name: fqdn, content: target, proxied: true, ttl: 1 } });
}

// ---------- Pages projects ----------
export async function getProject(name) {
  return cf(`/accounts/${acct()}/pages/projects/${name}`, { ok404: true });
}
export async function createProject(name) {
  return cf(`/accounts/${acct()}/pages/projects`, { method: "POST", body: { name, production_branch: "main" } });
}

const TYPES = { html: "text/html", css: "text/css", js: "application/javascript", json: "application/json", txt: "text/plain", svg: "image/svg+xml",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", ico: "image/x-icon", xml: "application/xml" };
const ext = (p) => (p.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
// Same hash as Cloudflare's own tool (wrangler): blake3 of the base64 content + the file extension, first 32 hex characters.
export function fileHash(base64, path) {
  const bytes = blake3(new TextEncoder().encode(base64 + ext(path)));
  return Buffer.from(bytes).toString("hex").slice(0, 32);
}

// Upload files [{ path: "index.html", data: Buffer|string }] as a new production deployment. Returns the deployment.
// Put an earlier deployment of a project back live (Cloudflare keeps every deployment).
export async function rollbackDeployment(project, deploymentId) {
  return cf(`/accounts/${acct()}/pages/projects/${project}/deployments/${deploymentId}/rollback`, { method: "POST", body: {} });
}
export async function deploy(project, files, photos = null) {
  const { jwt } = await cf(`/accounts/${acct()}/pages/projects/${project}/upload-token`);
  // Photos first (big stores have hundreds): see deployPhotos. Pages can then point at what got uploaded.
  let ph = null;
  if (photos) { ph = await deployPhotos(jwt, photos); files = photos.pages(ph.pending); }
  const items = files.map((f) => {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const base64 = data.toString("base64");
    return { path: "/" + f.path.replace(/^\/+/, ""), base64, hash: fileHash(base64, f.path), type: TYPES[ext(f.path)] || "application/octet-stream" };
  });
  const hashes = [...new Set(items.map((i) => i.hash))];
  const missing = new Set(await cf(`/pages/assets/check-missing`, { method: "POST", token: jwt, body: { hashes } }));
  // Upload what Cloudflare doesn't have yet, in batches of about 20 MB.
  let batch = [], size = 0;
  const flush = async () => {
    if (!batch.length) return;
    await cf(`/pages/assets/upload`, { method: "POST", token: jwt, body: batch });
    batch = []; size = 0;
  };
  const done = new Set();
  for (const i of items) {
    if (!missing.has(i.hash) || done.has(i.hash)) continue;
    done.add(i.hash);
    if (size + i.base64.length > 20 * 1024 * 1024) await flush();
    batch.push({ key: i.hash, value: i.base64, metadata: { contentType: i.type }, base64: true });
    size += i.base64.length;
  }
  await flush();
  const photoHashes = ph ? Object.values(ph.done) : [];
  await cf(`/pages/assets/upsert-hashes`, { method: "POST", token: jwt, body: { hashes: [...new Set([...hashes, ...photoHashes])] } });
  const manifest = Object.fromEntries(items.map((i) => [i.path, i.hash]));
  if (ph) for (const [path, hash] of Object.entries(ph.done)) manifest["/" + path] = hash;
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("branch", "main");
  const dep = await cf(`/accounts/${acct()}/pages/projects/${project}/deployments`, { method: "POST", form });
  return ph ? Object.assign({}, dep, { photos: ph }) : dep;
}

// Photos for a deployment: [{ path: "images/07.jpg", url }] plus known = { url: hash } from earlier publishes.
// Known photos Cloudflare still has are not downloaded again. The rest are read 6 at a time and sent in
// batches, until the time budget runs out; photos left over are "pending" (the pages show them from our
// own server for now) and the next publish carries on. Returns { done: { path: hash }, known, pending }.
export async function deployPhotos(jwt, { list, known = {}, load, budgetMs = 6000 }) {
  const until = Date.now() + budgetMs;
  const kn = { ...known };
  const cached = list.filter((p) => kn[p.url]);
  const gone = new Set(cached.length ? await cf(`/pages/assets/check-missing`, { method: "POST", token: jwt, body: { hashes: [...new Set(cached.map((p) => kn[p.url]))] } }) : []);
  const done = {};
  for (const p of cached) if (!gone.has(kn[p.url])) done[p.path] = kn[p.url];
  const queue = list.filter((p) => !done[p.path]);
  let batch = [], size = 0, at = 0;
  const flush = async () => {
    if (!batch.length) return;
    const b = batch; batch = []; size = 0;
    await cf(`/pages/assets/upload`, { method: "POST", token: jwt, body: b.map((x) => x.item) });
    for (const x of b) { done[x.path] = x.item.key; kn[x.url] = x.item.key; }
  };
  while (at < queue.length && (at === 0 || Date.now() < until)) { // always at least one group, so every publish moves on
    const group = queue.slice(at, at + 6); at += group.length;
    const got = await Promise.all(group.map(async (p) => {
      const data = await load(p.url);
      if (!data) return null;
      const base64 = Buffer.from(data).toString("base64");
      return { path: p.path, url: p.url, item: { key: fileHash(base64, p.path), value: base64, metadata: { contentType: TYPES[ext(p.path)] || "image/jpeg" }, base64: true } };
    }));
    for (const x of got.filter(Boolean)) {
      if (size + x.item.value.length > 8 * 1024 * 1024) await flush();
      batch.push(x); size += x.item.value.length;
    }
    if (size > 6 * 1024 * 1024) await flush();
  }
  await flush();
  // Forget hashes of photos no longer on the site, so the list doesn't grow forever.
  const urls = new Set(list.map((p) => p.url));
  for (const u of Object.keys(kn)) if (!urls.has(u)) delete kn[u];
  return { done, known: kn, pending: list.filter((p) => !done[p.path]) };
}

// Connect domain (and www.domain) to the project: Pages custom domains + DNS records.
export async function attachDomain(project, zoneId, domain) {
  const target = `${project}.pages.dev`;
  // A free address on our own domain (name.sirraddo.com.ng) has no www. version.
  const free = domain.endsWith("." + (process.env.OWN_DOMAIN || "sirraddo.com.ng").toLowerCase());
  for (const name of free ? [domain] : [domain, `www.${domain}`]) {
    try {
      await cf(`/accounts/${acct()}/pages/projects/${project}/domains`, { method: "POST", body: { name } });
    } catch (e) {
      if (!/already/i.test(e.message)) throw e; // already added: fine
    }
  }
  await pointName(zoneId, domain, "@", target);
  if (!free) await pointName(zoneId, domain, "www", target);
}
export async function domainStatuses(project) {
  const list = await cf(`/accounts/${acct()}/pages/projects/${project}/domains`).catch(() => []);
  return Object.fromEntries((list || []).map((d) => [d.name, d.status]));
}

// ---------- Email forwarding (Cloudflare Email Routing) ----------
// Step 1: switch it on for the zone and register the customer's inbox (Cloudflare emails them a link to verify it).
// Returns { verified, resent }. An inbox that was added before but never confirmed is removed and added again,
// which makes Cloudflare send a fresh confirmation email.
const emailPerm = (e, what) => {
  if (e?.status === 403 || (e?.codes || []).some((c) => c === 10000 || c === 9109)) {
    throw new Error(`Cloudflare: your API token isn't allowed to ${what}. In Cloudflare → My Profile → API Tokens → edit the token and add: Account · Email Routing Addresses · Edit, and Zone · Email Routing Rules · Edit (keep the others). Then try again.`);
  }
  throw e;
};
export async function startForwarding(zoneId, to) {
  // Switch Email Routing on for the domain (adds Cloudflare's MX records). Needs Zone Settings · Edit; skipped when
  // it's already on (e.g. switched on by hand in Cloudflare).
  const status = async () => (await cf(`/zones/${zoneId}/email/routing`).catch(() => null));
  const st = await status();
  if (!st?.enabled) {
    try {
      await cf(`/zones/${zoneId}/email/routing/dns`, { method: "POST", body: {} });
    } catch (e) {
      const now = await status();
      if (!/already/i.test(e.message) && !now?.enabled) {
        if (e?.status === 403 || (e?.codes || []).some((c) => c === 10000 || c === 9109)) {
          throw new Error("Cloudflare: your API token can't switch on email for a new domain. Either add the permission Zone · Zone Settings · Edit to the token (My Profile → API Tokens → edit → + Add more; nothing to change in Netlify), or switch it on by hand: Cloudflare → the domain → Email → Email Routing → Onboard Domain. Then try again.");
        }
        throw e;
      }
    }
  }
  const list = await cf(`/accounts/${acct()}/email/routing/addresses?per_page=50`).catch((e) => emailPerm(e, "manage email forwarding inboxes"));
  const found = (list || []).find((a) => a.email.toLowerCase() === to.toLowerCase());
  if (found?.verified) return { verified: true, resent: false };
  if (found) await cf(`/accounts/${acct()}/email/routing/addresses/${found.id || found.tag}`, { method: "DELETE" }).catch(() => {});
  await cf(`/accounts/${acct()}/email/routing/addresses`, { method: "POST", body: { email: to } }).catch((e) => emailPerm(e, "add the inbox for email forwarding"));
  return { verified: false, resent: Boolean(found) };
}
export async function addressVerified(to) {
  const list = await cf(`/accounts/${acct()}/email/routing/addresses?per_page=50`);
  const a = (list || []).find((x) => x.email.toLowerCase() === to.toLowerCase());
  return Boolean(a?.verified);
}
// Step 2 (once every inbox is verified): one rule per address, e.g. info@domain -> owner's Gmail, receipts@domain ->
// the accountant. `to` is one inbox for all, or { local: inbox }. A rule pointing at an old inbox is updated, and our
// rules for addresses no longer in the list are removed. Returns rule ids.
export async function createForwardRules(zoneId, domain, locals, to) {
  const dest = (local) => (typeof to === "string" ? to : to[local]);
  const existing = await cf(`/zones/${zoneId}/email/routing/rules?per_page=50`);
  const ids = [];
  const wanted = new Set(locals.map((l) => `${l}@${domain}`));
  for (const r of existing || []) {
    const v = (r.matchers || []).map((m) => m.value).find(Boolean) || "";
    if (/^Forward /.test(r.name || "") && v.endsWith("@" + domain) && !wanted.has(v)) await cf(`/zones/${zoneId}/email/routing/rules/${r.id}`, { method: "DELETE" }).catch(() => {});
  }
  for (const local of locals) {
    const from = `${local}@${domain}`;
    const found = (existing || []).find((r) => (r.matchers || []).some((m) => m.value === from));
    if (found) {
      const now = (found.actions || [])[0]?.value?.[0];
      if (now && now.toLowerCase() !== dest(local).toLowerCase()) {
        await cf(`/zones/${zoneId}/email/routing/rules/${found.id}`, { method: "PUT", body: { name: found.name, matchers: found.matchers, enabled: true, actions: [{ type: "forward", value: [dest(local)] }] } });
      }
      ids.push(found.id);
      continue;
    }
    const r = await cf(`/zones/${zoneId}/email/routing/rules`, { method: "POST", body: {
      name: `Forward ${from}`, enabled: true, matchers: [{ type: "literal", field: "to", value: from }], actions: [{ type: "forward", value: [dest(local)] }],
    } });
    ids.push(r.id);
  }
  return ids;
}
export async function setRulesEnabled(zoneId, ruleIds, enabled) {
  for (const id of ruleIds || []) {
    const r = await cf(`/zones/${zoneId}/email/routing/rules/${id}`).catch(() => null);
    if (r) await cf(`/zones/${zoneId}/email/routing/rules/${id}`, { method: "PUT", body: { name: r.name, matchers: r.matchers, actions: r.actions, enabled } });
  }
}
