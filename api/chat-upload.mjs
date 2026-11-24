// POST /api/chat-upload?s=SESSION&name=photo.jpg&type=image/jpeg — a picture or PDF sent in the website chat.
// Body: the file itself (photos are shrunk in the browser first). Returns { url, name, type }.
// Limits: 4 MB, photos (JPG/PNG/WebP) or PDF, 5 per chat, 10 per hour per visitor.
import { putFile, filesEnabled } from "./_lib/platform.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const byIp = new Map();
const bySession = new Map();
function limited(map, key, max, windowMs) {
  const now = Date.now();
  const list = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return true;
  list.push(now);
  map.set(key, list);
  if (map.size > 5000) map.clear();
  return false;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  if (!filesEnabled()) return res.status(503).json({ error: "Sending files isn't available right now. Please send it on WhatsApp." });
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const session = String(query.s || "").replace(/[^\w-]/g, "").slice(0, 64);
  const type = String(query.type || "");
  if (!session) return res.status(400).json({ error: "Missing chat" });
  if (!TYPES.includes(type)) return res.status(415).json({ error: "Please send a photo (JPG or PNG) or a PDF." });
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(byIp, ip, 12, 60 * 60 * 1000) || limited(bySession, session, 7, 24 * 60 * 60 * 1000)) {
    return res.status(429).json({ error: "That's the most files for now. Please send more on WhatsApp: https://wa.me/2348167550937" });
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BYTES) return res.status(413).json({ error: "That file is too big (max 4 MB). Please send it on WhatsApp." });
      chunks.push(c);
    }
    const body = Buffer.concat(chunks);
    if (!body.length) return res.status(400).json({ error: "Empty file" });
    const name = String(query.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 60) || "file";
    // Stored by month, so the daily clean-up can delete them with the chat after 90 days.
    const { url } = await putFile(`chats/${new Date().toISOString().slice(0, 7)}/${session}/${name}`, body, { contentType: type });
    return res.status(200).json({ url, name, type });
  } catch (err) {
    console.error("chat upload failed", err);
    return res.status(500).json({ error: "Sending failed. Please try again, or send it on WhatsApp." });
  }
}
