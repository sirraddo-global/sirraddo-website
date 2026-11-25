// The backup AI: a third AI service the owner adds in Admin → Settings → AI backup (no Netlify change needed).
// It answers only when Gemini and Claude can't (busy, out of quota, key refused, too slow), so customers never
// notice. Any OpenAI-compatible service works; the key is stored encrypted (like store Paystack keys) and is never
// sent back to the browser.
import { getMeta, setMeta } from "./store.mjs";
import { sealKey, openKey } from "./shop.mjs";

export const AI_SERVICES = {
  openrouter: { label: "OpenRouter (recommended)", base: "https://openrouter.ai/api/v1", model: "openai/gpt-4.1-mini", keys: "https://openrouter.ai/keys", note: "One key, models from many AI companies. Add a little credit (e.g. $5): as a backup it lasts a long time." },
  openai: { label: "OpenAI (ChatGPT)", base: "https://api.openai.com/v1", model: "gpt-4.1-mini", keys: "https://platform.openai.com/api-keys", note: "Add credit under Billing first." },
  groq: { label: "Groq (free plan, can't see photos)", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", keys: "https://console.groq.com/keys", note: "Free with limits. Text only: it can't look at photos customers send.", noImages: true },
  deepseek: { label: "DeepSeek (very cheap, can't see photos)", base: "https://api.deepseek.com/v1", model: "deepseek-chat", keys: "https://platform.deepseek.com/api_keys", note: "Text only.", noImages: true },
  custom: { label: "Other (OpenAI-compatible)", base: "", model: "", keys: "", note: "Any service with an OpenAI-style /chat/completions address." },
};

let cache = { at: 0, cfg: null };
// The saved settings with the key opened, cached for a minute (null when off or not set up).
export async function loadAiBackup(force = false) {
  if (!force && Date.now() - cache.at < 60_000) return cache.cfg;
  let cfg = null;
  try {
    const m = await getMeta(["ai_backup"]);
    const s = m.ai_backup ? JSON.parse(m.ai_backup) : null;
    if (s?.on && s.key && s.base && s.model) cfg = { ...s, key: openKey(s.key), noImages: Boolean(AI_SERVICES[s.service]?.noImages) };
  } catch (e) { console.error("AI backup settings unreadable", e.message); }
  cache = { at: Date.now(), cfg };
  return cfg;
}

// For the admin page: everything except the key itself.
export async function aiBackupStatus() {
  const m = await getMeta(["ai_backup", "ai_backup_used"]);
  const s = m.ai_backup ? JSON.parse(m.ai_backup) : {};
  const used = m.ai_backup_used ? JSON.parse(m.ai_backup_used) : {};
  return {
    services: Object.fromEntries(Object.entries(AI_SERVICES).map(([k, v]) => [k, { label: v.label, base: v.base, model: v.model, keys: v.keys, note: v.note }])),
    service: s.service || "openrouter", model: s.model || "", base: s.base || "", on: Boolean(s.on), hasKey: Boolean(s.key), keyEnd: s.keyEnd || "",
    savedAt: s.savedAt || null, used,
  };
}

export async function saveAiBackup(input) {
  const cur = await getMeta(["ai_backup"]).then((m) => (m.ai_backup ? JSON.parse(m.ai_backup) : {}));
  if (input.remove) { await setMeta("ai_backup", JSON.stringify({})); cache = { at: 0, cfg: null }; return aiBackupStatus(); }
  const service = AI_SERVICES[input.service] ? input.service : "openrouter";
  const def = AI_SERVICES[service];
  let base = String(input.base || def.base || "").trim().replace(/\/+$/, "").replace(/\/chat\/completions$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w./-]*)?$/i.test(base)) throw Object.assign(new Error("The service address must start with https://"), { status: 400 });
  const model = String(input.model || def.model || "").trim().slice(0, 120);
  if (!/^[\w./:@-]+$/.test(model)) throw Object.assign(new Error("Type the model name (e.g. " + (def.model || "gpt-4.1-mini") + ")."), { status: 400 });
  const out = { service, base, model, on: input.on !== false, key: cur.key || "", keyEnd: cur.keyEnd || "", savedAt: new Date().toISOString() };
  const key = String(input.key || "").trim();
  if (key) {
    if (key.length < 16 || /\s/.test(key)) throw Object.assign(new Error("That key doesn't look right. Copy the whole key again."), { status: 400 });
    out.key = sealKey(key); out.keyEnd = key.slice(-4);
  }
  if (!out.key) throw Object.assign(new Error("Paste the API key from " + def.label.replace(/ \(.*/, "") + "."), { status: 400 });
  await setMeta("ai_backup", JSON.stringify(out));
  cache = { at: 0, cfg: null };
  return aiBackupStatus();
}

// Counts how often the backup answered (and the last problem it had), shown in Settings → AI backup.
export async function noteBackup(ok, where, err) {
  try {
    const m = await getMeta(["ai_backup_used"]);
    const u = m.ai_backup_used ? JSON.parse(m.ai_backup_used) : {};
    const month = new Date().toISOString().slice(0, 7);
    if (u.month !== month) { u.month = month; u.count = 0; }
    if (ok) { u.count = (u.count || 0) + 1; u.lastAt = new Date().toISOString(); u.lastWhere = where; }
    else { u.lastError = String(err || "").slice(0, 200); u.lastErrorAt = new Date().toISOString(); }
    await setMeta("ai_backup_used", JSON.stringify(u));
  } catch { /* counting is best-effort */ }
}
