// AI providers for the website assistant. Choose with AI_PROVIDER = "anthropic" or "gemini".
// If AI_PROVIDER is not set, Anthropic is used when ANTHROPIC_API_KEY exists, otherwise Gemini.
//
// Each provider exposes:
//   start(messages)                 -> provider-specific conversation
//   call(convo, system, tools, ms, opts) -> { text, toolCalls: [{ id, name, input }], raw }
//     tools may be [] (plain text); opts.maxTokens sets the reply length (default: a chat reply)
//   addToolResults(convo, raw, results: [{ id, name, ok, text }])

// Fetch with a time limit, so the chat answers before the host's own time limit.
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
  async call(convo, system, tools, ms = 20000, opts = {}) {
    const res = await timedFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model || process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: opts.maxTokens || 700,
        system,
        ...(tools.length ? { tools } : {}),
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
  async call(convo, system, tools, ms = 20000, opts = {}) {
    // Models to try in order. If one is busy (503), rate-limited (429) or gone (404), try the next.
    // Override with GEMINI_MODEL (a model name or a comma-separated list).
    const models = (opts.models || process.env.GEMINI_MODEL || "gemini-flash-lite-latest,gemini-flash-latest")
      .split(",").map((m) => m.trim()).filter(Boolean);
    // Within one reply, keep using the model that answered first (its thought signatures must match).
    if (convo._model) models.unshift(...models.splice(models.indexOf(convo._model), 1));
    const deadline = Date.now() + ms;
    const base = {
      systemInstruction: { parts: [{ text: system }] },
      contents: convo,
      ...(tools.length ? { tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema })) }] } : {}),
    };
    const send = (model, generationConfig) =>
      timedFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ ...base, generationConfig }),
        },
        Math.max(3000, Math.min(opts.attemptMs || 15000, deadline - Date.now()))
      );
    let res;
    let lastErr;
    const trace = []; // e.g. "gemini-flash-latest:503@1s", returned in the error code for diagnosis
    // Long jobs (website text, designs): if every model is busy, wait a moment and go round once more.
    const rounds = (opts.attemptMs || 0) >= 30000 ? [...models, ...models] : models;
    for (let i = 0; i < rounds.length; i++) {
      const model = rounds[i];
      if (deadline - Date.now() < 4000) break;
      if (i === models.length) await new Promise((r) => setTimeout(r, 2500));
      const t0 = Date.now();
      try {
      // Gemini 3 models think at "high" by default, which is slow for a chat. Ask for "minimal";
      // older models don't accept thinkingLevel, so retry without it if refused.
      // Thinking tokens count towards maxOutputTokens, so leave room above the visible reply.
      const maxOutputTokens = Math.max(4096, (opts.maxTokens || 0) + 2048);
      res = await send(model, { maxOutputTokens, thinkingConfig: { thinkingLevel: "minimal" } });
      if (res.status === 400) {
        const body = await res.text();
        if (!/thinking/i.test(body)) throw httpError("gemini", 400, body);
        res = await send(model, { maxOutputTokens });
      }
      } catch (err) {
        if (err.code !== "timeout") throw err;
        trace.push(`${model}:timeout@${Math.round((Date.now() - t0) / 1000)}s`);
        lastErr = err;
        res = null;
        continue;
      }
      if (res.ok) {
        Object.defineProperty(convo, "_model", { value: model, writable: true, enumerable: false });
        break;
      }
      trace.push(`${model}:${res.status}@${Math.round((Date.now() - t0) / 1000)}s`);
      lastErr = httpError("gemini", res.status, await res.text());
      if (![429, 404, 500, 503].includes(res.status)) {
        lastErr.code += ` [${trace.join(", ")}]`;
        throw lastErr;
      }
      console.warn(`Gemini model ${model} unavailable (${res.status}), trying next`);
      res = null;
    }
    if (!res) {
      const err = lastErr || Object.assign(new Error("AI request timed out"), { code: "timeout" });
      err.code = `${err.code} [${trace.join(", ")}]`;
      console.error("Gemini failed:", err.message);
      throw err;
    }
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

// A short, plain message for admin when the AI fails.
export function friendlyAiError(err) {
  const m = String(err?.code || "") + " " + String(err?.message || "");
  if (/timeout/i.test(m)) return "The AI took too long. Please try again.";
  if (/_(503|500)|\b503\b|overloaded|high demand|UNAVAILABLE/i.test(m)) return "The AI service is busy right now (this happens at peak times). Please wait a minute and try again.";
  if (/_429|\b429\b|quota|rate/i.test(m)) return "The AI's free limit was reached for now. Please try again in a few minutes.";
  if (/_40[13]|API key|permission/i.test(m)) return "The AI key in Netlify isn't working. Check GEMINI_API_KEY / ANTHROPIC_API_KEY.";
  return "The AI couldn't finish this time. Please try again.";
}

// The customer chat on the website: the cheapest option first. Gemini's free Flash-Lite model, then Claude Haiku
// (the cheapest Claude) only if Gemini isn't set up or fails. Override with CHAT_PROVIDER = "anthropic" | "gemini".
export function chatProviders() {
  const wanted = (process.env.CHAT_PROVIDER || "").trim().toLowerCase();
  const order = wanted === "anthropic" ? [anthropic, gemini] : [gemini, anthropic];
  return order.filter((p) => p.configured());
}
export const CHAT_MODELS = { gemini: process.env.CHAT_GEMINI_MODEL || "gemini-flash-lite-latest,gemini-flash-latest", anthropic: process.env.CHAT_ANTHROPIC_MODEL || "claude-haiku-5-5" };

export function pickProvider() {
  const wanted = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (wanted) return PROVIDERS[wanted]?.configured() ? PROVIDERS[wanted] : null;
  if (anthropic.configured() && gemini.configured()) return withBackup(anthropic, gemini);
  if (anthropic.configured()) return anthropic;
  if (gemini.configured()) return gemini;
  return null;
}

// For one-off jobs (admin assistant, website text, designs): if the first AI's key is wrong or not allowed
// (401/403), answer with the other one instead of failing. The reply says which one answered (out.provider).
function withBackup(first, backup) {
  return {
    name: first.name,
    configured: () => true,
    start: (messages) => ({ messages }),
    async call(convo, system, tools, ms, opts = {}) {
      try {
        return { ...(await first.call(first.start(convo.messages), system, tools, ms, opts)), provider: first.name };
      } catch (err) {
        if (!/_40[13]$/.test(String(err.code || ""))) throw err;
        console.error(`${first.name} key refused (${err.code}); using ${backup.name} instead. Fix or remove the ${first.name.toUpperCase()}_API_KEY setting.`);
        return { ...(await backup.call(backup.start(convo.messages), system, tools, ms, { ...opts, model: undefined })), provider: backup.name };
      }
    },
  };
}
