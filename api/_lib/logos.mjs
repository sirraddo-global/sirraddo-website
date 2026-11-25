// Logo ideas (admin → Design studio): the AI draws 3 simple, original logo concepts as SVG from a short brief.
// They are starting points the owner picks from and adjusts (name, tagline, colours) before sending as options.
// Every SVG is cleaned here: no scripts, links, external files or embedded pictures can get through.
import { pickProvider, friendlyAiError } from "./providers.mjs";

// Fonts every phone and computer has, so the logo looks the same when downloaded as a picture.
export const LOGO_FONTS = ["Arial", "Helvetica", "Verdana", "Trebuchet MS", "Tahoma", "Georgia", "Times New Roman", "Courier New", "Impact"];

const SYSTEM = `You are a senior brand designer for small Nigerian businesses. You draw ORIGINAL, simple, professional logos as clean SVG code.
Rules for every logo:
- viewBox="0 0 600 400", no width/height attributes, transparent background (no full-size background rect).
- A simple icon/mark made of basic shapes (circle, rect, path, polygon) PLUS the business name as <text>. Flat colours only; at most one linear gradient.
- The business name <text> element must have id="name"; an optional short tagline <text> must have id="tagline".
- Use ONLY these two colours (plus #FFFFFF if needed): PRIMARY and ACCENT, written exactly as given (lowercase hex).
- Fonts: font-family must be one of: ${LOGO_FONTS.join(", ")} (add a generic fallback like sans-serif or serif). Use font-weight for boldness.
- Each of the 3 must be clearly different: 1) icon on the left, name on the right; 2) icon above a centred name; 3) a badge/emblem or a monogram style.
- The icon should hint at what the business does (e.g. a cake for a bakery, a needle/thread for a tailor) but stay simple enough to read at small sizes.
- Never copy or resemble any existing brand's logo, mascot or famous symbol; no flags, coats of arms, religious symbols unless the brief asks, no letters from other brands.
- No <script>, <image>, <foreignObject>, <style>, external links, filters or masks. Keep each SVG under 2000 characters.
Reply with ONLY JSON, no other text: {"logos":[{"name":"short concept name","svg":"<svg ...>...</svg>"},{...},{...}]}`;

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "").trim()) ? String(v).trim().toLowerCase() : d);
const clip = (v, n) => String(v || "").replace(/[\r<>]/g, " ").trim().slice(0, n);

/** Keeps only safe SVG: basic shapes, text and gradients. Returns "" if it isn't a usable logo. */
export function cleanSvg(svg) {
  let s = String(svg || "").trim();
  const m = s.match(/<svg[\s\S]*<\/svg>/i);
  if (!m) return "";
  s = m[0];
  if (s.length > 6000) return "";
  // Anything that could run code, load a file or hide content is refused outright.
  if (/<\s*(script|foreignObject|image|iframe|use|style|a|animate|set|filter|mask)\b/i.test(s)) return "";
  if (/\son\w+\s*=|javascript:|data:|url\(\s*['"]?\s*(https?:|\/\/)|xlink:href|\shref\s*=/i.test(s)) return "";
  const allowed = /^(svg|g|path|circle|ellipse|rect|line|polyline|polygon|text|tspan|defs|lineargradient|radialgradient|stop|title)$/i;
  const tags = s.match(/<\s*\/?\s*([a-zA-Z][\w:-]*)/g) || [];
  if (tags.some((t) => !allowed.test(t.replace(/[<\/\s]/g, "")))) return "";
  if (!/id\s*=\s*["']name["']/.test(s)) return "";
  s = s.replace(/\s(width|height)\s*=\s*["'][^"']*["']/i, "");
  if (!/viewBox=/i.test(s)) s = s.replace(/<svg/i, '<svg viewBox="0 0 600 400"');
  if (!/xmlns=/i.test(s)) s = s.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}

/** 3 logo ideas: { ok, logos: [{ name, svg }], primary, accent } or { ok:false, error }. */
export async function logoIdeas(brief = {}, budgetMs = 24000) {
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI is set up yet (Admin → Settings → AI)." };
  const business = clip(brief.business, 40);
  if (business.length < 2) return { ok: false, error: "Type the business name first." };
  const primary = hex(brief.primary, "#13254f"), accent = hex(brief.accent, "#e8b230");
  const prompt = `Business name: ${business}
Tagline (optional, use it small or leave it out): ${clip(brief.tagline, 50) || "(none)"}
What they do / sell: ${clip(brief.what, 300) || "(not given: make a neutral, elegant mark from the initials)"}
Style they like: ${clip(brief.style, 200) || "modern, clean, trustworthy"}
PRIMARY: ${primary}
ACCENT: ${accent}
Draw the 3 logos now.`;
  const model = provider.name === "anthropic" ? process.env.ANTHROPIC_DESIGN_MODEL || "claude-haiku-5-5" : undefined;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt }]), SYSTEM, [], budgetMs, { maxTokens: 4500, attemptMs: budgetMs - 1500, model });
    const text = String(out.text || "");
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    let list = [];
    try { list = JSON.parse(json).logos || []; } catch { list = []; }
    const logos = list.map((l) => ({ name: clip(l?.name, 40) || "Logo idea", svg: cleanSvg(l?.svg) })).filter((l) => l.svg).slice(0, 3);
    if (!logos.length) return { ok: false, error: "The AI didn't return usable logos. Please try again." };
    return { ok: true, logos, primary, accent, by: out.provider || provider.name };
  } catch (err) {
    console.error("logo ideas failed", err.code, err.message);
    return { ok: false, error: friendlyAiError(err) };
  }
}

// Labels for flyer photos (Design studio → menu flyers): 1–3 words each, picked from the item list where one fits.
export async function photoLabels(images = [], items = [], budgetMs = 24000) {
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI is set up yet (Admin → Settings → Keys & connections)." };
  const pics = (Array.isArray(images) ? images : []).slice(0, 6).map((d) => String(d || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/))
    .filter((m) => m && m[2].length < 700000).map((m) => ({ mime: m[1], data: m[2] }));
  if (!pics.length) return { ok: false, error: "No photos to name." };
  const list = (Array.isArray(items) ? items : []).map((x) => clip(x, 40)).filter(Boolean).slice(0, 40);
  const prompt = `There are ${pics.length} photos, in order. For each one, give a short label (1-3 words, Title Case) naming the food or product it shows${list.length ? `. Use the closest name from this list when one fits, in its plural/natural form (e.g. "Cakes"): ${list.join(", ")}` : ""}. Never invent brand names. Reply with ONLY JSON: {"labels":["…", …]} with exactly ${pics.length} labels.`;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt, images: pics }]), "You label product photos for small-business flyers. Reply with JSON only.", [], budgetMs, { maxTokens: 300, attemptMs: budgetMs - 1500 });
    const t = String(out.text || ""); let labels = [];
    try { labels = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).labels || []; } catch { labels = []; }
    labels = labels.slice(0, pics.length).map((l) => clip(l, 24));
    if (!labels.length) return { ok: false, error: "The AI didn't return labels. Type them instead." };
    return { ok: true, labels };
  } catch (err) {
    console.error("photo labels failed", err.code, err.message);
    return { ok: false, error: friendlyAiError(err) };
  }
}

/** 3 catchy headline + short line pairs for a flyer/post, in plain Nigerian-business English. */
export async function headlineIdeas(brief = {}, budgetMs = 20000) {
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI is set up yet (Admin → Settings → Keys & connections)." };
  const b = { business: clip(brief.business, 80), what: clip(brief.what, 200), words: clip(brief.words, 600) };
  if (!b.words && !b.what) return { ok: false, error: "Write a few words first (the offer, or what the business sells)." };
  const prompt = `Business: ${b.business || "(not given)"}\nWhat they sell: ${b.what || "(see message)"}\nTheir message: ${b.words || "(none)"}\n\nWrite 3 different options for a flyer/WhatsApp post. Each has a HEADLINE (max 6 words, punchy, can use the offer like "20% OFF") and a LINE (max 12 words: the key detail, date or call to action). Keep every fact they gave (prices, dates, offer); never invent prices, dates, discounts or claims. Simple English Nigerians use; no slang that could offend; no other company names. Reply with ONLY JSON: {"ideas":[{"headline":"…","line":"…"},{…},{…}]}`;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt }]), "You write short, honest, catchy ad copy for small Nigerian businesses. Reply with JSON only.", [], budgetMs, { maxTokens: 400, attemptMs: budgetMs - 1500 });
    const t = String(out.text || ""); let ideas = [];
    try { ideas = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)).ideas || []; } catch { ideas = []; }
    ideas = ideas.slice(0, 3).map((x) => ({ headline: clip(x?.headline, 60), line: clip(x?.line, 110) })).filter((x) => x.headline);
    if (!ideas.length) return { ok: false, error: "The AI didn't return ideas. Try again." };
    return { ok: true, ideas };
  } catch (err) {
    console.error("headline ideas failed", err.code, err.message);
    return { ok: false, error: friendlyAiError(err) };
  }
}
