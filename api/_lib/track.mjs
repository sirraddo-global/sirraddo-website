// /track?t=DOC_TOKEN — the customer's order tracker for quick services (flyers, CVs, Maps listing…).
// Shows where the job is, the promised delivery date, the on-time promise and a pay button while unpaid.
import { getByDocToken, esc, reference } from "./store.mjs";
import { ON_TIME_PROMISE } from "./graphics.mjs";
import { amountDue, paystackConfigured, payLink } from "./paystack.mjs";
import { naira, COMPANY } from "./docs.mjs";
import { DARK_PAGE_CSS } from "./darkcss.mjs";

// What the customer sees for each stage (admin sets the stage on the request card).
export const JOB_STAGES = [
  ["received", "Order received", "We have your order and your files."],
  ["paid", "Paid", "Payment received. Your job is in the queue."],
  ["designing", "Working on it", "We're making your options now."],
  ["options", "Options sent", "Check WhatsApp and tell us which one you like."],
  ["changes", "Final touches", "We're making the changes you asked for."],
  ["done", "Delivered", "Your files have been sent. Enjoy!"],
];
export const STAGE_KEYS = JOB_STAGES.map((s) => s[0]);

/** The stage to show: what admin set, or "paid"/"received" from the payments. */
export function stageOf(row) {
  if (row.job_stage && STAGE_KEYS.includes(row.job_stage)) return row.job_stage;
  return (row.payments || []).length ? "paid" : "received";
}

const nice = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "");

function page(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Your order · SIRRADDO</title>
<style>body{margin:0;background:#F5F7FB;font-family:Inter,system-ui,Arial,sans-serif;color:#1B2433;line-height:1.5}
.w{max-width:520px;margin:0 auto;padding:20px 16px}.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:22px}
.logo{font-weight:900;font-size:26px;letter-spacing:-1px}.ln{color:#13254F}.logo b{color:#D9A21B}.sub{font-weight:700;font-size:9px;letter-spacing:5px;color:#13254F;margin:2px 0 18px}
h1{color:#13254F;font-size:1.35rem;margin:0 0 4px}.muted{color:#4A5568;font-size:.92rem}
.due{display:flex;gap:12px;align-items:center;background:#FFF8E6;border:1px solid #F0D58A;border-radius:12px;padding:12px 14px;margin:16px 0}
.due b{color:#13254F}.late{background:#FDECEC;border-color:#F3B4B4}
ol{list-style:none;margin:18px 0 0;padding:0}li{position:relative;padding:0 0 18px 38px}
li:before{content:"";position:absolute;left:11px;top:24px;bottom:0;width:2px;background:#E1E6EF}li:last-child:before{display:none}
li i{position:absolute;left:0;top:0;width:24px;height:24px;border-radius:50%;border:2px solid #C8D0DC;background:#fff;box-sizing:border-box}
li.done i{background:#127A3E;border-color:#127A3E}li.done i:after{content:"✓";color:#fff;font-size:13px;font-style:normal;position:absolute;left:5px;top:1px}
li.now i{background:#D9A21B;border-color:#D9A21B;box-shadow:0 0 0 5px rgba(217,162,27,.2)}li.done:before{background:#127A3E}
li strong{display:block;color:#13254F}li span{font-size:.9rem;color:#4A5568}li.todo strong{color:#8A94A6}
.btn{display:block;text-align:center;margin-top:14px;background:#D9A21B;color:#13254F;font-weight:800;border-radius:12px;padding:14px;text-decoration:none}
.btn2{background:#13254F;color:#fff}.btn3{background:#fff;color:#13254F;border:2px solid #13254F}
.share,.rv{border:1px solid #E1E6EF;border-radius:12px;padding:14px;margin-top:16px}.share input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #C8D0DC;border-radius:8px;font:inherit}
.stars{display:flex;gap:6px;font-size:30px}.stars button{background:none;border:0;cursor:pointer;color:#C8D0DC;font-size:30px;padding:0}.stars button.on{color:#D9A21B}
.rv textarea{width:100%;box-sizing:border-box;min-height:80px;padding:10px;border:1px solid #C8D0DC;border-radius:8px;font:inherit;margin:8px 0}.promise{font-size:.88rem;color:#4A5568;border-top:1px solid #E1E6EF;margin-top:18px;padding-top:12px}
${DARK_PAGE_CSS}</style><script src="/assets/theme.js"></script></head>
<body><div class="w"><div class="c"><div class="logo"><span class="ln">SI</span><b>RR</b><span class="ln">A</span><b>DD</b><span class="ln">O</span></div><div class="sub">GLOBAL LIMITED</div>
${body}</div><p class="muted" style="text-align:center">${COMPANY.name} · ${COMPANY.rc}</p></div></body></html>`);
}

// After delivery: stars, a comment and an optional photo of the design in use. Shown on the site once approved.
function reviewBox(t) {
  return `<form class="rv" id="rv"><b>⭐ How did we do?</b><p class="muted">Your review helps other small businesses find us.</p>
<div class="stars" role="radiogroup" aria-label="Stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</div>
<textarea id="rvt" maxlength="400" placeholder="What did you like? How did customers react?"></textarea>
<label class="muted">Photo of the design in use (optional) <input type="file" id="rvp" accept="image/jpeg,image/png,image/webp"></label>
<a href="#" class="btn" id="rvs">Send review</a><p class="muted" id="rvm"></p></form>
<script>(function(){var n=0,f=document.getElementById('rv'),m=document.getElementById('rvm');
f.querySelectorAll('.stars button').forEach(function(b){b.onclick=function(){n=+b.dataset.n;f.querySelectorAll('.stars button').forEach(function(x){x.classList.toggle('on',+x.dataset.n<=n);});};});
function shrink(file,cb){if(!file)return cb('');var i=new Image();i.onload=function(){var k=Math.min(1,1400/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);cb(c.toDataURL('image/jpeg',.85));};i.onerror=function(){cb('');};i.src=URL.createObjectURL(file);}
document.getElementById('rvs').onclick=function(e){e.preventDefault();if(!n){m.textContent='Please tap the stars first.';return;}m.textContent='Sending…';
shrink(document.getElementById('rvp').files[0],function(photo){fetch('/api/order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'review',t:${JSON.stringify(t)},stars:n,text:document.getElementById('rvt').value,photo:photo})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Could not send.');});}).then(function(){f.innerHTML='<b>🙏 Thank you!</b><p class=muted>Your review has been sent.</p>';}).catch(function(x){m.textContent=x.message;});});};})();</script>`;
}

export async function trackPage(req, res) {
  const t = String((req.query || {}).t || "").slice(0, 100);
  const row = t ? await getByDocToken(t).catch(() => null) : null;
  if (!row) return page(res, 404, `<h1>Order not found</h1><p class="muted">Please check the link, or <a href="https://wa.me/2348167550937">message us on WhatsApp</a>.</p>`);
  const stage = stageOf(row);
  const at = STAGE_KEYS.indexOf(stage);
  const today = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);
  const late = row.deliver_by && stage !== "done" && today > row.deliver_by;
  const steps = JOB_STAGES.map(([k, title, text], i) =>
    `<li class="${i < at || stage === "done" ? "done" : i === at ? "now" : "todo"}"><i></i><strong>${esc(title)}</strong>${i === at ? `<span>${esc(text)}</span>` : ""}</li>`).join("");
  const dueObj = !(row.payments || []).length ? amountDue(row, "deposit") : null;
  const due = dueObj?.amount || 0;
  const pay = due > 0 && paystackConfigured() ? payLink(row, "deposit") : "";
  const ref = reference(row.id);
  const wa = `https://wa.me/2348167550937?text=${encodeURIComponent(`Hi, I'm asking about my order ${ref} (${row.interest}).`)}`;
  page(res, 200, `<h1>${esc(row.interest)}</h1><p class="muted">Order ${esc(ref)} · ${esc(row.name)}</p>
${row.deliver_by ? `<div class="due${late ? " late" : ""}"><div>📅</div><div>${stage === "done" ? "Promised by" : late ? "Running late. Promised by" : "Promised by"} <b>${esc(nice(row.deliver_by))}</b></div></div>` : (row.payments || []).length ? "" : `<div class="due"><div>💳</div><div>We start as soon as it's paid${due > 0 ? `: <b>${esc(naira(due))}</b>` : ""}.</div></div>`}
<ol>${steps}</ol>
${pay ? `<a class="btn" href="${esc(pay)}">Pay ${esc(naira(due))} now</a>` : ""}
<a class="btn btn2" href="${esc(wa)}">Message us on WhatsApp</a>
${stage === "done" ? reviewBox(t) : ""}
${(row.payments || []).length ? `<div class="share"><b>🎁 Share and save</b><p class="muted">Send this link to a friend: they get ₦1,000 off their first design, and you get ₦1,000 off your next one.</p>
<input readonly value="https://www.sirraddo.com.ng/design?ref=${esc(ref)}" onclick="this.select()">
<a class="btn btn2" href="https://wa.me/?text=${encodeURIComponent(`I get my flyers and designs from SIRRADDO. Use my link for ₦1,000 off your first design: https://www.sirraddo.com.ng/design?ref=${ref}`)}">Share on WhatsApp</a></div>` : ""}
<a class="btn btn3" href="/design?again=${esc(t)}#order-title">🔁 Order again with the same details</a>
<p class="promise">⏱️ ${esc(ON_TIME_PROMISE)} Bookmark this page to check your order any time.</p>`);
}
