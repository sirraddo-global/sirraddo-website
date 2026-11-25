// POST /api/lead — save a customer's details from a website form before they go to WhatsApp.
// Body: { source: "form" | "contact" | "chat-form", name, contact, email?, business?, interest?, details?, page?, website? }
// "website" is a hidden field real people leave empty; bots fill it in.
// Returns: { ok: true, ref: "SGL-0012" } (ref is missing if the database is unavailable)
import { saveRequest, emailRequest, reference } from "./_lib/store.mjs";
import { acknowledgeLead, applyRules } from "./_lib/automation.mjs";
import { getRequest, updateRequest, ensureDocToken } from "./_lib/store.mjs";
import { payLink } from "./_lib/paystack.mjs";
import { currentOffer } from "./_lib/marketing.mjs";
import { DESIGN_NAMES } from "./_lib/graphics.mjs";

// Fixed-price packages the price picker can start straight away (quote set, deposit paid online).
export const FIXED_PRICES = { "Starter website": 50000, "Business website": 100000 };

const SOURCES = ["form", "contact", "chat-form", "picker"];
const PACKAGES = ["Starter website", "Business website", "Online Store", "Custom app", "Business software", "ZAPPI PAY", ...DESIGN_NAMES, "Other"];

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 10;
}

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export function validContact(c) {
  return /^\+?[\d\s()-]{10,20}$/.test(c) && c.replace(/\D/g, "").length >= 10 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  body = body && typeof body === "object" ? body : {};

  if (str(body.website, 200)) return res.status(200).json({ ok: true }); // bot: pretend it worked

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many requests. Please message us on WhatsApp." });

  const source = SOURCES.includes(body.source) ? body.source : "form";
  const name = str(body.name, 120);
  const contact = str(body.contact, 120);
  const interest = PACKAGES.includes(body.interest) ? body.interest : "Other";
  if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
  if (!validContact(contact)) return res.status(400).json({ error: "Please enter a valid phone number or email." });
  let email = str(body.email, 200).toLowerCase();
  if (!email && /@/.test(contact)) email = contact.toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Please check your email address." });

  const r = {
    // One request per person, form and day: tapping the same button twice updates it instead of duplicating.
    sessionId: `${source}-${contact.toLowerCase().replace(/[^\da-z@.]/g, "")}-${new Date().toISOString().slice(0, 10)}`,
    source,
    name,
    contact,
    business: str(body.business, 200),
    cameFrom: str(body.from, 80),
    email: email || null,
    interest,
    details: str(body.details, 1500),
    page: str(body.page, 200),
    transcript: [],
  };

  let saved = null;
  let isNew = true;
  try {
    saved = await saveRequest(r);
    if (saved) { isNew = saved.inserted; r.ref = reference(saved.id); }
  } catch (err) {
    console.error("lead save failed", err);
  }
  let mailed = null;
  try {
    mailed = await emailRequest(r, isNew);
  } catch (err) {
    console.error("lead email failed", err);
  }
  if (!saved && !mailed) return res.status(503).json({ error: "Couldn't save right now. Please message us on WhatsApp." });
  if (saved?.inserted && r.email) await acknowledgeLead({ ...r, id: saved.id, auto_sent: {} }); // "we got your request" email
  // "Start now" in the price picker: the package price becomes the quote, and they go straight to paying the deposit.
  // Only for fixed prices, only with an email (Paystack needs it), never over a quote or payment we already have,
  // and not while an offer runs (the offer price is set by us on the quote).
  if (body.start === true && saved && FIXED_PRICES[interest] && email) {
    try {
      const offer = await currentOffer().catch(() => null);
      let row = await getRequest(saved.id);
      if (!offer && row && row.quote_amount == null && !(row.payments || []).length) {
        row = await updateRequest(saved.id, { quote_amount: FIXED_PRICES[interest] });
        row = (await applyRules(row, { quote_amount: FIXED_PRICES[interest] })) || row;
      }
      if (row?.quote_amount && !(row.payments || []).length) {
        row = (await ensureDocToken(saved.id)) || row;
        const pay = payLink(row, "deposit");
        if (pay) return res.status(200).json({ ok: true, ref: r.ref, pay: pay.replace(/^https?:\/\/[^/]+/, "") });
      }
    } catch (e) { console.error("picker start failed", e); }
  }
  return res.status(200).json({ ok: true, ref: r.ref });
}
