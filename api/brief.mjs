// /api/brief — the customer's project brief, opened with the private link from the admin page.
//   GET  ?t=TOKEN                       -> the questions for their package, saved answers and files
//   POST { t, answers, submit?, remove_file?: { field, url } }
// The token in the link is the only key, so it is long and random. No other login is needed.
import { getBrief, saveBrief, removeBriefFile, sendEmail, emailConfigured, esc } from "./_lib/store.mjs";
import { kindFor, KIND_LABEL, schemaFor, cleanAnswers, missingRequired, fileField } from "./_lib/brief-schema.mjs";

export const uploadsEnabled = () => Boolean(globalThis.__TEST_BLOB__ || process.env.BLOB_READ_WRITE_TOKEN);
const SITE = "https://sirraddo-website.vercel.app";

function publicView(row) {
  const kind = kindFor(row.interest);
  return {
    name: row.name,
    business: row.business,
    interest: row.interest,
    kind,
    kind_label: KIND_LABEL[kind],
    sections: schemaFor(kind),
    answers: row.brief || {},
    files: row.brief_files || {},
    saved_at: row.brief_saved_at,
    submitted_at: row.brief_submitted_at,
    uploads_enabled: uploadsEnabled(),
  };
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === "object" ? body : {};
}

async function notify(row, kind) {
  if (!emailConfigured()) return;
  const lines = [];
  for (const s of schemaFor(kind)) {
    lines.push(`<h3 style="margin:16px 0 6px">${esc(s.title)}</h3>`);
    for (const f of s.fields) {
      let v = f.type === "files" ? (row.brief_files?.[f.key] || []) : row.brief?.[f.key];
      if (f.type === "files") v = v.map((x) => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join(", ");
      else if (f.type === "rows") v = (v || []).map((r) => f.columns.map((c) => esc(r[c.key])).filter(Boolean).join(" · ")).join("<br>");
      else if (Array.isArray(v)) v = esc(v.join(", "));
      else if (f.type === "confirm") v = v ? "Yes" : "";
      else v = esc(v);
      if (v) lines.push(`<p style="margin:4px 0"><b>${esc(f.label)}</b><br>${v}</p>`);
    }
  }
  await sendEmail(
    `Project brief received: ${row.name} (${row.interest})`,
    `<h2 style="margin:0 0 8px">${esc(row.name)} sent their project brief</h2>
     <p>${esc(row.interest)} · ${esc(row.contact)}. The project is now marked <b>Building</b>.</p>
     ${lines.join("")}<p><a href="${SITE}/admin">Open the admin page</a></p>`
  );
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    if (req.method === "GET") {
      const row = await getBrief(String(query.t || ""));
      if (!row) return res.status(404).json({ error: "This link is not valid. Please ask us for a new one on WhatsApp." });
      return res.status(200).json(publicView(row));
    }
    if (req.method === "POST") {
      const body = readBody(req);
      const token = String(body.t || "");
      const row = await getBrief(token);
      if (!row) return res.status(404).json({ error: "This link is not valid. Please ask us for a new one on WhatsApp." });
      const kind = kindFor(row.interest);

      if (body.remove_file) {
        const field = String(body.remove_file.field || "");
        if (!fileField(kind, field)) return res.status(400).json({ error: "Unknown field" });
        const files = await removeBriefFile(token, field, String(body.remove_file.url || ""));
        return res.status(200).json({ files });
      }

      const answers = cleanAnswers(kind, body.answers);
      if (JSON.stringify(answers).length > 150_000) return res.status(413).json({ error: "That's too much text. Please shorten it or send it on WhatsApp." });
      if (body.submit) {
        const missing = missingRequired(kind, answers, row.brief_files);
        if (missing.length) return res.status(400).json({ error: "Please fill in: " + missing.join("; "), missing });
      }
      const saved = await saveBrief(token, answers, Boolean(body.submit));
      if (body.submit && saved) {
        try { await notify(saved, kind); } catch (err) { console.error("brief email failed", err); }
      }
      return res.status(200).json({ ok: true, saved_at: new Date().toISOString(), submitted_at: saved?.brief_submitted_at || null });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("brief failed", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
