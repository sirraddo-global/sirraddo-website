// POST /api/chat — the website assistant.
// Body: { sessionId, page, messages: [{ role: "user" | "assistant", content: "..." }] }
// Returns: { reply, saved }
import { SYSTEM_PROMPT, SAVE_TOOL } from "./_lib/knowledge.mjs";
import { saveRequest, emailRequest } from "./_lib/store.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_MESSAGES = 30; // per conversation
const MAX_CHARS = 1500; // per message
const FALLBACK =
  "Sorry, I can't answer right now. Please chat with our team on WhatsApp: https://wa.me/2348167550937";

// Simple per-IP limit (per server instance). Set a monthly spend limit in the Anthropic Console too.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 40;
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const msgs = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) continue;
    // The API needs alternating roles; merge repeats.
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n" + content;
    else msgs.push({ role: m.role, content });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

async function callClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system: SYSTEM_PROMPT, tools: [SAVE_TOOL], messages }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function handleSave(input, ctx) {
  const r = {
    sessionId: ctx.sessionId,
    page: ctx.page,
    transcript: ctx.transcript,
    name: str(input.name, 120),
    contact: str(input.contact, 120),
    business: str(input.business, 200),
    interest: str(input.interest, 60) || "Other",
    details: str(input.details, 2000),
  };
  if (!r.name || !(/\d{7,}/.test(r.contact.replace(/\D/g, "")) || /\S+@\S+\.\S+/.test(r.contact))) {
    return { ok: false, text: "Not saved: a name and a valid phone number or email are needed. Ask the visitor for them." };
  }
  let dbOk = null;
  let mailOk = null;
  let isNew = true;
  try {
    const inserted = await saveRequest(r);
    if (inserted !== null) { dbOk = true; isNew = inserted; }
  } catch (err) {
    dbOk = false;
    console.error("save failed", err);
  }
  try {
    mailOk = await emailRequest(r, isNew);
  } catch (err) {
    mailOk = false;
    console.error("email failed", err);
  }
  if (dbOk || mailOk) return { ok: true, text: "Saved. The team has the request and will follow up." };
  return {
    ok: false,
    text: "Saving failed. Apologise and ask the visitor to send their request on WhatsApp: https://wa.me/2348167550937",
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ reply: FALLBACK, saved: false });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (rateLimited(ip)) {
    return res.status(429).json({ reply: "You're sending messages too fast. Please wait a few minutes, or chat with us on WhatsApp: https://wa.me/2348167550937" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const messages = cleanMessages(body?.messages);
  if (!messages) return res.status(400).json({ error: "Invalid conversation" });

  const ctx = {
    sessionId: str(body.sessionId, 64) || `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    page: str(body.page, 200),
    transcript: messages,
  };

  try {
    const convo = [...messages];
    let saved = false;
    for (let step = 0; step < 3; step++) {
      const out = await callClaude(convo);
      const text = (out.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      const toolUses = (out.content || []).filter((b) => b.type === "tool_use");
      if (out.stop_reason !== "tool_use" || toolUses.length === 0) {
        return res.status(200).json({ reply: text || FALLBACK, saved });
      }
      const results = [];
      for (const t of toolUses) {
        const r = t.name === SAVE_TOOL.name ? await handleSave(t.input || {}, ctx) : { ok: false, text: "Unknown tool" };
        if (r.ok) saved = true;
        results.push({ type: "tool_result", tool_use_id: t.id, content: r.text, is_error: !r.ok });
      }
      convo.push({ role: "assistant", content: out.content });
      convo.push({ role: "user", content: results });
    }
    return res.status(200).json({ reply: FALLBACK, saved });
  } catch (err) {
    console.error("chat failed", err);
    return res.status(200).json({ reply: FALLBACK, saved: false });
  }
}
