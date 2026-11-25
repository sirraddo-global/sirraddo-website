// Quick-service orders from /design and /services (flyers, CVs, Google Maps listing, mini websites…).
// GET  /api/order            → { visible: [keys] }  which services are switched on (Admin → Packages → Side services)
// POST /api/order (or /api/design)
// Body: { name, contact, email?, business?, service, words, size?, colours?, style?, deadline?, files?: [{url,name}], from?, website? }
// Files are uploaded first with /api/chat-upload (s = the form's session id). With an email the price is set as the
// quote (full payment, deposit_pct 100) and the reply has the payment link; without one we follow up on WhatsApp.
// Returns { ok, ref, pay?, track? }  (track = the customer's order tracker page)
// GET /track?t=…  → the tracker page (stages, promised date, pay button while unpaid).
import { saveRequest, emailRequest, reference, getRequest, updateRequest, ensureDocToken } from "./_lib/store.mjs";
import { acknowledgeLead, applyRules } from "./_lib/automation.mjs";
import { payLink } from "./_lib/paystack.mjs";
import { cleanOrder, visibleKeys, QUICK_SERVICES } from "./_lib/graphics.mjs";
import { trackPage } from "./_lib/track.mjs";
import { listGallery, listReviews, addReview } from "./_lib/showcase.mjs";
import { getByDocToken } from "./_lib/store.mjs";
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

const IDEAS = new Map();
export const REFERRAL_OFF = 1000;
// "Order again" from the tracking page: the service and the details to fill the form with (no personal data beyond their own order).
async function againOrder(token) {
  const row = await getByDocToken(token.slice(0, 100)).catch(() => null);
  if (!row) return {};
  const d = String(row.details || ""), f = (label) => (d.match(new RegExp("^" + label + ":\\s*(.+)$", "m")) || [])[1] || "";
  return { service: row.interest, business: f("Business name") || row.business || "", colours: f("Colours"), style: f("Style / ideas"),
    info: { sell: f("What they sell"), person: f("Name on card"), title: f("Job title"), phone: f("Phone on design"), bizmail: f("Email on design"), web: f("Website"), address: f("Address / area"), socials: f("Social handles") } };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  let visible;
  try { visible = visibleKeys(await getSettings()); } catch { visible = visibleKeys({}); }
  if (req.method === "GET" && /\/track/.test(String(req.url || ""))) return trackPage(req, res);
  if (req.method === "GET" && (req.query || {}).again) return res.status(200).json(await againOrder(String(req.query.again)));
  if (req.method === "GET") { res.setHeader("Cache-Control", "public, max-age=60"); const [gallery, reviews] = await Promise.all([listGallery().catch(() => []), listReviews().catch(() => [])]); return res.status(200).json({ visible, gallery, reviews, pages: { design: QUICK_SERVICES.some((x) => x.page === "design" && visible.includes(x.key)), services: QUICK_SERVICES.some((x) => x.page === "services" && visible.includes(x.key)) } }); }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" }); }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  body = body && typeof body === "object" ? body : {};
  if (str(body.website, 200)) return res.status(200).json({ ok: true }); // bot

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (body.action === "review") {
    try { return res.status(200).json(await addReview(body.t, body)); } catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
  }
  // Headline ideas for the order form (AI), a few per visitor per hour.
  if (body.action === "ideas") {
    const now = Date.now(), list = (IDEAS.get(ip) || []).filter((t) => now - t < 3600000);
    if (list.length >= 6) return res.status(429).json({ error: "That's enough ideas for now. Pick one or write your own." });
    list.push(now); IDEAS.set(ip, list);
    const { headlineIdeas } = await import("./_lib/logos.mjs");
    const r = await headlineIdeas({ business: str(body.business, 80), what: str(body.what, 200), words: str(body.words, 600) }, 15000);
    return res.status(r.ok ? 200 : 400).json(r.ok ? { ideas: r.ideas } : { error: r.error });
  }
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many orders for now. Please message us on WhatsApp." });

  const name = str(body.name, 120), contact = str(body.contact, 120);
  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!validContact(contact)) return res.status(400).json({ error: "Please enter your WhatsApp number." });
  let email = str(body.email, 200).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please check your email address." });
  let order;
  try { order = cleanOrder(body, visible); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

  // A friend's referral link (?ref=SGL-0017): ₦1,000 off this order; the friend is owed ₦1,000 off their next one.
  let referrer = null;
  const refId = Number((String(body.ref || "").match(/^SGL-(\d{1,7})$/i) || [])[1]);
  if (refId) {
    const rr = await getRequest(refId).catch(() => null);
    const digits = (x) => String(x || "").replace(/\D/g, "").slice(-10);
    if (rr && (rr.payments || []).length && digits(rr.contact) !== digits(contact)) {
      referrer = rr;
      order.total = Math.max(0, order.total - REFERRAL_OFF);
      order.details = order.details.replace(/\n/, `\nReferred by: ${reference(rr.id)} (₦${REFERRAL_OFF.toLocaleString("en-NG")} off this order) · Total now ₦${order.total.toLocaleString("en-NG")}\n`);
    }
  }

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
  if (referrer && saved.inserted) {
    try { await updateRequest(referrer.id, { notes: `${referrer.notes ? referrer.notes + "\n" : ""}Referral: owes ₦${REFERRAL_OFF.toLocaleString("en-NG")} off their next order once their friend's order ${reference(saved.id)} is paid.` }); } catch (e) { console.error("referral note failed", e); }
  }

  let pay = null, track = null;
  try {
    let row = await getRequest(saved.id);
    // Fixed price, paid in full before we start (small jobs): never over a quote or payment we already have.
    if (row && row.quote_amount == null && !(row.payments || []).length) {
      const price = order.total;
      row = await updateRequest(saved.id, { quote_amount: price, deposit_pct: 100 });
      row = (await applyRules(row, { quote_amount: price })) || row;
    }
    if (saved.inserted && email) await acknowledgeLead({ ...r, id: saved.id, auto_sent: {} });
    row = (await ensureDocToken(saved.id)) || row;
    if (row?.doc_token) track = `/track?t=${row.doc_token}`;
    if (email && row?.quote_amount && !(row.payments || []).length) {
      const link = payLink(row, "deposit");
      if (link) pay = link.replace(/^https?:\/\/[^/]+/, "");
    }
  } catch (e) { console.error("design price/pay failed", e); }
  return res.status(200).json({ ok: true, ref: r.ref, ...(pay ? { pay } : {}), ...(track ? { track } : {}) });
}
