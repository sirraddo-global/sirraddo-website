// /pay?t=DOC_TOKEN[&for=deposit|balance|renewal] — the customer's "Pay online" page (rewritten here in vercel.json).
//   GET            -> what is due, an email box, and a "Pay with Paystack" button
//   GET &reference -> Paystack sends the customer back here: we verify, record and say thank you
//   POST { t, for, email } -> starts the Paystack checkout and returns its URL
import { getByDocToken, updateRequest, esc } from "./_lib/store.mjs";
import { amountDue, paystackConfigured, startPayment, verifyPayment, recordPayment } from "./_lib/paystack.mjs";
import { naira, COMPANY } from "./_lib/docs.mjs";
import { DARK_PAGE_CSS } from "./_lib/darkcss.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function page(res, code, title, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${esc(title)} · SIRRADDO</title>
<style>body{margin:0;background:#F5F7FB;font-family:Inter,system-ui,Arial,sans-serif;color:#1B2433;line-height:1.5}
.w{max-width:480px;margin:0 auto;padding:20px 16px}.c{background:#fff;border:1px solid #E1E6EF;border-radius:16px;padding:22px}
.logo{font-weight:900;font-size:26px;letter-spacing:-1px}.ln{color:#13254F}.logo b{color:#D9A21B}.sub{font-weight:700;font-size:9px;letter-spacing:5px;color:#13254F;margin:2px 0 18px}
h1{color:#13254F;font-size:1.4rem;margin:0 0 6px}.amt{font-size:2rem;font-weight:800;color:#13254F;margin:6px 0 14px}
label{display:block;font-weight:600;margin:12px 0 6px}input{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:1px solid #C8D0DC;border-radius:10px}
button,.btn{display:block;width:100%;box-sizing:border-box;text-align:center;margin-top:16px;background:#D9A21B;color:#13254F;font:inherit;font-weight:800;border:0;border-radius:12px;padding:14px;cursor:pointer;text-decoration:none}
.muted{color:#4A5568;font-size:.9rem}.err{color:#B42318;font-weight:600;min-height:1.2em}.ok{color:#127A3E}
${DARK_PAGE_CSS}</style><script src="/assets/theme.js"></script></head>
<body><div class="w"><div class="c"><div class="logo"><span class="ln">SI</span><b>RR</b><span class="ln">A</span><b>DD</b><span class="ln">O</span></div><div class="sub">GLOBAL LIMITED</div>
${body}</div><p class="muted" style="text-align:center">${COMPANY.name} · ${COMPANY.rc} · <a href="https://wa.me/2348167550937">WhatsApp us</a></p></div></body></html>`);
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === "object" ? body : {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);

  if (req.method === "POST") {
    const body = readBody(req);
    try {
      if (!paystackConfigured()) return res.status(503).json({ error: "Online payment isn't available yet. Please pay by bank transfer." });
      const r = await getByDocToken(String(body.t || ""));
      if (!r) return res.status(404).json({ error: "This link is not valid" });
      const due = amountDue(r, ["deposit", "balance", "renewal"].includes(body.for) ? body.for : "");
      if (!due) return res.status(409).json({ error: "There is nothing to pay on this link right now" });
      const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
      if (!EMAIL.test(email)) return res.status(400).json({ error: "Please enter a valid email address for your receipt" });
      if (!r.email) await updateRequest(r.id, { email }).catch(() => {}); // keep it for receipts
      return res.status(200).json({ url: await startPayment(r, due, email) });
    } catch (err) {
      console.error("pay start failed", err);
      return res.status(502).json({ error: "We couldn't open Paystack just now. Please try again in a minute." });
    }
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = String(query.t || "");
    const r = await getByDocToken(token);
    if (!r) return page(res, 404, "Link not valid", `<h1>This link is not valid</h1><p>Please ask us for a new payment link on WhatsApp.</p>`);

    // Back from Paystack
    const ref = String(query.reference || query.trxref || "");
    if (ref) {
      let tx = null;
      try { tx = paystackConfigured() ? await verifyPayment(ref) : null; } catch (e) { console.error("verify failed", ref, e); }
      if (tx?.status === "success" && Number(tx.metadata?.request_id) === r.id) {
        await recordPayment(tx);
        return page(res, 200, "Payment received", `<h1 class="ok">Payment received. Thank you!</h1>
<p>We received <b>${naira(Math.round(tx.amount / 100))}</b>. ${r.email || tx.customer?.email ? "Your receipt is on its way to your email." : ""}</p>
<a class="btn" href="/doc?t=${encodeURIComponent(token)}&type=receipt">View my receipt</a>
<p class="muted">Paystack reference: ${esc(ref)}</p>`);
      }
      return page(res, 200, "Payment not completed", `<h1>Payment not completed</h1><p>${tx ? "Paystack says this payment was " + esc(tx.status || "not successful") + "." : "We couldn't confirm this payment yet."} If money left your account, don't worry: message us on WhatsApp with this reference and we'll sort it out.</p>
<p class="muted">Reference: ${esc(ref)}</p><a class="btn" href="/pay?t=${encodeURIComponent(token)}">Try again</a>`);
    }

    if (!paystackConfigured()) return page(res, 503, "Pay by transfer", `<h1>Online payment is coming soon</h1><p>For now, please pay by bank transfer using the details on your invoice.</p><a class="btn" href="/doc?t=${encodeURIComponent(token)}&type=invoice">View my invoice</a>`);
    const want = ["deposit", "balance", "renewal"].includes(query.for) ? query.for : "";
    const due = amountDue(r, want) || (want ? amountDue(r) : null);
    if (!due) return page(res, 200, "Nothing to pay", `<h1>Nothing to pay right now</h1><p>Thank you, ${esc(String(r.name).split(" ")[0])}. There is no payment due on this link.</p><a class="btn" href="/doc?t=${encodeURIComponent(token)}&type=receipt">View my receipts</a>`);
    return page(res, 200, "Pay online", `<h1>Pay ${COMPANY.name}</h1>
<p class="muted">${esc(r.name)}${r.business ? " · " + esc(r.business) : ""}</p>
<p style="margin:14px 0 0">${esc(due.label)}</p><div class="amt">${naira(due.amount)}</div>
<form id="f"><label for="e">Email for your receipt</label><input id="e" type="email" required autocomplete="email" value="${esc(r.email || "")}" placeholder="you@example.com">
<button type="submit">Pay ${naira(due.amount)} with Paystack</button><p class="err" id="m" role="alert"></p></form>
<p class="muted">Card, bank transfer, USSD or bank app, on Paystack's secure page. See our <a href="/terms#payments-refunds">refund policy</a>.</p>
<script>document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var b=this.querySelector('button'),m=document.getElementById('m');b.disabled=true;b.textContent='Opening Paystack…';m.textContent='';
fetch('/api/pay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:${JSON.stringify(token)},for:${JSON.stringify(due.for)},email:document.getElementById('e').value})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Error');return j})}).then(function(j){location.href=j.url})
.catch(function(err){m.textContent=err.message;b.disabled=false;b.textContent='Pay ${naira(due.amount)} with Paystack'});});</script>`);
  } catch (err) {
    console.error("pay page failed", err);
    return page(res, 500, "Error", `<h1>Something went wrong</h1><p>Please try again, or message us on WhatsApp.</p>`);
  }
}
