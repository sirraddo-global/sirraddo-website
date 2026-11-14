// /api/site — things customers' live websites (and their owners) use. One function on purpose:
// (Kept as one function from the Vercel days, when the plan allowed only 12.)
//   POST ?hit=1                      visitor ping from a customer website (no cookies; see _lib/stats.mjs)
//   GET  /change?t=TOKEN             the owner's private "request a change" page (rewritten here in vercel.json)
//   POST ?upload=1&t=TOKEN&name=&type=   a photo/file for a change request (body = the file)
//   POST { t, text, files }          send the change request
//   GET  ?greeting=1                 the festive greeting showing on sirraddo.com.ng now (or null)
//   GET  ?nogreet=ID.SIG             stop festive greeting emails for that customer
import { putFile } from "./_lib/platform.mjs";
import { dbConfigured, getByPreviewToken, esc } from "./_lib/store.mjs";
import { recordHit } from "./_lib/stats.mjs";
import { addChange, listChanges, freeUntil, isFree, MAX_CHANGE_FILES } from "./_lib/changes.mjs";
import { uploadsEnabled } from "./brief.mjs";
import { DARK_PAGE_CSS } from "./_lib/darkcss.mjs";
import { currentGreeting, unsubscribe } from "./_lib/greetings.mjs";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const WA = "https://wa.me/2348167550937";

async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error("too big"), { tooBig: true });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function readJson(req) {
  let body = req.body;
  if (body === undefined) body = (await readRaw(req, 20000)).toString("utf8");
  if (Buffer.isBuffer(body)) body = body.toString("utf8");
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  return body && typeof body === "object" ? body : {};
}

const longDate = (d) => new Date(d + (d.length === 10 ? "T12:00:00Z" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

function shell(title, body) {
  return `<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)}</title>
<style>body{margin:0;background:#F5F7FB;font-family:system-ui,Arial,sans-serif;color:#1B2433;line-height:1.5}.w{max-width:560px;margin:0 auto;padding:20px 16px 40px}
.logo{font-weight:900;font-size:22px;letter-spacing:-1px}.logo b{color:#D9A21B}.logo span{color:#13254F}.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:20px;margin-top:14px}
h1{font-size:1.4rem;margin:0 0 6px;color:#13254F}h2{font-size:1.05rem;margin:0 0 8px;color:#13254F}label{display:block;font-weight:700;margin:12px 0 6px}
textarea{width:100%;box-sizing:border-box;min-height:140px;border:1px solid #CBD2DE;border-radius:10px;padding:12px;font:inherit}
.btn{display:inline-block;border:0;border-radius:12px;padding:14px 18px;font:700 16px/1 system-ui,Arial,sans-serif;cursor:pointer;background:#13254F;color:#fff;text-decoration:none}
.btn.gold{background:#D9A21B;color:#13254F}.btn:disabled{opacity:.5}.up{display:inline-block;border:2px dashed #CBD2DE;border-radius:10px;padding:10px 14px;cursor:pointer;font-weight:600}
.up input{display:none}.files{margin:8px 0;padding:0;list-style:none}.files li{font-size:.9rem;padding:4px 0;overflow-wrap:anywhere}.m{color:#4A5568;font-size:.92rem}
.tag{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.8rem;font-weight:700}.ok{background:#DCFCE7;color:#14532D}.open{background:#FEF3C7;color:#713F12}
.item{border-top:1px solid #EEF1F5;padding:10px 0}.item p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.msg{font-weight:700;margin-top:10px}
${DARK_PAGE_CSS}:root[data-theme="dark"] .btn:not(.gold){background:#22407F}</style><script src="/assets/theme.js"></script></head>
<body><div class="w"><div class="logo"><span>SI</span><b>RR</b><span>A</span><b>DD</b><span>O</span></div>${body}
<p class="m" style="text-align:center;margin-top:18px">Need to talk instead? <a href="${WA}">WhatsApp SIRRADDO</a></p></div></body></html>`;
}

async function changePage(res, token) {
  const r = await getByPreviewToken(token);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (!r) {
    res.statusCode = 404;
    return res.end(shell("Link not valid", `<div class="c"><h1>This link isn't valid</h1><p>Please ask SIRRADDO for your change request link on <a href="${WA}">WhatsApp</a>.</p></div>`));
  }
  const name = r.brief?.business_name || r.business || r.name;
  const until = freeUntil(r);
  const free = isFree(r);
  const past = await listChanges(r.id, 10);
  const uploads = uploadsEnabled();
  const intro = !r.live_on ? "Tell us what you'd like changed on your website."
    : free ? `Changes are <b>free until ${longDate(until)}</b> (your first month after launch). Text, photos, prices, opening hours: just tell us.`
    : `Your free month of changes ended on ${longDate(until)}. Send your request anyway: we'll reply with a small quote before we start.`;
  res.statusCode = 200;
  res.end(shell(`Request a change · ${name}`, `<div class="c"><h1>Request a change</h1><p class="m">${esc(name)}${r.website_url ? ` · <a href="${esc(r.website_url)}">${esc(r.website_url.replace(/^https?:\/\//, ""))}</a>` : ""}</p><p>${intro}</p>
<form id="f"><label for="t">What should we change?</label>
<textarea id="t" maxlength="4000" placeholder="e.g. Change our phone number to 0803…, replace the top photo with the one attached, add 'Ankara gowns' to the shop at ₦25,000."></textarea>
${uploads ? `<label>Photos or files (optional, up to ${MAX_CHANGE_FILES})</label><label class="up">+ Add photo or file<input id="file" type="file" accept="image/*,application/pdf" multiple></label><ul class="files" id="list"></ul>` : `<p class="m">To send photos, please use <a href="${WA}">WhatsApp</a>.</p>`}
<p><button class="btn gold" type="submit">Send request</button></p><p class="msg" id="msg" role="status"></p></form></div>
${past.length ? `<div class="c"><h2>Your requests</h2>${past.map((c) => `<div class="item"><span class="tag ${c.status === "done" ? "ok" : "open"}">${c.status === "done" ? "Done" : "Received"}</span> <span class="m">${longDate(new Date(c.created_at).toISOString())}</span><p>${esc(c.body)}</p>${c.note ? `<p class="m">${esc(c.note)}</p>` : ""}</div>`).join("")}</div>` : ""}
<script>(function(){var T=${JSON.stringify(token)},files=[],busy=0,f=document.getElementById('f'),msg=document.getElementById('msg'),inp=document.getElementById('file'),list=document.getElementById('list');
function draw(){if(!list)return;list.innerHTML=files.map(function(x){return '<li>\\u2713 '+x.name.replace(/[&<>]/g,'')+'</li>'}).join('')+(busy?'<li>Uploading\\u2026</li>':'')}
function shrink(file){if(!/^image\\/(jpeg|png|webp)$/.test(file.type)||!window.createImageBitmap)return Promise.resolve(file);
return createImageBitmap(file).then(function(img){var s=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
return new Promise(function(res){c.toBlob(function(b){if(!b||b.size>=file.size)return res(file);res(new File([b],file.name.replace(/\\.\\w+$/,'')+'.jpg',{type:'image/jpeg'}))},'image/jpeg',.85)})}).catch(function(){return file})}
if(inp)inp.addEventListener('change',function(){Array.prototype.slice.call(inp.files).forEach(function(file){if(files.length+busy>=${MAX_CHANGE_FILES}){msg.textContent='Up to ${MAX_CHANGE_FILES} files. Send more on WhatsApp.';return}
busy++;draw();shrink(file).then(function(s){return fetch('/api/site?upload=1&t='+encodeURIComponent(T)+'&name='+encodeURIComponent(s.name)+'&type='+encodeURIComponent(s.type),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:s})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Upload failed');return j})}).then(function(j){files.push(j)}).catch(function(e){msg.textContent=e.message}).then(function(){busy--;draw()})});inp.value='';});
f.addEventListener('submit',function(e){e.preventDefault();var t=document.getElementById('t').value.trim();if(t.length<3){msg.textContent='Please describe the change.';return}if(busy){msg.textContent='Please wait for the upload to finish.';return}
var b=f.querySelector('button');b.disabled=true;msg.textContent='Sending\\u2026';
fetch('/api/site',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:T,text:t,files:files})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})})
.then(function(j){msg.textContent=j.message;setTimeout(function(){location.reload()},2500)}).catch(function(err){b.disabled=false;msg.textContent=err.message})});})();</script>`));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);

  if (query.hit) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS" || !dbConfigured()) return res.status(204).end();
    if (req.method !== "POST") return res.status(405).end();
    try {
      const b = await readJson(req);
      const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      await recordHit({ k: b.k, e: b.e, p: b.p, r: b.r }, { ip, ua: String(req.headers["user-agent"] || "") });
    } catch (e) { console.error("hit failed", e); }
    return res.status(204).end();
  }

  if (query.greeting) {
    // The festive banner on sirraddo.com.ng asks this; cached at the edge for 10 minutes.
    res.setHeader("Cache-Control", "public, s-maxage=600, max-age=300");
    if (!dbConfigured()) return res.status(200).json({ greeting: null });
    try { return res.status(200).json({ greeting: await currentGreeting() }); } catch { return res.status(200).json({ greeting: null }); }
  }

  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (!dbConfigured()) return res.status(503).json({ error: "Not available" });
  if (query.nogreet) {
    const ok = await unsubscribe(query.nogreet);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.statusCode = ok ? 200 : 404;
    return res.end(shell("Festive greetings", ok
      ? `<div class="c"><h1>Done</h1><p>You won't get festive greeting emails from us any more. You'll still get invoices, receipts and messages about your website.</p></div>`
      : `<div class="c"><h1>This link isn't valid</h1><p>Please message us on <a href="${WA}">WhatsApp</a> and we'll stop the greetings for you.</p></div>`));
  }
  try {
    if (req.method === "GET") return await changePage(res, String(query.t || ""));
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    if (query.upload) {
      if (!uploadsEnabled()) return res.status(503).json({ error: "Uploads are not available. Please send files on WhatsApp." });
      const r = await getByPreviewToken(String(query.t || ""));
      if (!r) return res.status(404).json({ error: "This link is not valid." });
      const type = String(query.type || "");
      if (!TYPES.includes(type)) return res.status(415).json({ error: "Please upload a photo (JPG, PNG) or a PDF." });
      const body = await readRaw(req, MAX_BYTES);
      if (!body.length) return res.status(400).json({ error: "Empty file" });
      const name = String(query.name || "file").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "file";
      const blob = await putFile(`changes/${r.id}/${name}`, body, { contentType: type });
      return res.status(200).json({ url: blob.url, name });
    }

    const b = await readJson(req);
    const r = await getByPreviewToken(String(b.t || ""));
    if (!r) return res.status(404).json({ error: "This link is not valid." });
    const c = await addChange(r, b.text, b.files);
    return res.status(200).json({ ok: true, message: c.free ? "Sent! We'll email you when it's done." : "Sent! We'll reply with a quote shortly." });
  } catch (e) {
    if (e.tooBig) return res.status(413).json({ error: "That file is too big (max 4 MB). Please send it on WhatsApp." });
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error("site error", e);
    return res.status(500).json({ error: "Something went wrong. Please try again or WhatsApp us." });
  }
}
