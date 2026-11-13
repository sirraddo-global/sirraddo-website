// /api/shop — the basket on customers' Online Store websites (they are hosted elsewhere, so CORS is open).
//   GET ?config=1&s=TOKEN       -> { online, deliveryFee }   (is "Pay online" switched on for this store?)
//   POST { s, items:[{i,q}], buyer } -> starts payment into the store owner's own Paystack account, returns { url }
//   GET ?paid=1&ref=REF         -> Paystack sends the buyer back here: confirm, email the order, say thank you
import { dbConfigured, esc } from "./_lib/store.mjs";
import { shopConfig, startCheckout, confirmOrder } from "./_lib/shop.mjs";
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

function page(res, code, title, body, back) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#F5F7FB;font-family:system-ui,Arial,sans-serif;color:#1B2433;line-height:1.5}.w{max-width:480px;margin:0 auto;padding:24px 16px}
.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:22px}h1{font-size:1.4rem;margin:0 0 8px}td{padding:6px 0;border-bottom:1px solid #EEF1F5}
table{width:100%;border-collapse:collapse;margin:10px 0}.r{text-align:right}a.b{display:block;text-align:center;margin-top:16px;background:#111827;color:#fff;border-radius:12px;padding:14px;font-weight:700;text-decoration:none}
.m{color:#4A5568;font-size:.9rem}${DARK_PAGE_CSS}</style><script src="/assets/theme.js"></script></head><body><div class="w"><div class="c">${body}${back ? `<a class="b" href="${esc(back)}">Back to the shop</a>` : ""}</div>
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
      if (o.status === "paid") {
        return page(res, 200, "Order confirmed", `<h1>Thank you, ${esc(String(o.buyer?.name || "").split(" ")[0])}!</h1><p>Your payment went through and <b>${esc(name)}</b> has your order.</p>
<table>${o.items.map((l) => `<tr><td>${esc(l.name)} × ${l.qty}</td><td class="r">${naira(l.total)}</td></tr>`).join("")}${o.delivery ? `<tr><td>Delivery</td><td class="r">${naira(o.delivery)}</td></tr>` : ""}<tr><td><b>Paid</b></td><td class="r"><b>${naira(o.total)}</b></td></tr></table>
<p class="m">Order ${esc(o.ref)}. A receipt is on its way to ${esc(o.buyer?.email || "your email")}. The store will contact you about delivery.</p>`, back);
      }
      return page(res, 200, "Payment not completed", `<h1>Payment not completed</h1><p>We couldn't confirm a payment for this order${o.status === "pending" ? " yet. If money left your account, it will be confirmed shortly and you'll get an email" : ""}. You can go back to the shop and try again, or order on WhatsApp.</p>`, back);
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
