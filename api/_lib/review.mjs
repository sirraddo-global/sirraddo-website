// 🔍 AI check before sending: a second pair of eyes on finished work (a CV, designs, a QR poster).
// It compares the work with what the customer sent on their order and lists anything to fix, to check or to
// improve. It never changes the work: staff decide. Nothing is saved.
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { orderSources } from "./cv.mjs";

const clip = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

const COMMON = `You are SIRRADDO's quality checker in Nigeria. A staff member is about to send finished work to a paying customer.
Compare the work with what the customer sent on their order (text and files). Be specific and practical; quote the exact words you mean.
Report problems in three levels:
- "fix": must be fixed before sending (a wrong or missing phone number, price, name, date or address; a spelling mistake; a grammar or punctuation error; a fact, job, grade, price or claim that is NOT in what the customer sent; text cut off or unreadable; the wrong service).
- "check": ask the customer or look again (unclear facts, [ask] placeholders, anything you can't confirm).
- "tip": would make it better (wording, order, layout, readability), optional.
Do not invent problems. If it's good, say so. Nigerian English and British spelling are correct.
Reply with ONLY JSON: {"verdict":"ready" or "fix first","summary":"one sentence","issues":[{"level":"fix|check|tip","where":"which part","problem":"","fix":"what to do"}],"good":["up to 3 short things done well"]}`;

const KIND = {
  cv: `The work is a CV (and maybe a cover letter) as structured data. Read EVERY line for spelling, grammar and punctuation, and list each mistake separately as a "fix", quoting the wrong words and giving the corrected words (e.g. "recieved" → "received", "Manage a team" → "Managed a team" for a past job). Also catch: wrong tense (past jobs in past tense, the current job in present tense), mixed tenses in one job, missing capital letters (names, schools, companies, months), double spaces or repeated words, inconsistent date formats (e.g. 'Jan 2021' and '01/2022'), full stops used in some bullets but not others, words that are too casual for a CV. Then check: name and contact details match the order; every job, date, school, grade and achievement is supported by what the customer sent; dates are consistent and most recent first; bullet points start with action verbs; no first person "I" in the CV; one clear job target; length suits 1–2 A4 pages; the cover letter names the right job and company from the advert and does not repeat the CV word for word.`,
  design: `The work is one or more designs (pictures) for print or WhatsApp. Read every word on them and list each spelling, grammar or punctuation mistake separately, with the correction. Also check: business name, phone number, prices, dates, times and address are exactly as the customer wrote; nothing is misspelt; text is readable on its background and not cut off or covered; the most important message is the biggest; nothing looks like a mistake (stray symbols, empty boxes, "Your photo here", placeholder text); the design fits what they ordered (e.g. an invitation has RSVP, a menu has prices).`,
  poster: `The work is a QR code poster. Also check: the business name and the words are right and readable; the link printed at the bottom matches what the QR code should open (their WhatsApp number or website); nothing is cut off. You can't scan the code: remind staff to test it with 2 phones.`,
};

export async function reviewWork({ r, kind = "design", cv, images = [], link }, budgetMs = 50000) {
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI is set up yet (Admin → Settings → Keys & connections)." };
  if (!KIND[kind]) return { ok: false, error: "Unknown kind of work." };
  const src = r ? await orderSources(r, 3) : { files: [], texts: [], text: "" };
  const pics = (Array.isArray(images) ? images : []).slice(0, 4).map((u) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || ""));
    return m && m[2].length < 2_800_000 ? { mime: m[1], data: m[2] } : null;
  }).filter(Boolean);
  if (kind !== "cv" && !pics.length) return { ok: false, error: "No pictures of the work were sent to check." };
  const order = r ? `THE ORDER\nService: ${clip(r.interest, 60)}\nCustomer: ${clip(r.name, 80)}${r.business ? ` (${clip(r.business, 80)})` : ""}\nContact on the order: ${clip(r.contact, 80)}${r.email ? `, ${clip(r.email, 100)}` : ""}\nWhat they wrote:\n${src.text || "(nothing)"}${src.texts.length ? `\n\n${src.texts.join("\n\n")}` : ""}`
    : "THE ORDER\n(No order: made in the studio without one. Check spelling, readability and anything that looks wrong.)";
  const work = kind === "cv" ? `THE WORK (CV data)\n${JSON.stringify(cv || {}, null, 1).slice(0, 14000)}` : `THE WORK\n${pics.length} picture(s) attached after the customer's own files${link ? `. The QR code should open: ${clip(link, 200)}` : ""}.`;
  const prompt = `${order}\n\n${src.files.length ? `(The first ${src.files.length} attached file(s) are what the customer sent: old CV, job advert or photos.)\n\n` : ""}${work}\n\nCheck it now.`;
  const model = provider.name === "anthropic" ? process.env.ANTHROPIC_DESIGN_MODEL || "claude-haiku-5-5" : undefined;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt, images: [...src.files, ...pics] }]), `${COMMON}\n\n${KIND[kind]}`, [], budgetMs, { maxTokens: 3500, attemptMs: budgetMs - 1500, model });
    const t = String(out.text || ""); let j;
    try { j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); } catch { return { ok: false, error: "The AI didn't return a usable check. Please try again." }; }
    const issues = (Array.isArray(j.issues) ? j.issues : []).slice(0, 30).map((x) => ({
      level: ["fix", "check", "tip"].includes(x?.level) ? x.level : "check", where: clip(x?.where, 80), problem: clip(x?.problem, 300), fix: clip(x?.fix, 300),
    })).filter((x) => x.problem);
    const order2 = { fix: 0, check: 1, tip: 2 }; issues.sort((a, b) => order2[a.level] - order2[b.level]);
    const verdict = issues.some((x) => x.level === "fix") ? "fix first" : "ready";
    return { ok: true, verdict, summary: clip(j.summary, 240), issues, good: (Array.isArray(j.good) ? j.good : []).slice(0, 3).map((g) => clip(g, 160)).filter(Boolean) };
  } catch (err) {
    console.error("review failed", err.code, err.message);
    return { ok: false, error: friendlyAiError(err) };
  }
}
