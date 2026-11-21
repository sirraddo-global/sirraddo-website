// /manage?t=TOKEN — "Manage my store" / "Manage my website": the owner changes prices, sold out, slogan, hours, phone/WhatsApp and a short
// notice themselves. Save updates their live site and emails us what changed. Works on phones; no login.
import { dbConfigured, esc } from "./_lib/store.mjs";
import { findManageRequest, applyManage, afterManage, manageTitle, lookStatus, gbpAsk } from "./_lib/manage.mjs";
import { listReviews, starsText } from "./_lib/reviews.mjs";
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
.p .n{font-weight:600;overflow-wrap:anywhere}.p .cat{font-size:.8rem;color:#64748B}.p input[type=text]{padding:9px}.p .st{grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:.92rem;font-weight:600;margin:0}.st input{width:120px}.so{grid-column:1/-1;display:flex;gap:8px;align-items:center;font-size:.92rem;font-weight:600;margin:0}.ck{display:flex;gap:10px;align-items:center;font-weight:600;margin:10px 0}.ck input{width:22px;height:22px;flex:none}
.p.is-sold .n{text-decoration:line-through;opacity:.6}input[type=checkbox]{width:22px;height:22px}
a.wa{display:inline-block;background:#1F8A4C;color:#fff;padding:12px 18px;border-radius:10px;font-weight:700;text-decoration:none}
.bar{position:sticky;bottom:0;background:#F5F7FB;padding:10px 0}.bar button{width:100%;background:#13254F;color:#fff;border:0;border-radius:12px;padding:15px;font:inherit;font-weight:800;font-size:16px}
.ok{background:#E8F6EC;border-left:4px solid #1E8E3E;padding:10px 12px;border-radius:8px}.err{background:#FDECEC;border-left:4px solid #C0392B;padding:10px 12px;border-radius:8px}
.m{color:#4A5568;font-size:.9rem}.p[hidden]{display:none}.rv{border-top:1px solid #EEF1F5;padding:12px 0}.rv p{margin:4px 0;overflow-wrap:anywhere}.rs{color:#D9A21B;font-size:1.2rem;letter-spacing:2px}.rv select{font:inherit;font-size:16px;padding:10px;border-radius:10px;border:1px solid #C9D1DE;margin-top:6px}.new{background:#D9A21B;color:#13254F;border-radius:999px;padding:2px 10px;font-size:.8rem}${DARK_PAGE_CSS}
@media (prefers-color-scheme:dark){.p{border-color:#2A3242}}</style><script src="/assets/theme.js"></script></head><body><div class="w">${body}
<p class="m" style="text-align:center">${esc(COMPANY.name)} · WhatsApp ${esc(COMPANY.phone)}</p></div></body></html>`);
}

function reviewsCard(reviews) {
  if (!reviews?.length) return `<div class="c"><h2>Customer reviews</h2><p class="m">No reviews yet. When a customer leaves one on your website, we email you and it appears here. It only shows on your website after you choose "Show on website".</p></div>`;
  const waiting = reviews.filter((x) => x.status === "pending").length;
  return `<div class="c"><h2>Customer reviews${waiting ? ` <span class="new">${waiting} new</span>` : ""}</h2><p class="m">Choose <b>Show on website</b> for genuine reviews, <b>Hide</b> for fake or rude ones, then tap Save changes.</p>
${reviews.map((x) => `<div class="rv"><div class="rs">${starsText(x.stars)}</div><b>${esc(x.name)}</b> <span class="m">${new Date(x.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })}</span>${x.body ? `<p>${esc(x.body)}</p>` : ""}
<select name="rv_${x.id}" aria-label="Review from ${esc(x.name)}">${x.status === "pending" ? `<option value="pending" selected>New: choose</option>` : ""}<option value="shown"${x.status === "shown" ? " selected" : ""}>Show on website</option><option value="hidden"${x.status === "hidden" ? " selected" : ""}>Hide</option></select></div>`).join("")}</div>`;
}

// Website improvements: we improve all our websites from time to time. Automatic (default) or "Ask me first".
function lookCard(r) {
  if (!r.hosting?.publishedAt) return "";
  const L = lookStatus(r);
  return `<div class="c"><h2>Website improvements</h2><p class="m">From time to time we improve all the websites we build (new features, better looks). Your text, photos, prices and colours stay the same, and we email you what changed. Don't like something? Use your "Request a change" link and we'll adjust it for free.</p>
<label class="ck"><input type="radio" name="look_mode" value="auto"${L.mode === "auto" ? " checked" : ""}> Apply improvements automatically (recommended)</label>
<label class="ck"><input type="radio" name="look_mode" value="ask"${L.mode === "ask" ? " checked" : ""}> Ask me first (email me; I'll update it here)</label>
${L.waiting ? `<div class="rv"><b>A new version of your website is ready:</b><ul>${L.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul><label class="ck"><input type="checkbox" name="update_look" value="1"> Update my website to the new version</label><p class="m">Saving any other change here also updates it to the new version.</p></div>` : ""}</div>`;
}

function form(r, token, note) {
  const b = r.brief || {};
  const items = (b.products || []).map((p, i) => ({ ...p, i })).filter((p) => p.name);
  const rows = items.map((p) => `<div class="p${p.soldout ? " is-sold" : ""}" data-s="${esc((p.name + " " + (p.category || "")).toLowerCase())}">
<div><div class="n">${esc(p.name)}</div>${p.category ? `<div class="cat">${esc(p.category)}</div>` : ""}</div>
<input type="text" inputmode="decimal" name="price_${p.i}" value="${esc(p.price || "")}" aria-label="Price of ${esc(p.name)}" placeholder="Price">
<label class="st">In stock <input type="text" inputmode="numeric" pattern="[0-9]*" name="stock_${p.i}" value="${esc(String(p.stock ?? ""))}" aria-label="How many ${esc(p.name)} in stock" placeholder="not counted"></label>
<label class="so"><input type="checkbox" name="sold_${p.i}"${p.soldout ? " checked" : ""} onchange="this.closest('.p').classList.toggle('is-sold',this.checked)"> Sold out</label></div>`).join("");
  return `<div class="c"><h1>${esc(manageTitle(r))}</h1><p>${esc(b.business_name || r.business || r.name)}${r.website_url ? ` · <a href="${esc(r.website_url)}">${esc(r.website_url.replace(/^https?:\/\//, ""))}</a>` : ""}</p>
<p class="m">${r.interest === "Online Store" ? "Change prices, set how many you have in stock (online orders take it down; at 0 it shows Sold out), mark items sold out, update" : "Update"} your hours and numbers, slogan and notice, and choose which customer reviews show. Tap <b>Save changes</b> at the bottom: your website updates within a minute. For new ${r.interest === "Online Store" ? "products, " : ""}photos or text, use your "Request a change" link.</p>${note || ""}</div>
<form method="post" action="/manage?t=${esc(token)}">
${items.length ? `<div class="c"><h2>Products (${items.length})</h2><p class="m">Stock: type how many you have, or leave it empty to not count. Paid online orders take it down by themselves. WhatsApp and in-shop sales don't, so adjust the number here. You are responsible for keeping prices and stock right.</p>${items.length > 8 ? `<input type="search" placeholder="Find a product" aria-label="Find a product" oninput="var w=this.value.toLowerCase();document.querySelectorAll('.p').forEach(function(x){x.hidden=w&&x.getAttribute('data-s').indexOf(w)<0})">` : ""}${rows}</div>` : ""}
<div class="c"><h2>Shop details</h2>
<label for="tagline">Slogan (shows at the bottom of every page)</label><input type="text" id="tagline" name="tagline" maxlength="100" value="${esc(b.tagline || "")}" placeholder="e.g. Fresh bread every morning in Ibadan">
<label for="hours">Opening hours</label><input type="text" id="hours" name="hours" maxlength="120" value="${esc(b.hours || "")}" placeholder="e.g. Mon–Sat 8am–6pm">
<label for="phone">Phone number</label><input type="tel" id="phone" name="phone" maxlength="30" value="${esc(b.phone || "")}">
<label for="whatsapp">WhatsApp number</label><input type="tel" id="whatsapp" name="whatsapp" maxlength="30" value="${esc(b.whatsapp || "")}" placeholder="If different from the phone number">
<label for="site_notice">Notice at the top of your website (optional)</label><textarea id="site_notice" name="site_notice" rows="2" maxlength="200" placeholder="e.g. Closed for Sallah, back on Monday. Leave empty to remove it.">${esc(b.site_notice || "")}</textarea></div>
${reviewsCard(r.reviews)}
${lookCard(r)}
${gbpAsk(r) ? gbpCard(r) : ""}
<div class="bar"><button type="submit">Save changes</button></div></form>
${inviteCard(r)}`;
}


// Getting on Google Maps: their own details ready to copy, step by step. They own the profile themselves.
function gbpCard(r) {
  const b = r.brief || {};
  const copy = (label, value, rows = 0) => value ? `<div class="cp"><span>${esc(label)}</span>${rows ? `<textarea readonly rows="${rows}">${esc(value)}</textarea>` : `<input type="text" readonly value="${esc(value)}">`}<button type="button" onclick="var f=this.previousElementSibling;f.select();try{navigator.clipboard.writeText(f.value)}catch(e){document.execCommand('copy')}this.textContent='Copied \u2713'">Copy</button></div>` : "";
  const visit = /no|deliver|online|come to them/i.test(b.gbp_visit || "") ? "area" : "shop";
  return `<div class="c gbp"><h2>Get found on Google Maps \ud83d\udccd</h2>
<p class="m">When people search for what you sell near them, Google shows your business with your hours, photos, directions and reviews. It's free and takes about 15 minutes. Here's everything you need, ready to copy.</p>
<ol class="gs">
<li><b>Open Google Business Profile</b> and sign in${b.gbp_gmail ? ` with <b>${esc(b.gbp_gmail)}</b>` : " with the Gmail that should own it"}.<br><a class="go" href="https://business.google.com/create" target="_blank" rel="noopener">Open Google Business Profile \u2197</a></li>
<li><b>Business name</b>: exactly as on your signboard.${copy("Name", b.gbp_name || b.business_name || r.business)}</li>
<li><b>Category</b>: type it, then pick the closest one Google suggests.${copy("Category", b.gbp_category)}</li>
<li><b>Location</b>: ${visit === "shop" ? "customers come to you, so add your address and put the pin on your shop." : "you deliver or visit customers, so choose “No” for a shop address and add the areas you serve."}${visit === "shop" ? copy("Address", b.address) : copy("Areas you serve", b.gbp_area)}</li>
<li><b>Contact</b>: your phone number and website.${copy("Phone", b.phone)}${copy("Website", r.website_url)}</li>
<li><b>Verify</b>: Google asks you to prove it's your business: usually a short video (show your signboard, your shop or tools, and you at work), or a phone code. Follow its steps; it can take a few days.</li>
<li><b>Finish your profile</b>: add your opening hours, at least 5 bright photos, and this description.${copy("Hours", b.hours)}${copy("Description", r.gbpText, 5)}</li>
</ol>
<p class="m">Stuck on a step? Send us a screenshot on <a href="https://wa.me/2348167550937" target="_blank" rel="noopener">WhatsApp</a>.</p>
<label class="ck"><input type="checkbox" name="gbp_verified" value="1"> Done! Google says my business is verified</label>
<style>.gbp .gs{padding-left:20px;display:grid;gap:12px;margin:12px 0}.gbp .gs li{line-height:1.45}.gbp .go{display:inline-block;margin-top:6px;background:#13254F;color:#fff;font-weight:700;text-decoration:none;border-radius:10px;padding:9px 14px}
.gbp .cp{display:grid;grid-template-columns:1fr auto;gap:4px 8px;margin-top:6px;align-items:end}.gbp .cp span{grid-column:1/-1;font-size:.78rem;font-weight:700;opacity:.7}.gbp .cp input,.gbp .cp textarea{margin:0}
.gbp .cp button{border:1px solid #13254F;background:#fff;color:#13254F;font:inherit;font-weight:700;border-radius:10px;padding:9px 12px;cursor:pointer}</style></div>`;
}

// Referral: their own link; when a business they send pays for a website, they get the reward.
function inviteCard(r) {
  if (!r.invite) return "";
  const msg = `I got my website from SIRRADDO and it's working well for my business. If you need one, start here: ${r.invite.link}`;
  return `<div class="c"><h2>Invite a business 🎁</h2><p class="m">Know a business that needs a website? Share your link. When they pay for a website, you get <b>${esc(r.invite.reward)}</b> for each one.</p>
<label for="ref">Your link</label><input type="text" id="ref" readonly value="${esc(r.invite.link)}" onclick="this.select()">
<p style="margin-top:12px"><a class="wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Share on WhatsApp</a></p>
${r.invite.paid ? `<p class="m">Businesses that paid from your link: <b>${r.invite.paid}</b>${r.invite.left > 0 ? ` · rewards waiting: <b>${r.invite.left}</b>` : ""}</p>` : ""}</div>`;
}

export default async function handler(req, res) {
  if (!dbConfigured()) return shell(res, 503, "Not available", `<div class="c"><h1>Not available right now</h1><p>Please try again later.</p></div>`);
  const token = new URL(req.url, "http://x").searchParams.get("t") || "";
  const r = await findManageRequest(token).catch(() => null);
  if (r) r.reviews = await listReviews(r.id).catch(() => []);
  if (r && r.status === "won") {
    const info = await import("./_lib/marketing.mjs").then((m) => m.referralInfo(r.id)).catch(() => null);
    if (info) r.invite = { link: info.link, reward: info.reward, paid: info.paid, left: info.paid - info.used };
  }
  if (!r) return shell(res, 404, "Link not working", `<div class="c"><h1>This link doesn't work</h1><p>It may have been replaced by a newer one. Message us on WhatsApp for your current link.</p></div>`);
  if (req.method === "POST") {
    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (tooMany(ip)) return shell(res, 429, manageTitle(r), form(r, token, `<p class="err">Too many saves in an hour. Please wait a little.</p>`));
    const body = typeof req.body === "object" && req.body ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || "")));
    const products = {};
    for (const [k, v] of Object.entries(body)) {
      let m;
      if ((m = k.match(/^price_(\d{1,3})$/))) (products[m[1]] ||= {}).price = v;
      if ((m = k.match(/^stock_(\d{1,3})$/))) (products[m[1]] ||= {}).stock = v;
    }
    for (const p of (r.brief?.products || []).map((p, i) => ({ ...p, i }))) (products[p.i] ||= {}).soldout = body[`sold_${p.i}`] === "on";
    const reviews = {};
    for (const [k, v] of Object.entries(body)) { const m = k.match(/^rv_(\d{1,9})$/); if (m) reviews[m[1]] = String(v); }
    try {
      const { changes, row } = await applyManage(r, { products, hours: body.hours, phone: body.phone, whatsapp: body.whatsapp, site_notice: body.site_notice, tagline: body.tagline, reviews, lookMode: body.look_mode, updateLook: body.update_look === "1", gbpVerified: body.gbp_verified === "1" });
      row.reviews = await listReviews(row.id).catch(() => []);
      if (!changes.length) return shell(res, 200, manageTitle(row), form(row, token, `<p class="ok">Nothing changed.</p>`));
      const live = await afterManage(row, changes);
      const msg = live === "updated" ? `Saved ✓ Your website is updated (refresh it to see). ${changes.length} change${changes.length === 1 ? "" : "s"}.`
        : live === "not published yet" ? `Saved ✓ ${changes.length} change${changes.length === 1 ? "" : "s"}. They'll show when your website goes live.`
        : `Saved ✓ but the website didn't update yet. We've been told and will fix it.`;
      return shell(res, 200, manageTitle(row), form(row, token, `<p class="ok">${esc(msg)}</p>`));
    } catch (e) {
      return shell(res, 400, manageTitle(r), form(r, token, `<p class="err">${esc(e.message)}</p>`));
    }
  }
  if (req.method !== "GET") return shell(res, 405, "Not allowed", "<h1>Not allowed</h1>");
  return shell(res, 200, manageTitle(r), form(r, token));
}
