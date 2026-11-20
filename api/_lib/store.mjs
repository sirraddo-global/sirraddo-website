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
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS came_from TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS ref_code TEXT`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS wants TEXT`,
  // Instalments: the deposit share to start (default 70%) and an optional next instalment amount.
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS deposit_pct INTEGER`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS next_payment INTEGER`,
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS ref_used INTEGER NOT NULL DEFAULT 0`,
  `CREATE UNIQUE INDEX IF NOT EXISTS customer_requests_ref_code ON customer_requests (ref_code)`,
  `CREATE TABLE IF NOT EXISTS staff (id SERIAL PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE, phone TEXT, pass_hash TEXT NOT NULL, must_change BOOLEAN NOT NULL DEFAULT true, temp_expires TIMESTAMPTZ, perms JSONB NOT NULL DEFAULT '[]'::jsonb, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ, password_changed_at TIMESTAMPTZ)`,
  `ALTER TABLE staff ADD COLUMN IF NOT EXISTS username TEXT UNIQUE`,
  `ALTER TABLE staff ADD COLUMN IF NOT EXISTS must_change BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE staff ADD COLUMN IF NOT EXISTS temp_expires TIMESTAMPTZ`,
  `ALTER TABLE staff ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`,
  `ALTER TABLE staff DROP CONSTRAINT IF EXISTS staff_pass_hash_key`,
  `CREATE TABLE IF NOT EXISTS staff_log (id SERIAL PRIMARY KEY, staff_id INTEGER, staff_name TEXT, what TEXT NOT NULL, request_id INTEGER, at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS ad_spend (id SERIAL PRIMARY KEY, day DATE NOT NULL, platform TEXT NOT NULL, tag TEXT NOT NULL, amount INTEGER NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
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
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS design_refs JSONB NOT NULL DEFAULT '[]'::jsonb`,
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
  `ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS greetings_off BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS greeting_sends (
     request_id INTEGER NOT NULL,
     festival_key TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     sent_at TIMESTAMPTZ,
     PRIMARY KEY (request_id, festival_key))`,
  `CREATE TABLE IF NOT EXISTS change_requests (
     id SERIAL PRIMARY KEY,
     request_id INTEGER NOT NULL,
     body TEXT NOT NULL,
     files JSONB NOT NULL DEFAULT '[]'::jsonb,
     free BOOLEAN NOT NULL DEFAULT true,
     status TEXT NOT NULL DEFAULT 'open',
     note TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     done_at TIMESTAMPTZ)`,
  `ALTER TABLE change_requests ADD COLUMN IF NOT EXISTS plan JSONB`,
  `CREATE TABLE IF NOT EXISTS site_stats (
     request_id INTEGER NOT NULL,
     day DATE NOT NULL,
     path TEXT NOT NULL DEFAULT '',
     kind TEXT NOT NULL,
     source TEXT NOT NULL DEFAULT '',
     n INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (request_id, day, path, kind, source))`,
  `CREATE TABLE IF NOT EXISTS site_visitors (
     request_id INTEGER NOT NULL,
     day DATE NOT NULL,
     vid TEXT NOT NULL,
     PRIMARY KEY (request_id, day, vid))`,
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
  // How each order is paid (paystack, flutterwave, transfer, delivery), who placed it (a buyer account, if any) and what happened after.
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'paystack'`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS buyer_id INTEGER`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS claim JSONB`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS stock_taken BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS store_orders_req ON store_orders (request_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS store_orders_buyer ON store_orders (buyer_id) WHERE buyer_id IS NOT NULL`,
  // Store owners' own admin logins (/mystore).
  `CREATE TABLE IF NOT EXISTS store_users (id SERIAL PRIMARY KEY, request_id INTEGER NOT NULL, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, pass_hash TEXT NOT NULL,
     must_change BOOLEAN NOT NULL DEFAULT true, temp_expires TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     last_seen_at TIMESTAMPTZ, password_changed_at TIMESTAMPTZ)`,
  // Buyers' accounts on a Standard Store (one list per store; a phone number is one account per store).
  `CREATE TABLE IF NOT EXISTS store_buyers (id SERIAL PRIMARY KEY, request_id INTEGER NOT NULL, phone TEXT NOT NULL, name TEXT NOT NULL, email TEXT,
     pass_hash TEXT, google_sub TEXT, addresses JSONB NOT NULL DEFAULT '[]'::jsonb, active BOOLEAN NOT NULL DEFAULT true,
     reset_hash TEXT, reset_exp TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_seen_at TIMESTAMPTZ, UNIQUE (request_id, phone))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS store_buyers_google ON store_buyers (request_id, google_sub) WHERE google_sub IS NOT NULL`,
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
  `CREATE TABLE IF NOT EXISTS email_outbox (
     id SERIAL PRIMARY KEY,
     kind TEXT NOT NULL DEFAULT '',
     to_us BOOLEAN NOT NULL DEFAULT false,
     recipient TEXT NOT NULL DEFAULT '',
     subject TEXT NOT NULL DEFAULT '',
     html TEXT NOT NULL DEFAULT '',
     reply_to TEXT,
     from_name TEXT,
     error TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'refused',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     sent_at TIMESTAMPTZ)`,
  `CREATE TABLE IF NOT EXISTS email_usage (
     day DATE NOT NULL,
     kind TEXT NOT NULL,
     sent INTEGER NOT NULL DEFAULT 0,
     failed INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (day, kind))`,
  `CREATE TABLE IF NOT EXISTS site_reviews (
     id SERIAL PRIMARY KEY,
     request_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     stars INTEGER NOT NULL,
     body TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'pending',
     who TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS site_reviews_req ON site_reviews (request_id, status)`,
  // Store extras (api/_lib/storeplus.mjs): discount codes, delivery areas, tracking, pay small-small, product reviews,
  // "tell me when it's back" lists and signed-in buyers' unfinished carts.
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS code TEXT`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS zone TEXT`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS paid_amount INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS payments JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS product_i INTEGER`,
  `ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS product TEXT`,
  `ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS buyer_id INTEGER`,
  `ALTER TABLE site_reviews ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS stock_alerts (id SERIAL PRIMARY KEY, request_id INTEGER NOT NULL, product_i INTEGER NOT NULL, product TEXT NOT NULL DEFAULT '', variant TEXT NOT NULL DEFAULT '',
     name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), done_at TIMESTAMPTZ)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS stock_alerts_one ON stock_alerts (request_id, product_i, variant, phone) WHERE done_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS buyer_carts (request_id INTEGER NOT NULL, buyer_id INTEGER NOT NULL, items JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), nudged_at TIMESTAMPTZ,
     PRIMARY KEY (request_id, buyer_id))`,
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

const REQUEST_COLUMNS = `id, created_at, updated_at, source, came_from, ref_code, ref_used, services, wants, name, contact, business, interest, details, page,
  transcript, status, notes, follow_up_on::text AS follow_up_on, quote_amount, deposit_pct, next_payment, payments, project_stage,
  live_on::text AS live_on, renewal_amount, renewal_due::text AS renewal_due,
  brief_token, brief_saved_at, brief_submitted_at, email, doc_token,
  website_url, site_status, site_checked_at, ssl_expires::text AS ssl_expires, auto_sent,
  draft_at, draft_error, (draft_md IS NOT NULL) AS has_draft,
  handover, preview_token, preview_status, preview_feedback, preview_approved_at,
  COALESCE((length(draft_md) - length(replace(draft_md, '[ADD:', ''))) / 5, 0) AS draft_gaps,
  COALESCE(strpos(draft_md, 'wasn''t written') > 0, false) AS draft_missing,
  left(substring(draft_md from '## Google Business Profile description[^\n]*\n((?:(?!\n## ).)*)'), 1500) AS gbp_text,
  (design_css IS NOT NULL) AS has_design, design_at, design_by, design_error, design_refs, COALESCE(brief_files->'example_shots', '[]'::jsonb) AS example_shots, hosting, chat_ideas, greetings_off,
  (shop - 'key' - 'flwKey') || jsonb_build_object('online', COALESCE(shop->>'key', '') <> '', 'flwOnline', COALESCE(shop->>'flwKey', '') <> '') AS shop,
  (SELECT count(*)::int FROM change_requests c WHERE c.request_id = customer_requests.id AND c.status = 'open') AS open_changes,
  jsonb_build_object('emails', brief->>'email_names', 'emails5', brief->>'email_names_5', 'paystack', brief->>'paystack', 'gbp_gmail', brief->>'gbp_gmail', 'examples', brief->>'examples') AS brief_wants,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o->>'id', 'by', o->>'by', 'at', o->>'at', 'standard', COALESCE(o->>'css', '') = '',
    'current', COALESCE(o->>'css', '') = COALESCE(design_css, ''))) FROM jsonb_array_elements(design_options) o), '[]'::jsonb) AS design_choices`;

// ---------- Customer requests ----------
// Insert or update the request for this session. Returns { id, inserted }, or null if there is no database.
// source: "chat" (AI assistant), "form" (package buttons), "contact" (homepage form),
// "chat-form" (details left in the chat when the AI couldn't reply), "manual" (added in admin).
export async function saveRequest(r) {
  if (!(await ensureSchema())) return null;
  const rows = await q(
    `INSERT INTO customer_requests (session_id, source, name, contact, business, interest, details, page, transcript, email, chat_ideas, came_from, wants, follow_up_on)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb, $12, $13, (now() AT TIME ZONE 'Africa/Lagos')::date + 1)
     ON CONFLICT (session_id) DO UPDATE SET came_from = COALESCE(customer_requests.came_from, EXCLUDED.came_from), wants = COALESCE(EXCLUDED.wants, customer_requests.wants),
       name = EXCLUDED.name, contact = EXCLUDED.contact, business = EXCLUDED.business,
       email = COALESCE(EXCLUDED.email, customer_requests.email),
       interest = EXCLUDED.interest, details = EXCLUDED.details, page = EXCLUDED.page,
       transcript = EXCLUDED.transcript, chat_ideas = customer_requests.chat_ideas || EXCLUDED.chat_ideas, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [r.sessionId, r.source || "chat", r.name, r.contact, r.business || null, r.interest, r.details || "", r.page || null,
      JSON.stringify(r.transcript || []), r.email || null, JSON.stringify(r.ideas || {}), cleanFrom(r.cameFrom),
      ["customer_accounts", "custom_system"].includes(r.wants) ? r.wants : detectWants(r.details, r.ideas?.goals, r.ideas?.pages, r.ideas?.products_services)]
  );
  return rows[0] ? { id: rows[0].id, inserted: rows[0].inserted === true } : null;
}

// What a lead asked for beyond our packages (so admin → Packages shows demand): buyer logins / saved addresses
// for an online store ("customer_accounts"), or a bigger system with logins ("custom_system").
export function detectWants(...texts) {
  const t = texts.filter(Boolean).join(" \n ").toLowerCase();
  if (/\b(portal|dashboard|student|pupil|result checker|school management|booking system|appointment system|hospital|clinic|patients?|members?['’]? area|staff (login|accounts?)|agent (login|accounts?)|multi-?vendor|marketplace|e-?learning|lms|crm|erp|inventory system)\b/.test(t)) return "custom_system";
  if (/((customer|buyer|user|client)s?['’]? (accounts?|logins?|log ?in|sign ?ins?|sign ?up|registration|profiles?))|\b(saved? (delivery )?address(es)?|order history|track (my )?orders?|wish ?list|my orders|login for (my )?customers)\b/.test(t)) return "customer_accounts";
  return null;
}

// Where a customer came from: "facebook / ibadan-test", "google (search)", "referral"… (short, lower case).
export const cleanFrom = (v) => String(v ?? "").replace(/[^\w ./()&+:-]/g, "").trim().toLowerCase().slice(0, 80) || null;

export const reference = (id) => "SGL-" + String(id).padStart(4, "0");

// A request added by hand in the admin page (e.g. a customer who called or sent a WhatsApp).
export async function createRequest(f) {
  await ensureSchema();
  const sessionId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rows = await q(
    `INSERT INTO customer_requests (session_id, source, name, contact, business, interest, details, email, came_from, follow_up_on)
     VALUES ($1, 'manual', $2, $3, $4, $5, $6, $7, $8, (now() AT TIME ZONE 'Africa/Lagos')::date + 1) RETURNING ${REQUEST_COLUMNS}`,
    [sessionId, f.name, f.contact, f.business || null, f.interest, f.details || "", f.email || null, cleanFrom(f.came_from)]
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
  handover: "jsonb", draft_md: "text", came_from: "text", services: "jsonb", wants: "text", deposit_pct: "int", next_payment: "int",
};
export async function updateRequest(id, fields) {
  await ensureSchema();
  const sets = [];
  const params = [];
  for (const [key, type] of Object.entries(EDITABLE)) {
    if (!(key in fields)) continue;
    let v = fields[key];
    // Empty means "not set" (null), except the summary, which the database keeps as text (it can't be null).
    if (v === "" || v === undefined) v = key === "details" ? "" : null;
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

// Deleting a customer removes everything about them: their change requests, website stats, reviews, store orders,
// store login and their buyers' accounts (e.g. for a data-deletion request). Their files are removed by the caller.
export async function deleteRequest(id) {
  await ensureSchema();
  for (const t of ["change_requests", "site_stats", "site_visitors", "greeting_sends", "site_reviews", "store_orders", "store_users", "store_buyers", "stock_alerts", "buyer_carts"])
    await q(`DELETE FROM ${t} WHERE request_id = $1`, [id]).catch((e) => console.error("delete from", t, e.message));
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
    `SELECT id, name, business, contact, interest, status, project_stage, brief, brief_files, brief_saved_at, brief_submitted_at, chat_ideas,
       (draft_md IS NOT NULL AND draft_md <> '') AS has_draft
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
  if (url === "*") { // "Remove all"
    const rows = await q(`UPDATE customer_requests SET brief_files = jsonb_set(brief_files, ARRAY[$1::text], '[]'::jsonb), updated_at = now()
      WHERE brief_token = $2 RETURNING id, brief_files`, [field, token]);
    return rows[0]?.brief_files ?? null;
  }
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
  brief, brief_files, design_refs, draft_md, preview_token, preview_status, preview_feedback, preview_approved_at, design_css, design_options, design_by, hosting, draft_at, design_at,
  website_url, live_on::text AS live_on, shop->>'token' AS shop_token`;
// The same private token, without touching the preview/stage (used for the "request a change" link).
export async function ensureLinkToken(id) {
  await ensureSchema();
  const rows = await q(`UPDATE customer_requests SET preview_token = COALESCE(preview_token, $1) WHERE id = $2 RETURNING preview_token`, [randomBytes(18).toString("base64url"), id]);
  return rows[0]?.preview_token ?? null;
}
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

// Online Store settings (token for the store's cart, encrypted Paystack key, delivery fee). Merges the given fields.
// Merges a few answers into the project form (used by "Manage my store"); everything else stays as it is.
export async function mergeBrief(id, patch) {
  await ensureSchema();
  await q(`UPDATE customer_requests SET brief = COALESCE(brief, '{}'::jsonb) || $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(patch), id]);
}
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
// Screenshots of the look the customer likes, added by you in admin (up to 3): [{ url, name }].
export const MAX_DESIGN_REFS = 3;
export async function setDesignRefs(id, refs) {
  await ensureSchema();
  await q(`UPDATE customer_requests SET design_refs = $1::jsonb, updated_at = now() WHERE id = $2`, [JSON.stringify(refs.slice(0, MAX_DESIGN_REFS)), id]);
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
  "tpl_preview", "tpl_handover", "handover_terms", "default_registrar", "vercel_pro_at", "referral_reward", "pkg_build", "pkg_addon", "pkg_renewal_addon", "pkg_rate", "custom_build_from", "custom_monthly", "neon_plan", "owner_whatsapp", "away_until", "away_web",
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
// Sets a key only if it isn't set yet. Returns true for the one caller that set it (used as a lock).
export async function claimMeta(key, value) {
  if (!(await ensureSchema())) return false;
  const rows = await q(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING RETURNING key`, ["_" + key, String(value)]);
  return rows.length > 0;
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

// ---------- Email usage watch ----------
// Resend's free plan: 100 emails a day and 3,000 a month for EVERYTHING we send. Each send is counted here by type
// (and Resend's own count is kept from its reply headers), so Admin → Settings → Email usage shows how close we are.
// Our email is only for our direct customers and ourselves, never for our customers' own buyers or visitors.
export const EMAIL_LIMITS = { day: Number(process.env.EMAIL_DAILY_LIMIT || 100), month: Number(process.env.EMAIL_MONTHLY_LIMIT || 3000) };
export function emailKind(subject, toUs) {
  const s = String(subject || "").toLowerCase();
  if (toUs) return /daily summary|morning/.test(s) ? "Morning summary (to you)" : "Alerts to you";
  if (/invoice|receipt|payment/.test(s)) return "Invoices & receipts";
  if (/order/.test(s)) return "Store order alerts";
  if (/review/.test(s)) return "Review alerts";
  if (/preview|approved/.test(s)) return "Previews";
  if (/visitor|report/.test(s)) return "Visitor reports";
  if (/change/.test(s)) return "Change requests";
  if (/paused|renewal/.test(s)) return "Renewals & pauses";
  if (/paystack|online payments/.test(s)) return "Store setup";
  return "Other to customers";
}
async function recordEmail(kind, ok, res, count = 1) {
  try {
    if (!dbConfigured() || !(await ensureSchema())) return;
    const day = new Date().toISOString().slice(0, 10); // Resend's daily count resets at midnight UTC (1am in Lagos)
    await q(`INSERT INTO email_usage (day, kind, sent, failed) VALUES ($1, $2, $3, $4)
      ON CONFLICT (day, kind) DO UPDATE SET sent = email_usage.sent + EXCLUDED.sent, failed = email_usage.failed + EXCLUDED.failed`, [day, kind, ok ? count : 0, ok ? 0 : count]);
    const d = res?.headers?.get?.("x-resend-daily-quota"), m = res?.headers?.get?.("x-resend-monthly-quota");
    if (d || m) await setMeta("resend_quota", JSON.stringify({ daily: d ? Number(d) : null, monthly: m ? Number(m) : null, at: new Date().toISOString() }));
    if (!ok && res?.status === 429) await setMeta("email_blocked", JSON.stringify({ at: new Date().toISOString(), why: res.why || "" }));
  } catch (e) { console.error("email usage not recorded", e?.message); }
}
async function resendFailed(res, kind, count) {
  const text = (await res.text()).slice(0, 200);
  res.why = /daily_quota|monthly_quota/.test(text) ? (text.match(/(daily|monthly)_quota_exceeded/) || [""])[0] : "";
  await recordEmail(kind, false, res, count);
  return new Error(`Resend ${res.status}: ${text}`);
}
export async function emailUsage(days = 14) {
  if (!(await ensureSchema())) return null;
  const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7) + "-01";
  const rows = await q(`SELECT to_char(day, 'YYYY-MM-DD') AS day, kind, sent, failed FROM email_usage WHERE day >= LEAST($1::date, CURRENT_DATE - $2::int) ORDER BY day DESC, sent DESC`, [month, days - 1]);
  const meta = await getMeta(["resend_quota", "email_blocked"]);
  const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  const sum = (list, f) => list.reduce((t, r) => t + Number(r[f] || 0), 0);
  const byDay = {};
  for (const r of rows) (byDay[r.day] ||= []).push(r);
  const list = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const rs = byDay[d] || [];
    list.push({ day: d, sent: sum(rs, "sent"), failed: sum(rs, "failed") });
  }
  const todayRows = byDay[today] || [];
  const monthRows = rows.filter((r) => r.day >= month);
  const resend = parse(meta.resend_quota);
  const fresh = resend && String(resend.at).slice(0, 10) === today;
  return {
    limits: EMAIL_LIMITS,
    today: { day: today, sent: sum(todayRows, "sent"), failed: sum(todayRows, "failed"), resend: fresh ? resend.daily : null,
      byKind: todayRows.map((r) => ({ kind: r.kind, sent: Number(r.sent), failed: Number(r.failed) })) },
    month: { sent: sum(monthRows, "sent"), failed: sum(monthRows, "failed"), resend: resend && String(resend.at).slice(0, 7) === today.slice(0, 7) ? resend.monthly : null },
    days: list,
    blocked: parse(meta.email_blocked),
    refusedWaiting: await countRefused().catch(() => 0),
  };
}

// Send to a customer (needs LEAD_EMAIL_FROM). Replies go to LEAD_EMAIL_TO.
export async function sendCustomerEmail(to, subject, html, replyTo, fromName, { keep = true } = {}) {
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
  const kind = emailKind(subject, false);
  if (!res.ok) {
    const err = await resendFailed(res, kind, 1);
    if (keep) await keepRefused({ kind, toUs: false, to, subject, html, replyTo, fromName, error: err.message });
    throw err;
  }
  await recordEmail(kind, true, res, 1);
  return true;
}

export async function sendEmail(subject, html, attachments, { keep = true } = {}) {
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
  const n = process.env.LEAD_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean).length || 1;
  const kind = emailKind(subject, true);
  if (!res.ok) {
    const err = await resendFailed(res, kind, n);
    // Emails with attachments (the weekly backup) are never stored.
    if (keep && !attachments) await keepRefused({ kind, toUs: true, to: "", subject, html, error: err.message });
    throw err;
  }
  await recordEmail(kind, true, res, n);
  return true;
}

// ---------- Refused emails ----------
// When Resend refuses an email (usually the daily limit), it's kept here so you can send it again from
// Admin → Settings → Email usage once the limit resets. Kept 30 days.
async function keepRefused(m) {
  try {
    if (!dbConfigured() || !(await ensureSchema())) return;
    await q(`INSERT INTO email_outbox (kind, to_us, recipient, subject, html, reply_to, from_name, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [m.kind, m.toUs, m.to || "", String(m.subject || "").slice(0, 300), String(m.html || ""), m.replyTo || null, m.fromName || null, String(m.error || "").slice(0, 300)]);
  } catch (e) { console.error("refused email not kept", e?.message); }
}
export async function listRefused(limit = 50) {
  if (!(await ensureSchema())) return [];
  return q(`SELECT id, kind, to_us, recipient, subject, error, created_at FROM email_outbox WHERE status = 'refused' ORDER BY created_at DESC LIMIT $1`, [limit]);
}
export async function countRefused() {
  if (!(await ensureSchema())) return 0;
  return Number((await q(`SELECT count(*)::int AS n FROM email_outbox WHERE status = 'refused'`))[0]?.n || 0);
}
// "Send again" (one id, or all). Returns { sent, failed, error }.
export async function resendRefused(ids) {
  const where = ids === "all" ? `status = 'refused'` : `status = 'refused' AND id = ANY($1::int[])`;
  const rows = await q(`SELECT * FROM email_outbox WHERE ${where} ORDER BY created_at LIMIT 40`, ids === "all" ? [] : [[].concat(ids).map(Number)]);
  let sent = 0, failed = 0, error = "";
  for (const m of rows) {
    try {
      if (m.to_us) await sendEmail(m.subject, m.html, null, { keep: false });
      else await sendCustomerEmail(m.recipient, m.subject, m.html, m.reply_to || undefined, m.from_name || undefined, { keep: false });
      await q(`UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = $1`, [m.id]);
      sent++;
    } catch (e) {
      failed++; error = e.message;
      if (/429/.test(e.message)) break; // still over the limit: stop and try later
    }
  }
  return { sent, failed, error };
}
export async function removeRefused(id) {
  await q(`UPDATE email_outbox SET status = 'removed' WHERE id = $1 AND status = 'refused'`, [Number(id)]);
}
export async function cleanupRefused() {
  if (!(await ensureSchema())) return;
  await q(`DELETE FROM email_outbox WHERE created_at < now() - interval '30 days'`);
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
