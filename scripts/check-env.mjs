// Checks every setting in .env against its real service, without ever showing a key. Run on the VPS:
//   cd /opt/apps/sirraddo-website && node --env-file=.env scripts/check-env.mjs
import { createSign } from "node:crypto";
import { access, constants } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { testKey } from "../api/_lib/keycheck.mjs";
import { loadVault } from "../api/_lib/vault.mjs";

// Keys saved in Admin → Settings → Keys win over .env, exactly as on the live site.
const vault = await loadVault().catch((e) => ({ error: e.message }));

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
for (const k of ["PAYSTACK_SECRET_KEY", "RESEND_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "NEON_API_KEY", "NEON_PROJECT_ID", "GOOGLE_SERVICE_ACCOUNT", "GOOGLE_SIGNIN_CLIENT_ID", "LEAD_EMAIL_FROM", "LEAD_EMAIL_TO"]) {
  if (!E[k]) { if (k !== "ANTHROPIC_API_KEY") skip(k, "not set"); continue; }
  const t = await testKey(k, E[k]);
  (t.ok === true ? ok : t.ok === false ? bad : skip)(k, t.note);
}
await check("CRON_SECRET", async (v) => (v.length >= 16 ? ok("CRON_SECRET", "set") : bad("CRON_SECRET", "needs 16+ characters: node scripts/set-env.mjs CRON_SECRET")));
await check("FILES_DIR", async (v) => { await access(v, constants.W_OK); ok("FILES_DIR", "folder is writable"); });
await check("BG_KEY", async () => {
  const r = await fetch(`http://127.0.0.1:${E.BG_PORT || 4105}/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  r?.ok ? ok("BG_KEY", "background remover answering") : bad("BG_KEY", "background remover not answering: pm2 restart bg-remover");
});

results.unshift(vault.locked ? ["FIX ", "Saved keys", "locked with an older ADMIN_PASSWORD: unlock in Admin → Settings → Keys"] : ["OK  ", "Saved keys", vault.error ? "not loaded: " + vault.error : `${vault.loaded ?? 0} loaded from Admin → Settings → Keys`]);
const w = Math.max(...results.map((r) => r[1].length));
for (const [s, n, note] of results) console.log(`${s} ${n.padEnd(w)}  ${note}`);
const fix = results.filter((r) => r[0] === "FIX ").length;
console.log(fix ? `\n${fix} to fix. Set one again with: node scripts/set-env.mjs NAME   then: pm2 restart sirraddo-website --update-env` : "\nEverything checks out.");
