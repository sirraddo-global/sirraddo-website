// AI providers for the website assistant. Choose with AI_PROVIDER = "anthropic" or "gemini".
// If AI_PROVIDER is not set, Anthropic is used when ANTHROPIC_API_KEY exists, otherwise Gemini.
//
// Each provider exposes:
//   start(messages)                 -> provider-specific conversation
//   call(convo, system, tool)       -> { text, toolCalls: [{ id, name, input }], raw }
//   addToolResults(convo, raw, results: [{ id, name, ok, text }])

const anthropic = {
  name: "anthropic",
  configured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  start: (messages) => messages.map((m) => ({ role: m.role, content: m.content })),
  async call(convo, system, tool) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
  async call(convo, system, tool) {
    const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: convo,
          tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parameters: tool.input_schema }] }],
          // Thinking tokens count towards this limit, so leave room above the ~700 tokens of visible reply.
          generationConfig: { maxOutputTokens: 4096 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
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
