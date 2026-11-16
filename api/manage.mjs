// /manage?t=TOKEN — "Manage my store": the store owner changes prices, sold out, hours, phone/WhatsApp and a short
// notice themselves. Save updates their live site and emails us what changed. Works on phones; no login.
import { dbConfigured, esc } from "./_lib/store.mjs";
import { findManageRequest, applyManage, afterManage } from "./_lib/manage.mjs";
import { COMPANY } from "./_lib/docs.mjs";
import { DARK_PAGE_CSS } from "./_lib/darkcss.mjs";

const tries = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (tries.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  tries.set(ip, list);
  if (tries.size > 5000) tries.clear();
  return list.length > 30;
}

function shell(res, code, title, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#F5F7FB;font-family:system-ui,Arial,sans-serif;color:#1B2433;line-height:1.5}.w{max-width:720px;margin:0 auto;padding:16px}
.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:18px;margin-bottom:14px}h1{font-size:1.35rem;margin:0 0 6px;color:#13254F}h2{font-size:1.05rem;margin:0 0 10px;color:#13254F}
label{display:block;font-weight:700;margin:12px 0 4px}input[type=text],input[type=tel],input[type=search],textarea{width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:12px;border:1px solid #C9D1DE;border-radius:10px;background:#fff;color:inherit}
.p{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:6px 10px;align-items:center;padding:10px 0;border-bottom:1px solid #EEF1F5}.p:last-child{border:0}
.p .n{font-weight:600;overflow-wrap:anywhere}.p .cat{font-size:.8rem;color:#64748B}.p input[type=text]{padding:9px}.p .so{grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:.92rem;font-weight:600;margin:0}
.p.is-sold .n{text-decoration:line-through;opacity:.6}input[type=checkbox]{width:22px;height:22px}
.bar{position:sticky;bottom:0;background:#F5F7FB;padding:10px 0}.bar button{width:100%;background:#13254F;color:#fff;border:0;border-radius:12px;padding:15px;font:inherit;font-weight:800;font-size:16px}
.ok{background:#E8F6EC;border-left:4px solid #1E8E3E;padding:10px 12px;border-radius:8px}.err{background:#FDECEC;border-left:4px solid #C0392B;padding:10px 12px;border-radius:8px}
.m{color:#4A5568;font-size:.9rem}.p[hidden]{display:none}${DARK_PAGE_CSS}
@media (prefers-color-scheme:dark){.p{border-color:#2A3242}}</style><script src="/assets/theme.js"></script></head><body><div class="w">${body}
<p class="m" style="text-align:center">${esc(COMPANY.name)} · WhatsApp ${esc(COMPANY.phone)}</p></div></body></html>`);
}

function form(r, token, note) {
  const b = r.brief || {};
  const items = (b.products || []).map((p, i) => ({ ...p, i })).filter((p) => p.name);
  const rows = items.map((p) => `<div class="p${p.soldout ? " is-sold" : ""}" data-s="${esc((p.name + " " + (p.category || "")).toLowerCase())}">
<div><div class="n">${esc(p.name)}</div>${p.category ? `<div class="cat">${esc(p.category)}</div>` : ""}</div>
<input type="text" inputmode="decimal" name="price_${p.i}" value="${esc(p.price || "")}" aria-label="Price of ${esc(p.name)}" placeholder="Price">
<label class="so"><input type="checkbox" name="sold_${p.i}"${p.soldout ? " checked" : ""} onchange="this.closest('.p').classList.toggle('is-sold',this.checked)"> Sold out</label></div>`).join("");
  return `<div class="c"><h1>Manage my store</h1><p>${esc(b.business_name || r.business || r.name)}${r.website_url ? ` · <a href="${esc(r.website_url)}">${esc(r.website_url.replace(/^https?:\/\//, ""))}</a>` : ""}</p>
<p class="m">Change prices, mark items sold out, and update your hours and numbers. Tap <b>Save changes</b> at the bottom: your website updates within a minute. For new products, photos or text, use your "Request a change" link.</p>${note || ""}</div>
<form method="post" action="/manage?t=${esc(token)}">
${items.length ? `<div class="c"><h2>Products (${items.length})</h2>${items.length > 8 ? `<input type="search" placeholder="Find a product" aria-label="Find a product" oninput="var w=this.value.toLowerCase();document.querySelectorAll('.p').forEach(function(x){x.hidden=w&&x.getAttribute('data-s').indexOf(w)<0})">` : ""}${rows}</div>` : ""}
<div class="c"><h2>Shop details</h2>
<label for="hours">Opening hours</label><input type="text" id="hours" name="hours" maxlength="120" value="${esc(b.hours || "")}" placeholder="e.g. Mon–Sat 8am–6pm">
<label for="phone">Phone number</label><input type="tel" id="phone" name="phone" maxlength="30" value="${esc(b.phone || "")}">
<label for="whatsapp">WhatsApp number</label><input type="tel" id="whatsapp" name="whatsapp" maxlength="30" value="${esc(b.whatsapp || "")}" placeholder="If different from the phone number">
<label for="site_notice">Notice at the top of your website (optional)</label><textarea id="site_notice" name="site_notice" rows="2" maxlength="200" placeholder="e.g. Closed for Sallah, back on Monday. Leave empty to remove it.">${esc(b.site_notice || "")}</textarea></div>
<div class="bar"><button type="submit">Save changes</button></div></form>`;
}

export default async function handler(req, res) {
  if (!dbConfigured()) return shell(res, 503, "Not available", `<div class="c"><h1>Not available right now</h1><p>Please try again later.</p></div>`);
  const token = new URL(req.url, "http://x").searchParams.get("t") || "";
  const r = await findManageRequest(token).catch(() => null);
  if (!r) return shell(res, 404, "Link not working", `<div class="c"><h1>This link doesn't work</h1><p>It may have been replaced by a newer one. Message us on WhatsApp for your current link.</p></div>`);
  if (req.method === "POST") {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (tooMany(ip)) return shell(res, 429, "Manage my store", form(r, token, `<p class="err">Too many saves in an hour. Please wait a little.</p>`));
    const body = typeof req.body === "object" && req.body ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || "")));
    const products = {};
    for (const [k, v] of Object.entries(body)) {
      let m;
      if ((m = k.match(/^price_(\d{1,3})$/))) (products[m[1]] ||= {}).price = v;
    }
    for (const p of (r.brief?.products || []).map((p, i) => ({ ...p, i }))) (products[p.i] ||= {}).soldout = body[`sold_${p.i}`] === "on";
    try {
      const { changes, row } = await applyManage(r, { products, hours: body.hours, phone: body.phone, whatsapp: body.whatsapp, site_notice: body.site_notice });
      if (!changes.length) return shell(res, 200, "Manage my store", form(row, token, `<p class="ok">Nothing changed.</p>`));
      const live = await afterManage(row, changes);
      const msg = live === "updated" ? `Saved ✓ Your website is updated (refresh it to see). ${changes.length} change${changes.length === 1 ? "" : "s"}.`
        : live === "not published yet" ? `Saved ✓ ${changes.length} change${changes.length === 1 ? "" : "s"}. They'll show when your website goes live.`
        : `Saved ✓ but the website didn't update yet. We've been told and will fix it.`;
      return shell(res, 200, "Manage my store", form(row, token, `<p class="ok">${esc(msg)}</p>`));
    } catch (e) {
      return shell(res, 400, "Manage my store", form(r, token, `<p class="err">${esc(e.message)}</p>`));
    }
  }
  if (req.method !== "GET") return shell(res, 405, "Not allowed", "<h1>Not allowed</h1>");
  return shell(res, 200, "Manage my store", form(r, token));
}
