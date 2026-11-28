// /demo: sample websites by trade (salon, restaurant, church, school, online store), made by our real builder.
// /demo → the list; /demo/salon → its home page; /demo/salon/contact → another page.
// ?a=CODE (from an agent's dashboard) is kept on every link and "Get one like this" goes to that agent's link.
import { DEMOS, demoRow } from "./_lib/demos.mjs";
import { buildSiteModel, renderPage, SURFACES } from "./_lib/sitegen.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const url = new URL(req.url, "https://x");
  const parts = url.pathname.replace(/^\/demo\/?/, "").split("/").filter(Boolean);
  const code = String(req.query?.a || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  const keep = code ? `?a=${encodeURIComponent(code)}` : "";
  const getOne = code ? `/?a=${encodeURIComponent(code)}` : "/websites";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  // The list of demos can be found by search engines and AI tools; the made-up demo sites themselves stay out.
  if (!parts.length) return res.status(200).send(listPage(keep, getOne));
  res.setHeader("X-Robots-Tag", "noindex");
  // ?s= page background (tinted, dark, cream, light): the pills in the top bar switch it.
  const surface = SURFACES[req.query?.s] ? req.query.s : "tinted";
  const key = parts[0], row = demoRow(key, { surface });
  if (!row) return res.status(404).send(listPage(keep, getOne));
  const site = buildSiteModel(row);
  const slug = parts[1] || "index";
  const qs = (sv) => { const p = new URLSearchParams(); if (code) p.set("a", code); if (sv !== "tinted") p.set("s", sv); const t = p.toString(); return t ? "?" + t : ""; };
  const link = (s) => `/demo/${key}${s === "index" ? "" : "/" + encodeURIComponent(s)}${qs(surface)}`;
  const here = `/demo/${key}${slug === "index" ? "" : "/" + encodeURIComponent(slug)}`;
  const pills = Object.entries(SURFACES).map(([k, t]) => `<a class="pv-pill${k === surface ? " on" : ""}" href="${here}${qs(k)}"${k === surface ? ' aria-current="true"' : ""}>${esc(t.replace(" (recommended)", ""))}</a>`).join("");
  const top = `Demo website by SIRRADDO (the business is made up). <a href="${getOne}">Get one like this →</a> · <a href="/demo${keep}">More demos</a><span class="pv-pills" role="group" aria-label="Page background">${pills}</span><style>.pv-pills{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px}.pv-pill{padding:5px 11px;border-radius:999px;border:1px solid #C9A227;background:#fff;color:#3D2E00;text-decoration:none;font-size:13px;font-weight:700}.pv-pill.on{background:#13254F;border-color:#13254F;color:#fff}</style>`;
  return res.status(200).send(renderPage(site, slug, { mode: "preview", link, top, panel: "" }));
}

function listPage(keep, getOne) {
  const cards = Object.entries(DEMOS).map(([k, d]) => `<a class="dm-card" href="/demo/${k}${keep}"><span class="dm-ico">${d.icon}</span><b>${esc(d.label)}</b><small>${esc(d.brief.business_name)} · ${esc(d.interest)}</small></a>`).join("");
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="${keep ? "noindex" : "index, follow"}"><link rel="canonical" href="https://www.sirraddo.com.ng/demo"><meta name="description" content="Test 9 interactive demo websites for salons, restaurants, churches, schools, real estate, clinics, hotels, gas plants &amp; online stores in Nigeria.">
<meta property="og:type" content="website"><meta property="og:site_name" content="SIRRADDO GLOBAL LIMITED"><meta property="og:url" content="https://www.sirraddo.com.ng/demo"><meta property="og:image" content="https://www.sirraddo.com.ng/assets/og-image.png">
<meta property="og:title" content="9 Live Demo Websites for Nigerian Businesses | SIRRADDO"><meta property="og:description" content="Test 9 interactive demo websites for salons, restaurants, churches, schools, real estate, clinics, hotels, gas plants &amp; online stores in Nigeria.">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="9 Live Demo Websites for Nigerian Businesses | SIRRADDO"><meta name="twitter:description" content="Test 9 interactive demo websites for salons, restaurants, churches, schools, real estate, clinics, hotels, gas plants &amp; online stores in Nigeria.">
<title>9 Live Demo Websites for Nigerian Businesses | SIRRADDO</title><link rel="stylesheet" href="/assets/styles.css">
<style>.dm{max-width:880px;margin:0 auto;padding:28px 18px 60px}.dm h1{margin:6px 0 8px}.dm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:18px 0}
.dm-card{display:grid;gap:4px;padding:18px;border:1px solid var(--line);border-top:4px solid var(--gold);border-radius:16px;background:var(--surface);text-decoration:none;color:var(--text)}
.dm-card:hover{border-color:var(--gold)}.dm-ico{font-size:2.2rem}.dm-card b{color:var(--ink);font-size:1.05rem}.dm-card small{color:var(--muted)}</style></head>
<body><main class="dm"><a href="/" style="font-weight:900;font-size:1.4rem;text-decoration:none;color:var(--ink)">SI<span style="color:var(--gold)">RR</span>A<span style="color:var(--gold)">DD</span>O</a>
<h1>See a website like yours</h1><p class="lead" style="color:var(--muted)">Tap a business type to open a sample website on your phone. Every SIRRADDO website is made for your own business, with your name, photos, prices and colours.</p>
<div class="dm-grid">${cards}</div><p><a class="btn btn--gold" href="${getOne}">Get your website →</a></p></main></body></html>`;
}
