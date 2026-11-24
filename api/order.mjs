// Quick-service orders from /design and /services (flyers, CVs, Google Maps listing, mini websites…).
// GET  /api/order            → { visible: [keys] }  which services are switched on (Admin → Packages → Side services)
// POST /api/order (or /api/design)
// Body: { name, contact, email?, business?, service, words, size?, colours?, style?, deadline?, files?: [{url,name}], from?, website? }
// Files are uploaded first with /api/chat-upload (s = the form's session id). With an email the price is set as the
// quote (full payment, deposit_pct 100) and the reply has the payment link; without one we follow up on WhatsApp.
// Returns { ok, ref, pay? }
import { saveRequest, emailRequest, reference, getRequest, updateRequest, ensureDocToken } from "./_lib/store.mjs";
import { acknowledgeLead, applyRules } from "./_lib/automation.mjs";
import { payLink } from "./_lib/paystack.mjs";
import { cleanOrder, quickPrice, visibleKeys, QUICK_SERVICES } from "./_lib/graphics.mjs";
import { getSettings } from "./_lib/store.mjs";
import { validContact } from "./lead.mjs";

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 8;
}
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  let visible;
  try { visible = visibleKeys(await getSettings()); } catch { visible = visibleKeys({}); }
  if (req.method === "GET") { res.setHeader("Cache-Control", "public, max-age=60"); return res.status(200).json({ visible, pages: { design: QUICK_SERVICES.some((x) => x.page === "design" && visible.includes(x.key)), services: QUICK_SERVICES.some((x) => x.page === "services" && visible.includes(x.key)) } }); }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" }); }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  body = body && typeof body === "object" ? body : {};
  if (str(body.website, 200)) return res.status(200).json({ ok: true }); // bot

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many orders for now. Please message us on WhatsApp." });

  const name = str(body.name, 120), contact = str(body.contact, 120);
  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!validContact(contact)) return res.status(400).json({ error: "Please enter your WhatsApp number." });
  let email = str(body.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please check your email address." });
  let order;
  try { order = cleanOrder(body, visible); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  const r = {
    sessionId: `design-${contact.toLowerCase().replace(/[^\da-z@.]/g, "")}-${order.service.toLowerCase().replace(/\W+/g, "-")}-${new Date().toISOString().slice(0, 10)}`,
    source: order.svc.page === "design" ? "design" : "service", name, contact, email: email || null, business: str(body.business, 200),
    cameFrom: str(body.from, 80), interest: order.service, details: order.details, page: order.svc.page === "design" ? "/design" : "/services", transcript: [],
  };
  let saved = null, isNew = true;
  try { saved = await saveRequest(r); if (saved) { isNew = saved.inserted; r.ref = reference(saved.id); } } catch (e) { console.error("design save failed", e); }
  let mailed = null;
  try { mailed = await emailRequest(r, isNew); } catch (e) { console.error("design email failed", e); }
  if (!saved && !mailed) return res.status(503).json({ error: "Couldn't save right now. Please message us on WhatsApp." });
  if (!saved) return res.status(200).json({ ok: true });

  let pay = null;
  try {
    let row = await getRequest(saved.id);
    // Fixed price, paid in full before we start (small jobs): never over a quote or payment we already have.
    if (row && row.quote_amount == null && !(row.payments || []).length) {
      const price = quickPrice(order.service);
      row = await updateRequest(saved.id, { quote_amount: price, deposit_pct: 100 });
      row = (await applyRules(row, { quote_amount: price })) || row;
    }
    if (saved.inserted && email) await acknowledgeLead({ ...r, id: saved.id, auto_sent: {} });
    if (email && row?.quote_amount && !(row.payments || []).length) {
      row = (await ensureDocToken(saved.id)) || row;
      const link = payLink(row, "deposit");
      if (link) pay = link.replace(/^https?:\/\/[^/]+/, "");
    }
  } catch (e) { console.error("design price/pay failed", e); }
  return res.status(200).json({ ok: true, ref: r.ref, ...(pay ? { pay } : {}) });
}
