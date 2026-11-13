// "Request a change": after launch, customers send edits (with photos) from their private link /change?t=TOKEN.
// The first month after going live is free (as the packages promise); later requests are marked "paid" so you can quote.
import { q, ensureSchema, getRequest, ensureLinkToken, sendEmail, emailConfigured, sendCustomerEmail, customerEmailConfigured, customerEmail, reference, esc } from "./store.mjs";
import { customerHtml, SITE } from "./automation.mjs";

export const FREE_CHANGE_DAYS = 30;
export const MAX_CHANGE_FILES = 3;

export function freeUntil(r) {
  if (!r.live_on) return null;
  const d = new Date(r.live_on + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + FREE_CHANGE_DAYS);
  return d.toISOString().slice(0, 10);
}
export const isFree = (r, today = new Date().toISOString().slice(0, 10)) => !r.live_on || today <= freeUntil(r);

export async function changeLink(id) {
  return `${SITE}/change?t=${encodeURIComponent(await ensureLinkToken(id))}`;
}

export async function listChanges(id, limit = 20) {
  await ensureSchema();
  return q(`SELECT id, body, files, free, status, note, created_at, done_at FROM change_requests WHERE request_id = $1 ORDER BY created_at DESC LIMIT $2`, [id, limit]);
}
export async function openChangeCounts() {
  await ensureSchema();
  const rows = await q(`SELECT c.request_id, count(*)::int AS n, min(c.created_at) AS oldest, r.name, r.business
    FROM change_requests c JOIN customer_requests r ON r.id = c.request_id WHERE c.status = 'open' GROUP BY c.request_id, r.name, r.business ORDER BY oldest`, []);
  return rows;
}

export async function addChange(r, body, files) {
  const text = String(body || "").trim().slice(0, 4000);
  if (text.length < 3) throw Object.assign(new Error("Please describe the change you'd like."), { status: 400 });
  const clean = (Array.isArray(files) ? files : []).filter((f) => f && (/^https:\/\/[\w.-]+\.blob\.vercel-storage\.com\//.test(f.url || "") || (globalThis.__TEST_BLOB__ && /^http:\/\/localhost/.test(f.url || "")))).slice(0, MAX_CHANGE_FILES)
    .map((f) => ({ url: String(f.url), name: String(f.name || "file").slice(0, 80) }));
  const recent = await q(`SELECT count(*)::int AS n FROM change_requests WHERE request_id = $1 AND created_at > now() - interval '1 day'`, [r.id]);
  if (recent[0].n >= 10) throw Object.assign(new Error("You've sent a lot of requests today. Please message us on WhatsApp."), { status: 429 });
  const free = isFree(r);
  const rows = await q(`INSERT INTO change_requests (request_id, body, files, free) VALUES ($1, $2, $3::jsonb, $4) RETURNING *`, [r.id, text, JSON.stringify(clean), free]);
  const c = rows[0];
  const who = r.brief?.business_name || r.business || r.name;
  if (emailConfigured()) {
    await sendEmail(`✏️ Change request from ${who} (${reference(r.id)})${free ? "" : " · outside free month"}`,
      `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5"><p><b>${esc(who)}</b> asked for a change to their website${r.website_url ? ` (<a href="${esc(r.website_url)}">${esc(r.website_url)}</a>)` : ""}:</p>
<blockquote style="border-left:3px solid #D9A21B;margin:0;padding:4px 12px;white-space:pre-wrap">${esc(text)}</blockquote>
${clean.length ? `<p>Files: ${clean.map((f) => `<a href="${esc(f.url)}">${esc(f.name)}</a>`).join(" · ")}</p>` : ""}
<p>${free ? "This is within their free month of changes." : "Their free month has ended, so you can quote for this (or do it as goodwill)."}</p>
<p><a href="${SITE}/admin">Open admin</a> → Clients → ${esc(who)} → Change requests. Make the edit, tap <b>Update live site</b>, then <b>Mark done</b> (the customer gets an email).</p></div>`).catch((e) => console.error("change email failed", e));
  }
  const to = customerEmail(r);
  if (to && customerEmailConfigured()) {
    await sendCustomerEmail(to, "We received your change request", customerHtml(r, [
      `Thanks, we've got your request: <i>"${esc(text.length > 200 ? text.slice(0, 200) + "…" : text)}"</i>`,
      free ? "It's included in your free month of changes. We'll email you as soon as it's live (usually within 2 working days)."
        : "Your free month of changes has ended, so we'll reply with a small quote before we start. Most text and photo updates are quick.",
    ])).catch((e) => console.error("change confirmation failed", e));
  }
  return c;
}

export async function markChange(id, changeId, { done, note }) {
  await ensureSchema();
  const rows = await q(`UPDATE change_requests SET status = $1, note = COALESCE($2, note), done_at = CASE WHEN $1 = 'done' THEN now() ELSE NULL END
    WHERE id = $3 AND request_id = $4 RETURNING *`, [done ? "done" : "open", note ? String(note).slice(0, 1000) : null, changeId, id]);
  const c = rows[0];
  if (!c) return null;
  if (done) {
    const r = await getRequest(id);
    const to = r && customerEmail(r);
    if (to && customerEmailConfigured()) {
      await sendCustomerEmail(to, "Your website change is live", customerHtml(r, [
        `The change you asked for is now on your website: <i>"${esc(c.body.length > 200 ? c.body.slice(0, 200) + "…" : c.body)}"</i>`,
        c.note ? esc(c.note) : "Please have a look (you may need to refresh the page).",
        `Need anything else changed? Use your <a href="${await changeLink(id)}">change request link</a>.`,
      ], r.website_url ? { url: r.website_url, label: "View your website" } : null)).catch((e) => console.error("change done email failed", e));
    }
  }
  return c;
}
