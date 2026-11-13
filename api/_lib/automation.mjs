// Everything that runs by itself: status rules on every change, customer emails, and the daily run
// (morning summary with one-tap WhatsApp links, reminders, client site checks, Monday report + backup).
import tls from "node:tls";
import {
  listRequests, updateRequest, ensureDocToken, getSettings, markSent, setSiteCheck, listUnansweredSince,
  sendEmail, emailConfigured, sendCustomerEmail, customerEmailConfigured, customerEmail, esc, waLink, cleanup, reference, setMeta,
} from "./store.mjs";
import { paystackConfigured, payLink, amountDue } from "./paystack.mjs";
import { dailyHosting, hostingRef } from "./golive.mjs";
import { buildDoc, naira, balance } from "./docs.mjs";
import { generateDraft } from "./drafts.mjs";

import { SITE_URL } from "../../site.config.mjs";
export const SITE = (process.env.SITE_URL || SITE_URL).replace(/\/$/, "");
const DEFAULT_RENEWAL = { "Starter website": 25000, "Business website": 40000 };

// ---------- Dates (Lagos) ----------
export function todayLagos(now = new Date()) {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10); // Lagos = UTC+1, no DST
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Same day next year (29 Feb -> 28 Feb).
export function addYear(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-");
  return `${Number(y) + 1}-${m}-${m === "02" && d === "29" ? "28" : d}`;
}
export function daysBetween(from, to) {
  return Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86400000);
}
const niceDate = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// ---------- Message templates (same defaults as the admin page; Settings can override) ----------
export const TEMPLATES = {
  tpl_new: "Hello {name}, this is SIRRADDO GLOBAL LIMITED. Thank you for your interest in our {package} package. Could you tell us a bit more about your business so we can get started?",
  tpl_quoted: "Hello {name}, following up on your {package} quote of {amount}. To start, we need a 70% deposit of {deposit}, and the balance when your site is ready. Any questions, just ask.",
  tpl_brief: "Hello {name}, thank you for your deposit! Please fill in your project details here: {brief_link}\nIt takes about 10-15 minutes, and you can save and finish later with the same link.",
  tpl_invoice: "Hello {name}, here is your invoice for the {package} package. Total: {amount}. Paid: {paid}. Balance: {balance}. View or save it here: {doc_link}\nPay online: {pay_link}",
  tpl_preview: "Hello {name}, your website preview is ready! Please look through every page here: {preview_link}\nAt the bottom you can approve it or tell us what to change.",
  tpl_renewal: "Hello {name}, your website renewal of {renewal_amount} is due on {renewal_due}. It covers your domain, hosting, SSL, business email and backups. Please let us know once you have paid so everything keeps running.\nPay online: {pay_link}",
};
const projectPaid = (r) => (r.payments || []).filter((p) => p.kind !== "renewal").reduce((s, p) => s + Number(p.amount || 0), 0);

export function fill(text, r, extra = {}) {
  const q = r.quote_amount;
  const pay = r.doc_token && paystackConfigured() ? payLink(r) : "";
  if (!pay && !extra.pay_link) text = text.split("\n").filter((l) => !l.includes("{pay_link}")).join("\n"); // no online payment yet
  const vals = {
    name: String(r.name || "").split(" ")[0], package: r.interest, amount: naira(q),
    deposit: q ? naira(Math.round(q * 0.7)) : "-", paid: naira(projectPaid(r)), balance: naira(balance(r)),
    renewal_amount: naira(r.renewal_amount), renewal_due: r.renewal_due ? niceDate(r.renewal_due) : "-",
    brief_link: r.brief_token ? `${SITE}/brief?t=${r.brief_token}` : "", doc_link: "",
    preview_link: r.preview_token ? `${SITE}/preview?t=${r.preview_token}` : "", website: r.website_url || "", pay_link: pay, ...extra,
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));
}
const docLink = (r, type) => `${SITE}/doc?t=${r.doc_token}&type=${type}`;
function waUrl(r, text) {
  const base = waLink(r.contact);
  return base ? `${base}?text=${encodeURIComponent(text)}` : null;
}

// ---------- Rules applied after every admin change ----------
// Returns the extra fields to save (or null). Never undoes what you set by hand.
export function rulesAfterUpdate(row, changed) {
  const f = {};
  const today = todayLagos();
  const open = row.status === "new" || row.status === "contacted";
  // Quote entered on an open lead -> quoted, follow up in 3 days.
  if ("quote_amount" in changed && row.quote_amount != null && open) {
    f.status = "quoted";
    if (!row.follow_up_on || row.follow_up_on < addDays(today, 3)) f.follow_up_on = addDays(today, 3);
  }
  // Deposit reaches 70% (or any payment without a quote) -> won, with the job's defaults.
  if ("payments" in changed && row.status !== "won" && row.status !== "lost") {
    const paid = projectPaid(row);
    const reached = paid > 0 && (row.quote_amount ? paid >= Math.round(row.quote_amount * 0.7) : true);
    if (reached) {
      f.status = "won";
      if (row.renewal_amount == null && DEFAULT_RENEWAL[row.interest]) f.renewal_amount = DEFAULT_RENEWAL[row.interest];
      if (!row.project_stage) f.project_stage = "content";
      f.follow_up_on = row.brief_submitted_at ? null : addDays(today, 2); // chase the project form
    }
  }
  // Marked won or lost by hand -> no more lead follow-ups.
  if ("status" in changed && (changed.status === "won" || changed.status === "lost") && row.follow_up_on && !f.follow_up_on) {
    if (changed.status === "lost" || row.brief_submitted_at) f.follow_up_on = null;
  }
  // Went live -> live date today, renewal a year on.
  if ("project_stage" in changed && row.project_stage === "live") {
    if (!row.live_on) f.live_on = today;
    if (!row.renewal_due) f.renewal_due = addYear(row.live_on || today);
    f.follow_up_on = null;
  }
  return Object.keys(f).length ? f : null;
}

export async function applyRules(row, changed) {
  const extra = rulesAfterUpdate(row, changed);
  if (!extra) return row;
  return (await updateRequest(row.id, extra)) || row;
}

// ---------- Automatic emails to customers (only when LEAD_EMAIL_FROM is set) ----------
export function customerHtml(r, paragraphs, button) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1B2433;font-size:15px;line-height:1.55;max-width:560px">
    <div style="font-weight:900;font-size:22px;letter-spacing:-1px"><span style="color:#13254F">SI</span><span style="color:#D9A21B">RR</span><span style="color:#13254F">A</span><span style="color:#D9A21B">DD</span><span style="color:#13254F">O</span></div>
    <div style="font-weight:700;font-size:8px;letter-spacing:4px;color:#13254F;margin-bottom:16px">GLOBAL LIMITED</div>
    <p>Hello ${esc(String(r.name || "").split(" ")[0])},</p>
    ${paragraphs.map((p) => `<p>${p}</p>`).join("")}
    ${button ? `<p><a href="${button.url}" style="display:inline-block;background:#D9A21B;color:#13254F;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px">${esc(button.label)}</a></p>` : ""}
    <p>Questions? Reply to this email or <a href="https://wa.me/2348167550937">WhatsApp us</a>.</p>
    <p style="color:#4A5568;font-size:12px">SIRRADDO GLOBAL LIMITED · RC 9939920 · Ibadan, Nigeria</p></div>`;
}

async function sendOnce(r, key, subject, html) {
  const to = customerEmail(r);
  if (!to || !customerEmailConfigured() || (r.auto_sent || {})[key]) return false;
  await sendCustomerEmail(to, subject, html);
  await markSent(r.id, key);
  r.auto_sent = { ...(r.auto_sent || {}), [key]: new Date().toISOString() };
  return true;
}

// "We got your request" — right after a website form or the AI saves a new request.
export async function acknowledgeLead(r) {
  try {
    return await sendOnce(r, "ack", `We received your request (${reference(r.id)})`, customerHtml(r, [
      `Thank you for contacting SIRRADDO GLOBAL LIMITED about <b>${esc(r.interest)}</b>.`,
      `Your reference is <b>${reference(r.id)}</b>. We will contact you on WhatsApp shortly, usually the same working day.`,
    ]));
  } catch (err) {
    console.error("ack email failed", err);
    return false;
  }
}

// The project form link, as soon as it exists.
export async function emailBriefLink(r) {
  if (!r.brief_token || r.brief_submitted_at || (r.project_stage && r.project_stage !== "content")) return false;
  try {
    return await sendOnce(r, "brief-link", "Next step: your project details", customerHtml(r, [
      "Thank you for your deposit. To build your website we need a few details: your business information, pages, photos and logo.",
      "It takes about 10–15 minutes, and you can save and finish later with the same link.",
    ], { url: `${SITE}/brief?t=${r.brief_token}`, label: "Fill in my project details" }));
  } catch (err) {
    console.error("brief email failed", err);
    return false;
  }
}

// ---------- Client website checks ----------
function sslExpiry(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert && cert.valid_to ? new Date(cert.valid_to).toISOString().slice(0, 10) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
}

export async function checkSite(url) {
  let host;
  try { host = new URL(url).hostname; } catch { return { status: "invalid address", ssl: null }; }
  let status;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "SIRRADDO site check" } });
    clearTimeout(timer);
    status = res.status < 400 ? "up" : `down (HTTP ${res.status})`;
  } catch (err) {
    status = err.name === "AbortError" ? "down (no answer in 10 s)" : "down (can't connect)";
  }
  const ssl = url.startsWith("https:") ? await sslExpiry(host) : null;
  return { status, ssl };
}

// ---------- The daily run ----------
function item(r, text, wa) {
  const link = wa ? waUrl(r, wa) : null;
  return `<li style="margin:6px 0"><b>${esc(r.name)}</b> · ${esc(r.interest)} · ${reference(r.id)}<br><span style="color:#4A5568">${text}</span>${link ? `<br><a href="${link}" style="color:#1F8A4C;font-weight:700">Send on WhatsApp ›</a>` : ""}</li>`;
}
const section = (title, items) => (items.length ? `<h3 style="margin:18px 0 6px;color:#13254F">${esc(title)} (${items.length})</h3><ul style="padding-left:18px;margin:0">${items.join("")}</ul>` : "");

export async function runDaily(now = new Date()) {
  const started = Date.now();
  const today = todayLagos(now);
  const settings = await getSettings();
  const tpl = (k) => settings[k] || TEMPLATES[k];
  const all = await listRequests(5000);
  const isOpen = (r) => r.status !== "won" && r.status !== "lost";
  const report = { emailed: false, customerEmails: 0, siteChecks: 0 };

  // 1. New in the last day
  const fresh = all.filter((r) => Date.parse(r.created_at) > now.getTime() - 86400000);
  // 2. Follow-ups due
  const due = all.filter((r) => isOpen(r) && r.follow_up_on && r.follow_up_on <= today);
  // 3. Won but project form not sent back after 2+ days
  const waitingForm = (r) => r.status === "won" && r.brief_token && !r.brief_submitted_at && (!r.project_stage || r.project_stage === "content");
  const formsWaiting = all.filter((r) => waitingForm(r) && r.follow_up_on && r.follow_up_on <= today);
  // 4. Balances owed on finished sites
  const owing = all.filter((r) => r.status === "won" && r.project_stage === "live" && (balance(r) || 0) > 0);
  // 5. Renewals due within 30 days or overdue
  const renewals = all.filter((r) => r.status === "won" && r.renewal_due && daysBetween(today, r.renewal_due) <= 30);
  // 6. Briefs received in the last day
  const briefs = all.filter((r) => r.brief_submitted_at && Date.parse(r.brief_submitted_at) > now.getTime() - 86400000);
  // 7. Leads gone quiet: open, no change for 14+ days, no follow-up date
  const stale = all.filter((r) => isOpen(r) && !r.follow_up_on && Date.parse(r.updated_at) < now.getTime() - 14 * 86400000);

  // Renewal invoices need a document link
  for (const r of renewals) if (!r.doc_token) Object.assign(r, (await ensureDocToken(r.id)) || {});

  // Automatic customer emails (skipped quietly when LEAD_EMAIL_FROM isn't set)
  if (customerEmailConfigured()) {
    for (const r of all) {
      try {
        // project form: link (if never emailed) and one reminder 2 days later
        if (waitingForm(r)) {
          if (await emailBriefLink(r)) report.customerEmails++;
          const sentAt = (r.auto_sent || {})["brief-link"];
          if (sentAt && !r.brief_saved_at && Date.parse(sentAt) < now.getTime() - 2 * 86400000 &&
              await sendOnce(r, "brief-reminder", "Reminder: your project details", customerHtml(r, [
                "Just a reminder: we are ready to start your website as soon as we have your project details.",
              ], { url: `${SITE}/brief?t=${r.brief_token}`, label: "Fill in my project details" }))) report.customerEmails++;
        }
        // renewal: 30 days, 7 days, due day, 3 days overdue
        if (r.status === "won" && r.renewal_due && r.renewal_amount) {
          const d = daysBetween(today, r.renewal_due);
          const stage = d === 30 || (d < 30 && d > 7) ? "30" : d <= 7 && d > 0 ? "7" : d === 0 || (d < 0 && d > -3) ? "0" : d <= -3 ? "late" : null;
          if (stage && d <= 30) {
            const key = `renewal-${r.renewal_due}-${stage}`;
            const doc = buildDoc(r, "renewal", settings);
            const lead = stage === "late"
              ? `Your website renewal of <b>${naira(r.renewal_amount)}</b> was due on ${niceDate(r.renewal_due)}. Please pay soon so your website and email keep running.`
              : `Your website renewal of <b>${naira(r.renewal_amount)}</b> is due ${d === 0 ? "today" : `on ${niceDate(r.renewal_due)}`}. It covers your domain, hosting, SSL, business email and backups for another year.`;
            if (!doc.error && await sendOnce(r, key, stage === "late" ? "Your website renewal is overdue" : `Website renewal due ${d === 0 ? "today" : niceDate(r.renewal_due)}`,
              customerHtml(r, [lead], paystackConfigured() && amountDue(r, "renewal")
                ? { url: payLink(r, "renewal"), label: `Pay ${naira(r.renewal_amount)} online` }
                : { url: docLink(r, "renewal"), label: "View renewal invoice" }) +
                (paystackConfigured() ? `<p style="font-family:Arial,sans-serif;font-size:13px"><a href="${docLink(r, "renewal")}">View the renewal invoice</a></p>` : ""))) report.customerEmails++;
          }
        }
      } catch (err) {
        console.error("customer reminder failed", r.id, err);
      }
    }
  }

  // Client website checks
  const sites = all.filter((r) => r.status === "won" && r.website_url);
  const results = await Promise.all(sites.slice(0, 40).map(async (r) => {
    const res = await checkSite(r.website_url);
    await setSiteCheck(r.id, res.status, res.ssl);
    return { r, ...res };
  }));
  report.siteChecks = results.length;
  const siteProblems = results.filter((x) => x.status !== "up" || (x.ssl && daysBetween(today, x.ssl) <= 14));

  const questions = await listUnansweredSince(24);

  // Catch up on website text drafts that didn't get written when the form came in (one per run).
  const needsDraft = all.find((r) => r.brief_submitted_at && !r.has_draft);
  if (needsDraft && Date.now() - started < 20000) {
    const res = await generateDraft(needsDraft.id, 30000);
    if (res.ok) { needsDraft.has_draft = true; report.draftsWritten = 1; }
  }

  // Customer websites on Cloudflare: domains that went active, pause overdue renewals, restore paid ones.
  const host = Date.now() - started < 35000 ? await dailyHosting(all, now) : null;
  if (host) {
    for (const r of host.balancePaused) {
      const to = customerEmail(r);
      if (to && customerEmailConfigured()) {
        await sendCustomerEmail(to, "Your website is paused until the balance is paid", customerHtml(r, [
          `Your website has been online for ${7} days, but the balance of <b>${naira(balance(r))}</b> hasn't been paid yet, so we've paused it.`,
          "Nothing is lost. As soon as the balance is paid, your website comes back and goes live on your own domain.",
        ], paystackConfigured() && r.doc_token ? { url: payLink(r), label: `Pay ${naira(balance(r))} now` } : null)).catch(() => {});
      }
    }
    for (const r of host.paused) {
      const to = customerEmail(r);
      if (to && customerEmailConfigured()) {
        await sendCustomerEmail(to, "Your website has been paused", customerHtml(r, [
          `Your website renewal was due on <b>${esc(r.renewal_due)}</b> and hasn't been paid, so your website${r.hosting?.email ? " and business email forwarding are" : " is"} now paused.`,
          "Nothing is deleted. We keep your website for 60 days, and it comes back as soon as the renewal is paid.",
        ], paystackConfigured() && r.doc_token ? { url: payLink(r, "renewal"), label: `Pay ${naira(r.renewal_amount)} and restore` } : null)).catch(() => {});
      }
    }
  }

  // The morning email
  const sections = [
    ...(host ? [
      section("Customer domains now active", host.activated.map((r) => item(r, `${esc(r.hosting.domain)} is active on Cloudflare.${r.hosting.project ? " Their website is now connected to it." : " You can publish their website now."}`, null))),
      section("Ready to go live (approved and paid)", host.ready.map((r) => item(r, "Admin → Clients → Go live → Publish website.", null))),
      section("Live sites with changes not yet published", host.unpublished.map((r) => item(r, "You edited the text or design after publishing. Tap Update live site.", null))),
      section("Sites paused today (renewal 15+ days overdue)", host.paused.map((r) => item(r, `${esc(r.hosting?.domain || r.website_url || "")} paused. It restores itself when the renewal is paid.`, fill(tpl("tpl_renewal"), r)))),
      section("Sites paused for an unpaid balance (7+ days)", host.balancePaused.map((r) => item(r, `balance ${naira(balance(r))}. It comes back by itself once paid.`, r.doc_token ? fill(tpl("tpl_invoice"), r, { doc_link: docLink(r, "invoice") }) : fill(tpl("tpl_invoice"), r)))),
      section("Sites restored (paid)", host.restored.map((r) => item(r, `${esc(r.hosting?.domain || "")} is back online.`, null))),
      section("Hosting problems", host.errors.map(({ r, msg }) => item(r, esc(msg), null))),
    ] : []),
    section("New requests", fresh.map((r) => item(r, `${esc(r.contact)}${r.email ? " · " + esc(r.email) : ""} · ${esc(r.details || "")}`, fill(tpl("tpl_new"), r)))),
    section("Follow up today", due.map((r) => item(r, `${esc(r.status)} · due ${r.follow_up_on === today ? "today" : `since ${niceDate(r.follow_up_on)}`}`,
      fill(tpl(r.status === "quoted" ? "tpl_quoted" : "tpl_new"), r)))),
    section("Project forms not sent back yet", formsWaiting.map((r) => item(r, r.brief_saved_at ? "started but not sent" : "not opened yet", fill(tpl("tpl_brief"), r)))),
    section("Balances still owed on live sites", owing.map((r) => item(r, `balance ${naira(balance(r))}`,
      (r.doc_token ? fill(tpl("tpl_invoice"), r, { doc_link: docLink(r, "invoice") }) : fill(tpl("tpl_invoice"), r))))),
    section("Renewals", renewals.map((r) => {
      const d = daysBetween(today, r.renewal_due);
      const when = d < 0 ? `<b style="color:#B42318">${-d} day(s) overdue</b>` : d === 0 ? "<b>due today</b>" : `due in ${d} day(s)`;
      const text = fill(tpl("tpl_renewal"), r) + (r.doc_token ? `\nInvoice: ${docLink(r, "renewal")}` : "");
      return item(r, `${naira(r.renewal_amount)} · ${when}. Renew their domain and hosting with your provider too.`, text);
    })),
    section("Customers asked for changes to their preview", all.filter((r) => r.preview_status === "changes").map((r) => {
      const last = (r.preview_feedback || []).slice(-1)[0];
      return item(r, `“${esc(String(last?.text || "").slice(0, 300))}” Edit the text in admin, then send the preview again.`, null);
    })),
    section("Previews waiting for an answer (3+ days)", all.filter((r) => r.preview_status === "sent" && r.project_stage === "review" && r.updated_at && Date.now() - Date.parse(r.updated_at) > 3 * 86400000)
      .map((r) => item(r, "no answer yet. Nudge them to look and approve.", fill(tpl("tpl_preview"), r)))),
    section("Approved: collect the balance and put live", all.filter((r) => r.preview_status === "approved" && r.project_stage !== "live").map((r) => item(r,
      balance(r) > 0 ? `balance ${naira(balance(r))} to pay${r.auto_sent?.balance_invoice ? " (invoice emailed)" : ""}` : "fully paid. Upload the site, connect the domain and mark it Live.",
      balance(r) > 0 ? (r.doc_token ? fill(tpl("tpl_invoice"), r, { doc_link: docLink(r, "invoice") }) : fill(tpl("tpl_invoice"), r)) : null))),
    section("Live sites without a handover pack", all.filter((r) => r.project_stage === "live" && !r.auto_sent?.handover && balance(r) === 0 && r.live_on && daysBetween(r.live_on, today) <= 30)
      .map((r) => item(r, "send the handover pack from admin (Clients → Handover pack), then their logins privately on WhatsApp.", null))),
    section("Project forms received", briefs.map((r) => item(r, r.has_draft ? "ready to build. The AI draft of the website text is in admin (Project form → View text)." : "ready to build. Open View answers in admin.", null))),
    section("Client websites needing attention", siteProblems.map((x) => item(x.r,
      `${esc(x.r.website_url)} · ${esc(x.status)}${x.ssl ? ` · SSL ends ${niceDate(x.ssl)}` : ""}`, null))),
    section("Questions the assistant couldn't answer", questions.map((q) => `<li>${esc(q.question)}</li>`)),
    section("Gone quiet (no update for 2+ weeks)", stale.slice(0, 15).map((r) => item(r, `still ${esc(r.status)}. Follow up once more, or mark lost.`, fill(tpl("tpl_new"), r)))),
  ].filter(Boolean);

  // Monday: weekly report + backup of all requests
  const monday = new Date(today + "T12:00:00Z").getUTCDay() === 1;
  let weekly = "";
  let attachments;
  if (monday) {
    const weekAgo = now.getTime() - 7 * 86400000;
    const week = all.filter((r) => Date.parse(r.created_at) > weekAgo);
    const received = all.flatMap((r) => (r.payments || []).filter((p) => Date.parse(p.date + "T12:00:00Z") > weekAgo).map((p) => p.amount)).reduce((s, n) => s + Number(n), 0);
    const wonWeek = all.filter((r) => r.status === "won" && Date.parse(r.updated_at) > weekAgo).length;
    const bySource = {};
    week.forEach((r) => { bySource[r.source] = (bySource[r.source] || 0) + 1; });
    weekly = `<h3 style="margin:18px 0 6px;color:#13254F">Last 7 days</h3><p>${week.length} new request(s) · ${wonWeek} won or updated as won · ${naira(received)} received<br>
      <span style="color:#4A5568">By source: ${Object.entries(bySource).map(([k, v]) => `${esc(k)} ${v}`).join(", ") || "none"}</span></p>
      <p style="color:#4A5568">Attached: a backup of all ${all.length} requests (CSV, opens in Excel or Google Sheets).</p>`;
    const cols = ["id", "created_at", "source", "name", "contact", "email", "business", "interest", "status", "quote_amount", "project_stage", "live_on", "renewal_amount", "renewal_due", "website_url", "details", "notes"];
    const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const csv = "﻿" + [cols.join(",")].concat(all.map((r) => cols.map((c) => cell(c === "created_at" ? new Date(r.created_at).toISOString() : r[c])).join(","))).join("\r\n");
    attachments = [{ filename: `sirraddo-requests-${today}.csv`, content: Buffer.from(csv, "utf8").toString("base64") }];
  }

  if ((sections.length || weekly) && emailConfigured()) {
    const counts = [
      fresh.length && `${fresh.length} new`, due.length && `${due.length} follow-up`, renewals.length && `${renewals.length} renewal`,
      siteProblems.length && `${siteProblems.length} site issue`, briefs.length && `${briefs.length} form received`,
    ].filter(Boolean).join(", ");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1B2433;font-size:14px;line-height:1.5;max-width:640px">
      <h2 style="margin:0 0 4px;color:#13254F">SIRRADDO daily summary</h2><p style="color:#4A5568;margin:0 0 8px">${niceDate(today)}${report.customerEmails ? ` · ${report.customerEmails} automatic email(s) sent to customers` : ""}</p>
      ${sections.join("")}${weekly}<p style="margin-top:20px"><a href="${SITE}/admin">Open the admin page</a></p></div>`;
    report.emailed = Boolean(await sendEmail(`SIRRADDO ${monday ? "weekly + daily" : "daily"} summary${counts ? ": " + counts : ""}`, html, attachments));
  }
  report.removed = await cleanup(90);
  report.counts = { fresh: fresh.length, due: due.length, formsWaiting: formsWaiting.length, owing: owing.length, renewals: renewals.length, briefs: briefs.length, siteProblems: siteProblems.length, stale: stale.length, questions: questions.length };
  await setMeta("daily_run", new Date().toISOString()).catch(() => {});
  return report;
}
