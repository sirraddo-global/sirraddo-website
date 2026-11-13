// Database (Neon Postgres via DATABASE_URL) and email (Resend via RESEND_API_KEY) for the
// website assistant and the admin page. Each part is optional: if its environment
// variable is missing, it is skipped.
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

// ---------- Database access ----------
// q(text, params) runs one parameterised query and returns the rows.
// Tests can set globalThis.__TEST_DB__ to any object with query(text, params) -> { rows }.
let neonSql = null;
export async function q(text, params = []) {
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
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS brief_token TEXT UNIQUE`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS email TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS doc_token TEXT UNIQUE`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS website_url TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS site_status TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS site_checked_at TIMESTAMPTZ`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS ssl_expires DATE`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS auto_sent JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS draft_md TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS draft_at TIMESTAMPTZ`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS draft_error TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS brief JSONB`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS brief_files JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS brief_saved_at TIMESTAMPTZ`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS brief_submitted_at TIMESTAMPTZ`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS handover JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS preview_token TEXT UNIQUE`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS preview_status TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS preview_feedback JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS preview_approved_at TIMESTAMPTZ`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS design_css TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS design_at TIMESTAMPTZ`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS design_by TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS design_error TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS design_options JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS hosting JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS chat_ideas JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS shop JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `CREATE TABLE IF NOT EXISTS store_orders (
     id SERIAL PRIMARY KEY,
     request_id INTEGER NOT NULL,
     ref TEXT NOT NULL UNIQUE,
     items JSONB NOT NULL DEFAULT '[]'::jsonb,
     subtotal INTEGER NOT NULL DEFAULT 0,
     delivery INTEGER NOT NULL DEFAULT 0,
     total INTEGER NOT NULL DEFAULT 0,
     buyer JSONB NOT NULL DEFAULT '{}'::jsonb,
     status TEXT NOT NULL DEFAULT 'pending',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     paid_at TIMESTAMPTZ)`,
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
export const STAGES = ["content", "building", "review", "live"];

const REQUEST_COLUMNS = `id, created_at, updated_at, source, name, contact, business, interest, details, page,
  transcript, status, notes, follow_up_on::text AS follow_up_on, quote_amount, payments, project_stage,
  live_on::text AS live_on, renewal_amount, renewal_due::text AS renewal_due,
  brief_token, brief_saved_at, brief_submitted_at, email, doc_token,
  website_url, site_status, site_checked_at, ssl_expires::text AS ssl_expires, auto_sent,
  draft_at, draft_error, (draft_md IS NOT NULL) AS has_draft,
  handover, preview_token, preview_status, preview_feedback, preview_approved_at,
  COALESCE((length(draft_md) - length(replace(draft_md, '[ADD:', ''))) / 5, 0) AS draft_gaps,
  (design_css IS NOT NULL) AS has_design, design_at, design_by, design_error, hosting, chat_ideas,
  (shop - 'key') || jsonb_build_object('online', COALESCE(shop->>'key', '') <> '') AS shop,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o->>'id', 'by', o->>'by', 'at', o->>'at', 'standard', COALESCE(o->>'css', '') = '',
    'current', COALESCE(o->>'css', '') = COALESCE(design_css, ''))) FROM jsonb_array_elements(design_options) o), '[]'::jsonb) AS design_choices`;

// ---------- Customer requests ----------
// Insert or update the request for this session. Returns { id, inserted }, or null if there is no database.
// source: "chat" (AI assistant), "form" (package buttons), "contact" (homepage form),
// "chat-form" (details left in the chat when the AI couldn't reply), "manual" (added in admin).
export async function saveRequest(r) {
  if (!(await ensureSchema())) return null;
  const rows = await q(
    `INSERT INTO customer_requests (session_id, source, name, contact, business, interest, details, page, transcript, email, chat_ideas, follow_up_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, (now() AT TIME ZONE 'Africa/Lagos')::date + 1)
     ON CONFLICT (session_id) DO UPDATE SET
       name = EXCLUDED.name, contact = EXCLUDED.contact, business = EXCLUDED.business,
       email = COALESCE(EXCLUDED.email, customer_requests.email),
       interest = EXCLUDED.interest, details = EXCLUDED.details, page = EXCLUDED.page,
       transcript = EXCLUDED.transcript, chat_ideas = customer_requests.chat_ideas || EXCLUDED.chat_ideas, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [r.sessionId, r.source || "chat", r.name, r.contact, r.business || null, r.interest, r.details || "", r.page || null,
      JSON.stringify(r.transcript || []), r.email || null, JSON.stringify(r.ideas || {})]
  );
  return rows[0] ? { id: rows[0].id, inserted: rows[0].inserted === true } : null;
}

export const reference = (id) => "SGL-" + String(id).padStart(4, "0");

// A request added by hand in the admin page (e.g. a customer who called or sent a WhatsApp).
export async function createRequest(f) {
  await ensureSchema();
  const sessionId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = await q(
    `INSERT INTO customer_requests (session_id, source, name, contact, business, interest, details, email, follow_up_on)
     VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, (now() AT TIME ZONE 'Africa/Lagos')::date + 1) RETURNING ${REQUEST_COLUMNS}`,
    [sessionId, f.name, f.contact, f.business || null, f.interest, f.details || "", f.email || null]
  );
  return rows[0];
}

export async function listRequests(limit = 1000) {
  await ensureSchema();
  return q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests ORDER BY created_at DESC LIMIT $1`, [limit]);
}

// Fields the admin page may change, with how to store each one.
const EDITABLE = {
  name: "text", contact: "text", email: "text", business: "text", interest: "text", details: "text", notes: "text",
  status: "text", follow_up_on: "date", quote_amount: "int", payments: "jsonb", project_stage: "text",
  live_on: "date", renewal_amount: "int", renewal_due: "date", website_url: "text",
  handover: "jsonb", draft_md: "text",
};
export async function updateRequest(id, fields) {
  await ensureSchema();
  const sets = [];
  const params = [];
  for (const [key, type] of Object.entries(EDITABLE)) {
    if (!(key in fields)) continue;
    let v = fields[key];
    if (v === "" || v === undefined) v = null;
    params.push(type === "jsonb" ? JSON.stringify(v ?? (key === "handover" ? {} : [])) : v);
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

// ---------- Invoice and receipt links (/doc?t=...) ----------
export async function ensureDocToken(id) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests SET doc_token = COALESCE(doc_token, $1) WHERE id = $2 RETURNING ${REQUEST_COLUMNS}`,
    [randomBytes(18).toString("base64url"), id]
  );
  return rows[0] ?? null;
}

export async function getByDocToken(token) {
  if (!token || token.length < 20) return null;
  await ensureSchema();
  const rows = await q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests WHERE doc_token = $1`, [token]);
  return rows[0] ?? null;
}

export async function getRequest(id) {
  await ensureSchema();
  const rows = await q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// The customer's email: the email field, or the contact if it is an email address.
export const customerEmail = (r) => r.email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact || "") ? r.contact : null);

// ---------- Project brief (the form customers fill in after paying the deposit) ----------
export async function ensureBriefToken(id) {
  await ensureSchema();
  const token = randomBytes(18).toString("base64url");
  const rows = await q(
    `UPDATE customer_requests SET brief_token = COALESCE(brief_token, $1), updated_at = now() WHERE id = $2
     RETURNING ${REQUEST_COLUMNS}`,
    [token, id]
  );
  return rows[0] ?? null;
}

export async function getBrief(token) {
  if (!token || token.length < 20) return null;
  await ensureSchema();
  const rows = await q(
    `SELECT id, name, business, contact, interest, status, project_stage, brief, brief_files, brief_saved_at, brief_submitted_at, chat_ideas
     FROM customer_requests WHERE brief_token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

export async function saveBrief(token, answers, submit) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests SET brief = $1::jsonb, brief_saved_at = now(), updated_at = now(),
       brief_submitted_at = CASE WHEN $2 THEN now() ELSE brief_submitted_at END,
       project_stage = CASE WHEN $2 AND (project_stage IS NULL OR project_stage = 'content') THEN 'building' ELSE project_stage END,
       follow_up_on = CASE WHEN $2 THEN NULL ELSE follow_up_on END
     WHERE brief_token = $3
     RETURNING id, name, contact, business, interest, brief, brief_files, brief_submitted_at`,
    [JSON.stringify(answers), Boolean(submit), token]
  );
  return rows[0] ?? null;
}

// Add an uploaded file to a brief field, unless the field already has "max" files.
export async function addBriefFile(token, field, file, max) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests
     SET brief_files = jsonb_set(brief_files, ARRAY[$1::text], COALESCE(brief_files->$1, '[]'::jsonb) || $2::jsonb),
         updated_at = now()
     WHERE brief_token = $3 AND jsonb_array_length(COALESCE(brief_files->$1, '[]'::jsonb)) < $4
     RETURNING brief_files`,
    [field, JSON.stringify([file]), token, max]
  );
  return rows[0]?.brief_files ?? null;
}

export async function removeBriefFile(token, field, url) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests
     SET brief_files = jsonb_set(brief_files, ARRAY[$1::text],
       COALESCE((SELECT jsonb_agg(f) FROM jsonb_array_elements(COALESCE(brief_files->$1, '[]'::jsonb)) f WHERE f->>'url' <> $2), '[]'::jsonb)),
       updated_at = now()
     WHERE brief_token = $3
     RETURNING brief_files`,
    [field, url, token]
  );
  return rows[0]?.brief_files ?? null;
}

// ---------- AI website text drafts ----------
export async function getBriefById(id) {
  await ensureSchema();
  const rows = await q(
    `SELECT id, name, business, contact, interest, status, brief, brief_files, brief_submitted_at, draft_md, draft_at, draft_error, chat_ideas, details
     FROM customer_requests WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
export async function saveDraft(id, md, error) {
  await ensureSchema();
  if (md) await q(`UPDATE customer_requests SET draft_md = $1, draft_at = now(), draft_error = NULL WHERE id = $2`, [md, id]);
  else await q(`UPDATE customer_requests SET draft_error = $1 WHERE id = $2`, [String(error || "failed").slice(0, 300), id]);
}

// ---------- Online payments (Paystack) ----------
// Adds a payment unless one with the same Paystack reference is already there (webhook and return page can both arrive).
export async function addPaymentOnce(id, payment) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests SET payments = payments || $1::jsonb, updated_at = now()
     WHERE id = $2 AND NOT (payments @> $3::jsonb) RETURNING ${REQUEST_COLUMNS}`,
    [JSON.stringify([payment]), id, JSON.stringify([{ ref: payment.ref }])]
  );
  return rows[0] ?? null;
}

// ---------- Preview sites (/preview?t=...) ----------
const PREVIEW_COLUMNS = `id, name, business, contact, email, interest, status, quote_amount, payments, project_stage, doc_token, auto_sent,
  brief, brief_files, draft_md, preview_token, preview_status, preview_feedback, preview_approved_at, design_css, design_options, design_by, hosting, draft_at, design_at,
  website_url, shop->>'token' AS shop_token`;
export async function ensurePreviewToken(id) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests SET preview_token = COALESCE(preview_token, $1),
       preview_status = CASE WHEN preview_status IS NULL OR preview_status = 'changes' THEN 'sent' ELSE preview_status END,
       project_stage = CASE WHEN project_stage IS NULL OR project_stage IN ('content', 'building') THEN 'review' ELSE project_stage END,
       updated_at = now()
     WHERE id = $2 RETURNING ${REQUEST_COLUMNS}`,
    [randomBytes(18).toString("base64url"), id]
  );
  return rows[0] ?? null;
}
// A custom look made by AI for this customer's site (CSS only). css = null removes it; error records a failed try.
export async function saveDesign(id, css, by, error = null) {
  await ensureSchema();
  const rows = await q(
    error
      ? `UPDATE customer_requests SET design_error = $1, updated_at = now() WHERE id = $2 RETURNING ${REQUEST_COLUMNS}`
      : `UPDATE customer_requests SET design_css = $1, design_by = $3, design_at = CASE WHEN $1::text IS NULL THEN NULL ELSE now() END,
           design_error = NULL, updated_at = now() WHERE id = $2 RETURNING ${REQUEST_COLUMNS}`,
    error ? [String(error).slice(0, 300), id] : [css, id, css ? by : null]
  );
  return rows[0] ?? null;
}
// Where and how the customer's website is hosted (Cloudflare). Merges the given fields.
export async function saveHosting(id, patch) {
  await ensureSchema();
  await q(`UPDATE customer_requests SET hosting = hosting || $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(patch), id]);
}

// Online Store settings (token for the store's basket, encrypted Paystack key, delivery fee). Merges the given fields.
export async function updateRequestShop(id, patch) {
  await ensureSchema();
  const rows = await q(`UPDATE customer_requests SET shop = shop || $1::jsonb, updated_at = now() WHERE id = $2 RETURNING ${REQUEST_COLUMNS}`, [JSON.stringify(patch), id]);
  return rows[0] ?? null;
}

// Up to 3 designs the customer can choose from on the preview page. Each: { id, css ("" = standard), by, at }.
export const MAX_DESIGN_OPTIONS = 3;
export async function setDesignOptions(id, options, current) {
  await ensureSchema();
  const rows = await q(
    `UPDATE customer_requests SET design_options = $1::jsonb, design_css = $2, design_by = $3,
       design_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, design_error = NULL, updated_at = now()
     WHERE id = $4 RETURNING ${REQUEST_COLUMNS}`,
    [JSON.stringify(options), current?.css || null, current?.css ? current.by : null, id]
  );
  return rows[0] ?? null;
}
export async function getByPreviewToken(token) {
  if (!token || token.length < 20) return null;
  await ensureSchema();
  const rows = await q(`SELECT ${PREVIEW_COLUMNS} FROM customer_requests WHERE preview_token = $1`, [token]);
  return rows[0] ?? null;
}
export async function getPreviewById(id) {
  await ensureSchema();
  const rows = await q(`SELECT ${PREVIEW_COLUMNS} FROM customer_requests WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
// The customer's answer on the preview page: "approved", or "changes" with what to change.
export async function setPreviewResult(token, result, text) {
  await ensureSchema();
  const entry = JSON.stringify([{ at: new Date().toISOString(), result, text: String(text || "").slice(0, 3000) }]);
  const rows = await q(
    `UPDATE customer_requests SET preview_status = $1, preview_feedback = preview_feedback || $2::jsonb,
       preview_approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE preview_approved_at END,
       project_stage = CASE WHEN $1 = 'changes' AND project_stage = 'review' THEN 'building' ELSE project_stage END,
       updated_at = now()
     WHERE preview_token = $3 RETURNING ${PREVIEW_COLUMNS}`,
    [result, entry, token]
  );
  return rows[0] ?? null;
}

// ---------- Automation bookkeeping ----------
// auto_sent remembers which automatic messages went out (key -> time), so nothing is sent twice.
export async function markSent(id, key) {
  await ensureSchema();
  await q(`UPDATE customer_requests SET auto_sent = auto_sent || jsonb_build_object($1::text, now()) WHERE id = $2`, [key, id]);
}

export async function setSiteCheck(id, status, sslExpires) {
  await ensureSchema();
  await q(`UPDATE customer_requests SET site_status = $1, ssl_expires = $2::date, site_checked_at = now() WHERE id = $3`, [status, sslExpires, id]);
}

export async function listUnansweredSince(hours) {
  await ensureSchema();
  return q(`SELECT id, created_at, question FROM unanswered_questions WHERE NOT resolved AND created_at > now() - ($1 || ' hours')::interval ORDER BY created_at`, [String(hours)]);
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
  "tpl_new", "tpl_quoted", "tpl_won", "tpl_payment", "tpl_renewal", "tpl_brief", "tpl_receipt", "tpl_invoice",
  "tpl_preview", "tpl_handover", "handover_terms",
];
export async function getSettings() {
  await ensureSchema();
  const rows = await q(`SELECT key, value FROM settings`);
  return Object.fromEntries(rows.filter((r) => SETTING_KEYS.includes(r.key)).map((r) => [r.key, r.value]));
}
// Small facts the system remembers about itself (e.g. when the daily run last finished). Keys start with "_".
export async function setMeta(key, value) {
  if (!(await ensureSchema())) return;
  await q(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, ["_" + key, String(value)]);
}
export async function getMeta(keys) {
  if (!(await ensureSchema())) return {};
  const rows = await q(`SELECT key, value FROM settings WHERE key = ANY($1)`, [keys.map((k) => "_" + k)]);
  return Object.fromEntries(rows.map((r) => [r.key.slice(1), r.value]));
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
  const [fresh, overdue, renewals, questions, briefs] = await Promise.all([
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
    q(`SELECT ${REQUEST_COLUMNS} FROM customer_requests
       WHERE brief_submitted_at > now() - interval '1 day' ORDER BY brief_submitted_at`),
  ]);
  return { fresh, overdue, renewals, questions, briefs };
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
// Emailing customers needs a sender on a domain verified in Resend (LEAD_EMAIL_FROM);
// Resend's default test sender can only email the account owner.
export const customerEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.LEAD_EMAIL_FROM);

// Send to a customer (needs LEAD_EMAIL_FROM). Replies go to LEAD_EMAIL_TO.
export async function sendCustomerEmail(to, subject, html, replyTo, fromName) {
  if (!customerEmailConfigured()) return null;
  const sender = process.env.LEAD_EMAIL_FROM;
  const from = fromName ? `${String(fromName).replace(/[<>"\r\n]/g, "").slice(0, 60)} <${(sender.match(/<([^>]+)>/) || [, sender])[1].trim()}>` : sender;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: replyTo || (process.env.LEAD_EMAIL_TO || "").split(",")[0].trim() || undefined,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export async function sendEmail(subject, html, attachments) {
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
      ...(attachments ? { attachments } : {}),
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
    ${r.email ? `<br><b>Email:</b> ${esc(r.email)}` : ""}
    <br><b>Business:</b> ${esc(r.business || "-")}<br><b>Page:</b> ${esc(r.page || "-")}</p>
    <p><b>Summary:</b> ${esc(r.details || "-")}</p>${lines}`;
  return sendEmail(`${isNew ? "New" : "Updated"} website request: ${r.name} (${r.interest})`, html);
}
