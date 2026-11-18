// Admin → Marketing: offers, referrals, ad spend, AI captions, and the data the picture maker uses
// (showcase posts of live client sites, review cards, festive pictures). The pictures themselves are drawn in
// the browser (assets/admin.js) so nothing heavy runs here.
import QRCode from "qrcode";
import { q, ensureSchema, getMeta, setMeta, getRequest, updateRequest, getSettings, cleanFrom } from "./store.mjs";
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { themeFor, buildSiteModel, productPhotoFor } from "./sitegen.mjs";
import { kindFor } from "./brief-schema.mjs";
import { shownReviews, listReviews, OUR_ID } from "./reviews.mjs";
import { FUNCTION_BUDGET_MS } from "./platform.mjs";

export const SITE_LINK = "https://www.sirraddo.com.ng/websites";
const lagosToday = (now = new Date()) => new Date(now.getTime() + 3600 * 1000).toISOString().slice(0, 10);
const one = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// ---------- QR codes (SVG) for the picture maker ----------
export async function qrSvg(tag, src = "qr") {
  const t = cleanFrom(tag)?.replace(/[^a-z0-9-]/g, "-") || "ad";
  const url = `${SITE_LINK}?utm_source=${encodeURIComponent(src)}&utm_campaign=${encodeURIComponent(t)}`;
  return { url, svg: await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#13244F", light: "#FFFFFF" } }) };
}

// ---------- Offer (website banner with a countdown, ad pictures, and the chat knows it) ----------
export async function getOffer() {
  try { return JSON.parse((await getMeta(["offer"])).offer || "null"); } catch { return null; }
}
export async function saveOffer(input) {
  if (input?.remove) { await setMeta("offer", "null"); return null; }
  const o = {
    on: input.on !== false,
    title: one(input.title, 80),
    text: one(input.text, 200),
    until: /^\d{4}-\d{2}-\d{2}$/.test(String(input.until || "")) ? String(input.until) : "",
    tag: cleanFrom(input.tag || input.title)?.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "offer",
  };
  if (!o.title) throw new Error("Give the offer a title, e.g. ₦10,000 off Business websites");
  if (!o.until) throw new Error("Choose the last day of the offer");
  if (o.until < lagosToday()) throw new Error("The last day is already past");
  await setMeta("offer", JSON.stringify(o));
  return o;
}
// The offer while it runs (until the end of its last day in Lagos), or null.
export async function currentOffer(now = new Date()) {
  const o = await getOffer().catch(() => null);
  if (!o?.on || !o.title || !o.until || o.until < lagosToday(now)) return null;
  return { title: o.title, text: o.text, until: o.until, ends: `${o.until}T23:59:59+01:00`, tag: o.tag };
}

// ---------- Referrals ----------
export const DEFAULT_REWARD = "₦5,000 off your next renewal";
const refCodeFor = (r) => (String(r.business || r.brief?.business_name || r.name || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase() || "SGL") + r.id;
export async function ensureRefCode(id) {
  await ensureSchema();
  const r = await getRequest(id);
  if (!r) return null;
  if (r.ref_code) return r.ref_code;
  const code = refCodeFor(r);
  await q(`UPDATE customer_requests SET ref_code = $1 WHERE id = $2 AND ref_code IS NULL`, [code, id]);
  return (await getRequest(id)).ref_code;
}
export const refLink = (code) => `${SITE_LINK}?ref=${encodeURIComponent(code)}`;
export async function rewardText() { return (await getSettings()).referral_reward || DEFAULT_REWARD; }
// Everyone who came from this customer's link, and how many paid.
export async function referralInfo(id) {
  const code = await ensureRefCode(id);
  if (!code) return null;
  const r = await getRequest(id);
  const list = await q(`SELECT id, name, business, interest, status, quote_amount, created_at FROM customer_requests WHERE came_from = $1 AND id <> $2 ORDER BY created_at DESC LIMIT 50`, ["referral:" + code.toLowerCase(), id]);
  const paid = list.filter((x) => x.status === "won").length;
  return { code, link: refLink(code), list, paid, used: r.ref_used || 0, reward: await rewardText() };
}
export async function useReward(id, n) {
  await ensureSchema();
  const rows = await q(`UPDATE customer_requests SET ref_used = GREATEST(0, COALESCE(ref_used, 0) + $1) WHERE id = $2 RETURNING ref_used`, [n >= 0 ? 1 : -1, id]);
  return rows[0]?.ref_used ?? 0;
}
export async function topReferrers() {
  await ensureSchema();
  return q(`SELECT r.id, r.name, r.business, r.ref_code, count(x.id)::int AS sent, count(x.id) FILTER (WHERE x.status = 'won')::int AS paid
    FROM customer_requests r JOIN customer_requests x ON x.came_from = 'referral:' || lower(r.ref_code)
    WHERE r.ref_code IS NOT NULL GROUP BY r.id ORDER BY paid DESC, sent DESC LIMIT 10`, []);
}

// ---------- Ad spend ----------
export async function listSpend() {
  await ensureSchema();
  return q(`SELECT id, day, platform, tag, amount, note FROM ad_spend ORDER BY day DESC, id DESC LIMIT 300`, []);
}
export async function addSpend(input) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(input.day || "")) ? input.day : lagosToday();
  const amount = Math.round(Number(String(input.amount || "").replace(/[^\d.]/g, "")));
  if (!amount || amount < 1) throw new Error("Type how much you spent, in naira");
  const tag = cleanFrom(input.tag);
  if (!tag) throw new Error("Type the campaign name you used in the ad link (utm_campaign), e.g. ibadan-test");
  await ensureSchema();
  await q(`INSERT INTO ad_spend (day, platform, tag, amount, note) VALUES ($1, $2, $3, $4, $5)`, [day, one(input.platform, 40) || "Other", tag, amount, one(input.note, 200) || null]);
  return listSpend();
}
export async function deleteSpend(id) {
  await ensureSchema();
  await q(`DELETE FROM ad_spend WHERE id = $1`, [Number(id)]);
  return listSpend();
}
// Per campaign: spend, requests whose "came from" mentions the campaign, how many paid, and what they paid.
export async function spendReport() {
  const spend = await listSpend();
  const tags = [...new Set(spend.map((s) => s.tag))];
  const out = [];
  for (const tag of tags) {
    const rows = spend.filter((s) => s.tag === tag);
    const total = rows.reduce((a, s) => a + Number(s.amount), 0);
    const first = rows.map((s) => s.day).sort()[0];
    const reqs = await q(`SELECT status, quote_amount FROM customer_requests WHERE came_from LIKE $1 AND created_at >= $2::date - 1`, ["%" + tag + "%", first]);
    const paid = reqs.filter((x) => x.status === "won");
    const value = paid.reduce((a, x) => a + Number(x.quote_amount || 0), 0);
    out.push({ tag, platforms: [...new Set(rows.map((s) => s.platform))].join(", "), spend: total, leads: reqs.length, paid: paid.length, value,
      perLead: reqs.length ? Math.round(total / reqs.length) : null, perPaid: paid.length ? Math.round(total / paid.length) : null, since: first });
  }
  return out.sort((a, b) => b.spend - a.spend);
}

// ---------- Data for the picture maker ----------
// Live client websites (for "We built this" posts). Only ones the customer agreed to are ready to post.
export async function showcaseList() {
  await ensureSchema();
  return q(`SELECT id, name, business, interest, website_url, (handover->>'showcase_ok')::boolean AS ok FROM customer_requests
    WHERE status = 'won' AND website_url IS NOT NULL AND website_url <> '' ORDER BY updated_at DESC LIMIT 60`, []);
}
export async function setShowcaseOk(id, ok) {
  const r = await getRequest(id);
  if (!r) throw new Error("Not found");
  await updateRequest(id, { handover: { ...(r.handover || {}), showcase_ok: Boolean(ok) } });
  return showcaseList();
}
const pathOf = (u) => { try { return u ? new URL(u, "https://x").pathname : null; } catch { return null; } };
export async function showcaseData(id) {
  const rows = await q(`SELECT id, name, business, interest, website_url, brief, brief_files, draft_md, design_css, hosting, handover FROM customer_requests WHERE id = $1`, [id]);
  const r = rows[0];
  if (!r) throw new Error("Not found");
  const site = buildSiteModel(r);
  const t = themeFor(r.brief || {});
  const rv = await shownReviews(id).catch(() => ({ count: 0, average: 0 }));
  const hero = site.photos[0] || site.productPhotos[0] || null;
  const products = site.products.slice(0, 4).map((p) => ({ name: p.name, price: p.price, photo: pathOf(productPhotoFor(site, p)?.url) }));
  const sec = site.pages[0]?.sections?.find((s) => s.fields?.headline);
  return {
    ok: Boolean(r.handover?.showcase_ok),
    name: site.name, tagline: site.tagline || sec?.fields?.subheadline || "", headline: sec?.fields?.headline || site.name,
    url: (r.website_url || "").replace(/^https?:\/\//, "").replace(/\/$/, ""), kind: kindFor(r.interest), interest: r.interest,
    primary: t.primary, accent: t.accent, accentText: t.accentText,
    logo: pathOf(site.logo?.url), hero: pathOf(hero?.url), products,
    rating: rv.count ? { average: rv.average, count: rv.count } : null,
  };
}
// Reviews of SIRRADDO itself (from our own website), for review cards.
export async function ourReviews() {
  return (await listReviews(OUR_ID, 60)).filter((x) => x.status === "shown" && x.stars >= 4);
}

// ---------- AI captions ----------
const FACTS = `SIRRADDO GLOBAL LIMITED (RC 9939920), Ibadan, Nigeria builds websites for small businesses.
Packages: Starter website ₦50,000 (up to 5 pages); Business website ₦100,000 (up to 10 pages, Google Maps / Business Profile help); Online Store from ₦150,000 (products, basket, buyers pay online with Paystack straight to the owner's account, orders on WhatsApp too, stock counts).
Every package: free .com.ng domain, hosting, SSL, business email address, works on every phone, live in 7 working days, the customer sees a preview and picks from up to 3 designs before paying the balance (70% to start).
Demo store anyone can try: sirraddodemo.com.ng. WhatsApp: 0816 755 0937. Website: sirraddo.com.ng`;
export const CAPTION_LANGS = ["English", "Nigerian Pidgin", "Yoruba", "Hausa", "Igbo"];
export async function writeCaptions({ topic, lang, platform, link }) {
  const provider = pickProvider();
  if (!provider) throw new Error("No AI key is set in Netlify (GEMINI_API_KEY or ANTHROPIC_API_KEY).");
  const L = CAPTION_LANGS.includes(lang) ? lang : "English";
  const offer = await currentOffer();
  const prompt = `FACTS (use only these; never invent prices, discounts, awards, numbers of customers or promises)
${FACTS}
${offer ? `Current offer: ${offer.title}${offer.text ? ` (${offer.text})` : ""}, until ${offer.until}.` : ""}

Write 3 different social media captions in ${L} for ${one(platform, 40) || "WhatsApp Status, Instagram and Facebook"}, for this post: ${one(topic, 400)}.
Rules: friendly, confident, Nigerian audience; short (under 60 words each); 1–3 emojis; end with this link exactly: ${one(link, 200) || SITE_LINK}; then 4–6 hashtags (mix of #Ibadan #Nigeria #SmallBusiness style tags and the topic). Never name or compare with any other company, marketplace or website builder. ${L === "English" ? "" : "If a word has no common translation (website, online store, Paystack), keep it in English."}
Return ONLY a JSON array of 3 strings.`;
  const budget = FUNCTION_BUDGET_MS() - 3000;
  let out;
  try { out = await provider.call(provider.start([{ role: "user", content: prompt }]), "You write short, honest social media captions. Reply with JSON only.", [], budget, { maxTokens: 1200, attemptMs: Math.max(8000, budget - 1500) }); }
  catch (e) { throw new Error(friendlyAiError(e)); }
  const s = String(out.text || ""), a = s.indexOf("["), z = s.lastIndexOf("]");
  let list = [];
  try { list = JSON.parse(s.slice(a, z + 1)); } catch { list = s.split(/\n{2,}/); }
  list = list.map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
  if (!list.length) throw new Error("The AI didn't write captions. Please try again.");
  return list;
}
