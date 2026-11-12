// /preview?t=TOKEN&p=PAGE — the customer's website preview, built from their project form and the
// website text you checked in admin. (/preview is rewritten here in vercel.json.)
//   GET  -> the page, with a panel to approve it or ask for changes
//   POST { t, action: "approved" | "changes", text } -> saves the answer and tells you by email.
// On approval, the balance invoice is emailed to the customer automatically (once).
import {
  getByPreviewToken, setPreviewResult, ensureDocToken, getSettings, markSent, sendEmail, emailConfigured,
  sendCustomerEmail, customerEmailConfigured, customerEmail, reference, esc,
} from "./_lib/store.mjs";
import { buildSiteModel, renderPage } from "./_lib/sitegen.mjs";
import { buildDoc, balance, naira } from "./_lib/docs.mjs";
import { SITE, customerHtml } from "./_lib/automation.mjs";
import { payButton } from "./_lib/paystack.mjs";

function message(res, code, text) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Website preview</title><div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1B2433">
<h1 style="color:#13254F">${esc(text)}</h1><p>Please ask SIRRADDO for a new link on <a href="https://wa.me/2348167550937">WhatsApp</a>.</p></div>`);
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === "object" ? body : {};
}

const posts = new Map(); // token -> recent post times (a simple brake on repeated taps)

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);

  if (req.method === "POST") {
    const body = readBody(req);
    const token = String(body.t || "");
    const action = body.action === "approved" ? "approved" : body.action === "changes" ? "changes" : null;
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 3000) : "";
    if (!action) return res.status(400).json({ error: "Unknown action" });
    if (action === "changes" && !text) return res.status(400).json({ error: "Please write what you'd like changed" });
    const now = Date.now();
    const recent = (posts.get(token) || []).filter((t) => now - t < 3600_000);
    if (recent.length >= 10) return res.status(429).json({ error: "Too many messages. Please message us on WhatsApp" });
    recent.push(now);
    posts.set(token, recent);
    try {
      const before = await getByPreviewToken(token);
      if (!before) return res.status(404).json({ error: "This link is not valid" });
      if (before.preview_status === "approved" && action === "approved") return res.status(200).json({ ok: true, message: "Already approved. Thank you!" });
      const row = await setPreviewResult(token, action, text);
      const ref = reference(row.id);
      if (emailConfigured()) {
        await sendEmail(
          action === "approved" ? `✅ ${row.name} approved their website (${ref})` : `✏️ ${row.name} asked for changes (${ref})`,
          `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
            <p><b>${esc(row.name)}</b> (${esc(row.interest)}, ${ref}) ${action === "approved" ? "approved the website preview." : "asked for changes to the website preview:"}</p>
            ${text ? `<blockquote style="border-left:4px solid #D9A21B;margin:0;padding:8px 12px;background:#FFF8E6">${esc(text).replace(/\n/g, "<br>")}</blockquote>` : ""}
            <p>${action === "approved" ? `Balance: ${naira(balance(row))}. Once it is paid, put the site live and send the handover pack from admin.` : "Edit the website text in admin, then send the preview link again."}</p>
            <p><a href="${SITE}/preview?t=${encodeURIComponent(token)}">Open the preview</a> · <a href="${SITE}/admin">Open admin</a></p></div>`
        ).catch((e) => console.error("preview notify failed", e));
      }
      let message = action === "approved"
        ? "Thank you! You approved your website. We'll be in touch about going live."
        : "Thank you! We've received your changes and will send an updated preview.";
      // Approved with a balance still to pay: email the invoice once.
      const bal = balance(row);
      const to = customerEmail(row);
      if (action === "approved" && bal > 0 && to && customerEmailConfigured() && !row.auto_sent?.balance_invoice) {
        try {
          const withDoc = (await ensureDocToken(row.id)) || row;
          const doc = buildDoc(withDoc, "invoice", await getSettings());
          if (!doc.error) {
            const link = `${SITE}/doc?t=${withDoc.doc_token}&type=invoice`;
            await sendCustomerEmail(to, `Your website is approved: balance invoice ${doc.number}`,
              customerHtml(row, [
                "Thank you for approving your website design!",
                `To put it live on your domain, please pay the balance of <b>${naira(bal)}</b>. Your invoice is below, and you can also <a href="${link}">view, print or save it as a PDF</a>.`,
                "As soon as the payment is confirmed we put the site live and send you everything you need to manage it.",
              ]) + payButton(withDoc) + doc.html);
            await markSent(row.id, "balance_invoice");
            message = `Thank you! You approved your website. We've emailed your balance invoice (${naira(bal)}) to ${to}.`;
          }
        } catch (e) {
          console.error("balance invoice email failed", e);
        }
      }
      return res.status(200).json({ ok: true, message });
    } catch (err) {
      console.error("preview post failed", err);
      return res.status(500).json({ error: "Something went wrong" });
    }
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const token = String(query.t || "");
    const row = await getByPreviewToken(token);
    if (!row) return message(res, 404, "This preview link is not valid");
    if (!row.draft_md) return message(res, 404, "This preview is not ready yet");
    const site = buildSiteModel(row);
    const link = (slug) => `/preview?t=${encodeURIComponent(token)}${slug === "index" ? "" : "&p=" + encodeURIComponent(slug)}`;
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(renderPage(site, String(query.p || "index"), { mode: "preview", link, row, token }));
  } catch (err) {
    console.error("preview failed", err);
    return message(res, 500, "Something went wrong");
  }
}
