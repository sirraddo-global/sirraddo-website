import { googleClientId } from "./googleid.mjs";
// Logins for Online Stores:
//  - Store owners: their own admin at /mystore (username + password). SIRRADDO creates the login with a temporary
//    password (sent on WhatsApp, works 3 days); they must choose their own on first login and after every reset.
//    Their Manage link keeps working as a backup unless it is switched off for that store.
//  - Buyers (Standard Store): an account on the store's own website, by phone number + password (or Google, when set
//    up). Nothing is ever emailed to buyers: a forgotten password is reset with a one-time code the store owner sends
//    them on WhatsApp.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { q, ensureSchema, getRequest, getBriefById } from "./store.mjs";
import { hashPass, passOk, newPassword, passwordProblem, cleanUsername } from "./staff.mjs";

const TEMP_DAYS = 3;
const secret = () => process.env.ADMIN_PASSWORD || process.env.CRON_SECRET || "";
const sign = (key, text) => createHmac("sha256", key).update(text).digest("base64url");
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------- Store owners ----------
const ownerPub = (u) => u && { id: u.id, request_id: u.request_id, name: u.name, username: u.username, active: u.active, must_change: u.must_change,
  temp_expires: u.temp_expires, last_seen_at: u.last_seen_at, password_changed_at: u.password_changed_at, created_at: u.created_at };

export async function ownerLogin(requestId) {
  await ensureSchema();
  const [u] = await q(`SELECT * FROM store_users WHERE request_id = $1 ORDER BY id LIMIT 1`, [Number(requestId)]);
  return ownerPub(u) || null;
}
async function freeOwnerName(want, exceptId = 0) {
  const u = cleanUsername(want);
  if (u.length < 3) throw new Error("Username: at least 3 letters or numbers");
  const [taken] = await q(`SELECT id FROM store_users WHERE username = $1 AND id <> $2`, [u, Number(exceptId) || 0]);
  if (taken) throw new Error(`The username "${u}" is already used by another store. Choose another`);
  return u;
}
// A suggested username from the business name: "Kemi Wears Ltd" -> "kemiwears".
export function suggestOwnerUsername(r) {
  const base = String(r?.brief?.business_name || r?.business || r?.name || "store").toLowerCase().replace(/\b(ltd|limited|enterprises?|ventures?|nig|nigeria)\b/g, "").replace(/[^a-z0-9]/g, "").slice(0, 20);
  return base.length >= 3 ? base : "store" + (r?.id || "");
}
// Create (or re-create) the owner's login: returns the temporary password once.
// The client row with the business name from their project form.
export async function storeRow(requestId) {
  const [r, b] = await Promise.all([getRequest(requestId), getBriefById(requestId)]);
  return r ? { ...r, brief: b?.brief || {} } : null;
}
export async function createOwnerLogin(requestId, { username } = {}) {
  const r = await storeRow(requestId);
  if (!r) throw new Error("Not found");
  await ensureSchema();
  const existing = await ownerLogin(requestId);
  if (existing) throw new Error("This store already has a login. Use Reset password instead.");
  const name = String(r.brief?.business_name || r.business || r.name).slice(0, 80);
  const u = await freeOwnerName(username || suggestOwnerUsername(r));
  const password = newPassword();
  const [row] = await q(`INSERT INTO store_users (request_id, name, username, pass_hash, must_change, temp_expires) VALUES ($1, $2, $3, $4, true, now() + interval '${TEMP_DAYS} days') RETURNING *`,
    [r.id, name, u, hashPass(password)]);
  return { login: ownerPub(row), password, temp_days: TEMP_DAYS };
}
export async function resetOwnerLogin(requestId) {
  await ensureSchema();
  const password = newPassword();
  const [row] = await q(`UPDATE store_users SET pass_hash = $1, must_change = true, temp_expires = now() + interval '${TEMP_DAYS} days', active = true WHERE request_id = $2 RETURNING *`, [hashPass(password), Number(requestId)]);
  if (!row) throw new Error("This store has no login yet");
  return { login: ownerPub(row), password, temp_days: TEMP_DAYS };
}
export async function updateOwnerLogin(requestId, { active, username }) {
  await ensureSchema();
  const cur = await ownerLogin(requestId);
  if (!cur) throw new Error("This store has no login yet");
  if (active !== undefined) await q(`UPDATE store_users SET active = $1 WHERE id = $2`, [Boolean(active), cur.id]);
  if (username !== undefined) await q(`UPDATE store_users SET username = $1 WHERE id = $2`, [await freeOwnerName(username, cur.id), cur.id]);
  return ownerLogin(requestId);
}
export async function deleteOwnerLogin(requestId) {
  await ensureSchema();
  await q(`DELETE FROM store_users WHERE request_id = $1`, [Number(requestId)]);
}

const ownerKey = (u) => createHash("sha256").update("sirraddo-store-owner:" + u.pass_hash + ":" + secret()).digest();
export function ownerSessionToken(u, days = 30) {
  const exp = Date.now() + (u.must_change ? 1 : days) * 86400000;
  return `o1.${u.id}.${exp}.${sign(ownerKey(u), `${u.id}.${exp}`)}`;
}
export const ownerCredential = (username, password) => `ou.${Buffer.from(String(username)).toString("base64url")}.${Buffer.from(String(password)).toString("base64url")}`;
// Who is calling /api/mystore: { user, request_id } or null.
export async function ownerFromCredential(given) {
  given = String(given || "");
  const m = /^o1\.(\d{1,9})\.(\d{10,16})\.([\w-]{43})$/.exec(given);
  const l = /^ou\.([\w-]{1,100})\.([\w-]{1,120})$/.exec(given);
  if (!m && !l) return null;
  await ensureSchema();
  let u;
  if (m) {
    if (Number(m[2]) < Date.now()) return null;
    [u] = await q(`SELECT * FROM store_users WHERE id = $1 AND active`, [Number(m[1])]);
    if (!u || !same(sign(ownerKey(u), `${m[1]}.${m[2]}`), m[3])) return null;
  } else {
    const name = cleanUsername(Buffer.from(l[1], "base64url").toString());
    [u] = await q(`SELECT * FROM store_users WHERE username = $1 AND active`, [name]);
    if (!u || !passOk(Buffer.from(l[2], "base64url").toString(), u.pass_hash)) return null;
  }
  if (u.must_change && u.temp_expires && new Date(u.temp_expires) < new Date()) return null;
  await q(`UPDATE store_users SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')`, [u.id]).catch(() => {});
  return { user: u, request_id: u.request_id, mustChange: Boolean(u.must_change) };
}
export async function setOwnerPassword(userId, current, next) {
  const [u] = await q(`SELECT * FROM store_users WHERE id = $1 AND active`, [Number(userId)]);
  if (!u || !passOk(current, u.pass_hash)) throw new Error("Your current password is not right");
  const bad = passwordProblem(next);
  if (bad) throw new Error(bad);
  if (String(next) === String(current)) throw new Error("Choose a different password from the current one");
  const [row] = await q(`UPDATE store_users SET pass_hash = $1, must_change = false, temp_expires = NULL, password_changed_at = now() WHERE id = $2 RETURNING *`, [hashPass(next), u.id]);
  return row;
}

// ---------- Buyers ----------
// Phone numbers are kept in one form so 0803…, +234803… and 234803… are the same account.
export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("234")) d = "0" + d.slice(3);
  if (d.length === 10 && !d.startsWith("0")) d = "0" + d;
  return /^\d{7,15}$/.test(d) ? d : "";
}
export const buyerPasswordProblem = (p) => {
  p = String(p || "");
  if (p.length < 6) return "Use at least 6 characters";
  if (p.length > 72) return "Too long (72 characters at most)";
  return null;
};
const cleanText = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const buyerPub = (b) => b && { id: b.id, name: b.name, phone: b.phone, email: b.email || "", addresses: b.addresses || [], google: Boolean(b.google_sub), created_at: b.created_at };
const buyerKey = (b) => createHash("sha256").update("sirraddo-buyer:" + (b.pass_hash || "g:" + b.google_sub) + ":" + b.request_id + ":" + secret()).digest();
export function buyerToken(b, days = 60) {
  const exp = Date.now() + days * 86400000;
  return `b1.${b.id}.${exp}.${sign(buyerKey(b), `${b.id}.${exp}`)}`;
}
export async function buyerFromToken(requestId, token) {
  const m = /^b1\.(\d{1,9})\.(\d{10,16})\.([\w-]{43})$/.exec(String(token || ""));
  if (!m || Number(m[2]) < Date.now()) return null;
  await ensureSchema();
  const [b] = await q(`SELECT * FROM store_buyers WHERE id = $1 AND request_id = $2 AND active`, [Number(m[1]), Number(requestId)]);
  if (!b || !same(sign(buyerKey(b), `${m[1]}.${m[2]}`), m[3])) return null;
  if (!b.last_seen_at || Date.now() - new Date(b.last_seen_at) > 3600000) await q(`UPDATE store_buyers SET last_seen_at = now() WHERE id = $1`, [b.id]).catch(() => {});
  return b;
}
export async function buyerSignup(requestId, { name, phone, password, email }) {
  const n = cleanText(name, 80), ph = normPhone(phone);
  if (!n) throw new Error("Please enter your name");
  if (!ph) throw new Error("Please enter a correct phone number");
  const bad = buyerPasswordProblem(password);
  if (bad) throw new Error(bad);
  const em = cleanText(email, 200).toLowerCase();
  if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error("That email doesn't look right (or leave it empty)");
  await ensureSchema();
  const [exists] = await q(`SELECT id FROM store_buyers WHERE request_id = $1 AND phone = $2`, [Number(requestId), ph]);
  if (exists) throw new Error("This phone number already has an account. Sign in instead (or use Forgot password).");
  const [b] = await q(`INSERT INTO store_buyers (request_id, phone, name, email, pass_hash, last_seen_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
    [Number(requestId), ph, n, em || null, hashPass(password)]);
  return { buyer: buyerPub(b), token: buyerToken(b) };
}
export async function buyerLogin(requestId, { phone, password }) {
  const ph = normPhone(phone);
  await ensureSchema();
  const [b] = ph ? await q(`SELECT * FROM store_buyers WHERE request_id = $1 AND phone = $2 AND active`, [Number(requestId), ph]) : [];
  if (!b || !b.pass_hash || !passOk(String(password || ""), b.pass_hash)) throw new Error("Wrong phone number or password");
  await q(`UPDATE store_buyers SET last_seen_at = now() WHERE id = $1`, [b.id]);
  return { buyer: buyerPub(b), token: buyerToken(b) };
}
// Google sign-in: the website sends Google's ID token; we check it with Google and that it was made for our app.
export async function buyerGoogle(requestId, idToken, phone) {
  const client = googleClientId();
  if (!client) throw new Error("Google sign-in isn't set up for this store");
  const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(idToken || "")));
  const g = await res.json().catch(() => ({}));
  if (!res.ok || g.aud !== client || !g.sub || !["accounts.google.com", "https://accounts.google.com"].includes(g.iss) || Number(g.exp) * 1000 < Date.now())
    throw new Error("Google sign-in didn't work. Please try again or use your phone number.");
  await ensureSchema();
  let [b] = await q(`SELECT * FROM store_buyers WHERE request_id = $1 AND google_sub = $2 AND active`, [Number(requestId), g.sub]);
  if (!b) {
    const ph = normPhone(phone);
    if (!ph) return { needPhone: true, name: g.name || "" }; // first time: we need their phone number for delivery
    const [byPhone] = await q(`SELECT * FROM store_buyers WHERE request_id = $1 AND phone = $2`, [Number(requestId), ph]);
    if (byPhone && byPhone.google_sub) throw new Error("This phone number is linked to another Google account. Sign in with your phone number and password.");
    if (byPhone) throw new Error("This phone number already has an account. Sign in with your phone number and password.");
    [b] = await q(`INSERT INTO store_buyers (request_id, phone, name, email, google_sub, last_seen_at) VALUES ($1, $2, $3, $4, $5, now()) RETURNING *`,
      [Number(requestId), ph, cleanText(g.name || "Customer", 80), g.email_verified === "true" || g.email_verified === true ? String(g.email || "").toLowerCase() : null, g.sub]);
  }
  await q(`UPDATE store_buyers SET last_seen_at = now() WHERE id = $1`, [b.id]);
  return { buyer: buyerPub(b), token: buyerToken(b) };
}
export async function buyerUpdate(b, { name, email, addresses }) {
  const sets = [], vals = [];
  if (name !== undefined) { const n = cleanText(name, 80); if (!n) throw new Error("Please enter your name"); vals.push(n); sets.push(`name = $${vals.length}`); }
  if (email !== undefined) {
    const em = cleanText(email, 200).toLowerCase();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error("That email doesn't look right");
    vals.push(em || null); sets.push(`email = $${vals.length}`);
  }
  if (addresses !== undefined) {
    const list = (Array.isArray(addresses) ? addresses : []).slice(0, 5).map((a) => ({ label: cleanText(a?.label, 30) || "Address", text: cleanText(a?.text, 300) })).filter((a) => a.text);
    vals.push(JSON.stringify(list)); sets.push(`addresses = $${vals.length}::jsonb`);
  }
  if (!sets.length) return buyerPub(b);
  vals.push(b.id);
  const [row] = await q(`UPDATE store_buyers SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`, vals);
  return buyerPub(row);
}
export async function buyerChangePassword(b, current, next) {
  if (b.pass_hash && !passOk(String(current || ""), b.pass_hash)) throw new Error("Your current password is not right");
  const bad = buyerPasswordProblem(next);
  if (bad) throw new Error(bad);
  const [row] = await q(`UPDATE store_buyers SET pass_hash = $1 WHERE id = $2 RETURNING *`, [hashPass(next), b.id]);
  return { buyer: buyerPub(row), token: buyerToken(row) };
}
// The store owner makes a one-time code (valid 24 hours) and sends it to the buyer on WhatsApp.
export async function buyerResetCode(requestId, buyerId) {
  const code = String(randomInt(100000, 1000000));
  const [b] = await q(`UPDATE store_buyers SET reset_hash = $1, reset_exp = now() + interval '24 hours' WHERE id = $2 AND request_id = $3 RETURNING *`,
    [hashPass(code), Number(buyerId), Number(requestId)]);
  if (!b) throw new Error("Customer not found");
  return { code, buyer: buyerPub(b) };
}
export async function buyerResetWithCode(requestId, { phone, code, password }) {
  const ph = normPhone(phone);
  const bad = buyerPasswordProblem(password);
  if (bad) throw new Error(bad);
  const [b] = ph ? await q(`SELECT * FROM store_buyers WHERE request_id = $1 AND phone = $2 AND active`, [Number(requestId), ph]) : [];
  if (!b || !b.reset_hash || new Date(b.reset_exp) < new Date() || !passOk(String(code || "").trim(), b.reset_hash)) throw new Error("That code is wrong or has expired. Ask the store for a new one.");
  const [row] = await q(`UPDATE store_buyers SET pass_hash = $1, reset_hash = NULL, reset_exp = NULL, last_seen_at = now() WHERE id = $2 RETURNING *`, [hashPass(password), b.id]);
  return { buyer: buyerPub(row), token: buyerToken(row) };
}
// For the store owner: every account with how many paid orders, how much they spent and their last order.
export async function listBuyers(requestId, { search = "" } = {}) {
  await ensureSchema();
  const s = String(search || "").trim().toLowerCase();
  return q(`SELECT b.id, b.name, b.phone, b.email, b.addresses, b.active, b.created_at, b.last_seen_at, (b.google_sub IS NOT NULL) AS google,
      COUNT(o.id) FILTER (WHERE o.status = 'paid')::int AS orders, COALESCE(SUM(o.total) FILTER (WHERE o.status = 'paid'), 0)::int AS spent,
      MAX(o.created_at) AS last_order
    FROM store_buyers b LEFT JOIN store_orders o ON o.buyer_id = b.id
    WHERE b.request_id = $1 AND ($2 = '' OR lower(b.name) LIKE '%' || $2 || '%' OR b.phone LIKE '%' || $2 || '%')
    GROUP BY b.id ORDER BY MAX(o.created_at) DESC NULLS LAST, b.created_at DESC LIMIT 500`, [Number(requestId), s]);
}
export async function setBuyerActive(requestId, buyerId, active) {
  const [b] = await q(`UPDATE store_buyers SET active = $1 WHERE id = $2 AND request_id = $3 RETURNING *`, [Boolean(active), Number(buyerId), Number(requestId)]);
  if (!b) throw new Error("Customer not found");
  return buyerPub(b);
}
export { buyerPub };

// A buyer asked the store to delete their data: their account is deleted and their name, phone, email, address
// and notes are removed from their orders (the amounts and items stay for the store's accounts).
export async function eraseBuyer(requestId, { buyerId, phone } = {}) {
  await ensureSchema();
  const id = Number(requestId);
  let ph = normPhone(phone);
  if (buyerId) {
    const [b] = await q(`SELECT phone FROM store_buyers WHERE id = $1 AND request_id = $2`, [Number(buyerId), id]);
    if (!b) throw new Error("Customer not found");
    ph = b.phone;
  }
  if (!ph) throw new Error("Enter the customer's phone number");
  const forms = [ph, "234" + ph.slice(1)];
  const gone = await q(`DELETE FROM store_buyers WHERE request_id = $1 AND phone = $2 RETURNING id`, [id, ph]);
  const ids = gone.map((g) => g.id).concat(buyerId ? [Number(buyerId)] : []);
  const orders = await q(`UPDATE store_orders SET buyer = jsonb_build_object('name', 'Removed (customer asked)', 'phone', '', 'email', '', 'address', '', 'note', ''), claim = NULL, buyer_id = NULL
    WHERE request_id = $1 AND (buyer_id = ANY($2::int[]) OR regexp_replace(COALESCE(buyer->>'phone', ''), '\\D', '', 'g') = ANY($3::text[])) RETURNING ref`, [id, ids, forms]);
  return { account: gone.length > 0, orders: orders.length };
}
