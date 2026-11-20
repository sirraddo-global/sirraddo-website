// Builds a customer's website from their project form (brief), uploaded photos and the AI text (draft_md).
// Used for the preview link (/preview?t=...) and for "Download site" in admin (a .zip ready to upload to any host).
// No AI here: it only lays out what is already written, so the result is predictable.
import { kindFor } from "./brief-schema.mjs";
import { SITE_URL } from "../../site.config.mjs";
import { ACCOUNT_CSS, ACCOUNT_JS } from "./storejs.mjs";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- Reading the AI text ----------
// "## Page: Name", then "**SEO title:**", "**Meta description:**", then "### Section" blocks with
// "**Headline:**", "**Heading:**", "**Text:**"… lines. Anything else is kept as paragraphs.
const FIELD_KEYS = ["headline", "subheadline", "button text", "heading"];

export function parseDraft(md) {
  const pages = [];
  const extras = {};
  let page = null, sec = null, extra = null;
  for (const raw of String(md || "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(/^##\s+Page:\s*(.+)/i))) {
      page = { name: m[1].trim(), title: "", meta: "", sections: [] };
      pages.push(page); sec = null; extra = null; continue;
    }
    if ((m = line.match(/^##\s+(.+)/))) { page = null; sec = null; extra = m[1].trim(); extras[extra] = []; continue; }
    if (/^---+\s*$/.test(line)) { page = null; sec = null; extra = null; continue; }
    if (/^#\s/.test(line)) continue;
    if (!page) { if (extra) extras[extra].push(line); continue; }
    if ((m = line.match(/^(?:\*\*)?(SEO title|Meta description):?(?:\*\*)?:?\s*(.*)/i))) {
      page[/seo/i.test(m[1]) ? "title" : "meta"] = m[2].trim(); continue;
    }
    if ((m = line.match(/^###\s+(.+)/))) { sec = { name: m[1].trim(), fields: {}, body: [] }; page.sections.push(sec); continue; }
    if (!line.trim()) { if (sec) sec.body.push(""); continue; }
    if (!sec) { sec = { name: "", fields: {}, body: [] }; page.sections.push(sec); }
    const t = line.trimStart();
    if ((m = t.match(/^\*\*([^*]{1,40}?):?\*\*:?\s*(.*)/)) || (m = t.match(/^(headline|subheadline|sub-headline|button text|button|heading|text|answer):\s*(.*)/i))) {
      let key = m[1].trim().toLowerCase();
      if (key === "sub-headline") key = "subheadline";
      if (key === "button") key = "button text";
      if (FIELD_KEYS.includes(key)) { sec.fields[key] = m[2].trim(); continue; }
      if (key === "text" || key === "answer") { sec.body.push(m[2].trim()); continue; }
    }
    sec.body.push(line);
  }
  return { pages, extras };
}

export const countPlaceholders = (md) => (String(md || "").match(/\[ADD:[^\]]*\]/g) || []).length;

// ---------- Look and feel ----------
const THEMES = {
  "Clean and modern": { primary: "#14324F", accent: "#1E9E8F", radius: "12px", head: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", weight: 800 },
  "Bold and colourful": { primary: "#3B1C7A", accent: "#F2762E", radius: "14px", head: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", weight: 900 },
  "Elegant and classy": { primary: "#1C1C1E", accent: "#B8913A", radius: "4px", head: "Georgia, 'Times New Roman', serif", weight: 700 },
  "Simple and friendly": { primary: "#1F5E3B", accent: "#F2B33D", radius: "18px", head: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", weight: 800 },
};
const COLOURS = {
  navy: "#14254F", blue: "#1D4ED8", "light blue": "#3B9AE1", "sky blue": "#3B9AE1", teal: "#0F766E", green: "#1F7A45",
  "dark green": "#14532D", lime: "#65A30D", red: "#C62828", maroon: "#7A1F2B", wine: "#6D1A36", burgundy: "#6D1A36",
  pink: "#D63384", purple: "#5B2A86", violet: "#6D28D9", orange: "#E8701A", gold: "#C9971C", yellow: "#E8B600",
  brown: "#6B4423", black: "#1A1A1A", grey: "#4B5563", gray: "#4B5563", silver: "#9CA3AF", cream: "#F3E9D2", white: "#FFFFFF",
};
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function themeFor(brief) {
  const base = { ...(THEMES[brief?.style] || THEMES["Clean and modern"]) };
  const text = String(brief?.colours || "").toLowerCase();
  const found = [];
  for (const name of Object.keys(COLOURS).sort((a, b) => b.length - a.length)) {
    const i = text.indexOf(name);
    if (i !== -1 && !found.some((f) => i >= f.i && i < f.i + f.len)) found.push({ i, len: name.length, hex: COLOURS[name] });
  }
  const picked = found.sort((a, b) => a.i - b.i).map((f) => f.hex).filter((h) => h !== "#FFFFFF");
  if (picked.length) {
    // The darkest brand colour carries white text (header, buttons); a lighter one becomes the accent.
    const dark = picked.filter((h) => luminance(h) < 0.2).sort((a, b) => luminance(a) - luminance(b));
    if (dark.length) base.primary = dark[0];
    const rest = picked.filter((h) => h !== base.primary);
    if (rest.length) base.accent = rest[0];
    else if (!dark.length) base.accent = picked[0];
  }
  base.accentText = luminance(base.accent) > 0.35 ? "#1A1A1A" : "#FFFFFF";
  return base;
}

// ---------- Helpers ----------
export function slugify(name) {
  const s = String(name).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return s || "page";
}
const pageKind = (name) => {
  const n = name.toLowerCase();
  if (/^home/.test(n)) return "home";
  if (/gallery|portfolio|our work/.test(n)) return "gallery";
  if (/testimonial|review/.test(n)) return "testimonials";
  if (/contact/.test(n)) return "contact";
  if (/location|map/.test(n)) return "location";
  if (/blog|news/.test(n)) return "blog";
  if (/shop|store|product/.test(n)) return "shop";
  if (/price|pricing/.test(n)) return "prices";
  if (/faq|question/.test(n)) return "faq";
  if (/service/.test(n)) return "services";
  return "other";
};
// Nigerian numbers to WhatsApp format: 0816… -> 234816…
export function waNumber(v) {
  let d = String(v || "").replace(/\D/g, "");
  if (d.startsWith("0") && d.length === 11) d = "234" + d.slice(1);
  if (d.length === 10 && /^[789]/.test(d)) d = "234" + d;
  return d.length >= 10 ? d : "";
}
// "4100" -> "₦4,100"; text like "from ₦5k" or "Call for price" stays as written.
export function naira(p) {
  const s = String(p ?? "").trim();
  const n = s.replace(/^(₦|N|NGN)\s*/i, "").replace(/,/g, "");
  return /^\d+(\.\d{1,2})?$/.test(n) ? "₦" + Number(n).toLocaleString("en-NG") : s;
}
// "₦4,100" / "4100" -> 4100. Anything else (e.g. "from 5k") -> null: those products are ordered on WhatsApp only.
export function priceAmount(p) {
  const s = String(p ?? "").trim().replace(/^(₦|N|NGN)\s*/i, "").replace(/,/g, "");
  return /^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : null;
}
const isImage = (f) => /^image\//.test(f?.type || "") || /\.(jpe?g|png|webp|gif|svg)$/i.test(f?.name || f?.url || "");

// On a live site a sentence that still has an [ADD: …] gap is left out (the preview still shows it, so it can be filled in).
function dropTodo(text) {
  if (!/\[ADD:/.test(text)) return text;
  const parts = String(text).match(/[^.!?]+[.!?]*\s*/g) || [];
  return parts.filter((x) => !/\[ADD:/.test(x)).join("").replace(/\[ADD:[^\]]*\]/g, "").trim();
}
function inline(text, mode) {
  if (mode !== "preview") text = dropTodo(text);
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[ADD:\s*([^\]]*)\]/g, (_, what) => (mode === "preview" ? `<mark class="todo">To be added: ${what}</mark>` : `<mark class="todo">${what}</mark>`));
}
function blocks(lines, mode) {
  const out = [];
  let list = null;
  for (const line of lines) {
    if (mode !== "preview" && /\[ADD:/.test(line) && !dropTodo(line.replace(/^\s*(?:[-*•]|\d+\.|#{3,4})\s+/, "")).replace(/^(?:\*\*)?(?:text|answer|a)\s*:(?:\*\*)?\s*/i, "").trim()) continue;
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) {
      if (!list) { out.push("<ul>"); list = true; }
      const qa = m[1].match(/^(?:\*\*)?(.{6,160}?\?)(?:\*\*)?\s+(.+)$/);
      out.push(qa ? `<li class="qa"><strong>${inline(qa[1], mode)}</strong><br>${inline(qa[2], mode)}</li>` : `<li>${inline(m[1], mode)}</li>`);
      continue;
    }
    if (list) { out.push("</ul>"); list = null; }
    const h = line.match(/^#{3,4}\s+(.*)/);
    if (h) out.push(`<h3>${inline(h[1], mode)}</h3>`);
    // A stray "Text:" / "Answer:" label from the AI is dropped.
    else if (line.trim()) out.push(`<p>${inline(line.trim().replace(/^(?:\*\*)?(?:text|answer|a)\s*:(?:\*\*)?\s*/i, ""), mode)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

// ---------- The site model ----------
// Older AI descriptions mention the price ("... is available for ₦6,500."). The price card shows the real price, which the owner can change, so drop those sentences.
function noPrice(t) {
  const parts = String(t || "").match(/[^.!?]+[.!?]*\s*/g) || [];
  const kept = parts.filter((x) => !/₦\s?\d|\b(?:NGN|N)\s?(?:\d{1,3},\d{3}|\d{3,})/.test(x));
  return kept.join("").trim();
}
function bizEmail(row) {
  const h = row.hosting || {}, e = h.email;
  if (!h.domain || !e || e.status !== "active" || !(e.locals || []).length) return "";
  return `${e.locals.includes("info") ? "info" : e.locals[0]}@${h.domain}`;
}
// Bump this whenever the look or layout of customer sites changes: the 7am job then republishes every live site
// still built with an older version (text the owner hasn't published yet is never pushed).
export const SITE_LOOK = "2026-11-20";
// What the website owner sees in the "your website was improved" email: plain words, newest look first.
// Add an entry here every time SITE_LOOK changes.
export const SITE_LOOK_NOTES = {
  "2026-11-20": [
    "Online stores: more ways to pay, each one a switch you control in My store: online payment, bank transfer to your account, and pay on delivery.",
    "Online stores with customer accounts: buyers can sign in, see their orders and receipts, order again and save their delivery addresses.",
  ],
  "2026-11-17b": [
    "Your customers can now leave a star review on your website. Nothing shows until you approve it with your private Manage link.",
    "Products show as neat cards (photo, name and price). Tapping one opens the full description, with Add to cart for online stores.",
    "A short row of reasons to choose you (delivery, opening hours, location) now sits under the top of your home page, using only what you told us.",
    "Your photo gallery shows 2 photos per row on phones.",
    "Once your business email is set up, your website shows it (e.g. info@yourdomain) instead of your Gmail.",
    "Online stores: after paying, buyers save or share their receipt as a picture or PDF.",
  ],
};
export function buildSiteModel(row) {
  const b = row.brief || {};
  const files = row.brief_files || {};
  const kind = kindFor(row.interest);
  const { pages, extras } = parseDraft(row.draft_md);
  const list = pages.length ? pages : [{ name: "Home", title: "", meta: "", sections: [] }];
  const seen = new Set();
  const outPages = list.map((p, i) => {
    let slug = i === 0 || pageKind(p.name) === "home" ? "index" : slugify(p.name);
    while (seen.has(slug)) slug += "-2";
    seen.add(slug);
    return { ...p, slug, kind: pageKind(p.name) };
  });
  if (kind === "store" && (b.products || []).length && !outPages.some((p) => p.kind === "shop")) {
    outPages.splice(1, 0, { name: "Shop", slug: "shop", kind: "shop", title: "", meta: "", sections: [] });
  }
  // Product descriptions written by the AI, by product name.
  const productText = {};
  for (const [k, lines] of Object.entries(extras)) {
    if (!/product/i.test(k)) continue;
    let cur = null;
    for (const l of lines) {
      const m = l.match(/^###\s+(.+)/);
      if (m) { cur = m[1].trim().toLowerCase(); productText[cur] = []; } else if (cur && l.trim()) productText[cur].push(l.trim());
    }
  }
  const blogPosts = Object.entries(extras).filter(([k]) => /^blog post/i.test(k)).map(([k, lines]) => ({
    title: k.replace(/^blog post\s*\d*:?\s*/i, "") || "Blog post",
    body: lines.filter((l) => !/^\*\*meta description/i.test(l)),
  }));
  const socials = String(b.socials || "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  const domain = row.hosting?.domain;
  // Tag for the "Get a website like this" link in the footer (Dashboard → Where customers come from: client-site / <tag>).
  const creditTag = String(domain || (row.website_url || "").replace(/^https?:\/\//, "") || "site-" + row.id).toLowerCase().replace(/^www\./, "").replace(/\.(com\.ng|com|ng|org|net)(\/.*)?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "site";
  return {
    kind,
    creditTag,
    // White label (e.g. sites sold through an agency): no "Website by SIRRADDO" in the footer.
    noCredit: Boolean(row.hosting?.noCredit),
    // Where the site lives (for Google: canonical links, sitemap, share previews). Empty until it has an address.
    baseUrl: domain ? `https://${domain}` : row.hosting?.pagesUrl || (/^https:\/\//.test(row.website_url || "") ? row.website_url.replace(/\/+$/, "") : ""),
    name: b.business_name || row.business || row.name,
    tagline: b.tagline || "",
    notice: String(b.site_notice || "").trim().slice(0, 200), // short note from the owner (Manage my store)
    phone: b.phone || row.contact || "",
    whatsapp: waNumber(b.whatsapp || b.phone || row.contact),
    // Once email forwarding works, the site shows their business address (info@theirdomain) instead of their Gmail.
    email: bizEmail(row) || b.email || "",
    address: b.address || "",
    hours: b.hours || "",
    socials,
    logo: (files.logo || []).find(isImage) || null,
    photos: (files.photos || []).filter(isImage),
    productPhotos: (files.product_photos || []).filter(isImage),
    services: (b.services || []).filter((s) => s.name),
    // i = position in the form (the cart and checkout use it); amount = price as a number, if it is one.
    products: (b.products || []).map((p, i) => ({ ...p, i })).filter((p) => p.name).map((p, pos) => ({
      ...p, pos, amount: priceAmount(p.price), text: noPrice((productText[p.name.toLowerCase()] || []).join(" ")),
    })),
    shopToken: row.shop_token || row.shop?.token || "",
    statsKey: row.hosting?.statsKey || "",
    reviews: row.reviews?.list?.length ? row.reviews : { list: [], count: 0, average: 0 }, // approved in Manage my store
    testimonials: String(b.testimonials || "").split(/\n+/).map((s) => s.trim()).filter(Boolean),
    delivery: b.delivery_areas || "",
    returns: b.returns || "",
    blogPosts,
    theme: themeFor(b),
    pages: outPages,
    designCss: row.design_css || "",
  };
}

// A ready-made dark look in the customer's own accent colour (offered as one of the preview designs).
export function darkDesignCss(t) {
  const glow = luminance(t.accent) > 0.12 ? t.accent : "#E8C268";
  return `/* Dark design */
body{background:#0E1116;color:#D7DCE4}
h1,h2,h3{color:#F4F6FA}a{color:${glow}}
.top{background:#090B0F;border-bottom:1px solid #222833}
.brand img{background:#fff}
nav a[aria-current]{background:rgba(255,255,255,.1);box-shadow:inset 0 -2px 0 ${glow}}
.hero{background:radial-gradient(1200px 500px at 85% -10%,${t.primary} 0%,#0E1116 65%);border-bottom:1px solid #222833}
.page-head{background:#090B0F;border-bottom:3px solid ${glow}}
section.block:nth-of-type(even){background:#141922}
.card,blockquote{background:#171C26;border-color:#262E3C;color:#D7DCE4}
.card .price{color:${glow}}
.contact dt{color:#F4F6FA}
footer{background:#07090C;border-top:1px solid #1C222C}`;
}

// ---------- Rendering ----------
export function css(t) {
  return `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1F2933;line-height:1.6;background:#fff}
img{max-width:100%;display:block}a{color:${t.primary}}
h1,h2,h3{font-family:${t.head};font-weight:${t.weight};line-height:1.2;color:${t.primary};margin:0 0 .5em}
h1{font-size:clamp(2rem,6vw,3.2rem)}h2{font-size:clamp(1.5rem,4vw,2.1rem)}h3{font-size:1.2rem}
p{margin:0 0 1em}ul{margin:0 0 1em;padding-left:1.2em}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.top{background:${t.primary};color:#fff;position:sticky;top:0;z-index:5}
.top .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px;flex-wrap:wrap;padding-top:8px;padding-bottom:8px}
.brand{display:flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-family:${t.head};font-weight:${t.weight};font-size:1.2rem}
.brand img{height:44px;width:auto;background:#fff;border-radius:8px;padding:3px}
nav{display:flex;gap:4px;flex-wrap:wrap;max-width:100%}
nav a{color:#fff;text-decoration:none;padding:8px 12px;border-radius:${t.radius};white-space:nowrap;font-weight:600;font-size:.95rem;opacity:.9}
nav a[aria-current]{background:rgba(255,255,255,.16);opacity:1}
.btn{display:inline-block;background:${t.accent};color:${t.accentText};font-weight:700;text-decoration:none;padding:13px 22px;border-radius:${t.radius};border:0;cursor:pointer;font-size:1rem}
.btn--ghost{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.7)}
.hero{background:linear-gradient(135deg,${t.primary},${t.primary}E6);color:#fff;padding:56px 0}
.hero .wrap{display:grid;gap:28px;align-items:center}
.hero h1{color:#fff}.hero p{font-size:1.15rem;opacity:.95}
.hero img{border-radius:${t.radius};box-shadow:0 18px 40px rgba(0,0,0,.25);width:100%;max-height:420px;object-fit:cover}
@media(min-width:820px){.hero .wrap{grid-template-columns:1.1fr .9fr}}
.page-head{background:${t.primary};color:#fff;padding:40px 0}.page-head h1{color:#fff;margin:0}
section.block{padding:48px 0}section.block:nth-of-type(even){background:#F6F7F9}
.cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
.card{background:#fff;border:1px solid #E4E7EB;border-radius:${t.radius};padding:20px}
.site-notice{background:${t.accent};color:#fff;text-align:center;padding:10px 16px;font-weight:700}
.stock{margin:0 0 6px;font-size:.9rem;font-weight:600;opacity:.85}.stock.low{color:#C2410C;opacity:1}.soldout{display:inline-block;padding:8px 14px;border-radius:999px;background:#6B7280;color:#fff;font-weight:700}.card.is-soldout img{filter:grayscale(.7);opacity:.75}
.cards.products{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.card.prod{display:flex;flex-direction:column}.card.prod img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:calc(${t.radius} - 4px);cursor:pointer}.card.prod h3{margin:10px 0 2px;font-size:1.02rem;line-height:1.3}
.pname{all:unset;cursor:pointer;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pname:focus-visible{outline:2px solid ${t.accent};outline-offset:2px}
.card.prod .price{margin:2px 0 8px;font-weight:800}.card.prod .buy{margin:auto 0 0}
@media (max-width:560px){.cards.products{grid-template-columns:1fr 1fr;gap:10px}.cards.products .card{padding:12px}.cards.products h3{font-size:1rem}.cards.products .btn{padding:10px 12px;font-size:.9rem}}
.menu-btn{display:none;background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:${t.radius};padding:10px 14px;font:700 15px/1 system-ui,Arial,sans-serif;cursor:pointer;min-height:44px}
@media(max-width:760px){.menu-btn{display:inline-flex;align-items:center}nav.many{display:none;width:100%;flex-direction:column;gap:2px;padding-bottom:6px}nav.many.open{display:flex}nav.many a{padding:12px}}
.shop-tools{position:sticky;top:0;z-index:4;padding:10px 0 4px;margin-bottom:8px}
.shop-search{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px 14px;border:1px solid #D1D5DB;border-radius:12px;background:#fff;color:#1F2933}
.cat-nav{display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;padding:10px 0 6px;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cat-nav a{flex:0 0 auto;border:1px solid #D1D5DB;border-radius:999px;padding:9px 14px;text-decoration:none;color:#1F2933;background:#fff;font-weight:600;opacity:1;white-space:nowrap}
.cat-nav a[aria-current]{background:${t.accent};border-color:${t.accent};color:#fff}.cat-nav a[aria-current] span{opacity:.85}.cat-nav a[hidden],.cat[hidden],.card[hidden],.shop-none[hidden]{display:none}
.shop-none{padding:20px 0;font-weight:600}
.map iframe{width:100%;height:360px;border:0;border-radius:${t.radius};display:block}
details.faq{border:1px solid rgba(127,127,127,.3);border-radius:${t.radius};padding:4px 16px;margin:10px 0;background:rgba(127,127,127,.06)}
details.faq summary{cursor:pointer;font-weight:700;padding:12px 0;list-style:none;display:flex;justify-content:space-between;gap:12px}
details.faq summary::-webkit-details-marker{display:none}details.faq summary::after{content:"+";font-size:1.3em;line-height:1}details.faq[open] summary::after{content:"\\2212"}
details.faq p{margin:0 0 12px}li.qa{list-style:none}
.cat h2{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.cat-top{font-size:.85rem;font-weight:600;color:inherit;opacity:.75;text-decoration:none}
.cards.products .card img{aspect-ratio:1/1}.cat-nav a span{opacity:.6;font-weight:400}.cat{scroll-margin-top:64px;margin-top:28px}
.card .price{font-weight:800;color:${t.primary};margin:0}
.card img{border-radius:calc(${t.radius} - 4px);margin:-6px -6px 12px;width:calc(100% + 12px);aspect-ratio:4/3;object-fit:cover}
.gallery{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}@media(max-width:560px){.gallery{grid-template-columns:1fr 1fr}}
.hero-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hero .hero-grid img{aspect-ratio:1;max-height:none;box-shadow:0 10px 24px rgba(0,0,0,.25)}@media(max-width:819px){.hero-grid{grid-template-columns:repeat(4,1fr);gap:8px}}
.trust{border-bottom:1px solid rgba(127,127,127,.2)}.trust .wrap{display:flex;flex-wrap:wrap;gap:8px 18px;padding-top:14px;padding-bottom:14px;font-weight:600;font-size:.95rem}.trust span{white-space:nowrap}
main a,footer a,.card{overflow-wrap:anywhere}
.rv-stars{color:#F5A623;letter-spacing:2px;font-size:1.15rem}.rv-stars .off{color:rgba(127,127,127,.35)}.rv-sum{font-size:1.05rem;margin:0 0 14px}.rv blockquote{margin:8px 0;border:0;padding:0}.rv figcaption{font-weight:700}.card.rv{margin:0}
.rv-write{margin-top:18px}.rv-write summary{list-style:none;display:inline-block}.rv-write summary::-webkit-details-marker{display:none}.rv-write[open] summary{display:none}
.rv-form{max-width:560px}.rv-form label{display:block;font-weight:600;margin:12px 0 4px}.rv-form input:not([type=radio]),.rv-form textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px;border:1px solid rgba(127,127,127,.45);border-radius:10px;background:transparent;color:inherit}
.rv-form .btn{margin-top:12px}.rv-form .hp{position:absolute;left:-5000px;width:1px;height:1px;opacity:0}.rv-msg{font-weight:700;margin:8px 0 0}.rv-done{font-weight:700;font-size:1.05rem}
.rv-pick{border:0;padding:0;margin:4px 0 0;display:inline-flex;flex-direction:row-reverse;justify-content:flex-end}.rv-lbl{font-weight:600;margin:12px 0 0}
.rv-pick input{position:absolute;opacity:0;width:1px;height:1px}.rv-pick label{font-size:40px;line-height:1;margin:0;padding:2px 3px;cursor:pointer;color:rgba(127,127,127,.4)}
.rv-pick input:checked~label,.rv-pick label:hover,.rv-pick label:hover~label{color:#F5A623}.rv-pick input:focus-visible+label{outline:2px solid #F5A623;border-radius:6px}.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:${t.radius}}
blockquote{margin:0;background:#fff;border-left:4px solid ${t.accent};padding:16px 18px;border-radius:${t.radius}}
.contact dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0 0 1em}.contact dt{font-weight:700}.contact dd{margin:0}
.cta{background:${t.accent};color:${t.accentText};padding:40px 0;text-align:center}.cta h2{color:inherit}
.cta .btn{background:${t.primary};color:#fff}
footer{background:#111827;color:#D1D5DB;padding:32px 0 90px;font-size:.95rem}footer a{color:#fff}footer .wrap{display:grid;gap:12px}
.credit{font-size:.8rem;opacity:.7}
.wa{position:fixed;right:16px;bottom:16px;z-index:9;background:#25D366;color:#fff;font-weight:700;text-decoration:none;padding:13px 18px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
mark.todo{background:#FFF1B8;color:#5C4400;padding:1px 4px;border-radius:4px}
article.post{margin-bottom:28px}
li.qa{margin-bottom:12px}h3+p{margin-top:-.2em}
section.block:empty,section.block .wrap:empty{display:none}`;
}

// Applied last, after any AI design: keeps every page usable on small phones whatever the design does.
const GUARD_CSS = `body{overflow-x:clip}img,video{max-width:100%;height:auto}
.contact dl{grid-template-columns:max-content minmax(0,1fr)}.contact dd,.card,footer span{min-width:0;overflow-wrap:anywhere}
@media(max-width:700px){.top{position:relative!important;top:auto!important}.contact dl{grid-template-columns:1fr}.contact dt{margin-top:6px}}
.wa{right:16px!important;left:auto!important;max-width:calc(100vw - 32px);white-space:nowrap}`;

const PREVIEW_CSS = `.pv-top{background:#FFF1B8;color:#3D2E00;font:600 14px/1.4 system-ui,Arial,sans-serif;padding:10px 16px;text-align:center}
.pv-opts{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px}
.pv-opts a{font:700 14px/1 system-ui,Arial,sans-serif;text-decoration:none;color:#3D2E00;background:#fff;border:2px solid #E0C766;border-radius:999px;padding:9px 16px}
.pv-opts a[aria-current]{background:#3D2E00;color:#FFF1B8;border-color:#3D2E00}
.pv{background:#0F172A;color:#fff;padding:24px 0 28px;font-family:system-ui,Arial,sans-serif}.pv h2{color:#fff;font-size:1.3rem}
.pv textarea{width:100%;min-height:110px;border-radius:10px;border:0;padding:12px;font:inherit;margin:8px 0}
.pv .row{display:flex;gap:10px;flex-wrap:wrap}.pv .ok{background:#22C55E;color:#062E14}.pv .chg{background:#fff;color:#0F172A}
.pv .msg{margin-top:10px;font-weight:600}`;

// More than 5 pages: on phones the menu folds behind a "☰ Menu" button, so the page starts at the top.
function header(site, page, link, img) {
  const nav = site.pages.map((p) => `<a href="${link(p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ""}>${esc(p.name)}</a>`).join("");
  const many = site.pages.length > 5;
  const btn = many ? `<button class="menu-btn" type="button" aria-expanded="false" aria-controls="mainnav" onclick="var n=document.getElementById('mainnav'),o=n.classList.toggle('open');this.setAttribute('aria-expanded',o);this.textContent=o?'\u2715 Close':'\u2630 Menu'">\u2630 Menu</button>` : "";
  return `<header class="top"><div class="wrap"><a class="brand" href="${link("index")}">${site.logo ? `<img src="${img(site.logo.url)}" alt="${esc(site.name)} logo">` : ""}<span>${esc(site.name)}</span></a>${btn}<nav aria-label="Main" id="mainnav"${many ? ' class="many"' : ""}>${nav}</nav></div></header>`;
}
function waLink(site, text) {
  return site.whatsapp ? `https://wa.me/${site.whatsapp}${text ? "?text=" + encodeURIComponent(text) : ""}` : "";
}
function contactCard(site, mode) {
  const rows = [];
  if (site.phone) rows.push(["Phone", `<a href="tel:${esc(site.phone.replace(/\s/g, ""))}">${esc(site.phone)}</a>`]);
  if (site.whatsapp) rows.push(["WhatsApp", `<a href="${waLink(site)}">Chat with us</a>`]);
  if (site.email) rows.push(["Email", `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`]);
  if (site.address) rows.push(["Address", `${esc(site.address).replace(/\n/g, "<br>")}<br><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(site.address)}">Open in Google Maps</a>`]);
  if (site.hours) rows.push(["Opening hours", esc(site.hours)]);
  if (!rows.length) return mode === "preview" ? `<p><mark class="todo">To be added: contact details</mark></p>` : "";
  return `<div class="card contact"><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>${site.whatsapp ? `<a class="btn" href="${waLink(site)}">Message us on WhatsApp</a>` : ""}</div>`;
}
function serviceCards(site, showPrice) {
  if (!site.services.length) return "";
  return `<div class="cards">${site.services.map((s) => `<div class="card"><h3>${esc(s.name)}</h3>${s.details ? `<p>${esc(s.details)}</p>` : ""}${showPrice && s.price ? `<p class="price">${esc(naira(s.price))}</p>` : ""}</div>`).join("")}</div>`;
}
// A product's photo: the one named after it (ofada-rice-5kg.jpg), otherwise the photo in the same position.
// 1) the photo chosen for it in the form, 2) the photo named after it (ofada-rice-5kg.jpg), 3) the remaining
// photos in list order for the remaining products.
const photoKey = (f) => slugify(String(f.name || "").replace(/\.[a-z0-9]+$/i, "").replace(/-[0-9a-f]{16}$/, ""));
export function productPhotoFor(site, p) {
  const photos = site.productPhotos;
  const chosen = p.photo && photos.find((f) => f.url === p.photo);
  if (chosen) return chosen;
  const taken = new Set(site.products.map((x) => x.photo).filter((u) => photos.some((f) => f.url === u)));
  const free = photos.filter((f) => !taken.has(f.url));
  const byName = free.find((f) => photoKey(f) === slugify(p.name));
  if (byName) return byName;
  const names = new Set(site.products.filter((x) => !(x.photo && taken.has(x.photo))).map((x) => slugify(x.name)));
  const leftPhotos = free.filter((f) => !names.has(photoKey(f)));
  const leftProducts = site.products.filter((x) => !(x.photo && taken.has(x.photo)) && !free.some((f) => photoKey(f) === slugify(x.name)));
  return leftPhotos[leftProducts.indexOf(p)] || null;
}
// Search box (filters as you type) and the category bar: it stays at the top while scrolling, with a solid
// background taken from the page, and highlights the category being viewed.
const SHOP_JS = `<script>(function(){function init(){var tools=document.querySelector('.shop-tools');if(!tools)return;
var bg=function(el){while(el){var c=getComputedStyle(el).backgroundColor;if(c&&c!=='transparent'&&!/rgba\\(.*,\\s*0\\)$/.test(c))return c;el=el.parentElement}return '#fff'};tools.style.background=bg(tools.parentElement);
var top=document.querySelector('.top');function off(){var t=top&&getComputedStyle(top).position==='sticky'?top.offsetHeight:0;tools.style.top=t+'px';document.querySelectorAll('.cat').forEach(function(s){s.style.scrollMarginTop=(t+tools.offsetHeight+8)+'px'})}off();addEventListener('resize',off);
var links=[].slice.call(tools.querySelectorAll('.cat-nav a')),cats=[].slice.call(document.querySelectorAll('.cat'));
function mark(id){links.forEach(function(a){var on=a.getAttribute('href')==='#'+id;if(on){a.setAttribute('aria-current','true');a.scrollIntoView({block:'nearest',inline:'nearest'})}else a.removeAttribute('aria-current')})}
if(cats.length&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)mark(e.target.id)})},{rootMargin:'-30% 0px -65% 0px'});cats.forEach(function(c){io.observe(c)})}
var q=tools.querySelector('.shop-search'),none=document.querySelector('.shop-none');if(q)q.addEventListener('input',function(){var w=q.value.trim().toLowerCase(),n=0;
document.querySelectorAll('.cards.products .card').forEach(function(c){var hit=!w||c.textContent.toLowerCase().indexOf(w)>=0;c.hidden=!hit;if(hit)n++});
cats.forEach(function(s){s.hidden=!!w&&!s.querySelector('.card:not([hidden])')});links.forEach(function(a){var s=document.querySelector(a.getAttribute('href'));a.hidden=!!s&&s.hidden});none.hidden=n>0;});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();})();</script>`;
// The shop page: one section per category (with quick links at the top) when there are 2 or more.
function shopSections(site, img) {
  const cats = [];
  for (const p of site.products) {
    const c = String(p.category || "").trim() || "More products";
    let g = cats.find((x) => x.name.toLowerCase() === c.toLowerCase());
    if (!g) cats.push((g = { name: c, products: [] }));
    g.products.push(p);
  }
  const id = (c) => "cat-" + slugify(c.name);
  const search = site.products.length > 1 ? `<input class="shop-search" type="search" placeholder="Search ${site.products.length} products" aria-label="Search products" autocomplete="off">` : "";
  const tools = (nav) => search || nav ? `<div class="shop-tools" id="categories">${search}${nav}</div><p class="shop-none" hidden>No products match. Try another word.</p>${SHOP_JS}` : "";
  if (cats.length < 2) return tools("") + productCards(site, img);
  return tools(`<nav class="cat-nav" aria-label="Product categories">${cats.map((c) => `<a href="#${id(c)}">${esc(c.name)} <span>(${c.products.length})</span></a>`).join("")}</nav>`) +
    cats.map((c) => `<section class="cat" id="${id(c)}"><h2>${esc(c.name)} <a class="cat-top" href="#categories">\u2191 Categories</a></h2>${productCards({ ...site, products: c.products }, img)}</section>`).join("");
}
function productCards(site, img) {
  return `<div class="cards products">${site.products.map((p) => {
    const photo = productPhotoFor(site, p);
    const order = waLink(site, `Hello ${site.name}, I'd like to order: ${p.name}${p.price ? " (" + naira(p.price) + ")" : ""}`);
    const left = /^\d{1,6}$/.test(String(p.stock ?? "").trim()) ? Number(p.stock) : null;
    const sold = p.soldout || left === 0;
    const stockLine = !sold && left !== null ? `<p class="stock${left <= 5 ? " low" : ""}">${left <= 5 ? `Only ${left} left` : `${left} in stock`}</p>` : "";
    const buy = sold ? `<p class="buy"><span class="soldout">Sold out</span></p>` : p.amount
      ? `${stockLine}<p class="buy" data-i="${p.i}"><button class="btn add" type="button" data-i="${p.i}" data-name="${esc(p.name)}" data-price="${p.amount}"${left !== null ? ` data-max="${left}"` : ""}${photo ? ` data-img="${img(photo.url)}"` : ""}>Add to cart</button><span class="step" hidden><button type="button" data-d="-1" aria-label="One less ${esc(p.name)}">\u2212</button><b>0</b><button type="button" data-d="1" aria-label="One more ${esc(p.name)}">+</button><small>in cart</small></span></p>`
      : order ? `${stockLine}<p class="buy"><a class="btn" href="${order}">${p.price ? "Order on WhatsApp" : "Ask on WhatsApp"}</a></p>` : "";
    // Compact card: photo, name and price. Tapping the photo or name opens the full description (and the same Add to cart) in a pop-up.
    const text = p.text || p.details;
    return `<div class="card prod${sold ? " is-soldout" : ""}">${photo ? `<img class="pv-open" src="${img(photo.url)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : ""}<h3><button class="pname pv-open" type="button" aria-haspopup="dialog">${esc(p.name)}</button></h3>${text ? `<div class="pdesc" hidden>${esc(text)}</div>` : ""}${p.price ? `<p class="price">${esc(naira(p.price))}</p>` : ""}${buy}</div>`;
  }).join("")}</div>`;
}

// Product pop-up: the full description, a bigger photo and the same Add to cart / WhatsApp button, in the site's own colours.
const PRODUCT_POP = `<style>.ppop{position:fixed;inset:0;z-index:65;background:rgba(15,23,42,.6);display:flex;align-items:flex-end;justify-content:center}.ppop[hidden]{display:none}
.ppop .box{width:min(520px,100vw);max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:0 18px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.3)}
@media(min-width:700px){.ppop{align-items:center}.ppop .box{border-radius:18px}}
.ppop .bar{position:sticky;top:0;display:flex;justify-content:flex-end;background:inherit;margin:0 -18px;padding:6px 8px;z-index:1}.ppop .x{background:none;border:0;font-size:32px;line-height:1;width:46px;height:46px;cursor:pointer;color:inherit}
.ppop img{width:100%;max-height:52vh;object-fit:contain;border-radius:12px;display:block;margin:0 auto 12px}.ppop h3{margin:4px 0 6px;font-size:1.3rem;color:inherit}.ppop .price{font-size:1.2rem;font-weight:800;margin:0 0 10px}
.ppop .desc{white-space:pre-line;margin:0 0 16px;opacity:.9}.ppop .buy{margin:0}.ppop .buy .btn{width:100%;text-align:center;padding:15px;box-sizing:border-box}</style>
<div class="ppop" hidden role="dialog" aria-modal="true" aria-label="Product details"><div class="box"><div class="bar"><button class="x" type="button" aria-label="Close">×</button></div><div class="in"></div></div></div>
<script>(function(){var pop=document.querySelector('.ppop'),box=pop.querySelector('.box'),inn=pop.querySelector('.in'),last=null;
function solid(el){while(el){var c=getComputedStyle(el).backgroundColor;if(c&&c!=='transparent'&&!/rgba\\(.*,\\s*0\\)$/.test(c))return c;el=el.parentElement}return '#fff'}
function close(){pop.hidden=true;inn.innerHTML='';document.body.style.overflow='';if(last)last.focus()}
document.addEventListener('click',function(e){var o=e.target.closest('.pv-open');if(!o)return;var c=o.closest('.card.prod');if(!c)return;last=c.querySelector('.pname');
box.style.background=solid(c);box.style.color=getComputedStyle(c).color;var im=c.querySelector('img'),d=c.querySelector('.pdesc'),pr=c.querySelector('.price'),b=c.querySelector('.buy');
inn.innerHTML='';if(im){var i=im.cloneNode();i.removeAttribute('loading');i.className='';inn.appendChild(i)}var h=document.createElement('h3');h.textContent=c.querySelector('.pname').textContent;inn.appendChild(h);
if(pr)inn.appendChild(pr.cloneNode(true));if(d){var p=document.createElement('p');p.className='desc';p.textContent=d.textContent;inn.appendChild(p)}if(b)inn.appendChild(b.cloneNode(true));
pop.hidden=false;document.body.style.overflow='hidden';pop.querySelector('.x').focus();});
pop.addEventListener('click',function(e){if(e.target===pop||e.target.closest('.x'))close()});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!pop.hidden)close()});})();</script>`;

// ---------- Cart (Online Store) ----------
// Every store page gets a cart (stored in the browser under the old "basket-" key, so nobody loses their items). "Order on WhatsApp" always works. "Pay online" appears only once online payment is
// switched on for the store in admin (the page asks our API), and payments go to the store owner's Paystack account.
const CART_CSS = `.cart-btn{position:fixed;left:16px;bottom:16px;z-index:60;background:var(--cart-ink,#111827);color:var(--cart-bg,#fff);border:0;border-radius:999px;padding:12px 18px;font:700 15px/1 inherit;font-family:inherit;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}
.cart-btn[hidden],.cart[hidden]{display:none!important}.cart-btn b{background:var(--cart-acc,#22C55E);color:#fff;border-radius:999px;padding:2px 8px;margin-left:6px}
.cart{position:fixed;inset:0;z-index:70;background:rgba(15,23,42,.6);display:flex;justify-content:flex-end;font-family:inherit;line-height:1.5}
.cart .panel{background:var(--cart-bg,#fff);color:var(--cart-ink,#1F2933);width:min(440px,100vw);height:100%;overflow:auto;padding:0 20px 24px;box-shadow:-8px 0 24px rgba(0,0,0,.25);display:flex;flex-direction:column}
.cart h2{position:sticky;top:0;background:inherit;margin:0 -20px 4px;padding:16px 20px;font-size:1.3rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--cart-line,#E5E7EB);color:inherit;z-index:1}
.cart h2 small{font-size:.85rem;font-weight:600;opacity:.65;margin-left:8px}
.cart .x{background:none;border:0;font-size:30px;line-height:1;cursor:pointer;color:inherit;width:44px;height:44px}
.cart .line{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--cart-line,#E5E7EB)}
.cart .line img,.cart .line .ph{width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--cart-soft,#F3F4F6);grid-row:span 2}
.cart .line .n{font-weight:700;overflow-wrap:anywhere}.cart .line .each{font-size:.85rem;opacity:.7}
.cart .line .amt{font-weight:800;text-align:right;white-space:nowrap}
.cart .qty{display:inline-flex;justify-self:start;align-items:center;border:1px solid var(--cart-line,#D1D5DB);border-radius:999px;overflow:hidden}
.cart .qty button{width:38px;height:36px;border:0;background:transparent;font-size:18px;cursor:pointer;color:inherit}.cart .qty b{min-width:26px;text-align:center}
.cart .rm{background:none;border:0;color:inherit;opacity:.65;font:inherit;font-size:.85rem;text-decoration:underline;cursor:pointer;justify-self:end}
.cart .tot{display:flex;justify-content:space-between;font-weight:800;font-size:1.15rem;margin:16px 0 4px}
.cart .note{font-size:.88rem;opacity:.75;margin:4px 0}.cart .err{color:#DC2626;font-weight:700;opacity:1}
.cart .who{margin-top:14px;padding-top:14px;border-top:1px solid var(--cart-line,#E5E7EB)}.cart .who h3{font-size:1rem;margin:0 0 4px;color:inherit}
.cart label{display:block;font-weight:600;margin:10px 0 4px;font-size:.92rem}.cart input,.cart textarea{width:100%;box-sizing:border-box;border:1px solid var(--cart-line,#D1D5DB);border-radius:10px;padding:12px;font:inherit;font-size:16px;background:var(--cart-soft,#fff);color:inherit}
.cart .acts{display:grid;gap:10px;margin:18px -20px 0;position:sticky;bottom:0;background:var(--cart-bg,#fff);padding:12px 20px 6px;border-top:1px solid var(--cart-line,#E5E7EB)}
.cart .acts button{border:0;border-radius:12px;padding:15px;font:inherit;font-weight:800;font-size:16px;cursor:pointer}
.cart .pay{background:var(--cart-acc,#0BA4DB);color:#fff}.cart .ptr,.cart .pod{background:transparent;color:inherit;border:2px solid var(--cart-acc,#0BA4DB)!important;padding:12px!important;font-size:15px!important}
.cart .acts.two{grid-template-columns:1fr 1fr}.cart .acts.two>button{grid-column:1/-1}.cart .acts.two .ptr,.cart .acts.two .pod{grid-column:auto}.cart .waorder{background:#25D366;color:#063B1C}.cart .acts button:disabled{opacity:.5;cursor:default}
.cart .empty{text-align:center;padding:40px 0;opacity:.75}
.card .buy{margin-top:auto}.btn.add.added{background:#22C55E!important;color:#062E14!important}
.buy .step{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}.buy .step[hidden],.buy .btn.add[hidden]{display:none!important}
.buy .step button{width:42px;height:42px;border-radius:10px;border:0;background:#22C55E;color:#062E14;font:800 20px/1 system-ui,Arial,sans-serif;cursor:pointer}
.buy .step b{min-width:28px;text-align:center;font-size:1.15rem}.buy .step small{opacity:.75;font-weight:600}`;

function cartScript(site, mode) {
  const cfg = { s: site.shopToken, api: SITE_URL, wa: site.whatsapp, name: site.name, preview: mode === "preview", key: "basket-" + (site.shopToken || slugify(site.name)) };
  return `<button class="cart-btn" type="button" hidden aria-label="Open cart">🛒 Cart <b>0</b></button>
<div class="cart" hidden role="dialog" aria-modal="true" aria-label="Your cart"><div class="panel">
<h2><span>Your cart<small class="cnt"></small></span><button class="x" type="button" aria-label="Close">×</button></h2><div class="lines"></div>
<div class="sumbox"><p class="tot"><span>Total</span><span class="sum"></span></p><p class="note dl"></p>
<div class="who"><h3>Your details</h3><p class="note signin" hidden>Have an account? <a href="#account">Sign in</a> to use your saved address.</p>
<label for="cb-name">Your name</label><input id="cb-name" autocomplete="name">
<label for="cb-phone">Phone number</label><input id="cb-phone" type="tel" autocomplete="tel">
<label for="cb-email" class="em-l">Email (needed to pay online)</label><input id="cb-email" type="email" autocomplete="email">
<label for="cb-addr">Delivery address</label><select id="cb-saved" hidden aria-label="Your saved addresses"></select><textarea id="cb-addr" rows="2" autocomplete="street-address"></textarea><p class="note dnote" hidden></p></div>
<div class="acts"><button class="pay" type="button" hidden data-m="paystack">Pay online now</button><button class="pay pay2" type="button" hidden data-m="flutterwave">Pay online now</button><button class="pay ptr" type="button" hidden data-m="transfer">Pay by bank transfer</button><button class="pay pod" type="button" hidden data-m="delivery">Pay on delivery</button><button class="waorder" type="button">Order on WhatsApp</button></div>
<p class="note msg" role="status"></p></div></div></div>
<script>(function(){var C=${JSON.stringify(cfg).replace(/</g, "\\u003c")};window.__shopC=C;var M={};
var B=[];try{B=JSON.parse(localStorage.getItem(C.key)||'[]')}catch(e){}
var $=function(q){return document.querySelector(q)},btn=$('.cart-btn'),box=$('.cart'),msg=$('.cart .msg'),pays=document.querySelectorAll('.cart .pay'),online=false,fee=null;
function money(n){return '\u20a6'+Number(n).toLocaleString('en-NG')}
function save(){try{localStorage.setItem(C.key,JSON.stringify(B))}catch(e){}}
function count(){return B.reduce(function(s,l){return s+l.q},0)}
function sub(){return B.reduce(function(s,l){return s+l.q*l.p},0)}
function draw(){var n=count();btn.hidden=!n;btn.querySelector('b').textContent=n;
var e=function(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
$('.cart .lines').innerHTML=B.length?B.map(function(l,k){var im=l.u||(document.querySelector('.btn.add[data-i="'+l.i+'"]')||{getAttribute:function(){return''}}).getAttribute('data-img');return '<div class="line">'+(im?'<img src="'+e(im)+'" alt="">':'<span class="ph"></span>')+'<span><span class="n">'+e(l.n)+'</span><br><span class="each">'+money(l.p)+' each</span></span><span class="amt">'+money(l.p*l.q)+'</span><span class="qty"><button type="button" data-k="'+k+'" data-d="-1" aria-label="One less">\u2212</button><b>'+l.q+'</b><button type="button" data-k="'+k+'" data-d="1" aria-label="One more">+</button></span><button class="rm" type="button" data-k="'+k+'">Remove</button></div>'}).join(''):'<p class="empty">Your cart is empty.</p>';
$('.cart .sumbox').hidden=!B.length;$('.cart .cnt').textContent=n?' ('+n+' item'+(n===1?'':'s')+')':'';
document.querySelectorAll('.buy[data-i]').forEach(function(p){var i=+p.getAttribute('data-i'),l=B.filter(function(x){return x.i===i})[0],st=p.querySelector('.step');p.querySelector('.btn.add').hidden=!!l;st.hidden=!l;if(l)st.querySelector('b').textContent=l.q;});
var any=M.paystack||M.flutterwave||M.transfer||M.delivery;
$('.cart .sum').textContent=money(sub()+(any&&fee?fee:0));
$('.cart .dl').textContent=fee&&any?'Includes delivery: '+money(fee):'Delivery cost, if any, is confirmed by the store.';
Array.prototype.forEach.call(pays,function(b){b.hidden=!M[b.getAttribute('data-m')];b.disabled=!B.length});$('.cart .acts').classList.toggle('two',!!(M.transfer&&M.delivery));
if(M.paystack&&M.flutterwave){$('.cart .pay2').textContent='Pay online (Flutterwave)'}
$('.cart .em-l').textContent=(M.paystack||M.flutterwave)?'Email (needed to pay online)':'Email (optional)';
$('.cart .waorder').hidden=!C.wa;$('.cart .waorder').disabled=!B.length;}
function mx(i){var a=document.querySelector('.btn.add[data-i="'+i+'"]'),m=a&&a.getAttribute('data-max');return m===null||m===undefined||m===''?99:+m}
function cap(l,d){var m=mx(l.i),q=l.q+d;if(q>m){q=m;msg.textContent='Only '+m+' '+l.n+' left.';}l.q=Math.min(99,q);}
document.addEventListener('click',function(e){var s=e.target.closest('.buy .step button');if(s){var bi=+s.closest('.buy').getAttribute('data-i'),bl=B.filter(function(x){return x.i===bi})[0];if(bl){cap(bl,+s.getAttribute('data-d'));if(bl.q<1)B.splice(B.indexOf(bl),1);save();draw();}return}
var a=e.target.closest('.btn.add');if(!a)return;var i=+a.getAttribute('data-i'),l=B.filter(function(x){return x.i===i})[0];
if(l)cap(l,1);else if(mx(i)>0)B.push({i:i,n:a.getAttribute('data-name'),p:+a.getAttribute('data-price'),q:1,u:a.getAttribute('data-img')||''});save();draw();});
// "Order again" from a buyer's account: put the same items back in the cart (if they're still on sale).
// (also from Saved items / Recently viewed on a page that doesn't show that product: it brings its own name, price and photo)
window.__addToCart=function(i,q,d){var a=document.querySelector('.btn.add[data-i="'+i+'"]');if(a?mx(i)<=0:!(d&&d.n&&d.p>0))return;var l=B.filter(function(x){return x.i===+i})[0];
if(!l){l=a?{i:+i,n:a.getAttribute('data-name'),p:+a.getAttribute('data-price'),q:0,u:a.getAttribute('data-img')||''}:{i:+i,n:String(d.n),p:+d.p,q:0,u:d.u||''};B.push(l)}cap(l,+q||1);save();draw();btn.click()};
box.addEventListener('click',function(e){if(e.target===box||e.target.closest('.x')){box.hidden=true;document.body.style.overflow='';return}var r=e.target.closest('.rm');if(r){B.splice(+r.getAttribute('data-k'),1);save();draw();return}var q=e.target.closest('.qty button');if(!q)return;var l=B[+q.getAttribute('data-k')];cap(l,+q.getAttribute('data-d'));if(l.q<1)B.splice(B.indexOf(l),1);save();draw();});
// The cart takes the website's own colours and font (light or dark design).
function paint(){var bg='#fff',el=document.body;while(el){var c=getComputedStyle(el).backgroundColor;if(c&&c!=='transparent'&&!/rgba\\(.*,\\s*0\\)$/.test(c)){bg=c;break}el=el.parentElement}
var m=bg.match(/\\d+/g)||[255,255,255],dark=(+m[0]*299+ +m[1]*587+ +m[2]*114)/1000<128,st=document.documentElement.style,acc=getComputedStyle(document.querySelector('.btn')||document.body).backgroundColor;
st.setProperty('--cart-bg',bg);st.setProperty('--cart-ink',dark?'#F3F4F6':'#1F2933');st.setProperty('--cart-line',dark?'rgba(255,255,255,.16)':'#E5E7EB');st.setProperty('--cart-soft',dark?'rgba(255,255,255,.06)':'#F9FAFB');if(acc&&!/rgba\\(.*,\\s*0\\)$/.test(acc)&&acc!=='transparent')st.setProperty('--cart-acc',acc);}
window.__paintCart=paint;
btn.addEventListener('click',function(){paint();box.hidden=false;document.body.style.overflow='hidden';msg.textContent='';prefill()});
// Signed in (Standard Store): fill in their details and offer their saved addresses.
function prefill(){var A=window.SAcct&&window.SAcct.b(),sv=$('#cb-saved');if(A){if(!$('#cb-name').value)$('#cb-name').value=A.name;if(!$('#cb-phone').value)$('#cb-phone').value=A.phone;if(!$('#cb-email').value)$('#cb-email').value=A.email||'';
var L=A.addresses||[];sv.hidden=!L.length;sv.innerHTML=L.map(function(x,k){return '<option value="'+k+'">'+x.label.replace(/[<&]/g,'')+': '+x.text.replace(/[<&]/g,'')+'</option>'}).join('')+'<option value="">A new address</option>';
if(L.length&&!$('#cb-addr').value)$('#cb-addr').value=L[0].text;sv.onchange=function(){$('#cb-addr').value=sv.value===''?'':L[+sv.value].text}}else sv.hidden=true;}
window.__cartPrefill=function(){if(!box.hidden){document.body.style.overflow='hidden';prefill()}};
function buyer(){return{name:$('#cb-name').value.trim(),phone:$('#cb-phone').value.trim(),email:$('#cb-email').value.trim(),address:$('#cb-addr').value.trim()}}
$('.cart .waorder').addEventListener('click',function(){var b=buyer(),t='Hello '+C.name+', I would like to order:\\n'+B.map(function(l){return '- '+l.n+' x'+l.q+' ('+money(l.p*l.q)+')'}).join('\\n')+'\\nItems total: '+money(sub())+(b.name?'\\nName: '+b.name:'')+(b.phone?'\\nPhone: '+b.phone:'')+(b.address?'\\nDeliver to: '+b.address:'');
window.open('https://wa.me/'+C.wa+'?text='+encodeURIComponent(t),'_blank');});
Array.prototype.forEach.call(pays,function(pay){pay.addEventListener('click',function(){var b=buyer(),m=pay.getAttribute('data-m'),onl=m==='paystack'||m==='flutterwave';if(C.preview){msg.textContent='This is a preview, so payment is switched off here.';return}
if(!b.name||!b.phone||(onl&&!/@/.test(b.email))){msg.innerHTML='<span class="err">Please enter your name, phone number'+(onl?' and email':'')+'.</span>';return}
if(m==='delivery'&&!b.address){msg.innerHTML='<span class="err">Please enter your delivery address.</span>';return}
pay.disabled=true;msg.textContent=onl?'Opening secure payment\u2026':'Placing your order\u2026';
var A=window.SAcct;fetch(C.api+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s:C.s,method:m,t:A?A.t():'',items:B.map(function(l){return{i:l.i,q:l.q}}),buyer:b})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})
.then(function(j){if(A&&A.b()&&b.address)A.saveAddress(b.address);B=[];save();location.href=j.url}).catch(function(err){pay.disabled=false;msg.innerHTML='<span class="err">'+String(err.message).replace(/[&<>]/g,'')+'</span>'});});});
if(C.s&&!C.preview)fetch(C.api+'/api/shop?config=1&s='+encodeURIComponent(C.s)).then(function(r){return r.json()}).then(function(j){M=j.methods||{paystack:!!j.online};online=!!(M.paystack||M.flutterwave);fee=j.deliveryFee;
var dn=$('.cart .dnote');if(j.deliveryNote&&M.delivery){dn.hidden=false;dn.textContent='Pay on delivery: '+j.deliveryNote}
window.__shopCfg=j;try{window.dispatchEvent(new CustomEvent('shopcfg',{detail:j}))}catch(x){}
var st=j.stock||{};Object.keys(st).forEach(function(i){var n=+st[i];document.querySelectorAll('.btn.add[data-i="'+i+'"]').forEach(function(a){a.setAttribute('data-max',n);var bp=a.closest('.buy'),sl=bp.previousElementSibling;
if(n<=0){bp.innerHTML='<span class="soldout">Sold out</span>';bp.removeAttribute('data-i');var c=bp.closest('.card');if(c)c.classList.add('is-soldout');if(sl&&sl.classList.contains('stock'))sl.remove();}
else{if(!sl||!sl.classList.contains('stock')){sl=document.createElement('p');bp.parentNode.insertBefore(sl,bp)}sl.className='stock'+(n<=5?' low':'');sl.textContent=n<=5?'Only '+n+' left':n+' in stock';}});
B.forEach(function(l){if(+l.i===+i&&l.q>n)l.q=n});});B=B.filter(function(l){return l.q>0});save();draw()}).catch(function(){});
if(C.preview){online=true;M={paystack:true}}
draw();})();</script>`;
}
const gallery = (photos, img) => `<div class="gallery">${photos.map((p) => `<a href="${img(p.url)}"><img src="${img(p.url)}" alt="${esc(p.name || "Photo")}" loading="lazy" decoding="async"></a>`).join("")}</div>`;

function sectionHtml(sec, mode) {
  const heading = sec.fields.heading || (sec.name && !/^hero$/i.test(sec.name) ? sec.name : "");
  const body = blocks(sec.body, mode);
  if (!heading && !body) return "";
  return `<section class="block"><div class="wrap">${heading ? `<h2>${inline(heading, mode)}</h2>` : ""}${body}</div></section>`;
}

// Short reasons to trust the business, shown under the home hero. Only facts from the form, never invented.
// Approved reviews (stars, name, words) and the "Write a review" form. The form posts to our API; the owner
// then chooses "Show on website" in Manage my store, which republishes the site.
function reviewsHtml(site, mode, { all = false, form = true } = {}) {
  const R = site.reviews;
  const star = (n) => `<span class="rv-stars" aria-label="${n} out of 5 stars">${"\u2605".repeat(n)}<span class="off">${"\u2605".repeat(5 - n)}</span></span>`;
  const list = (all ? R.list : R.list.slice(0, 3)).map((x) => `<figure class="card rv"><div>${star(x.stars)}</div>${x.text ? `<blockquote>${esc(x.text)}</blockquote>` : ""}<figcaption>${esc(x.name)}</figcaption></figure>`).join("");
  const summary = R.count ? `<p class="rv-sum">${star(Math.round(R.average))} <b>${R.average.toFixed(1)}</b> out of 5 from ${R.count} review${R.count === 1 ? "" : "s"}</p>` : "";
  const live = mode === "export" && site.statsKey;
  const box = !form ? "" : `<details class="rv-write"${R.count ? "" : " open"}><summary class="btn">${R.count ? "Write a review" : "Be the first to leave a review"}</summary>
<form class="rv-form card" novalidate><p>${R.count ? "Tell other customers how it went." : `Shopped or worked with ${esc(site.name)}? Tell other customers how it went.`}</p>
<p class="rv-lbl" id="rv-lbl">Your rating</p><fieldset class="rv-pick" aria-labelledby="rv-lbl">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="stars" id="rv${n}" value="${n}"><label for="rv${n}" title="${n} star${n === 1 ? "" : "s"}">\u2605<span class="vh">${n} star${n === 1 ? "" : "s"}</span></label>`).join("")}</fieldset>
<label for="rv-name">Your name</label><input id="rv-name" name="name" maxlength="50" autocomplete="name">
<label for="rv-text">Your review (optional)</label><textarea id="rv-text" name="text" maxlength="600" rows="3"></textarea>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn" type="submit">Send review</button><p class="rv-msg" role="status"></p></form></details>
<script>(function(){var f=document.currentScript.previousElementSibling.querySelector('form'),m=f.querySelector('.rv-msg'),live=${live ? "true" : "false"};
f.addEventListener('submit',function(e){e.preventDefault();var s=f.querySelector('input[name=stars]:checked'),n=f.querySelector('#rv-name').value.trim();
if(!s){m.textContent='Please tap the stars to give a rating.';return}if(n.length<2){m.textContent='Please write your name.';return}
if(!live){m.textContent='Reviews can be sent once the website is live.';return}
var b=f.querySelector('button');b.disabled=true;m.textContent='Sending\u2026';
fetch(${JSON.stringify(SITE_URL + "/api/site?review=1")},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({k:${JSON.stringify(site.statsKey)},stars:+s.value,name:n,text:f.querySelector('#rv-text').value,website:f.querySelector('.hp').value})})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){if(x.ok){f.innerHTML=${JSON.stringify(`<p class="rv-done">Thank you! Your review will appear here once ${esc(site.name)} has checked it.</p>`).replace(/</g, "\\u003c")}}else{b.disabled=false;m.textContent=x.j.error||'Sorry, that didn’t send.'}})
.catch(function(){b.disabled=false;m.textContent='No connection. Please try again.'})});})();</script>`;
  return `${summary}${list ? `<div class="cards rv-list">${list}</div>` : ""}${box}`;
}
function trustPoints(site) {
  const t = [];
  const city = String(site.address || "").split(/\n|,/).map((x) => x.trim()).filter(Boolean).pop() || "";
  if (site.delivery) t.push(/nationwide|all states|across nigeria|anywhere in nigeria/i.test(site.delivery) ? "Delivery nationwide" : "Delivery available");
  if (site.products.some((p) => p.amount)) t.push("Order online or on WhatsApp");
  else if (site.whatsapp) t.push("Quick replies on WhatsApp");
  if (site.hours && site.hours.length <= 34) t.push(site.hours);
  if (city && city.length <= 30) t.push(`Visit us in ${city.replace(/\s+nigeria$/i, "")}`);
  return t.slice(0, 4);
}
function pageBody(site, page, mode, link, img) {
  const out = [];
  let sections = page.sections;
  if (page.kind === "home") {
    let heroSec = sections.find((s) => s.fields.headline) || null;
    if (!heroSec) {
      // No "**Headline:**" labels: use the Hero section's lines (headline, subheadline, short button text).
      const h = sections.find((s) => /^(hero|banner|welcome)/i.test(s.name));
      const lines = h ? h.body.map((l) => l.trim()).filter(Boolean) : [];
      if (h && lines.length) {
        heroSec = h;
        h.fields.headline = lines[0].replace(/^#+\s*/, "");
        if (lines[1]) h.fields.subheadline = lines[1];
        if (lines[2] && lines[2].length <= 30) h.fields["button text"] = lines[2];
      }
    }
    sections = sections.filter((s) => s !== heroSec);
    const headline = heroSec?.fields.headline || site.name;
    const sub = heroSec?.fields.subheadline || site.tagline;
    const btn = heroSec?.fields["button text"] || "Contact us";
    const contactPage = site.pages.find((p) => p.kind === "contact");
    const href = site.whatsapp ? waLink(site) : contactPage ? link(contactPage.slug) : "#";
    out.push(`<section class="hero"><div class="wrap"><div><h1>${inline(headline, mode)}</h1>${sub ? `<p>${inline(sub, mode)}</p>` : ""}<a class="btn" href="${href}">${inline(btn, mode)}</a></div>${site.photos[0] ? `<img src="${img(site.photos[0].url)}" alt="${esc(site.name)}" fetchpriority="high" decoding="async">` : site.productPhotos.length >= 4 ? `<div class="hero-grid">${site.productPhotos.slice(0, 4).map((p, k) => `<img src="${img(p.url)}" alt=""${k ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`).join("")}</div>` : ""}</div></section>`);
    const trust = trustPoints(site);
    if (trust.length) out.push(`<div class="trust"><div class="wrap">${trust.map((t) => `<span>\u2713 ${esc(t)}</span>`).join("")}</div></div>`);
  } else {
    out.push(`<div class="page-head"><div class="wrap"><h1>${esc(page.name)}</h1></div></div>`);
  }
  // The cards below already show services/prices and contact details: skip AI sections that only repeat them.
  const cardsHere = (site.services.length && (page.kind === "home" || page.kind === "services" || page.kind === "prices"))
    || (site.products.length && (page.kind === "home" || page.kind === "shop"));
  const names = [...site.services, ...site.products].map((x) => x.name.toLowerCase().trim()).filter(Boolean);
  const contactBits = [site.phone, site.email].map((x) => String(x || "").toLowerCase().replace(/\s/g, "")).filter(Boolean);
  const repeats = (s) => {
    const items = s.body.filter((l) => /^\s*(?:[-*•]|\d+\.)\s+/.test(l)).map((l) => l.toLowerCase());
    if (items.length < 2) return false;
    if (cardsHere && names.length && items.filter((i) => names.some((n) => i.includes(n))).length >= Math.ceil(items.length * 0.6)) return true;
    if ((page.kind === "contact" || page.kind === "location") && contactBits.length && items.filter((i) => contactBits.some((c) => i.replace(/\s/g, "").includes(c)) || /hours|address|phone|email|whatsapp/.test(i)).length >= Math.ceil(items.length * 0.6)) return true;
    return false;
  };
  for (const s of sections) {
    if (repeats(s)) {
      const rest = { ...s, body: s.body.filter((l) => !/^\s*(?:[-*•]|\d+\.)\s+/.test(l)) };
      if (rest.body.some((l) => l.trim()) || rest.fields.heading) out.push(sectionHtml({ ...rest, fields: { ...rest.fields, heading: page.kind === "home" ? "" : rest.fields.heading } }, mode));
      continue;
    }
    out.push(sectionHtml(s, mode));
  }
  const has = (k) => site.pages.some((p) => p.kind === k);
  const extra = (title, html) => out.push(`<section class="block"><div class="wrap">${title ? `<h2>${esc(title)}</h2>` : ""}${html}</div></section>`);
  if (page.kind === "home") {
    const find = (...kinds) => site.pages.find((p) => kinds.includes(p.kind));
    const more = (p, label) => (p ? `<p style="margin-top:16px"><a class="btn" href="${link(p.slug)}">${label}</a></p>` : "");
    if (site.services.length) {
      const sp = find("services", "prices");
      extra("What we offer", serviceCards({ ...site, services: sp ? site.services.slice(0, 3) : site.services }, true) + (sp && site.services.length > 3 ? more(sp, "See all services") : ""));
    }
    // Every product on the home page, with the search box and category buttons (the same as the Shop page).
    if (site.products.length) extra("Our products", shopSections(site, img));
    // Reviews: the latest approved ones, or (with no Testimonials page) an invitation to leave the first.
    const tp = find("testimonials");
    if (site.reviews.count) extra("What customers say", reviewsHtml(site, mode, { all: false, form: !tp }) + more(tp, `Read all ${site.reviews.count} review${site.reviews.count === 1 ? "" : "s"}`));
    else if (!tp) extra("", reviewsHtml(site, mode, { all: false, form: true }));
    if (site.photos.length > 1) {
      const gp = find("gallery");
      extra(gp ? "Our work" : "", gallery(site.photos.slice(1, gp ? 5 : 7), img) + more(gp, "See the gallery"));
    }
  }
  if (page.kind === "services" || page.kind === "prices") extra("", serviceCards(site, true));
  // No gallery photos yet: a store shows its product photos instead of an empty page.
  const galleryPhotos = site.photos.length ? site.photos : site.productPhotos.slice(0, 12);
  if (page.kind === "gallery") extra("", galleryPhotos.length ? gallery(galleryPhotos, img) : mode === "preview" ? `<p><mark class="todo">To be added: photos</mark></p>` : "");
  if (page.kind === "testimonials" && site.testimonials.length) extra("", `<div class="cards">${site.testimonials.map((t) => `<blockquote>${esc(t)}</blockquote>`).join("")}</div>`);
  if (page.kind === "testimonials") extra("", reviewsHtml(site, mode, { all: true }));
  if (page.kind === "shop") {
    extra("", site.products.length ? shopSections(site, img) : "");
    if (site.delivery || site.returns) extra("Delivery and returns", `${site.delivery ? `<p><strong>Delivery:</strong> ${esc(site.delivery)}</p>` : ""}${site.returns ? `<p><strong>Returns:</strong> ${esc(site.returns)}</p>` : ""}`);
  }
  if (page.kind === "blog") for (const post of site.blogPosts) extra("", `<article class="post"><h2>${esc(post.title)}</h2>${blocks(post.body, mode)}</article>`);
  if (page.kind === "contact" || page.kind === "location") extra("", contactCard(site, mode));
  // The map itself on the Location page (or on Contact when there's no Location page). No key needed.
  if (site.address && (page.kind === "location" || (page.kind === "contact" && !site.pages.some((p) => p.kind === "location")))) {
    extra("", `<div class="map"><iframe title="Map: ${esc(site.name)}" src="https://maps.google.com/maps?q=${encodeURIComponent(site.address.replace(/\s*\n\s*/g, ", "))}&amp;z=15&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>`);
  }
  if (page.kind !== "contact" && site.whatsapp) {
    out.push(`<div class="cta"><div class="wrap"><h2>Ready when you are</h2><p>Send us a message and we'll reply quickly.</p><a class="btn" href="${waLink(site)}">Chat on WhatsApp</a></div></div>`);
  }
  let html = out.join("");
  // FAQ: each question opens and closes (tap to read the answer).
  if (page.kind === "faq") {
    html = html.replace(/<h3>([^<]*(?:<(?!\/h3>)[^<]*)*)<\/h3>((?:<p>[\s\S]*?<\/p>)+)/g, '<details class="faq"><summary>$1</summary>$2</details>')
      .replace(/<li class="qa"><strong>([\s\S]*?)<\/strong><br>([\s\S]*?)<\/li>/g, '<li class="qa"><details class="faq"><summary>$1</summary><p>$2</p></details></li>');
  }
  return html;
}

function footer(site, link) {
  const socials = site.socials.map((s) => (/^https?:\/\//.test(s) ? `<a href="${esc(s)}" rel="noopener">${esc(s.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>` : esc(s))).join(" · ");
  return `<footer><div class="wrap"><strong>${esc(site.name)}</strong>${site.tagline ? `<span>${esc(site.tagline)}</span>` : ""}
<span>${[site.phone && esc(site.phone), site.email && `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`, site.address && esc(site.address.split("\n")[0])].filter(Boolean).join(" · ")}</span>
${socials ? `<span>${socials}</span>` : ""}<span>© ${new Date().getFullYear()} ${esc(site.name)}</span>
${site.noCredit ? "" : `<span class="credit">Website by <a href="https://www.sirraddo.com.ng/websites?utm_source=client-site&amp;utm_campaign=${esc(site.creditTag || "site")}" rel="noopener">SIRRADDO</a> · <a href="https://www.sirraddo.com.ng/websites?utm_source=client-site&amp;utm_campaign=${esc(site.creditTag || "site")}" rel="noopener">Get a website like this</a></span>`}</div></footer>
${site.whatsapp ? `<a class="wa" href="${waLink(site)}" aria-label="Chat on WhatsApp">WhatsApp</a>` : ""}`;
}

function previewPanel(row, token, choice) {
  const status = row.preview_status;
  const todo = /\[ADD:/.test(row.draft_md || "");
  const done = status === "approved"
    ? `<p class="msg">You approved this design${row.preview_approved_at ? " on " + new Date(row.preview_approved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}. Thank you! We will put it live once the balance is paid.</p>`
    : "";
  return `<div class="pv" id="review"><div class="wrap">
<h2>${status === "approved" ? "Approved" : "What do you think?"}</h2>
${status !== "approved" && choice ? `<p><strong>We made ${choice.count} designs for you.</strong> Switch between them with the buttons at the top of the page. You're looking at <strong>${choice.label}</strong>.</p>` : ""}
${status === "approved" ? "" : `<p>Look through every page. If you're happy, tap <strong>Approve</strong>. If anything should change, write it below and tap <strong>Send changes</strong>.${todo ? " The yellow parts are details we still need from you." : ""}</p>`}
${done}
<form id="pv-form"${status === "approved" ? " hidden" : ""}>
<label for="pv-text">Changes you'd like (optional)</label>
<textarea id="pv-text" maxlength="3000" placeholder="e.g. Change the opening hours to 9am–7pm, use the second photo at the top…"></textarea>
<div class="row"><button class="btn ok" type="button" data-act="approved">${choice ? "Approve " + choice.label : "Approve my website"}</button><button class="btn chg" type="button" data-act="changes">Send changes</button></div>
<p class="msg" id="pv-msg" role="status"></p></form></div></div>
<script>(function(){var f=document.getElementById('pv-form');if(!f)return;var m=document.getElementById('pv-msg');
f.addEventListener('click',function(e){var b=e.target.closest('button[data-act]');if(!b)return;var act=b.getAttribute('data-act');var t=document.getElementById('pv-text').value.trim();
if(act==='changes'&&!t){m.textContent='Please write what you would like changed.';return;}
if(act==='approved'&&!confirm('Approve ${choice ? choice.label : "this website design"}?'+(t?' Your note will be sent too.':'')))return;
Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=true});m.textContent='Sending…';
fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:${JSON.stringify(token)},action:act,text:t,option:${JSON.stringify(choice ? choice.id : "")}})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})
.then(function(j){m.textContent=j.message;f.querySelector('textarea').value='';if(act==='approved')f.querySelector('.row').hidden=true;else Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=false})})
.catch(function(err){m.textContent=err.message+'. Please try again or message us on WhatsApp.';Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=false})});});})();</script>`;
}

// The panel under a preview of a change request: what changed, and "Put these changes live" / "Something's not right".
export function changePanel(view, token) {
  const { c, results } = view;
  const live = Boolean(c.plan.applied_at);
  const ok = results.filter((r) => r.ok);
  return `<div class="pv" id="review"><div class="wrap">
<h2>${live ? "These changes are live" : "Your changes"}</h2>
<p>You asked: <i>${esc(c.body.length > 300 ? c.body.slice(0, 300) + "…" : c.body)}</i></p>
${ok.length ? `<p>What we changed:</p><ul>${ok.map((r) => `<li>${esc(r.text)}</li>`).join("")}</ul>` : ""}
${live ? `<p class="msg">Already on your website. Thank you!</p>` : `<p>Look through the pages. Everything else stays exactly as it is now. If it's right, tap <strong>Put these changes live</strong>. If something isn't right, write it below and tap <strong>Something's not right</strong>.</p>
<form id="pv-form"><label for="pv-text">What isn't right? (only if needed)</label>
<textarea id="pv-text" maxlength="3000" placeholder="e.g. The scarf price should be 9,500"></textarea>
<div class="row"><button class="btn ok" type="button" data-act="approved">Put these changes live</button><button class="btn chg" type="button" data-act="changes">Something's not right</button></div>
<p class="msg" id="pv-msg" role="status"></p></form>
<script>(function(){var f=document.getElementById('pv-form');var m=document.getElementById('pv-msg');
f.addEventListener('click',function(e){var b=e.target.closest('button[data-act]');if(!b)return;var act=b.getAttribute('data-act');var t=document.getElementById('pv-text').value.trim();
if(act==='changes'&&!t){m.textContent='Please write what is not right.';return;}
if(act==='approved'&&!confirm('Put these changes on your live website now?'))return;
Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=true});m.textContent=act==='approved'?'Updating your website…':'Sending…';
fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({c:${JSON.stringify(token)},action:act,text:t})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})
.then(function(j){m.textContent=j.message;f.querySelector('textarea').value='';if(act==='approved'){f.querySelector('.row').hidden=true;f.querySelector('textarea').hidden=true;f.querySelector('label').hidden=true}else Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=false})})
.catch(function(err){m.textContent=err.message+'. Please try again or message us on WhatsApp.';Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=false})});});})();</script>`}
</div></div>`;
}

// mode: "preview" (served at /preview, with the approval panel) or "export" (plain files for hosting).
export function renderPage(site, slug, { mode = "export", link, img = (u) => u, row, token, choice, switcher = "", notFound = false, top = null, panel = null } = {}) {
  const page = notFound ? NOT_FOUND_PAGE : site.pages.find((p) => p.slug === slug) || site.pages[0];
  const title = page.title || (page.kind === "home" ? site.name : `${page.name} | ${site.name}`);
  const desc = page.meta || site.tagline || "";
  const preview = mode === "preview";
  return `<!doctype html>
<html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(preview ? "Preview: " + title : title)}</title>${desc ? `\n<meta name="description" content="${esc(desc)}">` : ""}
${seoHead(site, page, { title, desc, img, preview, notFound })}
${preview || notFound ? '<meta name="robots" content="noindex, nofollow">' : ""}<meta name="theme-color" content="${site.theme.primary}">
${site.logo ? `<link rel="icon" href="${img(site.logo.url)}">` : ""}
<style>${css(site.theme)}${preview ? PREVIEW_CSS : ""}</style>${site.designCss ? `\n${fontLinks(site.designCss)}<style id="design">${site.designCss}</style>` : ""}
<style id="guard">${GUARD_CSS}${hasCart(site) ? CART_CSS + ACCOUNT_CSS : ""}</style></head>
<body class="page-${page.kind} kind-${site.kind}">${preview ? `<div class="pv-top">${top ?? `Preview of your new website. It is not live yet. <a href="#review">Approve or ask for changes</a>${switcher}`}</div>` : ""}
${site.notice ? `<div class="site-notice" role="status">${esc(site.notice)}</div>` : ""}${header(site, page, link, img)}
<main>${notFound ? notFoundBody(site, link) : pageBody(site, page, mode, link, img)}</main>
${preview ? panel ?? previewPanel(row, token, choice) : ""}
${footer(site, link)}
${site.products && site.products.length ? PRODUCT_POP : ""}${hasCart(site) ? cartScript(site, mode) + `<script>${ACCOUNT_JS}</script>` : ""}${mode === "export" && !notFound ? statsScript(site) : ""}
</body></html>`;
}

// ---------- Google and share previews ----------
const NOT_FOUND_PAGE = { slug: "404", kind: "notfound", name: "Page not found", title: "", meta: "", sections: [] };
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
const pagePath = (slug) => (slug === "index" ? "/" : `/${slug}`);

function seoHead(site, page, { title, desc, img, preview, notFound }) {
  const base = site.baseUrl;
  const abs = (u) => (!u ? "" : /^https?:\/\//.test(u) ? u : base ? `${base}/${String(u).replace(/^\/+/, "")}` : "");
  const url = base && !notFound ? base + pagePath(page.slug) : "";
  const shareImg = abs(site.photos[0] ? img(site.photos[0].url) : site.productPhotos[0] ? img(site.productPhotos[0].url) : site.logo ? img(site.logo.url) : "");
  const out = [];
  if (url && !preview) out.push(`<link rel="canonical" href="${esc(url)}">`);
  out.push(`<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site.name)}"><meta property="og:title" content="${esc(title)}">`);
  if (desc) out.push(`<meta property="og:description" content="${esc(desc)}">`);
  if (url) out.push(`<meta property="og:url" content="${esc(url)}">`);
  out.push(`<meta property="og:locale" content="en_NG">`);
  if (shareImg) out.push(`<meta property="og:image" content="${esc(shareImg)}"><meta property="og:image:alt" content="${esc(site.name)}">`);
  out.push(`<meta name="twitter:card" content="${shareImg ? "summary_large_image" : "summary"}">`);
  if (preview || notFound) return out.join("\n");
  // Business details for Google (home page), and products with prices (shop page).
  if (page.slug === "index") {
    const biz = { "@context": "https://schema.org", "@type": site.kind === "store" ? "Store" : "LocalBusiness", name: site.name };
    if (base) biz.url = base + "/";
    if (site.tagline || desc) biz.description = site.tagline || desc;
    if (site.phone) biz.telephone = site.phone;
    if (site.email) biz.email = site.email;
    if (site.address) biz.address = { "@type": "PostalAddress", streetAddress: site.address.replace(/\s*\n\s*/g, ", "), addressCountry: "NG" };
    if (shareImg) biz.image = shareImg;
    if (site.logo && abs(img(site.logo.url))) biz.logo = abs(img(site.logo.url));
    const same = site.socials.filter((x) => /^https?:\/\//i.test(x));
    if (same.length) biz.sameAs = same;
    out.push(jsonLd(biz));
  }
  if (page.kind === "shop") {
    const items = site.products.filter((p) => p.amount).slice(0, 50).map((p) => {
      const o = { "@type": "Product", name: p.name, offers: { "@type": "Offer", price: String(p.amount), priceCurrency: "NGN", availability: "https://schema.org/InStock" } };
      if (p.text || p.details) o.description = String(p.text || p.details).slice(0, 300);
      const ph = productPhotoFor(site, p);
      if (ph && abs(img(ph.url))) o.image = abs(img(ph.url));
      return o;
    });
    if (items.length) out.push(jsonLd({ "@context": "https://schema.org", "@type": "ItemList", itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, item })) }));
  }
  return out.join("\n");
}

function notFoundBody(site, link) {
  const wa = waLink(site, `Hello ${site.name}, I was looking for something on your website.`);
  return `<section class="section"><div class="wrap" style="text-align:center;padding-top:48px;padding-bottom:48px">
<h1>Sorry, we can't find that page</h1><p>The link may be old or mistyped. These might help:</p>
<p style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px"><a class="btn" href="${link("index")}">Go to the home page</a>${wa ? `<a class="btn" href="${wa}">Ask us on WhatsApp</a>` : ""}</p></div></section>`;
}

// Private visitor counts for the monthly report: no cookies, nothing personal (see api/_lib/stats.mjs).
function statsScript(site) {
  if (!site.statsKey) return "";
  return `<script>(function(){if(location.protocol==='file:'||/^(localhost|127\\.)/.test(location.hostname))return;var K=${JSON.stringify(site.statsKey)},A=${JSON.stringify(SITE_URL + "/api/site?hit=1")};
function s(e){try{var b=JSON.stringify({k:K,e:e,p:location.pathname,r:e==='view'?document.referrer:''});if(navigator.sendBeacon)navigator.sendBeacon(A,b);else fetch(A,{method:'POST',body:b,keepalive:true})}catch(_){}}
s('view');document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';
if(/wa\\.me|whatsapp/i.test(h))s('wa');else if(/^tel:/i.test(h))s('call');else if(/^mailto:/i.test(h))s('email')},true);
var w=document.querySelector('.cart .waorder');if(w)w.addEventListener('click',function(){s('wa')})})();</script>`;
}

const hasCart = (site) => site.kind === "store" && site.products.some((p) => p.amount);

// Google Fonts named in the custom design ("/* fonts: Playfair Display, Inter */") are loaded with <link>.
export function fontNames(designCss) {
  const m = String(designCss || "").match(/\/\*\s*fonts:\s*([^*]{1,200})\*\//i);
  return m ? m[1].split(",").map((f) => f.trim()).filter((f) => /^[A-Za-z0-9 ]{2,40}$/.test(f)).slice(0, 2) : [];
}
function fontLinks(designCss) {
  const fams = fontNames(designCss);
  if (!fams.length) return "";
  const q = fams.map((f) => "family=" + f.replace(/ /g, "+") + ":wght@400;600;700;800").join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=swap">`;
}

// Every page and image, for the download. Images are given local names under images/.
export function exportFiles(site) {
  const images = new Map();
  const img = (url) => {
    if (!images.has(url)) {
      const ext = (url.split("?")[0].match(/\.(jpe?g|png|webp|gif|svg)$/i) || [".jpg"])[0].toLowerCase();
      images.set(url, `images/${String(images.size + 1).padStart(2, "0")}${ext}`);
    }
    return images.get(url);
  };
  const link = (slug) => (slug === "index" ? "index.html" : `${slug}.html`);
  const pages = site.pages.map((p) => ({ name: link(p.slug), html: renderPage(site, p.slug, { mode: "export", link, img }) }));
  // The "page not found" page is shown at any address, so its links start from the site root.
  const rootLink = (slug) => (slug === "index" ? "/" : `/${slug}`);
  pages.push({ name: "404.html", html: renderPage(site, "index", { mode: "export", link: rootLink, img: (u) => "/" + img(u), notFound: true }) });
  const base = site.baseUrl;
  const today = new Date().toISOString().slice(0, 10);
  pages.push({ name: "robots.txt", html: `User-agent: *\nAllow: /\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ""}` });
  if (base) {
    pages.push({ name: "sitemap.xml", html: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${site.pages.map((p) => `  <url><loc>${esc(base + pagePath(p.slug))}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n` });
  }
  return { pages, images: [...images.entries()].map(([url, path]) => ({ url, path })) };
}

// ---------- A small .zip writer (stored, no compression; images are already compressed) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
