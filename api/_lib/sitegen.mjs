// Builds a customer's website from their project form (brief), uploaded photos and the AI text (draft_md).
// Used for the preview link (/preview?t=...) and for "Download site" in admin (a .zip ready to upload to any host).
// No AI here: it only lays out what is already written, so the result is predictable.
import { kindFor } from "./brief-schema.mjs";

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
    if ((m = line.match(/^\*\*(SEO title|Meta description):?\*\*:?\s*(.*)/i))) {
      page[/seo/i.test(m[1]) ? "title" : "meta"] = m[2].trim(); continue;
    }
    if ((m = line.match(/^###\s+(.+)/))) { sec = { name: m[1].trim(), fields: {}, body: [] }; page.sections.push(sec); continue; }
    if (!line.trim()) { if (sec) sec.body.push(""); continue; }
    if (!sec) { sec = { name: "", fields: {}, body: [] }; page.sections.push(sec); }
    if ((m = line.match(/^\*\*([^*]{1,40}?):?\*\*:?\s*(.*)/))) {
      const key = m[1].trim().toLowerCase();
      if (FIELD_KEYS.includes(key)) { sec.fields[key] = m[2].trim(); continue; }
      if (key === "text") { sec.body.push(m[2].trim()); continue; }
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
const isImage = (f) => /^image\//.test(f?.type || "") || /\.(jpe?g|png|webp|gif|svg)$/i.test(f?.name || f?.url || "");

function inline(text, mode) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[ADD:\s*([^\]]*)\]/g, (_, what) => (mode === "preview" ? `<mark class="todo">To be added: ${what}</mark>` : `<mark class="todo">${what}</mark>`));
}
function blocks(lines, mode) {
  const out = [];
  let list = null;
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(m[1], mode)}</li>`);
      continue;
    }
    if (list) { out.push("</ul>"); list = null; }
    const h = line.match(/^#{3,4}\s+(.*)/);
    if (h) out.push(`<h3>${inline(h[1], mode)}</h3>`);
    else if (line.trim()) out.push(`<p>${inline(line.trim(), mode)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

// ---------- The site model ----------
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
  return {
    kind,
    name: b.business_name || row.business || row.name,
    tagline: b.tagline || "",
    phone: b.phone || row.contact || "",
    whatsapp: waNumber(b.whatsapp || b.phone || row.contact),
    email: b.email || "",
    address: b.address || "",
    hours: b.hours || "",
    socials,
    logo: (files.logo || []).find(isImage) || null,
    photos: (files.photos || []).filter(isImage),
    productPhotos: (files.product_photos || []).filter(isImage),
    services: (b.services || []).filter((s) => s.name),
    products: (b.products || []).filter((p) => p.name).map((p) => ({ ...p, text: (productText[p.name.toLowerCase()] || []).join(" ") })),
    testimonials: String(b.testimonials || "").split(/\n+/).map((s) => s.trim()).filter(Boolean),
    delivery: b.delivery_areas || "",
    returns: b.returns || "",
    blogPosts,
    theme: themeFor(b),
    pages: outPages,
  };
}

// ---------- Rendering ----------
function css(t) {
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
.card .price{font-weight:800;color:${t.primary};margin:0}
.card img{border-radius:calc(${t.radius} - 4px);margin:-6px -6px 12px;width:calc(100% + 12px);aspect-ratio:4/3;object-fit:cover}
.gallery{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:${t.radius}}
blockquote{margin:0;background:#fff;border-left:4px solid ${t.accent};padding:16px 18px;border-radius:${t.radius}}
.contact dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 16px;margin:0 0 1em}.contact dt{font-weight:700}.contact dd{margin:0}
.cta{background:${t.accent};color:${t.accentText};padding:40px 0;text-align:center}.cta h2{color:inherit}
.cta .btn{background:${t.primary};color:#fff}
footer{background:#111827;color:#D1D5DB;padding:32px 0 90px;font-size:.95rem}footer a{color:#fff}footer .wrap{display:grid;gap:12px}
.credit{font-size:.8rem;opacity:.7}
.wa{position:fixed;right:16px;bottom:16px;z-index:9;background:#25D366;color:#fff;font-weight:700;text-decoration:none;padding:13px 18px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
mark.todo{background:#FFF1B8;color:#5C4400;padding:1px 4px;border-radius:4px}
article.post{margin-bottom:28px}`;
}

const PREVIEW_CSS = `.pv-top{background:#FFF1B8;color:#3D2E00;font:600 14px/1.4 system-ui,Arial,sans-serif;padding:10px 16px;text-align:center}
.pv{background:#0F172A;color:#fff;padding:24px 0 96px;font-family:system-ui,Arial,sans-serif}.pv h2{color:#fff;font-size:1.3rem}
.pv textarea{width:100%;min-height:110px;border-radius:10px;border:0;padding:12px;font:inherit;margin:8px 0}
.pv .row{display:flex;gap:10px;flex-wrap:wrap}.pv .ok{background:#22C55E;color:#062E14}.pv .chg{background:#fff;color:#0F172A}
.pv .msg{margin-top:10px;font-weight:600}`;

function header(site, page, link, img) {
  const nav = site.pages.map((p) => `<a href="${link(p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ""}>${esc(p.name)}</a>`).join("");
  return `<header class="top"><div class="wrap"><a class="brand" href="${link("index")}">${site.logo ? `<img src="${img(site.logo.url)}" alt="${esc(site.name)} logo">` : ""}<span>${esc(site.name)}</span></a><nav aria-label="Main">${nav}</nav></div></header>`;
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
  return `<div class="cards">${site.services.map((s) => `<div class="card"><h3>${esc(s.name)}</h3>${s.details ? `<p>${esc(s.details)}</p>` : ""}${showPrice && s.price ? `<p class="price">${esc(s.price)}</p>` : ""}</div>`).join("")}</div>`;
}
function productCards(site, img) {
  return `<div class="cards">${site.products.map((p, i) => {
    const photo = site.productPhotos[i];
    const order = waLink(site, `Hello ${site.name}, I'd like to order: ${p.name}${p.price ? " (₦" + p.price.replace(/^₦/, "") + ")" : ""}`);
    return `<div class="card">${photo ? `<img src="${img(photo.url)}" alt="${esc(p.name)}" loading="lazy">` : ""}<h3>${esc(p.name)}</h3>${p.text || p.details ? `<p>${esc(p.text || p.details)}</p>` : ""}${p.price ? `<p class="price">₦${esc(p.price.replace(/^₦/, ""))}</p>` : ""}${order ? `<p><a class="btn" href="${order}">Order on WhatsApp</a></p>` : ""}</div>`;
  }).join("")}</div>`;
}
const gallery = (photos, img) => `<div class="gallery">${photos.map((p) => `<a href="${img(p.url)}"><img src="${img(p.url)}" alt="${esc(p.name || "Photo")}" loading="lazy"></a>`).join("")}</div>`;

function sectionHtml(sec, mode) {
  const heading = sec.fields.heading || (sec.name && !/^hero$/i.test(sec.name) ? sec.name : "");
  const body = blocks(sec.body, mode);
  if (!heading && !body) return "";
  return `<section class="block"><div class="wrap">${heading ? `<h2>${inline(heading, mode)}</h2>` : ""}${body}</div></section>`;
}

function pageBody(site, page, mode, link, img) {
  const out = [];
  let sections = page.sections;
  if (page.kind === "home") {
    const heroSec = sections.find((s) => s.fields.headline) || null;
    sections = sections.filter((s) => s !== heroSec);
    const headline = heroSec?.fields.headline || site.name;
    const sub = heroSec?.fields.subheadline || site.tagline;
    const btn = heroSec?.fields["button text"] || "Contact us";
    const contactPage = site.pages.find((p) => p.kind === "contact");
    const href = site.whatsapp ? waLink(site) : contactPage ? link(contactPage.slug) : "#";
    out.push(`<section class="hero"><div class="wrap"><div><h1>${inline(headline, mode)}</h1>${sub ? `<p>${inline(sub, mode)}</p>` : ""}<a class="btn" href="${href}">${inline(btn, mode)}</a></div>${site.photos[0] ? `<img src="${img(site.photos[0].url)}" alt="${esc(site.name)}">` : ""}</div></section>`);
  } else {
    out.push(`<div class="page-head"><div class="wrap"><h1>${esc(page.name)}</h1></div></div>`);
  }
  for (const s of sections) out.push(sectionHtml(s, mode));
  const has = (k) => site.pages.some((p) => p.kind === k);
  const extra = (title, html) => out.push(`<section class="block"><div class="wrap">${title ? `<h2>${esc(title)}</h2>` : ""}${html}</div></section>`);
  if (page.kind === "home") {
    const find = (...kinds) => site.pages.find((p) => kinds.includes(p.kind));
    const more = (p, label) => (p ? `<p style="margin-top:16px"><a class="btn" href="${link(p.slug)}">${label}</a></p>` : "");
    if (site.services.length) {
      const sp = find("services", "prices");
      extra("What we offer", serviceCards({ ...site, services: sp ? site.services.slice(0, 3) : site.services }, true) + (sp && site.services.length > 3 ? more(sp, "See all services") : ""));
    }
    if (site.products.length) extra("Featured products", productCards({ ...site, products: site.products.slice(0, 3) }, img) + more(find("shop"), "Shop all products"));
    if (site.photos.length > 1) {
      const gp = find("gallery");
      extra(gp ? "Our work" : "", gallery(site.photos.slice(1, gp ? 5 : 7), img) + more(gp, "See the gallery"));
    }
  }
  if (page.kind === "services" || page.kind === "prices") extra("", serviceCards(site, true));
  if (page.kind === "gallery") extra("", site.photos.length ? gallery(site.photos, img) : mode === "preview" ? `<p><mark class="todo">To be added: photos</mark></p>` : "");
  if (page.kind === "testimonials" && site.testimonials.length) extra("", `<div class="cards">${site.testimonials.map((t) => `<blockquote>${esc(t)}</blockquote>`).join("")}</div>`);
  if (page.kind === "shop") {
    extra("", site.products.length ? productCards(site, img) : "");
    if (site.delivery || site.returns) extra("Delivery and returns", `${site.delivery ? `<p><strong>Delivery:</strong> ${esc(site.delivery)}</p>` : ""}${site.returns ? `<p><strong>Returns:</strong> ${esc(site.returns)}</p>` : ""}`);
  }
  if (page.kind === "blog") for (const post of site.blogPosts) extra("", `<article class="post"><h2>${esc(post.title)}</h2>${blocks(post.body, mode)}</article>`);
  if (page.kind === "contact" || page.kind === "location") extra("", contactCard(site, mode));
  if (page.kind !== "contact" && site.whatsapp) {
    out.push(`<div class="cta"><div class="wrap"><h2>Ready when you are</h2><p>Send us a message and we'll reply quickly.</p><a class="btn" href="${waLink(site)}">Chat on WhatsApp</a></div></div>`);
  }
  return out.join("");
}

function footer(site, link) {
  const socials = site.socials.map((s) => (/^https?:\/\//.test(s) ? `<a href="${esc(s)}" rel="noopener">${esc(s.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a>` : esc(s))).join(" · ");
  return `<footer><div class="wrap"><strong>${esc(site.name)}</strong>${site.tagline ? `<span>${esc(site.tagline)}</span>` : ""}
<span>${[site.phone && esc(site.phone), site.email && `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`, site.address && esc(site.address.split("\n")[0])].filter(Boolean).join(" · ")}</span>
${socials ? `<span>${socials}</span>` : ""}<span>© ${new Date().getFullYear()} ${esc(site.name)}</span>
<span class="credit">Website by <a href="https://www.sirraddo.com.ng" rel="noopener">SIRRADDO</a></span></div></footer>
${site.whatsapp ? `<a class="wa" href="${waLink(site)}" aria-label="Chat on WhatsApp">WhatsApp</a>` : ""}`;
}

function previewPanel(row, token) {
  const status = row.preview_status;
  const todo = /\[ADD:/.test(row.draft_md || "");
  const done = status === "approved"
    ? `<p class="msg">You approved this design${row.preview_approved_at ? " on " + new Date(row.preview_approved_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}. Thank you! We will put it live once the balance is paid.</p>`
    : "";
  return `<div class="pv" id="review"><div class="wrap">
<h2>${status === "approved" ? "Approved" : "What do you think?"}</h2>
${status === "approved" ? "" : `<p>Look through every page. If you're happy, tap <strong>Approve</strong>. If anything should change, write it below and tap <strong>Send changes</strong>.${todo ? " The yellow parts are details we still need from you." : ""}</p>`}
${done}
<form id="pv-form"${status === "approved" ? " hidden" : ""}>
<label for="pv-text">Changes you'd like (optional)</label>
<textarea id="pv-text" maxlength="3000" placeholder="e.g. Change the opening hours to 9am–7pm, use the second photo at the top…"></textarea>
<div class="row"><button class="btn ok" type="button" data-act="approved">Approve my website</button><button class="btn chg" type="button" data-act="changes">Send changes</button></div>
<p class="msg" id="pv-msg" role="status"></p></form></div></div>
<script>(function(){var f=document.getElementById('pv-form');if(!f)return;var m=document.getElementById('pv-msg');
f.addEventListener('click',function(e){var b=e.target.closest('button[data-act]');if(!b)return;var act=b.getAttribute('data-act');var t=document.getElementById('pv-text').value.trim();
if(act==='changes'&&!t){m.textContent='Please write what you would like changed.';return;}
if(act==='approved'&&!confirm('Approve this website design?'+(t?' Your note will be sent too.':'')))return;
Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=true});m.textContent='Sending…';
fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:${JSON.stringify(token)},action:act,text:t})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})
.then(function(j){m.textContent=j.message;f.querySelector('textarea').value='';if(act==='approved')f.querySelector('.row').hidden=true;else Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=false})})
.catch(function(err){m.textContent=err.message+'. Please try again or message us on WhatsApp.';Array.prototype.forEach.call(f.querySelectorAll('button'),function(x){x.disabled=false})});});})();</script>`;
}

// mode: "preview" (served at /preview, with the approval panel) or "export" (plain files for hosting).
export function renderPage(site, slug, { mode = "export", link, img = (u) => u, row, token } = {}) {
  const page = site.pages.find((p) => p.slug === slug) || site.pages[0];
  const title = page.title || (page.kind === "home" ? site.name : `${page.name} | ${site.name}`);
  const desc = page.meta || site.tagline || "";
  const preview = mode === "preview";
  return `<!doctype html>
<html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(preview ? "Preview: " + title : title)}</title>${desc ? `\n<meta name="description" content="${esc(desc)}">` : ""}
<meta property="og:title" content="${esc(title)}">${desc ? `<meta property="og:description" content="${esc(desc)}">` : ""}<meta property="og:type" content="website">
${preview ? '<meta name="robots" content="noindex, nofollow">' : ""}<meta name="theme-color" content="${site.theme.primary}">
${site.logo ? `<link rel="icon" href="${img(site.logo.url)}">` : ""}
<style>${css(site.theme)}${preview ? PREVIEW_CSS : ""}</style></head>
<body>${preview ? `<div class="pv-top">Preview of your new website. It is not live yet. <a href="#review">Approve or ask for changes</a></div>` : ""}
${header(site, page, link, img)}
<main>${pageBody(site, page, mode, link, img)}</main>
${preview ? previewPanel(row, token) : ""}
${footer(site, link)}
</body></html>`;
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
