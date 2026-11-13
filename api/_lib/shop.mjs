// Online Store checkout for customer websites.
// Every store site has a basket. Buyers can order on WhatsApp (always) or pay online with Paystack (once you add
// the store owner's own Paystack secret key in admin → Go live). Money goes straight to the store owner's Paystack
// account; we only work out the total from the product list we built the site from, start the payment, confirm it,
// and email the order to the store and the buyer.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { kindFor } from "./brief-schema.mjs";
import { priceAmount } from "./sitegen.mjs";
import { q, ensureSchema, getRequest, updateRequestShop, sendCustomerEmail, customerEmailConfigured, sendEmail, emailConfigured, esc, reference } from "./store.mjs";

const PS = "https://api.paystack.co";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Products (shared with the site generator so indexes always match) ----------
export function shopProducts(brief) {
  return (brief?.products || []).map((p, i) => ({ ...p, i, amount: priceAmount(p.price) })).filter((p) => p.name);
}

// ---------- The store owner's Paystack key, encrypted at rest ----------
function cryptoKey() {
  const secret = process.env.STORE_KEYS_SECRET || process.env.CRON_SECRET || "";
  if (secret.length < 16) throw new Error("Set STORE_KEYS_SECRET (or CRON_SECRET) in Vercel first");
  return createHash("sha256").update("sirraddo-store-keys:" + secret).digest();
}
export function sealKey(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", cryptoKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
function openKey(sealed) {
  const [iv, tag, data] = String(sealed || "").split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", cryptoKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

async function ps(key, path, body) {
  const res = await fetch(PS + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === false) throw Object.assign(new Error(j.message || `Paystack ${res.status}`), { status: res.status });
  return j.data;
}

// ---------- Admin: switch online payment on/off for a store ----------
export async function ensureShopToken(id) {
  const row = await getRequest(id);
  if (!row || row.shop?.token) return row;
  return updateRequestShop(id, { token: randomBytes(12).toString("base64url") });
}
// Online Stores get a basket token before their site is built, so the published pages can talk to /api/shop.
export async function ensureStoreToken(id) {
  const row = await getRequest(id);
  if (row && kindFor(row.interest) === "store" && !row.shop?.token) await ensureShopToken(id);
}
export async function setShopPayments(id, { secretKey, deliveryFee, notify, remove }) {
  let row = await ensureShopToken(id);
  const patch = {};
  if (remove) { patch.key = null; patch.keyEnd = null; patch.keyMode = null; }
  else if (secretKey) {
    const k = String(secretKey).trim();
    if (!/^sk_(live|test)_[A-Za-z0-9]{20,}$/.test(k)) throw new Error("That isn't a Paystack secret key (it starts with sk_live_)");
    try { await ps(k, "/transaction?perPage=1"); } catch (e) { throw new Error(e.status === 401 ? "Paystack didn't accept that key. Copy it again from their Paystack dashboard." : "Couldn't check the key with Paystack: " + e.message); }
    patch.key = sealKey(k); patch.keyEnd = k.slice(-4); patch.keyMode = k.startsWith("sk_live_") ? "live" : "test";
  }
  if (deliveryFee !== undefined) {
    const n = deliveryFee === "" || deliveryFee === null ? null : Number(deliveryFee);
    if (n !== null && !(Number.isInteger(n) && n >= 0 && n <= 1000000)) throw new Error("Delivery fee must be a whole number of naira");
    patch.deliveryFee = n;
  }
  if (notify !== undefined) {
    const v = String(notify || "").trim().toLowerCase();
    if (v && !EMAIL.test(v)) throw new Error("Order alerts need an email address");
    patch.notify = v || null;
  }
  return updateRequestShop(row.id, patch);
}

// ---------- Orders ----------
async function storeByToken(token) {
  if (!token || String(token).length < 10) return null;
  await ensureSchema();
  const rows = await q(`SELECT id, name, business, contact, email, interest, brief, shop, hosting, website_url FROM customer_requests WHERE shop->>'token' = $1`, [String(token)]);
  return rows[0] ?? null;
}
const storeName = (r) => r.brief?.business_name || r.business || r.name;
const ownerEmail = (r) => r.shop?.notify || (EMAIL.test(String(r.brief?.order_alerts || "")) ? r.brief.order_alerts : null) || r.email || null;

export async function shopConfig(token) {
  const r = await storeByToken(token);
  if (!r) return null;
  return { online: Boolean(r.shop?.key), mode: r.shop?.keyMode || null, deliveryFee: r.shop?.deliveryFee ?? null, name: storeName(r) };
}

// Work out the order from the product list (never trust prices from the browser).
function priceOrder(r, items) {
  const products = shopProducts(r.brief);
  const lines = [];
  for (const it of Array.isArray(items) ? items.slice(0, 50) : []) {
    const p = products.find((x) => x.i === Number(it?.i));
    const qty = Math.min(99, Math.max(1, Math.floor(Number(it?.q) || 0)));
    if (!p || !p.amount || !qty) continue;
    lines.push({ i: p.i, name: p.name, price: p.amount, qty, total: p.amount * qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const delivery = r.shop?.deliveryFee || 0;
  return { lines, subtotal, delivery, total: subtotal + delivery };
}

export async function startCheckout(token, items, buyer, returnBase) {
  const r = await storeByToken(token);
  if (!r) throw Object.assign(new Error("Store not found"), { status: 404 });
  if (!r.shop?.key) throw Object.assign(new Error("Online payment isn't switched on for this store. Please order on WhatsApp."), { status: 409 });
  const order = priceOrder(r, items);
  if (!order.lines.length) throw Object.assign(new Error("Your basket is empty"), { status: 400 });
  const b = {
    name: String(buyer?.name || "").trim().slice(0, 120), phone: String(buyer?.phone || "").trim().slice(0, 40),
    email: String(buyer?.email || "").trim().toLowerCase().slice(0, 200), address: String(buyer?.address || "").trim().slice(0, 500),
    note: String(buyer?.note || "").trim().slice(0, 500),
  };
  if (!b.name || !/\d{7,}/.test(b.phone.replace(/\D/g, ""))) throw Object.assign(new Error("Please enter your name and phone number"), { status: 400 });
  if (!EMAIL.test(b.email)) throw Object.assign(new Error("Please enter your email for the payment receipt"), { status: 400 });
  const ref = `SHOP${r.id}-${randomBytes(6).toString("hex")}`;
  await q(`INSERT INTO store_orders (request_id, ref, items, subtotal, delivery, total, buyer, status) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, 'pending')`,
    [r.id, ref, JSON.stringify(order.lines), order.subtotal, order.delivery, order.total, JSON.stringify(b)]);
  const data = await ps(openKey(r.shop.key), "/transaction/initialize", {
    email: b.email, amount: order.total * 100, currency: "NGN", reference: ref,
    callback_url: `${returnBase}/api/shop?paid=1&ref=${encodeURIComponent(ref)}`,
    metadata: { store: storeName(r), custom_fields: [{ display_name: "Order", variable_name: "order", value: ref }, { display_name: "Phone", variable_name: "phone", value: b.phone }] },
  });
  return { url: data.authorization_url, ref };
}

const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
function orderHtml(r, o, forOwner) {
  const td = "padding:6px 8px;border-bottom:1px solid #E1E6EF";
  const b = o.buyer || {};
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1B2433">
<p>${forOwner ? `<b>New paid order</b> on your website from <b>${esc(b.name)}</b>.` : `Thank you, ${esc(String(b.name).split(" ")[0])}! <b>${esc(storeName(r))}</b> has received your order and payment.`}</p>
<table style="border-collapse:collapse;width:100%;max-width:520px">${o.items.map((l) => `<tr><td style="${td}">${esc(l.name)} × ${l.qty}</td><td style="${td};text-align:right">${naira(l.total)}</td></tr>`).join("")}
${o.delivery ? `<tr><td style="${td}">Delivery</td><td style="${td};text-align:right">${naira(o.delivery)}</td></tr>` : ""}
<tr><td style="${td}"><b>Paid</b></td><td style="${td};text-align:right"><b>${naira(o.total)}</b></td></tr></table>
<p>Order: ${esc(o.ref)}${o.delivery ? "" : "<br>Delivery cost, if any, will be confirmed by the store."}</p>
${forOwner ? `<p><b>Customer:</b> ${esc(b.name)} · ${esc(b.phone)} · ${esc(b.email)}${b.address ? `<br><b>Deliver to:</b> ${esc(b.address)}` : ""}${b.note ? `<br><b>Note:</b> ${esc(b.note)}` : ""}</p><p>The money is in your Paystack account (check Paystack → Transactions). Reply to this email to contact the customer.</p>`
    : `<p>${esc(storeName(r))} will contact you about delivery. Questions? Just reply to this email.</p>`}
</div>`;
}

// Confirm a payment with Paystack and record it (safe to call more than once).
export async function confirmOrder(ref) {
  await ensureSchema();
  const rows = await q(`SELECT o.*, r.id AS rid FROM store_orders o JOIN customer_requests r ON r.id = o.request_id WHERE o.ref = $1`, [String(ref || "")]);
  const o = rows[0];
  if (!o) return null;
  if (o.status === "paid") return { order: o, store: await storeById(o.request_id), already: true };
  const r = await storeById(o.request_id);
  if (!r?.shop?.key) return { order: o, store: r };
  let tx;
  try { tx = await ps(openKey(r.shop.key), `/transaction/verify/${encodeURIComponent(o.ref)}`); } catch { return { order: o, store: r }; }
  if (tx?.status !== "success" || Number(tx.amount) !== o.total * 100 || tx.currency !== "NGN") {
    if (["failed", "abandoned", "reversed"].includes(tx?.status)) await q(`UPDATE store_orders SET status = $1 WHERE ref = $2 AND status = 'pending'`, [tx.status, o.ref]);
    return { order: { ...o, status: tx?.status || o.status }, store: r };
  }
  const upd = await q(`UPDATE store_orders SET status = 'paid', paid_at = now() WHERE ref = $1 AND status <> 'paid' RETURNING *`, [o.ref]);
  if (!upd[0]) return { order: { ...o, status: "paid" }, store: r, already: true };
  const order = upd[0];
  const owner = ownerEmail(r);
  if (customerEmailConfigured()) {
    if (owner) await sendCustomerEmail(owner, `New order ${naira(order.total)} from ${order.buyer.name} (${storeName(r)})`, orderHtml(r, order, true), order.buyer.email, `${storeName(r)} orders`).catch((e) => console.error("order email to store failed", e));
    await sendCustomerEmail(order.buyer.email, `Your order from ${storeName(r)} is confirmed`, orderHtml(r, order, false), owner || undefined, storeName(r)).catch((e) => console.error("order email to buyer failed", e));
  }
  if (!owner && emailConfigured()) await sendEmail(`🛒 Store order for ${storeName(r)} (${reference(r.id)}) has no alert email`, orderHtml(r, order, true)).catch(() => {});
  return { order, store: r };
}
async function storeById(id) {
  const rows = await q(`SELECT id, name, business, contact, email, interest, brief, shop, hosting, website_url FROM customer_requests WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listOrders(id, limit = 10) {
  await ensureSchema();
  return q(`SELECT ref, items, subtotal, delivery, total, buyer, status, created_at, paid_at FROM store_orders WHERE request_id = $1 ORDER BY created_at DESC LIMIT $2`, [id, limit]);
}
// Daily: confirm payments where the buyer closed the page before returning.
export async function reconcileOrders() {
  await ensureSchema();
  const pending = await q(`SELECT ref FROM store_orders WHERE status = 'pending' AND created_at < now() - interval '10 minutes' AND created_at > now() - interval '3 days' LIMIT 50`, []);
  let paid = 0;
  for (const p of pending) {
    const res = await confirmOrder(p.ref).catch(() => null);
    if (res?.order?.status === "paid" && !res.already) paid++;
  }
  return paid;
}
