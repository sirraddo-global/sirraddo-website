// Staff accounts: other people who can log in to admin with limited access (e.g. while you're away).
// - Each staff member has their own password (random, shown once; only its SHA-256 is stored).
// - Permissions are checked on the server for every action and every field (see permFor / fieldPerm).
// - Everything a staff member changes is written to staff_log, which only the owner sees.
// - The owner (ADMIN_PASSWORD) can always do everything, and is the only one who can manage staff.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { q, ensureSchema } from "./store.mjs";

// What a staff member can be allowed to do. "view" is always on.
export const PERMS = {
  customers: { label: "Customers", desc: "Add customers, update details, status (not Won), follow-up dates and notes; answer website questions; moderate reviews" },
  changes: { label: "Change requests", desc: "Handle change requests (incl. Do it with AI, previews), send customers their Manage link, visitor reports" },
  marketing: { label: "Marketing", desc: "Ready ads, picture and video maker, AI captions, showcase, referrals (view)" },
  money: { label: "Money", desc: "Quotes, invoices, receipts, payments, Won status, renewals, monthly/yearly services, ad spend" },
  build: { label: "Build and publish", desc: "Website text, AI design, previews, project stage, go live, publish, pause, restore" },
};
export const PRESETS = {
  support: { label: "Customer support", perms: ["customers", "changes", "marketing"] },
  manager: { label: "Manager (everything except settings)", perms: ["customers", "changes", "marketing", "money", "build"] },
  marketing: { label: "Marketing only", perms: ["marketing"] },
};
const OWNER_ONLY = "owner";

// Which permission an action needs ("view" = any logged-in person, "owner" = only you).
const ACTIONS = {
  session: "view", assistant: "view", mk_playbook: "view",
  create: "customers", question: "customers", review_set: "customers", site_review_set: "customers", mk_demand: "customers", brief_link: "customers",
  changes: "changes", change_mark: "changes", change_add: "changes", change_ai_plan: "changes", change_ai_apply: "changes", change_ai_undo: "changes",
  change_ai_send: "changes", change_ai_sent: "changes", manage_link: "changes", site_stats: "changes", report_send: "changes",
  mk_qr: "marketing", mk_captions: "marketing", mk_video_script: "marketing", mk_showcase_list: "marketing", mk_showcase: "marketing",
  mk_showcase_ok: "marketing", mk_reviews: "marketing", mk_ref: "marketing", mk_ref_top: "marketing", mk_offer_get: "marketing",
  doc_link: "money", send_doc: "money", paystack_link: "money", mk_svc_paid: "money", mk_spend: "money", mk_spend_add: "money", mk_spend_del: "money", shop_orders: "money", mk_ref_use: "money",
  design: "build", design_clear: "build", design_option: "build", design_ref_remove: "build", write_draft: "build", send_preview: "build", preview_link: "build",
  host_check: "build", host_domain: "build", host_email: "build", host_pause: "build", host_publish: "build", host_restore: "build", host_rollback: "build",
};
// Anything not listed (settings, notices, greetings, email, backups, offers, staff, Neon, report on/off, delete…) is owner only.
export function permFor(action) { return ACTIONS[action] || OWNER_ONLY; }

const CUSTOMER_FIELDS = new Set(["id", "name", "contact", "business", "interest", "details", "notes", "email", "came_from", "wants", "follow_up_on", "status"]);
const MONEY_FIELDS = new Set(["quote_amount", "payments", "renewal_amount", "renewal_due", "services"]);
const BUILD_FIELDS = new Set(["project_stage", "draft_md", "website_url", "live_on", "handover", "brief", "hosting"]);
// The permissions a PATCH needs, from the fields it changes.
export function fieldPerms(body) {
  const need = new Set();
  for (const k of Object.keys(body || {})) {
    if (CUSTOMER_FIELDS.has(k)) need.add("customers");
    else if (MONEY_FIELDS.has(k)) need.add("money");
    else if (BUILD_FIELDS.has(k)) need.add("build");
    else need.add(OWNER_ONLY);
  }
  if (body && body.status === "won") need.add("money"); // Won means paid: only with Money
  need.delete("view");
  return [...need];
}
export const can = (me, perm) => me?.role === "owner" || (perm === "view" ? Boolean(me) : perm !== OWNER_ONLY && Boolean(me?.perms?.includes(perm)));

// ---------- Accounts ----------
const hashPass = (p) => createHash("sha256").update("sirraddo-staff:" + p).digest("hex");
export const newPassword = () => "sgl-" + randomBytes(9).toString("base64url").replace(/[-_]/g, "x").slice(0, 12).replace(/(.{4})(?=.)/g, "$1-");
const cleanPerms = (list) => [...new Set((Array.isArray(list) ? list : []).filter((p) => PERMS[p]))];
const pub = (s) => s && { id: s.id, name: s.name, phone: s.phone, perms: s.perms || [], active: s.active, created_at: s.created_at, last_seen_at: s.last_seen_at };

export async function listStaff() {
  await ensureSchema();
  return (await q(`SELECT * FROM staff ORDER BY active DESC, name`, [])).map(pub);
}
export async function addStaff({ name, phone, perms }) {
  const n = String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!n) throw new Error("Type their name");
  const p = cleanPerms(perms);
  if (!p.length) throw new Error("Tick at least one thing they can do");
  const password = newPassword();
  await ensureSchema();
  const [row] = await q(`INSERT INTO staff (name, phone, pass_hash, perms) VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
    [n, String(phone || "").replace(/[^\d+]/g, "").slice(0, 20) || null, hashPass(password), JSON.stringify(p)]);
  return { staff: pub(row), password };
}
export async function updateStaff(id, { perms, active, name, phone }) {
  await ensureSchema();
  const sets = [], vals = [];
  if (perms !== undefined) { const p = cleanPerms(perms); if (!p.length) throw new Error("Tick at least one thing they can do"); vals.push(JSON.stringify(p)); sets.push(`perms = $${vals.length}::jsonb`); }
  if (active !== undefined) { vals.push(Boolean(active)); sets.push(`active = $${vals.length}`); }
  if (name !== undefined) { vals.push(String(name).trim().slice(0, 80)); sets.push(`name = $${vals.length}`); }
  if (phone !== undefined) { vals.push(String(phone).replace(/[^\d+]/g, "").slice(0, 20) || null); sets.push(`phone = $${vals.length}`); }
  if (!sets.length) return listStaff();
  vals.push(Number(id));
  await q(`UPDATE staff SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return listStaff();
}
// A new password: the old one (and every "keep me logged in" device) stops working.
export async function resetStaffPassword(id) {
  const password = newPassword();
  await ensureSchema();
  const rows = await q(`UPDATE staff SET pass_hash = $1 WHERE id = $2 RETURNING *`, [hashPass(password), Number(id)]);
  if (!rows[0]) throw new Error("Not found");
  return { staff: pub(rows[0]), password };
}
export async function deleteStaff(id) {
  await ensureSchema();
  await q(`DELETE FROM staff WHERE id = $1`, [Number(id)]);
  return listStaff();
}

// ---------- Sign in ----------
// Password: active staff whose hash matches. Session: "s2.<id>.<exp>.<sig>", signed with a key that includes
// their password hash, so a new password or deactivating them logs every device out.
const sessionKey = (s) => createHash("sha256").update("sirraddo-staff-session:" + s.pass_hash + ":" + (process.env.ADMIN_PASSWORD || "")).digest();
export function staffSessionToken(s, days = 30) {
  const exp = Date.now() + days * 86400000;
  return `s2.${s.id}.${exp}.${createHmac("sha256", sessionKey(s)).update(`${s.id}.${exp}`).digest("base64url")}`;
}
export async function staffFromCredential(given) {
  if (!given) return null;
  await ensureSchema();
  const m = /^s2\.(\d{1,9})\.(\d{10,16})\.([\w-]{43})$/.exec(given);
  let s = null;
  if (m) {
    if (Number(m[2]) < Date.now()) return null;
    [s] = await q(`SELECT * FROM staff WHERE id = $1 AND active`, [Number(m[1])]);
    if (!s) return null;
    const want = createHmac("sha256", sessionKey(s)).update(`${m[1]}.${m[2]}`).digest("base64url");
    if (!timingSafeEqual(Buffer.from(want), Buffer.from(m[3]))) return null;
  } else {
    if (given.length < 12 || given.length > 64) return null;
    [s] = await q(`SELECT * FROM staff WHERE pass_hash = $1 AND active`, [hashPass(given)]);
    if (!s) return null;
  }
  await q(`UPDATE staff SET last_seen_at = now() WHERE id = $1 AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')`, [s.id]).catch(() => {});
  return { role: "staff", id: s.id, name: s.name, perms: s.perms || [], row: s };
}

// ---------- Activity log ----------
export async function logStaff(me, what, requestId = null) {
  if (me?.role !== "staff") return;
  await q(`INSERT INTO staff_log (staff_id, staff_name, what, request_id) VALUES ($1, $2, $3, $4)`, [me.id, me.name, String(what).slice(0, 300), Number.isInteger(requestId) ? requestId : null]).catch((e) => console.error("staff log failed", e));
}
export async function staffLog(limit = 100) {
  await ensureSchema();
  return q(`SELECT l.*, r.name AS customer FROM staff_log l LEFT JOIN customer_requests r ON r.id = l.request_id ORDER BY l.at DESC LIMIT $1`, [limit]);
}
