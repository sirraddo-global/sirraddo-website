// POST /api/chat — the website assistant.
// Body: { sessionId, page, messages: [{ role: "user" | "assistant", content: "..." }] }
// Returns: { reply, saved }
import { FUNCTION_BUDGET_MS } from "./_lib/platform.mjs";
import { SYSTEM_PROMPT, SAVE_TOOL, QUESTION_TOOL } from "./_lib/knowledge.mjs";
import { saveRequest, emailRequest, logChat, addUnanswered, reference } from "./_lib/store.mjs";
import { chatProviders, CHAT_MODELS } from "./_lib/providers.mjs";
import { acknowledgeLead } from "./_lib/automation.mjs";
import { cleanIdeas } from "./_lib/ideas.mjs";

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

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function handleSave(input, ctx) {
  const r = {
    sessionId: ctx.sessionId,
    page: ctx.page,
    transcript: ctx.transcript,
    name: str(input.name, 120),
    contact: str(input.contact, 120),
    business: str(input.business, 200),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(input.email, 200)) ? str(input.email, 200).toLowerCase() : null,
    interest: str(input.interest, 60) || "Other",
    details: str(input.details, 2000),
    ideas: cleanIdeas({ ...(input.ideas || {}), recommended: input.recommended }),
  };
  if (!r.name || !(/\d{7,}/.test(r.contact.replace(/\D/g, "")) || /\S+@\S+\.\S+/.test(r.contact))) {
    return { ok: false, text: "Not saved: a name and a valid phone number or email are needed. Ask the visitor for them." };
  }
  let dbOk = null;
  let mailOk = null;
  let isNew = true;
  try {
    const saved = await saveRequest(r);
    if (saved) {
      dbOk = true; isNew = saved.inserted; r.ref = reference(saved.id);
      if (saved.inserted && r.email) await acknowledgeLead({ ...r, id: saved.id, auto_sent: {} });
    }
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

async function handleQuestion(input, ctx) {
  const question = str(input.question, 500);
  if (!question) return { ok: false, text: "No question given." };
  try {
    await addUnanswered(ctx.sessionId, question);
  } catch (err) {
    console.error("question save failed", err);
  }
  // Tell the model it worked either way: the visitor's reply doesn't depend on it.
  return { ok: true, text: "Noted for the team. Tell the visitor the team will confirm on WhatsApp." };
}

// Keep the conversation (with the reply) for the admin page. Never blocks or breaks the reply.
async function record(ctx, reply, fallback, leadSaved) {
  try {
    await logChat({
      sessionId: ctx.sessionId,
      page: ctx.page,
      messages: [...ctx.transcript, { role: "assistant", content: reply }],
      fallback,
      leadSaved,
    });
  } catch (err) {
    console.error("chat log failed", err);
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const providers = chatProviders();
  if (!providers.length) return res.status(200).json({ reply: FALLBACK, saved: false });

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

  const deadline = Date.now() + FUNCTION_BUDGET_MS() - 4000; // stay under the host's time limit
  let saved = false;
  let lastErr = null;
  // Cheapest first; if it fails, the next one answers (saving is safe to repeat: same chat, same request).
  for (const provider of providers) {
    try {
      const opts = { maxTokens: 600, models: provider.name === "gemini" ? CHAT_MODELS.gemini : undefined, model: provider.name === "anthropic" ? CHAT_MODELS.anthropic : undefined };
      const convo = provider.start(messages);
      for (let step = 0; step < 3; step++) {
        const left = deadline - Date.now();
        if (left < 5000) throw Object.assign(new Error("Out of time"), { code: "timeout" });
        const out = await provider.call(convo, SYSTEM_PROMPT, [SAVE_TOOL, QUESTION_TOOL], Math.min(25000, left), opts);
        if (out.toolCalls.length === 0) {
          await record(ctx, out.text || FALLBACK, !out.text, saved);
          return res.status(200).json({ reply: out.text || FALLBACK, saved });
        }
        const results = [];
        for (const t of out.toolCalls) {
          const r =
            t.name === SAVE_TOOL.name ? await handleSave(t.input, ctx)
            : t.name === QUESTION_TOOL.name ? await handleQuestion(t.input, ctx)
            : { ok: false, text: "Unknown tool" };
          if (r.ok && t.name === SAVE_TOOL.name) saved = true;
          results.push({ id: t.id, name: t.name, ok: r.ok, text: r.text });
        }
        provider.addToolResults(convo, out.raw, results);
      }
      await record(ctx, FALLBACK, true, saved);
      return res.status(200).json({ reply: FALLBACK, saved });
    } catch (err) {
      console.error(`chat failed (${provider.name})`, err.code || "", err.message);
      lastErr = err;
      if (deadline - Date.now() < 8000) break;
    }
  }
  await record(ctx, FALLBACK, true, saved);
  // A short code (e.g. "gemini_429", "timeout") helps diagnose problems; it holds no secrets.
  return res.status(200).json({ reply: FALLBACK, saved, error: lastErr?.code || "error" });
}
