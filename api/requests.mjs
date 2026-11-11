// /api/requests — the admin page's API. Needs header "Authorization: Bearer <ADMIN_PASSWORD>".
//   GET    ?view=all    requests, unanswered questions, settings
//   GET    ?view=chats  recent conversations (kept 90 days)
//   PATCH  { id, ...fields }            update a request
//   DELETE ?id=123                      delete a request
//   POST   { action: "create", ... }    add a request by hand
//   POST   { action: "settings", settings: {...} }
//   POST   { action: "question", id, resolved?: bool, remove?: true }
//   POST   { action: "brief_link", id }  create the project brief link now
import { timingSafeEqual, createHash } from "node:crypto";
import {
  dbConfigured, listRequests, createRequest, updateRequest, deleteRequest, listChats, listUnanswered,
  setUnansweredResolved, deleteUnanswered, getSettings, saveSettings, ensureBriefToken, STATUSES, STAGES,
  ensureDocToken, getRequest, customerEmail, customerEmailConfigured, sendCustomerEmail,
} from "./_lib/store.mjs";
import { buildDoc, DOC_TYPES } from "./_lib/docs.mjs";

// The project brief link is created once the deposit is in: 70% of the quote paid
// (or any project payment if no quote was entered).
function depositPaid(row) {
  const paid = (row.payments || []).filter((p) => p.kind !== "renewal").reduce((s, p) => s + Number(p.amount || 0), 0);
  if (!paid) return false;
  return row.quote_amount ? paid >= Math.round(row.quote_amount * 0.7) : true;
}

const failed = new Map(); // ip -> timestamps of wrong passwords

function authorised(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (expected.length < 12) return false; // refuse weak or missing passwords
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

class Bad extends Error {}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, n) => {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") throw new Bad("Text expected");
  return v.trim().slice(0, n);
};
const date = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v) || isNaN(Date.parse(v))) throw new Bad("Date must be YYYY-MM-DD");
  return v;
};
const naira = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000_000) throw new Bad("Amount must be a whole number of naira");
  return n;
};

function cleanFields(body) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  for (const [k, n] of [["name", 120], ["contact", 120], ["business", 200], ["interest", 60], ["details", 2000], ["notes", 4000]]) {
    if (has(k)) out[k] = text(body[k], n);
  }
  if ((has("name") && !out.name) || (has("contact") && !out.contact)) throw new Bad("Name and contact can't be empty");
  if (has("email")) {
    out.email = text(body.email, 200).toLowerCase() || null;
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Bad("That email address doesn't look right");
  }
  if (has("status")) {
    if (!STATUSES.includes(body.status)) throw new Bad("Unknown status");
    out.status = body.status;
  }
  if (has("project_stage")) {
    if (body.project_stage && !STAGES.includes(body.project_stage)) throw new Bad("Unknown project stage");
    out.project_stage = body.project_stage || null;
  }
  for (const k of ["follow_up_on", "live_on", "renewal_due"]) if (has(k)) out[k] = date(body[k]);
  for (const k of ["quote_amount", "renewal_amount"]) if (has(k)) out[k] = naira(body[k]);
  if (has("payments")) {
    if (!Array.isArray(body.payments) || body.payments.length > 200) throw new Bad("Payments must be a list");
    out.payments = body.payments.map((p) => {
      const amount = naira(p?.amount);
      if (!amount) throw new Bad("Each payment needs an amount");
      return {
        date: date(p.date) || new Date().toISOString().slice(0, 10),
        amount,
        kind: p.kind === "renewal" ? "renewal" : "project",
        note: text(p.note, 200),
      };
    });
  }
  return out;
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === "object" ? body : {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (failed.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 10) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  if (!authorised(req)) {
    recent.push(now);
    failed.set(ip, recent);
    const configured = (process.env.ADMIN_PASSWORD || "").length >= 12;
    return res.status(401).json({ error: configured ? "Wrong password" : "ADMIN_PASSWORD is not set (min 12 characters)" });
  }
  if (!dbConfigured()) return res.status(503).json({ error: "DATABASE_URL is not set" });

  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    if (req.method === "GET") {
      if (query.view === "chats") return res.status(200).json({ chats: await listChats() });
      const [requests, unanswered, settings] = await Promise.all([listRequests(), listUnanswered(), getSettings()]);
      return res.status(200).json({ requests, unanswered, settings, statuses: STATUSES, stages: STAGES, can_email_customers: customerEmailConfigured() });
    }

    if (req.method === "PATCH") {
      const body = readBody(req);
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Bad("Missing id");
      let row = await updateRequest(id, cleanFields(body));
      if (!row) return res.status(404).json({ error: "Not found" });
      if (!row.brief_token && depositPaid(row)) row = (await ensureBriefToken(id)) || row;
      return res.status(200).json(row);
    }

    if (req.method === "DELETE") {
      const id = Number(query.id);
      if (!Number.isInteger(id)) throw new Bad("Missing id");
      return (await deleteRequest(id)) ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "Not found" });
    }

    if (req.method === "POST") {
      const body = readBody(req);
      if (body.action === "create") {
        const f = cleanFields({ name: body.name, contact: body.contact, email: body.email || "", business: body.business, interest: body.interest || "Other", details: body.details || "" });
        if (!f.name || !f.contact) throw new Bad("Name and contact are required");
        return res.status(201).json(await createRequest(f));
      }
      if (body.action === "brief_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const row = await ensureBriefToken(id);
        return row ? res.status(200).json(row) : res.status(404).json({ error: "Not found" });
      }
      if (body.action === "doc_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const row = await ensureDocToken(id);
        return row ? res.status(200).json(row) : res.status(404).json({ error: "Not found" });
      }
      if (body.action === "send_doc") {
        const id = Number(body.id);
        if (!Number.isInteger(id) || !DOC_TYPES.includes(body.type)) throw new Bad("Missing id or document type");
        if (!customerEmailConfigured()) throw new Bad("Emailing customers isn't set up yet: verify your domain in Resend and set LEAD_EMAIL_FROM in Vercel. Send it on WhatsApp for now.");
        const row = (await ensureDocToken(id)) || (await getRequest(id));
        if (!row) return res.status(404).json({ error: "Not found" });
        const to = customerEmail(row);
        if (!to) throw new Bad("This customer has no email address. Add one under Edit customer details.");
        const doc = buildDoc(row, body.type, await getSettings());
        if (doc.error) throw new Bad(doc.error);
        const link = `https://${req.headers.host || "sirraddo-website.vercel.app"}/doc?t=${row.doc_token}&type=${body.type}`;
        await sendCustomerEmail(to, doc.subject, `<p style="font-family:Arial,sans-serif">Hello ${row.name.split(" ")[0]},</p>
          <p style="font-family:Arial,sans-serif">${body.type === "receipt" ? "Thank you for your payment. Your receipt is below." : "Please find your invoice below."}
          You can also <a href="${link}">view, print or save it as a PDF</a>.</p>${doc.html}`);
        return res.status(200).json({ ok: true, to });
      }
      if (body.action === "settings") {
        return res.status(200).json({ settings: await saveSettings(body.settings || {}) });
      }
      if (body.action === "question") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const ok = body.remove ? await deleteUnanswered(id) : await setUnansweredResolved(id, Boolean(body.resolved));
        return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "Not found" });
      }
      throw new Bad("Unknown action");
    }

    res.setHeader("Allow", "GET, PATCH, DELETE, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof Bad) return res.status(400).json({ error: err.message });
    console.error("requests failed", err);
    return res.status(500).json({ error: "Database error" });
  }
}
