// CV maker (Admin → a CV order → 📄 CV maker). The AI turns the customer's order details and old CV into a
// structured CV (and a cover letter when ordered). Staff check every fact with the customer, then download
// the PDF and Word files in the browser. Drafts are kept per order so changes can be made later.
import { inflateRawSync } from "node:zlib";
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { readImageForAi, readStoredFile } from "./platform.mjs";

const clip = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);
const list = (v, n, f) => (Array.isArray(v) ? v : []).slice(0, n).map(f).filter(Boolean);

/** Keeps a CV object to the fields and sizes the CV maker uses. */
export function cleanCv(cv = {}) {
  const c = cv && typeof cv === "object" ? cv : {};
  const contact = c.contact && typeof c.contact === "object" ? c.contact : {};
  const letter = c.letter && typeof c.letter === "object" ? c.letter : null;
  return {
    name: clip(c.name, 80), headline: clip(c.headline, 120),
    contact: { phone: clip(contact.phone, 60), email: clip(contact.email, 100), location: clip(contact.location, 80), link: clip(contact.link, 120) },
    summary: clip(c.summary, 900),
    experience: list(c.experience, 12, (x) => x && (x.role || x.company) ? {
      role: clip(x.role, 100), company: clip(x.company, 100), place: clip(x.place, 60), dates: clip(x.dates, 40),
      bullets: list(x.bullets, 8, (b) => clip(b, 260)),
    } : null),
    education: list(c.education, 8, (x) => x && (x.qualification || x.school) ? { qualification: clip(x.qualification, 120), school: clip(x.school, 120), dates: clip(x.dates, 40), note: clip(x.note, 200) } : null),
    skills: list(c.skills, 30, (s) => clip(s, 60)),
    certifications: list(c.certifications, 12, (s) => clip(s, 160)),
    extras: list(c.extras, 12, (s) => clip(s, 200)),
    referees: clip(c.referees, 400) || "Available on request",
    letter: letter ? { to: clip(letter.to, 200), subject: clip(letter.subject, 140), greeting: clip(letter.greeting, 80) || "Dear Hiring Manager,",
      paragraphs: list(letter.paragraphs, 6, (p) => clip(p, 1200)), closing: clip(letter.closing, 60) || "Yours faithfully," } : null,
    questions: list(c.questions, 12, (s) => clip(s, 200)),
    layout: ["classic", "modern"].includes(c.layout) ? c.layout : "classic",
    accent: /^#[0-9a-f]{6}$/i.test(c.accent || "") ? c.accent : "#13254F",
  };
}

/** Plain text of a Word (.docx) file: the paragraphs of word/document.xml. "" if it isn't one. */
export function docxText(buf) {
  try {
    const b = Buffer.from(buf);
    // Find word/document.xml in the zip's central directory.
    let end = b.length - 22; while (end >= 0 && b.readUInt32LE(end) !== 0x06054b50) end--;
    if (end < 0) return "";
    const count = b.readUInt16LE(end + 10); let p = b.readUInt32LE(end + 16);
    for (let i = 0; i < count && p + 46 <= b.length; i++) {
      const method = b.readUInt16LE(p + 10), size = b.readUInt32LE(p + 20), nameLen = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), local = b.readUInt32LE(p + 42);
      const name = b.toString("utf8", p + 46, p + 46 + nameLen);
      if (name === "word/document.xml") {
        const start = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28), raw = b.subarray(start, start + size);
        const xml = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
        return xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
          .replace(/\n{3,}/g, "\n\n").trim().slice(0, 15000);
      }
      p += 46 + nameLen + extra + comment;
    }
  } catch (e) { console.error("docx read failed", e.message); }
  return "";
}

const SYSTEM = `You write CVs and cover letters for job seekers in Nigeria, for SIRRADDO's CV service.
Use ONLY facts the customer gave (their order details and old CV). Never invent employers, dates, degrees, grades, numbers or achievements.
If something important is missing or unclear, leave it out or write [ask] in its place, and add a short question for the customer to "questions".
Write strong, plain-English bullet points that start with an action verb ("Managed", "Trained", "Reduced"). Keep a number only if the customer gave it.
Most recent job first. A one-column CV that company screening software (ATS) can read: no tables, no photos, no rating bars.
Nigerian context: NYSC, WAEC/NECO, OND/HND, B.Sc./B.A. are normal; keep them as written. British spelling.
Keep it to what fits on 1–2 A4 pages: summary 3–4 lines, at most 5 bullets per job (fewer for old jobs), 8–14 skills.
Reply with ONLY JSON in this shape, no other text:
{"name":"","headline":"job title they want","contact":{"phone":"","email":"","location":"City, State","link":"LinkedIn or portfolio, if given"},
"summary":"","experience":[{"role":"","company":"","place":"","dates":"Jan 2021 – Present","bullets":[""]}],
"education":[{"qualification":"","school":"","dates":"","note":"grade or project, if given"}],
"skills":[""],"certifications":[""],"extras":["NYSC, volunteering, languages, awards — only if given"],"referees":"Available on request",
"letter":LETTER,"questions":["what to ask the customer"]}`;

const LETTER_YES = `{"to":"Hiring Manager, Company, City (from the job advert)","subject":"Application for the position of …","greeting":"Dear Hiring Manager,","paragraphs":["why this job and company","2–3 achievements that match the advert","polite close and availability"],"closing":"Yours faithfully,"}`;

/** What the customer sent on an order: the text, their files for the AI (PDF/photos) and Word files as text. */
export async function orderSources(r, max = 4) {
  const details = String(r.details || "");
  const urls = [...details.matchAll(/^[•◦] (.+?): (https?:\/\/\S+)$/gm)].map((m) => ({ name: m[1], url: m[2] })).slice(0, max);
  const files = [], texts = [];
  for (const f of urls) {
    if (/\.docx(\?|$)/i.test(f.url) || /\.docx$/i.test(f.name)) {
      const buf = await readStoredFile(f.url).catch(() => null); const t = buf ? docxText(buf) : "";
      if (t) texts.push(`--- ${f.name} (Word file) ---\n${t}`);
    } else {
      const img = await readImageForAi(f.url); if (img) files.push(img);
    }
  }
  const text = details.replace(/^[•◦] .+?: https?:\/\/\S+$/gm, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
  return { files, texts, text };
}

/** Drafts a CV from an order: { ok, cv } or { ok:false, error }. */
export async function cvDraft(r, budgetMs = 50000) {
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI is set up yet (Admin → Settings → Keys & connections)." };
  const details = String(r.details || "");
  const wantsLetter = /cover letter/i.test(r.interest || "") || /cover letter/i.test(details);
  const { files, texts, text } = await orderSources(r);
  const prompt = `Customer: ${clip(r.name, 80)}\nService ordered: ${clip(r.interest, 60)}\nPhone/contact on the order: ${clip(r.contact, 80)}\nEmail on the order: ${clip(r.email, 100)}\n\nOrder details:\n${text}\n\n${texts.join("\n\n")}${files.length ? `\n\n(${files.length} attached file(s): their old CV or the job advert. Read them.)` : ""}\n\nWrite the CV${wantsLetter ? " and the cover letter for the job in the advert/details" : ""} now.`;
  const system = SYSTEM.replace("LETTER", wantsLetter ? LETTER_YES : "null");
  const model = provider.name === "anthropic" ? process.env.ANTHROPIC_DESIGN_MODEL || "claude-haiku-5-5" : undefined;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt, images: files }]), system, [], budgetMs, { maxTokens: 5000, attemptMs: budgetMs - 1500, model });
    const t = String(out.text || ""), json = t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1);
    let cv; try { cv = JSON.parse(json); } catch { return { ok: false, error: "The AI didn't return a usable CV. Please try again." }; }
    const clean = cleanCv(cv);
    if (!clean.name && !clean.experience.length && !clean.education.length) return { ok: false, error: "Not enough details on this order to draft a CV. Ask the customer for their old CV or work history." };
    if (!wantsLetter) clean.letter = null;
    return { ok: true, cv: clean, by: out.provider || provider.name };
  } catch (err) {
    console.error("cv draft failed", err.code, err.message);
    return { ok: false, error: friendlyAiError(err) };
  }
}
