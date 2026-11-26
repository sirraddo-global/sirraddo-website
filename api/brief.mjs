// /api/brief — the customer's project brief, opened with the private link from the admin page.
//   GET  ?t=TOKEN                       -> the questions for their package, saved answers and files
//   POST { t, answers, submit?, remove_file?: { field, url } }
// The token in the link is the only key, so it is long and random. No other login is needed.
import { isQuick } from "./_lib/graphics.mjs";
import { getBrief, saveBrief, removeBriefFile, sendEmail, emailConfigured, esc } from "./_lib/store.mjs";
import { kindFor, KIND_LABEL, schemaFor, cleanAnswers, missingRequired, fileField } from "./_lib/brief-schema.mjs";
import { IDEA_LABELS } from "./_lib/ideas.mjs";
import { chatProviders as chatProvidersSync } from "./_lib/providers.mjs";
import { waitUntil, filesEnabled, deleteFiles } from "./_lib/platform.mjs";
import { generateDraft } from "./_lib/drafts.mjs";

export const uploadsEnabled = filesEnabled;
import { SITE } from "./_lib/automation.mjs";

function publicView(row) {
  const kind = kindFor(row.interest);
  // First time the form opens: what they already told us (chat, package forms) is typed in for them to check.
  const prefilled = [];
  let answers = row.brief || {};
  if (!row.brief_saved_at && !Object.keys(answers).length) {
    const ideas = row.chat_ideas || {}, keys = new Set(schemaFor(kind).flatMap((x) => x.fields.map((f) => f.key)));
    const phone = /\d{7,}/.test(String(row.contact || "").replace(/\D/g, "")) && !/@/.test(row.contact || "") ? String(row.contact).trim() : "";
    const guess = {
      business_name: ideas.business_name || row.business || "",
      tagline: ideas.slogan || "",
      description: [ideas.what_they_do, ideas.customers ? "Customers: " + ideas.customers : ""].filter(Boolean).join(". "),
      phone, email: row.email || "", hours: ideas.hours || "", address: ideas.location || "",
      colours: ideas.style || "", examples: ideas.examples || "", gbp_area: ideas.location || "",
      project_summary: kind === "project" ? ideas.what_they_do || row.details || "" : "",
    };
    answers = {};
    for (const [k, v] of Object.entries(guess)) if (v && keys.has(k)) { answers[k] = String(v).slice(0, 600); prefilled.push(k); }
  }
  return {
    prefilled,
    name: row.name,
    business: row.business,
    interest: row.interest,
    kind,
    kind_label: KIND_LABEL[kind],
    sections: schemaFor(kind),
    answers,
    files: row.brief_files || {},
    saved_at: row.brief_saved_at,
    submitted_at: row.brief_submitted_at,
    uploads_enabled: uploadsEnabled(),
    ai_writer: chatProvidersSync().length > 0, // "✨ Write it for me" needs an AI key
    chat_ideas: Object.entries(IDEA_LABELS).filter(([k]) => k !== "recommended" && row.chat_ideas?.[k]).map(([k, label]) => ({ label, value: row.chat_ideas[k] })),
  };
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === "object" ? body : {};
}

async function notify(row, kind) {
  if (!emailConfigured()) return;
  const lines = [];
  for (const s of schemaFor(kind)) {
    lines.push(`<h3 style="margin:16px 0 6px">${esc(s.title)}</h3>`);
    for (const f of s.fields) {
      let v = f.type === "files" ? (row.brief_files?.[f.key] || []) : row.brief?.[f.key];
      if (f.type === "files") v = v.map((x) => `<a href="${esc(x.url)}">${esc(x.name)}</a>`).join(", ");
      else if (f.type === "rows") v = (v || []).map((r) => f.columns.map((c) => esc(r[c.key])).filter(Boolean).join(" · ")).join("<br>");
      else if (Array.isArray(v)) v = esc(v.join(", "));
      else if (f.type === "confirm") v = v ? "Yes" : "";
      else v = esc(v);
      if (v) lines.push(`<p style="margin:4px 0"><b>${esc(f.label)}</b><br>${v}</p>`);
    }
  }
  await sendEmail(
    `Project brief received: ${row.name} (${row.interest})`,
    `<h2 style="margin:0 0 8px">${esc(row.name)} sent their project brief</h2>
     <p>${esc(row.interest)} · ${esc(row.contact)}. The project is now marked <b>Building</b>.</p>
     ${lines.join("")}<p><a href="${SITE}/admin">Open the admin page</a></p>`
  );
}


// ---------- "✨ Write it for me" (product name, category and description from its photo) ----------
const aiUses = new Map(); // per form link: a generous limit, so a slow phone can do a big shop, but no endless use
async function writeProduct(row, input, req) {
  const { readImageForAi } = await import("./_lib/platform.mjs");
  const { chatProviders, CHAT_MODELS, friendlyAiError, ensureAiBackup } = await import("./_lib/providers.mjs");
  await ensureAiBackup();
  const photo = String(input?.photo || "");
  const mine = (row.brief_files?.product_photos || []).some((f) => f.url === photo);
  if (!mine) throw Object.assign(new Error("Add the photo first."), { status: 400 });
  const used = (aiUses.get(row.id) || []).filter((t) => Date.now() - t < 3600_000);
  if (used.length >= 400) throw Object.assign(new Error("That's a lot for one hour. Please try again a bit later."), { status: 429 });
  used.push(Date.now()); aiUses.set(row.id, used);
  if (aiUses.size > 2000) aiUses.clear();
  const image = await readImageForAi(photo);
  if (!image) throw Object.assign(new Error("Couldn't read that photo. Please type the details."), { status: 400 });
  const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  const cats = (Array.isArray(input.categories) ? input.categories : []).map((c) => clip(c, 40)).filter(Boolean).slice(0, 30);
  const prompt = `PRODUCT LISTING FROM A PHOTO
You write product listings for a Nigerian online shop${row.brief?.business_name ? ` called "${clip(row.brief.business_name, 80)}"` : ""}. Look at the photo of ONE product.
${clip(input.name, 80) ? `The owner calls it: "${clip(input.name, 80)}". Keep their name (you may fix spelling or capital letters).` : "Give it a clear, short name a buyer would search for (2–6 words)."}
${cats.length ? `Categories the shop already uses: ${cats.join(", ")}. Reuse one if it fits.` : "Pick one short category (1–2 words), e.g. Fashion, Shoes, Bags, Groceries, Beauty, Phones."}
Description: 1–2 short, friendly sentences for buyers: what it is, and colour, material, size or pattern only if you can see them. Plain Nigerian English. No prices, no brand names unless printed clearly on the product, no promises you can't see (e.g. "original", "waterproof").
Reply with JSON only: {"name":"...","category":"...","details":"..."}`;
  let lastErr = null;
  for (const provider of chatProviders()) {
    try {
      const opts = { maxTokens: 300, models: provider.name === "gemini" ? CHAT_MODELS.gemini : undefined, model: provider.name === "anthropic" ? CHAT_MODELS.anthropic : undefined };
      const out = await provider.call(provider.start([{ role: "user", content: prompt, images: [image] }]), "You write short, honest product listings and reply with JSON only.", [], 20000, opts);
      const m = String(out.text || "").match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : {};
      const res = { name: clip(j.name, 80), category: clip(j.category, 40), details: clip(j.details, 400) };
      if (res.name || res.details) return res;
    } catch (e) { lastErr = e; console.error("product writer failed", provider.name, e.message); }
  }
  throw Object.assign(new Error(lastErr ? friendlyAiError(lastErr) : "The writer isn't available right now. Please type the details."), { status: 503 });
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    if (req.method === "GET") {
      const row = await getBrief(String(query.t || ""));
      if (!row) return res.status(404).json({ error: "This link is not valid. Please ask us for a new one on WhatsApp." });
      if (isQuick(row.interest)) return res.status(404).json({ error: "Your design order already has everything we need, so there is no form to fill. Follow your order with the tracking link we sent, or message us on WhatsApp." });
      await (await import("./_lib/providers.mjs")).ensureAiBackup();
      return res.status(200).json(publicView(row));
    }
    if (req.method === "POST") {
      const body = readBody(req);
      const token = String(body.t || "");
      const row = await getBrief(token);
      if (!row) return res.status(404).json({ error: "This link is not valid. Please ask us for a new one on WhatsApp." });
      if (isQuick(row.interest)) return res.status(404).json({ error: "This order doesn't use a project form." });
      const kind = kindFor(row.interest);

      if (body.remove_file) {
        const field = String(body.remove_file.field || "");
        if (!fileField(kind, field)) return res.status(400).json({ error: "Unknown field" });
        const url = String(body.remove_file.url || "");
        const files = await removeBriefFile(token, field, url);
        if (url === "*") await deleteFiles(`briefs/${row.id}/${field}/`).catch((e) => console.error("delete files failed", e));
        return res.status(200).json({ files });
      }

      // "✨ Write it for me": the AI looks at a product photo and suggests its name, category and description.
      if (body.ai_product) return res.status(200).json(await writeProduct(row, body.ai_product, req));

      const answers = cleanAnswers(kind, body.answers);
      // Keep what the owner set in their Manage link (stock counts, sold out) when the form is saved again
      // (e.g. you add products after launch). Matched by product name.
      if (Array.isArray(answers.products) && Array.isArray(row.brief?.products)) {
        const prev = new Map(row.brief.products.map((p) => [String(p.name || "").trim().toLowerCase(), p]));
        answers.products = answers.products.map((p) => {
          const old = prev.get(String(p.name || "").trim().toLowerCase());
          if (!old) return p;
          const keep = {};
          if (old.stock !== undefined) keep.stock = old.stock;
          if (old.soldout) keep.soldout = true;
          return { ...p, ...keep };
        });
      }
      // Today's pump prices from Manage my website (filling stations) stay too.
      if (row.brief?.fuel_prices) answers.fuel_prices = row.brief.fuel_prices;
      if (JSON.stringify(answers).length > 900_000) return res.status(413).json({ error: "That's too much text. Please shorten it or send it on WhatsApp." });
      if (body.submit) {
        const missing = missingRequired(kind, answers, row.brief_files);
        if (missing.length) return res.status(400).json({ error: "Please fill in: " + missing.join("; "), missing });
      }
      const saved = await saveBrief(token, answers, Boolean(body.submit));
      if (body.submit && saved) {
        try { await notify(saved, kind); } catch (err) { console.error("brief email failed", err); }
        // Write the website text in the background; the customer doesn't wait for it. Sent again after the text
        // exists (e.g. changes after launch): only pages that are new get written, so edited text is never replaced.
        waitUntil(generateDraft(saved.id, undefined, { missingOnly: Boolean(row.has_draft) }).catch((err) => console.error("draft failed", err)));
      }
      return res.status(200).json({ ok: true, saved_at: new Date().toISOString(), submitted_at: saved?.brief_submitted_at || null });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err.status && err.status < 600) return res.status(err.status).json({ error: err.message });
    console.error("brief failed", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
