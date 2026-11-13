// AI drafts of a customer's website text, written from their project form.
// Runs when the form is sent (in the background), from admin ("Write website text"), or in the daily run.
// The draft is for YOU to check and paste into the site; it is never shown to the customer directly.
import { pickProvider } from "./providers.mjs";
import { getBriefById, saveDraft } from "./store.mjs";
import { kindFor, schemaFor, KIND_LABEL } from "./brief-schema.mjs";

const DEFAULT_PAGES = ["Home", "About us", "Services", "Contact"];

const SYSTEM = `You are a professional website copywriter working for SIRRADDO GLOBAL LIMITED, a Nigerian web design company.
You write the text for a customer's website from the answers they gave in their project form.

RULES
- Use only facts from the form. Never invent prices, years, awards, staff names, numbers of customers, testimonials, certifications or guarantees.
- Where a page needs a fact the form doesn't give, write a short placeholder in square brackets, e.g. [ADD: year started], so the builder can see it.
- Clear, warm, professional Nigerian English. Short paragraphs (1–3 sentences). Active voice. No emojis, no hype words like "world-class" or "best in Nigeria".
- Mention the city or area naturally where the form gives it (good for local search).
- Prices only exactly as given in the form, written in naira with commas, e.g. ₦4,100.
- Output plain Markdown only, in exactly the structure asked for. No commentary before or after.`;

function answersText(kind, brief, files) {
  const lines = [];
  for (const section of schemaFor(kind)) {
    for (const f of section.fields) {
      if (f.type === "confirm") continue;
      let v;
      if (f.type === "files") {
        const n = (files?.[f.key] || []).length;
        v = n ? `${n} file(s) uploaded` : "";
      } else if (f.type === "rows") {
        v = (brief?.[f.key] || []).map((r) => "  - " + f.columns.map((c) => r[c.key]).filter(Boolean).join(" | ")).join("\n");
        if (v) v = "\n" + v;
      } else if (Array.isArray(brief?.[f.key])) v = brief[f.key].join(", ");
      else v = brief?.[f.key] || "";
      if (v) lines.push(`${f.label}: ${v}`);
    }
  }
  return lines.join("\n");
}

function pagesPrompt(kind, row, answers) {
  const b = row.brief || {};
  const pages = (b.pages_10 || b.pages || []).length ? (b.pages_10 || b.pages) : DEFAULT_PAGES;
  if (kind === "project") {
    return `Customer: ${row.name}${row.business ? ` (${row.business})` : ""}. They want a custom app or business software.

PROJECT FORM ANSWERS
${answers}

Write a first draft of the project scope for the builder to check with the customer. Structure:
# Draft scope: ${row.business || row.name}
## Summary
(3–4 sentences: what it does and for whom)
## Users and what each can do
(bullets)
## Must-have features (first version)
(numbered list, one line each, grouped by area)
## Later, not in the first version
(bullets, only things the form hints at)
## Platforms
## Questions to confirm with the customer
(bullets: anything unclear or missing that affects price or time)`;
  }
  const extras = [];
  if (kind === "business" || kind === "store") {
    extras.push(`## Google Business Profile description
(one paragraph, 600–750 characters, no links, no prices, says what the business does, for whom and where)`);
  }
  if (kind === "store" && (b.products || []).length) {
    extras.push(`## Product descriptions
(for each product in the form, in the same order: "### Product name" then 1–2 sentences. Keep any sizes, colours and prices exactly as given.)`);
  }
  return `Customer: ${row.name}. Package: ${KIND_LABEL[kind]}.

PROJECT FORM ANSWERS
${answers}

Write the text for these pages, in this order: ${pages.join(", ")}.
Structure:
# Website text: ${b.business_name || row.business || row.name}
For each page:
## Page: <page name>
**SEO title:** (max 60 characters, includes the business type and city if given)
**Meta description:** (max 155 characters)
Then the page's sections, each as "### <section name>" with its text. Inside a section you may start with "**Heading:** <section heading>", then "**Text:** <paragraph>" (more paragraphs or "- " bullet points can follow).
The Home page starts with exactly:
### Hero
**Headline:** <max 8 words>
**Subheadline:** <one sentence>
**Button text:** <2–4 words>
IMPORTANT: the website automatically shows every service/product with its price as cards (Home, Services, Prices and Shop pages), and the contact details (phone, WhatsApp, email, address, hours) as a card on the Contact page. So don't list the services, prices or contact details again: write a short introduction for those pages instead (what makes them good, who they're for, how to order or visit).
For an FAQ page, write each question as "#### <question>" followed by its answer as a paragraph.
${extras.length ? "\nAfter the pages, add:\n" + extras.join("\n") : ""}`;
}

function blogPrompt(row, answers) {
  const b = row.brief || {};
  return `Customer: ${row.name}. They asked us to write the first 2 blog posts for their website.

PROJECT FORM ANSWERS
${answers}

Blog topics they suggested: ${b.blog_topics || "(none given: choose 2 useful topics their customers would search for)"}

Write 2 blog posts, each 400–600 words, helpful and practical, written for their customers (not about SEO). Structure:
## Blog post 1: <title>
**Meta description:** (max 155 characters)
<the post, with 2–4 "###" subheadings>
## Blog post 2: <title>
**Meta description:** (max 155 characters)
<the post>`;
}

async function ask(provider, prompt, ms, maxTokens) {
  const out = await provider.call(provider.start([{ role: "user", content: prompt }]), SYSTEM, [], ms, { maxTokens, attemptMs: 45000 });
  if (!out.text) throw new Error("empty reply");
  return out.text.trim();
}

// Writes and saves the draft. Returns { ok, error }.
export async function generateDraft(id, budgetMs = 50000) {
  const row = await getBriefById(id);
  if (!row || !row.brief) return { ok: false, error: "No project form answers yet" };
  const provider = pickProvider();
  if (!provider) {
    await saveDraft(id, null, "No AI key set");
    return { ok: false, error: "No AI key is set in Vercel (GEMINI_API_KEY or ANTHROPIC_API_KEY)" };
  }
  const kind = kindFor(row.interest);
  const answers = answersText(kind, row.brief, row.brief_files);
  const wantBlog = (kind === "business" || kind === "store") && row.brief.blog === "Please write the first 2 posts for me";
  try {
    const [pages, blog] = await Promise.all([
      ask(provider, pagesPrompt(kind, row, answers), budgetMs, kind === "store" ? 6000 : 4000),
      wantBlog ? ask(provider, blogPrompt(row, answers), budgetMs, 3500).catch((e) => `## Blog posts\n\n[Not written: ${e.code || e.message}. Use "Rewrite" to try again.]`) : null,
    ]);
    const md = [pages, blog].filter(Boolean).join("\n\n") +
      `\n\n---\n*Draft written by AI from the project form on ${new Date().toISOString().slice(0, 10)}. Check every fact, replace each [ADD: …] and read it through before it goes on the site.*`;
    await saveDraft(id, md, null);
    return { ok: true };
  } catch (err) {
    console.error("draft failed", id, err);
    await saveDraft(id, null, err.code || err.message);
    return { ok: false, error: "The AI couldn't write it right now (" + (err.code || "error") + "). Try again in a minute." };
  }
}
