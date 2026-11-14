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
async function cf(path, { method = "GET", body, token, form, ok404 = false } = {}) {
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
export async function deploy(project, files) {
  const { jwt } = await cf(`/accounts/${acct()}/pages/projects/${project}/upload-token`);
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
  await cf(`/pages/assets/upsert-hashes`, { method: "POST", token: jwt, body: { hashes } });
  const form = new FormData();
  form.append("manifest", JSON.stringify(Object.fromEntries(items.map((i) => [i.path, i.hash]))));
  form.append("branch", "main");
  return cf(`/accounts/${acct()}/pages/projects/${project}/deployments`, { method: "POST", form });
}

// Connect domain (and www.domain) to the project: Pages custom domains + DNS records.
export async function attachDomain(project, zoneId, domain) {
  const target = `${project}.pages.dev`;
  for (const name of [domain, `www.${domain}`]) {
    try {
      await cf(`/accounts/${acct()}/pages/projects/${project}/domains`, { method: "POST", body: { name } });
    } catch (e) {
      if (!/already/i.test(e.message)) throw e; // already added: fine
    }
  }
  await pointName(zoneId, domain, "@", target);
  await pointName(zoneId, domain, "www", target);
}
export async function domainStatuses(project) {
  const list = await cf(`/accounts/${acct()}/pages/projects/${project}/domains`).catch(() => []);
  return Object.fromEntries((list || []).map((d) => [d.name, d.status]));
}

// ---------- Email forwarding (Cloudflare Email Routing) ----------
// Step 1: switch it on for the zone and register the customer's inbox (Cloudflare emails them a link to verify it).
export async function startForwarding(zoneId, to) {
  try {
    await cf(`/zones/${zoneId}/email/routing/dns`, { method: "POST", body: {} });
  } catch (e) {
    if (!/already|enabled/i.test(e.message)) throw e;
  }
  const list = await cf(`/accounts/${acct()}/email/routing/addresses?per_page=50`);
  const found = (list || []).find((a) => a.email.toLowerCase() === to.toLowerCase());
  return found || cf(`/accounts/${acct()}/email/routing/addresses`, { method: "POST", body: { email: to } });
}
export async function addressVerified(to) {
  const list = await cf(`/accounts/${acct()}/email/routing/addresses?per_page=50`);
  const a = (list || []).find((x) => x.email.toLowerCase() === to.toLowerCase());
  return Boolean(a?.verified);
}
// Step 2 (once verified): one rule per address, e.g. info@domain -> their inbox. Returns rule ids.
export async function createForwardRules(zoneId, domain, locals, to) {
  const existing = await cf(`/zones/${zoneId}/email/routing/rules?per_page=50`);
  const ids = [];
  for (const local of locals) {
    const from = `${local}@${domain}`;
    const found = (existing || []).find((r) => (r.matchers || []).some((m) => m.value === from));
    if (found) { ids.push(found.id); continue; }
    const r = await cf(`/zones/${zoneId}/email/routing/rules`, { method: "POST", body: {
      name: `Forward ${from}`, enabled: true, matchers: [{ type: "literal", field: "to", value: from }], actions: [{ type: "forward", value: [to] }],
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
