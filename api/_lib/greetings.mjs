// Festive greetings. During each festival a greeting banner shows on sirraddo.com.ng automatically.
// Emailing it to customers is optional: you tap "Email everyone" in Admin → Settings (any time before), and the
// emails go out from the festival day in daily batches, so the free email plan's 100-a-day limit is
// never used up by greetings.
import { createHmac } from "node:crypto";
import { q, ensureSchema, getMeta, setMeta, getRequest, customerEmail, customerEmailConfigured, sendCustomerEmail, esc } from "./store.mjs";
import { customerHtml, SITE } from "./automation.mjs";

export const GREETING_EMAILS_PER_DAY = 60; // leaves room under Resend's free 100/day for invoices and alerts

// Islamic festivals follow the moon: these are the expected dates, confirmed by the Sultan of Sokoto's
// announcement each year. Change a date in Admin → Settings → Festive greetings when it is announced.
const EID_FITR = { 2026: "2026-03-20", 2027: "2027-03-10", 2028: "2028-02-27", 2029: "2029-02-15", 2030: "2030-02-05" };
const EID_ADHA = { 2026: "2026-05-27", 2027: "2027-05-16", 2028: "2028-05-05", 2029: "2029-04-24", 2030: "2030-04-13" };

function easterSunday(y) { // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The banner starts on the day itself and stays up for a few days after (before = days earlier, after = days later).
export const FESTIVALS = [
  { id: "new_year", name: "New Year", emoji: "🎉", title: "Happy New Year", before: 0, after: 3, date: (y) => `${y}-01-01`,
    message: "Thank you for being part of our story. We wish you and your business a prosperous new year." },
  { id: "eid_fitr", name: "Eid al-Fitr (Sallah)", emoji: "🌙", title: "Eid Mubarak", before: 0, after: 3, date: (y) => EID_FITR[y], moon: true,
    message: "Barka da Sallah! We wish you and your family peace, joy and blessings this Eid." },
  { id: "easter", name: "Easter", emoji: "🌿", title: "Happy Easter", before: 0, after: 3, date: easterSunday,
    message: "Wishing you and your family a joyful, peaceful Easter celebration." },
  { id: "eid_adha", name: "Eid al-Adha (Sallah)", emoji: "🌙", title: "Eid Mubarak", before: 0, after: 3, date: (y) => EID_ADHA[y], moon: true,
    message: "Barka da Sallah! May this Eid bring you and your loved ones happiness and blessings." },
  { id: "independence", name: "Independence Day", emoji: "🇳🇬", title: "Happy Independence Day", before: 0, after: 3, date: (y) => `${y}-10-01`,
    message: "Happy Independence Day, Nigeria! Proud to help Nigerian businesses grow online." },
  { id: "christmas", name: "Christmas", emoji: "🎄", title: "Merry Christmas", before: 0, after: 4, date: (y) => `${y}-12-25`,
    message: "Thank you for your support this year. We wish you a merry Christmas and a wonderful festive season." },
];

const lagosToday = (now = new Date()) => new Date(now.getTime() + 3600 * 1000).toISOString().slice(0, 10);
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export async function getConfig() {
  const raw = (await getMeta(["greetings"])).greetings;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// This year's and next year's occurrences, with your on/off, message and any date you changed.
export function occurrences(config, now = new Date()) {
  const today = lagosToday(now), y = Number(today.slice(0, 4));
  const out = [];
  for (const f of FESTIVALS) {
    const c = config[f.id] || {};
    for (const year of [y, y + 1]) {
      const date = c.dates?.[year] || f.date(year);
      if (!date) continue;
      const from = addDays(date, -f.before), to = addDays(date, f.after);
      if (to < today) continue;
      out.push({ id: f.id, key: `${f.id}:${year}`, year, name: f.name, emoji: f.emoji, title: f.title, date, from, to, moon: Boolean(f.moon),
        sendFrom: date, on: c.on !== false, message: c.message || f.message, defaultMessage: f.message, showing: today >= from && today <= to });
      break; // only the next one for each festival
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

export async function currentGreeting(now = new Date()) {
  const o = occurrences(await getConfig(), now).find((x) => x.showing && x.on);
  return o ? { key: o.key, id: o.id, emoji: o.emoji, title: o.title, message: o.message, until: o.to } : null;
}

export async function saveConfig(changes) {
  const config = await getConfig();
  for (const f of FESTIVALS) {
    const ch = changes?.[f.id];
    if (!ch) continue;
    const c = config[f.id] || {};
    if (typeof ch.on === "boolean") c.on = ch.on;
    if (typeof ch.message === "string") c.message = ch.message.trim().slice(0, 400) || undefined;
    if (ch.year && ch.date !== undefined) {
      if (ch.date && !/^\d{4}-\d{2}-\d{2}$/.test(ch.date)) throw new Error("Use a date like 2027-03-10");
      c.dates = { ...(c.dates || {}) };
      if (ch.date) c.dates[ch.year] = ch.date; else delete c.dates[ch.year];
    }
    config[f.id] = c;
  }
  await setMeta("greetings", JSON.stringify(config));
  return config;
}

// ---------- Optional emails ----------
const unsubSig = (id) => createHmac("sha256", "sirraddo-greetings:" + (process.env.CRON_SECRET || process.env.ADMIN_PASSWORD || "")).update(String(id)).digest("base64url").slice(0, 16);
export const unsubLink = (id) => `${SITE}/api/site?nogreet=${id}.${unsubSig(id)}`;
export async function unsubscribe(token) {
  const [id, sig] = String(token || "").split(".");
  if (!/^\d+$/.test(id || "") || sig !== unsubSig(id)) return false;
  await ensureSchema();
  await q(`UPDATE customer_requests SET greetings_off = true WHERE id = $1`, [Number(id)]);
  return true;
}

// Clients, plus anyone who contacted you in the last year (not marked lost, not opted out), with an email.
export async function audience() {
  await ensureSchema();
  const rows = await q(`SELECT id, name, business, email, contact FROM customer_requests
    WHERE NOT greetings_off AND status <> 'lost' AND (status = 'won' OR created_at > now() - interval '1 year') ORDER BY id`, []);
  const seen = new Set();
  return rows.filter((r) => {
    const e = (customerEmail(r) || "").toLowerCase();
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}

export async function emailStatus(key) {
  await ensureSchema();
  const rows = await q(`SELECT status, count(*)::int AS n FROM greeting_sends WHERE festival_key = $1 GROUP BY status`, [key]);
  const s = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return { queued: (s.pending || 0) + (s.sent || 0) + (s.failed || 0), sent: s.sent || 0, pending: s.pending || 0, failed: s.failed || 0 };
}

export async function queueEmails(key) {
  const occ = occurrences(await getConfig()).find((o) => o.key === key);
  if (!occ) throw new Error("That festival isn't coming up");
  if (!customerEmailConfigured()) throw new Error("Emailing customers isn't set up yet");
  const people = await audience();
  for (const p of people) {
    await q(`INSERT INTO greeting_sends (request_id, festival_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [p.id, key]);
  }
  await sendBatch(Math.min(20, GREETING_EMAILS_PER_DAY)); // if the festival is here, a first few go now; the daily run sends the rest
  return emailStatus(key);
}

export async function sendBatch(limit = GREETING_EMAILS_PER_DAY, now = new Date()) {
  if (!customerEmailConfigured()) return 0;
  await ensureSchema();
  const config = await getConfig();
  const live = new Map(occurrences(config, now).map((o) => [o.key, o]));
  // Emails go out from the festival day until the banner ends; earlier ones wait.
  const today = lagosToday(now);
  const due = new Set([...live.values()].filter((o) => today >= o.date && today <= o.to).map((o) => o.key));
  // A festival that has passed: anything still waiting is dropped (a late Christmas greeting is worse than none).
  await q(`UPDATE greeting_sends SET status = 'skipped' WHERE status = 'pending' AND NOT (festival_key = ANY($1))`, [[...live.keys()]]);
  if (!due.size) return 0;
  const pending = await q(`SELECT g.request_id, g.festival_key FROM greeting_sends g WHERE g.status = 'pending' AND g.festival_key = ANY($2) ORDER BY g.created_at LIMIT $1`, [limit, [...due]]);
  let sent = 0;
  for (const p of pending) {
    const occ = live.get(p.festival_key);
    const r = await getRequest(p.request_id);
    const to = r && !r.greetings_off && customerEmail(r);
    if (!to) { await q(`UPDATE greeting_sends SET status = 'skipped' WHERE request_id = $1 AND festival_key = $2`, [p.request_id, p.festival_key]); continue; }
    try {
      await sendCustomerEmail(to, `${occ.title} from SIRRADDO ${occ.emoji}`, customerHtml(r, [
        `<span style="font-size:22px;font-weight:800;color:#13254F">${esc(occ.title)}! ${occ.emoji}</span>`,
        esc(occ.message),
        `Warm wishes,<br>The SIRRADDO team`,
        `<span style="font-size:12px;color:#6B7A90">Don't want festive greetings? <a href="${unsubLink(r.id)}" style="color:#6B7A90">Stop them here</a>. You'll still get invoices and messages about your website.</span>`,
      ]));
      await q(`UPDATE greeting_sends SET status = 'sent', sent_at = now() WHERE request_id = $1 AND festival_key = $2`, [p.request_id, p.festival_key]);
      sent++;
    } catch (e) {
      console.error("greeting email failed", e);
      await q(`UPDATE greeting_sends SET status = 'failed' WHERE request_id = $1 AND festival_key = $2`, [p.request_id, p.festival_key]);
    }
  }
  return sent;
}
