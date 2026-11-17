// /api/shop — the cart on customers' Online Store websites (they are hosted elsewhere, so CORS is open).
//   GET ?config=1&s=TOKEN       -> { online, deliveryFee }   (is "Pay online" switched on for this store?)
//   POST { s, items:[{i,q}], buyer } -> starts payment into the store owner's own Paystack account, returns { url }
//   GET ?paid=1&ref=REF         -> Paystack sends the buyer back here: confirm, email the store owner, show the receipt to save
//   GET ?ref=REF&receipt=1      -> the buyer's receipt to view, print or save as PDF
import { dbConfigured, esc } from "./_lib/store.mjs";
import { shopConfig, startCheckout, confirmOrder, receiptHtml, receiptLink, receiptData } from "./_lib/shop.mjs";
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
.m{color:#4A5568;font-size:.9rem}${SAVE_CSS}${DARK_PAGE_CSS}</style><script src="/assets/theme.js"></script></head><body><div class="w"><div class="c">${body}${back ? `<a class="b" href="${esc(back)}">Back to the shop</a>` : ""}</div>
<p class="m" style="text-align:center">Secure payment by Paystack · Website by <a href="${SITE_URL}">SIRRADDO</a></p></div></body></html>`);
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
      return res.status(200).json({ online: c.online, deliveryFee: c.deliveryFee });
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
      if (o.status === "paid") {
        return page(res, 200, "Order confirmed", `<h1>Thank you, ${esc(String(o.buyer?.name || "").split(" ")[0])}!</h1><p>Your payment went through and <b>${esc(name)}</b> has your order.</p>
<table>${o.items.map((l) => `<tr><td>${esc(l.name)} × ${l.qty}</td><td class="r">${naira(l.total)}</td></tr>`).join("")}${o.delivery ? `<tr><td>Delivery</td><td class="r">${naira(o.delivery)}</td></tr>` : ""}<tr><td><b>Paid</b></td><td class="r"><b>${naira(o.total)}</b></td></tr></table>
<p class="m">Order ${esc(o.ref)}. The store will contact you about delivery.</p>
<p><b>Save your receipt</b> to your phone:</p>${saveButtons(s, o)}
<p class="m">Need it again later? Use <b>Copy receipt link</b> or keep this link: <a href="${esc(receiptLink(o))}">${esc(receiptLink(o).replace(/^https?:\/\//, ""))}</a></p>`, back);
      }
      return page(res, 200, "Payment not completed", `<h1>Payment not completed</h1><p>We couldn't confirm a payment for this order${o.status === "pending" ? " yet. If money left your account, it will be confirmed shortly: contact the store with your Paystack reference" : ""}. You can go back to the shop and try again, or order on WhatsApp.</p>`, back);
    }
    if (req.method === "POST") {
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
      if (rateLimited(ip)) return res.status(429).json({ error: "Too many tries. Please order on WhatsApp." });
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
      body = body && typeof body === "object" ? body : {};
      const out = await startCheckout(body.s, body.items, body.buyer, SITE_URL);
      return res.status(200).json(out);
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    if (e.status && e.status < 500) return res.status(e.status === 401 ? 409 : e.status).json({ error: e.status === 401 ? "This store's online payment isn't working right now. Please order on WhatsApp." : e.message });
    console.error("shop error", e);
    return res.status(500).json({ error: "Couldn't start the payment. Please try again or order on WhatsApp." });
  }
}
