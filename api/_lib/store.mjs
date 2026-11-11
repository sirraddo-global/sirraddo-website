// Saving customer requests: Neon Postgres (DATABASE_URL) and email via Resend (RESEND_API_KEY).
// Each part is optional: if its environment variable is missing, it is skipped.
import { neon } from "@neondatabase/serverless";

let sqlClient = null;
let tableReady = null;

function sql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function ensureTable() {
  const db = sql();
  if (!db) return null;
  if (!tableReady) {
    tableReady = db`
      CREATE TABLE IF NOT EXISTS customer_requests (
        id          SERIAL PRIMARY KEY,
        session_id  TEXT UNIQUE NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        name        TEXT NOT NULL,
        contact     TEXT NOT NULL,
        business    TEXT,
        interest    TEXT NOT NULL,
        details     TEXT NOT NULL,
        page        TEXT,
        transcript  JSONB,
        status      TEXT NOT NULL DEFAULT 'new',
        notes       TEXT
      )`.catch((err) => {
      tableReady = null; // try again on the next request
      throw err;
    });
  }
  await tableReady;
  return db;
}

// Insert or update the request for this chat session. Returns true if it was new.
export async function saveRequest(r) {
  const db = await ensureTable();
  if (!db) return null;
  const rows = await db`
    INSERT INTO customer_requests (session_id, name, contact, business, interest, details, page, transcript)
    VALUES (${r.sessionId}, ${r.name}, ${r.contact}, ${r.business}, ${r.interest}, ${r.details}, ${r.page},
            ${JSON.stringify(r.transcript)}::jsonb)
    ON CONFLICT (session_id) DO UPDATE SET
      name = EXCLUDED.name, contact = EXCLUDED.contact, business = EXCLUDED.business,
      interest = EXCLUDED.interest, details = EXCLUDED.details, page = EXCLUDED.page,
      transcript = EXCLUDED.transcript, updated_at = now()
    RETURNING (xmax = 0) AS inserted`;
  return rows[0]?.inserted === true;
}

export async function listRequests(limit = 200) {
  const db = await ensureTable();
  if (!db) return null;
  return db`
    SELECT id, created_at, updated_at, name, contact, business, interest, details, page, transcript, status, notes
    FROM customer_requests ORDER BY created_at DESC LIMIT ${limit}`;
}

export const STATUSES = ["new", "contacted", "quoted", "won", "lost"];

export async function updateRequest(id, { status, notes }) {
  const db = await ensureTable();
  if (!db) return null;
  const rows = await db`
    UPDATE customer_requests SET
      status = COALESCE(${status ?? null}, status),
      notes = COALESCE(${notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, status, notes`;
  return rows[0] ?? null;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function emailRequest(r, isNew) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.LEAD_EMAIL_TO;
  if (!key || !to) return null;
  const from = process.env.LEAD_EMAIL_FROM || "SIRRADDO Website Assistant <onboarding@resend.dev>";
  const digits = String(r.contact).replace(/\D/g, "");
  const wa = digits.length >= 10 ? `https://wa.me/${digits.startsWith("0") ? "234" + digits.slice(1) : digits}` : null;
  const lines = (r.transcript || [])
    .map((m) => `<p style="margin:4px 0"><b>${m.role === "user" ? "Customer" : "Assistant"}:</b> ${esc(m.content)}</p>`)
    .join("");
  const html = `
    <h2 style="margin:0 0 8px">${isNew ? "New" : "Updated"} customer request: ${esc(r.interest)}</h2>
    <p><b>Name:</b> ${esc(r.name)}<br><b>Contact:</b> ${esc(r.contact)}${wa ? ` (<a href="${wa}">WhatsApp</a>)` : ""}
    <br><b>Business:</b> ${esc(r.business || "-")}<br><b>Page:</b> ${esc(r.page || "-")}</p>
    <p><b>Summary:</b> ${esc(r.details)}</p>
    <hr><p><b>Conversation</b></p>${lines}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject: `${isNew ? "New" : "Updated"} website request: ${r.name} (${r.interest})`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}
