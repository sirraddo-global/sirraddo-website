// Customer reviews on customers' websites: a visitor gives 1–5 stars, their name and a short review.
// Nothing shows until the business owner ticks "Show on website" in Manage my store (no fake or abusive reviews
// go up by themselves). Saving there republishes their site on Cloudflare, so the site stays static and free.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { q, ensureSchema, getRequest, sendCustomerEmail, customerEmailConfigured, customerEmail, sendEmail, reference, esc } from "./store.mjs";
import { siteForKey } from "./stats.mjs";
import { putFile, filesEnabled } from "./platform.mjs";

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

export async function tellOwner(id, rv) {
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

// A review of one product from a signed-in buyer of a Standard Store. Only someone who bought it (paid, or paid on
// delivery and delivered) can review it, so every product review is from a real customer ("Verified buyer").
export async function addProductReview(requestId, buyer, input) {
  await ensureSchema();
  const i = Number(input?.i);
  const stars = Number(input?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error("Please tap the stars to give a rating.");
  const text = clean(input?.text, 600);
  if (/https?:\/\/|www\./i.test(text)) throw new Error("Please leave out links.");
  const [bought] = await q(`SELECT l->>'name' AS name FROM store_orders o, jsonb_array_elements(o.items) l WHERE o.request_id = $1 AND o.buyer_id = $2 AND (l->>'i')::int = $3
    AND (o.status = 'paid' OR (o.status = 'cod' AND o.delivered_at IS NOT NULL)) LIMIT 1`, [requestId, buyer.id, i]);
  if (!bought) throw new Error("Only customers who bought this product can review it. Thank you!");
  const [dup] = await q(`SELECT id FROM site_reviews WHERE request_id = $1 AND buyer_id = $2 AND product_i = $3`, [requestId, buyer.id, i]);
  if (dup) throw new Error("You've already reviewed this product. Thank you!");
  const parts = String(buyer.name || "Customer").trim().split(/\s+/);
  const name = clean(parts[0] + (parts[1] ? " " + parts[1][0] + "." : ""), 50);
  const product = String(bought.name || "").replace(/\s*\([^)]*\)\s*$/, "");
  const [row] = await q(`INSERT INTO site_reviews (request_id, name, stars, body, who, product_i, product, buyer_id, verified) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true) RETURNING id`,
    [requestId, name, stars, text, "buyer:" + buyer.id, i, product, buyer.id]);
  await tellOwner(requestId, { name: `${name} (verified buyer of ${product})`, stars, text }).catch((e) => console.error("review email failed", e));
  return { ok: true, id: row.id };
}

// For Manage my store: newest first, waiting ones on top.
export async function listReviews(id, limit = 40) {
  await ensureSchema();
  return q(`SELECT id, name, stars, body, status, created_at, product, verified, client_id, business, photo FROM site_reviews WHERE request_id = $1
    ORDER BY (status = 'pending') DESC, created_at DESC LIMIT $2`, [id, limit]);
}

// What the website shows.
export async function shownReviews(id) {
  await ensureSchema();
  const rows = await q(`SELECT name, stars, body, created_at, product_i, product, verified, client_id, business, photo FROM site_reviews WHERE request_id = $1 AND status = 'shown' ORDER BY (client_id IS NOT NULL) DESC, created_at DESC LIMIT $2`, [id, MAX_SHOWN]);
  const [{ n, avg }] = await q(`SELECT count(*)::int AS n, COALESCE(avg(stars), 0)::float AS avg FROM site_reviews WHERE request_id = $1 AND status = 'shown'`, [id]);
  return { list: rows.map((x) => ({ name: x.name, stars: x.stars, text: x.body, date: new Date(x.created_at).toISOString().slice(0, 10), ...(x.product_i !== null && x.product_i !== undefined ? { i: x.product_i, product: x.product || "", verified: Boolean(x.verified) } : {}),
    ...(x.client_id ? { client: true, business: x.business || "", photo: x.photo || "" } : {}) })), count: n, average: Math.round(avg * 10) / 10 };
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

// ---------- Testimonials from our own clients ----------
// After a website goes live, the client gets a personal link (/rate?t=…) to rate SIRRADDO, with their business name
// and an optional photo. It goes into the same list as other reviews of SIRRADDO (request_id 0), marked as a
// verified client, and waits for your OK in admin → Settings → Reviews. One per client: sending again replaces it.
const reviewSecret = () => process.env.CRON_SECRET || process.env.ADMIN_PASSWORD || "sirraddo-reviews";
const sign = (id) => createHmac("sha256", reviewSecret()).update(`client-review:${id}`).digest("base64url").slice(0, 20);
export const clientReviewToken = (id) => `${id}.${sign(id)}`;
export async function clientReviewUrl(id) {
  const { SITE_URL } = await import("../../site.config.mjs");
  return `${SITE_URL}/rate?t=${clientReviewToken(id)}`;
}
export function clientIdFromToken(token) {
  const m = /^(\d{1,9})\.([\w-]{20})$/.exec(String(token || ""));
  if (!m) return null;
  const a = Buffer.from(m[2]), b = Buffer.from(sign(Number(m[1])));
  return a.length === b.length && timingSafeEqual(a, b) ? Number(m[1]) : null;
}
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
export const MAX_PHOTO_BYTES = 350_000;

// What the review page needs to greet the client. null = not a valid link.
export async function clientReviewInfo(token) {
  const id = clientIdFromToken(token);
  if (!id) return null;
  const r = await getRequest(id);
  if (!r || r.status !== "won") return null;
  await ensureSchema();
  const [mine] = await q(`SELECT stars, body, business, status FROM site_reviews WHERE request_id = $1 AND client_id = $2 ORDER BY id DESC LIMIT 1`, [OUR_ID, id]);
  return { name: String(r.name || "").split(" ")[0], full: String(r.name || ""), business: r.business || "", website: r.website_url || "", done: Boolean(mine), mine: mine ? { stars: mine.stars, text: mine.body, business: mine.business } : null };
}

// Returns { ok } or { error }.
export async function addClientReview(token, input) {
  const id = clientIdFromToken(token);
  const r = id ? await getRequest(id) : null;
  if (!r || r.status !== "won") return { error: "This review link isn't valid. Please ask us for a new one." };
  const stars = Number(input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { error: "Please tap the stars to give a rating." };
  const name = clean(input.name || r.name, 50);
  if (name.length < 2) return { error: "Please write your name." };
  const text = clean(input.text, 600);
  if (text.length < 10) return { error: "Please write a sentence or two about working with us." };
  if (/https?:\/\/|www\./i.test(text + " " + name)) return { error: "Please leave out links." };
  if (input.consent !== true) return { error: "Please tick the box to let us show your review." };
  const business = clean(input.business ?? r.business, 80);
  let photo = null;
  if (input.photo) {
    const m = PHOTO_RE.exec(String(input.photo));
    if (!m) return { error: "That photo couldn't be read. Please try a JPG or PNG." };
    const bytes = Buffer.from(m[2], "base64");
    if (bytes.length > MAX_PHOTO_BYTES) return { error: "That photo is too large. Please choose a smaller one." };
    if (filesEnabled()) photo = (await putFile(`reviews/${id}/photo.${m[1] === "jpeg" ? "jpg" : m[1]}`, bytes, { contentType: `image/${m[1]}` })).url;
  }
  await ensureSchema();
  const [old] = await q(`SELECT id, photo FROM site_reviews WHERE request_id = $1 AND client_id = $2 ORDER BY id DESC LIMIT 1`, [OUR_ID, id]);
  if (old) {
    await q(`UPDATE site_reviews SET name = $1, stars = $2, body = $3, business = $4, photo = $5, status = 'pending', created_at = now() WHERE id = $6`,
      [name, stars, text, business, photo || (input.keepPhoto ? old.photo : null), old.id]);
  } else {
    await q(`INSERT INTO site_reviews (request_id, name, stars, body, who, verified, client_id, business, photo) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)`,
      [OUR_ID, name, stars, text, `client-${id}`, id, business, photo]);
  }
  await tellOwner(OUR_ID, { name: `${name}${business ? ` (${business})` : ""}, your client ${reference(id)}`, stars, text }).catch((e) => console.error("review email failed", e));
  return { ok: true };
}
