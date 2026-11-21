// /demo: sample websites by trade (salon, restaurant, church, school, online store), made by our real builder.
// /demo → the list; /demo/salon → its home page; /demo/salon/contact → another page.
// ?a=CODE (from an agent's dashboard) is kept on every link and "Get one like this" goes to that agent's link.
import { DEMOS, demoRow } from "./_lib/demos.mjs";
import { buildSiteModel, renderPage } from "./_lib/sitegen.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const url = new URL(req.url, "https://x");
  const parts = url.pathname.replace(/^\/demo\/?/, "").split("/").filter(Boolean);
  const code = String(req.query?.a || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  const keep = code ? `?a=${encodeURIComponent(code)}` : "";
  const getOne = code ? `/?a=${encodeURIComponent(code)}` : "/websites";
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!parts.length) return res.status(200).send(listPage(keep, getOne));
  const key = parts[0], row = demoRow(key);
  if (!row) return res.status(404).send(listPage(keep, getOne));
  const site = buildSiteModel(row);
  const slug = parts[1] || "index";
  const link = (s) => `/demo/${key}${s === "index" ? "" : "/" + encodeURIComponent(s)}${keep}`;
  const top = `Demo website by SIRRADDO (the business is made up). <a href="${getOne}">Get one like this →</a> · <a href="/demo${keep}">More demos</a>`;
  return res.status(200).send(renderPage(site, slug, { mode: "preview", link, top, panel: "" }));
}

function listPage(keep, getOne) {
  const cards = Object.entries(DEMOS).map(([k, d]) => `<a class="dm-card" href="/demo/${k}${keep}"><span class="dm-ico">${d.icon}</span><b>${esc(d.label)}</b><small>${esc(d.brief.business_name)} · ${esc(d.interest)}</small></a>`).join("");
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Demo websites · SIRRADDO</title><link rel="stylesheet" href="/assets/styles.css">
<style>.dm{max-width:880px;margin:0 auto;padding:28px 18px 60px}.dm h1{margin:6px 0 8px}.dm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:18px 0}
.dm-card{display:grid;gap:4px;padding:18px;border:1px solid var(--line);border-top:4px solid var(--gold);border-radius:16px;background:var(--surface);text-decoration:none;color:var(--text)}
.dm-card:hover{border-color:var(--gold)}.dm-ico{font-size:2.2rem}.dm-card b{color:var(--ink);font-size:1.05rem}.dm-card small{color:var(--muted)}</style></head>
<body><main class="dm"><a href="/" style="font-weight:900;font-size:1.4rem;text-decoration:none;color:var(--ink)">SI<span style="color:var(--gold)">RR</span>A<span style="color:var(--gold)">DD</span>O</a>
<h1>See a website like yours</h1><p class="lead" style="color:var(--muted)">Tap a business type to open a sample website on your phone. Every SIRRADDO website is made for your own business, with your name, photos, prices and colours.</p>
<div class="dm-grid">${cards}</div><p><a class="btn btn--gold" href="${getOne}">Get your website →</a></p></main></body></html>`;
}
