// /connect?t=TOKEN — the store owner's private "Connect Paystack" page. They paste their own Live Secret Key;
// it's checked with Paystack, stored encrypted, and their store switches to "Pay online". One-time link (14 days).
import { dbConfigured, esc } from "./_lib/store.mjs";
import { findConnectRequest, connectPaystack, TEST_STEPS } from "./_lib/shop.mjs";
import { COMPANY } from "./_lib/docs.mjs";
import { DARK_PAGE_CSS } from "./_lib/darkcss.mjs";

const tries = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  tries.set(ip, list);
  if (tries.size > 5000) tries.clear();
  return list.length > 15;
}

const STEPS = `
<h2>How to find your key</h2>
<ol>
  <li>Log in to your Paystack at <b>dashboard.paystack.com</b> (on your phone or computer).</li>
  <li>At the top, make sure Paystack is in <b>Live mode</b>, not Test mode. If you can't switch to Live yet, your account still needs activating: finish <b>Activate your business</b> first (your BVN, ID and bank account).</li>
  <li>Open <b>Settings</b> (the gear) → <b>API Keys &amp; Webhooks</b>.</li>
  <li>Find <b>Live Secret Key</b>. Tap to show it, then <b>copy</b> it. It starts with <code>sk_live_</code>.</li>
  <li>Come back here, paste it in the box and tap <b>Connect</b>.</li>
  <li><b>Then test it yourself with a small amount</b>: buy your cheapest item on your own website and check it shows in Paystack.</li>
</ol>
<h2>Test key or Live key?</h2>
<ul>
  <li><b>Live keys</b> (<code>sk_live_…</code>) take <b>real payments</b>, paid out to your bank account. This is the one we need.</li>
  <li><b>Test keys</b> (<code>sk_test_…</code>) are for practice only: payments are pretend and no money moves.</li>
  <li>Each mode has a <b>Public key</b> (<code>pk_…</code>) and a <b>Secret key</b> (<code>sk_…</code>). We only need the <b>Secret</b> one.</li>
</ul>
<h2>Keep it safe</h2>
<ul>
  <li>Paste it only on this page. Never send your secret key by email, SMS or social media, and never share your Paystack password.</li>
  <li>The key is checked with Paystack and stored encrypted. Even we only see its last 4 characters.</li>
  <li>If you ever think someone else has it, tap <b>Generate new keys</b> in Paystack and ask us for a new link.</li>
</ul>`;

function page(res, code, title, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#F5F7FB;font-family:system-ui,Arial,sans-serif;color:#1B2433;line-height:1.55}.w{max-width:560px;margin:0 auto;padding:24px 16px}
.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:22px}h1{font-size:1.4rem;margin:0 0 8px;color:#13254F}h2{font-size:1.05rem;margin:20px 0 6px;color:#13254F}
ol,ul{padding-left:20px;margin:0}li{margin:4px 0}code{background:#EEF1F5;border-radius:6px;padding:1px 5px}
label{display:block;font-weight:700;margin:18px 0 6px}input{width:100%;box-sizing:border-box;font:inherit;padding:14px;border:1px solid #C9D1DE;border-radius:12px}
button{width:100%;margin-top:12px;background:#13254F;color:#fff;border:0;border-radius:12px;padding:15px;font:inherit;font-weight:700}
.err{background:#FDECEC;border-left:4px solid #C0392B;padding:10px 12px;border-radius:8px}.ok{background:#E8F6EC;border-left:4px solid #1E8E3E;padding:10px 12px;border-radius:8px}
.warn{background:#FFF8E6;color:#4A3A0A;border-left:4px solid #D9A21B;padding:10px 12px;border-radius:8px}.m{color:#4A5568;font-size:.9rem}${DARK_PAGE_CSS}</style><script src="/assets/theme.js"></script><script src="/assets/greeting.js" defer></script></head><body><div class="w"><div class="c">${body}</div>
<p class="m" style="text-align:center">${esc(COMPANY.name)} · WhatsApp ${esc(COMPANY.phone)}</p></div></body></html>`);
}

function form(r, token, error) {
  return `<h1>Connect your Paystack</h1>
<p>Hello ${esc(String(r.name).split(" ")[0])}, this private page connects <b>${esc(r.business || r.name)}</b>'s online store to <b>your own Paystack account</b>, so customers can pay by card, transfer or USSD and the money goes straight to your bank.</p>
${error ? `<p class="err">${esc(error)}</p>` : ""}
<form method="post" action="/connect?t=${esc(token)}">
<label for="k">Your Paystack Live Secret Key</label>
<input id="k" name="key" type="password" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="sk_live_…" required>
<button type="submit">Connect</button>
</form>
${STEPS}`;
}

export default async function handler(req, res) {
  if (!dbConfigured()) return page(res, 503, "Not available", "<h1>Not available right now</h1><p>Please try again later.</p>");
  const url = new URL(req.url, "http://x");
  const token = url.searchParams.get("t") || "";
  const r = await findConnectRequest(token).catch(() => null);
  if (!r) return page(res, 404, "Link expired", `<h1>This link has expired</h1><p>It may have been used already or be more than 14 days old. Message us on WhatsApp for a new one.</p>`);
  if (req.method === "POST") {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (tooMany(ip)) return page(res, 429, "Too many tries", form(r, token, "Too many tries. Please wait an hour, or message us on WhatsApp."));
    const body = typeof req.body === "object" && req.body ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || "")));
    try {
      await connectPaystack(token, body.key);
    } catch (e) {
      return page(res, 400, "Connect your Paystack", form(r, token, e.message));
    }
    return page(res, 200, "Paystack connected", `<h1>You're connected ✓</h1><p class="ok">Your store now takes online payments into your own Paystack account. Payments and payouts show in your Paystack dashboard.</p>
<p class="warn">⚠️ ${TEST_STEPS}</p>
<p>You can close this page. This link no longer works, so your key can't be changed through it.</p>`);
  }
  if (req.method !== "GET") return page(res, 405, "Not allowed", "<h1>Not allowed</h1>");
  return page(res, 200, "Connect your Paystack", form(r, token));
}
