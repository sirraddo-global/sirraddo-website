import { parseOptions, parseVariantStock } from "./storeplus.mjs";
// "Manage my store": a private link for the store owner to change urgent things themselves — product prices,
// sold out / in stock, opening hours, phone and WhatsApp, a short notice on their site, and which reviews show. Saving updates the
// live site on Cloudflare (free, no Netlify deploy) and emails you what changed. Bigger changes stay with you
// (Request a change). The link keeps working until you make a new one in admin.
import { randomBytes } from "node:crypto";
import { SITE_URL } from "../../site.config.mjs";
import { q, getRequest, getBriefById, updateRequestShop, updateRequest, mergeBrief, reference, esc, emailConfigured, sendEmail, saveHosting } from "./store.mjs";
import { kindFor } from "./brief-schema.mjs";

// The customer row plus their project form answers (the admin row leaves the answers out).
async function load(id) {
  const [r, b, d] = await Promise.all([getRequest(id), getBriefById(id), q(`SELECT draft_md FROM customer_requests WHERE id = $1`, [id]).catch(() => [])]);
  // The Google Business Profile description our AI wrote with the website text (for the Google guide).
  const m = String(d?.[0]?.draft_md || "").match(/## Google Business Profile description\s*\n([\s\S]*?)(?=\n## |$)/);
  const gbpText = m ? m[1].replace(/^\(.*\)\s*$/m, "").replace(/\[ADD:[^\]]*\]/g, "").trim() : "";
  return r ? { ...r, brief: b?.brief || {}, gbpText: /wasn't written/.test(gbpText) ? "" : gbpText } : null;
}
import { cloudflareConfigured } from "./cloudflare.mjs";
import { setReviewStatuses } from "./reviews.mjs";
import { SITE_LOOK, SITE_LOOK_NOTES, FUEL, FUEL_STATUS } from "./sitegen.mjs";

// Stores call it "Manage my store"; other websites "Manage my website" (hours, numbers, notice, slogan, reviews).
// For the Manage page: is a newer version of the website waiting, and what's in it.
export function lookStatus(r) {
  const h = r?.hosting || {};
  return { mode: h.lookMode === "ask" ? "ask" : "auto", waiting: Boolean(h.publishedAt && h.look && h.look !== SITE_LOOK), notes: SITE_LOOK_NOTES[SITE_LOOK] || [] };
}
// Show the "My Google profile is verified" box: business websites and stores, until it's ticked.
export const gbpAsk = (r) => kindFor(r?.interest) !== "starter" && !r?.handover?.gbp_done;
export const manageTitle = (r) => (r?.interest === "Online Store" ? "Manage my store" : "Manage my website");
export async function manageLink(id, { renew = false } = {}) {
  const r = await getRequest(id);
  if (!r) return null;
  let token = r.shop?.manage?.token;
  if (!token || renew) {
    token = randomBytes(18).toString("base64url");
    await updateRequestShop(id, { manage: { token, created: new Date().toISOString() } });
  }
  return { url: `${SITE_URL}/manage?t=${token}` };
}

export async function findManageRequest(token) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(String(token || ""))) return null;
  // A store that has its own login can have the Manage link switched off (admin or My store).
  const rows = await q(`SELECT id FROM customer_requests WHERE shop->'manage'->>'token' = $1 AND COALESCE(shop->>'manageOff', 'false') <> 'true'`, [token]);
  return rows[0] ? load(rows[0].id) : null;
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const cleanPrice = (v) => clean(v, 40).replace(/[^\d.,₦a-zA-Z /-]/g, "");

// Applies the owner's edits. Returns { changes: [text…], row }.
export async function applyManage(r, input) {
  const b = r.brief || {};
  const products = (b.products || []).map((p) => ({ ...p }));
  const changes = [];
  for (const [k, v] of Object.entries(input.products || {})) {
    const p = products[Number(k)];
    if (!p || !p.name) continue;
    const price = cleanPrice(v?.price);
    if (price && price !== String(p.price || "")) { changes.push(`${p.name}: price ${p.price || "(none)"} → ${price}`); p.price = price; }
    let sold = v?.soldout === true || v?.soldout === "1" || v?.soldout === "on";
    // Stock count: empty = not counted. A number is taken down by paid online orders; at 0 it shows Sold out.
    if (v && "stock" in v) {
      const raw = String(v.stock ?? "").trim();
      if (raw && !/^\d{1,6}$/.test(raw)) throw new Error(`${p.name}: stock must be a whole number (or empty to not count it)`);
      const before = String(p.stock ?? "").trim();
      if (raw !== before) {
        changes.push(`${p.name}: stock ${before === "" ? "not counted" : before} → ${raw === "" ? "not counted" : raw}`);
        if (raw === "") delete p.stock; else p.stock = raw;
        if (raw !== "" && Number(raw) > 0 && p.soldout) sold = false; // restocked
      }
    }
    if (sold !== Boolean(p.soldout)) { changes.push(`${p.name}: ${sold ? "SOLD OUT" : "back in stock"}`); if (sold) p.soldout = true; else delete p.soldout; }
    // Sale: the old price (crossed out on the website) and when the sale ends (then the old price comes back by itself).
    if (v && "was" in v) {
      const was = String(v.was ?? "").trim() === "" ? "" : cleanPrice(v.was);
      if (String(v.was ?? "").trim() && !was) throw new Error(`${p.name}: write the old price as a number, e.g. 15000`);
      if (was !== String(p.was || "")) { changes.push(`${p.name}: ${was ? `on sale (was ${was})` : "sale ended"}`); if (was) p.was = was; else { delete p.was; delete p.saleEnds; } }
    }
    if (v && "saleEnds" in v) {
      const raw = String(v.saleEnds ?? "").trim();
      if (raw && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(raw)) throw new Error(`${p.name}: choose the date the sale ends`);
      const ends = raw ? (raw.length === 10 ? raw + "T23:59" : raw) + ":00+01:00" : "";
      if (ends !== String(p.saleEnds || "")) { changes.push(`${p.name}: ${ends ? "sale ends " + raw.replace("T", " ") : "sale has no end date"}`); if (ends) p.saleEnds = ends; else delete p.saleEnds; }
    }
    // Sizes / colours ("Size: 40, 41, 42 | Colour: Black, Brown") and stock for each choice ("40 / Black = 3").
    if (v && "options" in v) {
      const groups = parseOptions(String(v.options ?? ""));
      const before = JSON.stringify(parseOptions(p.options));
      if (JSON.stringify(groups) !== before) { changes.push(`${p.name}: ${groups.length ? "choices " + groups.map((g) => `${g.name} (${g.values.join(", ")})`).join(", ") : "no choices"}`); if (groups.length) p.options = groups; else { delete p.options; delete p.vstock; } }
    }
    if (v && "vstock" in v && p.options) {
      const vs = parseVariantStock(String(v.vstock ?? ""), parseOptions(p.options));
      if (JSON.stringify(vs) !== JSON.stringify(p.vstock || {})) { changes.push(`${p.name}: stock per choice updated`); if (Object.keys(vs).length) p.vstock = vs; else delete p.vstock; }
    }
    if (v && "top" in v) { const top = v.top === true || v.top === "1" || v.top === "on"; if (top !== Boolean(p.top)) { changes.push(`${p.name}: ${top ? "shown at the top of the home page" : "no longer at the top"}`); if (top) p.top = true; else delete p.top; } }
  }
  const patch = { products };
  // Filling stations & gas plants: today's prices and stock (an empty price = not sold, nothing shows).
  if (input.fuel && typeof input.fuel === "object") {
    const before = b.fuel_prices || {}, next = {}, fuelChanges = [];
    for (const f of FUEL) {
      const v = input.fuel[f.k] || {};
      const raw = String(v.price ?? "").replace(/[₦,\s]/g, "");
      if (raw && !/^\d{2,7}$/.test(raw)) throw new Error(`${f.label}: write the price as a number, e.g. 980`);
      const status = FUEL_STATUS[v.status] ? v.status : "available";
      const was = before[f.k] || {}, wasPrice = String(was.price || ""), wasStatus = FUEL_STATUS[was.status] ? was.status : "available";
      if (raw) next[f.k] = { price: raw, status };
      if (raw !== wasPrice) fuelChanges.push(`${f.label}: ${raw ? `₦${Number(raw).toLocaleString("en-NG")}` : "not shown"}${wasPrice ? ` (was ₦${Number(wasPrice).toLocaleString("en-NG")})` : ""}`);
      else if (raw && status !== wasStatus) fuelChanges.push(`${f.label}: ${FUEL_STATUS[status]}`);
    }
    if (fuelChanges.length) { changes.push(...fuelChanges); patch.fuel_prices = { ...next, updated: new Date().toISOString() }; }
  }
  for (const [key, label, max] of [["hours", "Opening hours", 120], ["phone", "Phone", 30], ["whatsapp", "WhatsApp", 30], ["site_notice", "Notice on the website", 200], ["tagline", "Slogan", 100]]) {
    if (!(key in input)) continue;
    const v = clean(input[key], max);
    if (key === "phone" && !v) continue; // the phone number can't be removed
    if ((key === "phone" || key === "whatsapp") && v && !/^\+?[\d\s()-]{7,20}$/.test(v)) throw new Error(`${label}: please write a phone number, e.g. 0803 123 4567`);
    if (v !== String(b[key] || "")) { changes.push(`${label}: ${v || "(removed)"}`); patch[key] = v; }
  }
  changes.push(...(await setReviewStatuses(r.id, input.reviews))); // after the checks above, so a bad phone number saves nothing
  // Website improvements: "auto" (default) or "ask" (email first; they update here when ready).
  const h = r.hosting || {};
  if (input.lookMode === "ask" || input.lookMode === "auto") {
    const now = h.lookMode === "ask" ? "ask" : "auto";
    if (input.lookMode !== now) {
      await saveHosting(r.id, { lookMode: input.lookMode });
      changes.push(`Website improvements: ${input.lookMode === "ask" ? "ask me first" : "apply automatically"}`);
    }
  }
  if (input.updateLook && h.publishedAt && h.look !== SITE_LOOK) changes.push("Updated the website to the new version");
  // The owner confirms their Google Business Profile is verified: ticks "Google profile done" in admin for you.
  if (input.gbpVerified && gbpAsk(r)) {
    await updateRequest(r.id, { handover: { ...(r.handover || {}), gbp_done: true, gbp_confirmed: new Date().toISOString() } });
    r.handover = { ...(r.handover || {}), gbp_done: true };
    changes.push("Google Business Profile: verified (confirmed by the owner)");
  }
  if (!changes.length) return { changes, row: r };
  await mergeBrief(r.id, patch);
  return { changes, row: await load(r.id) };
}

// After saving: update the live site (if it's published) and tell you what changed.
export async function afterManage(r, changes) {
  let live = "not published yet";
  const h = r.hosting || {};
  if (h.project && !h.pausedAt && cloudflareConfigured()) {
    try {
      const { publish } = await import("./golive.mjs");
      await publish(r.id, { force: true });
      live = "updated";
    } catch (e) {
      console.error("manage publish failed", r.id, e);
      live = "NOT updated: " + e.message;
    }
  }
  if (emailConfigured()) {
    await sendEmail(`${r.business || r.name} updated their store (${reference(r.id)})`,
      `<p><b>${esc(r.business || r.name)}</b> changed these in ${manageTitle(r)}:</p><ul>${changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><p>Live site: ${esc(live)}.</p>`).catch(() => {});
  }
  return live;
}
