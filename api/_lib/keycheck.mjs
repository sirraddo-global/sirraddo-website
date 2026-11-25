// Tests one key against its real service. Used by Admin → Settings → Keys and by scripts/check-env.mjs.
// Never returns or logs the key itself. Result: { ok: true|false|null, note }  (null = can't test from here)
import { createSign } from "node:crypto";

const get = async (url, headers = {}) => {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, headers: r.headers };
};
const yes = (note) => ({ ok: true, note }), no = (note) => ({ ok: false, note });

export async function testKey(name, v, env = process.env) {
  if (!v) return { ok: null, note: "not set" };
  if (/[•*]{3}/.test(v)) return no("this is the hidden placeholder from Netlify, not the real key");
  try {
    switch (name) {
      case "PAYSTACK_SECRET_KEY": {
        const r = await get("https://api.paystack.co/balance", { authorization: `Bearer ${v}` });
        if (r.status !== 200) return no(`Paystack refused it (${r.status}: ${r.j?.message || ""})`);
        return v.startsWith("sk_live_") ? yes("live key works") : no("works, but it's a TEST key (sk_test_): use the live one");
      }
      case "RESEND_API_KEY": {
        const r = await get("https://api.resend.com/domains", { authorization: `Bearer ${v}` });
        if (r.status === 200) return yes(`works (${(r.j?.data || []).map((d) => `${d.name} ${d.status}`).join(", ") || "no domains"})`);
        if (r.status === 401 && /restricted/i.test(JSON.stringify(r.j))) return yes("works (sending-only key)");
        return no(`Resend refused it (${r.status}: ${r.j?.message || ""})`);
      }
      case "GEMINI_API_KEY": {
        const r = await get(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(v)}`);
        return r.status === 200 ? yes("works") : no(`Google AI refused it (${r.status}: ${r.j?.error?.message || ""})`);
      }
      case "ANTHROPIC_API_KEY": {
        const r = await get("https://api.anthropic.com/v1/models?limit=1", { "x-api-key": v, "anthropic-version": "2023-06-01" });
        return r.status === 200 ? yes("works") : no(`Anthropic refused it (${r.status}: ${r.j?.error?.message || ""})`);
      }
      case "CLOUDFLARE_API_TOKEN": {
        const r = await get("https://api.cloudflare.com/client/v4/user/tokens/verify", { authorization: `Bearer ${v}` });
        if (r.status !== 200 || r.j?.result?.status !== "active") return no(`Cloudflare refused it (${r.status}). Use an API *token*, not the Global API key`);
        if (!env.CLOUDFLARE_ACCOUNT_ID) return yes("active (add CLOUDFLARE_ACCOUNT_ID too)");
        const a = await get(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects?per_page=1`, { authorization: `Bearer ${v}` });
        if (a.status !== 200) return no(`active, but can't reach Cloudflare Pages (${a.status}): check the account ID and the 'Cloudflare Pages · Edit' permission`);
        const z = await get("https://api.cloudflare.com/client/v4/zones?per_page=50", { authorization: `Bearer ${v}` });
        return yes(`active, Pages OK, sees ${(z.j?.result || []).length} domain(s)`);
      }
      case "CLOUDFLARE_ACCOUNT_ID": return /^[0-9a-f]{32}$/.test(v) ? yes("looks right") : no("should be 32 letters/numbers (Cloudflare home → your account → Copy account ID)");
      case "NEON_API_KEY": {
        const id = env.NEON_PROJECT_ID;
        const r = await get(`https://console.neon.tech/api/v2/projects${id ? "/" + id : "?limit=1"}`, { authorization: `Bearer ${v}`, accept: "application/json" });
        if (r.headers.get("cf-mitigated") === "challenge") return { ok: null, note: "can't test: Neon's firewall blocks this server (not the key). Only the usage meter is affected" };
        return r.status === 200 ? yes(id ? `works for project ${r.j?.project?.name || id}` : "works") : no(`Neon refused it (${r.status}${r.status === 404 ? ": NEON_PROJECT_ID not found for this key" : ""})`);
      }
      case "NEON_PROJECT_ID": return /^[a-z]+-[a-z]+-\d+$/.test(v) ? yes("looks right") : no("should look like green-shadow-12345678 (Neon → project → Settings)");
      case "GOOGLE_SERVICE_ACCOUNT": {
        let sa; try { sa = JSON.parse(v.trim().startsWith("{") ? v : Buffer.from(v, "base64").toString("utf8")); } catch { return no("isn't valid JSON: paste the whole key file"); }
        if (!sa.client_email || !sa.private_key) return no("JSON is missing client_email or private_key");
        const b64 = (b) => Buffer.from(b).toString("base64url"), now = Math.floor(Date.now() / 1000);
        const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
        const claim = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/siteverification https://www.googleapis.com/auth/webmasters", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 }));
        const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key).toString("base64url");
        const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }), signal: AbortSignal.timeout(15000) });
        const j = await r.json().catch(() => ({}));
        return j.access_token ? yes(`works (${sa.client_email})`) : no(`Google refused it (${j.error_description || j.error || r.status}): make a new key`);
      }
      case "GOOGLE_SIGNIN_CLIENT_ID": return /\.apps\.googleusercontent\.com$/.test(v) ? yes("looks right") : no("should end with .apps.googleusercontent.com");
      case "LEAD_EMAIL_FROM": case "LEAD_EMAIL_TO": return /@/.test(v) ? yes((v.match(/[^<\s]+@[^>\s]+/) || [v])[0]) : no("should contain an email address");
      case "CRON_SECRET": case "STORE_KEYS_SECRET": return v.length >= 16 ? yes("set") : no("needs 16+ characters");
      default: return { ok: null, note: "set (not tested)" };
    }
  } catch (e) {
    return no(e.name === "TimeoutError" ? "the service didn't answer in time" : e.message);
  }
}
