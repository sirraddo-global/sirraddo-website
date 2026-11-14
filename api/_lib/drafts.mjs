// AI drafts of a customer's website text, written from their project form.
// Runs when the form is sent (in the background), from admin ("Write website text"), or in the daily run.
// The draft is for YOU to check and paste into the site; it is never shown to the customer directly.
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { ideasText } from "./ideas.mjs";
import { getBriefById, saveDraft } from "./store.mjs";
import { kindFor, schemaFor, KIND_LABEL } from "./brief-schema.mjs";
import { FUNCTION_BUDGET_MS } from "./platform.mjs";

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

export function sitePages(row) {
  const b = row.brief || {};
  return (b.pages_10 || b.pages || []).length ? (b.pages_10 || b.pages) : DEFAULT_PAGES;
}

function scopePrompt(row, answers) {
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

// The pages are written in small groups at the same time, so the whole draft is ready within the host's
// 30-second limit (one long reply for every page could take a minute).
function pagesPrompt(kind, row, answers, pages, allPages) {
  const hasHome = pages.some((p) => /^home$/i.test(p));
  return `Customer: ${row.name}. Package: ${KIND_LABEL[kind]}.

PROJECT FORM ANSWERS
${answers}

The website has these pages: ${allPages.join(", ")}. Other writers are doing the other pages.
Write the text for ONLY these pages, in this order: ${pages.join(", ")}.
Structure, for each page:
## Page: <page name>
**SEO title:** (max 60 characters, includes the business type and city if given)
**Meta description:** (max 155 characters)
Then the page's sections, each as "### <section name>" with its text. Inside a section you may start with "**Heading:** <section heading>", then "**Text:** <paragraph>" (more paragraphs or "- " bullet points can follow).
${hasHome ? `The Home page starts with exactly:
### Hero
**Headline:** <max 8 words>
**Subheadline:** <one sentence>
**Button text:** <2–4 words>
` : ""}IMPORTANT: the website automatically shows every service/product with its price as cards (Home, Services, Prices and Shop pages), and the contact details (phone, WhatsApp, email, address, hours) as a card on the Contact page. So don't list the services, prices or contact details again: write a short introduction for those pages instead (what makes them good, who they're for, how to order or visit).
For an FAQ page, write each question as "#### <question>" followed by its answer as a paragraph.
Don't add a title above the first page and don't add anything after the last one.`;
}

function extrasPrompt(kind, row, answers) {
  const b = row.brief || {};
  const parts = [];
  if (kind === "business" || kind === "store") {
    parts.push(`## Google Business Profile description
(one paragraph, 600–750 characters, no links, no prices, says what the business does, for whom and where)`);
  }
  if (kind === "store" && (b.products || []).length) {
    parts.push(`## Product descriptions
(for each product in the form, in the same order: "### Product name" then 1–2 sentences. Keep any sizes, colours and prices exactly as given.)`);
  }
  if (!parts.length) return null;
  return `Customer: ${row.name}. Package: ${KIND_LABEL[kind]}.

PROJECT FORM ANSWERS
${answers}

Write only these sections, in this order:
${parts.join("\n")}`;
}

const chunk = (list, n) => list.reduce((out, x, i) => (i % n ? out[out.length - 1].push(x) : out.push([x]), out), []);

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
  const out = await provider.call(provider.start([{ role: "user", content: prompt }]), SYSTEM, [], ms, { maxTokens, attemptMs: Math.max(8000, ms - 1500) });
  if (!out.text) throw new Error("empty reply");
  return out.text.trim();
}

// Writes and saves the draft. Returns { ok, error }.
export async function generateDraft(id, budgetMs = FUNCTION_BUDGET_MS() - 2000) {
  const row = await getBriefById(id);
  if (!row || !row.brief) return { ok: false, error: "No project form answers yet" };
  const provider = pickProvider();
  if (!provider) {
    await saveDraft(id, null, "No AI key set");
    return { ok: false, error: "No AI key is set in Netlify (GEMINI_API_KEY or ANTHROPIC_API_KEY)" };
  }
  const kind = kindFor(row.interest);
  const chat = ideasText(row.chat_ideas);
  const answers = answersText(kind, row.brief, row.brief_files) +
    (chat ? `\n\nAlso from their earlier chat with our assistant (use where the form is silent; the form wins if they differ):\n${chat}` : "");
  const wantBlog = (kind === "business" || kind === "store") && row.brief.blog === "Please write the first 2 posts for me";
  const notWritten = (what, e) => `[ADD: ${what} wasn't written (${friendlyAiError(e)}). Use "Rewrite" to try again.]`;
  try {
    let body;
    if (kind === "project") {
      body = await ask(provider, scopePrompt(row, answers), budgetMs, 4000);
    } else {
      const all = sitePages(row);
      const groups = chunk(all, 2);
      const extras = extrasPrompt(kind, row, answers);
      const jobs = [
        ...groups.map((g) => ask(provider, pagesPrompt(kind, row, answers, g, all), budgetMs, kind === "store" ? 2600 : 2200)),
        extras ? ask(provider, extras, budgetMs, kind === "store" ? 2200 : 900) : null,
        wantBlog ? ask(provider, blogPrompt(row, answers), budgetMs, 3500) : null,
      ];
      const results = await Promise.allSettled(jobs.map((j) => j || Promise.resolve(null)));
      const pageResults = results.slice(0, groups.length);
      if (pageResults.every((r) => r.status === "rejected")) throw pageResults[0].reason;
      const parts = [`# Website text: ${row.brief.business_name || row.business || row.name}`];
      const noTitle = (t) => t.replace(/^#\s[^\n]*\n*/gm, "").trim(); // each group may repeat the title: keep only ours
      pageResults.forEach((r, i) => parts.push(r.status === "fulfilled" ? noTitle(r.value)
        : groups[i].map((p) => `## Page: ${p}\n${notWritten("This page", r.reason)}`).join("\n\n")));
      const ex = results[groups.length], bl = results[groups.length + 1];
      if (extras) parts.push(ex.status === "fulfilled" ? noTitle(ex.value) : `## Google Business Profile description\n${notWritten("This section", ex.reason)}`);
      if (wantBlog) parts.push(bl.status === "fulfilled" ? noTitle(bl.value) : `## Blog posts\n\n[Not written: ${friendlyAiError(bl.reason)} Use "Rewrite" to try again.]`);
      body = parts.join("\n\n");
    }
    const md = body + `\n\n---\n*Draft written by AI from the project form on ${new Date().toISOString().slice(0, 10)}. Check every fact, replace each [ADD: …] and read it through before it goes on the site.*`;
    await saveDraft(id, md, null);
    return { ok: true };
  } catch (err) {
    console.error("draft failed", id, err);
    await saveDraft(id, null, friendlyAiError(err));
    return { ok: false, error: friendlyAiError(err) + " Any text already written is kept." };
  }
}
