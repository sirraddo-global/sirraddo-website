// Online Store checkout for customer websites.
// Every store site has a cart. Buyers can order on WhatsApp (always) or pay online with Paystack (once you add
// the store owner's own Paystack secret key in admin → Go live). Money goes straight to the store owner's Paystack
// account; we only work out the total from the product list we built the site from, start the payment, confirm it,
// and email the order to the store and the buyer.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { kindFor } from "./brief-schema.mjs";
import { priceAmount } from "./sitegen.mjs";
import { SITE_URL } from "../../site.config.mjs";
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
  if (secret.length < 16) throw new Error("Set STORE_KEYS_SECRET (or CRON_SECRET) in Netlify first");
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
// ---------- "Connect Paystack": a private one-time link the store owner opens to paste their own key ----------
// You never see or handle their key. The link works for 14 days and stops working once a key is saved.
const CONNECT_DAYS = 14;
export async function paystackConnectLink(id) {
  const row = await ensureShopToken(id);
  if (!row) return null;
  const c = row.shop?.connect;
  const fresh = c?.token && c.exp > Date.now() + 2 * 86400000 ? c : { token: randomBytes(18).toString("base64url"), exp: Date.now() + CONNECT_DAYS * 86400000 };
  if (fresh !== c) await updateRequestShop(id, { connect: fresh });
  return { url: `${SITE_URL}/connect?t=${fresh.token}`, expires: new Date(fresh.exp).toISOString() };
}
export async function findConnectRequest(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) return null;
  const rows = await q(`SELECT id FROM customer_requests WHERE shop->'connect'->>'token' = $1`, [token]);
  if (!rows[0]) return null;
  const r = await getRequest(rows[0].id);
  return r?.shop?.connect?.exp > Date.now() ? r : null;
}
export const TEST_STEPS = `<b>Please test it yourself now with a small amount:</b> on your website, add your cheapest item to the cart, tap Pay online and pay with your own card or transfer. Then check that (1) the payment shows in Paystack → Transactions and (2) the order email arrives. Paystack takes its normal small fee on the test. You can refund yourself in Paystack → Transactions → the payment → Refund. Tell us at once if anything doesn't work.`;
// The owner pastes their key: only a LIVE secret key is accepted here (test keys take no real money).
export async function connectPaystack(token, key) {
  const r = await findConnectRequest(token);
  if (!r) throw new Error("This link has expired or was already used. Ask us for a new one.");
  const k = String(key || "").trim();
  if (/^sk_test_/.test(k)) throw new Error("That's a TEST key (it starts with sk_test_). Test keys can't take real money. Switch Paystack to Live mode and copy the Live Secret Key (it starts with sk_live_).");
  if (/^pk_/.test(k)) throw new Error("That's the PUBLIC key (it starts with pk_). We need the SECRET key: it starts with sk_live_.");
  if (!/^sk_live_/.test(k)) throw new Error("That doesn't look like a Paystack Live Secret Key. It starts with sk_live_.");
  const row = await setShopPayments(r.id, { secretKey: k });
  await updateRequestShop(r.id, { connect: null, connectedAt: new Date().toISOString() });
  if (emailConfigured()) {
    await sendEmail(`${r.name} connected their Paystack (${reference(r.id)})`,
      `<p><b>${esc(r.name)}</b>${r.business ? " (" + esc(r.business) + ")" : ""} added their Paystack Live key (…${esc(k.slice(-4))}). Pay online is now ON for their store. They've been asked to place a small test order themselves; check with them that it worked.</p>`).catch(() => {});
  }
  if (r.email && customerEmailConfigured()) {
    await sendCustomerEmail(r.email, "Your store now takes online payments: please test it",
      `<p>Hello ${esc(String(r.name).split(" ")[0])},</p><p>Your Paystack account is connected. Customers can now pay on your website by card, transfer or USSD, straight into your own Paystack account.</p><p>${TEST_STEPS}</p>`).catch(() => {});
  }
  return row;
}

// Online Stores get a cart token before their site is built, so the published pages can talk to /api/shop.
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
    if (!p || !p.amount || !qty || p.soldout) continue; // sold out (set by the owner in Manage my store)
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
  if (!order.lines.length) throw Object.assign(new Error("Your cart is empty"), { status: 400 });
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
// The buyer's receipt: the store's details, receipt number and date, who paid, each item, and how it was paid.
// Used in the email and on the printable page (/api/shop?ref=REF&receipt=1).
const RECEIPT_PREFER = ["receipts", "orders", "sales", "info"];
export function receiptLink(o) { return `${SITE_URL}/api/shop?ref=${encodeURIComponent(o.ref)}&receipt=1`; }
export function receiptHtml(r, o) {
  const b = o.buyer || {}, br = r.brief || {};
  const th = "padding:8px;border-bottom:2px solid #13254F;text-align:left;font-size:13px;color:#4A5568";
  const td = "padding:8px;border-bottom:1px solid #E1E6EF;vertical-align:top";
  const when = new Date(o.paid_at || o.created_at || Date.now()).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
  const contact = [br.address, br.phone, storeReplyTo(r, RECEIPT_PREFER) || null].filter(Boolean).map((x) => esc(String(x).replace(/\n/g, ", "))).join(" · ");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1B2433;max-width:560px;border:1px solid #E1E6EF;border-radius:12px;padding:20px;background:#fff">
<table style="width:100%;border-collapse:collapse"><tr><td style="vertical-align:top"><div style="font-size:19px;font-weight:700;color:#13254F">${esc(storeName(r))}</div>${contact ? `<div style="font-size:13px;color:#4A5568">${contact}</div>` : ""}</td>
<td style="vertical-align:top;text-align:right"><div style="font-size:22px;font-weight:800;letter-spacing:1px;color:#13254F">RECEIPT</div><div style="display:inline-block;background:#E6F4EA;color:#1E7B3C;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700">PAID</div></td></tr></table>
<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px"><tr><td style="vertical-align:top;padding:0 8px 0 0"><div style="color:#4A5568;font-size:12px">RECEIPT NO.</div>${esc(o.ref)}<div style="color:#4A5568;font-size:12px;margin-top:6px">DATE PAID</div>${esc(when)}</td>
<td style="vertical-align:top;padding:0"><div style="color:#4A5568;font-size:12px">BILLED TO</div>${esc(b.name || "")}${b.phone ? `<br>${esc(b.phone)}` : ""}${b.email ? `<br>${esc(b.email)}` : ""}${b.address ? `<br>${esc(b.address)}` : ""}</td></tr></table>
<table style="width:100%;border-collapse:collapse;font-size:14px"><tr><th style="${th}">Item</th><th style="${th};text-align:center">Qty</th><th style="${th};text-align:right">Price</th><th style="${th};text-align:right">Amount</th></tr>
${o.items.map((l) => `<tr><td style="${td}">${esc(l.name)}</td><td style="${td};text-align:center">${l.qty}</td><td style="${td};text-align:right">${naira(l.price || Math.round(l.total / (l.qty || 1)))}</td><td style="${td};text-align:right">${naira(l.total)}</td></tr>`).join("")}
${o.delivery ? `<tr><td style="${td}" colspan="3">Delivery</td><td style="${td};text-align:right">${naira(o.delivery)}</td></tr>` : ""}
<tr><td style="padding:10px 8px;font-weight:800" colspan="3">Total paid</td><td style="padding:10px 8px;text-align:right;font-weight:800;font-size:17px">${naira(o.total)}</td></tr></table>
<p style="font-size:13px;color:#4A5568;margin:10px 0 0">Paid online through Paystack (card, bank transfer or USSD). Payment reference: ${esc(o.ref)}.${o.delivery ? "" : " Delivery cost, if any, is confirmed by the store."}</p>
<p style="font-size:13px;color:#4A5568;margin:6px 0 0">Thank you for shopping with ${esc(storeName(r))}.</p></div>`;
}

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
    : `<p>${esc(storeName(r))} will contact you about delivery. Questions? Just reply to this email${storeReplyTo(r) ? ` or write to ${esc(storeReplyTo(r))}` : ""}.</p>`}
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
    // The buyer's receipt. Replies go to the store's receipts@ (or orders@ / sales@ / info@) once their forwarding works.
    const buyerHtml = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1B2433"><p>Thank you, ${esc(String(order.buyer.name).split(" ")[0])}! <b>${esc(storeName(r))}</b> has received your order and payment. Here is your receipt.</p>
${receiptHtml(r, order)}
<p><a href="${receiptLink(order)}" style="color:#13254F;font-weight:700">View or print this receipt</a></p>
<p>${esc(storeName(r))} will contact you about delivery. Questions? Just reply to this email${storeReplyTo(r, RECEIPT_PREFER) ? ` or write to ${esc(storeReplyTo(r, RECEIPT_PREFER))}` : ""}.</p></div>`;
    await sendCustomerEmail(order.buyer.email, `Receipt for your order from ${storeName(r)} (${order.ref})`, buyerHtml, storeReplyTo(r, RECEIPT_PREFER) || owner || undefined, storeName(r)).catch((e) => console.error("order email to buyer failed", e));
  }
  if (!owner && emailConfigured()) await sendEmail(`🛒 Store order for ${storeName(r)} (${reference(r.id)}) has no alert email`, orderHtml(r, order, true)).catch(() => {});
  return { order, store: r };
}
// Once their business email forwarding works, buyers reply to the store's own address (orders@, sales@, receipts@ or
// info@ at their domain) instead of the owner's Gmail. It still lands in the right inbox through forwarding.
export function storeReplyTo(r, prefer = ["orders", "sales", "receipts", "info"]) {
  const h = r?.hosting || {}, e = h.email;
  if (!h.domain || e?.status !== "active" || !(e.locals || []).length) return "";
  const pick = prefer.find((l) => e.locals.includes(l)) || e.locals[0];
  return `${pick}@${h.domain}`;
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
