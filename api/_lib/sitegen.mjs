// Builds a customer's website from their project form (brief), uploaded photos and the AI text (draft_md).
// Used for the preview link (/preview?t=...) and for "Download site" in admin (a .zip ready to upload to any host).
// No AI here: it only lays out what is already written, so the result is predictable.
import { kindFor } from "./brief-schema.mjs";
import { SITE_URL } from "../../site.config.mjs";
import { ACCOUNT_CSS, ACCOUNT_JS } from "./storejs.mjs";
import { salePrice, parseOptions } from "./storeplus.mjs";
import { KIT_CSS, actionBar, openBadge, kitScript, kitButtons, manifest, SW_JS, appIconSvg } from "./sitekit.mjs";

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
export const SITE_LOOK = "2026-11-21";
// What the website owner sees in the "your website was improved" email: plain words, newest look first.
// Add an entry here every time SITE_LOOK changes.
export const SITE_LOOK_NOTES = {
  "2026-11-21": [
    "Your website can now be installed like an app: visitors tap “Install our app” (or Add to home screen) and get your own app icon on their phone, with no app store.",
    "On phones, a bar at the bottom gives one-tap Call, WhatsApp, Directions and your main page.",
    "If your opening hours are on your website, it now shows “Open now” or “Closed now” (Lagos time).",
    "A “Share this website” button helps your customers send your website to their friends.",
    "Online stores: an app-style layout on phones (Home, Shop, Cart, Saved, Account), every product on your home page with a search box, and your new or chosen products sliding across the top.",
    "Online stores: sales with the old price crossed out and a countdown, discount codes, delivery fees by area with free delivery above an amount, and sizes/colours with stock for each one.",
    "Online stores: buyers can track their order (packed, out for delivery, delivered), pay small-small, ask to be told when a sold-out item is back, swipe and zoom product photos, and share products on WhatsApp.",
    "Online stores: you set all of this in My store, which now also has Reports (best sellers, sales by week, busiest days) and, with customer accounts, reviews from verified buyers and unfinished carts to follow up.",
  ],
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
// Sale prices: the price buyers pay now (the old price crossed out) until the sale ends.
function saleOf(p) {
  const s = salePrice(p, priceAmount);
  return { amount: s.amount, wasAmount: s.was, onSale: s.onSale, saleEnds: s.ends, off: s.off || 0 };
}
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
    hideStock: Boolean(row.shop?.hideStock),
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
    // Photos on a product card that has no name yet wait for that product (never shown on another one).
    productPhotos: (files.product_photos || []).filter(isImage).filter((f) => !(b.products || []).some((p) => !String(p?.name || "").trim() && (p?.photo === f.url || (Array.isArray(p?.photos) && p.photos.includes(f.url))))),
    services: (b.services || []).filter((s) => s.name),
    // i = position in the form (the cart and checkout use it); amount = price as a number, if it is one.
    products: (b.products || []).map((p, i) => ({ ...p, i })).filter((p) => p.name).map((p, pos) => ({
      ...p, pos, ...saleOf(p), options: parseOptions(p.options), text: noPrice((productText[p.name.toLowerCase()] || []).join(" ")),
    })),
    get allProducts() { return this.products; },
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
.shop-none{padding:20px 0;font-weight:600}.cat-more-row{text-align:center;margin:14px 0 4px}.cat-more-row[hidden]{display:none}.cat-more{background:transparent;color:inherit;border:1.5px solid currentColor}
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
  if (site.hours) rows.push(["Opening hours", esc(site.hours) + openBadge(site)]);
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
// The main photo of every product, worked out once per site (a store can have 1,000 products and 3,000 photos;
// matching each card on its own would take far too long). Same rules as before, over the whole product list.
const photoCache = new WeakMap();
function photoPlan(site) {
  const photos = site.productPhotos || [], prods = site.allProducts || site.products;
  const sig = prods.length + ":" + prods.map((x) => x.i + "/" + x.name + "/" + (x.photo || "") + "/" + (Array.isArray(x.photos) ? x.photos.length : 0)).join("|");
  const hit = photoCache.get(photos);
  if (hit && hit.sig === sig && hit.prods === prods) return hit;
  const urls = new Set(photos.map((f) => f.url));
  const taken = new Set(prods.map((x) => x.photo).filter((u) => urls.has(u)));
  const extras = new Set(prods.flatMap((x) => (Array.isArray(x.photos) ? x.photos : [])));
  const free = photos.filter((f) => !taken.has(f.url) && !extras.has(f.url));
  const all = new Set(prods.map((x) => slugify(x.name)));
  const byKey = new Map(), numbers = new Map();
  for (const f of free) {
    const k = photoKey(f);
    if (!byKey.has(k)) byKey.set(k, f);
    const m = k.match(/^(.*?)-?(\d{1,2})$/);
    if (m && !all.has(k)) { if (!numbers.has(m[1])) numbers.set(m[1], []); numbers.get(m[1]).push({ f, n: Number(m[2]) }); }
  }
  for (const list of numbers.values()) list.sort((a, b) => a.n - b.n);
  const named = (f) => { const k = photoKey(f), b = k.replace(/-?\d{1,2}$/, ""); return all.has(k) || (b !== k && all.has(b)); };
  const leftPhotos = free.filter((f) => !named(f));
  const map = new Map();
  let k = 0;
  for (const x of prods) {
    const chosen = x.photo && urls.has(x.photo) ? photos.find((f) => f.url === x.photo) : null;
    const slug = slugify(x.name);
    const mine = chosen || byKey.get(slug) || numbers.get(slug)?.[0]?.f || null;
    if (mine) { map.set(x, mine); continue; }
    if (x.photo && taken.has(x.photo)) continue;
    map.set(x, leftPhotos[k++] || null); // photos with phone names go to products without one, in order
  }
  // Numbered photos ("ankara-gown-2") of each product among all photos, for the extra photos in its pop-up.
  const numAll = new Map();
  for (const f of photos) {
    const kk = photoKey(f), m = kk.match(/^(.*?)-?(\d{1,2})$/);
    if (m && !all.has(kk)) { if (!numAll.has(m[1])) numAll.set(m[1], []); numAll.get(m[1]).push({ f, n: Number(m[2]) }); }
  }
  for (const list of numAll.values()) list.sort((a, b) => a.n - b.n);
  const plan = { sig, prods, map, numAll };
  photoCache.set(photos, plan);
  return plan;
}
export function productPhotoFor(site, p) {
  const { map } = photoPlan(site);
  if (map.has(p)) return map.get(p);
  const same = [...map.keys()].find((x) => x.i === p.i && x.name === p.name);
  return same ? map.get(same) : null;
}
// The old one-product-at-a-time version (kept for the tests that check both agree).
export function productPhotoForSlow(site, p) {
  const photos = site.productPhotos;
  const chosen = p.photo && photos.find((f) => f.url === p.photo);
  if (chosen) return chosen;
  const taken = new Set(site.products.map((x) => x.photo).filter((u) => photos.some((f) => f.url === u)));
  // Extra photos chosen for a product ("+ More photos") are never another product's main photo.
  const extras = new Set(site.products.flatMap((x) => (Array.isArray(x.photos) ? x.photos : [])));
  const free = photos.filter((f) => !taken.has(f.url) && !extras.has(f.url));
  const byName = free.find((f) => photoKey(f) === slugify(p.name)) || numbered(site, p, free)[0];
  if (byName) return byName;
  // Photos named after any product (or numbered, "ankara-gown-2") are never handed to another product.
  const all = new Set(site.products.map((x) => slugify(x.name)));
  const named = (f) => { const k = photoKey(f), b = k.replace(/-?\d{1,2}$/, ""); return all.has(k) || (b !== k && all.has(b)); };
  const leftPhotos = free.filter((f) => !named(f));
  const leftProducts = site.products.filter((x) => !(x.photo && taken.has(x.photo)) && !free.some((f) => photoKey(f) === slugify(x.name)) && !numbered(site, x, free).length);
  return leftPhotos[leftProducts.indexOf(p)] || null;
}
// "Ankara Gown 2.jpg", "ankara-gown-3.png": more photos of "Ankara Gown" (lowest number first), unless another product
// is called exactly that.
function numbered(site, p, list) {
  const slug = slugify(p.name), all = new Set(site.products.map((x) => slugify(x.name)));
  return list.map((f) => ({ f, m: photoKey(f).match(/^(.*?)-?(\d{1,2})$/) })).filter((x) => x.m && x.m[1] === slug && !all.has(photoKey(x.f)))
    .sort((a, b) => Number(a.m[2]) - Number(b.m[2])).map((x) => x.f);
}
export function productPhotosAll(site, p) {
  const main = productPhotoFor(site, p);
  const chosen = Array.isArray(p.photos) ? p.photos : [];
  const extra = (photoPlan(site).numAll.get(slugify(p.name)) || []).map((x) => x.f).concat(site.productPhotos.filter((f) => chosen.includes(f.url))).filter((f, i, a) => f !== main && f.url !== main?.url && a.indexOf(f) === i);
  return [main, ...extra].filter(Boolean).slice(0, 8);
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
document.querySelectorAll('.cards.products .card').forEach(function(c){var hit=w?c.textContent.toLowerCase().indexOf(w)>=0:!(c.hasAttribute('data-more')&&!c.parentNode.classList.contains('open'));c.hidden=!hit;if(hit)n++});
document.querySelectorAll('.cat-more-row').forEach(function(b){b.hidden=!!w||b.previousElementSibling.classList.contains('open')});
cats.forEach(function(s){s.hidden=!!w&&!s.querySelector('.card:not([hidden])')});links.forEach(function(a){var s=document.querySelector(a.getAttribute('href'));a.hidden=!!s&&s.hidden});none.hidden=n>0;});}
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('.cat-more');if(!b)return;var row=b.parentNode,g=row.previousElementSibling;g.classList.add('open');g.querySelectorAll('[data-more]').forEach(function(c){c.hidden=false});row.hidden=true});
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
  // Big stores: a few per category at first ("See all"), so the page opens fast; search still finds every product.
  const big = site.products.length > 60;
  if (cats.length < 2) return tools("") + productCards(site, img, big ? 48 : 0);
  return tools(`<nav class="cat-nav" aria-label="Product categories">${cats.map((c) => `<a href="#${id(c)}">${esc(c.name)} <span>(${c.products.length})</span></a>`).join("")}</nav>`) +
    cats.map((c) => `<section class="cat" id="${id(c)}"><h2>${esc(c.name)} <a class="cat-top" href="#categories">\u2191 Categories</a></h2>${productCards({ ...site, products: c.products }, img, big ? 24 : 0)}</section>`).join("");
}
function productCards(site, img, limit = 0) {
  const shopOn = hasCart(site) && site.shopToken;
  let shown = 0;
  const rvAll = (site.reviews?.list || []).filter((x) => x.i !== undefined);
  return `<div class="cards products">${site.products.map((p) => {
    const photo = productPhotoFor(site, p);
    const photos = productPhotosAll(site, p).map((f) => img(f.url));
    const rv = rvAll.filter((x) => x.i === p.i);
    const avg = rv.length ? rv.reduce((a, x) => a + x.stars, 0) / rv.length : 0;
    const opts = p.amount && p.options && p.options.length ? p.options : null;
    const order = waLink(site, `Hello ${site.name}, I'd like to order: ${p.name}${p.price ? " (" + naira(p.price) + ")" : ""}`);
    const left = /^\d{1,6}$/.test(String(p.stock ?? "").trim()) ? Number(p.stock) : null;
    const sold = p.soldout || left === 0;
    const stockLine = !sold && left !== null && !site.hideStock ? `<p class="stock${left <= 5 ? " low" : ""}">${left <= 5 ? `Only ${left} left` : `${left} in stock`}</p>` : "";
    const buy = sold ? `<p class="buy"><span class="soldout">Sold out</span>${shopOn ? `<button class="btn ntf" type="button" data-i="${p.i}">Tell me when it's back</button>` : ""}</p>`
      : opts ? `${stockLine}<p class="buy"><button class="btn add-opt" type="button" data-i="${p.i}" data-name="${esc(p.name)}" data-price="${p.amount}"${left !== null ? ` data-max="${left}"` : ""}${photo ? ` data-img="${img(photo.url)}"` : ""} data-opts="${esc(JSON.stringify(opts))}">Choose ${esc(opts.map((g) => g.name.toLowerCase()).join(" & "))}</button></p>`
      : p.amount
      ? `${stockLine}<p class="buy" data-i="${p.i}"><button class="btn add" type="button" data-i="${p.i}" data-name="${esc(p.name)}" data-price="${p.amount}"${left !== null ? ` data-max="${left}"` : ""}${photo ? ` data-img="${img(photo.url)}"` : ""}>Add to cart</button><span class="step" hidden><button type="button" data-d="-1" aria-label="One less ${esc(p.name)}">\u2212</button><b>0</b><button type="button" data-d="1" aria-label="One more ${esc(p.name)}">+</button><small>in cart</small></span></p>`
      : order ? `${stockLine}<p class="buy"><a class="btn" href="${order}">${p.price ? "Order on WhatsApp" : "Ask on WhatsApp"}</a></p>` : "";
    // Compact card: photo, name and price. Tapping the photo or name opens the full description (and the same Add to cart) in a pop-up.
    const text = p.text || p.details;
    // Sale: the price now, the old price crossed out and "−20%", with a countdown when the sale has an end date.
    const price = p.onSale ? `<p class="price"><span class="now">${naira(p.amount)}</span> <s>${naira(p.wasAmount)}</s> <b class="off">\u2212${p.off}%</b></p>${p.saleEnds ? `<p class="sale-end" data-ends="${esc(p.saleEnds)}" data-was="${p.wasAmount}">Sale ends soon</p>` : ""}`
      : p.price ? `<p class="price">${esc(p.amount ? naira(p.amount) : naira(p.price))}</p>` : "";
    const rate = rv.length ? `<p class="prate"><span aria-hidden="true">\u2605</span> ${avg.toFixed(1)} <small>(${rv.length} review${rv.length === 1 ? "" : "s"})</small></p>` : "";
    const data = `${photos.length > 1 ? ` data-photos="${esc(JSON.stringify(photos))}"` : ""}${rv.length ? ` data-rv="${esc(JSON.stringify(rv.slice(0, 6).map((x) => ({ n: x.name, s: x.stars, t: x.text, v: x.verified }))))}"` : ""}`;
    const more = limit && ++shown > limit ? " hidden data-more" : "";
    return `<div class="card prod${sold ? " is-soldout" : ""}${p.onSale ? " on-sale" : ""}" data-pi="${p.i}"${data}${more}>${p.onSale ? `<span class="sale-tag">\u2212${p.off}%</span>` : ""}${photo ? `<img class="pv-open" src="${img(photo.url)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : ""}<h3><button class="pname pv-open" type="button" aria-haspopup="dialog">${esc(p.name)}</button></h3>${rate}${text ? `<div class="pdesc" hidden>${esc(text)}</div>` : ""}${price}${buy}</div>`;
  }).join("")}</div>${limit && site.products.length > limit ? `<p class="cat-more-row"><button class="btn cat-more" type="button">See all ${site.products.length}</button></p>` : ""}`;
}

// Product pop-up: photos (swipe, tap to zoom), the full description, sizes/colours, reviews from buyers, share,
// "Tell me when it's back" for sold-out items, and the same Add to cart. In the site's own colours.
// Also: sale countdowns on the cards ("Ends in 2d 04:11:05"); when a sale ends the old price comes back by itself.
const PRODUCT_POP = `<style>.ppop{position:fixed;inset:0;z-index:65;background:rgba(15,23,42,.6);display:flex;align-items:flex-end;justify-content:center}.ppop[hidden]{display:none}
.ppop .box{width:min(520px,100vw);max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:0 18px 22px;box-shadow:0 -8px 30px rgba(0,0,0,.3)}
@media(min-width:700px){.ppop{align-items:center}.ppop .box{border-radius:18px}}
.ppop .bar{position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;background:inherit;margin:0 -18px;padding:6px 8px;z-index:2}.ppop .x{background:none;border:0;font-size:32px;line-height:1;width:46px;height:46px;cursor:pointer;color:inherit}
.ppop .shr{background:none;border:1px solid currentColor;border-radius:999px;color:inherit;font:inherit;font-size:.9rem;font-weight:700;padding:7px 14px;cursor:pointer;opacity:.85;margin-left:8px}
.ppop .gal{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:8px;scrollbar-width:none;margin-bottom:6px}.ppop .gal::-webkit-scrollbar{display:none}
.ppop .gal img{flex:0 0 100%;width:100%;max-height:52vh;object-fit:contain;border-radius:12px;scroll-snap-align:center;cursor:zoom-in;background:rgba(0,0,0,.04)}.ppop .gdots{display:flex;justify-content:center;gap:6px;margin:4px 0 10px}.ppop .gdots i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.25}.ppop .gdots i.on{opacity:.85}
.ppop h3{margin:4px 0 6px;font-size:1.3rem;color:inherit}.ppop .price{font-size:1.2rem;font-weight:800;margin:0 0 10px}
.ppop .desc{white-space:pre-line;margin:0 0 16px;opacity:.9}.ppop .buy{margin:0}.ppop .buy .btn{width:100%;text-align:center;padding:15px;box-sizing:border-box}
.ppop .og{margin:0 0 12px}.ppop .og b{display:block;margin-bottom:6px;font-size:.95rem}.ppop .og .ch{display:flex;flex-wrap:wrap;gap:8px}.ppop .og button{min-width:48px;padding:9px 14px;border-radius:10px;border:1.5px solid rgba(127,127,127,.45);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
.ppop .og button[aria-pressed=true]{border-color:currentColor;outline:2px solid currentColor}.ppop .og button.out{opacity:.4;text-decoration:line-through}.ppop .vleft{font-size:.9rem;font-weight:700;margin:0 0 8px;min-height:1.2em}
.ppop .rvs{margin:18px 0 0;border-top:1px solid rgba(127,127,127,.25);padding-top:12px}.ppop .rvs h4{margin:0 0 8px;font-size:1.05rem}.ppop .rv1{padding:8px 0;border-bottom:1px solid rgba(127,127,127,.15)}.ppop .rv1 .st{color:#F5A524}.ppop .rv1 small{opacity:.7;margin-left:6px}.ppop .vb{color:#15803D;font-weight:700;font-size:.8rem;margin-left:6px}
.ppop .form{display:grid;gap:8px;margin-top:10px}.ppop .form input,.ppop .form textarea{font:inherit;font-size:16px;padding:11px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit}.ppop .stars button{font-size:28px;background:none;border:0;color:#F5A524;cursor:pointer;padding:0 2px;opacity:.35}.ppop .stars button.on{opacity:1}
.ppop .form .go{border:0;border-radius:12px;padding:13px;font:inherit;font-weight:800;cursor:pointer}.ppop .fm{font-size:.9rem;opacity:.85}.ppop .lnk{background:none;border:0;color:inherit;text-decoration:underline;font:inherit;cursor:pointer;padding:6px 0;opacity:.85}
.pzoom{position:fixed;inset:0;z-index:80;background:#000;overflow:auto;touch-action:pan-x pan-y pinch-zoom}.pzoom[hidden]{display:none}.pzoom img{display:block;width:100%;min-height:100%;object-fit:contain;cursor:zoom-in}.pzoom.big img{width:220%;max-width:none;cursor:zoom-out}.pzoom .x{position:fixed;top:10px;right:10px;width:46px;height:46px;border-radius:50%;border:0;background:rgba(255,255,255,.9);font-size:28px;cursor:pointer}
.card.prod{position:relative}.sale-tag{position:absolute;top:8px;left:8px;z-index:2;background:#E11D48;color:#fff;font-weight:800;font-size:.8rem;border-radius:8px;padding:3px 8px}
.price s{opacity:.55;font-weight:500;font-size:.88em;margin-left:4px}.price .off{color:#E11D48;font-size:.85em;margin-left:4px}.sale-end{font-size:.85rem;font-weight:700;color:#C2410C;margin:-4px 0 8px}.prate{margin:0 0 4px;font-size:.9rem;font-weight:700}.prate span{color:#F5A524}.prate small{font-weight:500;opacity:.7}
.buy .ntf{display:block;margin-top:8px;font-size:.9rem;padding:9px 12px;background:transparent!important;color:inherit!important;border:1.5px solid currentColor!important}</style>
<div class="ppop" hidden role="dialog" aria-modal="true" aria-label="Product details"><div class="box"><div class="bar"><button class="shr" type="button">Share</button><button class="x" type="button" aria-label="Close">×</button></div><div class="in"></div></div></div>
<div class="pzoom" hidden role="dialog" aria-label="Photo"><button class="x" type="button" aria-label="Close">×</button><img alt=""></div>
<script>(function(){var pop=document.querySelector('.ppop'),box=pop.querySelector('.box'),inn=pop.querySelector('.in'),zm=document.querySelector('.pzoom'),last=null,cur=null;
function solid(el){while(el){var c=getComputedStyle(el).backgroundColor;if(c&&c!=='transparent'&&!/rgba\\(.*,\\s*0\\)$/.test(c))return c;el=el.parentElement}return '#fff'}
function E(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function J(a){try{return JSON.parse(a||'null')}catch(x){return null}}
function money(n){return '\\u20a6'+Number(n).toLocaleString('en-NG')}
function api(body){var C=window.__shopC;body.s=C.s;return fetch(C.api+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})}
function close(){pop.hidden=true;inn.innerHTML='';cur=null;document.body.style.overflow='';if(last)last.focus();if(/^#p-\\d+$/.test(location.hash))try{history.replaceState(null,'',location.pathname+location.search)}catch(x){}}
function open(c){cur=c;last=c.querySelector('.pname');box.style.background=solid(c);box.style.color=getComputedStyle(c).color;var im=c.querySelector('img'),d=c.querySelector('.pdesc'),pr=c.querySelector('.price'),se=c.querySelector('.sale-end'),b=c.querySelector('.buy'),ra=c.querySelector('.prate');
var name=c.querySelector('.pname').textContent,ph=J(c.getAttribute('data-photos'))||(im?[im.getAttribute('src')]:[]);inn.innerHTML='';
if(ph.length){var g=document.createElement('div');g.className='gal';g.innerHTML=ph.map(function(u){return '<img src="'+E(u)+'" alt="'+E(name)+'">'}).join('');inn.appendChild(g);
if(ph.length>1){var dt=document.createElement('div');dt.className='gdots';dt.innerHTML=ph.map(function(_,k){return '<i'+(k?'':' class="on"')+'></i>'}).join('');inn.appendChild(dt);g.addEventListener('scroll',function(){var k=Math.round(g.scrollLeft/g.clientWidth);dt.querySelectorAll('i').forEach(function(x,n){x.className=n===k?'on':''})})}}
var h=document.createElement('h3');h.textContent=name;inn.appendChild(h);if(ra)inn.appendChild(ra.cloneNode(true));if(pr)inn.appendChild(pr.cloneNode(true));if(se)inn.appendChild(se.cloneNode(true));
if(d){var p=document.createElement('p');p.className='desc';p.textContent=d.textContent;inn.appendChild(p)}
var ao=b&&b.querySelector('.add-opt');if(ao)options(ao);else if(b)inn.appendChild(b.cloneNode(true));
reviews(c,name);pop.hidden=false;document.body.style.overflow='hidden';pop.querySelector('.x').focus();
try{history.replaceState(null,'','#p-'+c.getAttribute('data-pi'))}catch(x){}}
// Sizes / colours: choose one of each, see how many are left, then add that choice to the cart.
function options(ao){var G=J(ao.getAttribute('data-opts'))||[],i=+ao.getAttribute('data-i'),pick=[],w=document.createElement('div');w.className='opts';
var cfg=window.__shopCfg||{},vs=(cfg.vstock||{})[i]||{};
w.innerHTML=G.map(function(g,k){return '<div class="og"><b>'+E(g.name)+'</b><div class="ch">'+g.values.map(function(v){return '<button type="button" data-g="'+k+'" data-v="'+E(v)+'" aria-pressed="false">'+E(v)+'</button>'}).join('')+'</div></div>'}).join('')+'<p class="vleft" role="status"></p><p class="buy"><button class="btn addv" type="button">Add to cart</button></p>';
inn.appendChild(w);var key=function(){return pick.length===G.length&&pick.every(function(x){return x!=null})?pick.join(' / '):''};
function paint(){w.querySelectorAll('.og button').forEach(function(bt){var k=+bt.getAttribute('data-g');bt.setAttribute('aria-pressed',pick[k]===bt.getAttribute('data-v'));
if(G.length===1||pick[1-k]!=null){var t=pick.slice();t[k]=bt.getAttribute('data-v');var kk=t.join(' / ');bt.classList.toggle('out',vs[kk]!==undefined&&+vs[kk]<=0)}});
var v=key(),n=v&&vs[v]!==undefined?+vs[v]:null;w.querySelector('.vleft').textContent=!v?'Choose '+G.map(function(g){return g.name.toLowerCase()}).join(' and ')+'.':n===0?'Sold out in '+v+'.':n!==null&&n<=5&&!cfg.hideStock?'Only '+n+' left in '+v+'.':''}
w.addEventListener('click',function(e){var bt=e.target.closest('.og button');if(bt){pick[+bt.getAttribute('data-g')]=bt.getAttribute('data-v');paint();return}
if(e.target.closest('.addv')){var v=key();if(!v){w.querySelector('.vleft').textContent='Please choose '+G.map(function(g){return g.name.toLowerCase()}).join(' and ')+' first.';return}
if(vs[v]!==undefined&&+vs[v]<=0)return;if(window.__addToCart){window.__addToCart(i,1,{v:v},true);e.target.closest('.addv').textContent='Added \\u2713 Add another';w.querySelector('.vleft').textContent=v+' is in your cart.'}}});paint()}
// Reviews from buyers (verified), and writing one (signed-in buyers who bought it).
function reviews(c,name){var R=J(c.getAttribute('data-rv'))||[],C=window.__shopC,i=+c.getAttribute('data-pi'),cfg=window.__shopCfg||{};if(!R.length&&!(C&&C.s&&cfg.accounts))return;
var w=document.createElement('div');w.className='rvs';w.innerHTML='<h4>Reviews</h4>'+(R.length?R.map(function(r){return '<div class="rv1"><span class="st">'+'\\u2605'.repeat(r.s)+'</span><small>'+E(r.n)+'</small>'+(r.v?'<span class="vb">\\u2713 Verified buyer</span>':'')+(r.t?'<div>'+E(r.t)+'</div>':'')+'</div>'}).join(''):'<p class="fm">No reviews yet.</p>')+
(C&&C.s&&cfg.accounts?'<button type="button" class="lnk wr">Write a review</button><div class="form" hidden></div>':'');inn.appendChild(w);
var wr=w.querySelector('.wr');if(!wr)return;wr.addEventListener('click',function(){var f=w.querySelector('.form'),A=window.SAcct;f.hidden=false;wr.hidden=true;
if(!A||!A.b()){f.innerHTML='<p class="fm">Only customers who bought this product can review it. Please sign in first.</p><button type="button" class="go si">Sign in</button>';f.querySelector('.si').onclick=function(){close();location.hash='account'};return}
var st=0;f.innerHTML='<div class="stars">'+[1,2,3,4,5].map(function(n){return '<button type="button" data-n="'+n+'" aria-label="'+n+' stars">\\u2605</button>'}).join('')+'</div><textarea rows="3" maxlength="600" placeholder="What did you like? (optional)"></textarea><button type="button" class="go send">Send review</button><p class="fm" role="status"></p>';
f.querySelector('.stars').onclick=function(e){var x=e.target.closest('button');if(!x)return;st=+x.getAttribute('data-n');f.querySelectorAll('.stars button').forEach(function(y,k){y.className=k<st?'on':''})};
f.querySelector('.send').onclick=function(){var m=f.querySelector('.fm');if(!st){m.textContent='Please tap the stars.';return}m.textContent='Sending\\u2026';api({action:'review',t:A.t(),i:i,stars:st,text:f.querySelector('textarea').value}).then(function(){f.innerHTML='<p class="fm">Thank you! Your review shows once the store has seen it.</p>'}).catch(function(err){m.textContent=err.message})}})}
// Sold out: leave your number; the store messages you on WhatsApp when it's back.
function notify(i,name){var C=window.__shopC;if(!C||!C.s)return;var f=document.createElement('div');f.className='form';f.innerHTML='<b>Tell me when '+E(name)+' is back</b><input class="nn" placeholder="Your name" autocomplete="name"><input class="np" type="tel" placeholder="Your phone (WhatsApp)" autocomplete="tel"><button type="button" class="go">Notify me</button><p class="fm" role="status"></p>';
inn.appendChild(f);f.querySelector('.go').onclick=function(){var m=f.querySelector('.fm');if(C.preview){m.textContent='This is a preview: on the live website this saves your number for the store.';return}m.textContent='Saving\\u2026';api({action:'notify_me',i:i,name:f.querySelector('.nn').value,phone:f.querySelector('.np').value}).then(function(){f.innerHTML='<p class="fm">\\u2713 Done. The store will message you when it\\u2019s back.</p>'}).catch(function(err){m.textContent=err.message})}}
document.addEventListener('click',function(e){var n=e.target.closest('.btn.ntf');if(n){var cc=n.closest('.card.prod');if(cc){open(cc);var bb=inn.querySelector('.buy .ntf');if(bb)bb.remove();notify(+n.getAttribute('data-i'),cc.querySelector('.pname').textContent)}return}
var o=e.target.closest('.pv-open,.btn.add-opt');if(!o||o.closest('.ppop'))return;var c=o.closest('.card.prod');if(!c)return;e.preventDefault();open(c);});
inn.addEventListener('click',function(e){var im=e.target.closest('.gal img');if(im){zm.querySelector('img').src=im.src;zm.className='pzoom';zm.hidden=false;return}var n=e.target.closest('.btn.ntf');if(n){n.remove();notify(+n.getAttribute('data-i'),cur?cur.querySelector('.pname').textContent:'')}});
zm.addEventListener('click',function(e){if(e.target.closest('.x')){zm.hidden=true;return}zm.classList.toggle('big')});
pop.querySelector('.shr').addEventListener('click',function(){if(!cur)return;var t=cur.querySelector('.pname').textContent,pr=cur.querySelector('.price'),u=location.origin+location.pathname+'#p-'+cur.getAttribute('data-pi'),txt=t+(pr?' \\u2014 '+pr.textContent.replace(/\\s+/g,' ').trim():'');
if(navigator.share)navigator.share({title:t,text:txt,url:u}).catch(function(){});else window.open('https://wa.me/?text='+encodeURIComponent(txt+'\\n'+u),'_blank')});
pop.addEventListener('click',function(e){if(e.target===pop||e.target.closest('.bar .x'))close()});document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!zm.hidden)zm.hidden=true;else if(!pop.hidden)close()}});
// A shared product link (…#p-3) opens that product.
function deep(){var m=/^#p-(\\d+)$/.exec(location.hash);if(!m)return;var c=document.querySelector('.card.prod[data-pi="'+m[1]+'"]');if(c&&pop.hidden)open(c)}deep();window.addEventListener('hashchange',deep);
// Sale countdowns.
function tick(){var now=Date.now();document.querySelectorAll('.sale-end[data-ends]').forEach(function(el){var t=Date.parse(el.getAttribute('data-ends'))-now;if(t>0){var d=Math.floor(t/864e5),h=Math.floor(t/36e5)%24,mi=Math.floor(t/6e4)%60,sc=Math.floor(t/1e3)%60,z=function(x){return(x<10?'0':'')+x};el.textContent='Sale ends in '+(d?d+'d ':'')+z(h)+':'+z(mi)+':'+z(sc);return}
var c=el.closest('.card.prod'),was=+el.getAttribute('data-was');el.remove();if(!c)return;c.classList.remove('on-sale');var tg=c.querySelector('.sale-tag');if(tg)tg.remove();var pr=c.querySelector('.price');if(pr)pr.textContent=money(was);
c.querySelectorAll('.btn.add,.btn.add-opt').forEach(function(a){a.setAttribute('data-price',was)});var L=window.__cartLines&&window.__cartLines();if(L)L.forEach(function(l){if(l.i===+c.getAttribute('data-pi'))l.p=was})})}
if(document.querySelector('.sale-end[data-ends]')){tick();setInterval(tick,1000)}})();</script>`;

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
.cart .trust{margin:14px 0 0;padding:10px 12px;border-radius:12px;background:rgba(21,128,61,.07);border:1px solid rgba(21,128,61,.22);display:grid;gap:6px;font-size:.86rem;line-height:1.4}
.cart [hidden]{display:none!important}.cart .trust p{margin:0}.cart .trust a{color:inherit;font-weight:700}
.cart select{width:100%;box-sizing:border-box;border:1px solid var(--cart-line,#D1D5DB);border-radius:10px;padding:12px;font:inherit;font-size:16px;background:var(--cart-soft,#fff);color:inherit}
.cart .code{margin:12px 0 4px}.cart .cr{display:flex;gap:8px}.cart .cr input{text-transform:uppercase}.cart .cr button{border:2px solid var(--cart-acc,#0BA4DB);background:transparent;color:inherit;border-radius:10px;padding:0 16px;font:inherit;font-weight:800;cursor:pointer}
.cart .brk{margin-top:10px;font-size:.95rem}.cart .brk p{display:flex;justify-content:space-between;margin:3px 0}.cart .brk .dc{color:#15803D;font-weight:700}.cart .free{color:#15803D;font-weight:700;opacity:1}
.cart .pin{background:transparent;color:inherit;border:2px dashed var(--cart-acc,#0BA4DB)!important;padding:12px!important;font-size:15px!important}.cart .line .v{font-size:.85rem;opacity:.75}
.card .buy{margin-top:auto}.btn.add.added{background:#22C55E!important;color:#062E14!important}
.buy .step{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}.buy .step[hidden],.buy .btn.add[hidden]{display:none!important}
.buy .step button{width:42px;height:42px;border-radius:10px;border:0;background:#22C55E;color:#062E14;font:800 20px/1 system-ui,Arial,sans-serif;cursor:pointer}
.buy .step b{min-width:28px;text-align:center;font-size:1.15rem}.buy .step small{opacity:.75;font-weight:600}`;

function cartScript(site, mode) {
  const cfg = { s: site.shopToken, api: mode === "preview" ? "" : SITE_URL, wa: site.whatsapp, name: site.name, preview: mode === "preview", key: "basket-" + (site.shopToken || slugify(site.name)) };
  return `<button class="cart-btn" type="button" hidden aria-label="Open cart">🛒 Cart <b>0</b></button>
<div class="cart" hidden role="dialog" aria-modal="true" aria-label="Your cart"><div class="panel">
<h2><span>Your cart<small class="cnt"></small></span><button class="x" type="button" aria-label="Close">×</button></h2><div class="lines"></div>
<div class="sumbox"><div class="code" hidden><label for="cb-code">Discount code</label><span class="cr"><input id="cb-code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button type="button" class="apply">Apply</button></span><p class="note cmsg" role="status"></p></div>
<div class="brk"></div><p class="tot"><span>Total</span><span class="sum"></span></p><p class="note dl"></p><p class="note free" hidden></p>
<div class="who"><h3>Your details</h3><p class="note signin" hidden>Have an account? <a href="#account">Sign in</a> to use your saved address.</p>
<label for="cb-name">Your name</label><input id="cb-name" autocomplete="name">
<label for="cb-phone">Phone number</label><input id="cb-phone" type="tel" autocomplete="tel">
<label for="cb-email" class="em-l">Email (needed to pay online)</label><input id="cb-email" type="email" autocomplete="email">
<label for="cb-addr">Delivery address</label><select id="cb-saved" hidden aria-label="Your saved addresses"></select><textarea id="cb-addr" rows="2" autocomplete="street-address"></textarea><label for="cb-zone" class="zl" hidden>Delivery area</label><select id="cb-zone" hidden></select><p class="note dnote" hidden></p></div>
${(() => { const cut = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "\u2026" : t; };
  const help = waLink(site, `Hello ${site.name}, I need help with my order.`);
  return `<div class="trust"><p class="tr-pay" hidden>\ud83d\udd12 <b>Safe checkout</b> \u00b7 online payments go through <span class="tr-by">Paystack</span>. Your card details are never seen by the store.</p>${site.delivery ? `<p>\ud83d\ude9a <b>Delivery</b> \u00b7 ${esc(cut(site.delivery, 110))}</p>` : ""}${site.returns ? `<p>\u21a9\ufe0f <b>Returns</b> \u00b7 ${esc(cut(site.returns, 110))}</p>` : ""}${help ? `<p>\ud83d\udcac <b>Need help?</b> <a href="${help}" target="_blank" rel="noopener">Chat with ${esc(site.name)} on WhatsApp</a></p>` : ""}</div>`; })()}<div class="acts"><button class="pay" type="button" hidden data-m="paystack">Pay online now</button><button class="pay pay2" type="button" hidden data-m="flutterwave">Pay online now</button><button class="pay ptr" type="button" hidden data-m="transfer">Pay by bank transfer</button><button class="pay pod" type="button" hidden data-m="delivery">Pay on delivery</button><button class="pay pin" type="button" hidden data-m="instalment">Pay small-small</button><button class="waorder" type="button">Order on WhatsApp</button></div>
<p class="note msg" role="status"></p></div></div></div>
<script>(function(){var C=${JSON.stringify(cfg).replace(/</g, "\\u003c")};window.__shopC=C;var M={};
var B=[];try{B=JSON.parse(localStorage.getItem(C.key)||'[]')}catch(e){}
var $=function(q){return document.querySelector(q)},btn=$('.cart-btn'),box=$('.cart'),msg=$('.cart .msg'),pays=document.querySelectorAll('.cart .pay'),online=false,fee=null,Z=[],FO=0,CODES=false,code='',Q=null,qt=0,sy=0;
function money(n){return '\u20a6'+Number(n).toLocaleString('en-NG')}
function save(){try{localStorage.setItem(C.key,JSON.stringify(B))}catch(e){}
// Signed in: the cart is kept on the store's side too (the owner can follow up on carts left unfinished).
var A=window.SAcct;if(A&&A.t&&A.t()&&C.s&&!C.preview){clearTimeout(sy);sy=setTimeout(function(){fetch(C.api+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s:C.s,t:A.t(),action:'cart',items:B.map(function(l){return{i:l.i,q:l.q,v:l.v||'',n:l.n,p:l.p}})})}).catch(function(){})},1500)}
quote()}
function same(x,i,v){return x.i===+i&&(x.v||'')===(v||'')}
// The exact total (discount code, delivery area, free delivery) comes from the store's side.
function quote(){Q=null;if(!C.s||!B.length||!(Z.length||CODES||FO))return;clearTimeout(qt);qt=setTimeout(function(){var zv=$('#cb-zone').value;
fetch(C.api+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({s:C.s,action:'quote',items:B.map(function(l){return{i:l.i,q:l.q,v:l.v||''}}),zone:zv===''?undefined:+zv,code:code})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})}).then(function(j){Q=j;$('.cart .cmsg').textContent=j.code?j.code+': '+j.codeLabel+' applied \u2713':'';draw()})
.catch(function(err){if(code){$('.cart .cmsg').innerHTML='<span class="err">'+String(err.message).replace(/[&<>]/g,'')+'</span>';code='';quote()}})},250)}
function count(){return B.reduce(function(s,l){return s+l.q},0)}
function sub(){return B.reduce(function(s,l){return s+l.q*l.p},0)}
function draw(){var n=count();btn.hidden=!n;btn.querySelector('b').textContent=n;
var e=function(t){return String(t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
$('.cart .lines').innerHTML=B.length?B.map(function(l,k){var im=l.u||(document.querySelector('.btn.add[data-i="'+l.i+'"]')||{getAttribute:function(){return''}}).getAttribute('data-img');return '<div class="line">'+(im?'<img src="'+e(im)+'" alt="">':'<span class="ph"></span>')+'<span><span class="n">'+e(l.n)+'</span>'+(l.v?' <span class="v">('+e(l.v)+')</span>':'')+'<br><span class="each">'+money(l.p)+' each</span></span><span class="amt">'+money(l.p*l.q)+'</span><span class="qty"><button type="button" data-k="'+k+'" data-d="-1" aria-label="One less">\u2212</button><b>'+l.q+'</b><button type="button" data-k="'+k+'" data-d="1" aria-label="One more">+</button></span><button class="rm" type="button" data-k="'+k+'">Remove</button></div>'}).join(''):'<p class="empty">Your cart is empty.</p>';
$('.cart .sumbox').hidden=!B.length;$('.cart .cnt').textContent=n?' ('+n+' item'+(n===1?'':'s')+')':'';
document.querySelectorAll('.buy[data-i]').forEach(function(p){var i=+p.getAttribute('data-i'),l=B.filter(function(x){return same(x,i,'')})[0],st=p.querySelector('.step');if(!st)return;p.querySelector('.btn.add').hidden=!!l;st.hidden=!l;if(l)st.querySelector('b').textContent=l.q;});
var any=M.paystack||M.flutterwave||M.transfer||M.delivery;
var zv=$('#cb-zone').value,brk='';
if(Q&&B.length){brk='<p><span>Items</span><span>'+money(Q.subtotal)+'</span></p>'+(Q.discount?'<p class="dc"><span>Discount ('+e(Q.code)+')</span><span>\u2212'+money(Q.discount)+'</span></p>':'')+(Q.delivery!==null&&Q.delivery!==undefined?'<p><span>Delivery'+(Q.zone?' ('+e(Q.zone)+')':'')+'</span><span>'+(Q.delivery?money(Q.delivery):'Free')+'</span></p>':'');
$('.cart .sum').textContent=money(Q.total);$('.cart .dl').textContent=Z.length&&zv===''?'Choose your delivery area to see the delivery fee.':'';}
else{$('.cart .sum').textContent=money(sub()+(any&&fee&&!Z.length?fee:0));$('.cart .dl').textContent=Z.length?'Choose your delivery area to see the delivery fee.':fee&&any?'Includes delivery: '+money(fee):'Delivery cost, if any, is confirmed by the store.';}
$('.cart .brk').innerHTML=brk;var fr=$('.cart .free'),gs=Q?Q.subtotal-Q.discount:sub();fr.hidden=!FO||!B.length;if(FO)fr.textContent=gs>=FO?'\u2713 You get free delivery':'Add '+money(FO-gs)+' more for free delivery';
Array.prototype.forEach.call(pays,function(b){b.hidden=!M[b.getAttribute('data-m')];b.disabled=!B.length});$('.cart .acts').classList.toggle('two',!!(M.transfer&&M.delivery));var pin=$('.cart .pin');if(pin&&M.instalment&&window.__shopCfg){var tot=Q?Q.total:sub();pin.textContent='Pay small-small (first '+money(Math.ceil(tot*(window.__shopCfg.firstPct||30)/10000)*100)+')'}
if(M.paystack&&M.flutterwave){$('.cart .pay2').textContent='Pay online (Flutterwave)'}
$('.cart .em-l').textContent=(M.paystack||M.flutterwave)?'Email (needed to pay online)':'Email (optional)';
$('.cart .waorder').hidden=!C.wa;$('.cart .waorder').disabled=!B.length;}
function mx(i,v){var vs=window.__shopCfg&&window.__shopCfg.vstock&&window.__shopCfg.vstock[i];if(v&&vs&&vs[v]!==undefined)return +vs[v];var a=document.querySelector('.btn.add[data-i="'+i+'"],.btn.add-opt[data-i="'+i+'"]'),m=a&&a.getAttribute('data-max');return m===null||m===undefined||m===''?99:+m}
function cap(l,d){var m=mx(l.i,l.v),q=l.q+d;if(q>m){q=m;msg.textContent='Only '+m+' '+l.n+(l.v?' ('+l.v+')':'')+' left.';}l.q=Math.min(99,q);}
document.addEventListener('click',function(e){var s=e.target.closest('.buy .step button');if(s){var bi=+s.closest('.buy').getAttribute('data-i'),bl=B.filter(function(x){return same(x,bi,'')})[0];if(bl){cap(bl,+s.getAttribute('data-d'));if(bl.q<1)B.splice(B.indexOf(bl),1);save();draw();}return}
var a=e.target.closest('.btn.add');if(!a||a.closest('.ppop .opts'))return;var i=+a.getAttribute('data-i'),l=B.filter(function(x){return same(x,i,'')})[0];
if(l)cap(l,1);else if(mx(i)>0)B.push({i:i,n:a.getAttribute('data-name'),p:+a.getAttribute('data-price'),q:1,u:a.getAttribute('data-img')||''});save();draw();});
// "Order again" from a buyer's account: put the same items back in the cart (if they're still on sale).
// (also from Saved items / Recently viewed on a page that doesn't show that product: it brings its own name, price and photo)
// (d.v: the size/colour chosen, from the product pop-up or "Order again")
window.__addToCart=function(i,q,d,stay){var v=d&&d.v||'',a=document.querySelector('.btn.add[data-i="'+i+'"],.btn.add-opt[data-i="'+i+'"]');if(a?mx(i,v)<=0:!(d&&d.n&&d.p>0))return;var l=B.filter(function(x){return same(x,i,v)})[0];
if(!l){l=a?{i:+i,n:a.getAttribute('data-name'),p:+a.getAttribute('data-price'),q:0,u:a.getAttribute('data-img')||''}:{i:+i,n:String(d.n).replace(/\s*\([^)]*\)\s*$/,''),p:+d.p,q:0,u:d.u||''};if(v)l.v=v;B.push(l)}cap(l,+q||1);save();draw();if(!stay)btn.click()};
window.__cartLines=function(){return B};
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
if(L.length&&!$('#cb-addr').value)$('#cb-addr').value=L[0].text;sv.onchange=function(){$('#cb-addr').value=sv.value===''?'':L[+sv.value].text}}
else{var G=window.SAcct&&window.SAcct.prof?window.SAcct.prof():{},GL=G.addresses||[];if(G.name&&!$('#cb-name').value)$('#cb-name').value=G.name;if(G.phone&&!$('#cb-phone').value)$('#cb-phone').value=G.phone;if(G.email&&!$('#cb-email').value)$('#cb-email').value=G.email;
sv.hidden=!GL.length;sv.innerHTML=GL.map(function(x,k){return '<option value="'+k+'">'+String(x.label).replace(/[<&]/g,'')+': '+String(x.text).replace(/[<&]/g,'')+'</option>'}).join('')+'<option value="">A new address</option>';if(GL.length&&!$('#cb-addr').value)$('#cb-addr').value=GL[0].text;sv.onchange=function(){$('#cb-addr').value=sv.value===''?'':GL[+sv.value].text}}}
window.__cartPrefill=function(){if(!box.hidden){document.body.style.overflow='hidden';prefill()}};
function buyer(){return{name:$('#cb-name').value.trim(),phone:$('#cb-phone').value.trim(),email:$('#cb-email').value.trim(),address:$('#cb-addr').value.trim()}}
$('.cart .waorder').addEventListener('click',function(){var b=buyer(),t='Hello '+C.name+', I would like to order:\\n'+B.map(function(l){return '- '+l.n+' x'+l.q+' ('+money(l.p*l.q)+')'}).join('\\n')+'\\nItems total: '+money(sub())+(b.name?'\\nName: '+b.name:'')+(b.phone?'\\nPhone: '+b.phone:'')+(b.address?'\\nDeliver to: '+b.address:'');
window.open('https://wa.me/'+C.wa+'?text='+encodeURIComponent(t),'_blank');});
Array.prototype.forEach.call(pays,function(pay){pay.addEventListener('click',function(){var b=buyer(),m=pay.getAttribute('data-m'),onl=m==='paystack'||m==='flutterwave';if(C.preview){msg.textContent='This is a preview, so payment is switched off here.';return}
if(!b.name||!b.phone||(onl&&!/@/.test(b.email))){msg.innerHTML='<span class="err">Please enter your name, phone number'+(onl?' and email':'')+'.</span>';return}
if((m==='delivery'||Z.length)&&!b.address){msg.innerHTML='<span class="err">Please enter your delivery address.</span>';return}
pay.disabled=true;msg.textContent=onl?'Opening secure payment\u2026':'Placing your order\u2026';
var zv=$('#cb-zone').value;if(Z.length&&zv===''){pay.disabled=false;msg.innerHTML='<span class="err">Please choose your delivery area.</span>';$('#cb-zone').focus();return}
var A=window.SAcct,body={s:C.s,method:m,t:A?A.t():'',items:B.map(function(l){return{i:l.i,q:l.q,v:l.v||''}}),buyer:b,code:code};if(Z.length)body.zone=+zv;else body.zone='';
fetch(C.api+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})
.then(function(j){if(A&&A.b()&&b.address)A.saveAddress(b.address);
// Kept on this phone for the Profile: the order (to follow it in My orders / Inbox), the details and the address.
if(A&&A.prof){A.addOrder({ref:j.ref,url:j.url,at:Date.now()});var G=A.prof();G.name=b.name||G.name;G.phone=b.phone||G.phone;G.email=b.email||G.email;var GL=G.addresses||[];if(b.address&&!GL.some(function(x){return String(x.text).toLowerCase()===b.address.toLowerCase()})&&GL.length<20)GL.push({label:'Address '+(GL.length+1),text:b.address});G.addresses=GL;A.setProf(G)}
B=[];save();location.href=j.url}).catch(function(err){pay.disabled=false;msg.innerHTML='<span class="err">'+String(err.message).replace(/[&<>]/g,'')+'</span>'});});});
if(C.s)fetch(C.api+'/api/shop?config=1&s='+encodeURIComponent(C.s)).then(function(r){return r.json()}).then(function(j){M=j.methods||{paystack:!!j.online};online=!!(M.paystack||M.flutterwave);fee=j.deliveryFee;trust();
var dn=$('.cart .dnote');if(j.deliveryNote&&M.delivery){dn.hidden=false;dn.textContent='Pay on delivery: '+j.deliveryNote}
// Delivery areas (fee per area), free delivery above an amount, and the discount code box.
Z=j.zones||[];FO=+j.freeOver||0;CODES=!!j.codes;var zs=$('#cb-zone');if(Z.length){zs.hidden=false;$('.cart .zl').hidden=false;zs.innerHTML='<option value="">Choose your area\u2026</option>'+Z.map(function(z,k){return '<option value="'+k+'">'+String(z.name).replace(/[<&]/g,'')+' \u2014 '+(z.fee?money(z.fee):'free')+'</option>'}).join('');
try{var zk=localStorage.getItem(C.key+'-zone');if(zk!==null&&Z[+zk])zs.value=zk}catch(x){}}zs.onchange=function(){try{localStorage.setItem(C.key+'-zone',zs.value)}catch(x){}quote();draw()};
$('.cart .code').hidden=!CODES;$('.cart .apply').onclick=function(){code=$('#cb-code').value.trim().toUpperCase();$('.cart .cmsg').textContent=code?'Checking\u2026':'';quote()};
window.__shopCfg=j;try{window.dispatchEvent(new CustomEvent('shopcfg',{detail:j}))}catch(x){}
if(j.hideStock)document.querySelectorAll('.card .stock').forEach(function(x){x.remove()});
var st=j.stock||{};Object.keys(st).forEach(function(i){var n=+st[i];document.querySelectorAll('.btn.add[data-i="'+i+'"]').forEach(function(a){a.setAttribute('data-max',n);var bp=a.closest('.buy'),sl=bp.previousElementSibling;
if(n<=0){bp.innerHTML='<span class="soldout">Sold out</span>';bp.removeAttribute('data-i');var c=bp.closest('.card');if(c)c.classList.add('is-soldout');if(sl&&sl.classList.contains('stock'))sl.remove();}
else if(!j.hideStock){if(!sl||!sl.classList.contains('stock')){sl=document.createElement('p');bp.parentNode.insertBefore(sl,bp)}sl.className='stock'+(n<=5?' low':'');sl.textContent=n<=5?'Only '+n+' left':n+' in stock';}});
B.forEach(function(l){if(+l.i===+i&&!l.v&&l.q>n)l.q=n});});var vs=j.vstock||{};B.forEach(function(l){if(l.v&&vs[l.i]&&vs[l.i][l.v]!==undefined&&l.q>vs[l.i][l.v])l.q=+vs[l.i][l.v]});B=B.filter(function(l){return l.q>0});save();draw()}).catch(function(){});
if(C.preview&&!C.s){online=true;M={paystack:true}}
function trust(){var tp=$('.cart .tr-pay');if(!tp)return;tp.hidden=!online;var by=tp.querySelector('.tr-by');if(by)by.textContent=M.paystack&&M.flutterwave?'Paystack and Flutterwave':M.flutterwave?'Flutterwave':'Paystack'}
trust();draw();})();</script>`;
}
// The buyer's order / receipt page, on the store's OWN website (…/order?ref=…): it asks our API for the order and
// shows it in the store's design (payment details, tracking, the receipt to save). Old links on our address still work.
function orderBody() {
  const api = JSON.stringify(SITE_URL).replace(/</g, "\\u003c");
  return `<section class="block"><div class="wrap"><div class="card ordpg" id="ordpg"><p>Loading your order\u2026</p></div></div></section>
<style>.ordpg{max-width:560px;margin:0 auto}.ordpg table{width:100%;border-collapse:collapse;margin:10px 0}.ordpg td{padding:7px 0;border-bottom:1px solid rgba(127,127,127,.2);vertical-align:top}.ordpg .r{text-align:right}
.ordpg .m{opacity:.8;font-size:.92rem}.ordpg .ok{background:rgba(22,163,74,.12);border-left:4px solid #16A34A;padding:10px 12px;border-radius:8px}.ordpg .cp{font:inherit;font-size:.8rem;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;border-radius:8px;padding:2px 8px;cursor:pointer;margin-left:6px}
.ordpg label{display:block;font-weight:600;margin:10px 0 4px}.ordpg input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px;border:1px solid rgba(127,127,127,.5);border-radius:10px;background:transparent;color:inherit}
.ordpg .trk{list-style:none;margin:14px 0;padding:0}.ordpg .trk li{position:relative;padding:0 0 18px 34px;opacity:.6}.ordpg .trk li:before{content:"";position:absolute;left:8px;top:4px;width:14px;height:14px;border-radius:50%;border:2px solid currentColor;opacity:.5}
.ordpg .trk li:after{content:"";position:absolute;left:15px;top:22px;bottom:2px;width:2px;background:currentColor;opacity:.2}.ordpg .trk li:last-child:after{display:none}.ordpg .trk li.d{opacity:1;font-weight:700}.ordpg .trk li.d:before{background:#16A34A;border-color:#16A34A;opacity:1}.ordpg .trk small{display:block;font-weight:400;opacity:.75}
.ordpg .acts,.ordpg .save{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.ordpg .acts>*,.ordpg .save button{flex:1 1 140px;text-align:center}.ordpg .save button{font:inherit;font-weight:700;border-radius:12px;padding:13px;cursor:pointer;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit}
.ordpg .save button[data-save=png]{background:var(--cart-acc,#0BA4DB);color:#fff;border:0}.ordpg .doc{margin:14px 0;overflow-x:auto}@media print{header,footer,.qbar,.tabbar,.wa,.ordpg .save,.ordpg .acts,.ordpg .noprint{display:none!important}}</style>
<script>(function(){var A=${api},q=new URLSearchParams(location.search),ref=q.get('ref')||'',box=document.getElementById('ordpg');
function E(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}function N(n){return '\\u20a6'+Number(n||0).toLocaleString('en-NG')}
if(!/^SHOP\\d+-[a-f0-9]+$/.test(ref)){box.innerHTML='<h1>Order not found</h1><p>Please check the link the store sent you.</p>';return}
function items(j){var o=j.order;return '<table>'+o.items.map(function(l){return '<tr><td>'+E(l.name)+' \\u00d7 '+l.qty+'</td><td class="r">'+N(l.total)+'</td></tr>'}).join('')+(o.discount?'<tr><td>Discount'+(o.code?' ('+E(o.code)+')':'')+'</td><td class="r">\\u2212'+N(o.discount)+'</td></tr>':'')+(o.delivery?'<tr><td>Delivery'+(o.zone?' ('+E(o.zone)+')':'')+'</td><td class="r">'+N(o.delivery)+'</td></tr>':'')+'<tr><td><b>'+(o.status==='paid'?'Paid':'Total')+'</b></td><td class="r"><b>'+N(o.total)+'</b></td></tr></table>'}
function track(j){if(!j.track.length)return '';var u=location.origin+location.pathname+'?ref='+encodeURIComponent(ref);return '<h2>Track your order</h2><ol class="trk">'+j.track.map(function(s){return '<li class="'+(s.done?'d':'')+'">'+E(s.label)+(s.when?'<small>'+E(s.when)+'</small>':'')+'</li>'}).join('')+'</ol><div class="acts noprint"><button class="btn" type="button" onclick="location.reload()">Refresh</button><a class="btn" href="https://wa.me/?text='+encodeURIComponent('Track my order '+ref+': '+u)+'" target="_blank" rel="noopener">Share on WhatsApp</a></div>'}
function bank(j,amt){var t=j.transfer;return '<table><tr><td>Bank</td><td class="r"><b>'+E(t.bank)+'</b></td></tr><tr><td>Account name</td><td class="r"><b>'+E(t.name)+'</b></td></tr><tr><td>Account number</td><td class="r"><b style="font-size:1.2rem;letter-spacing:1px">'+E(t.number)+'</b> <button type="button" class="cp" data-c="'+E(t.number)+'">Copy</button></td></tr>'+(amt?'<tr><td>Amount</td><td class="r"><b>'+N(amt)+'</b></td></tr>':'')+'<tr><td>Narration / description</td><td class="r"><b>'+E(ref)+'</b> <button type="button" class="cp" data-c="'+E(ref)+'">Copy</button></td></tr></table>'+(t.note?'<p class="m">'+E(t.note)+'</p>':'')}
function saveBtns(j){return '<div class="save noprint"><button type="button" data-save="png">Save as picture</button><button type="button" data-save="pdf">Save as PDF</button><button type="button" data-save="share">Share</button><button type="button" data-save="link">Copy receipt link</button></div><p class="m save-msg" role="status"></p>'}
function draw(j){var o=j.order,st=j.store,h='';document.title=(o.status==='paid'?'Receipt ':'Order ')+ref+' \\u00b7 '+st.name;
if(o.status==='paid'&&q.get('receipt')){h='<div class="acts noprint"><button class="btn" type="button" onclick="print()">Print</button><a class="btn" href="'+E(st.home||'/')+'">Back to the shop</a></div>'+saveBtns(j)+'<div class="doc">'+j.receipt.html+'</div>'}
else if(o.status==='paid'){h='<h1>Thank you, '+E(o.first)+'!</h1><p>Your payment went through and <b>'+E(st.name)+'</b> has your order.</p>'+items(j)+track(j)+'<p><b>Save your receipt</b> to your phone:</p>'+saveBtns(j)+'<p class="m">Need it again later? Keep this link: <a href="'+E(j.receipt.link)+'">'+E(j.receipt.link.replace(/^https?:\\/\\//,''))+'</a></p>'}
else if(o.status==='cod'){h='<h1>Thank you, '+E(o.first)+'!</h1><p>Your order is placed with <b>'+E(st.name)+'</b>. You\\u2019ll <b>pay on delivery</b>: the store will contact you on '+E(o.phone||'your phone')+' to arrange it.</p>'+(j.deliveryNote?'<p class="m">'+E(j.deliveryNote)+'</p>':'')+items(j)+track(j)+'<p class="m">Order '+E(ref)+'. Save this page to come back to it.</p>'}
else if(o.status==='awaiting'){h='<h1>Almost done, '+E(o.first)+'!</h1><p>Your order is saved. Please pay <b>'+N(o.total)+'</b> by bank transfer to:</p>'+bank(j,o.total)+'<p class="m">Only pay into the account above, in the store\\u2019s name. '+E(st.name)+' sends your items once they see the money.</p><h2>Your order</h2>'+items(j)+track(j)+
'<div id="claim">'+(o.claimed?'<p class="ok">Thanks! You told '+E(st.name)+' you\\u2019ve paid. '+E(st.name)+' will confirm once they see it in their bank app. Keep this page: it updates when they confirm.</p>':'<h2>Paid? Tell the store</h2><label for="cf">Name on the account you paid from</label><input id="cf" maxlength="100" autocomplete="name"><label for="cn">Anything else (optional)</label><input id="cn" maxlength="200" placeholder="e.g. paid at 2:15pm"><p><button type="button" class="btn" id="cb">I\\u2019ve paid</button></p><p class="m" id="cm" role="status"></p>')+'</div>'}
else if(o.status==='part'){var left=o.total-o.paid;h='<h1>Pay small-small</h1><p>Your items are kept for you at <b>'+E(st.name)+'</b>. Pay by bank transfer, in parts, any time; they\\u2019re sent when the full amount is paid.</p>'+bank(j,0)+'<table><tr><td>Total</td><td class="r"><b>'+N(o.total)+'</b></td></tr><tr><td>Paid so far</td><td class="r"><b>'+N(o.paid)+'</b></td></tr><tr><td>Left to pay</td><td class="r"><b style="font-size:1.15rem">'+N(left)+'</b></td></tr></table>'+
(!o.paid&&j.firstPayment?'<p class="ok">First payment: at least <b>'+N(j.firstPayment.amount)+'</b> ('+j.firstPayment.pct+'%).</p>':'')+(o.payments.length?'<p class="m">Payments received: '+o.payments.map(N).join(', ')+'.</p>':'')+'<h2>Your order</h2>'+items(j)+track(j)}
else if(o.status==='cancelled'){h='<h1>Order cancelled</h1><p>'+E(st.name)+' cancelled order '+E(ref)+'. If you think this is a mistake, please contact the store.</p>'+items(j)}
else h='<h1>Payment not completed</h1><p>We couldn\\u2019t confirm a payment for this order yet. If money left your account, it will be confirmed shortly: please contact the store with your payment reference. You can also go back to the shop and try again.</p>';
box.innerHTML=h+(q.get('receipt')&&o.status==='paid'?'':'<p class="noprint"><a class="btn" href="'+E(st.home||'/')+'">Back to the shop</a></p>');
if(j.receipt&&box.querySelector('.save')){var d=document.createElement('script');d.type='application/json';d.id='rcpt';d.textContent=JSON.stringify(j.receipt.data);document.body.appendChild(d);var sc=document.createElement('script');sc.src=A+'/assets/receipt.js';sc.defer=true;document.body.appendChild(sc)}
var cb=document.getElementById('cb');if(cb)cb.addEventListener('click',function(){cb.disabled=true;fetch(A+'/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'claim',ref:ref,from:document.getElementById('cf').value,note:document.getElementById('cn').value})}).then(function(r){return r.json().then(function(k){if(!r.ok)throw new Error(k.error||'Error');return k})}).then(function(){load()}).catch(function(err){cb.disabled=false;document.getElementById('cm').textContent=err.message})})}
box.addEventListener('click',function(e){var b=e.target.closest('.cp');if(b&&navigator.clipboard){navigator.clipboard.writeText(b.getAttribute('data-c'));b.textContent='Copied'}});
function load(){fetch(A+'/api/shop?json=1&ref='+encodeURIComponent(ref)).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Order not found');return j})}).then(draw).catch(function(){box.innerHTML='<h1>Order not found</h1><p>Please check the link the store sent you, or contact the store.</p>'})}load();})();</script>`;
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
// The moving banner at the top of a store's home page: the products the owner ticked "Show at the top" in My store,
// or (if none are ticked) the newest products. It slides by itself every few seconds, can be swiped, stops while
// touched, and tapping a slide opens that product. Sold-out products are left out.
export function topProducts(site) {
  const ok = site.products.filter((p) => !p.soldout && String(p.stock ?? "").trim() !== "0");
  const picked = ok.filter((p) => p.top);
  return { list: (picked.length ? picked : ok.slice(-6).reverse()).slice(0, 12), picked: picked.length > 0 };
}
const CAROUSEL_CSS = `.topcar{padding:18px 0 6px}.topcar h2{margin:0 0 10px;font-size:1.15rem}.topcar .trk{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:4px}.topcar .trk::-webkit-scrollbar{display:none}
.topcar .sl{flex:0 0 86%;scroll-snap-align:center;display:grid;grid-template-columns:44% 1fr;gap:14px;align-items:center;border-radius:18px;padding:14px;background:var(--cart-soft,rgba(0,0,0,.04));border:1px solid rgba(0,0,0,.06);cursor:pointer;color:inherit;text-align:left;font:inherit;min-height:150px}
@media(min-width:760px){.topcar .sl{flex-basis:calc(50% - 6px)}}@media(min-width:1100px){.topcar .sl{flex-basis:calc(33.33% - 8px)}}
.topcar .sl img,.topcar .sl .ph{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;background:rgba(0,0,0,.06)}.topcar .sl .ph{display:flex;align-items:center;justify-content:center;font-size:2.2rem;font-weight:800;opacity:.5}
.topcar .sl b{display:block;font-size:1.05rem;line-height:1.25}.topcar .sl .p{display:block;font-weight:800;font-size:1.2rem;margin:6px 0 10px}.topcar .sl .go{display:inline-block;border-radius:999px;padding:8px 16px;font-weight:700;font-size:.9rem}
.topcar .tag{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:3px 9px;margin-bottom:8px;background:#E11D48;color:#fff}
.topcar .dots{display:flex;justify-content:center;gap:6px;margin-top:10px}.topcar .dots i{width:7px;height:7px;border-radius:999px;background:currentColor;opacity:.25;transition:all .3s}.topcar .dots i.on{width:22px;opacity:.8}`;
const CAROUSEL_JS = `<script>(function(){var c=document.querySelector('.topcar');if(!c)return;var t=c.querySelector('.trk'),S=t.querySelectorAll('.sl'),D=c.querySelectorAll('.dots i'),k=0,hold=false,still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function at(){var x=t.scrollLeft,b=0,d=1e9;S.forEach(function(s,i){var v=Math.abs(s.offsetLeft-t.offsetLeft-x);if(v<d){d=v;b=i}});return b}
function dots(){k=at();D.forEach(function(d,i){d.classList.toggle('on',i===k)})}
function go(i){var s=S[i];if(s)t.scrollTo({left:s.offsetLeft-t.offsetLeft,behavior:'smooth'})}
t.addEventListener('scroll',function(){clearTimeout(t.__d);t.__d=setTimeout(dots,80)});
['pointerdown','touchstart','mouseenter','focusin'].forEach(function(e){t.addEventListener(e,function(){hold=true},{passive:true})});
['mouseleave','touchend','focusout'].forEach(function(e){t.addEventListener(e,function(){setTimeout(function(){hold=false},2500)},{passive:true})});
if(!still&&S.length>1)setInterval(function(){if(hold||document.hidden)return;var end=t.scrollLeft+t.clientWidth>=t.scrollWidth-4;go(end?0:k+1)},3500);
t.addEventListener('click',function(e){var s=e.target.closest('.sl');if(!s)return;var card=document.querySelector('.card.prod[data-pi="'+s.getAttribute('data-pi')+'"] .pv-open');if(card){card.scrollIntoView({block:'center'});card.click()}});dots();})();</script>`;
function topCarousel(site, img) {
  if (site.products.length < 2) return "";
  const { list, picked } = topProducts(site);
  if (list.length < 1) return "";
  const slides = list.map((p) => {
    const photo = productPhotoFor(site, p);
    return `<button class="sl" type="button" data-pi="${p.i}" aria-label="${esc(p.name)}">${photo ? `<img src="${img(photo.url)}" alt="" loading="lazy" decoding="async">` : `<span class="ph">${esc(p.name.slice(0, 1).toUpperCase())}</span>`}<span><span class="tag">${picked ? "Top pick" : "New"}</span><b>${esc(p.name)}</b>${p.price ? `<span class="p">${esc(naira(p.price))}</span>` : ""}<span class="go btn">Shop now</span></span></button>`;
  }).join("");
  return `<style>${CAROUSEL_CSS}</style><section class="topcar"><div class="wrap"><h2>${picked ? "Top picks" : "New in store"}</h2><div class="trk">${slides}</div>${list.length > 1 ? `<div class="dots" aria-hidden="true">${list.map(() => "<i></i>").join("")}</div>` : ""}</div></section>${CAROUSEL_JS}`;
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
    out.push(`<section class="hero"><div class="wrap"><div><h1>${inline(headline, mode)}</h1>${sub ? `<p>${inline(sub, mode)}</p>` : ""}<a class="btn" href="${href}">${inline(btn, mode)}</a>${openBadge(site)}</div>${site.photos[0] ? `<img src="${img(site.photos[0].url)}" alt="${esc(site.name)}" fetchpriority="high" decoding="async">` : site.productPhotos.length >= 4 ? `<div class="hero-grid">${site.productPhotos.slice(0, 4).map((p, k) => `<img src="${img(p.url)}" alt=""${k ? ' loading="lazy"' : ' fetchpriority="high"'} decoding="async">`).join("")}</div>` : ""}</div></section>`);
    const trust = trustPoints(site);
    if (trust.length) out.push(`<div class="trust"><div class="wrap">${trust.map((t) => `<span>\u2713 ${esc(t)}</span>`).join("")}</div></div>`);
    const car = topCarousel(site, img);
    if (car) out.push(car);
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
${socials ? `<span>${socials}</span>` : ""}${kitButtons()}<span>© ${new Date().getFullYear()} ${esc(site.name)}</span>
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
export function renderPage(site, slug, { mode = "export", link, img = (u) => u, row, token, choice, switcher = "", notFound = false, top = null, panel = null, orderPage = false } = {}) {
  const page = orderPage ? ORDER_PAGE : notFound ? NOT_FOUND_PAGE : site.pages.find((p) => p.slug === slug) || site.pages[0];
  const title = page.title || (page.kind === "home" ? site.name : `${page.name} | ${site.name}`);
  const desc = page.meta || site.tagline || "";
  const preview = mode === "preview";
  return `<!doctype html>
<html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(preview ? "Preview: " + title : title)}</title>${desc ? `\n<meta name="description" content="${esc(desc)}">` : ""}
${seoHead(site, page, { title, desc, img, preview, notFound })}
${preview || notFound || orderPage ? '<meta name="robots" content="noindex, nofollow">' : ""}<meta name="theme-color" content="${site.theme.primary}">
${site.logo ? `<link rel="icon" href="${img(site.logo.url)}">` : ""}${mode === "export" && !notFound ? `<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="${site.logo ? img(site.logo.url) : "/app-icon.svg"}"><meta name="mobile-web-app-capable" content="yes">` : ""}
<style>${css(site.theme)}${preview ? PREVIEW_CSS : ""}</style>${site.designCss ? `\n${fontLinks(site.designCss)}<style id="design">${site.designCss}</style>` : ""}
<style id="guard">${GUARD_CSS}${KIT_CSS}${hasCart(site) ? CART_CSS + ACCOUNT_CSS : ""}</style></head>
<body class="page-${page.kind} kind-${site.kind}">${preview ? `<div class="pv-top">${top ?? `Preview of your new website. It is not live yet. <a href="#review">Approve or ask for changes</a>${switcher}`}</div>` : ""}
${site.notice ? `<div class="site-notice" role="status">${esc(site.notice)}</div>` : ""}${header(site, page, link, img)}
<main>${orderPage ? orderBody() : notFound ? notFoundBody(site, link) : pageBody(site, page, mode, link, img)}</main>
${preview ? panel ?? previewPanel(row, token, choice) : ""}
${footer(site, link)}
${site.products && site.products.length ? PRODUCT_POP : ""}${hasCart(site) ? cartScript(site, mode) + `<script>${ACCOUNT_JS}</script>` : actionBar(site, link, waLink(site))}${kitScript(site, { exportMode: mode === "export" && !notFound })}${mode === "export" && !notFound ? statsScript(site) : ""}
</body></html>`;
}

// ---------- Google and share previews ----------
const NOT_FOUND_PAGE = { slug: "404", kind: "notfound", name: "Page not found", title: "", meta: "", sections: [] };
const ORDER_PAGE = { slug: "order", kind: "order", name: "Your order", title: "", meta: "", sections: [] };
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
  if (hasCart(site)) pages.push({ name: "order.html", html: renderPage(site, "index", { mode: "export", link: rootLink, img: (u) => "/" + img(u), orderPage: true }) });
  const base = site.baseUrl;
  const today = new Date().toISOString().slice(0, 10);
  // Install as an app: the app's details, its icon and the small helper that keeps pages for a bad network.
  pages.push({ name: "manifest.webmanifest", html: manifest(site) }, { name: "sw.js", html: SW_JS }, { name: "app-icon.svg", html: appIconSvg(site) });
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
