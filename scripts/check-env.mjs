// Checks every setting in .env against its real service, without ever showing a key. Run on the VPS:
//   cd /opt/apps/sirraddo-website && node --env-file=.env scripts/check-env.mjs
import { createSign } from "node:crypto";
import { access, constants } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const E = process.env;
const results = [];
const ok = (name, note) => results.push(["OK  ", name, note || ""]);
const bad = (name, note) => results.push(["FIX ", name, note]);
const skip = (name, note) => results.push(["--  ", name, note]);
const masked = (v) => /[•*]{3}/.test(v || "");
const get = async (url, headers = {}) => { const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, j }; };
async function check(name, fn) {
  const v = E[name];
  if (!v) return skip(name, "not set");
  if (masked(v)) return bad(name, "still the hidden placeholder from Netlify: set it again");
  try { await fn(v); } catch (e) { bad(name, e.message || String(e)); }
}

await check("DATABASE_URL", async (v) => {
  const rows = await neon(v)`SELECT count(*)::int AS n FROM customer_requests`;
  ok("DATABASE_URL", `connected, ${rows[0].n} requests`);
});
await check("ADMIN_PASSWORD", async (v) => (v.length >= 12 ? ok("ADMIN_PASSWORD", `${v.length} characters`) : bad("ADMIN_PASSWORD", "needs 12+ characters")));
await check("PAYSTACK_SECRET_KEY", async (v) => {
  const r = await get("https://api.paystack.co/balance", { authorization: `Bearer ${v}` });
  if (r.status !== 200) throw new Error(`Paystack refused it (${r.status}: ${r.j?.message || ""})`);
  ok("PAYSTACK_SECRET_KEY", v.startsWith("sk_live_") ? "live key works" : "works, but it's a TEST key (sk_test_): use the live one");
});
await check("RESEND_API_KEY", async (v) => {
  const r = await get("https://api.resend.com/domains", { authorization: `Bearer ${v}` });
  if (r.status === 200) return ok("RESEND_API_KEY", `works (${(r.j?.data || []).map((d) => `${d.name} ${d.status}`).join(", ") || "no domains"})`);
  if (r.status === 401 && /restricted/i.test(JSON.stringify(r.j))) return ok("RESEND_API_KEY", "works (sending-only key)");
  throw new Error(`Resend refused it (${r.status}: ${r.j?.message || ""})`);
});
await check("GEMINI_API_KEY", async (v) => {
  const r = await get(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(v)}`);
  if (r.status !== 200) throw new Error(`Google AI refused it (${r.status}: ${r.j?.error?.message || ""})`);
  ok("GEMINI_API_KEY", "works");
});
for (const extra of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "BACKUP_AI_KEY"]) if (E[extra]) ok(extra, "set (not tested)");
await check("CLOUDFLARE_API_TOKEN", async (v) => {
  const r = await get("https://api.cloudflare.com/client/v4/user/tokens/verify", { authorization: `Bearer ${v}` });
  if (r.status !== 200 || r.j?.result?.status !== "active") throw new Error(`Cloudflare refused it (${r.status}: ${r.j?.errors?.[0]?.message || "not active"}). Use an API *token*, not the Global API key`);
  if (E.CLOUDFLARE_ACCOUNT_ID) {
    const a = await get(`https://api.cloudflare.com/client/v4/accounts/${E.CLOUDFLARE_ACCOUNT_ID}/pages/projects?per_page=1`, { authorization: `Bearer ${v}` });
    if (a.status !== 200) throw new Error(`token is active but can't reach Cloudflare Pages (${a.status}): check the account ID and the 'Cloudflare Pages · Edit' permission`);
    const z = await get("https://api.cloudflare.com/client/v4/zones?per_page=50", { authorization: `Bearer ${v}` });
    return ok("CLOUDFLARE_API_TOKEN", `active, Pages OK, sees ${(z.j?.result || []).length} domain(s)`);
  }
  ok("CLOUDFLARE_API_TOKEN", "active (CLOUDFLARE_ACCOUNT_ID not set)");
});
await check("NEON_API_KEY", async (v) => {
  const id = E.NEON_PROJECT_ID;
  const r = await get(`https://console.neon.tech/api/v2/projects${id ? "/" + id : "?limit=1"}`, { authorization: `Bearer ${v}`, accept: "application/json" });
  if (r.status !== 200) throw new Error(`Neon refused it (${r.status}${r.status === 404 ? ": NEON_PROJECT_ID not found for this key" : ""})`);
  ok("NEON_API_KEY", id ? `works for project ${r.j?.project?.name || id}` : "works");
});
await check("GOOGLE_SERVICE_ACCOUNT", async (v) => {
  let sa; try { sa = JSON.parse(v.trim().startsWith("{") ? v : Buffer.from(v, "base64").toString("utf8")); } catch { throw new Error("isn't valid JSON: paste the whole key file"); }
  if (!sa.client_email || !sa.private_key) throw new Error("JSON is missing client_email or private_key");
  const b64 = (b) => Buffer.from(b).toString("base64url"), now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/siteverification https://www.googleapis.com/auth/webmasters", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`Google refused it (${j.error_description || j.error || r.status}): the key may have been deleted; make a new one`);
  ok("GOOGLE_SERVICE_ACCOUNT", `works (${sa.client_email})`);
});
await check("GOOGLE_SIGNIN_CLIENT_ID", async (v) => (/\.apps\.googleusercontent\.com$/.test(v) ? ok("GOOGLE_SIGNIN_CLIENT_ID", "looks right") : bad("GOOGLE_SIGNIN_CLIENT_ID", "should end with .apps.googleusercontent.com")));
for (const k of ["LEAD_EMAIL_FROM", "LEAD_EMAIL_TO"]) await check(k, async (v) => (/@/.test(v) ? ok(k, (v.match(/[^<\s]+@[^>\s]+/) || [v])[0]) : bad(k, "should contain an email address")));
await check("CRON_SECRET", async (v) => (v.length >= 16 ? ok("CRON_SECRET", "set") : bad("CRON_SECRET", "needs 16+ characters: node scripts/set-env.mjs CRON_SECRET")));
await check("FILES_DIR", async (v) => { await access(v, constants.W_OK); ok("FILES_DIR", "folder is writable"); });
await check("BG_KEY", async () => {
  const r = await fetch(`http://127.0.0.1:${E.BG_PORT || 4105}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  r?.ok ? ok("BG_KEY", "background remover answering") : bad("BG_KEY", "background remover not answering: pm2 restart bg-remover");
});

const w = Math.max(...results.map((r) => r[1].length));
for (const [s, n, note] of results) console.log(`${s} ${n.padEnd(w)}  ${note}`);
const fix = results.filter((r) => r[0] === "FIX ").length;
console.log(fix ? `\n${fix} to fix. Set one again with: node scripts/set-env.mjs NAME   then: pm2 restart sirraddo-website --update-env` : "\nEverything checks out.");
