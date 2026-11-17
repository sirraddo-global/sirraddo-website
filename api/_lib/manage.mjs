// "Manage my store": a private link for the store owner to change urgent things themselves — product prices,
// sold out / in stock, opening hours, phone and WhatsApp, and a short notice on their site. Saving updates the
// live site on Cloudflare (free, no Netlify deploy) and emails you what changed. Bigger changes stay with you
// (Request a change). The link keeps working until you make a new one in admin.
import { randomBytes } from "node:crypto";
import { SITE_URL } from "../../site.config.mjs";
import { q, getRequest, getBriefById, updateRequestShop, mergeBrief, reference, esc, emailConfigured, sendEmail } from "./store.mjs";

// The customer row plus their project form answers (the admin row leaves the answers out).
async function load(id) {
  const [r, b] = await Promise.all([getRequest(id), getBriefById(id)]);
  return r ? { ...r, brief: b?.brief || {} } : null;
}
import { cloudflareConfigured } from "./cloudflare.mjs";

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
  const rows = await q(`SELECT id FROM customer_requests WHERE shop->'manage'->>'token' = $1`, [token]);
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
    const sold = v?.soldout === true || v?.soldout === "1" || v?.soldout === "on";
    if (sold !== Boolean(p.soldout)) { changes.push(`${p.name}: ${sold ? "SOLD OUT" : "back in stock"}`); if (sold) p.soldout = true; else delete p.soldout; }
  }
  const patch = { products };
  for (const [key, label, max] of [["hours", "Opening hours", 120], ["phone", "Phone", 30], ["whatsapp", "WhatsApp", 30], ["site_notice", "Notice on the website", 200], ["tagline", "Slogan", 100]]) {
    if (!(key in input)) continue;
    const v = clean(input[key], max);
    if (key === "phone" && !v) continue; // the phone number can't be removed
    if ((key === "phone" || key === "whatsapp") && v && !/^\+?[\d\s()-]{7,20}$/.test(v)) throw new Error(`${label}: please write a phone number, e.g. 0803 123 4567`);
    if (v !== String(b[key] || "")) { changes.push(`${label}: ${v || "(removed)"}`); patch[key] = v; }
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
      `<p><b>${esc(r.business || r.name)}</b> changed these in Manage my store:</p><ul>${changes.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><p>Live site: ${esc(live)}.</p>`).catch(() => {});
  }
  return live;
}
