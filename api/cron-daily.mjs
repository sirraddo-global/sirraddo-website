// GET /api/cron-daily — run by Vercel Cron every morning (see vercel.json).
// Emails a summary of new requests, overdue follow-ups, renewals due in the next 30 days and
// new unanswered questions, then deletes conversations older than 90 days.
// Vercel sends "Authorization: Bearer <CRON_SECRET>" when the CRON_SECRET variable is set.
import { timingSafeEqual, createHash } from "node:crypto";
import { dbConfigured, digestData, cleanup, sendEmail, emailConfigured, esc, waLink } from "./_lib/store.mjs";

const SITE = "https://sirraddo-website.vercel.app";

function authorised(req) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

const naira = (n) => (n == null ? "-" : "₦" + Number(n).toLocaleString("en-NG"));
const daysFromToday = (d) => {
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + "T00:00:00") - today) / 86400000);
};

function contactLink(r) {
  const wa = waLink(r.contact);
  return wa ? `<a href="${wa}">${esc(r.contact)}</a>` : esc(r.contact);
}

export function buildDigest({ fresh, overdue, renewals, questions, briefs = [] }) {
  const sections = [];
  if (fresh.length) {
    sections.push(`<h3>New requests (${fresh.length})</h3><ul>${fresh
      .map((r) => `<li><b>${esc(r.name)}</b>: ${esc(r.interest)}, ${contactLink(r)}<br><small>${esc(r.details)}</small></li>`)
      .join("")}</ul>`);
  }
  if (overdue.length) {
    sections.push(`<h3>Follow-ups due (${overdue.length})</h3><ul>${overdue
      .map((r) => {
        const d = daysFromToday(r.follow_up_on);
        return `<li><b>${esc(r.name)}</b> (${esc(r.status)}), ${contactLink(r)}: ${d === 0 ? "today" : `${-d} day(s) overdue`}</li>`;
      })
      .join("")}</ul>`);
  }
  if (renewals.length) {
    sections.push(`<h3>Renewals due in the next 30 days (${renewals.length})</h3><ul>${renewals
      .map((r) => {
        const d = daysFromToday(r.renewal_due);
        const when = d < 0 ? `<b style="color:#B42318">${-d} day(s) overdue</b>` : d === 0 ? "<b>today</b>" : `in ${d} day(s)`;
        return `<li><b>${esc(r.name)}</b>: ${naira(r.renewal_amount)} due ${esc(r.renewal_due)} (${when}), ${contactLink(r)}</li>`;
      })
      .join("")}</ul>`);
  }
  if (briefs.length) {
    sections.push(`<h3>Project briefs received (${briefs.length})</h3><ul>${briefs
      .map((r) => `<li><b>${esc(r.name)}</b>: ${esc(r.interest)}, ${contactLink(r)}. Ready to build.</li>`)
      .join("")}</ul>`);
  }
  if (questions.length) {
    sections.push(`<h3>Questions the assistant couldn't answer (${questions.length})</h3><ul>${questions
      .map((x) => `<li>${esc(x.question)}</li>`)
      .join("")}</ul>`);
  }
  if (!sections.length) return null;
  return `<h2 style="margin:0 0 8px">SIRRADDO daily summary</h2>${sections.join("")}
    <p><a href="${SITE}/admin">Open the admin page</a></p>`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  if (!dbConfigured()) return res.status(503).json({ error: "DATABASE_URL is not set" });
  try {
    const data = await digestData();
    const html = buildDigest(data);
    let emailed = false;
    if (html && emailConfigured()) {
      const parts = [];
      if (data.fresh.length) parts.push(`${data.fresh.length} new`);
      if (data.overdue.length) parts.push(`${data.overdue.length} follow-up`);
      if (data.renewals.length) parts.push(`${data.renewals.length} renewal`);
      if (data.questions.length) parts.push(`${data.questions.length} question`);
      if (data.briefs.length) parts.push(`${data.briefs.length} brief`);
      emailed = Boolean(await sendEmail(`SIRRADDO daily summary: ${parts.join(", ")}`, html));
    }
    const removed = await cleanup(90);
    return res.status(200).json({
      emailed,
      counts: { fresh: data.fresh.length, overdue: data.overdue.length, renewals: data.renewals.length, questions: data.questions.length, briefs: data.briefs.length },
      removed,
    });
  } catch (err) {
    console.error("daily cron failed", err);
    return res.status(500).json({ error: "Daily job failed" });
  }
}
