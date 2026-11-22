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
export const PROSPECT_DAYS = 90;     // a registered prospect stays the agent's for 90 days
export const DEFAULT_INVITE_BONUS = 2000; // to an agent when someone they invited earns their first commission
export const DEFAULT_TIERS = [{ clients: 5, rate: 12 }, { clients: 15, rate: 15 }]; // from the 5th paying client 12%, from the 15th 15%

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
  await q(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS invited_by INTEGER`);
  await q(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS news_seen_at TIMESTAMPTZ`);
  await q(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS trained_at TIMESTAMPTZ`); // passed the training quiz in the dashboard
  // Businesses an agent is talking to: theirs for 90 days, even if the owner contacts us directly.
  await q(`CREATE TABLE IF NOT EXISTS agent_prospects (
    id SERIAL PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    business TEXT, name TEXT, phone TEXT NOT NULL, interest TEXT, note TEXT, request_id INTEGER)`);
  await q(`CREATE INDEX IF NOT EXISTS agent_prospects_phone ON agent_prospects (phone)`);
  // Extra money we give an agent (top agent of the month, a promo…), on top of commission.
  await q(`CREATE TABLE IF NOT EXISTS agent_bonuses (
    id SERIAL PRIMARY KEY, agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    amount INTEGER NOT NULL, note TEXT)`);
  // Announcements to all agents.
  await q(`CREATE TABLE IF NOT EXISTS agent_news (
    id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), title TEXT NOT NULL, body TEXT, link TEXT, emailed INTEGER NOT NULL DEFAULT 0)`);
  ready = true;
}

export class AgentError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const digits = (v) => String(v || "").replace(/\D/g, "");
// 0803… and +234803… are the same number.
export const normPhone = (v) => { let d = digits(v); if (d.startsWith("234")) d = "0" + d.slice(3); if (d.length === 10 && !d.startsWith("0")) d = "0" + d; return d; };
const naira = (n) => "₦" + Math.round(Number(n) || 0).toLocaleString("en-NG");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "5:12,15:15" → from the 5th paying client 12%, from the 15th 15%. "off" → no levels.
export function parseTiers(v) {
  if (v == null || v === "") return DEFAULT_TIERS;
  if (/^off$/i.test(String(v).trim())) return [];
  return String(v).split(",").map((x) => x.split(":").map(Number)).filter(([c, r]) => c >= 2 && c <= 1000 && r > 0 && r <= 50)
    .map(([clients, rate]) => ({ clients, rate })).sort((a, b) => a.clients - b.clients).slice(0, 4);
}
export async function programme() {
  const s = await getSettings();
  const rate = Number(s.agent_rate); const min = Number(s.agent_min); const inv = Number(s.agent_invite_bonus);
  return { rate: rate > 0 && rate <= 50 ? rate : DEFAULT_RATE, min: min >= 1000 ? min : DEFAULT_MIN,
    tiers: parseTiers(s.agent_tiers), inviteBonus: s.agent_invite_bonus === "0" ? 0 : inv >= 0 && inv <= 100000 && s.agent_invite_bonus ? inv : DEFAULT_INVITE_BONUS };
}
export const linkFor = (a) => `${SITE_URL}/?a=${encodeURIComponent(a.code)}`;
const rateOf = (a, prog) => (a.rate != null && Number(a.rate) > 0 ? Number(a.rate) : prog.rate);
// The rate for an agent's k-th paying client (1 = first): their own fixed rate, or the level they've reached.
const rateFor = (a, prog, k) => (a.rate != null && Number(a.rate) > 0 ? Number(a.rate) : prog.tiers.reduce((r, t) => (k >= t.clients ? Math.max(r, t.rate) : r), prog.rate));
const LEVELS = ["Agent", "Silver agent", "Gold agent", "Platinum agent", "Diamond agent"];
function levelOf(a, prog, paying) {
  if (a.rate != null && Number(a.rate) > 0) return { name: "Agent", rate: Number(a.rate), next: null };
  const reached = prog.tiers.filter((t) => paying >= t.clients).length;
  const nx = prog.tiers[reached];
  return { name: LEVELS[reached] || LEVELS[LEVELS.length - 1], rate: rateFor(a, prog, paying + 1), next: nx ? { name: LEVELS[reached + 1], clients: nx.clients, rate: nx.rate, need: nx.clients - paying } : null };
}

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
  // Invited by another agent (their invite link /agents?by=CODE)?
  const by = /^[A-Za-z0-9]{3,20}$/.test(String(input.by || "")) ? (await q(`SELECT id, name FROM agents WHERE lower(code) = lower($1) AND status = 'active'`, [input.by]))[0] : null;
  const [a] = await q(`INSERT INTO agents (name, phone, email, city, pitch, pass_hash, invited_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name, phone, email || null, city || null, pitch || null, hashPass(input.password), by?.id || null]);
  await sendEmail(`New agent application: ${name} (${city || "no city"})`, `<p><b>${esc(name)}</b> applied to become a SIRRADDO agent.</p>
    <p>WhatsApp: ${esc(phone)}<br>Email: ${esc(email || "—")}<br>City: ${esc(city || "—")}${by ? `<br>Invited by agent: ${esc(by.name)}` : ""}</p>${pitch ? `<p>How they'll find clients: ${esc(pitch)}</p>` : ""}
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
// The build payments (deposit/balance; refunds are negative) a lead made within 12 months of coming in.
function buildPayments(r) {
  const start = new Date(r.created_at).getTime(), end = start + WINDOW_DAYS * 86400000;
  return (Array.isArray(r.payments) ? r.payments : []).filter((p) => (p.kind || "project") === "project" && Number(p.amount))
    .map((p) => ({ date: p.date, t: new Date(p.date).getTime(), amount: Number(p.amount) })).filter((p) => p.t <= end && p.t >= start - 86400000).sort((x, y) => x.t - y.t);
}
// Every commission line for an agent: rate% of each build payment, the rate depending on whether this client is
// their 1st, 5th, 15th… paying client (levels). Their own business (same phone) never counts.
function commissions(a, leads, prog) {
  const list = (leads || []).map((r) => {
    const self = Boolean(normPhone(r.contact) && normPhone(r.contact) === a.phone);
    const pays = self ? [] : buildPayments(r);
    const first = pays.find((p) => p.amount > 0);
    return { ...r, self, pays, firstPaid: first ? first.t : null };
  });
  const paying = list.filter((r) => r.firstPaid != null).sort((x, y) => x.firstPaid - y.firstPaid);
  paying.forEach((r, i) => { r.rate = rateFor(a, prog, i + 1); });
  const lines = [];
  for (const r of list) {
    r.paid = Math.max(0, r.pays.reduce((s2, p) => s2 + p.amount, 0));
    let sum = 0;
    for (const p of r.pays) { const c = Math.trunc((p.amount * (r.rate || 0)) / 100); sum += c; lines.push({ t: p.t, date: p.date, lead: r, amount: p.amount, rate: r.rate, commission: c }); }
    r.earned = Math.max(0, sum);
  }
  return { list, paying: paying.length, lines };
}
async function payoutsOf(ids) {
  if (!ids.length) return {};
  const rows = await q(`SELECT * FROM agent_payouts WHERE agent_id = ANY($1) ORDER BY created_at DESC`, [ids]);
  const by = {}; for (const p of rows) (by[p.agent_id] ||= []).push(p); return by;
}
async function bonusesOf(ids) {
  if (!ids.length) return {};
  const rows = await q(`SELECT * FROM agent_bonuses WHERE agent_id = ANY($1) ORDER BY created_at DESC`, [ids]);
  const by = {}; for (const x of rows) (by[x.agent_id] ||= []).push(x); return by;
}
// Invite bonuses: for each agent someone invited, once that agent has earned their first commission.
async function invitesOf(ids, prog) {
  if (!ids.length) return {};
  const recruits = await q(`SELECT * FROM agents WHERE invited_by = ANY($1) AND code IS NOT NULL`, [ids]);
  if (!recruits.length) return {};
  const leads = await leadsOf(recruits);
  const by = {};
  for (const r of recruits) {
    const c = commissions(r, leads["agent:" + r.code.toLowerCase()], prog);
    const firstLine = c.lines.filter((l) => l.commission > 0).sort((x, y) => x.t - y.t)[0];
    (by[r.invited_by] ||= []).push({ id: r.id, name: r.name, since: r.created_at, status: r.status, earnedYet: Boolean(firstLine), bonus: firstLine ? prog.inviteBonus : 0, t: firstLine ? firstLine.t : null });
  }
  return by;
}
function summarise(a, leads, pays, prog, bonuses = [], invites = []) {
  const c = commissions(a, leads, prog);
  const earned = c.list.reduce((s2, r) => s2 + r.earned, 0), paidOut = (pays || []).reduce((s2, p) => s2 + p.amount, 0);
  const bonusTotal = (bonuses || []).reduce((s2, x) => s2 + x.amount, 0), inviteTotal = (invites || []).reduce((s2, x) => s2 + x.bonus, 0);
  return { rate: rateOf(a, prog), level: levelOf(a, prog, c.paying), leads: c.list, lines: c.lines, payouts: pays || [], bonuses: bonuses || [], invites: invites || [],
    earned, bonusTotal, inviteTotal, paidOut, balance: earned + bonusTotal + inviteTotal - paidOut, clients: c.paying, count: c.list.length };
}
const firstName = (s) => String(s || "").trim().split(/\s+/)[0] || "Client";
// The agent's own view: no phone numbers or emails of the clients; first name / business only.
export async function dashboard(a0) {
  await schema();
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [a0.id]); // fresh (bank details or payout request may have just changed)
  const prog = await programme();
  const s = summarise(a, (await leadsOf([a]))["agent:" + a.code.toLowerCase()], (await payoutsOf([a.id]))[a.id], prog, (await bonusesOf([a.id]))[a.id], (await invitesOf([a.id], prog))[a.id]);
  const news = await q(`SELECT id, created_at, title, body, link FROM agent_news ORDER BY created_at DESC LIMIT 5`);
  const pros = await q(`SELECT p.*, r.status AS req_status, r.payments AS req_payments FROM agent_prospects p LEFT JOIN customer_requests r ON r.id = p.request_id WHERE p.agent_id = $1 ORDER BY p.created_at DESC LIMIT 50`, [a.id]);
  const claimed = new Set(s.leads.map((r) => normPhone(r.contact)));
  return {
    agent: { name: a.name, phone: a.phone, email: a.email, city: a.city, code: a.code, bank: a.bank || null, must_change: a.must_change,
      payout_requested_at: a.payout_requested_at, since: a.created_at, trained_at: a.trained_at || null },
    training: trainingQuiz(),
    link: linkFor(a), inviteLink: `${SITE_URL}/agents?by=${encodeURIComponent(a.code)}`, demoLink: `${SITE_URL}/demo?a=${encodeURIComponent(a.code)}`,
    rate: s.level.rate, level: s.level, tiers: a.rate != null && Number(a.rate) > 0 ? [] : prog.tiers, base: prog.rate, min: prog.min, inviteBonus: prog.inviteBonus,
    earned: s.earned, bonusTotal: s.bonusTotal, inviteTotal: s.inviteTotal, paidOut: s.paidOut, balance: s.balance, count: s.count, clients: s.clients,
    leads: s.leads.map((r) => ({ when: r.created_at, who: r.business || firstName(r.name), what: r.interest, stage: r.self ? "Your own business (not counted)" : STAGE(r, r.paid), earned: r.earned, rate: r.rate || null })),
    payouts: s.payouts.map((p) => ({ when: p.created_at, amount: p.amount, ref: p.ref || "" })),
    bonuses: s.bonuses.map((x) => ({ when: x.created_at, amount: x.amount, note: x.note || "" })),
    invites: s.invites.map((x) => ({ who: firstName(x.name), since: x.since, earnedYet: x.earnedYet, bonus: x.bonus })),
    prospects: pros.map((p) => {
      const until = new Date(new Date(p.created_at).getTime() + PROSPECT_DAYS * 86400000);
      const contacted = claimed.has(p.phone);
      return { when: p.created_at, who: p.business || firstName(p.name), what: p.interest, until, status: contacted ? "Talking to us: counted as yours" : until < new Date() ? "Expired" : "Protected" };
    }),
    news: news.map((n) => ({ ...n, fresh: !a.news_seen_at || new Date(n.created_at) > new Date(a.news_seen_at) })),
    top: await leaderboard(),
  };
}
// ----- Agent training: five short lessons in the dashboard, then a quiz checked here -----
// Right answers stay on the server; the dashboard only gets the questions.
const TRAINING_QUIZ = [
  { q: "A business owner wants to pay. Where does the money go?", options: ["To you, then you pass it on", "Straight to SIRRADDO, by the invoice link or bank transfer", "Half to you, half to SIRRADDO"], answer: 1 },
  { q: "What does a Starter website cost in the first year?", options: ["₦50,000, with the domain and hosting included", "₦50,000 plus hosting", "₦25,000 a month"], answer: 0 },
  { q: "When do you earn commission?", options: ["When the business owner says yes", "When the client pays SIRRADDO for their website", "Every time you share your link"], answer: 1 },
  { q: "You registered a business in your dashboard. How long is it counted as yours?", options: ["7 days", "30 days", "90 days"], answer: 2 },
  { q: "An owner says \"What if I don't like it?\" What is true?", options: ["They must pay in full first", "They see their website before paying the balance, and can ask for changes", "There are no changes after the deposit"], answer: 1 },
  { q: "Which of these is NOT allowed?", options: ["Showing a demo website on your phone", "Following up after 2–3 days", "Promising a price or discount SIRRADDO hasn't offered"], answer: 2 },
];
export const trainingQuiz = () => TRAINING_QUIZ.map((x) => ({ q: x.q, options: x.options }));
export async function finishTraining(a, answers) {
  await schema();
  const got = Array.isArray(answers) ? answers.map(Number) : [];
  const wrong = TRAINING_QUIZ.map((x, i) => (got[i] === x.answer ? -1 : i)).filter((i) => i >= 0);
  if (wrong.length) return { ok: false, wrong, message: `${TRAINING_QUIZ.length - wrong.length} of ${TRAINING_QUIZ.length} right. Read the lessons again and try once more.` };
  await q(`UPDATE agents SET trained_at = COALESCE(trained_at, now()) WHERE id = $1`, [a.id]);
  return { ok: true, ...(await dashboard(a)) };
}

export async function newsSeen(a) { await q(`UPDATE agents SET news_seen_at = now() WHERE id = $1`, [a.id]); return { ok: true }; }

// ---------- Register a prospect ----------
export async function registerProspect(a, input) {
  await schema();
  const phone = normPhone(input.phone), business = clip(input.business, 120), name = clip(input.name, 80);
  const interest = ["Starter website", "Business website", "Online Store", "Custom app", "Not sure yet"].includes(input.interest) ? input.interest : "Not sure yet";
  const note = clip(input.note, 400);
  if (!business && !name) throw new AgentError("Enter the business name or the owner's name.");
  if (!/^0[789]\d{9}$/.test(phone)) throw new AgentError("Enter the business owner's phone number, e.g. 08031234567.");
  if (phone === a.phone) throw new AgentError("Your own business can't be registered as a prospect.");
  const today = await q(`SELECT count(*)::int AS n FROM agent_prospects WHERE agent_id = $1 AND created_at > now() - interval '1 day'`, [a.id]);
  if (today[0].n >= 30) throw new AgentError("That's 30 businesses today. Please add more tomorrow.");
  const taken = await q(`SELECT p.agent_id FROM agent_prospects p WHERE p.phone = $1 AND p.created_at > now() - make_interval(days => $2)`, [phone, PROSPECT_DAYS]);
  if (taken.some((x) => x.agent_id === a.id)) throw new AgentError("You've already registered this business.");
  if (taken.length) throw new AgentError("Another agent already registered this business.");
  const known = await q(`SELECT came_from FROM customer_requests WHERE regexp_replace(contact, '\\D', '', 'g') IN ($1, $2)`, [phone, "234" + phone.slice(1)]);
  if (known.length) throw new AgentError(known.some((r) => r.came_from === "agent:" + a.code.toLowerCase()) ? "This business already came through your link: it's counted as yours." : "This business is already talking to us, so it can't be registered.");
  let requestId = null;
  if (input.contact_us !== false) {
    const { saveRequest } = await import("./store.mjs");
    const saved = await saveRequest({ sessionId: `agent-${a.id}-${Date.now()}-${randomBytes(3).toString("hex")}`, source: "agent", name: name || business, contact: phone,
      business: business || null, interest: interest === "Not sure yet" ? "Other" : interest, details: `Registered by agent ${a.name} (${a.code}).${note ? " Note: " + note : ""}`, cameFrom: "agent:" + a.code.toLowerCase() });
    requestId = saved?.id || null;
  }
  await q(`INSERT INTO agent_prospects (agent_id, business, name, phone, interest, note, request_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [a.id, business || null, name || null, phone, interest, note || null, requestId]);
  return dashboard(a);
}
// A new request whose phone an agent registered (in the last 90 days) is credited to that agent.
export async function claimProspect(requestId, contact) {
  await schema();
  const phone = normPhone(contact);
  if (!/^0\d{10}$/.test(phone)) return false;
  const [p] = await q(`SELECT p.*, a.code FROM agent_prospects p JOIN agents a ON a.id = p.agent_id WHERE p.phone = $1 AND p.created_at > now() - make_interval(days => $2) AND a.code IS NOT NULL ORDER BY p.created_at ASC LIMIT 1`, [phone, PROSPECT_DAYS]);
  if (!p) return false;
  await q(`UPDATE customer_requests SET came_from = $2 WHERE id = $1`, [requestId, "agent:" + p.code.toLowerCase()]);
  return true;
}

// ---------- Top agents this month (first name + initial, city) ----------
export async function leaderboard(limit = 5) {
  const prog = await programme();
  const agents = await q(`SELECT * FROM agents WHERE status = 'active' AND code IS NOT NULL`);
  const leads = await leadsOf(agents);
  const m0 = new Date(); m0.setUTCDate(1); m0.setUTCHours(0, 0, 0, 0);
  return agents.map((a) => {
    const c = commissions(a, leads["agent:" + a.code.toLowerCase()], prog);
    const month = c.lines.filter((l) => l.t >= m0.getTime());
    const clients = new Set(month.filter((l) => l.amount > 0).map((l) => l.lead.id)).size;
    return { name: a.name.split(/\s+/)[0] + (a.name.split(/\s+/)[1] ? " " + a.name.split(/\s+/)[1][0] + "." : ""), city: a.city || "", clients, earned: month.reduce((s2, l) => s2 + l.commission, 0) };
  }).filter((x) => x.clients > 0).sort((x, y) => y.clients - x.clients || y.earned - x.earned).slice(0, limit).map((x) => ({ name: x.name, city: x.city, clients: x.clients }));
}

// ---------- Monthly statement ----------
export async function statement(a0, month) {
  await schema();
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw new AgentError("Pick a month.");
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [a0.id]);
  const prog = await programme();
  const start = new Date(month + "-01T00:00:00Z").getTime(), end = new Date(new Date(start).setUTCMonth(new Date(start).getUTCMonth() + 1)).getTime();
  const s = summarise(a, (await leadsOf([a]))["agent:" + a.code.toLowerCase()], (await payoutsOf([a.id]))[a.id], prog, (await bonusesOf([a.id]))[a.id], (await invitesOf([a.id], prog))[a.id]);
  const inMonth = (t) => t >= start && t < end, before = (t) => t < start;
  const lines = [
    ...s.lines.map((l) => ({ t: l.t, kind: "Commission", what: `${l.lead.business || firstName(l.lead.name)} paid ${naira(l.amount)} (${l.rate}%)`, amount: l.commission })),
    ...s.bonuses.map((x) => ({ t: new Date(x.created_at).getTime(), kind: "Bonus", what: x.note || "Bonus", amount: x.amount })),
    ...s.invites.filter((x) => x.t).map((x) => ({ t: x.t, kind: "Invite bonus", what: `${firstName(x.name)} earned their first commission`, amount: x.bonus })),
    ...s.payouts.map((p) => ({ t: new Date(p.created_at).getTime(), kind: "Paid to you", what: p.ref ? "Ref " + p.ref : "Bank transfer", amount: -p.amount })),
  ];
  const opening = lines.filter((l) => before(l.t)).reduce((x, l) => x + l.amount, 0);
  const rows = lines.filter((l) => inMonth(l.t)).sort((x, y) => x.t - y.t).map((l) => ({ date: new Date(l.t).toISOString().slice(0, 10), kind: l.kind, what: l.what, amount: l.amount }));
  const earned = rows.filter((r) => r.amount > 0 || r.kind === "Commission").reduce((x, r) => x + (r.kind === "Paid to you" ? 0 : r.amount), 0);
  const paid = -rows.filter((r) => r.kind === "Paid to you").reduce((x, r) => x + r.amount, 0);
  return { agent: { name: a.name, code: a.code, phone: a.phone, bank: a.bank || null }, month, opening, earned, paid, closing: opening + earned - paid, rows };
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
  const ids = agents.map((a) => a.id);
  const leads = await leadsOf(agents), pays = await payoutsOf(ids), bons = await bonusesOf(ids), invs = await invitesOf(ids, prog);
  const pros = ids.length ? await q(`SELECT agent_id, count(*)::int AS n, count(*) FILTER (WHERE created_at > now() - make_interval(days => $2))::int AS live FROM agent_prospects WHERE agent_id = ANY($1) GROUP BY agent_id`, [ids, PROSPECT_DAYS]) : [];
  const proBy = Object.fromEntries(pros.map((x) => [x.agent_id, x]));
  const byId = Object.fromEntries(agents.map((a) => [a.id, a]));
  const news = await q(`SELECT * FROM agent_news ORDER BY created_at DESC LIMIT 10`);
  return {
    rate: prog.rate, min: prog.min, tiers: prog.tiers, inviteBonus: prog.inviteBonus, news, top: await leaderboard(10),
    agents: agents.map((a) => {
      const s = a.code ? summarise(a, leads["agent:" + a.code.toLowerCase()], pays[a.id], prog, bons[a.id], invs[a.id]) : summarise(a, [], [], prog);
      return { id: a.id, created_at: a.created_at, name: a.name, phone: a.phone, email: a.email, city: a.city, pitch: a.pitch, code: a.code, status: a.status,
        own_rate: a.rate != null ? Number(a.rate) : null, rate: s.level.rate, level: s.level.name, bank: a.bank, note: a.note, payout_requested_at: a.payout_requested_at, last_login_at: a.last_login_at, trained_at: a.trained_at || null,
        invited_by: a.invited_by ? (byId[a.invited_by]?.name || "another agent") : null,
        link: a.code ? linkFor(a) : "", count: s.count, clients: s.clients, earned: s.earned, bonusTotal: s.bonusTotal, inviteTotal: s.inviteTotal, paidOut: s.paidOut, balance: s.balance,
        prospects: proBy[a.id]?.live || 0, invites: s.invites.length,
        leads: s.leads.slice(0, 50).map((r) => ({ id: r.id, when: r.created_at, name: r.name, business: r.business, interest: r.interest, status: r.status, paid: r.paid, earned: r.earned, rate: r.rate || null, self: Boolean(r.self) })),
        payouts: s.payouts, bonuses: s.bonuses };
    }),
  };
}
export async function adminBonus(id, input) {
  await schema();
  const amount = Math.round(Number(String(input.amount || "").replace(/[^\d.]/g, "")));
  if (!(amount > 0 && amount <= 1000000)) throw new AgentError("Enter the bonus amount.");
  const note = clip(input.note, 120) || "Bonus";
  const [a] = await q(`SELECT * FROM agents WHERE id = $1`, [Number(id)]);
  if (!a) throw new AgentError("Agent not found.", 404);
  await q(`INSERT INTO agent_bonuses (agent_id, amount, note) VALUES ($1,$2,$3)`, [a.id, amount, note]);
  if (a.email) await sendCustomerEmail(a.email, `You got a ${naira(amount)} bonus 🎉`, agentMail(a, [`We've added a <b>${naira(amount)}</b> bonus to your balance: ${esc(note)}.`, "Thank you for the great work!"], { url: `${SITE_URL}/agents#login`, label: "See my balance" })).catch(() => {});
  return { ok: true };
}
// An announcement to every agent: on their dashboard, and by email if asked (we stay inside the daily email limit).
export async function adminNews(input) {
  await schema();
  const title = clip(input.title, 120), body = String(input.body || "").trim().slice(0, 1500), link = clip(input.link, 300);
  if (!title) throw new AgentError("Give the announcement a title.");
  if (link && !/^https:\/\//.test(link)) throw new AgentError("The link must start with https://");
  const [n] = await q(`INSERT INTO agent_news (title, body, link) VALUES ($1,$2,$3) RETURNING *`, [title, body || null, link || null]);
  let sent = 0;
  if (input.email) {
    const list = await q(`SELECT * FROM agents WHERE status = 'active' AND email IS NOT NULL ORDER BY last_login_at DESC NULLS LAST LIMIT 60`);
    for (const a of list) {
      try { await sendCustomerEmail(a.email, title, agentMail(a, [esc(title).bold(), ...(body ? body.split(/\n{2,}/).map((p2) => esc(p2).replace(/\n/g, "<br>")) : [])], link ? { url: link, label: "Open" } : { url: `${SITE_URL}/agents#login`, label: "Open my dashboard" })); sent++; }
      catch (e) { console.error("agent news email failed", e.message); break; } // over the email limit: the rest see it on their dashboard
    }
    await q(`UPDATE agent_news SET emailed = $2 WHERE id = $1`, [n.id, sent]);
  }
  return { ok: true, emailed: sent };
}
export async function adminNewsDelete(id) { await schema(); await q(`DELETE FROM agent_news WHERE id = $1`, [Number(id)]); return { ok: true }; }

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
  const ids = agents.map((a) => a.id);
  const leads = await leadsOf(agents), pays = await payoutsOf(ids), bons = await bonusesOf(ids), invs = await invitesOf(ids, prog);
  let sent = 0;
  for (const a of agents) {
    const s = summarise(a, leads["agent:" + a.code.toLowerCase()], pays[a.id], prog, bons[a.id], invs[a.id]);
    const auto = s.earned + s.inviteTotal; // bonuses we add by hand already send their own email
    const seen = a.notified || {}, newLeads = s.count - (seen.count || 0), newMoney = auto - (seen.earned || 0);
    const mark = () => q(`UPDATE agents SET notified = $2 WHERE id = $1`, [a.id, JSON.stringify({ count: s.count, earned: auto })]);
    if (newLeads <= 0 && newMoney <= 0) { if (s.count !== (seen.count || 0) || auto !== (seen.earned || 0)) await mark(); continue; }
    const lines = [];
    if (newMoney > 0) lines.push(`🎉 You earned <b>${naira(newMoney)}</b> more: a client you brought has paid${s.inviteTotal > (seen.invite || 0) ? " (or an agent you invited earned their first commission)" : ""}. Your balance is now ${naira(s.balance)}.`);
    if (newLeads > 0) lines.push(`${newLeads === 1 ? "A new business" : newLeads + " new businesses"} contacted us through you. We're talking to them now.`);
    if (s.level.next && newMoney > 0) lines.push(`${s.level.next.need} more paying client${s.level.next.need === 1 ? "" : "s"} and you become a ${s.level.next.name}, earning ${s.level.next.rate}%.`);
    try {
      await sendCustomerEmail(a.email, newMoney > 0 ? `You earned ${naira(newMoney)} 🎉` : "New client through your link", agentMail(a, lines, { url: `${SITE_URL}/agents#login`, label: "Open my dashboard" }));
      await mark();
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

// For "Invited by Tolu" on the apply form (first name only).
export async function inviterName(code) {
  await schema();
  const [a] = await q(`SELECT name FROM agents WHERE lower(code) = lower($1) AND status = 'active'`, [code]);
  return a ? firstName(a.name) : null;
}
