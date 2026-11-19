// /api/mystore — the store owner's own admin (the page is /mystore). They log in with the username and password
// SIRRADDO gave them (temporary at first; they must choose their own). Everything here is limited to their own store.
//   POST { action, ... } with "Authorization: Bearer <ou.… login | o1.… session>"
import { dbConfigured, getRequest, getBriefById, q } from "./_lib/store.mjs";
import { ownerFromCredential, ownerSessionToken, setOwnerPassword, listBuyers, buyerResetCode, setBuyerActive } from "./_lib/storeaccounts.mjs";
import { setShopPayments, payMethods, storeOrders, ownerOrderAction, receiptLink, orderLink, METHOD_LABEL } from "./_lib/shop.mjs";
import { applyManage, afterManage, manageLink } from "./_lib/manage.mjs";
import { listReviews } from "./_lib/reviews.mjs";

const SESSION_DAYS = 30;
const fails = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (fails.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  fails.set(ip, list);
  if (fails.size > 5000) fails.clear();
  return list.length >= 10;
}
function readBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  return b && typeof b === "object" ? b : {};
}

// The store's settings as saved (the usual client row hides whether a payment key is there).
async function rawShop(id) {
  const [row] = await q(`SELECT shop FROM customer_requests WHERE id = $1`, [id]);
  return row?.shop || {};
}
// What the owner sees about their store (never the payment keys themselves).
function storeInfo(r, sh) {
  const m = payMethods(sh);
  return {
    id: r.id, name: r.brief?.business_name || r.business || r.name, website: r.website_url || "", whatsapp: r.brief?.whatsapp || r.brief?.phone || "",
    methods: m, paystack: { connected: Boolean(sh.key), end: sh.keyEnd || "", mode: sh.keyMode || null, on: m.paystack },
    flutterwave: { connected: Boolean(sh.flwKey), end: sh.flwKeyEnd || "", mode: sh.flwMode || null, on: m.flutterwave },
    transfer: sh.transfer || { on: false }, delivery: sh.delivery || { on: false }, deliveryFee: sh.deliveryFee ?? null, notify: sh.notify || "",
    accountsFeature: Boolean(sh.accounts), accountsOn: Boolean(sh.accounts && !sh.accountsOff), manageOn: !sh.manageOff,
  };
}
const csv = (rows) => rows.map((r) => r.map((v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; }).join(",")).join("\n");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!dbConfigured()) return res.status(503).json({ error: "Not available right now" });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (tooMany(ip)) return res.status(429).json({ error: "Too many wrong tries. Wait 15 minutes and try again." });
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const who = await ownerFromCredential(given).catch(() => null);
  if (!who) {
    if (given) fails.get(ip)?.push(Date.now()) ?? fails.set(ip, [Date.now()]);
    return res.status(401).json({ error: given.startsWith("ou.") ? "Wrong username or password. A temporary password stops working after 3 days: ask SIRRADDO for a new one." : "You were logged out. Log in again." });
  }
  const body = readBody(req);
  const action = String(body.action || "");
  const id = who.request_id;
  try {
    // A temporary password must be changed first.
    if (action === "my_password") {
      const row = await setOwnerPassword(who.user.id, body.current, body.password);
      return res.status(200).json({ ok: true, token: ownerSessionToken(row, body.remember ? SESSION_DAYS : 1) });
    }
    if (action === "session") {
      if (!given.startsWith("ou.")) return res.status(400).json({ error: "Log in with your username and password" });
      return res.status(200).json({ token: ownerSessionToken(who.user, SESSION_DAYS) });
    }
    const [r, b, sh] = await Promise.all([getRequest(id), getBriefById(id), rawShop(id)]);
    if (!r) return res.status(404).json({ error: "Store not found" });
    r.brief = b?.brief || {};
    r.shop = sh;
    const me = { name: who.user.name, username: who.user.username, must_change: who.mustChange };
    if (who.mustChange) {
      if (action === "me") return res.status(200).json({ me, store: { name: me.name } });
      return res.status(403).json({ error: "Choose your new password first.", must_change: true });
    }
    if (action === "me") {
      const todo = await storeOrders(id, { status: "todo", limit: 200 });
      return res.status(200).json({ me, store: storeInfo(r, sh), todo: todo.length, awaiting: todo.filter((o) => o.status === "awaiting").length });
    }
    if (action === "orders") {
      const list = await storeOrders(id, { status: body.status, search: body.search, limit: 200 });
      return res.status(200).json({ orders: list.map((o) => ({ ...o, how: METHOD_LABEL[o.method] || o.method, link: o.status === "paid" ? receiptLink(o) : orderLink(o) })) });
    }
    if (action === "order") {
      const row = await ownerOrderAction(id, body.ref, body.do);
      return res.status(200).json({ order: { ...row, how: METHOD_LABEL[row.method] || row.method, link: row.status === "paid" ? receiptLink(row) : orderLink(row) } });
    }
    if (action === "products") {
      const br = r.brief || {};
      return res.status(200).json({
        products: (br.products || []).map((p, i) => ({ i, name: p.name, category: p.category || "", price: p.price || "", stock: p.stock ?? "", soldout: Boolean(p.soldout) })).filter((p) => p.name),
        details: { tagline: br.tagline || "", hours: br.hours || "", phone: br.phone || "", whatsapp: br.whatsapp || "", site_notice: br.site_notice || "" },
        reviews: (await listReviews(id).catch(() => [])).map((x) => ({ id: x.id, name: x.name, stars: x.stars, body: x.body, status: x.status, created_at: x.created_at })),
      });
    }
    if (action === "save") {
      const input = {};
      if (body.products && typeof body.products === "object") input.products = body.products;
      for (const k of ["hours", "phone", "whatsapp", "site_notice", "tagline"]) if (body.details && k in body.details) input[k] = body.details[k];
      if (body.reviews && typeof body.reviews === "object") input.reviews = body.reviews;
      const { changes, row } = await applyManage(r, input);
      if (!changes.length) return res.status(200).json({ changes, live: "nothing changed" });
      const live = await afterManage(row, changes);
      return res.status(200).json({ changes, live });
    }
    if (action === "payments") {
      const p = body.payments || {};
      // The owner can connect their own Paystack / Flutterwave keys here (it's their own account) and switch every option.
      await setShopPayments(id, { secretKey: p.paystackKey, paystackOn: p.paystackOn, flwKey: p.flwKey, flwOn: p.flwOn, flwRemove: p.flwRemove,
        transfer: p.transfer, delivery: p.delivery, deliveryFee: p.deliveryFee, notify: p.notify, accountsOn: sh.accounts ? p.accountsOn : undefined });
      const fresh = await getRequest(id);
      fresh.brief = r.brief;
      return res.status(200).json({ store: storeInfo(fresh, await rawShop(id)) });
    }
    if (action === "customers") {
      if (!r.shop?.accounts) return res.status(409).json({ error: "Customer accounts are part of the Standard Store. Ask SIRRADDO to add them." });
      return res.status(200).json({ customers: await listBuyers(id, { search: body.search }) });
    }
    if (action === "customer_orders") {
      const list = await storeOrders(id, { buyerId: Number(body.buyer_id), limit: 100 });
      return res.status(200).json({ orders: list.map((o) => ({ ...o, how: METHOD_LABEL[o.method] || o.method })) });
    }
    if (action === "customer_reset") return res.status(200).json(await buyerResetCode(id, body.buyer_id));
    if (action === "customer_active") return res.status(200).json({ customer: await setBuyerActive(id, body.buyer_id, body.active) });
    if (action === "export") {
      const orders = await storeOrders(id, { limit: 500 });
      const head = ["Order", "Date", "Status", "Paid by", "Customer", "Phone", "Email", "Address", "Items", "Delivery (₦)", "Total (₦)", "Delivered"];
      const out = { orders: csv([head, ...orders.map((o) => [o.ref, new Date(o.created_at).toISOString().slice(0, 10), o.status, METHOD_LABEL[o.method] || o.method, o.buyer?.name, o.buyer?.phone, o.buyer?.email, o.buyer?.address,
        o.items.map((l) => `${l.name} x${l.qty}`).join("; "), o.delivery, o.total, o.delivered_at ? "yes" : ""])]) };
      if (r.shop?.accounts) {
        const cs = await listBuyers(id);
        out.customers = csv([["Name", "Phone", "Email", "Addresses", "Paid orders", "Spent (₦)", "Last order", "Joined"], ...cs.map((c) => [c.name, c.phone, c.email, (c.addresses || []).map((a) => `${a.label}: ${a.text}`).join(" | "),
          c.orders, c.spent, c.last_order ? new Date(c.last_order).toISOString().slice(0, 10) : "", new Date(c.created_at).toISOString().slice(0, 10)])]);
      }
      return res.status(200).json(out);
    }
    if (action === "manage_link") {
      if (r.shop?.manageOff) return res.status(409).json({ error: "Your Manage link is switched off. Everything is here in My store." });
      return res.status(200).json(await manageLink(id));
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    if (e.status && e.status >= 500) { console.error("mystore error", e); return res.status(500).json({ error: "Something went wrong. Please try again." }); }
    return res.status(400).json({ error: e.message });
  }
}
