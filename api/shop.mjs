// /api/shop — the cart on customers' Online Store websites (they are hosted elsewhere, so CORS is open).
//   GET ?config=1&s=TOKEN       -> { online, deliveryFee, stock }  (is "Pay online" switched on for this store?)
//   POST { s, items:[{i,q}], buyer } -> starts payment into the store owner's own Paystack account, returns { url }
//   GET ?paid=1&ref=REF         -> Paystack sends the buyer back here: confirm, email the store owner, show the receipt to save
//   GET ?ref=REF&receipt=1      -> the buyer's receipt to view, print or save as PDF
import { dbConfigured, esc } from "./_lib/store.mjs";
import { trackHtml, TRACK_CSS, addStockAlert, saveBuyerCart, firstPayment } from "./_lib/storeplus.mjs";
import { addProductReview } from "./_lib/reviews.mjs";
import { shopConfig, googleHub, startCheckout, quoteOrder, storeProduct, confirmOrder, receiptHtml, receiptLink, receiptData, claimTransfer, storeOrders, orderLink, METHOD_LABEL } from "./_lib/shop.mjs";
import * as acct from "./_lib/storeaccounts.mjs";
import { SITE_URL } from "../site.config.mjs";
import { DARK_PAGE_CSS } from "./_lib/darkcss.mjs";

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 30;
}
// Signing in is limited separately (and more tightly) than checking out.
const authHits = new Map();
function authLimited(key) {
  const now = Date.now();
  const list = (authHits.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  authHits.set(key, list);
  if (authHits.size > 5000) authHits.clear();
  return list.length > 20;
}
const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
// Buttons that save the receipt on the buyer's phone (drawn in the browser by /assets/receipt.js).
function saveButtons(s, o) {
  const data = JSON.stringify(receiptData(s, o)).replace(/</g, "\\u003c");
  return `<div class="save"><button type="button" data-save="png">Save as picture</button><button type="button" data-save="pdf">Save as PDF</button><button type="button" data-save="share">Share</button><button type="button" data-save="link">Copy receipt link</button></div><p class="m save-msg" role="status"></p>
<script type="application/json" id="rcpt">${data}</script><script src="/assets/receipt.js" defer></script>`;
}
const SAVE_CSS = `.save{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}.save button{flex:1 1 140px;font:700 15px Arial,sans-serif;border-radius:12px;padding:14px;border:0;cursor:pointer;background:#13254F;color:#fff}.save button[data-save=pdf]{background:#D9A21B;color:#13254F}.save button[data-save=share],.save button[data-save=link]{background:#fff;color:#13254F;border:1px solid #C9D1DE}.save-msg:empty{display:none}.save button[disabled]{opacity:.6}.doc{overflow-x:auto;margin-top:6px}`;

function page(res, code, title, body, back) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#F5F7FB;font-family:system-ui,Arial,sans-serif;color:#1B2433;line-height:1.5}.w{max-width:480px;margin:0 auto;padding:24px 16px}
.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:22px}h1{font-size:1.4rem;margin:0 0 8px}td{padding:6px 0;border-bottom:1px solid #EEF1F5}
table{width:100%;border-collapse:collapse;margin:10px 0}.r{text-align:right}a.b{display:block;text-align:center;margin-top:16px;background:#111827;color:#fff;border-radius:12px;padding:14px;font-weight:700;text-decoration:none}
.m{color:#4A5568;font-size:.9rem}label{display:block;font-weight:600;margin:10px 0 4px}input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px;border:1px solid #C9D1DE;border-radius:10px}
.pb{width:100%;margin-top:12px;background:#13254F;color:#fff;border:0;border-radius:12px;padding:14px;font:inherit;font-weight:800;cursor:pointer}.cp{font:inherit;font-size:.8rem;border:1px solid #C9D1DE;background:#fff;border-radius:8px;padding:2px 8px;cursor:pointer;margin-left:6px}
.okc{background:#E8F6EC;border-left:4px solid #1E8E3E;padding:10px 12px;border-radius:8px}${SAVE_CSS}${TRACK_CSS}${DARK_PAGE_CSS}</style><script src="/assets/theme.js"></script></head><body><div class="w"><div class="c">${body}${back ? `<a class="b" href="${esc(back)}">Back to the shop</a>` : ""}</div>
<p class="m" style="text-align:center">Website by <a href="${SITE_URL}">SIRRADDO</a></p></div></body></html>`);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!dbConfigured()) return res.status(503).json({ error: "Not available" });
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);

  try {
    if (req.method === "GET" && query.config) {
      const c = await shopConfig(query.s);
      if (!c) return res.status(404).json({ error: "Store not found" });
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ online: c.online, methods: c.methods, deliveryFee: c.deliveryFee, deliveryNote: c.deliveryNote, stock: c.stock, accounts: c.accounts, google: c.google,
        vstock: c.vstock, zones: c.zones, freeOver: c.freeOver, codes: c.codes, firstPct: c.firstPct });
    }
    if (req.method === "GET" && query.ref) {
      const r = await confirmOrder(query.ref);
      if (!r) return page(res, 404, "Order not found", "<h1>Order not found</h1><p>If you paid, please contact the store with your Paystack receipt.</p>");
      const o = r.order, s = r.store || {};
      const name = s.brief?.business_name || s.business || "the store";
      const back = s.website_url || null;
      if (o.status === "paid" && query.receipt) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Receipt ${esc(o.ref)} · ${esc(name)}</title>
<style>${SAVE_CSS}body{margin:0;background:#F5F7FB;padding:20px 12px}.bar{max-width:560px;margin:0 auto 12px;display:flex;gap:10px;flex-wrap:wrap}.bar button,.bar a{font:600 15px Arial,sans-serif;border-radius:10px;padding:12px 16px;border:0;cursor:pointer;text-decoration:none}
.bar button{background:#13254F;color:#fff}.bar a{background:#fff;color:#13254F;border:1px solid #C9D1DE}.doc{max-width:560px;margin:0 auto}@media print{body{background:#fff;padding:0}.bar{display:none}}</style></head>
<body><div class="bar" style="display:block">${saveButtons(s, o)}<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" onclick="print()">Print</button>${back ? `<a href="${esc(back)}">Back to the shop</a>` : ""}</div></div><div class="doc">${receiptHtml(s, o)}</div></body></html>`);
      }
      const extras = `${o.discount ? `<tr><td>Discount${o.code ? ` (${esc(o.code)})` : ""}</td><td class="r">−${naira(o.discount)}</td></tr>` : ""}${o.delivery ? `<tr><td>Delivery${o.zone ? ` (${esc(o.zone)})` : ""}</td><td class="r">${naira(o.delivery)}</td></tr>` : ""}`;
      const items = `<table>${o.items.map((l) => `<tr><td>${esc(l.name)} × ${l.qty}</td><td class="r">${naira(l.total)}</td></tr>`).join("")}${extras}<tr><td><b>Total</b></td><td class="r"><b>${naira(o.total)}</b></td></tr></table>`;
      // Order tracking (received → paid → packed → out for delivery → delivered) on every order page.
      const track = trackHtml(o, `${SITE_URL}/api/shop?ref=${encodeURIComponent(o.ref)}`);
      const first = esc(String(o.buyer?.name || "").split(" ")[0]);
      if (o.status === "cancelled") return page(res, 200, "Order cancelled", `<h1>Order cancelled</h1><p>${esc(name)} cancelled order ${esc(o.ref)}. If you think this is a mistake, please contact the store.</p>${items}`, back);
      if (o.status === "part") {
        // Pay small-small: bank details, what's been paid and what's left. The items are sent once it's fully paid.
        const t = s.shop?.transfer || {};
        const left = o.total - (o.paid_amount || 0);
        const first = firstPayment(s.shop, o.total);
        return page(res, 200, "Pay small-small", `<h1>Pay small-small</h1><p>Your items are kept for you at <b>${esc(name)}</b>. Pay by bank transfer, in parts, any time; they're sent when the full amount is paid.</p>
<table><tr><td>Bank</td><td class="r"><b>${esc(t.bank || "")}</b></td></tr><tr><td>Account name</td><td class="r"><b>${esc(t.name || "")}</b></td></tr><tr><td>Account number</td><td class="r"><b style="font-size:1.2rem;letter-spacing:1px">${esc(t.number || "")}</b> <button type="button" class="cp" data-c="${esc(t.number || "")}">Copy</button></td></tr>
<tr><td>Narration / description</td><td class="r"><b>${esc(o.ref)}</b> <button type="button" class="cp" data-c="${esc(o.ref)}">Copy</button></td></tr></table>
<table><tr><td>Total</td><td class="r"><b>${naira(o.total)}</b></td></tr><tr><td>Paid so far</td><td class="r"><b>${naira(o.paid_amount || 0)}</b></td></tr><tr><td>Left to pay</td><td class="r"><b style="font-size:1.15rem">${naira(left)}</b></td></tr></table>
${!o.paid_amount ? `<p class="okc">First payment: at least <b>${naira(first.amount)}</b> (${first.pct}%).</p>` : ""}${(o.payments || []).length ? `<p class="m">Payments received: ${o.payments.map((x) => naira(x.amount)).join(", ")}.</p>` : ""}
<h2 style="font-size:1.1rem;margin:18px 0 6px">Your order</h2>${items}${track}<p class="m">Order ${esc(o.ref)}. Save this page: it updates each time the store records a payment.</p>
<script>document.addEventListener('click',function(e){var b=e.target.closest('.cp');if(b&&navigator.clipboard){navigator.clipboard.writeText(b.getAttribute('data-c'));b.textContent='Copied';}});</script>`, back);
      }
      if (o.status === "awaiting") {
        const t = s.shop?.transfer || {};
        const claimed = o.claim?.at;
        return page(res, 200, "Pay by bank transfer", `<h1>Almost done, ${first}!</h1><p>Your order is saved. Please pay <b>${naira(o.total)}</b> by bank transfer to:</p>
<table><tr><td>Bank</td><td class="r"><b>${esc(t.bank || "")}</b></td></tr><tr><td>Account name</td><td class="r"><b>${esc(t.name || "")}</b></td></tr><tr><td>Account number</td><td class="r"><b style="font-size:1.2rem;letter-spacing:1px">${esc(t.number || "")}</b> <button type="button" class="cp" data-c="${esc(t.number || "")}">Copy</button></td></tr>
<tr><td>Amount</td><td class="r"><b>${naira(o.total)}</b></td></tr><tr><td>Narration / description</td><td class="r"><b>${esc(o.ref)}</b> <button type="button" class="cp" data-c="${esc(o.ref)}">Copy</button></td></tr></table>
${t.note ? `<p class="m">${esc(t.note)}</p>` : ""}<p class="m">Only pay into the account above, in the store's name. ${esc(name)} sends your items once they see the money.</p>
<h2 style="font-size:1.1rem;margin:18px 0 6px">Your order</h2>${items}${track}
<div id="claim">${claimed ? `<p class="okc">Thanks! You told ${esc(name)} you've paid. They'll confirm once they see it in their bank app. Keep this page: it updates when they confirm.</p>`
  : `<h2 style="font-size:1.1rem;margin:18px 0 6px">Paid? Tell the store</h2><label for="cf">Name on the account you paid from</label><input id="cf" maxlength="100" autocomplete="name"><label for="cn">Anything else (optional)</label><input id="cn" maxlength="200" placeholder="e.g. paid at 2:15pm from my phone">
<button type="button" class="pb" id="cb">I've paid</button><p class="m" id="cm" role="status"></p>`}</div>
<p class="m">Order ${esc(o.ref)}. Save this page to come back to it.</p>
<script>document.addEventListener('click',function(e){var b=e.target.closest('.cp');if(b&&navigator.clipboard){navigator.clipboard.writeText(b.getAttribute('data-c'));b.textContent='Copied';}});
var cb=document.getElementById('cb');if(cb)cb.addEventListener('click',function(){cb.disabled=true;fetch('/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim',ref:${JSON.stringify(o.ref)},from:document.getElementById('cf').value,note:document.getElementById('cn').value})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})}).then(function(){document.getElementById('claim').innerHTML='<p class="okc">Thanks! ${esc(name).replace(/'/g, "\\'")} will confirm once they see it in their bank app. Keep this page: it updates when they confirm.</p>'}).catch(function(err){cb.disabled=false;document.getElementById('cm').textContent=err.message})});</script>`, back);
      }
      if (o.status === "cod") return page(res, 200, "Order placed", `<h1>Thank you, ${first}!</h1><p>Your order is placed with <b>${esc(name)}</b>. You'll <b>pay on delivery</b>: the store will contact you on ${esc(o.buyer?.phone || "your phone")} to arrange it.</p>${s.shop?.delivery?.note ? `<p class="m">${esc(s.shop.delivery.note)}</p>` : ""}${items}${track}<p class="m">Order ${esc(o.ref)}. Save this page to come back to it. Your receipt appears here once you've paid.</p>`, back);
      if (o.status === "paid") {
        return page(res, 200, "Order confirmed", `<h1>Thank you, ${esc(String(o.buyer?.name || "").split(" ")[0])}!</h1><p>Your payment went through and <b>${esc(name)}</b> has your order.</p>
<table>${o.items.map((l) => `<tr><td>${esc(l.name)} × ${l.qty}</td><td class="r">${naira(l.total)}</td></tr>`).join("")}${extras}<tr><td><b>Paid</b></td><td class="r"><b>${naira(o.total)}</b></td></tr></table>
${track}<p class="m">Order ${esc(o.ref)}. ${o.delivered_at ? "Delivered. Thank you!" : "The store will contact you about delivery."}</p>
<p><b>Save your receipt</b> to your phone:</p>${saveButtons(s, o)}
<p class="m">Need it again later? Use <b>Copy receipt link</b> or keep this link: <a href="${esc(receiptLink(o))}">${esc(receiptLink(o).replace(/^https?:\/\//, ""))}</a></p>`, back);
      }
      return page(res, 200, "Payment not completed", `<h1>Payment not completed</h1><p>We couldn't confirm a payment for this order${o.status === "pending" ? " yet. If money left your account, it will be confirmed shortly: contact the store with your Paystack reference" : ""}. You can go back to the shop and try again, or order on WhatsApp.</p>`, back);
    }
    if (req.method === "POST") {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
      body = body && typeof body === "object" ? body : {};
      const action = String(body.action || "checkout");
      if (action === "claim") {
        if (rateLimited(ip)) return res.status(429).json({ error: "Too many tries. Please message the store on WhatsApp." });
        await claimTransfer(body.ref, { from: body.from, note: body.note });
        return res.status(200).json({ ok: true });
      }
      if (action === "checkout") {
        if (rateLimited(ip)) return res.status(429).json({ error: "Too many tries. Please order on WhatsApp." });
        const out = await startCheckout(body.s, body.items, body.buyer, SITE_URL, { method: body.method, buyerToken: body.t, zone: "zone" in body ? body.zone : undefined, code: body.code });
        return res.status(200).json(out);
      }
      // The cart's total with a discount code and the delivery area (nothing is saved).
      if (action === "quote") return res.status(200).json(await quoteOrder(body.s, body.items, { zone: body.zone, code: body.code }));
      // "Tell me when it's back": the owner sees the list in My store and messages them from their own WhatsApp.
      if (action === "notify_me") {
        if (rateLimited(ip)) return res.status(429).json({ error: "Too many tries. Please message the store on WhatsApp." });
        const sp = await storeProduct(body.s, body.i);
        if (!sp) return res.status(404).json({ error: "Store not found" });
        if (!sp.product) return res.status(404).json({ error: "Product not found" });
        return res.status(200).json(await addStockAlert(sp.id, sp.product, { name: body.name, phone: body.phone, variant: body.v }));
      }
      // Buyer accounts (Standard Store): only when the store has accounts switched on.
      const c = await shopConfig(body.s);
      if (!c) return res.status(404).json({ error: "Store not found" });
      if (!c.accounts) return res.status(409).json({ error: "Accounts aren't switched on for this store." });
      if (action === "google_hub") { const { status, ...g } = await googleHub(body.s, body.o); return res.status(status || 200).json(g); }
      if (["signup", "login", "google", "reset"].includes(action) && authLimited(ip + ":" + c.id)) return res.status(429).json({ error: "Too many tries. Please wait a while, or order as a guest." });
      try {
        if (action === "signup") return res.status(200).json(await acct.buyerSignup(c.id, body));
        if (action === "login") return res.status(200).json(await acct.buyerLogin(c.id, body));
        if (action === "google") return res.status(200).json(await acct.buyerGoogle(c.id, body.credential, body.phone));
        if (action === "reset") return res.status(200).json(await acct.buyerResetWithCode(c.id, body));
        const b = await acct.buyerFromToken(c.id, body.t);
        if (!b) return res.status(401).json({ error: "Please sign in again." });
        if (action === "me") return res.status(200).json({ buyer: acct.buyerPub(b) });
        if (action === "update") return res.status(200).json({ buyer: await acct.buyerUpdate(b, body) });
        if (action === "password") return res.status(200).json(await acct.buyerChangePassword(b, body.current, body.password));
        // The signed-in buyer's cart is kept, so the owner can follow up on carts left unfinished.
        if (action === "cart") return res.status(200).json(await saveBuyerCart(c.id, b.id, body.items));
        // Reviews of a product, only from buyers who bought it ("Verified buyer"). The owner approves them in My store.
        if (action === "review") return res.status(200).json(await addProductReview(c.id, b, body));
        if (action === "orders") {
          const list = await storeOrders(c.id, { buyerId: b.id, limit: 50 });
          const { trackStage } = await import("./_lib/storeplus.mjs");
          return res.status(200).json({ orders: list.map((o) => ({ ref: o.ref, items: o.items.map((l) => ({ i: l.i, v: l.v || "", name: l.name, qty: l.qty, total: l.total })), total: o.total, status: o.status, method: o.method,
            how: METHOD_LABEL[o.method] || "", created_at: o.created_at, delivered: Boolean(o.delivered_at), stage: trackStage(o), track: orderLink(o), link: o.status === "paid" ? receiptLink(o) : orderLink(o) })) });
        }
      } catch (e) { return res.status(400).json({ error: e.message }); }
      return res.status(400).json({ error: "Unknown action" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e.status && e.status < 500) return res.status(e.status === 401 ? 409 : e.status).json({ error: e.status === 401 ? "This store's online payment isn't working right now. Please order on WhatsApp." : e.message });
    console.error("shop error", e);
    return res.status(500).json({ error: "Couldn't start the payment. Please try again or order on WhatsApp." });
  }
}
