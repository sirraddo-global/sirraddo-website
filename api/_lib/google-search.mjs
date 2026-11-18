// Submits each customer website to Google Search Console by itself, with no clicks from you:
//   1. asks Google for a verification code for the domain,
//   2. adds it as a TXT record on their domain (it's in our Cloudflare),
//   3. verifies the domain, adds it to Search Console and submits the sitemap,
//   4. adds the owner's Gmail and our own Google account (info@) as owners, so both can open it in Search Console.
// One-time setup: a Google Cloud "service account" with the Site Verification API and the Search Console API
// switched on; its JSON key goes in the GOOGLE_SERVICE_ACCOUNT setting (README → Google Search Console).
// It runs from the go-live checks and the 7am job, one step at a time, and simply tries again later if Google
// isn't ready yet (e.g. the new TXT record hasn't spread).
import { createSign } from "node:crypto";
import { cf } from "./cloudflare.mjs";

const SCOPES = "https://www.googleapis.com/auth/siteverification https://www.googleapis.com/auth/webmasters";
let cached = null; // { token, exp }

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT || "";
  if (!raw) return null;
  try {
    const j = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    return j.client_email && j.private_key ? j : null;
  } catch { return null; }
}
export const googleSearchConfigured = () => Boolean(serviceAccount());
// Our own Google account, added as an owner of every property so you can open them in Search Console.
const ourOwner = () => (process.env.SEARCH_CONSOLE_OWNER || "info@sirraddo.com.ng").trim().toLowerCase();

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
async function accessToken() {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${b64url(sig)}` }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Google sign-in failed: ${j.error_description || j.error || res.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}
async function g(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const j = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!res.ok) {
    const e = new Error(`Google: ${j.error?.message || res.status}`);
    e.status = res.status;
    throw e;
  }
  return j;
}

// One pass for one site. `state` is hosting.google ({ step, token, at, error }); returns the new state.
// Steps: token -> dns -> verified -> added -> sitemap -> done.
export async function submitToGoogle({ zoneId, domain, ownerEmails = [] }, state = {}) {
  const s = { ...state, error: null, at: new Date().toISOString() };
  const site = { type: "INET_DOMAIN", identifier: domain };
  const prop = `sc-domain:${domain}`;
  try {
    if (!s.token) {
      const t = await g("https://www.googleapis.com/siteVerification/v1/token", { method: "POST", body: { site, verificationMethod: "DNS_TXT" } });
      s.token = t.token;
      s.step = "token";
    }
    if (s.step === "token") {
      const name = domain;
      const existing = await cf(`/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}&per_page=50`);
      if (!(existing || []).some((r) => String(r.content).replace(/"/g, "") === s.token)) {
        await cf(`/zones/${zoneId}/dns_records`, { method: "POST", body: { type: "TXT", name, content: s.token, ttl: 1, comment: "Google Search Console (SIRRADDO)" } });
      }
      s.step = "dns";
    }
    if (s.step === "dns") {
      const v = await g("https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT", { method: "POST", body: { site } });
      s.resourceId = v.id;
      s.owners = v.owners || [];
      s.step = "verified";
    }
    if (s.step === "verified") {
      // Owners: the service account (already), us, and the business owner's Gmail.
      const want = [...new Set([...(s.owners || []), ourOwner(), ...ownerEmails.map((x) => String(x || "").trim().toLowerCase()).filter((x) => /@/.test(x))])];
      if (s.resourceId && want.length > (s.owners || []).length) {
        const u = await g(`https://www.googleapis.com/siteVerification/v1/webResource/${encodeURIComponent(s.resourceId)}`, { method: "PUT", body: { site, owners: want } })
          .catch((e) => ({ ownersError: e.message }));
        if (u.owners) s.owners = u.owners;
        if (u.ownersError) s.ownersError = u.ownersError;
      }
      await g(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}`, { method: "PUT" });
      s.step = "added";
    }
    if (s.step === "added") {
      const map = `https://${domain}/sitemap.xml`;
      await g(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}/sitemaps/${encodeURIComponent(map)}`, { method: "PUT" });
      s.step = "done";
      s.doneAt = new Date().toISOString();
    }
  } catch (e) {
    s.error = e.message;
    s.tries = (s.tries || 0) + 1;
  }
  return s;
}
