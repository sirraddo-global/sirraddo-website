// AI providers for the website assistant. Choose with AI_PROVIDER = "anthropic" or "gemini".
// If AI_PROVIDER is not set, Anthropic is used when ANTHROPIC_API_KEY exists, otherwise Gemini.
//
// Each provider exposes:
//   start(messages)                 -> provider-specific conversation
//   call(convo, system, tool)       -> { text, toolCalls: [{ id, name, input }], raw }
//   addToolResults(convo, raw, results: [{ id, name, ok, text }])

// Fetch with a time limit, so the chat answers before Vercel's own time limit.
async function timedFetch(url, opts, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (err) {
    if (err.name === "AbortError") throw Object.assign(new Error("AI request timed out"), { code: "timeout" });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function httpError(provider, status, body) {
  return Object.assign(new Error(`${provider} ${status}: ${body.slice(0, 300)}`), { code: `${provider}_${status}` });
}

const anthropic = {
  name: "anthropic",
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  start: (messages) => messages.map((m) => ({ role: m.role, content: m.content })),
  async call(convo, system, tool, ms = 20000) {
    const res = await timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 700,
        system,
        tools: [tool],
        messages: convo,
      }),
    }, ms);
    if (!res.ok) throw httpError("anthropic", res.status, await res.text());
    const out = await res.json();
    const blocks = out.content || [];
    return {
      text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim(),
      toolCalls:
        out.stop_reason === "tool_use"
          ? blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, input: b.input || {} }))
          : [],
      raw: blocks,
    };
  },
  addToolResults(convo, raw, results) {
    convo.push({ role: "assistant", content: raw });
    convo.push({
      role: "user",
      content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.text, is_error: !r.ok })),
    });
  },
};

const gemini = {
  name: "gemini",
  configured: () => Boolean(process.env.GEMINI_API_KEY),
  start: (messages) =>
    messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
  async call(convo, system, tool, ms = 20000) {
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const base = {
      systemInstruction: { parts: [{ text: system }] },
      contents: convo,
      tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parameters: tool.input_schema }] }],
    };
    const deadline = Date.now() + ms;
    const send = (generationConfig) =>
      timedFetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, generationConfig }),
      }, Math.max(3000, deadline - Date.now()));
    // Gemini 3 models think at "high" by default, which is slow for a chat. Ask for "low".
    // Older models don't accept thinkingLevel; if refused, retry without it.
    // Thinking tokens count towards maxOutputTokens, so leave room above the visible reply.
    let res = await send({ maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "low" } });
    if (res.status === 400) {
      const body = await res.text();
      if (!/thinking/i.test(body)) throw httpError("gemini", 400, body);
      res = await send({ maxOutputTokens: 4096 });
    }
    if (!res.ok) throw httpError("gemini", res.status, await res.text());
    const out = await res.json();
    const content = out.candidates?.[0]?.content || { role: "model", parts: [] };
    const parts = content.parts || [];
    return {
      text: parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim(),
      toolCalls: parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({ id: p.functionCall.id || `call-${i}`, name: p.functionCall.name, input: p.functionCall.args || {} })),
      raw: content,
    };
  },
  addToolResults(convo, raw, results) {
    // Send the model's turn back unchanged: it carries the thought signatures Gemini needs.
    convo.push({ role: "model", parts: raw.parts || [] });
    convo.push({
      role: "user",
      parts: results.map((r) => ({
        functionResponse: {
          ...(r.id && !r.id.startsWith("call-") ? { id: r.id } : {}),
          name: r.name,
          response: r.ok ? { result: r.text } : { error: r.text },
        },
      })),
    });
  },
};

const PROVIDERS = { anthropic, gemini };

export function pickProvider() {
  const wanted = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (wanted) return PROVIDERS[wanted]?.configured() ? PROVIDERS[wanted] : null;
  if (anthropic.configured()) return anthropic;
  if (gemini.configured()) return gemini;
  return null;
}
