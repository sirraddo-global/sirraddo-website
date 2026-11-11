// GET /doc?t=TOKEN&type=receipt|invoice|renewal — the customer's invoice or receipt as a web page
// they can open from WhatsApp or email, print, or save as PDF. (/doc is rewritten here in vercel.json.)
import { getByDocToken, getSettings, esc } from "./_lib/store.mjs";
import { buildDoc, docPage, DOC_TYPES } from "./_lib/docs.mjs";

function message(res, code, text) {
  res.statusCode = code;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>SIRRADDO GLOBAL LIMITED</title><div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1B2433">
<h1 style="color:#13254F">${esc(text)}</h1><p>Please ask us for a new link on <a href="https://wa.me/2348167550937">WhatsApp</a>.</p></div>`);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Referrer-Policy", "no-referrer");
  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const type = DOC_TYPES.includes(query.type) ? query.type : "receipt";
  try {
    const r = await getByDocToken(String(query.t || ""));
    if (!r) return message(res, 404, "This link is not valid");
    const doc = buildDoc(r, type, await getSettings());
    if (doc.error) return message(res, 404, "This document is not ready yet");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(docPage(doc, r));
  } catch (err) {
    console.error("doc failed", err);
    return message(res, 500, "Something went wrong");
  }
}
