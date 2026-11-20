// The extra Online Store features every store gets (whatever the package, as long as it sells online):
//   sales (old price crossed out, % off, countdown), discount codes, delivery fees by area with free delivery
//   above an amount, sizes/colours with stock per option, order tracking (packed → out for delivery → delivered),
//   "tell me when it's back" lists, unfinished carts of signed-in buyers, reports, and pay small-small
//   (instalments by bank transfer, items released when fully paid).
// Prices are always worked out here on the server: the website only shows them.
// The database is loaded only by the functions that need it, so the site generator can use the price helpers.
const db = () => import("./store.mjs");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const money = (v) => { const n = Math.round(Number(String(v ?? "").replace(/[^\d.]/g, ""))); return Number.isFinite(n) && n > 0 ? n : 0; };
export const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");

// ---------- Sales ----------
// A product is on sale when it has an old price ("was") above its price, until "saleEnds" (if set). When the sale
// ends, the old price is the price again (so the owner doesn't have to remember to change it back).
export function salePrice(p, amountOf, now = Date.now()) {
  const amount = amountOf(p.price);
  const was = amountOf(p.was);
  const ends = p.saleEnds ? Date.parse(p.saleEnds) : NaN;
  const over = Number.isFinite(ends) && ends <= now;
  if (!was || !amount || was <= amount) return { amount, was: 0, onSale: false, ends: null };
  if (over) return { amount: was, was: 0, onSale: false, ends: null };
  return { amount, was, onSale: true, ends: Number.isFinite(ends) ? new Date(ends).toISOString() : null, off: Math.round((1 - amount / was) * 100) };
}

// ---------- Sizes, colours ----------
// "Size: 40, 41, 42 | Colour: Black, Brown" (or the same as a list). Up to 2 groups of up to 20 choices.
export function parseOptions(raw) {
  let groups = [];
  if (Array.isArray(raw)) groups = raw.map((g) => ({ name: clean(g?.name, 30), values: (Array.isArray(g?.values) ? g.values : String(g?.values || "").split(",")).map((v) => clean(v, 30)).filter(Boolean) }));
  else if (typeof raw === "string" && raw.trim()) {
    groups = raw.split(/\||\n/).map((part) => {
      const m = part.match(/^\s*([^:]{1,30}):(.*)$/);
      return m ? { name: clean(m[1], 30), values: m[2].split(",").map((v) => clean(v, 30)).filter(Boolean) } : { name: "Option", values: part.split(",").map((v) => clean(v, 30)).filter(Boolean) };
    });
  }
  return groups.filter((g) => g.name && g.values.length).slice(0, 2).map((g) => ({ name: g.name, values: [...new Set(g.values)].slice(0, 20) }));
}
// Every choice a buyer can make: "40 / Black".
export function variantKeys(groups) {
  if (!groups.length) return [];
  return groups.reduce((acc, g) => acc.flatMap((a) => g.values.map((v) => (a ? a + " / " + v : v))), [""]);
}
// Stock per choice: { "40 / Black": "3" } (or lines "40 / Black = 3"). Only choices that exist; whole numbers.
export function parseVariantStock(raw, groups) {
  const keys = new Set(variantKeys(groups));
  const out = {};
  const put = (k, v) => { k = clean(k, 70); v = String(v ?? "").trim(); if (keys.has(k) && /^\d{1,6}$/.test(v)) out[k] = v; };
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) put(k, v);
  else if (typeof raw === "string") for (const line of raw.split(/\n/)) { const m = line.match(/^(.+?)\s*[=:]\s*(\d{1,6})\s*$/); if (m) put(m[1], m[2]); }
  return out;
}
export function variantLeft(p, v) {
  const s = p.vstock && p.vstock[v];
  return s !== undefined && /^\d{1,6}$/.test(String(s)) ? Number(s) : null;
}

// ---------- Delivery fees by area ----------
// shop.zones = [{ name: "Bodija", fee: 1500 }, ...]; shop.freeOver = 50000 (0 = no free delivery).
export function cleanZones(list) {
  return (Array.isArray(list) ? list : []).map((z) => ({ name: clean(z?.name, 60), fee: Math.min(1e7, Math.max(0, Math.round(Number(z?.fee) || 0))) })).filter((z) => z.name).slice(0, 40);
}
export function deliveryFor(shop, { goods, zone }) {
  const zones = cleanZones(shop?.zones);
  const free = money(shop?.freeOver);
  let fee = 0, name = "";
  if (zones.length) {
    const z = zones[Number(zone)];
    if (zone === undefined || zone === null || zone === "" || !z) return { error: "Please choose your delivery area." };
    fee = z.fee; name = z.name;
  } else fee = Number(shop?.deliveryFee) || 0;
  if (free && goods >= free) fee = 0;
  return { fee, zone: name, free };
}

// ---------- Discount codes ----------
// shop.codes = [{ code: "SALE10", pct: 10 | amount: 2000, min: 10000, ends: "2026-12-31", max: 100, used: 3, off: false }]
export function cleanCodes(list, old = []) {
  const prev = new Map((Array.isArray(old) ? old : []).map((c) => [String(c.code || "").toUpperCase(), c]));
  return (Array.isArray(list) ? list : []).map((c) => {
    const code = String(c?.code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
    const pct = Math.min(90, Math.max(0, Math.round(Number(c?.pct) || 0)));
    const amount = pct ? 0 : money(c?.amount);
    const ends = /^\d{4}-\d{2}-\d{2}/.test(String(c?.ends || "")) ? String(c.ends).slice(0, 16) : "";
    return { code, pct, amount, min: money(c?.min), ends, max: Math.max(0, Math.round(Number(c?.max) || 0)), used: Number(prev.get(code)?.used) || 0, off: Boolean(c?.off) };
  }).filter((c) => c.code.length >= 3 && (c.pct || c.amount)).slice(0, 30);
}
export function activeCodes(shop, now = Date.now()) {
  return cleanCodes(shop?.codes, shop?.codes).filter((c) => !c.off && (!c.ends || Date.parse(c.ends.length === 10 ? c.ends + "T23:59:59+01:00" : c.ends + "+01:00") > now) && (!c.max || c.used < c.max));
}
export function applyCode(shop, code, goods, now = Date.now()) {
  const want = String(code || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!want) return { discount: 0, code: "" };
  const c = activeCodes(shop, now).find((x) => x.code === want);
  if (!c) return { error: "That discount code isn't valid (it may have ended)." };
  if (c.min && goods < c.min) return { error: `The code ${c.code} works on orders of ${naira(c.min)} or more.` };
  const discount = Math.min(goods, c.pct ? Math.round((goods * c.pct) / 100) : c.amount);
  return { discount, code: c.code, label: c.pct ? `${c.pct}% off` : `${naira(c.amount)} off` };
}
// When an order is placed (stock kept for it), its code counts as used once.
export async function useCode(requestId, code) {
  const { q, ensureSchema } = await db();
  if (!code) return;
  await q(`UPDATE customer_requests SET shop = jsonb_set(shop, '{codes}', (SELECT COALESCE(jsonb_agg(CASE WHEN upper(c->>'code') = $2 THEN c || jsonb_build_object('used', COALESCE((c->>'used')::int, 0) + 1) ELSE c END), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(shop->'codes', '[]'::jsonb)) c))
    WHERE id = $1 AND jsonb_typeof(shop->'codes') = 'array'`, [requestId, String(code).toUpperCase()]).catch((e) => console.error("code count failed", e));
}

// ---------- Pay small-small ----------
// shop.instalments = { on: true, firstPct: 30 }. Bank transfer only (uses the store's transfer details); the owner
// records each payment in My store; the order becomes paid (and the items are sent) when the full amount is in.
export function instalmentsOn(shop) {
  const t = shop?.transfer || {};
  return Boolean(shop?.instalments?.on && t.bank && t.name && t.number);
}
export function firstPayment(shop, total) {
  const pct = Math.min(90, Math.max(10, Number(shop?.instalments?.firstPct) || 30));
  return { pct, amount: Math.ceil((total * pct) / 100 / 100) * 100 };
}

// ---------- Order tracking ----------
// Received → Payment (confirmed / on delivery / part-paid) → Packed → Out for delivery → Delivered.
export function trackSteps(o) {
  const at = (d) => (d ? new Date(d).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");
  const payDone = o.status === "paid" || o.status === "cod";
  const payLabel = o.status === "cod" ? "Pay on delivery" : o.status === "part" ? `Paying small-small (${naira(o.paid_amount || 0)} of ${naira(o.total)})` : o.status === "awaiting" ? "Waiting for your transfer" : "Payment confirmed";
  return [
    { label: "Order received", done: true, when: at(o.created_at) },
    { label: payLabel, done: payDone, when: o.status === "paid" ? at(o.paid_at) : "" },
    { label: "Packed", done: Boolean(o.packed_at || o.shipped_at || o.delivered_at), when: at(o.packed_at) },
    { label: "Out for delivery", done: Boolean(o.shipped_at || o.delivered_at), when: at(o.shipped_at) },
    { label: "Delivered", done: Boolean(o.delivered_at), when: at(o.delivered_at) },
  ];
}
export function trackStage(o) {
  if (o.status === "cancelled") return "Cancelled";
  if (o.delivered_at) return "Delivered";
  if (o.shipped_at) return "Out for delivery";
  if (o.packed_at) return "Packed";
  if (o.status === "part") return "Paying small-small";
  if (o.status === "awaiting") return "Waiting for payment";
  return "Order received";
}
export const TRACK_CSS = `.trk{list-style:none;margin:16px 0;padding:0}.trk li{position:relative;padding:0 0 18px 34px;color:#6B7280}.trk li:before{content:"";position:absolute;left:8px;top:4px;width:14px;height:14px;border-radius:50%;border:2px solid #C9D1DE;background:#fff}
.trk li:after{content:"";position:absolute;left:15px;top:22px;bottom:2px;width:2px;background:#E1E6EF}.trk li:last-child:after{display:none}.trk li.d{color:#1B2433;font-weight:600}.trk li.d:before{background:#1E8E3E;border-color:#1E8E3E}.trk li.d:after{background:#1E8E3E}
.trk small{display:block;font-weight:400;color:#6B7280}.shr{display:flex;gap:10px;margin:6px 0 4px}.shr a,.shr button{flex:1;text-align:center;font:700 14px Arial,sans-serif;border-radius:10px;padding:11px;border:1px solid #C9D1DE;background:#fff;color:#13254F;text-decoration:none;cursor:pointer}`;
export function trackHtml(o, link) {
  if (o.status === "cancelled") return "";
  const steps = trackSteps(o);
  const wa = `https://wa.me/?text=${encodeURIComponent("Track my order " + o.ref + ": " + link)}`;
  return `<h2 style="font-size:1.1rem;margin:18px 0 0">Track your order</h2><ol class="trk">${steps.map((s) => `<li class="${s.done ? "d" : ""}">${esc(s.label)}${s.when ? `<small>${esc(s.when)}</small>` : ""}</li>`).join("")}</ol>
<div class="shr"><button type="button" onclick="location.reload()">Refresh</button><a href="${esc(wa)}" target="_blank" rel="noopener">Share on WhatsApp</a></div>`;
}

// ---------- "Tell me when it's back" ----------
export async function addStockAlert(requestId, product, { name, phone, variant }) {
  const { q, ensureSchema } = await db();
  await ensureSchema();
  const ph = clean(phone, 30);
  if (!/\d{7,}/.test(ph.replace(/\D/g, ""))) throw Object.assign(new Error("Please enter your phone number."), { status: 400 });
  const nm = clean(name, 80) || "Customer";
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM stock_alerts WHERE request_id = $1 AND done_at IS NULL`, [requestId]);
  if (n >= 500) throw Object.assign(new Error("Thank you! The list is full right now; please message the store on WhatsApp."), { status: 409 });
  await q(`INSERT INTO stock_alerts (request_id, product_i, product, variant, name, phone) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (request_id, product_i, variant, phone) WHERE done_at IS NULL DO NOTHING`, [requestId, product.i, clean(product.name, 120), clean(variant, 70), nm, ph]);
  return { ok: true };
}
export async function stockAlerts(requestId) {
  const { q, ensureSchema } = await db();
  await ensureSchema();
  return q(`SELECT id, product_i, product, variant, name, phone, created_at FROM stock_alerts WHERE request_id = $1 AND done_at IS NULL ORDER BY product, created_at LIMIT 500`, [requestId]);
}
export async function doneStockAlerts(requestId, ids) {
  const { q, ensureSchema } = await db();
  const list = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Number.isInteger).slice(0, 500);
  if (!list.length) return 0;
  const rows = await q(`UPDATE stock_alerts SET done_at = now() WHERE request_id = $1 AND id = ANY($2::int[]) AND done_at IS NULL RETURNING id`, [requestId, list]);
  return rows.length;
}

// ---------- Unfinished carts (signed-in buyers only) ----------
export async function saveBuyerCart(requestId, buyerId, items) {
  const { q, ensureSchema } = await db();
  await ensureSchema();
  const list = (Array.isArray(items) ? items : []).slice(0, 50).map((l) => ({ i: Math.floor(Number(l?.i)), q: Math.min(99, Math.max(1, Math.floor(Number(l?.q) || 1))), v: clean(l?.v, 70), n: clean(l?.n, 120), p: Math.max(0, Math.round(Number(l?.p) || 0)) })).filter((l) => Number.isInteger(l.i) && l.i >= 0);
  if (!list.length) { await q(`DELETE FROM buyer_carts WHERE request_id = $1 AND buyer_id = $2`, [requestId, buyerId]); return { ok: true }; }
  await q(`INSERT INTO buyer_carts (request_id, buyer_id, items, updated_at) VALUES ($1, $2, $3::jsonb, now())
    ON CONFLICT (request_id, buyer_id) DO UPDATE SET items = EXCLUDED.items, updated_at = now(), nudged_at = NULL`, [requestId, buyerId, JSON.stringify(list)]);
  return { ok: true };
}
export async function clearBuyerCart(requestId, buyerId) {
  const { q, ensureSchema } = await db();
  if (buyerId) await q(`DELETE FROM buyer_carts WHERE request_id = $1 AND buyer_id = $2`, [requestId, buyerId]).catch(() => {});
}
// Carts left for an hour or more (not followed by an order), newest first.
export async function unfinishedCarts(requestId) {
  const { q, ensureSchema } = await db();
  await ensureSchema();
  return q(`SELECT c.buyer_id, c.items, c.updated_at, c.nudged_at, b.name, b.phone FROM buyer_carts c JOIN store_buyers b ON b.id = c.buyer_id AND b.request_id = c.request_id
    WHERE c.request_id = $1 AND c.updated_at < now() - interval '1 hour' AND c.updated_at > now() - interval '30 days' ORDER BY c.updated_at DESC LIMIT 100`, [requestId]);
}
export async function markCartNudged(requestId, buyerId) {
  const { q, ensureSchema } = await db();
  await q(`UPDATE buyer_carts SET nudged_at = now() WHERE request_id = $1 AND buyer_id = $2`, [requestId, Number(buyerId)]);
}

// ---------- Reports ----------
export async function storeReports(requestId) {
  const { q, ensureSchema } = await db();
  await ensureSchema();
  const paid = `request_id = $1 AND status IN ('paid','cod') AND (status = 'paid' OR delivered_at IS NOT NULL)`;
  const best = await q(`SELECT l->>'name' AS name, SUM((l->>'qty')::int)::int AS qty, SUM((l->>'total')::int)::bigint AS total
    FROM store_orders, jsonb_array_elements(items) l WHERE ${paid} AND created_at > now() - interval '90 days' GROUP BY 1 ORDER BY 3 DESC LIMIT 10`, [requestId]);
  const weeks = await q(`SELECT to_char(date_trunc('week', created_at AT TIME ZONE 'Africa/Lagos'), 'DD Mon') AS week, COUNT(*)::int AS orders, SUM(total)::bigint AS total
    FROM store_orders WHERE ${paid} AND created_at > now() - interval '8 weeks' GROUP BY date_trunc('week', created_at AT TIME ZONE 'Africa/Lagos') ORDER BY date_trunc('week', created_at AT TIME ZONE 'Africa/Lagos')`, [requestId]);
  const days = await q(`SELECT to_char(created_at AT TIME ZONE 'Africa/Lagos', 'FMDay') AS day, EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Africa/Lagos')::int AS n, COUNT(*)::int AS orders
    FROM store_orders WHERE ${paid} AND created_at > now() - interval '90 days' GROUP BY 1, 2 ORDER BY 2`, [requestId]);
  const codes = await q(`SELECT code, COUNT(*)::int AS orders, SUM(discount)::bigint AS discount FROM store_orders WHERE ${paid} AND code IS NOT NULL AND code <> '' AND created_at > now() - interval '90 days' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, [requestId]);
  const [tot] = await q(`SELECT COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::bigint AS total, COALESCE(AVG(total), 0)::bigint AS avg FROM store_orders WHERE ${paid} AND created_at > now() - interval '90 days'`, [requestId]);
  return { best: best.map((b) => ({ ...b, total: Number(b.total) })), weeks: weeks.map((w) => ({ ...w, total: Number(w.total) })), days, codes: codes.map((c) => ({ ...c, discount: Number(c.discount) })), last90: { orders: tot.orders, total: Number(tot.total), avg: Number(tot.avg) } };
}
