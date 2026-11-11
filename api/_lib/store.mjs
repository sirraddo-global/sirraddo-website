// Database (Neon Postgres via DATABASE_URL) and email (Resend via RESEND_API_KEY) for the
// website assistant and the admin page. Each part is optional: if its environment
// variable is missing, it is skipped.
import { neon } from "@neondatabase/serverless";

// ---------- Database access ----------
// q(text, params) runs one parameterised query and returns the rows.
// Tests can set globalThis.__TEST_DB__ to any object with query(text, params) -> { rows }.
let neonSql = null;
async function q(text, params = []) {
  if (globalThis.__TEST_DB__) return (await globalThis.__TEST_DB__.query(text, params)).rows;
  if (!neonSql) neonSql = neon(process.env.DATABASE_URL);
  return neonSql.query(text, params);
}
export const dbConfigured = () => Boolean(globalThis.__TEST_DB__ || process.env.DATABASE_URL);

// Tables are created and upgraded automatically, once per server instance.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS customer_requests (
     id SERIAL PRIMARY KEY,
     session_id TEXT UNIQUE NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     name TEXT NOT NULL,
     contact TEXT NOT NULL,
     business TEXT,
     interest TEXT NOT NULL,
     details TEXT NOT NULL,
     page TEXT,
     transcript JSONB,
     status TEXT NOT NULL DEFAULT 'new',
     notes TEXT)`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'chat'`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS follow_up_on DATE`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS quote_amount INTEGER`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS payments JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS project_stage TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS live_on DATE`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS renewal_amount INTEGER`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS renewal_due DATE`,
  `CREATE TABLE IF NOT EXISTS chat_logs (
     session_id TEXT PRIMARY KEY,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     page TEXT,
     messages JSONB NOT NULL DEFAULT '[]'::jsonb,
     fallbacks INTEGER NOT NULL DEFAULT 0,
     lead_saved BOOLEAN NOT NULL DEFAULT false)`,
  `CREATE TABLE IF NOT EXISTS unanswered_questions (
     id SERIAL PRIMARY KEY,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     session_id TEXT,
     question TEXT NOT NULL,
     resolved BOOLEAN NOT NULL DEFAULT false)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];
let schemaReady = null;
export async function ensureSchema() {
  if (!dbConfigured()) return false;
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const stmt of SCHEMA) await q(stmt);
    })().catch((err) => {
      schemaReady = null; // try again on the next request
      throw err;
    });
  }
  await schemaReady;
  return true;
}

export const STATUSES = ["new", "contacted", "quoted", "won", "lost"];
export const STAGES = ["content", "building", "live"];

const REQUEST_COLUMNS = `id, created_at, updated_at, source, name, contact, business, interest, details, page,
  transcript, status, notes, follow_up_on::text AS follow_up_on, quote_amount, payments, project_stage,
  live_on::text AS live_on, renewal_amount, renewal_due::text AS renewal_due`;

// ---------- Customer requests ----------
// Insert or update the request for this session. Returns { id, inserted }, or null if there is no database.
// source: "chat" (AI assistant), "form" (package buttons), "contact" (homepage form),
// "chat-form" (details left in the chat when the AI couldn't reply), "manual" (added in admin).
export async function saveRequest(r) {
  if (!(await ensureSchema())) return null;
  const rows = await q(
    `INSERT INTO customer_requests (session_id, source, name, contact, business, interest, details, page, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (session_id) DO UPDATE SET
       name = EXCLUDED.name, contact = EXCLUDED.contact, business = EXCLUDED.business,
       interest = EXCLUDED.interest, details = EXCLUDED.details, page = EXCLUDED.page,
       transcript = EXCLUDED.transcript, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [r.sessionId, r.source || "chat", r.name, r.contact, r.business || null, r.interest, r.details || "", r.page || null,
      JSON.stringify(r.transcript || [])]
  );
  return rows[0] ? { id: rows[0].id, inserted: rows[0].inserted === true } : null;
}

export const reference = (id) => "SGL-" + String(id).padStart(4, "0");

// A request added by hand in the admin page (e.g. a customer who called or sent a WhatsApp).
export async function createRequest(f) {
  await ensureSchema();
  const sessionId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = await q(
    `INSERT INTO customer_requests (session_id, source, name, contact, business, interest, details)
     VALUES ($1, 'manual', $2, $3, $4, $5, $6) RETURNING ${REQUEST_COLUMNS}`,
    [sessionId, f.name, f.contact, f.business || null, f.interest, f.details || ""]
  );
  return rows[0];
}

export async function listRequests(limit = 1000) {
  await ensureSchema();
  return q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests ORDER BY created_at DESC LIMIT $1`, [limit]);
}

// Fields the admin page may change, with how to store each one.
const EDITABLE = {
  name: "text", contact: "text", business: "text", interest: "text", details: "text", notes: "text",
  status: "text", follow_up_on: "date", quote_amount: "int", payments: "jsonb", project_stage: "text",
  live_on: "date", renewal_amount: "int", renewal_due: "date",
};
export async function updateRequest(id, fields) {
  await ensureSchema();
  const sets = [];
  const params = [];
  for (const [key, type] of Object.entries(EDITABLE)) {
    if (!(key in fields)) continue;
    let v = fields[key];
    if (v === "" || v === undefined) v = null;
    params.push(type === "jsonb" ? JSON.stringify(v ?? []) : v);
    sets.push(`${key} = $${params.length}${type === "jsonb" ? "::jsonb" : type === "date" ? "::date" : ""}`);
  }
  if (!sets.length) return null;
  params.push(id);
  const rows = await q(
    `UPDATE customer_requests SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length}
     RETURNING ${REQUEST_COLUMNS}`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteRequest(id) {
  await ensureSchema();
  const rows = await q(`DELETE FROM customer_requests WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

// ---------- Conversations and unanswered questions ----------
export async function logChat({ sessionId, page, messages, fallback, leadSaved }) {
  if (!(await ensureSchema())) return;
  await q(
    `INSERT INTO chat_logs (session_id, page, messages, fallbacks, lead_saved)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     ON CONFLICT (session_id) DO UPDATE SET
       page = EXCLUDED.page, messages = EXCLUDED.messages, updated_at = now(),
       fallbacks = chat_logs.fallbacks + EXCLUDED.fallbacks,
       lead_saved = chat_logs.lead_saved OR EXCLUDED.lead_saved`,
    [sessionId, page || null, JSON.stringify(messages), fallback ? 1 : 0, Boolean(leadSaved)]
  );
}

export async function listChats(limit = 200) {
  await ensureSchema();
  return q(
    `SELECT session_id, created_at, updated_at, page, messages, fallbacks, lead_saved
     FROM chat_logs ORDER BY updated_at DESC LIMIT $1`,
    [limit]
  );
}

export async function addUnanswered(sessionId, question) {
  if (!(await ensureSchema())) return null;
  const rows = await q(
    `INSERT INTO unanswered_questions (session_id, question) VALUES ($1, $2) RETURNING id`,
    [sessionId, question]
  );
  return rows[0]?.id ?? null;
}

export async function listUnanswered(limit = 300) {
  await ensureSchema();
  return q(
    `SELECT id, created_at, session_id, question, resolved FROM unanswered_questions
     ORDER BY resolved ASC, created_at DESC LIMIT $1`,
    [limit]
  );
}

export async function setUnansweredResolved(id, resolved) {
  await ensureSchema();
  const rows = await q(`UPDATE unanswered_questions SET resolved = $1 WHERE id = $2 RETURNING id`, [resolved, id]);
  return rows.length > 0;
}

export async function deleteUnanswered(id) {
  await ensureSchema();
  const rows = await q(`DELETE FROM unanswered_questions WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

// ---------- Settings (bank details for invoices, WhatsApp message templates) ----------
export const SETTING_KEYS = [
  "bank_name", "account_name", "account_number", "invoice_note",
  "tpl_new", "tpl_quoted", "tpl_won", "tpl_payment", "tpl_renewal",
];
export async function getSettings() {
  await ensureSchema();
  const rows = await q(`SELECT key, value FROM settings`);
  return Object.fromEntries(rows.filter((r) => SETTING_KEYS.includes(r.key)).map((r) => [r.key, r.value]));
}
export async function saveSettings(values) {
  await ensureSchema();
  for (const key of SETTING_KEYS) {
    if (!(key in values)) continue;
    const v = String(values[key] ?? "").slice(0, 2000);
    await q(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, v]
    );
  }
  return getSettings();
}

// ---------- Daily summary data and clean-up ----------
export async function digestData() {
  await ensureSchema();
  const open = `status NOT IN ('won', 'lost')`;
  const [fresh, overdue, renewals, questions] = await Promise.all([
    q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests WHERE created_at > now() - interval '1 day' ORDER BY created_at`),
    q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests
       WHERE ${open} AND follow_up_on IS NOT NULL AND follow_up_on <= (now() AT TIME ZONE 'Africa/Lagos')::date
       ORDER BY follow_up_on`),
    q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests
       WHERE status = 'won' AND renewal_due IS NOT NULL
         AND renewal_due <= (now() AT TIME ZONE 'Africa/Lagos')::date + 30
       ORDER BY renewal_due`),
    q(`SELECT id, created_at, question FROM unanswered_questions
       WHERE NOT resolved AND created_at > now() - interval '1 day' ORDER BY created_at`),
  ]);
  return { fresh, overdue, renewals, questions };
}

// Conversations are kept for 90 days (see the privacy policy); saved requests are business records.
export async function cleanup(days = 90) {
  await ensureSchema();
  const a = await q(`DELETE FROM chat_logs WHERE updated_at < now() - ($1 || ' days')::interval RETURNING session_id`, [String(days)]);
  const b = await q(
    `DELETE FROM unanswered_questions WHERE created_at < now() - ($1 || ' days')::interval RETURNING id`,
    [String(days)]
  );
  return { chats: a.length, questions: b.length };
}

// ---------- Email ----------
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.LEAD_EMAIL_TO);

export async function sendEmail(subject, html) {
  if (!emailConfigured()) return null;
  const from = process.env.LEAD_EMAIL_FROM || "SIRRADDO Website Assistant <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: process.env.LEAD_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export function waLink(contact) {
  const digits = String(contact).replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith("0") ? "234" + digits.slice(1) : digits}`;
}

export async function emailRequest(r, isNew) {
  if (!emailConfigured()) return null;
  const wa = waLink(r.contact);
  const lines = (r.transcript || []).length ? "<hr><p><b>Conversation</b></p>" + r.transcript
    .map((m) => `<p style="margin:4px 0"><b>${m.role === "user" ? "Customer" : "Assistant"}:</b> ${esc(m.content)}</p>`)
    .join("") : "";
  const from = { form: "website package form", contact: "website contact form", "chat-form": "chat (AI unavailable)" }[r.source] || "AI chat";
  const html = `
    <h2 style="margin:0 0 8px">${isNew ? "New" : "Updated"} customer request: ${esc(r.interest)}</h2>
    <p style="color:#4A5568">From the ${from}${r.ref ? ` · reference <b>${esc(r.ref)}</b>` : ""}</p>
    <p><b>Name:</b> ${esc(r.name)}<br><b>Contact:</b> ${esc(r.contact)}${wa ? ` (<a href="${wa}">WhatsApp</a>)` : ""}
    <br><b>Business:</b> ${esc(r.business || "-")}<br><b>Page:</b> ${esc(r.page || "-")}</p>
    <p><b>Summary:</b> ${esc(r.details || "-")}</p>${lines}`;
  return sendEmail(`${isNew ? "New" : "Updated"} website request: ${r.name} (${r.interest})`, html);
}
