// SIRRADDO agents: people who bring us clients and earn a commission.
// An agent applies on /agents, we approve them in Admin → Marketing → Agents, and they share their own link
// (sirraddo.com.ng/?a=CODE). Requests that come through it are theirs: they earn a share (default 10%) of what that
// client actually pays for their website build in the first 12 months (deposit + balance, minus refunds; not
// renewals or monthly services). They see their leads and earnings on their dashboard and ask for a payout; we pay
// by bank transfer and record it here.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { q, ensureSchema, getSettings, sendEmail, sendCustomerEmail } from "./store.mjs";
import { hashPass, passOk, passwordProblem, newPassword } from "./staff.mjs";
import { SITE_URL } from "../../site.config.mjs";

export const DEFAULT_RATE = 10;      // % of the client's build payments
export const DEFAULT_MIN = 5000;     // smallest payout request (₦)
const WINDOW_DAYS = 365;             // payments counted for 12 months after the lead came in

let ready = false;
async function schema() {
  if (ready) return;
  await ensureSchema();
  await q(`CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
    city TEXT, pitch TEXT, code TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending', pass_hash TEXT, must_change BOOLEAN NOT NULL DEFAULT false,
    bank JSONB, rate NUMERIC, note TEXT, payout_requested_at TIMESTAMPTZ, last_login_at TIMESTAMPTZ, notified JSONB NOT NULL DEFAULT '{}'::jsonb)`);
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS agents_phone ON agents (phone)`);
  await q(`CREATE TABLE IF NOT EXISTS agent_payouts (
    id SERIAL PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount INTEGER NOT NULL, ref TEXT, note TEXT)`);
  ready = true;
}

export class AgentError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const digits = (v) => String(v || "").replace(/\D/g, "");
// 0803… and +234803… are the same number.
export const normPhone = (v) => { let d = digits(v); if (d.startsWith("234")) d = "0" + d.slice(3); if (d.length === 10 && !d.startsWith("0")) d = "0" + d; return d; };
const naira = (n) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function programme() {
  const s = await getSettings();
  const rate = Number(s.agent_rate); const min = Number(s.agent_min);
  return { rate: rate > 0 && rate <= 50 ? rate : DEFAULT_RATE, min: min >= 1000 ? min : DEFAULT_MIN };
}
export const linkFor = (a) => `${SITE_URL}/?a=${encodeURIComponent(a.code)}`;
const rateOf = (a, prog) => (a.rate != null && Number(a.rate) > 0 ? Number(a.rate) : prog.rate);

// ---------- Apply / log in ----------
export async function apply(input) {
  await schema();
  const name = clip(input.name, 80), phone = normPhone(input.phone), email = clip(input.email, 160).toLowerCase();
  const city = clip(input.city, 80), pitch = clip(input.pitch, 500);
  if (name.length < 3) throw new AgentError("Please enter your full name.");
  if (!/^0[789]\d{9}$/.test(phone)) throw new AgentError("Please enter a valid WhatsApp number, e.g. 08031234567.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AgentError("Please check your email address.");
  if (input.agree !== true) throw new AgentError("Please tick that you agree to the agent rules.");
  const bad = passwordProblem(input.password); if (bad) throw new AgentError(bad);
  const exists = await q(`SELECT id, status FROM agents WHERE phone = $1`, [phone]);
  if (exists.length) throw new AgentError(exists[0].status === "pending" ? "You've already applied with this number. We'll message you on WhatsApp once you're approved." : "This number already has an agent account. Please log in.");
  const [a] = await q(`INSERT INTO agents (name, phone, email, city, pitch, pass_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [name, phone, email || null, city || null, pitch || null, hashPass(input.password)]);
  await sendEmail(`New agent application: ${name} (${city || "no city"})`, `<p><b>${esc(name)}</b> applied to become a SIRRADDO agent.</p>
    <p>WhatsApp: ${esc(phone)}<br>Email: ${esc(email || "—")}<br>City: ${esc(city || "—")}</p>${pitch ? `<p>How they'll find clients: ${esc(pitch)}</p>` : ""}
    <p>Approve or decline in Admin → Marketing → Agents.</p>`).catch((e) => console.error("agent application email failed", e.message));
  return { ok: true, id: a.id };
}

const sessionKey = (a) => createHash("sha256").update("sirraddo-agent-session:" + a.pass_hash + ":" + (process.env.ADMIN_PASSWORD || "")).digest();
const tokenFor = (a, days = 30) => { const exp = Date.now() + days * 86400000; return `ag.${a.id}.${exp}.${createHmac("sha256", sessionKey(a)).update(`${a.id}.${exp}`).digest("base64url")}`; };
export async function agentFromToken(token) {
  await schema();
  const m = String(token || "").match(/^ag\.(\d+)\.(\d+)\.([\w-]+)$/);
  if (!m || Number(m[2]) < Date.now()) return null;
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [Number(m[1])]);
  if (!a || a.status !== "active") return null;
  const want = createHmac("sha256", sessionKey(a)).update(`${m[1]}.${m[2]}`).digest("base64url");
  return want === m[3] ? a : null;
}
export async function login(phoneIn, password) {
  await schema();
  const [a] = await q(`SELECT * FROM agents WHERE phone = $1`, [normPhone(phoneIn)]);
  if (!a || !passOk(password, a.pass_hash)) throw new AgentError("Wrong number or password.", 401);
  if (a.status === "pending") throw new AgentError("Thanks for applying! We're reviewing it and will message you on WhatsApp once you're approved.", 403);
  if (a.status !== "active") throw new AgentError("This agent account is paused. Please message us on WhatsApp.", 403);
  await q(`UPDATE agents SET last_login_at = now() WHERE id = $1`, [a.id]);
  return { token: tokenFor(a), must_change: a.must_change };
}
export async function changePassword(a, current, next) {
  if (!passOk(current, a.pass_hash)) throw new AgentError("Your current password is not right.");
  const bad = passwordProblem(next); if (bad) throw new AgentError(bad);
  const [b] = await q(`UPDATE agents SET pass_hash = $2, must_change = false WHERE id = $1 RETURNING *`, [a.id, hashPass(next)]);
  return { token: tokenFor(b) };
}

// ---------- Leads and earnings ----------
const STAGE = (r, paid) => (r.status === "lost" ? "Not going ahead" : paid > 0 && r.quote_amount && paid >= r.quote_amount ? "Fully paid" : paid > 0 ? "Paid deposit" : r.status === "quoted" ? "Got a quote" : "New: we're talking to them");
async function leadsOf(agents) {
  if (!agents.length) return {};
  const codes = agents.map((a) => "agent:" + String(a.code || "").toLowerCase()).filter((c) => c !== "agent:");
  if (!codes.length) return {};
  const rows = await q(`SELECT id, created_at, came_from, name, business, contact, interest, status, quote_amount, payments FROM customer_requests WHERE came_from = ANY($1) ORDER BY created_at DESC`, [codes]);
  const by = {};
  for (const r of rows) (by[r.came_from] ||= []).push(r);
  return by;
}
// What a lead has earned the agent: rate% of the build payments (deposit/balance, refunds take it back) made
// within 12 months of the lead. Their own business (same phone) never counts.
function earnedFrom(r, a, rate) {
  if (normPhone(r.contact) && normPhone(r.contact) === a.phone) return { paid: 0, earned: 0, self: true };
  const start = new Date(r.created_at).getTime(), end = start + WINDOW_DAYS * 86400000;
  const paid = (Array.isArray(r.payments) ? r.payments : []).filter((p) => (p.kind || "project") === "project" && new Date(p.date).getTime() <= end && new Date(p.date).getTime() >= start - 86400000)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { paid: Math.max(0, paid), earned: Math.max(0, Math.floor((Math.max(0, paid) * rate) / 100)) };
}
async function payoutsOf(ids) {
  if (!ids.length) return {};
  const rows = await q(`SELECT * FROM agent_payouts WHERE agent_id = ANY($1) ORDER BY created_at DESC`, [ids]);
  const by = {}; for (const p of rows) (by[p.agent_id] ||= []).push(p); return by;
}
function summarise(a, leads, pays, prog) {
  const rate = rateOf(a, prog);
  const list = (leads || []).map((r) => ({ ...r, ...earnedFrom(r, a, rate) }));
  const earned = list.reduce((s, r) => s + r.earned, 0), paidOut = (pays || []).reduce((s, p) => s + p.amount, 0);
  return { rate, leads: list, payouts: pays || [], earned, paidOut, balance: earned - paidOut,
    clients: list.filter((r) => r.paid > 0).length, count: list.length };
}
const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "Client";
// The agent's own view: no phone numbers or emails of the clients; first name / business only.
export async function dashboard(a0) {
  await schema();
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [a0.id]); // fresh (bank details or payout request may have just changed)
  const prog = await programme();
  const s = summarise(a, (await leadsOf([a]))["agent:" + a.code.toLowerCase()], (await payoutsOf([a.id]))[a.id], prog);
  return {
    agent: { name: a.name, phone: a.phone, email: a.email, city: a.city, code: a.code, bank: a.bank || null, must_change: a.must_change,
      payout_requested_at: a.payout_requested_at, since: a.created_at },
    link: linkFor(a), rate: s.rate, min: prog.min, earned: s.earned, paidOut: s.paidOut, balance: s.balance, count: s.count, clients: s.clients,
    leads: s.leads.map((r) => ({ when: r.created_at, who: r.business || firstName(r.name), what: r.interest, stage: r.self ? "Your own business (not counted)" : STAGE(r, r.paid), earned: r.earned })),
    payouts: s.payouts.map((p) => ({ when: p.created_at, amount: p.amount, ref: p.ref || "" })),
  };
}
export async function saveBank(a, input) {
  const bank = { bank: clip(input.bank, 60), account_no: digits(input.account_no).slice(0, 10), account_name: clip(input.account_name, 100) };
  if (!bank.bank || bank.account_no.length !== 10 || bank.account_name.length < 3) throw new AgentError("Enter your bank, 10-digit account number and the account name.");
  await q(`UPDATE agents SET bank = $2 WHERE id = $1`, [a.id, JSON.stringify(bank)]);
  return bank;
}
export async function requestPayout(a) {
  const d = await dashboard(a);
  if (!d.agent.bank) throw new AgentError("Add your bank details first.");
  if (d.balance < d.min) throw new AgentError(`You can ask for a payout from ${naira(d.min)}. Your balance is ${naira(d.balance)}.`);
  await q(`UPDATE agents SET payout_requested_at = now() WHERE id = $1`, [a.id]);
  const b = d.agent.bank;
  await sendEmail(`Agent payout request: ${a.name}, ${naira(d.balance)}`, `<p><b>${esc(a.name)}</b> (${esc(a.code)}) asked for a payout of <b>${naira(d.balance)}</b>.</p>
    <p>${esc(b.bank)} · ${esc(b.account_no)} · ${esc(b.account_name)}</p><p>After you transfer, record it in Admin → Marketing → Agents so their balance updates.</p>`).catch(() => {});
  return { ok: true, balance: d.balance };
}

// ---------- Admin ----------
export async function adminList() {
  await schema();
  const prog = await programme();
  const agents = await q(`SELECT * FROM agents ORDER BY (status = 'pending') DESC, payout_requested_at DESC NULLS LAST, created_at DESC`);
  const leads = await leadsOf(agents), pays = await payoutsOf(agents.map((a) => a.id));
  return {
    rate: prog.rate, min: prog.min,
    agents: agents.map((a) => {
      const s = a.code ? summarise(a, leads["agent:" + a.code.toLowerCase()], pays[a.id], prog) : { rate: rateOf(a, prog), leads: [], payouts: [], earned: 0, paidOut: 0, balance: 0, clients: 0, count: 0 };
      return { id: a.id, created_at: a.created_at, name: a.name, phone: a.phone, email: a.email, city: a.city, pitch: a.pitch, code: a.code, status: a.status,
        own_rate: a.rate != null ? Number(a.rate) : null, rate: s.rate, bank: a.bank, note: a.note, payout_requested_at: a.payout_requested_at, last_login_at: a.last_login_at,
        link: a.code ? linkFor(a) : "", count: s.count, clients: s.clients, earned: s.earned, paidOut: s.paidOut, balance: s.balance,
        leads: s.leads.slice(0, 50).map((r) => ({ id: r.id, when: r.created_at, name: r.name, business: r.business, interest: r.interest, status: r.status, paid: r.paid, earned: r.earned, self: Boolean(r.self) })),
        payouts: s.payouts };
    }),
  };
}
async function newCode(name) {
  const base = (String(name).replace(/[^A-Za-z]/g, "").slice(0, 5).toUpperCase() || "AGENT");
  for (let i = 0; i < 20; i++) {
    const code = base + (10 + Math.floor(Math.random() * 89));
    const taken = await q(`SELECT 1 FROM agents WHERE lower(code) = lower($1) UNION SELECT 1 FROM customer_requests WHERE lower(ref_code) = lower($1)`, [code]);
    if (!taken.length) return code;
  }
  return base + randomBytes(3).toString("hex").toUpperCase();
}
export async function adminUpdate(id, input) {
  await schema();
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [Number(id)]);
  if (!a) throw new AgentError("Agent not found.", 404);
  const set = {};
  if (input.status) {
    if (!["active", "paused", "declined"].includes(input.status)) throw new AgentError("Unknown status.");
    set.status = input.status;
    if (input.status === "active" && !a.code) set.code = await newCode(a.name);
  }
  if ("rate" in input) { const r = input.rate === "" || input.rate == null ? null : Number(input.rate); if (r != null && !(r > 0 && r <= 50)) throw new AgentError("Commission must be between 1 and 50%."); set.rate = r; }
  if ("note" in input) set.note = clip(input.note, 500) || null;
  const keys = Object.keys(set);
  if (keys.length) await q(`UPDATE agents SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1`, [a.id, ...keys.map((k) => set[k])]);
  const [b] = await q(`SELECT * FROM agents WHERE id = $1`, [a.id]);
  if (set.status === "active" && a.status !== "active" && b.email) {
    const prog = await programme();
    await sendCustomerEmail(b.email, "You're now a SIRRADDO agent 🎉", agentMail(b, [
      `Welcome, ${esc(firstName(b.name))}! Your agent account is approved.`,
      `Your link: <a href="${linkFor(b)}">${linkFor(b)}</a>. Share it with business owners who need a website or app. When they pay for their website, you earn <b>${rateOf(b, prog)}%</b> of it.`,
      `Log in to your dashboard with your WhatsApp number and the password you chose, to see your clients and earnings.`,
    ], { url: `${SITE_URL}/agents#login`, label: "Open my dashboard" })).catch(() => {});
  }
  return b;
}
export async function adminResetPassword(id) {
  await schema();
  const pass = newPassword();
  const [a] = await q(`UPDATE agents SET pass_hash = $2, must_change = true WHERE id = $1 RETURNING id`, [Number(id), hashPass(pass)]);
  if (!a) throw new AgentError("Agent not found.", 404);
  return { password: pass };
}
export async function adminPayout(id, input) {
  await schema();
  const amount = Math.round(Number(String(input.amount || "").replace(/[^\d.]/g, "")));
  if (!(amount > 0)) throw new AgentError("Enter the amount you paid.");
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [Number(id)]);
  if (!a) throw new AgentError("Agent not found.", 404);
  await q(`INSERT INTO agent_payouts (agent_id, amount, ref, note) VALUES ($1,$2,$3,$4)`, [a.id, amount, clip(input.ref, 80) || null, clip(input.note, 200) || null]);
  await q(`UPDATE agents SET payout_requested_at = NULL WHERE id = $1`, [a.id]);
  if (a.email) await sendCustomerEmail(a.email, `We've paid you ${naira(amount)}`, agentMail(a, [
    `We've sent <b>${naira(amount)}</b> to your bank account${a.bank ? ` (${esc(a.bank.bank)}, ${esc(a.bank.account_no)})` : ""}.${input.ref ? ` Reference: ${esc(clip(input.ref, 80))}.` : ""}`,
    "Thank you for bringing us clients. Keep sharing your link!",
  ], { url: `${SITE_URL}/agents#login`, label: "See my earnings" })).catch(() => {});
  return { ok: true };
}

// ---------- Daily: tell agents about new leads and new earnings ----------
export async function dailyAgentNews(report = {}) {
  await schema();
  const prog = await programme();
  const agents = await q(`SELECT * FROM agents WHERE status = 'active' AND code IS NOT NULL AND email IS NOT NULL`);
  const leads = await leadsOf(agents);
  let sent = 0;
  for (const a of agents) {
    const s = summarise(a, leads["agent:" + a.code.toLowerCase()], [], prog);
    const seen = a.notified || {}, newLeads = s.count - (seen.count || 0), newMoney = s.earned - (seen.earned || 0);
    if (newLeads <= 0 && newMoney <= 0) { if (s.count !== (seen.count || 0) || s.earned !== (seen.earned || 0)) await q(`UPDATE agents SET notified = $2 WHERE id = $1`, [a.id, JSON.stringify({ count: s.count, earned: s.earned })]); continue; }
    const lines = [];
    if (newMoney > 0) lines.push(`🎉 You earned <b>${naira(newMoney)}</b> more: a client you brought has paid. Your balance is now ${naira(s.earned - (await q(`SELECT coalesce(sum(amount),0)::int AS t FROM agent_payouts WHERE agent_id = $1`, [a.id]))[0].t)}.`);
    if (newLeads > 0) lines.push(`${newLeads === 1 ? "A new business" : newLeads + " new businesses"} contacted us through your link. We're talking to ${newLeads === 1 ? "them" : "them"} now.`);
    try {
      await sendCustomerEmail(a.email, newMoney > 0 ? `You earned ${naira(newMoney)} 🎉` : "New client through your link", agentMail(a, lines, { url: `${SITE_URL}/agents#login`, label: "Open my dashboard" }));
      await q(`UPDATE agents SET notified = $2 WHERE id = $1`, [a.id, JSON.stringify({ count: s.count, earned: s.earned })]);
      sent++;
    } catch (e) { console.error("agent news email failed", e.message); }
  }
  report.agentEmails = sent;
  return sent;
}

function agentMail(a, lines, btn) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1B2433;line-height:1.55">
  <div style="background:#13254F;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;border-bottom:4px solid #D9A21B"><b style="font-size:18px">SIRRADDO</b> <span style="opacity:.8">Agents</span></div>
  <div style="border:1px solid #E5E9F0;border-top:0;border-radius:0 0 12px 12px;padding:18px 20px">
  <p>Hello ${esc(firstName(a.name))},</p>${lines.map((l) => `<p>${l}</p>`).join("")}
  ${btn ? `<p><a href="${btn.url}" style="display:inline-block;background:#D9A21B;color:#13254F;font-weight:700;text-decoration:none;border-radius:10px;padding:11px 18px">${btn.label}</a></p>` : ""}
  <p style="font-size:13px;color:#6B7280">SIRRADDO GLOBAL LIMITED · WhatsApp +234 816 755 0937</p></div></div>`;
}

// The QR code of an active agent's link, as SVG (navy on white, a quiet border so phones read it easily).
export async function agentQr(code) {
  await schema();
  if (!/^[A-Za-z0-9]{3,20}$/.test(code)) return null;
  const [a] = await q(`SELECT code FROM agents WHERE lower(code) = lower($1) AND status = 'active'`, [code]);
  if (!a) return null;
  const QRCode = (await import("qrcode")).default;
  return QRCode.toString(linkFor(a), { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#13254F", light: "#FFFFFF" } });
}
