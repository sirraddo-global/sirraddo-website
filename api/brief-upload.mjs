// POST /api/brief-upload?t=TOKEN&field=photos&name=shop.jpg&type=image/jpeg
// Body: the file itself (application/octet-stream). Stored with putFile (Netlify Blobs; Vercel Blob if BLOB_READ_WRITE_TOKEN is set).
// Images are resized in the browser first, so uploads stay well under Vercel's 4.5 MB request limit.
import { putFile } from "./_lib/platform.mjs";
import { getBrief, addBriefFile } from "./_lib/store.mjs";
import { kindFor, fileField } from "./_lib/brief-schema.mjs";
import { uploadsEnabled } from "./brief.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "application/pdf"];

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("too big"), { tooBig: true });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!uploadsEnabled()) return res.status(503).json({ error: "Uploads are not available. Please send your files on WhatsApp." });
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    const token = String(query.t || "");
    const row = await getBrief(token);
    if (!row) return res.status(404).json({ error: "This link is not valid." });
    const field = fileField(kindFor(row.interest), String(query.field || ""));
    if (!field) return res.status(400).json({ error: "Unknown field" });
    const type = String(query.type || "");
    if (!TYPES.includes(type)) return res.status(415).json({ error: "Please upload a photo (JPG, PNG) or a PDF." });
    const have = (row.brief_files?.[field.key] || []).length;
    if (have >= field.max) return res.status(409).json({ error: `You can upload up to ${field.max} file(s) here.` });

    const body = await readRaw(req);
    if (!body.length) return res.status(400).json({ error: "Empty file" });
    const name = String(query.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";
    const blob = await putFile(`briefs/${row.id}/${field.key}/${name}`, body, { contentType: type });
    const files = await addBriefFile(token, field.key, { url: blob.url, name, size: body.length, type }, field.max);
    if (!files) return res.status(409).json({ error: `You can upload up to ${field.max} file(s) here.` });
    return res.status(200).json({ files });
  } catch (err) {
    if (err.tooBig) return res.status(413).json({ error: "That file is too big (max 4 MB). Please send it on WhatsApp." });
    console.error("upload failed", err);
    return res.status(500).json({ error: "Upload failed. Please try again." });
  }
}
