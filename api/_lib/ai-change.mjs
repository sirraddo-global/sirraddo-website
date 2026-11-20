// "Do it with AI": reads a customer's change request (text + photos), works out exactly what they want added,
// changed or removed, and applies it to their current website (same design, same text everywhere else).
//
// Two steps, both from admin → Clients → After launch → Show change requests:
//   1. planChange: the AI turns the request into a list of small, exact edits ("ops"). Nothing changes yet;
//      you see the list in plain words (and anything it couldn't do).
//   2. applyChange: the edits are made to the project form answers / website text / photos, the live site is
//      updated, the request is marked done and the customer is told. "Undo" puts everything back.
// The AI never rewrites the site: it only returns edits, and the code applies them. Text it wants to change must
// match the current text exactly, otherwise that edit is skipped and listed.
import { randomBytes } from "node:crypto";
import { q, ensureSchema, getPreviewById, sendEmail, emailConfigured, sendCustomerEmail, customerEmailConfigured, customerEmail, reference, esc } from "./store.mjs";
import { SITE, customerHtml } from "./automation.mjs";
import { shownReviews } from "./reviews.mjs";
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { kindFor } from "./brief-schema.mjs";
import { FUNCTION_BUDGET_MS, readImageForAi } from "./platform.mjs";
import { buildSiteModel, productPhotoFor } from "./sitegen.mjs";
import { markChange } from "./changes.mjs";

const isImg = (f) => /\.(jpe?g|png|webp|gif)$/i.test(f?.name || f?.url || "") || /^image\//.test(f?.type || "");
const mimeOf = (name) => ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" })[String(name).split(".").pop().toLowerCase()] || "image/jpeg";
const str = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);
const one = (v, max) => str(v, max).replace(/\s+/g, " ");
const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

export const INFO_FIELDS = {
  tagline: ["Slogan", 100], phone: ["Phone", 30], whatsapp: ["WhatsApp", 30], email: ["Email", 80], address: ["Address", 200],
  hours: ["Opening hours", 120], site_notice: ["Notice on the website", 200], delivery_areas: ["Delivery areas", 300],
  returns: ["Returns / refunds", 400], socials: ["Social media links", 400], colours: ["Brand colours", 100],
};

// ---------- The website text, split into blocks ----------
const FOOTER_RE = /\n---\n\*Draft written by AI[\s\S]*$/;
function splitDraft(md) {
  const s = String(md || "");
  const footer = (s.match(FOOTER_RE) || [""])[0];
  const blocks = s.replace(FOOTER_RE, "").split(/\n(?=## )/).map((text) => {
    const m = text.match(/^## Page:\s*(.+)/);
    return { page: m ? m[1].trim() : null, text: text.replace(/\s+$/, "") };
  });
  return { blocks, footer };
}
const joinDraft = ({ blocks, footer }) => blocks.map((b) => b.text).join("\n\n") + (footer ? "\n" + footer : "");
const findPage = (d, name) => d.blocks.find((b) => b.page && norm(b.page) === norm(name)) || d.blocks.find((b) => b.page && norm(b.page).includes(norm(name)));

// Drops (or renames) a product's AI description, so the product's own description shows instead.
function dropProductText(d, name, rename) {
  const blk = d.blocks.find((b) => !b.page && /^## Product descriptions/i.test(b.text));
  if (!blk) return;
  const lines = blk.text.split("\n");
  const out = [];
  let skip = false;
  for (const l of lines) {
    const m = l.match(/^###\s+(.+)/);
    if (m) {
      skip = norm(m[1]) === norm(name);
      if (skip && rename) { out.push(`### ${rename}`); skip = "keep"; continue; }
    }
    if (skip === true) continue;
    out.push(l);
  }
  blk.text = out.join("\n");
}

// ---------- What the AI sees ----------
function context(row) {
  const b = row.brief || {};
  const files = row.brief_files || {};
  const kind = kindFor(row.interest);
  const site = buildSiteModel(row);
  const lines = [`Business: ${site.name}. Package: ${kind === "store" ? "Online store" : kind === "starter" ? "Starter website" : "Business website"}.`];
  lines.push("", "CONTACT AND OTHER DETAILS (field: value)");
  for (const k of Object.keys(INFO_FIELDS)) lines.push(`${k}: ${b[k] ? one(b[k], 400) : "(empty)"}`);
  if (kind === "store") {
    lines.push("", "PRODUCTS (number. name | price | category | description | photo)");
    (b.products || []).forEach((p, i) => {
      if (!p.name) return;
      const sp = site.products.find((x) => x.i === i);
      const ph = sp ? productPhotoFor(site, sp) : null;
      lines.push(`${i + 1}. ${one(p.name, 80)} | ${one(p.price, 30) || "-"} | ${one(p.category, 40) || "-"} | ${one(sp?.text || p.details, 200) || "-"} | ${ph ? ph.name : "no photo"}${p.soldout ? " | SOLD OUT" : ""}`);
    });
  }
  if ((b.services || []).length) {
    lines.push("", "SERVICES (number. name | description | price)");
    b.services.forEach((s, i) => s.name && lines.push(`${i + 1}. ${one(s.name, 80)} | ${one(s.details, 200) || "-"} | ${one(s.price, 30) || "-"}`));
  }
  const photos = (files.photos || []).filter(isImg);
  lines.push("", "WEBSITE PHOTOS (the first one is the big photo at the top of the home page)");
  photos.forEach((f, i) => lines.push(`G${i + 1}. ${f.name}`));
  if (!photos.length) lines.push("(none)");
  lines.push("", "WEBSITE TEXT (pages, in order)", String(row.draft_md || "").replace(FOOTER_RE, "").slice(0, 40000));
  return lines.join("\n");
}

const RULES = `You update an existing small-business website exactly as the owner asks in their change request.
Return ONLY a JSON object, no other text:
{"understood": "<one sentence: what they want>",
 "ops": [ ...edits... ],
 "not_done": ["<anything they asked that these edits can't do, or that is unclear, in plain words>"]}

Edits you can use (use only these; numbers refer to the lists below):
{"op":"add_product","name":"","price":"","category":"","details":"<1–2 friendly sentences; sizes/colours exactly as given>","photo":"A1"}
{"op":"update_product","product":3, ...only the fields that change: "name","price","category","details","photo":"A1","stock":"5"}
{"op":"remove_product","product":3}
{"op":"add_service","name":"","details":"","price":""}
{"op":"update_service","service":2, ...only the fields that change: "name","details","price"}
{"op":"remove_service","service":2}
{"op":"set_info","field":"<one of the CONTACT AND OTHER DETAILS fields>","value":"<new value, empty to remove>"}
{"op":"replace_text","page":"<page name>","find":"<text copied EXACTLY from the website text, as short as possible but unique>","replace":"<new text; empty to delete it>"}
{"op":"add_page","name":"<page name>","text":"<the page in the same format as the existing pages, starting with ## Page: <name>>"}
{"op":"remove_page","page":"<page name>"}
{"op":"add_photo","photo":"A2","first":false}   (adds to the website photos; first:true makes it the big top photo)
{"op":"remove_photo","photo":"G3"}
{"op":"set_logo","photo":"A1"}

Rules:
- Do exactly what they asked: no more, no less. Never change anything they didn't mention. Keep their wording, prices and spellings.
- Prices: write them as the owner did (e.g. "15000" or "₦15,000").
- A request can add AND remove AND change things at once: return an edit for each part.
- Attached files are A1, A2…; match photos to products by what the request says, the file name and what the photo shows.
- For wording changes use replace_text with the smallest exact piece of current text. Never invent facts (prices, years, awards).
- New colours: {"op":"set_info","field":"colours","value":"<the colours they asked, e.g. navy and gold>"}. Fonts, layout or "a new design" can't be done with these edits: put them in not_done ("needs a new design").
- If something is unclear (e.g. which product they mean), don't guess: put it in not_done.
- If nothing can be done, return "ops": [].`;

function parseJson(text) {
  const s = String(text || "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  const a = s.indexOf("{"), z = s.lastIndexOf("}");
  if (a < 0 || z < a) throw new Error("The AI didn't return a list of edits. Please try again.");
  return JSON.parse(s.slice(a, z + 1));
}

const OPS = ["add_product", "update_product", "remove_product", "add_service", "update_service", "remove_service", "set_info", "replace_text", "add_page", "remove_page", "add_photo", "remove_photo", "set_logo"];

// Plain-words line for one edit (shown before applying).
export function describeOp(o, row) {
  const b = row.brief || {};
  const pn = (n) => b.products?.[n - 1]?.name || `product ${n}`;
  const sn = (n) => b.services?.[n - 1]?.name || `service ${n}`;
  const att = (a) => (a ? ` (photo ${a})` : "");
  const ch = (o) => ["name", "price", "category", "details", "stock"].filter((k) => o[k] !== undefined).map((k) => k === "details" ? "description" : `${k} → ${o[k]}`).join(", ");
  switch (o.op) {
    case "add_product": return `Add product: ${o.name}${o.price ? ` (${o.price})` : ""}${att(o.photo)}`;
    case "update_product": return `Change ${pn(o.product)}: ${[ch(o), o.photo ? `new photo ${o.photo}` : ""].filter(Boolean).join(", ")}`;
    case "remove_product": return `Remove product: ${pn(o.product)}`;
    case "add_service": return `Add service: ${o.name}${o.price ? ` (${o.price})` : ""}`;
    case "update_service": return `Change ${sn(o.service)}: ${ch(o)}`;
    case "remove_service": return `Remove service: ${sn(o.service)}`;
    case "set_info": return `${INFO_FIELDS[o.field]?.[0] || o.field}: ${o.value || "(removed)"}`;
    case "replace_text": return o.replace ? `${o.page || "Text"}: "${o.find}" → "${o.replace}"` : `${o.page || "Text"}: remove "${o.find}"`;
    case "add_page": return `Add page: ${o.name}`;
    case "remove_page": return `Remove page: ${o.page}`;
    case "add_photo": return `Add photo ${o.photo} to the website${o.first ? " (as the big top photo)" : ""}`;
    case "remove_photo": return `Remove website photo ${o.photo} (${(row.brief_files?.photos || []).filter(isImg)[Number(String(o.photo).slice(1)) - 1]?.name || "?"})`;
    case "set_logo": return `New logo: photo ${o.photo}`;
    default: return o.op;
  }
}

async function loadRow(id) {
  await ensureSchema();
  const rows = await q(`SELECT id, name, business, contact, interest, brief, brief_files, draft_md, hosting FROM customer_requests WHERE id = $1`, [id]);
  return rows[0] || null;
}
async function loadChange(id, changeId) {
  const rows = await q(`SELECT * FROM change_requests WHERE id = $1 AND request_id = $2`, [changeId, id]);
  return rows[0] || null;
}

// Step 1: ask the AI what to do. Saves and returns the plan; changes nothing on the site.
export async function planChange(id, changeId, budgetMs = FUNCTION_BUDGET_MS() - 2500) {
  const row = await loadRow(id);
  const c = row && (await loadChange(id, changeId));
  if (!c) throw Object.assign(new Error("Not found"), { status: 404 });
  if (!row.draft_md) throw new Error("This website has no text yet. Write the website text first.");
  const provider = pickProvider();
  if (!provider) throw new Error("No AI key is set in Netlify (GEMINI_API_KEY or ANTHROPIC_API_KEY).");
  const files = (c.files || []).filter((f) => f && f.url);
  const read = await Promise.all(files.slice(0, 3).map((f) => (isImg(f) ? readImageForAi(f.url) : null)));
  const images = read.filter(Boolean);
  const seen = read.map((im, i) => (im ? `A${i + 1}` : null)).filter(Boolean);
  const prompt = `${RULES}

${context(row)}

CHANGE REQUEST FROM THE OWNER
${c.body}
${c.plan?.customer?.text ? `\nTHEY LOOKED AT A PREVIEW OF YOUR LAST ATTEMPT AND SAID (follow this; it wins over the request above where they differ):\n${c.plan.customer.text}\n` : ""}
ATTACHED FILES
${files.length ? files.map((f, i) => `A${i + 1}. ${f.name}${isImg(f) ? " (photo)" : " (not a photo)"}`).join("\n") : "(none)"}${seen.length ? `\n(Attached for you to look at, in this order: ${seen.join(", ")}.)` : ""}`;
  let out;
  try {
    out = await provider.call(provider.start([{ role: "user", content: prompt, images }]), "You edit websites precisely and reply with JSON only.", [], budgetMs, { maxTokens: 4000, attemptMs: Math.max(8000, budgetMs - 1500) });
  } catch (e) { throw new Error(friendlyAiError(e)); }
  const j = parseJson(out.text);
  const ops = (Array.isArray(j.ops) ? j.ops : []).filter((o) => o && OPS.includes(o.op)).slice(0, 80);
  const plan = {
    view_token: c.plan?.view_token || randomBytes(18).toString("base64url"), // the preview link stays the same
    understood: one(j.understood, 400),
    ops,
    lines: ops.map((o) => describeOp(o, row)),
    not_done: (Array.isArray(j.not_done) ? j.not_done : []).map((s) => one(s, 300)).filter(Boolean).slice(0, 10),
    at: new Date().toISOString(),
    by: provider.name,
  };
  await q(`UPDATE change_requests SET plan = $1::jsonb WHERE id = $2`, [JSON.stringify(plan), c.id]);
  return plan;
}

// Applies the edits to copies of the form answers, files and text. Returns them with a line per edit.
export function applyOps(row, ops, attachments) {
  const brief = JSON.parse(JSON.stringify(row.brief || {}));
  const files = JSON.parse(JSON.stringify(row.brief_files || {}));
  const d = splitDraft(row.draft_md);
  const results = [];
  const att = (ref) => {
    const m = String(ref || "").match(/^A(\d+)$/i);
    const f = m && attachments[Number(m[1]) - 1];
    return f && isImg(f) ? { url: f.url, name: f.name, type: mimeOf(f.name) } : null;
  };
  const addFile = (field, f, first) => {
    const list = (files[field] = (files[field] || []).filter((x) => x.url !== f.url));
    if (first) list.unshift(f); else list.push(f);
  };
  const site0 = buildSiteModel(row);
  const productPhoto = (idx) => { const sp = site0.products.find((x) => x.i === idx); return sp ? productPhotoFor(site0, sp) : null; };
  const products = (brief.products = brief.products || []);
  const services = (brief.services = brief.services || []);
  const gone = { products: new Set(), services: new Set() }; // removed at the end, so numbers stay right
  const pageList = brief.pages_10 ? "pages_10" : "pages";

  for (const o of ops) {
    const line = describeOp(o, row);
    const ok = (note) => results.push({ ok: true, text: line + (note ? ` (${note})` : "") });
    const skip = (why) => results.push({ ok: false, text: `${line}: not done, ${why}` });
    try {
      if (o.op === "add_product") {
        const name = one(o.name, 80);
        if (!name) { skip("no name"); continue; }
        if (products.some((p, i) => !gone.products.has(i) && norm(p.name) === norm(name))) { skip("a product with that name already exists"); continue; }
        const p = { name, price: one(o.price, 40), category: one(o.category, 40), details: str(o.details, 400) };
        const f = att(o.photo);
        if (f) { addFile("product_photos", f); p.photo = f.url; }
        products.push(p);
        ok(o.photo && !f ? "photo not found" : "");
      } else if (o.op === "update_product" || o.op === "remove_product") {
        const idx = Number(o.product) - 1;
        const p = products[idx];
        if (!p || gone.products.has(idx)) { skip("product not found"); continue; }
        const old = productPhoto(idx);
        if (o.op === "remove_product") {
          gone.products.add(idx);
          if (old) files.product_photos = (files.product_photos || []).filter((x) => x.url !== old.url); // so it isn't given to another product
          dropProductText(d, p.name);
          ok();
          continue;
        }
        if (o.name !== undefined && one(o.name, 80)) { dropProductText(d, p.name, one(o.name, 80)); p.name = one(o.name, 80); }
        if (o.price !== undefined) p.price = one(o.price, 40);
        if (o.category !== undefined) p.category = one(o.category, 40);
        if (o.details !== undefined) { p.details = str(o.details, 400); dropProductText(d, p.name); }
        if (o.stock !== undefined) {
          const s = String(o.stock).trim();
          if (s === "") delete p.stock; else if (/^\d{1,6}$/.test(s)) { p.stock = s; if (Number(s) > 0) delete p.soldout; }
        }
        if (o.photo) {
          const f = att(o.photo);
          if (!f) { skip("photo not found"); continue; }
          if (old) files.product_photos = (files.product_photos || []).filter((x) => x.url !== old.url);
          addFile("product_photos", f);
          p.photo = f.url;
        }
        ok();
      } else if (o.op === "add_service") {
        const name = one(o.name, 80);
        if (!name) { skip("no name"); continue; }
        services.push({ name, details: str(o.details, 300), price: one(o.price, 40) });
        ok();
      } else if (o.op === "update_service" || o.op === "remove_service") {
        const idx = Number(o.service) - 1;
        const s = services[idx];
        if (!s || gone.services.has(idx)) { skip("service not found"); continue; }
        if (o.op === "remove_service") { gone.services.add(idx); ok(); continue; }
        if (o.name !== undefined && one(o.name, 80)) s.name = one(o.name, 80);
        if (o.details !== undefined) s.details = str(o.details, 300);
        if (o.price !== undefined) s.price = one(o.price, 40);
        ok();
      } else if (o.op === "set_info") {
        const spec = INFO_FIELDS[o.field];
        if (!spec) { skip("unknown detail"); continue; }
        const v = o.field === "socials" || o.field === "returns" ? str(o.value, spec[1]) : one(o.value, spec[1]);
        if (o.field === "phone" && !v) { skip("the phone number can't be removed"); continue; }
        if ((o.field === "phone" || o.field === "whatsapp") && v && !/^\+?[\d\s()-]{7,20}$/.test(v)) { skip("that isn't a phone number"); continue; }
        if (o.field === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { skip("that isn't an email address"); continue; }
        brief[o.field] = v;
        // A site with a custom AI design keeps that design's colours: say so, so you make a new design with them.
        if (o.field === "colours" && row.design_css) ok("saved; this site has a custom AI design, so for the new colours make a new one: Website preview → Designs → Add another AI design, note the colours, choose it, then Update live site");
        else ok();
      } else if (o.op === "replace_text") {
        const find = String(o.find || "");
        if (find.trim().length < 2) { skip("nothing to find"); continue; }
        const targets = o.page ? [findPage(d, o.page)].filter(Boolean) : d.blocks;
        let blk = targets.find((b) => b.text.includes(find));
        if (!blk) blk = d.blocks.find((b) => b.text.includes(find)); // right text, wrong page name
        if (!blk) { skip("couldn't find that text on the website"); continue; }
        if (blk.text.split(find).length > 2) { skip("that text appears more than once"); continue; }
        const rep = str(o.replace, 4000);
        blk.text = rep ? blk.text.replace(find, () => rep) : blk.text.replace(find, "").replace(/\n{3,}/g, "\n\n").replace(/^\*\*(?:Text|Heading):\*\*\s*$/gm, "");
        ok();
      } else if (o.op === "add_page") {
        const name = one(o.name, 40);
        if (!name) { skip("no page name"); continue; }
        if (findPage(d, name) && norm(findPage(d, name).page) === norm(name)) { skip("that page already exists"); continue; }
        let text = str(o.text, 12000).replace(/^#\s[^\n]*\n*/gm, "");
        text = text.replace(/^##\s+Page:[^\n]*/i, "").trim();
        if (text.length < 20) { skip("no text for the page"); continue; }
        const lastPage = d.blocks.map((b) => Boolean(b.page)).lastIndexOf(true);
        d.blocks.splice(lastPage + 1, 0, { page: name, text: `## Page: ${name}\n${text}` });
        if (Array.isArray(brief[pageList]) && !brief[pageList].some((p) => norm(p) === norm(name))) brief[pageList].push(name);
        ok();
      } else if (o.op === "remove_page") {
        const blk = findPage(d, o.page || "");
        if (!blk) { skip("page not found"); continue; }
        if (d.blocks.findIndex((b) => b.page) === d.blocks.indexOf(blk) || /^home$/i.test(blk.page)) { skip("the home page can't be removed"); continue; }
        d.blocks.splice(d.blocks.indexOf(blk), 1);
        if (Array.isArray(brief[pageList])) brief[pageList] = brief[pageList].filter((p) => norm(p) !== norm(blk.page));
        ok();
      } else if (o.op === "add_photo" || o.op === "set_logo") {
        const f = att(o.photo);
        if (!f) { skip("photo not found"); continue; }
        if (o.op === "set_logo") files.logo = [f]; else addFile("photos", f, Boolean(o.first));
        ok();
      } else if (o.op === "remove_photo") {
        const list = (files.photos || []).filter(isImg);
        const f = list[Number(String(o.photo || "").replace(/^G/i, "")) - 1];
        if (!f) { skip("photo not found"); continue; }
        files.photos = (files.photos || []).filter((x) => x.url !== f.url);
        ok();
      } else skip("unknown edit");
    } catch (e) { skip(e.message); }
  }
  brief.products = products.filter((_, i) => !gone.products.has(i));
  brief.services = services.filter((_, i) => !gone.services.has(i));
  if (!brief.products.length && !(row.brief || {}).products) delete brief.products;
  if (!brief.services.length && !(row.brief || {}).services) delete brief.services;
  return { brief, files, md: joinDraft(d), results };
}

// Step 2: apply the saved plan, update the live site, mark the request done and tell the customer.
export async function applyChange(id, changeId, { tell = true, by = "admin" } = {}) {
  const row = await loadRow(id);
  const c = row && (await loadChange(id, changeId));
  if (!c) throw Object.assign(new Error("Not found"), { status: 404 });
  const plan = c.plan;
  if (!plan?.ops) throw new Error('Tap "Do it with AI" first.');
  if (plan.applied_at) throw new Error("This was already applied. Use Undo first if you want to apply it again.");
  const { brief, files, md, results } = applyOps(row, plan.ops, c.files || []);
  const done = results.filter((r) => r.ok);
  if (!done.length) throw new Error("None of the edits could be made: " + results.map((r) => r.text).join("; "));
  const before = { brief: row.brief, brief_files: row.brief_files, draft_md: row.draft_md };
  await q(`UPDATE customer_requests SET brief = $1::jsonb, brief_files = $2::jsonb, draft_md = $3, updated_at = now() WHERE id = $4`,
    [JSON.stringify(brief), JSON.stringify(files), md, id]);
  const live = await republish(id, row);
  const saved = { ...plan, applied_at: new Date().toISOString(), applied_by: by, results, live, before };
  await q(`UPDATE change_requests SET plan = $1::jsonb WHERE id = $2`, [JSON.stringify(saved), c.id]);
  let change = c;
  if (tell) {
    const note = "Done: " + done.map((r) => r.text).join("; ") + (results.length > done.length ? ". We'll be in touch about the rest." : ".");
    change = await markChange(id, c.id, { done: true, note: note.slice(0, 1000) });
  }
  return { results, live, change };
}

// Puts the form answers, photos and text back as they were before the AI change, and updates the live site.
export async function undoChange(id, changeId) {
  const c = await loadChange(id, changeId);
  const b = c?.plan?.before;
  if (!b) throw new Error("Nothing to undo.");
  await q(`UPDATE customer_requests SET brief = $1::jsonb, brief_files = $2::jsonb, draft_md = $3, updated_at = now() WHERE id = $4`,
    [JSON.stringify(b.brief || {}), JSON.stringify(b.brief_files || {}), b.draft_md, id]);
  const live = await republish(id, await loadRow(id));
  const { before, applied_at, results, ...rest } = c.plan;
  await q(`UPDATE change_requests SET plan = $1::jsonb, status = 'open', done_at = NULL WHERE id = $2`, [JSON.stringify({ ...rest, undone_at: new Date().toISOString() }), c.id]);
  return { live };
}

async function republish(id, row) {
  const h = row?.hosting || {};
  if (!h.project || h.pausedAt) return "not published yet (saved; it will show when the site goes live)";
  try {
    const { publish } = await import("./golive.mjs");
    await publish(id, { force: true });
    return "updated";
  } catch (e) {
    console.error("ai change publish failed", id, e);
    return "NOT updated: " + e.message + ' (saved; tap "Update live site")';
  }
}


// ---------- Preview of the changes (current website + the edits), for you and the customer ----------
export const changeViewUrl = (plan) => `${SITE}/preview?c=${encodeURIComponent(plan.view_token)}`;

// The customer's site as it would look with the edits: same design, same everything else.
export async function changePreview(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) return null;
  await ensureSchema();
  const [c] = await q(`SELECT * FROM change_requests WHERE plan->>'view_token' = $1`, [token]);
  if (!c?.plan?.ops) return null;
  const row = await getPreviewById(c.request_id);
  if (!row?.draft_md) return null;
  row.reviews = await shownReviews(row.id).catch(() => null);
  if (c.plan.applied_at) return { c, row, results: c.plan.results || [] }; // already live: show the site as it is now
  const { brief, files, md, results } = applyOps(row, c.plan.ops, c.files || []);
  return { c, row: { ...row, brief, brief_files: files, draft_md: md }, results };
}

// Emails the customer (our direct customer) the preview link. WhatsApp is sent from admin.
export async function sendChangePreview(id, changeId) {
  const c = await loadChange(id, changeId);
  if (!c?.plan?.view_token) throw new Error('Tap "Do it with AI" first.');
  const row = await getPreviewById(id);
  const to = customerEmail(row);
  if (!to) throw new Error("This customer has no email address. Send the preview on WhatsApp instead.");
  if (!customerEmailConfigured()) throw new Error("Emailing customers isn't set up yet. Send the preview on WhatsApp instead.");
  await sendCustomerEmail(to, "Your website changes are ready to view", customerHtml(row, [
    `We've made the changes you asked for: <i>"${esc(c.body.length > 200 ? c.body.slice(0, 200) + "…" : c.body)}"</i>`,
    "Please look at the preview. If it's right, tap <b>Put these changes live</b> at the bottom of the page and your website updates straight away. If something isn't right, tell us there.",
  ], { url: changeViewUrl(c.plan), label: "View the changes" }));
  await savePlan(c.id, { ...c.plan, sent_at: new Date().toISOString() });
  return { to };
}
export async function markPreviewSent(id, changeId) {
  const c = await loadChange(id, changeId);
  if (!c?.plan?.view_token) throw new Error('Tap "Do it with AI" first.');
  await savePlan(c.id, { ...c.plan, sent_at: new Date().toISOString() });
  return changeViewUrl(c.plan);
}
const savePlan = (cid, plan) => q(`UPDATE change_requests SET plan = $1::jsonb WHERE id = $2`, [JSON.stringify(plan), cid]);

// The customer's answer on the preview: "approved" puts the edits live; "changes" sends you what's wrong.
export async function answerChangePreview(token, action, text) {
  const v = await changePreview(token);
  if (!v) throw Object.assign(new Error("This link is not valid."), { status: 404 });
  const { c } = v;
  if (c.plan.applied_at) return { message: "These changes are already live on your website. Thank you!" };
  const who = v.row.brief?.business_name || v.row.business || v.row.name;
  if (action === "approved") {
    const out = await applyChange(c.request_id, c.id, { tell: false, by: "customer" });
    await q(`UPDATE change_requests SET status = 'done', done_at = now(), note = COALESCE(note, $1) WHERE id = $2`, ["Approved by the customer on the preview.", c.id]);
    if (emailConfigured()) {
      await sendEmail(`✅ ${who} approved their changes (${reference(c.request_id)})`,
        `<p><b>${esc(who)}</b> approved the preview of their change request and it was applied.</p><ul>${out.results.map((r) => `<li>${r.ok ? "✓" : "✗"} ${esc(r.text)}</li>`).join("")}</ul><p>Live site: ${esc(out.live)}.</p><p><a href="${SITE}/admin">Open admin</a> (Undo is there if needed).</p>`).catch(() => {});
    }
    return { message: out.live === "updated" ? "Done! Your website is updated. You may need to refresh it to see the changes." : "Thank you! We've saved your changes and will put them live shortly." };
  }
  const note = String(text || "").trim().slice(0, 3000);
  if (!note) throw Object.assign(new Error("Please write what isn't right."), { status: 400 });
  await savePlan(c.id, { ...c.plan, customer: { result: "changes", text: note, at: new Date().toISOString() } });
  if (emailConfigured()) {
    await sendEmail(`✏️ ${who} wants something different in their changes (${reference(c.request_id)})`,
      `<p><b>${esc(who)}</b> looked at the preview of their changes and said:</p><blockquote style="border-left:3px solid #D9A21B;margin:0;padding:4px 12px;white-space:pre-wrap">${esc(note)}</blockquote><p>In admin, tap <b>Ask AI again</b> on the request (it reads this too), check the new preview and send it again.</p><p><a href="${SITE}/admin">Open admin</a></p>`).catch(() => {});
  }
  return { message: "Thank you! We've got your note and will send you an updated preview." };
}
