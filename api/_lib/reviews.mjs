// Customer reviews on customers' websites: a visitor gives 1–5 stars, their name and a short review.
// Nothing shows until the business owner ticks "Show on website" in Manage my store (no fake or abusive reviews
// go up by themselves). Saving there republishes their site on Cloudflare, so the site stays static and free.
import { createHash } from "node:crypto";
import { q, ensureSchema, getRequest, sendCustomerEmail, customerEmailConfigured, customerEmail, sendEmail, reference, esc } from "./store.mjs";
import { siteForKey } from "./stats.mjs";

export const MAX_SHOWN = 60;
// Reviews of SIRRADDO itself (on www.sirraddo.com.ng) use request_id 0 and are approved in admin → Settings → Reviews.
export const OUR_ID = 0;
export const OUR_KEY = "sirraddo";
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const STATUSES = new Set(["pending", "shown", "hidden"]);
export const starsText = (n) => "★".repeat(n) + "☆".repeat(5 - n);

// Returns { ok } or { error } (a message the visitor can read).
export async function addReview(input, { ip, ua }) {
  if (clean(input.website, 100)) return { ok: true }; // the hidden box only robots fill in
  const site = input.k === OUR_KEY ? { id: OUR_ID } : await siteForKey(input.k);
  if (!site) return { error: "This website can't take reviews right now." };
  const stars = Number(input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: "Please tap the stars to give a rating." };
  const name = clean(input.name, 50);
  if (name.length < 2) return { error: "Please write your name." };
  const text = clean(input.text, 600);
  if (/https?:\/\/|www\./i.test(text + " " + name)) return { error: "Please leave out links." };
  await ensureSchema();
  const who = createHash("sha256").update(`${process.env.CRON_SECRET || "sgl"}|${ip}|${ua}`).digest("base64url").slice(0, 16);
  const [{ mine, waiting }] = await q(`SELECT count(*) FILTER (WHERE who = $2 AND created_at > now() - interval '1 day')::int AS mine,
    count(*) FILTER (WHERE status = 'pending')::int AS waiting FROM site_reviews WHERE request_id = $1`, [site.id, who]);
  if (mine >= 3) return { error: "Thank you, we already have your review." };
  if (waiting >= 50) return { error: "Thank you! The business is checking reviews; please try again in a few days." };
  const [row] = await q(`INSERT INTO site_reviews (request_id, name, stars, body, who) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [site.id, name, stars, text, who]);
  await tellOwner(site.id, { name, stars, text }).catch((e) => console.error("review email failed", e));
  return { ok: true, id: row.id };
}

async function tellOwner(id, rv) {
  if (id === OUR_ID) {
    const { SITE_URL } = await import("../../site.config.mjs");
    return sendEmail(`New ${rv.stars}-star review for SIRRADDO from ${rv.name}`, `<p><b style="color:#B7791F">${starsText(rv.stars)}</b><br><b>${esc(rv.name)}</b>${rv.text ? `<br>${esc(rv.text)}` : ""}</p>
<p>It shows on your website once you choose <b>Show on website</b> in <a href="${SITE_URL}/admin">Admin → Settings → Reviews</a>.</p>`);
  }
  const r = await getRequest(id);
  if (!r) return;
  const { manageLink, manageTitle } = await import("./manage.mjs");
  const link = (await manageLink(id))?.url;
  const html = `<p>Hello ${esc(String(r.name || "").split(" ")[0] || "there")},</p>
<p>Someone left a review on your website:</p>
<blockquote style="border-left:4px solid #D9A21B;margin:0;padding:8px 12px;background:#FFF8E6"><b style="color:#B7791F">${starsText(rv.stars)}</b><br><b>${esc(rv.name)}</b>${rv.text ? `<br>${esc(rv.text)}` : ""}</blockquote>
<p>It shows on your website once you choose <b>Show on website</b> in ${manageTitle(r)} and tap Save. If it isn't genuine or is rude, choose <b>Hide</b>.</p>
${link ? `<p><a href="${esc(link)}" style="display:inline-block;background:#13254F;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:700">Open ${manageTitle(r)}</a></p>` : ""}`;
  const to = customerEmail(r);
  if (to && customerEmailConfigured()) await sendCustomerEmail(to, `New ${rv.stars}-star review on your website`, html);
  else await sendEmail(`New review for ${r.business || r.name} (${reference(id)}): ${rv.stars} stars`, html + "<p>(The customer has no email on file, so this came to you.)</p>");
}

// For Manage my store: newest first, waiting ones on top.
export async function listReviews(id, limit = 40) {
  await ensureSchema();
  return q(`SELECT id, name, stars, body, status, created_at FROM site_reviews WHERE request_id = $1
    ORDER BY (status = 'pending') DESC, created_at DESC LIMIT $2`, [id, limit]);
}

// What the website shows.
export async function shownReviews(id) {
  await ensureSchema();
  const rows = await q(`SELECT name, stars, body, created_at FROM site_reviews WHERE request_id = $1 AND status = 'shown' ORDER BY created_at DESC LIMIT $2`, [id, MAX_SHOWN]);
  const [{ n, avg }] = await q(`SELECT count(*)::int AS n, COALESCE(avg(stars), 0)::float AS avg FROM site_reviews WHERE request_id = $1 AND status = 'shown'`, [id]);
  return { list: rows.map((x) => ({ name: x.name, stars: x.stars, text: x.body, date: new Date(x.created_at).toISOString().slice(0, 10) })), count: n, average: Math.round(avg * 10) / 10 };
}

// Removes a review for good (e.g. the person asked us to). Returns true if one was removed.
export async function deleteReview(requestId, reviewId) {
  await ensureSchema();
  const rows = await q(`DELETE FROM site_reviews WHERE request_id = $1 AND id = $2 RETURNING id`, [requestId, Number(reviewId)]);
  return rows.length > 0;
}

// wanted = { reviewId: "shown" | "hidden" | "pending" }. Returns the change lines.
export async function setReviewStatuses(id, wanted) {
  const ids = Object.keys(wanted || {}).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return [];
  await ensureSchema();
  const rows = await q(`SELECT id, name, stars, status FROM site_reviews WHERE request_id = $1 AND id = ANY($2::int[])`, [id, ids]);
  const changes = [];
  for (const r of rows) {
    const to = wanted[r.id];
    if (!STATUSES.has(to) || to === r.status || to === "pending") continue;
    await q(`UPDATE site_reviews SET status = $1 WHERE id = $2`, [to, r.id]);
    changes.push(`Review from ${r.name} (${r.stars}★): ${to === "shown" ? "shown on the website" : "hidden"}`);
  }
  return changes;
}
