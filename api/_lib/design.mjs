// "AI design": a custom look for a customer's website. The AI writes CSS only, for the HTML our generator
// already produces, so the checked text, prices and photos can't change. Uses Claude when ANTHROPIC_API_KEY
// is set (model: ANTHROPIC_DESIGN_MODEL, default claude-haiku-5-5), otherwise Gemini.
import { randomBytes } from "node:crypto";
import { getPreviewById, saveDesign, setDesignOptions, MAX_DESIGN_OPTIONS } from "./store.mjs";
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { buildSiteModel, renderPage, css as baseCss, darkDesignCss } from "./sitegen.mjs";

const SYSTEM = `You are a senior web designer for small Nigerian businesses. You restyle an existing website by writing CSS only.
Rules:
- Reply with one \`\`\`css code block and nothing else.
- Start the CSS with a comment naming at most 2 Google Fonts you use, exactly like: /* fonts: Playfair Display, Inter */ (or /* fonts: none */). Don't use @import.
- No url() at all (no background images, no external files). Use colours, gradients, borders, shadows, shapes (::before/::after), spacing and typography.
- Your CSS is added after the existing CSS, so override what you need. Keep the HTML class names; don't rely on classes that aren't in the HTML.
- Mobile first: it must look great at 360px wide, then at desktop. Keep the header menu usable (it wraps on small screens).
- Text must stay readable: strong contrast (WCAG AA), body text at least 16px. Never hide content, navigation, prices, the WhatsApp button (.wa) or the "to be added" marks (mark.todo).
- Use the brand colours and style from the brief. Make it look distinctive and premium for this kind of business, not like a generic template.
- Respect @media (prefers-reduced-motion: reduce) if you add any animation; keep animations subtle.
- Don't style anything starting with .pv (the preview approval panel).
- Keep it under 300 lines.`;

function prompt(row, site) {
  const b = row.brief || {};
  const home = site.pages.find((p) => p.slug === "index") || site.pages[0];
  let html = renderPage({ ...site, designCss: "" }, home.slug, { mode: "export", link: (s) => `${s}.html`, img: () => "photo.jpg" });
  html = html.replace(/<style>[\s\S]*?<\/style>/, "<style>/* base CSS below */</style>").replace(/\n{2,}/g, "\n").slice(0, 14000);
  const other = site.pages.filter((p) => p !== home).map((p) => `${p.name} (${p.kind})`).join(", ");
  return `Business: ${site.name}${site.tagline ? " — " + site.tagline : ""}
Package: ${row.interest}
What they do: ${String(b.description || b.what_they_do || row.business || "").slice(0, 600)}
Style they chose: ${b.style || "not given"}
Brand colours they gave: ${b.colours || "not given"} (current theme: primary ${site.theme.primary}, accent ${site.theme.accent})
Has a logo image: ${site.logo ? "yes" : "no"} · Photos: ${site.photos.length} · Services: ${site.services.length} · Products: ${site.products.length}
Other pages using the same layout: ${other || "none"} (body has class page-<kind>, e.g. page-gallery, page-contact; non-home pages start with .page-head)

The home page HTML (the other pages use the same header, footer, .block sections, .cards, .gallery, .contact and .cta):
${html}

The base CSS it already has:
${baseCss(site.theme)}

Write the CSS that gives this business a custom, high-quality look.`;
}

// Keep only safe CSS: no way to load files, run code or break out of the <style> tag.
export function cleanCss(text) {
  const m = String(text || "").match(/```(?:css)?\s*([\s\S]*?)```/i);
  let c = (m ? m[1] : String(text || "")).trim();
  c = c.replace(/<\/?\s*style[^>]*>/gi, "").replace(/</g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(").replace(/javascript:/gi, "").replace(/behavior\s*:/gi, "x:").replace(/-moz-binding/gi, "x");
  if (c.length > 40000) c = c.slice(0, 40000).replace(/[^}]*$/, "");
  return c;
}

export async function generateDesign(id, budgetMs = 52000) {
  const row = await getPreviewById(id);
  if (!row) return { ok: false, error: "Not found" };
  if (!row.draft_md) return { ok: false, error: "Write the website text first" };
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI key is set in Vercel (ANTHROPIC_API_KEY or GEMINI_API_KEY)" };
  const options = currentOptions(row);
  if (options.length >= MAX_DESIGN_OPTIONS) return { ok: false, error: `You already have ${MAX_DESIGN_OPTIONS} designs. Remove one first.` };
  const site = buildSiteModel({ ...row, design_css: null });
  const model = provider.name === "anthropic" ? process.env.ANTHROPIC_DESIGN_MODEL || "claude-haiku-5-5" : undefined;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt(row, site) }]), SYSTEM, [], budgetMs,
      { maxTokens: 6000, attemptMs: budgetMs - 2000, model });
    const cssText = cleanCss(out.text);
    if (cssText.replace(/\/\*[\s\S]*?\*\//g, "").trim().length < 200) throw new Error("The AI didn't return a usable design");
    const by = provider.name === "anthropic" ? `Claude (${model})` : "Gemini";
    const opt = { id: newId(), css: cssText, by, at: new Date().toISOString() };
    await setDesignOptions(id, [...options, opt], opt);
    return { ok: true, by };
  } catch (err) {
    console.error("design failed", err.code, err.message);
    const msg = /usable design/.test(err.message || "") ? err.message : friendlyAiError(err);
    await saveDesign(id, null, null, msg).catch(() => {});
    return { ok: false, error: msg };
  }
}

const newId = () => randomBytes(4).toString("hex");
// Designs made before options existed count as the first option.
export function currentOptions(row) {
  const list = Array.isArray(row.design_options) ? row.design_options : [];
  if (!list.length && row.design_css) return [{ id: "first", css: row.design_css, by: row.design_by || "AI", at: new Date().toISOString() }];
  return list;
}

// Admin actions on the list: add the standard design, remove one, make one current, or clear all.
export async function changeDesignOptions(id, action, optionId) {
  const row = await getPreviewById(id);
  if (!row) return { ok: false, error: "Not found" };
  let options = currentOptions(row);
  let current = options.find((o) => (o.css || "") === (row.design_css || "")) || null;
  if (action === "add_standard") {
    if (options.some((o) => !o.css)) return { ok: false, error: "The standard design is already an option" };
    if (options.length >= MAX_DESIGN_OPTIONS) return { ok: false, error: `You already have ${MAX_DESIGN_OPTIONS} designs. Remove one first.` };
    options = [...options, { id: newId(), css: "", by: "Standard", at: new Date().toISOString() }];
    if (!current) current = options[0];
  } else if (action === "add_dark") {
    if (options.some((o) => o.by === "Dark")) return { ok: false, error: "The dark design is already an option" };
    // On its own the customer would have nothing to compare, so the standard look comes along as the first option.
    if (!options.length) options = [{ id: newId(), css: "", by: "Standard", at: new Date().toISOString() }];
    if (options.length >= MAX_DESIGN_OPTIONS) return { ok: false, error: `You already have ${MAX_DESIGN_OPTIONS} designs. Remove one first.` };
    options = [...options, { id: newId(), css: darkDesignCss(buildSiteModel(row).theme), by: "Dark", at: new Date().toISOString() }];
    if (!current) current = options[0];
  } else if (action === "remove") {
    const gone = options.find((o) => o.id === optionId);
    if (!gone) return { ok: false, error: "That design is no longer there" };
    options = options.filter((o) => o !== gone);
    if (current === gone) current = options.find((o) => o.css) || null;
  } else if (action === "use") {
    current = options.find((o) => o.id === optionId);
    if (!current) return { ok: false, error: "That design is no longer there" };
  } else if (action === "clear") {
    options = []; current = null;
  } else return { ok: false, error: "Unknown action" };
  await setDesignOptions(id, options, current);
  return { ok: true };
}
