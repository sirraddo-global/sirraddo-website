// Simple, private visitor counts for customer websites, and the monthly report email.
// Each published page sends a tiny "view" ping (and "wa"/"call"/"email" when a button is tapped) to /api/site?hit=1.
// No cookies and no personal data: a visitor is counted with a one-way code that changes every day.
import { createHash, randomBytes } from "node:crypto";
import { q, ensureSchema, getRequest, saveHosting, sendCustomerEmail, customerEmailConfigured, customerEmail, getMeta, setMeta, esc } from "./store.mjs";
import { customerHtml } from "./automation.mjs";

const KINDS = new Set(["view", "wa", "call", "email"]);
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp\/|headless|lighthouse|python|curl|wget/i;

export async function ensureStatsKey(id) {
  const r = await getRequest(id);
  if (!r || r.hosting?.statsKey) return r?.hosting?.statsKey || null;
  const key = randomBytes(10).toString("base64url");
  await saveHosting(id, { statsKey: key });
  return key;
}

const keyCache = new Map();
async function siteForKey(key) {
  if (!/^[\w-]{10,20}$/.test(String(key || ""))) return null;
  const hit = keyCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.v;
  await ensureSchema();
  const rows = await q(`SELECT id, website_url, hosting FROM customer_requests WHERE hosting->>'statsKey' = $1`, [key]);
  const v = rows[0] ? { id: rows[0].id, hosts: [rows[0].hosting?.domain, rows[0].hosting?.project && `${rows[0].hosting.project}.pages.dev`].filter(Boolean) } : null;
  if (keyCache.size > 2000) keyCache.clear();
  keyCache.set(key, { v, at: Date.now() });
  return v;
}

const lagosDay = () => new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);
export function cleanPath(p) {
  let s = String(p || "/").split(/[?#]/)[0].replace(/\/index\.html$/i, "/").replace(/\.html$/i, "").slice(0, 80);
  if (!s.startsWith("/")) s = "/" + s;
  return s.length > 1 ? s.replace(/\/+$/, "") : "/";
}
export function sourceOf(ref, hosts) {
  let h = "";
  try { h = new URL(String(ref || "")).hostname.toLowerCase().replace(/^www\./, ""); } catch { return "Direct"; }
  if (!h) return "Direct";
  if (hosts.some((x) => h === x || h.endsWith("." + x) || x.endsWith("." + h))) return "";
  if (/(^|\.)google\./.test(h)) return "Google";
  if (/bing\.com$|duckduckgo|yahoo\./.test(h)) return "Other search";
  if (/facebook\.com$|fb\.com$|fb\.me$/.test(h)) return "Facebook";
  if (/instagram\.com$/.test(h)) return "Instagram";
  if (/whatsapp|wa\.me$/.test(h)) return "WhatsApp";
  if (/(^|\.)t\.co$|twitter\.com$|(^|\.)x\.com$/.test(h)) return "X (Twitter)";
  if (/tiktok\.com$/.test(h)) return "TikTok";
  if (/linkedin\.com$|lnkd\.in$/.test(h)) return "LinkedIn";
  return h.slice(0, 60);
}

export async function recordHit({ k, e, p, r }, { ip, ua }) {
  if (!KINDS.has(e) || BOT.test(ua || "")) return false;
  const site = await siteForKey(k);
  if (!site) return false;
  const day = lagosDay();
  const path = e === "view" ? cleanPath(p) : "";
  const source = e === "view" ? sourceOf(r, site.hosts) : "";
  await q(`INSERT INTO site_stats (request_id, day, path, kind, source, n) VALUES ($1, $2, $3, $4, $5, 1)
    ON CONFLICT (request_id, day, path, kind, source) DO UPDATE SET n = site_stats.n + 1`, [site.id, day, path, e, source]);
  if (e === "view") {
    const salt = process.env.CRON_SECRET || process.env.ADMIN_PASSWORD || "sgl";
    const vid = createHash("sha256").update(`${salt}|${day}|${site.id}|${ip}|${ua}`).digest("base64url").slice(0, 16);
    await q(`INSERT INTO site_visitors (request_id, day, vid) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [site.id, day, vid]);
  }
  return true;
}

// Totals between two dates (inclusive, YYYY-MM-DD).
export async function siteSummary(id, from, to) {
  await ensureSchema();
  const [kinds, visitors, pages, sources, orders] = await Promise.all([
    q(`SELECT kind, sum(n)::int AS n FROM site_stats WHERE request_id = $1 AND day BETWEEN $2 AND $3 GROUP BY kind`, [id, from, to]),
    q(`SELECT count(*)::int AS n FROM site_visitors WHERE request_id = $1 AND day BETWEEN $2 AND $3`, [id, from, to]),
    q(`SELECT path, sum(n)::int AS n FROM site_stats WHERE request_id = $1 AND day BETWEEN $2 AND $3 AND kind = 'view' GROUP BY path ORDER BY n DESC LIMIT 5`, [id, from, to]),
    q(`SELECT source, sum(n)::int AS n FROM site_stats WHERE request_id = $1 AND day BETWEEN $2 AND $3 AND kind = 'view' AND source <> '' GROUP BY source ORDER BY n DESC LIMIT 5`, [id, from, to]),
    q(`SELECT count(*)::int AS n, COALESCE(sum(total), 0)::int AS total FROM store_orders WHERE request_id = $1 AND status = 'paid' AND (paid_at + interval '1 hour')::date BETWEEN $2 AND $3`, [id, from, to]),
  ]);
  const k = Object.fromEntries(kinds.map((x) => [x.kind, x.n]));
  return { from, to, visitors: visitors[0].n, views: k.view || 0, wa: k.wa || 0, calls: k.call || 0, emails: k.email || 0, pages, sources, orders: orders[0].n, sales: orders[0].total };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
const pageName = (p) => (p === "/" ? "Home" : p.replace(/^\//, "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()));

export function reportHtml(r, s, monthLabel) {
  const row = (label, value) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #E1E6EF">${label}</td><td style="padding:8px 10px;border-bottom:1px solid #E1E6EF;text-align:right;font-weight:700">${value}</td></tr>`;
  const quiet = s.views === 0;
  const parts = [
    `Here's how <b>${esc(r.website_url ? r.website_url.replace(/^https?:\/\//, "") : "your website")}</b> did in <b>${monthLabel}</b>.`,
    `<table style="border-collapse:collapse;width:100%;max-width:460px;font-size:15px">
${row("People who visited", s.visitors.toLocaleString("en-NG"))}${row("Pages viewed", s.views.toLocaleString("en-NG"))}
${row("WhatsApp taps", s.wa.toLocaleString("en-NG"))}${s.calls ? row("Call taps", s.calls) : ""}${s.emails ? row("Email taps", s.emails) : ""}
${s.orders ? row("Paid online orders", `${s.orders} · ${naira(s.sales)}`) : ""}</table>`,
  ];
  if (s.pages.length) parts.push(`<b>Most viewed pages:</b> ${s.pages.map((p) => `${esc(pageName(p.path))} (${p.n})`).join(", ")}`);
  if (s.sources.length) parts.push(`<b>Where visitors came from:</b> ${s.sources.map((x) => `${esc(x.source)} (${x.n})`).join(", ")}`);
  parts.push(quiet
    ? "It was a quiet month. Sharing your website link on your WhatsApp status, Instagram bio and Google Business Profile is the quickest way to bring visitors."
    : "Tip: share your website link on your WhatsApp status and social media bios. Every share brings new visitors.");
  return customerHtml(r, parts, r.website_url ? { url: r.website_url, label: "Open your website" } : null);
}

// On the 1st of the month: email last month's report to every live client (once each).
export async function monthlyReports(now = new Date()) {
  const lagos = new Date(now.getTime() + 3600 * 1000);
  if (lagos.getUTCDate() > 3 || !customerEmailConfigured()) return 0; // send on the 1st (with 2 days' catch-up)
  const first = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), 0));
  const from = first.toISOString().slice(0, 10), to = last.toISOString().slice(0, 10);
  const label = `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`;
  await ensureSchema();
  const rows = await q(`SELECT id FROM customer_requests WHERE status = 'won' AND hosting->>'statsKey' IS NOT NULL AND hosting->>'pausedAt' IS NULL
    AND COALESCE(hosting->>'reportsOff', '') = '' AND live_on IS NOT NULL AND live_on <= $1::date - 7`, [to]);
  let sent = 0;
  for (const { id } of rows) {
    const key = `report:${from.slice(0, 7)}:${id}`;
    if ((await getMeta([key]))[key]) continue;
    const r = await getRequest(id);
    const email = r && customerEmail(r);
    if (!email) continue;
    const s = await siteSummary(id, from, to);
    await sendCustomerEmail(email, `Your website in ${label}: ${s.visitors} visitor${s.visitors === 1 ? "" : "s"}, ${s.wa} WhatsApp tap${s.wa === 1 ? "" : "s"}`, reportHtml(r, s, label));
    await setMeta(key, new Date().toISOString());
    sent++;
  }
  return sent;
}

export async function cleanupStats() {
  await ensureSchema();
  await q(`DELETE FROM site_visitors WHERE day < CURRENT_DATE - 100`, []);
  await q(`DELETE FROM site_stats WHERE day < CURRENT_DATE - 800`, []);
}
