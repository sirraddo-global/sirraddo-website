import { googleClientId } from "./googleid.mjs";
// Online Store checkout for customer websites.
// Every store site has a cart. Buyers can order on WhatsApp (always) or pay online with Paystack (once you add
// the store owner's own Paystack secret key in admin → Go live). Money goes straight to the store owner's Paystack
// account; we only work out the total from the product list we built the site from, start the payment, confirm it,
// and email the order to the store and the buyer.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { kindFor } from "./brief-schema.mjs";
import { priceAmount } from "./sitegen.mjs";
import { SITE_URL } from "../../site.config.mjs";
import { waitUntil } from "./platform.mjs";
import { salePrice, parseOptions, parseVariantStock, variantKeys, variantLeft, deliveryFor, cleanZones, cleanCodes, activeCodes, applyCode, useCode, instalmentsOn, firstPayment, clearBuyerCart } from "./storeplus.mjs";
import { q, ensureSchema, getRequest, updateRequestShop, sendCustomerEmail, customerEmailConfigured, sendEmail, emailConfigured, esc, reference } from "./store.mjs";

const PS = "https://api.paystack.co";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Products (shared with the site generator so indexes always match) ----------
// Stock: the owner types how many they have in their Manage link ("" = not counted). Paid online orders take it down;
// at 0 the product is sold out by itself.
export const stockOf = (p) => (/^\d{1,6}$/.test(String(p?.stock ?? "").trim()) ? Number(p.stock) : null);
export const isSoldOut = (p) => Boolean(p?.soldout) || stockOf(p) === 0;
// Sale prices (old price crossed out, until the sale ends), sizes/colours and stock per choice are worked out here.
export function shopProducts(brief, now = Date.now()) {
  return (brief?.products || []).map((p, i) => {
    const sale = salePrice(p, priceAmount, now);
    const options = parseOptions(p.options);
    const vstock = options.length ? parseVariantStock(p.vstock, options) : {};
    const keys = variantKeys(options);
    const allOut = keys.length > 0 && keys.every((k) => vstock[k] !== undefined) && keys.every((k) => Number(vstock[k]) === 0);
    return { ...p, i, amount: sale.amount, wasAmount: sale.was, onSale: sale.onSale, saleEnds: sale.ends, off: sale.off || 0, options, vstock, stockLeft: stockOf(p), soldout: isSoldOut(p) || allOut };
  }).filter((p) => p.name);
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
export async function setShopPayments(id, { secretKey, deliveryFee, notify, remove, paystackOn, flwKey, flwOn, flwRemove, transfer, delivery, accounts, accountsOn, google, googleOn, manageOn, zones, freeOver, codes, instalments, hideStock }) {
  let row = await ensureShopToken(id);
  const patch = {};
  // Every way to pay is a switch the owner (in My store) or SIRRADDO (in admin) can turn on and off at any time.
  if (paystackOn !== undefined) patch.paystackOff = !paystackOn;
  if (flwRemove) { patch.flwKey = null; patch.flwKeyEnd = null; patch.flwMode = null; }
  else if (flwKey) {
    const k = String(flwKey).trim();
    if (/^FLWPUBK/i.test(k)) throw new Error("That's the PUBLIC key (FLWPUBK…). We need the SECRET key: it starts with FLWSECK-.");
    if (!/^FLWSECK(_TEST)?-[A-Za-z0-9-]{20,}$/.test(k)) throw new Error("That isn't a Flutterwave secret key (it starts with FLWSECK-)");
    try { await flw(k, "/balances/NGN"); } catch (e) { throw new Error(e.status === 401 ? "Flutterwave didn't accept that key. Copy it again from Settings → API Keys." : "Couldn't check the key with Flutterwave: " + e.message); }
    patch.flwKey = sealKey(k); patch.flwKeyEnd = k.slice(-4); patch.flwMode = /_TEST-/.test(k) ? "test" : "live"; patch.flwOff = false;
  }
  if (flwOn !== undefined) patch.flwOff = !flwOn;
  if (transfer !== undefined) {
    const t = transfer || {}, cur = row.shop?.transfer || {};
    const next = { on: Boolean(t.on ?? cur.on), bank: clean(t.bank ?? cur.bank, 60), name: clean(t.name ?? cur.name, 100), number: String(t.number ?? cur.number ?? "").replace(/\D/g, "").slice(0, 10), note: clean(t.note ?? cur.note, 200) };
    if (next.on && (!next.bank || !next.name || next.number.length !== 10)) throw new Error("Bank transfer needs the bank name, account name and the 10-digit account number");
    patch.transfer = next;
  }
  if (delivery !== undefined) {
    const d = delivery || {}, cur = row.shop?.delivery || {};
    patch.delivery = { on: Boolean(d.on ?? cur.on), note: clean(d.note ?? cur.note, 200) };
  }
  if (accounts !== undefined) patch.accounts = Boolean(accounts); // SIRRADDO: the store has the Standard Store accounts feature
  if (accountsOn !== undefined) patch.accountsOff = !accountsOn;   // the owner: accounts on/off on their website
  if (googleOn !== undefined) patch.googleOff = !googleOn;   // the owner: Google sign-in on/off (phone number + password always stays)
  if (google !== undefined) patch.google = Boolean(google);
  if (manageOn !== undefined) patch.manageOff = !manageOn;
  // Delivery fee by area, free delivery above an amount, discount codes and pay small-small (the owner, in My store).
  if (zones !== undefined) patch.zones = cleanZones(zones);
  // Stores that source items when customers order (or just don't want numbers shown): no "Only 2 left" / "5 in stock".
  if (hideStock !== undefined) patch.hideStock = Boolean(hideStock);
  if (freeOver !== undefined) { const n = Math.round(Number(String(freeOver ?? "").replace(/[^\d.]/g, "")) || 0); if (n < 0 || n > 1e8) throw new Error("Free delivery: write an amount in naira, or leave it empty"); patch.freeOver = n || null; }
  if (codes !== undefined) patch.codes = cleanCodes(codes, row.shop?.codes);
  if (instalments !== undefined) {
    const t = instalments || {}, cur = row.shop?.instalments || {};
    const next = { on: Boolean(t.on ?? cur.on), firstPct: Math.min(90, Math.max(10, Math.round(Number(t.firstPct ?? cur.firstPct) || 30))) };
    const tr = transfer !== undefined ? patch.transfer : row.shop?.transfer;
    if (next.on && !(tr?.bank && tr?.name && tr?.number)) throw new Error("Pay small-small uses your bank transfer details: fill in Bank transfer first");
    patch.instalments = next;
  }
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
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// ---------- Flutterwave (a second online payment option, on the store's own account) ----------
const FLW = "https://api.flutterwave.com/v3";
async function flw(key, path, body) {
  const res = await fetch(FLW + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === "error") throw Object.assign(new Error(j.message || `Flutterwave ${res.status}`), { status: res.status });
  return j.data;
}

// Which ways to pay are switched on for a store right now.
export function payMethods(shop = {}) {
  const t = shop.transfer || {}, d = shop.delivery || {};
  return {
    paystack: Boolean(shop.key) && !shop.paystackOff,
    flutterwave: Boolean(shop.flwKey) && !shop.flwOff,
    transfer: Boolean(t.on && t.bank && t.name && t.number),
    delivery: Boolean(d.on),
    instalment: instalmentsOn(shop),
  };
}
export const METHOD_LABEL = { paystack: "Paystack (card, transfer, USSD)", flutterwave: "Flutterwave (card, transfer, USSD)", transfer: "Bank transfer", delivery: "Pay on delivery", instalment: "Pay small-small (bank transfer)" };

// ---------- Orders ----------
async function storeByToken(token) {
  if (!token || String(token).length < 10) return null;
  await ensureSchema();
  const rows = await q(`SELECT id, name, business, contact, email, interest, brief, shop, hosting, website_url FROM customer_requests WHERE shop->>'token' = $1`, [String(token)]);
  return rows[0] ?? null;
}
const storeName = (r) => r.brief?.business_name || r.business || r.name;
const ownerEmail = (r) => r.shop?.notify || (EMAIL.test(String(r.brief?.order_alerts || "")) ? r.brief.order_alerts : null) || r.email || null;

// The web addresses a store's website runs on (its own domain, www., its address before the domain, and any saved URL).
// The shared Google sign-in page only ever hands a sign-in back to one of these.
// One product of a store (for "tell me when it's back").
export async function storeProduct(token, i) {
  const r = await storeByToken(token);
  if (!r) return null;
  return { id: r.id, product: shopProducts(r.brief).find((x) => x.i === Number(i)) || null };
}
export function storeOrigins(r) {
  const out = new Set();
  const add = (u) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u); if (x.protocol === "https:") out.add(x.origin); } catch { /* not an address */ } };
  if (r?.website_url) add(r.website_url);
  if (r?.hosting?.domain) { const d = String(r.hosting.domain).replace(/^www\./i, ""); add(d); add("www." + d); }
  if (r?.hosting?.pagesUrl) add(r.hosting.pagesUrl);
  return [...out];
}
// For the shared Google sign-in page (www.sirraddo.com.ng/signin): is this store using Google sign-in, and is the
// address that asked really one of the store's own websites?
export async function googleHub(token, origin) {
  const r = await storeByToken(token);
  const c = r && (await shopConfig(token));
  if (!c || !c.google) return { error: "Google sign-in isn't switched on for this store.", status: 409 };
  if (!storeOrigins(r).includes(String(origin || ""))) return { error: "This sign-in page was opened from a website that isn't this store's.", status: 403 };
  return { client: c.google, name: c.name, origin };
}
export async function shopConfig(token) {
  const r = await storeByToken(token);
  if (!r) return null;
  // Live stock counts, so the website is right even between republishes.
  const stock = {};
  const vstock = {};
  for (const p of shopProducts(r.brief)) {
    if (p.stockLeft !== null || p.soldout) stock[p.i] = p.soldout ? 0 : p.stockLeft;
    if (Object.keys(p.vstock).length) vstock[p.i] = Object.fromEntries(Object.entries(p.vstock).map(([k, v]) => [k, Number(v)]));
  }
  const m = payMethods(r.shop || {});
  const googleClient = r.shop?.accounts && !r.shop?.accountsOff && r.shop?.google && !r.shop?.googleOff && googleClientId() ? googleClientId() : null;
  return { online: m.paystack || m.flutterwave, methods: m, mode: r.shop?.keyMode || null, deliveryFee: r.shop?.deliveryFee ?? null, name: storeName(r), stock,
    deliveryNote: m.delivery ? r.shop.delivery.note || "" : "", accounts: Boolean(r.shop?.accounts && !r.shop?.accountsOff), google: googleClient, id: r.id,
    vstock, hideStock: Boolean(r.shop?.hideStock), zones: cleanZones(r.shop?.zones), freeOver: Number(r.shop?.freeOver) || 0, codes: activeCodes(r.shop).length > 0, firstPct: m.instalment ? firstPayment(r.shop, 100).pct : 0 };
}

// Work out the order from the product list (never trust prices from the browser).
// zone: the buyer's delivery area (undefined = an older store page that doesn't ask: the flat fee is used).
// quote: just working out the total for the cart (a missing area is fine there).
export function priceOrder(r, items, { zone, code, quote = false } = {}) {
  const products = shopProducts(r.brief);
  const lines = [];
  const bad = (msg, status = 409) => Object.assign(new Error(msg), { status });
  for (const it of Array.isArray(items) ? items.slice(0, 50) : []) {
    const p = products.find((x) => x.i === Number(it?.i));
    const qty = Math.min(99, Math.max(1, Math.floor(Number(it?.q) || 0)));
    if (!p || !p.amount || !qty || p.soldout) continue; // sold out (set by the owner in My store, or stock at 0)
    let v = "";
    if (p.options.length) {
      v = clean(it?.v, 70);
      if (!variantKeys(p.options).includes(v)) throw bad(`Please choose the ${p.options.map((g) => g.name.toLowerCase()).join(" and ")} for ${p.name}.`, 400);
      const vl = variantLeft(p, v);
      if (vl !== null && qty > vl) throw bad(vl === 0 ? `${p.name} (${v}) is sold out. Please remove it from your cart.` : `Only ${vl} ${p.name} (${v}) left. Please change the quantity in your cart.`);
    }
    const same = lines.filter((l) => l.i === p.i).reduce((s, l) => s + l.qty, 0);
    if (p.stockLeft !== null && qty + same > p.stockLeft) throw bad(`Only ${p.stockLeft} ${p.name} left. Please change the quantity in your cart.`);
    lines.push({ i: p.i, ...(v ? { v } : {}), name: v ? `${p.name} (${v})` : p.name, price: p.amount, qty, total: p.amount * qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const c = applyCode(r.shop, code, subtotal);
  if (c.error) throw bad(c.error, 400);
  const goods = subtotal - (c.discount || 0);
  let d;
  if (zone === undefined && !quote) d = { fee: Number(r.shop?.deliveryFee) || 0, zone: "" };
  else {
    d = deliveryFor(r.shop, { goods, zone });
    if (d.error) { if (!quote) throw bad(d.error, 400); d = { fee: null, zone: "", free: Number(r.shop?.freeOver) || 0 }; }
  }
  return { lines, subtotal, discount: c.discount || 0, code: c.code || "", codeLabel: c.label || "", delivery: d.fee, zone: d.zone, freeOver: Number(r.shop?.freeOver) || 0, total: goods + (d.fee || 0) };
}
// For the cart: the total with discount and delivery, before paying.
export async function quoteOrder(token, items, { zone, code } = {}) {
  const r = await storeByToken(token);
  if (!r) throw Object.assign(new Error("Store not found"), { status: 404 });
  const o = priceOrder(r, items, { zone, code, quote: true });
  return { subtotal: o.subtotal, discount: o.discount, code: o.code, codeLabel: o.codeLabel, delivery: o.delivery, zone: o.zone, freeOver: o.freeOver, total: o.total };
}

export async function startCheckout(token, items, buyer, returnBase, opts = {}) {
  const r = await storeByToken(token);
  if (!r) throw Object.assign(new Error("Store not found"), { status: 404 });
  const on = payMethods(r.shop || {});
  // Old store pages send no method: they mean "Pay online" (whichever online option is on).
  const method = opts.method || (on.paystack ? "paystack" : on.flutterwave ? "flutterwave" : "paystack");
  if (!METHOD_LABEL[method]) throw Object.assign(new Error("Unknown payment option"), { status: 400 });
  if (!on[method]) throw Object.assign(new Error(method === "paystack" || method === "flutterwave" ? "Online payment isn't switched on for this store. Please order on WhatsApp." : `${METHOD_LABEL[method]} isn't available for this store right now. Please choose another option or order on WhatsApp.`), { status: 409 });
  const order = priceOrder(r, items, { zone: opts.zone, code: opts.code });
  if (!order.lines.length) throw Object.assign(new Error("Your cart is empty"), { status: 400 });
  const b = {
    name: String(buyer?.name || "").trim().slice(0, 120), phone: String(buyer?.phone || "").trim().slice(0, 40),
    email: String(buyer?.email || "").trim().toLowerCase().slice(0, 200), address: String(buyer?.address || "").trim().slice(0, 500),
    note: String(buyer?.note || "").trim().slice(0, 500),
  };
  if (!b.name || !/\d{7,}/.test(b.phone.replace(/\D/g, ""))) throw Object.assign(new Error("Please enter your name and phone number"), { status: 400 });
  const online = method === "paystack" || method === "flutterwave";
  if (online && !EMAIL.test(b.email)) throw Object.assign(new Error("Please enter your email for the payment receipt"), { status: 400 });
  if (b.email && !EMAIL.test(b.email)) b.email = "";
  if ((method === "delivery" || order.zone) && !b.address) throw Object.assign(new Error("Please enter your delivery address"), { status: 400 });
  // A signed-in buyer (Standard Store): the order goes into their account.
  let buyerId = null;
  if (opts.buyerToken && r.shop?.accounts) {
    const { buyerFromToken } = await import("./storeaccounts.mjs");
    const acct = await buyerFromToken(r.id, opts.buyerToken);
    if (acct) buyerId = acct.id;
  }
  const ref = `SHOP${r.id}-${randomBytes(6).toString("hex")}`;
  const status = method === "transfer" ? "awaiting" : method === "delivery" ? "cod" : method === "instalment" ? "part" : "pending";
  await q(`INSERT INTO store_orders (request_id, ref, items, subtotal, delivery, total, buyer, status, method, buyer_id, discount, code, zone) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
    [r.id, ref, JSON.stringify(order.lines), order.subtotal, order.delivery || 0, order.total, JSON.stringify(b), status, method, buyerId, order.discount, order.code || null, order.zone || null]);
  await clearBuyerCart(r.id, buyerId);
  if (!online) {
    // Bank transfer / pay on delivery: the items are kept for this buyer now (stock goes down; cancelling puts it back).
    const [o] = await q(`SELECT * FROM store_orders WHERE ref = $1`, [ref]);
    await takeStock(r, o);
    await notifyOwner(r, o, method === "transfer" || method === "instalment" ? "awaiting" : "cod");
    return { url: orderLink({ ref }, r), ref, method };
  }
  if (method === "flutterwave") {
    const data = await flw(openKey(r.shop.flwKey), "/payments", {
      tx_ref: ref, amount: order.total, currency: "NGN", redirect_url: orderLink({ ref }, r) + "&paid=1",
      customer: { email: b.email, phonenumber: b.phone, name: b.name }, customizations: { title: storeName(r) }, meta: { order: ref },
    });
    return { url: data.link, ref, method };
  }
  const data = await ps(openKey(r.shop.key), "/transaction/initialize", {
    email: b.email, amount: order.total * 100, currency: "NGN", reference: ref,
    callback_url: orderLink({ ref }, r) + "&paid=1",
    metadata: { store: storeName(r), custom_fields: [{ display_name: "Order", variable_name: "order", value: ref }, { display_name: "Phone", variable_name: "phone", value: b.phone }] },
  });
  return { url: data.authorization_url, ref, method };
}
// The buyer's order / receipt page is on the store's OWN website (…/order?ref=…) once the site has been published
// with that page; before that (or when the site is paused) it is our address, which always works too.
export function storePageBase(r) {
  const h = r?.hosting || {};
  if (!h.orderPage || h.pausedAt) return null;
  const u = r.website_url || h.pagesUrl || "";
  try { return u ? new URL(/^https?:\/\//i.test(u) ? u : "https://" + u).origin : null; } catch { return null; }
}
export function orderLink(o, r) { const b = storePageBase(r); return b ? `${b}/order?ref=${encodeURIComponent(o.ref)}` : `${SITE_URL}/api/shop?ref=${encodeURIComponent(o.ref)}`; }
export async function storeRow(id) { return storeById(id); }

const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
// The buyer's receipt: the store's details, receipt number and date, who paid, each item, and how it was paid.
// Shown on the thank-you / receipt page and saved on the buyer's phone as a picture or PDF (never emailed).
const RECEIPT_PREFER = ["receipts", "orders", "sales", "info"];
export function paidNote(o) {
  const m = o.method || "paystack";
  if (m === "transfer") return `Paid by bank transfer, confirmed by the store. Order reference: ${o.ref}.`;
  if (m === "delivery") return `Paid on delivery. Order reference: ${o.ref}.`;
  if (m === "instalment") return `Paid small-small by bank transfer (${(o.payments || []).length || 1} payment${(o.payments || []).length === 1 ? "" : "s"}), confirmed by the store. Order reference: ${o.ref}.`;
  return `Paid online through ${m === "flutterwave" ? "Flutterwave" : "Paystack"} (card, bank transfer or USSD). Payment reference: ${o.ref}.`;
}
export function receiptLink(o, r) { return orderLink(o, r) + "&receipt=1"; }
// The same receipt as plain data, for drawing it as a picture / PDF on the buyer's phone.
export function receiptData(r, o) {
  const b = o.buyer || {}, br = r.brief || {};
  return {
    store: storeName(r),
    contact: [br.address, br.phone, storeReplyTo(r, RECEIPT_PREFER) || null].filter(Boolean).map((x) => String(x).replace(/\n/g, ", ")).join(" · "),
    ref: o.ref,
    when: new Date(o.paid_at || o.created_at || Date.now()).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" }),
    buyer: [b.name, b.phone, b.email, b.address].filter(Boolean).map(String),
    items: o.items.map((l) => ({ name: l.name, qty: l.qty, price: naira(l.price || Math.round(l.total / (l.qty || 1))), amount: naira(l.total) })),
    delivery: o.delivery ? naira(o.delivery) + (o.zone ? ` (${o.zone})` : "") : "",
    discount: o.discount ? `−${naira(o.discount)}${o.code ? ` (code ${o.code})` : ""}` : "",
    total: naira(o.total),
    note: paidNote(o),
    link: receiptLink(o, r),
  };
}
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
${o.discount ? `<tr><td style="${td}" colspan="3">Discount${o.code ? ` (code ${esc(o.code)})` : ""}</td><td style="${td};text-align:right">−${naira(o.discount)}</td></tr>` : ""}
${o.delivery ? `<tr><td style="${td}" colspan="3">Delivery${o.zone ? ` (${esc(o.zone)})` : ""}</td><td style="${td};text-align:right">${naira(o.delivery)}</td></tr>` : ""}
<tr><td style="padding:10px 8px;font-weight:800" colspan="3">Total paid</td><td style="padding:10px 8px;text-align:right;font-weight:800;font-size:17px">${naira(o.total)}</td></tr></table>
<p style="font-size:13px;color:#4A5568;margin:10px 0 0">${esc(paidNote(o))}${o.delivery ? "" : " Delivery cost, if any, is confirmed by the store."}</p>
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
${forOwner ? `<p><b>Customer:</b> ${esc(b.name)} · ${esc(b.phone)} · ${esc(b.email)}${b.address ? `<br><b>Deliver to:</b> ${esc(b.address)}` : ""}${b.note ? `<br><b>Note:</b> ${esc(b.note)}` : ""}</p><p>The money is in your ${o.method === "flutterwave" ? "Flutterwave" : "Paystack"} account (check its dashboard → Transactions). Reply to this email to contact the customer.</p>${o.stockNote?.length ? `<p><b>Stock left:</b> ${o.stockNote.map((x) => `${esc(x.name)}: ${x.left}${x.left === 0 ? " (now SOLD OUT on your website)" : ""}`).join(" · ")}. Restock any time in My store (or your Manage link).</p>` : ""}`
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
  // Bank transfer and pay-on-delivery orders are confirmed by the store owner, not here.
  if (o.method === "transfer" || o.method === "delivery" || o.method === "instalment") return { order: o, store: r };
  if (o.method === "flutterwave") {
    if (!r?.shop?.flwKey) return { order: o, store: r };
    let tx;
    try { tx = await flw(openKey(r.shop.flwKey), `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(o.ref)}`); } catch { return { order: o, store: r }; }
    if (tx?.status !== "successful" || Number(tx.amount) < o.total || tx.currency !== "NGN") {
      if (tx?.status === "failed") await q(`UPDATE store_orders SET status = 'failed' WHERE ref = $1 AND status = 'pending'`, [o.ref]);
      return { order: { ...o, status: tx?.status === "failed" ? "failed" : o.status }, store: r };
    }
  } else {
    if (!r?.shop?.key) return { order: o, store: r };
    let tx;
    try { tx = await ps(openKey(r.shop.key), `/transaction/verify/${encodeURIComponent(o.ref)}`); } catch { return { order: o, store: r }; }
    if (tx?.status !== "success" || Number(tx.amount) !== o.total * 100 || tx.currency !== "NGN") {
      if (["failed", "abandoned", "reversed"].includes(tx?.status)) await q(`UPDATE store_orders SET status = $1 WHERE ref = $2 AND status = 'pending'`, [tx.status, o.ref]);
      return { order: { ...o, status: tx?.status || o.status }, store: r };
    }
  }
  const upd = await q(`UPDATE store_orders SET status = 'paid', paid_at = now() WHERE ref = $1 AND status <> 'paid' RETURNING *`, [o.ref]);
  if (!upd[0]) return { order: { ...o, status: "paid" }, store: r, already: true };
  const order = upd[0];
  await takeStock(r, order);
  const owner = ownerEmail(r);
  if (customerEmailConfigured()) {
    if (owner) await sendCustomerEmail(owner, `New order ${naira(order.total)} from ${order.buyer.name} (${storeName(r)})`, orderHtml(r, order, true), order.buyer.email, `${storeName(r)} orders`).catch((e) => console.error("order email to store failed", e));
    // Nothing is emailed to buyers: our email service is only for our own customers (the store owner here).
    // Buyers save their receipt as a picture or PDF on the thank-you page.
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
// Take the sold items off the stock count (one SQL statement per item, so two orders can't both read the old number).
// Each order takes stock once (stock_taken); cancelling an unpaid transfer / pay-on-delivery order puts it back.
async function changeStock(r, order, sign) {
  const low = [];
  for (const l of order.items || []) {
    if (l.v) {
      // Stock per size/colour, when the owner counts it.
      const rows = await q(`UPDATE customer_requests SET brief = jsonb_set(brief, ARRAY['products', $2::text, 'vstock', $4::text], to_jsonb(GREATEST(0, (brief->'products'->($2::int)->'vstock'->>$4)::int + $3::int)::text))
        WHERE id = $1 AND (brief->'products'->($2::int)->'vstock'->>$4) ~ '^[0-9]{1,6}$' RETURNING (brief->'products'->($2::int)->'vstock'->>$4)::int AS left`, [r.id, String(l.i), sign * (Number(l.qty) || 0), l.v]).catch((e) => { console.error("option stock update failed", e); return []; });
      if (rows[0]) low.push({ name: l.name, left: rows[0].left });
    }
    const rows = await q(`UPDATE customer_requests SET brief = jsonb_set(brief, ARRAY['products', $2::text, 'stock'], to_jsonb(GREATEST(0, (brief->'products'->($2::int)->>'stock')::int + $3::int)::text))
      WHERE id = $1 AND (brief->'products'->($2::int)->>'stock') ~ '^[0-9]{1,6}$' RETURNING (brief->'products'->($2::int)->>'stock')::int AS left`, [r.id, String(l.i), sign * (Number(l.qty) || 0)]).catch((e) => { console.error("stock update failed", e); return []; });
    if (rows[0]) low.push({ name: l.name, left: rows[0].left });
  }
  if (low.length) {
    // The live site shows the new counts (and "Sold out" at 0).
    const h = r.hosting || {};
    if (h.project && !h.pausedAt) waitUntil(import("./golive.mjs").then(({ publish }) => publish(r.id, { force: true })));
  }
  return low;
}
async function takeStock(r, order) {
  const [claimed] = await q(`UPDATE store_orders SET stock_taken = true WHERE ref = $1 AND NOT stock_taken RETURNING ref`, [order.ref]);
  if (!claimed) return;
  if (order.code) await useCode(r.id, order.code);
  const low = await changeStock(r, order, -1);
  if (low.length) order.stockNote = low;
}
async function giveStockBack(r, order) {
  const [claimed] = await q(`UPDATE store_orders SET stock_taken = false WHERE ref = $1 AND stock_taken RETURNING ref`, [order.ref]);
  if (claimed) await changeStock(r, order, 1);
}

// The store owner hears about new bank-transfer / pay-on-delivery orders and transfer "I've paid" messages.
async function notifyOwner(r, o, kind) {
  const owner = ownerEmail(r);
  const b = o.buyer || {};
  const lines = `<ul>${(o.items || []).map((l) => `<li>${esc(l.name)} × ${l.qty}: ${naira(l.total)}</li>`).join("")}${o.delivery ? `<li>Delivery: ${naira(o.delivery)}</li>` : ""}</ul><p><b>Total: ${naira(o.total)}</b> · Order ${esc(o.ref)}</p>
<p><b>Customer:</b> ${esc(b.name)} · ${esc(b.phone)}${b.email ? " · " + esc(b.email) : ""}${b.address ? `<br><b>Deliver to:</b> ${esc(b.address)}` : ""}${b.note ? `<br><b>Note:</b> ${esc(b.note)}` : ""}</p>`;
  const subject = kind === "awaiting" ? `New order ${naira(o.total)} (bank transfer, not paid yet) from ${b.name}`
    : kind === "claim" ? `${b.name} says they paid ${naira(o.total)} by transfer: please check`
    : `New order ${naira(o.total)} (pay on delivery) from ${b.name}`;
  const intro = kind === "awaiting" ? `<p><b>New order by bank transfer.</b> The customer has your account details and will pay ${naira(o.total)} with ${esc(o.ref)} as the narration. <b>Don't send the items until you see the money in your bank app</b>, then open My store → Orders → Confirm paid.</p>`
    : kind === "claim" ? `<p><b>${esc(b.name)} says they have paid</b>${o.claim?.from ? ` (from the account of ${esc(o.claim.from)})` : ""}${o.claim?.note ? `: "${esc(o.claim.note)}"` : ""}. <b>Check your bank app first.</b> If the money is there, open My store → Orders → Confirm paid. Screenshots can be fake.</p>`
    : `<p><b>New order, pay on delivery.</b> Call the customer to arrange delivery. When they pay, open My store → Orders → Paid & delivered.</p>`;
  if (owner && customerEmailConfigured()) await sendCustomerEmail(owner, `${subject} (${storeName(r)})`, `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">${intro}${lines}</div>`, b.email || undefined, `${storeName(r)} orders`).catch((e) => console.error("order email to store failed", e));
  else if (!owner && emailConfigured()) await sendEmail(`🛒 Store order for ${storeName(r)} (${reference(r.id)}) has no alert email`, intro + lines).catch(() => {});
}

// ---------- After the order: the owner confirms transfers, marks delivered, cancels; the buyer says they paid ----------
export async function orderByRef(ref) {
  await ensureSchema();
  const [o] = await q(`SELECT * FROM store_orders WHERE ref = $1`, [String(ref || "")]);
  return o || null;
}
export async function claimTransfer(ref, { from, note }) {
  const o = await orderByRef(ref);
  if (!o || o.method !== "transfer") throw Object.assign(new Error("Order not found"), { status: 404 });
  if (o.status !== "awaiting") return o;
  if (o.claim?.at && Date.now() - new Date(o.claim.at) < 10 * 60000) return o; // one message every 10 minutes is enough
  const claim = { at: new Date().toISOString(), from: clean(from, 100), note: clean(note, 200) };
  const [row] = await q(`UPDATE store_orders SET claim = $1::jsonb WHERE ref = $2 RETURNING *`, [JSON.stringify(claim), o.ref]);
  const r = await storeById(o.request_id);
  await notifyOwner(r, row, "claim");
  return row;
}
// action: paid (transfer received / paid on delivery), delivered, cancel. Only for this store's own orders.
export async function ownerOrderAction(requestId, ref, action) {
  const o = await orderByRef(ref);
  if (!o || o.request_id !== Number(requestId)) throw new Error("Order not found");
  const r = await storeById(o.request_id);
  if (action === "paid") {
    if (o.status === "paid") return o;
    if (!["awaiting", "cod"].includes(o.status)) throw new Error("Only bank-transfer and pay-on-delivery orders are confirmed by hand. Online payments confirm themselves.");
    const [row] = await q(`UPDATE store_orders SET status = 'paid', paid_at = now(), delivered_at = CASE WHEN method = 'delivery' THEN now() ELSE delivered_at END WHERE ref = $1 RETURNING *`, [o.ref]);
    await takeStock(r, row);
    return row;
  }
  if (action === "delivered") {
    if (o.status !== "paid" && o.status !== "cod") throw new Error("Confirm the payment first.");
    const [row] = await q(`UPDATE store_orders SET delivered_at = now() WHERE ref = $1 RETURNING *`, [o.ref]);
    return row;
  }
  // Order tracking: the buyer's order page shows each step as the owner taps it.
  if (action === "packed" || action === "shipped") {
    if (o.status !== "paid" && o.status !== "cod") throw new Error(o.status === "part" ? "This order is being paid small-small: send it once it's fully paid." : "Confirm the payment first.");
    const [row] = await q(action === "packed" ? `UPDATE store_orders SET packed_at = COALESCE(packed_at, now()) WHERE ref = $1 RETURNING *`
      : `UPDATE store_orders SET packed_at = COALESCE(packed_at, now()), shipped_at = COALESCE(shipped_at, now()) WHERE ref = $1 RETURNING *`, [o.ref]);
    return row;
  }
  if (action === "unpacked") {
    const [row] = await q(`UPDATE store_orders SET packed_at = NULL, shipped_at = NULL WHERE ref = $1 AND delivered_at IS NULL RETURNING *`, [o.ref]);
    return row || o;
  }
  if (action === "undelivered") {
    const [row] = await q(`UPDATE store_orders SET delivered_at = NULL WHERE ref = $1 RETURNING *`, [o.ref]);
    return row;
  }
  if (action === "cancel") {
    if (o.status === "part" && o.paid_amount > 0) throw new Error(`The customer has paid ${naira(o.paid_amount)} so far. Refund them first (from your bank app), then cancel.`);
    if (o.status === "paid") throw new Error("This order is paid. To cancel it, refund the customer first (online payments: from your Paystack or Flutterwave dashboard), then message them.");
    if (o.status === "cancelled") return o;
    const [row] = await q(`UPDATE store_orders SET status = 'cancelled', cancelled_at = now() WHERE ref = $1 RETURNING *`, [o.ref]);
    await giveStockBack(r, row);
    return row;
  }
  throw new Error("Unknown action");
}
// Pay small-small: the owner records each transfer they receive. When the full amount is in, the order is paid.
export async function recordInstalment(requestId, ref, amount) {
  const o = await orderByRef(ref);
  if (!o || o.request_id !== Number(requestId)) throw new Error("Order not found");
  if (o.status !== "part") throw new Error("Only pay small-small orders take part payments.");
  const n = Math.round(Number(String(amount ?? "").replace(/[^\d.]/g, "")));
  const left = o.total - (o.paid_amount || 0);
  if (!n || n < 1) throw new Error("Write the amount you received");
  if (n > left) throw new Error(`That's more than what's left to pay (${naira(left)}).`);
  const done = n === left;
  const [row] = await q(`UPDATE store_orders SET paid_amount = paid_amount + $2, payments = payments || jsonb_build_array(jsonb_build_object('amount', $2::int, 'at', now())),
    status = CASE WHEN $3 THEN 'paid' ELSE status END, paid_at = CASE WHEN $3 THEN now() ELSE paid_at END WHERE ref = $1 AND status = 'part' RETURNING *`, [o.ref, n, done]);
  return row;
}
export async function storeOrders(requestId, { status = "", search = "", limit = 100, buyerId = null } = {}) {
  await ensureSchema();
  const s = String(search || "").trim().toLowerCase();
  return q(`SELECT ref, items, subtotal, delivery, total, buyer, status, method, buyer_id, claim, created_at, paid_at, delivered_at, cancelled_at, packed_at, shipped_at, discount, code, zone, paid_amount, payments FROM store_orders
    WHERE request_id = $1 AND ($2 = '' OR status = $2 OR ($2 = 'todo' AND (status IN ('awaiting','cod','part') OR (status = 'paid' AND delivered_at IS NULL))))
      AND ($3 = '' OR lower(buyer->>'name') LIKE '%' || $3 || '%' OR buyer->>'phone' LIKE '%' || $3 || '%' OR lower(ref) LIKE '%' || $3 || '%')
      AND ($5::int IS NULL OR buyer_id = $5) AND ($2 <> '' OR status NOT IN ('pending', 'failed', 'abandoned', 'reversed'))
    ORDER BY created_at DESC LIMIT $4`, [Number(requestId), String(status || ""), s, Math.min(500, Number(limit) || 100), buyerId]);
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
  const pending = await q(`SELECT ref FROM store_orders WHERE status = 'pending' AND method IN ('paystack', 'flutterwave') AND created_at < now() - interval '10 minutes' AND created_at > now() - interval '3 days' LIMIT 50`, []);
  let paid = 0;
  for (const p of pending) {
    const res = await confirmOrder(p.ref).catch(() => null);
    if (res?.order?.status === "paid" && !res.already) paid++;
  }
  return paid;
}
