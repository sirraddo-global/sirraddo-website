// /api/requests — the admin page's API. Needs header "Authorization: Bearer <ADMIN_PASSWORD>".
//   GET    ?view=all    requests, unanswered questions, settings
//   GET    ?view=chats  recent conversations (kept 90 days)
//   PATCH  { id, ...fields }            update a request
//   DELETE ?id=123                      delete a request
//   POST   { action: "create", ... }    add a request by hand
//   POST   { action: "settings", settings: {...} }
//   POST   { action: "question", id, resolved?: bool, remove?: true }
//   POST   { action: "brief_link", id }  create the project brief link now
//   POST   { action: "preview_link", id }  create the website preview link (stage -> waiting for approval)
//   POST   { action: "send_preview", id }  email the preview link to the customer
//   GET    ?view=export&id=123  the website as a .zip (pages + images) to upload to any host
import { timingSafeEqual, createHash, createHmac } from "node:crypto";
import { clientReviewUrl } from "./_lib/reviews.mjs";
import { setMeta, getMeta, q, cleanFrom,
  dbConfigured, listRequests, createRequest, updateRequest, deleteRequest, listChats, listUnanswered,
  setUnansweredResolved, deleteUnanswered, getSettings, saveSettings, ensureBriefToken, STATUSES, STAGES,
  ensureDocToken, getRequest, customerEmail, customerEmailConfigured, sendCustomerEmail,
  ensurePreviewToken, getPreviewById, markSent, saveDesign, saveHosting, emailUsage, listRefused, resendRefused, removeRefused,
} from "./_lib/store.mjs";
import { buildDoc, DOC_TYPES } from "./_lib/docs.mjs";
import { applyRules, emailBriefLink, SITE, customerHtml } from "./_lib/automation.mjs";
import { buildSiteModel, exportFiles, zip, slugify } from "./_lib/sitegen.mjs";
import { ensureStoreToken, setShopPayments, listOrders, paystackConnectLink } from "./_lib/shop.mjs";
import { ensureStatsKey, siteSummary, reportHtml, dashboardTotals } from "./_lib/stats.mjs";
import { buildBackup } from "./_lib/backup.mjs";
import { FUNCTION_BUDGET_MS } from "./_lib/platform.mjs";
import { addHandoverExtras } from "./_lib/handover.mjs";
import { handoverChecklist } from "./_lib/handover-check.mjs";
import { putFile, deleteFiles } from "./_lib/platform.mjs";
import { setDesignRefs, MAX_DESIGN_REFS } from "./_lib/store.mjs";
import { noticesForAdmin, saveNotice, deleteNotice, NOTICE_KINDS } from "./_lib/notices.mjs";
import { getConfig, saveConfig, occurrences, queueEmails, emailStatus, audience, GREETING_EMAILS_PER_DAY } from "./_lib/greetings.mjs";
import { changeLink, listChanges, markChange, freeUntil, addChange } from "./_lib/changes.mjs";
import { cleanServices, recordServicePayment } from "./_lib/services.mjs";
import { PERMS, permFor, fieldPerms, can, staffFromCredential, staffSessionToken, logStaff } from "./_lib/staff.mjs";
import { paystackConfigured, payButton, depositOf } from "./_lib/paystack.mjs";
import { setupStatus } from "./_lib/setup.mjs";
import { assistantSystem } from "./_lib/assistant.mjs";
import { pickProvider, friendlyAiError, ensureAiBackup } from "./_lib/providers.mjs";
import { generateDesign, changeDesignOptions } from "./_lib/design.mjs";
import { logoIdeas } from "./_lib/logos.mjs";
import { QUICK_SERVICES, EXTRAS, EXTRA_GUIDES, QUALITY_CHECKS, isQuick, INFO_FIELDS, setOrderInfo } from "./_lib/graphics.mjs";
import { JOB_STAGES, STAGE_KEYS } from "./_lib/track.mjs";
import { addDomain, checkHosting, publish, pause, restore, setupEmail, afterProjectPayment, GoLiveError, restorePrevious } from "./_lib/golive.mjs";
import { cloudflareConfigured } from "./_lib/cloudflare.mjs";
import { todayLagos } from "./_lib/automation.mjs";
import { generateDraft } from "./_lib/drafts.mjs";
import { getBriefById } from "./_lib/store.mjs";

// The project brief link is created once the deposit is in: 70% of the quote paid
// (or any project payment if no quote was entered).
function depositPaid(row) {
  const paid = (row.payments || []).filter((p) => !p.kind || p.kind === "project").reduce((s, p) => s + Number(p.amount || 0), 0);
  if (!paid) return false;
  return row.quote_amount ? paid >= depositOf(row) : true;
}

const failed = new Map(); // ip -> timestamps of wrong passwords

// "Keep me logged in": a signed token that lasts 30 days instead of the password itself.
// Signed with a key made from ADMIN_PASSWORD, so changing the password logs out every device.
const SESSION_DAYS = 30;
const sessionKey = () => createHash("sha256").update("sirraddo-admin-session:" + (process.env.ADMIN_PASSWORD || "")).digest();
function makeSession() {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const sig = createHmac("sha256", sessionKey()).update(String(exp)).digest("base64url");
  return `s1.${exp}.${sig}`;
}
function validSession(given) {
  const m = /^s1\.(\d{10,16})\.([\w-]{43})$/.exec(given);
  if (!m || Number(m[1]) < Date.now()) return false;
  const want = createHmac("sha256", sessionKey()).update(m[1]).digest("base64url");
  return timingSafeEqual(Buffer.from(want), Buffer.from(m[2]));
}
function authorised(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (expected.length < 12) return false; // refuse weak or missing passwords
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (given.startsWith("s1.")) return validSession(given);
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
// Who is calling: the owner (ADMIN_PASSWORD or its session), a staff member (their password or session), or nobody.
async function whoIs(req) {
  if (authorised(req)) return { role: "owner", name: "Owner", perms: Object.keys(PERMS) };
  if ((process.env.ADMIN_PASSWORD || "").length < 12) return null;
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!/^(su|s2)\./.test(given) || !dbConfigured()) return null;
  return staffFromCredential(given).catch(() => null);
}
const CHANGE_FIRST = "Choose your new password first.";
const NOT_ALLOWED = "Your account can't do this. Ask the owner (Ridwan) to do it, or to give your account access.";

class Bad extends Error {}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v, n) => {
  if (v === null || v === undefined) return "";
  if (typeof v !== "string") throw new Bad("Text expected");
  return v.trim().slice(0, n);
};
const date = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v) || isNaN(Date.parse(v))) throw new Bad("Date must be YYYY-MM-DD");
  return v;
};
const naira = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000_000) throw new Bad("Amount must be a whole number of naira");
  return n;
};

function cleanFields(body) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  for (const [k, n] of [["name", 120], ["contact", 120], ["business", 200], ["interest", 60], ["details", 2000], ["notes", 4000]]) {
    if (has(k)) out[k] = text(body[k], n);
  }
  if ((has("name") && !out.name) || (has("contact") && !out.contact)) throw new Bad("Name and contact can't be empty");
  if (has("came_from")) out.came_from = cleanFrom(body.came_from);
  if (has("job_stage")) {
    if (body.job_stage !== null && !STAGE_KEYS.includes(body.job_stage)) throw new Bad("Unknown job stage");
    out.job_stage = body.job_stage;
  }
  if (has("deliver_by")) out.deliver_by = date(body.deliver_by);
  if (has("services")) { try { out.services = cleanServices(body.services); } catch (e) { throw new Bad(e.message); } }
  if (has("deposit_pct")) {
    const v = body.deposit_pct === "" || body.deposit_pct == null ? null : Number(body.deposit_pct);
    if (v !== null && (!Number.isInteger(v) || v < 10 || v > 100)) throw new Bad("Deposit must be between 10% and 100%");
    out.deposit_pct = v === 70 ? null : v;
  }
  if (has("next_payment")) out.next_payment = naira(body.next_payment);
  if (has("wants")) out.wants = ["customer_accounts", "custom_system"].includes(body.wants) ? body.wants : null;
  if (has("email")) {
    out.email = text(body.email, 200).toLowerCase() || null;
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Bad("That email address doesn't look right");
  }
  if (has("status")) {
    if (!STATUSES.includes(body.status)) throw new Bad("Unknown status");
    out.status = body.status;
  }
  if (has("project_stage")) {
    if (body.project_stage && !STAGES.includes(body.project_stage)) throw new Bad("Unknown project stage");
    out.project_stage = body.project_stage || null;
  }
  for (const k of ["follow_up_on", "live_on", "renewal_due"]) if (has(k)) out[k] = date(body[k]);
  for (const k of ["quote_amount", "renewal_amount"]) if (has(k)) out[k] = naira(body[k]);
  if (has("website_url")) {
    let u = text(body.website_url, 300);
    if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    if (u) { try { u = new URL(u).toString(); } catch { throw new Bad("That website address doesn't look right"); } }
    out.website_url = u || null;
  }
  if (has("draft_md")) {
    if (typeof body.draft_md !== "string" || !body.draft_md.trim()) throw new Bad("The website text can't be empty");
    out.draft_md = body.draft_md.replace(/\r\n/g, "\n").slice(0, 100000);
  }
  if (has("handover")) {
    const h = body.handover && typeof body.handover === "object" ? body.handover : {};
    let webmail = text(h.webmail, 300);
    if (webmail && !/^https?:\/\//i.test(webmail)) webmail = "https://" + webmail;
    out.handover = {
      domain: text(h.domain, 200).toLowerCase(), registrar: text(h.registrar, 120), domain_expires: date(h.domain_expires),
      emails: text(h.emails, 1000), inbox: text(h.inbox, 200), webmail, notes: text(h.notes, 2000), has_logins: h.has_logins === true,
      domain_by: h.domain_by === "customer" ? "customer" : "us",
      gbp_done: h.gbp_done === true, gbp_owner: text(h.gbp_owner, 200).toLowerCase(),
      paystack_email: text(h.paystack_email, 200).toLowerCase(), whatsapp_only: h.whatsapp_only === true,
    };
  }
  if (has("payments")) {
    if (!Array.isArray(body.payments) || body.payments.length > 200) throw new Bad("Payments must be a list");
    out.payments = body.payments.map((p) => {
      // A refund is money paid back: stored as a negative amount so every total goes down by it.
      const refund = p?.refund === true || Number(p?.amount) < 0;
      const amount = refund ? -naira(Math.abs(Number(p?.amount))) : naira(p?.amount);
      if (!amount) throw new Bad("Each payment needs an amount");
      if (refund && !text(p.note, 200)) throw new Bad("Write why the refund was made (e.g. cancelled before work started)");
      return {
        ...(refund ? { refund: true } : {}),
        date: date(p.date) || new Date().toISOString().slice(0, 10),
        amount,
        kind: p.kind === "renewal" ? "renewal" : p.kind === "service" ? "service" : "project",
        ...(p.kind === "service" && /^[a-z0-9]{6,16}$/.test(String(p.service_id || "")) ? { service_id: p.service_id } : {}),
        note: text(p.note, 200),
        ...(typeof p.ref === "string" && /^[\w-]{6,80}$/.test(p.ref) ? { ref: p.ref } : {}), // Paystack reference, kept so it is never counted twice
      };
    });
  }
  return out;
}

function readBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  return body && typeof body === "object" ? body : {};
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (failed.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 10) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  const me = await whoIs(req);
  if (!me) {
    recent.push(now);
    failed.set(ip, recent);
    const configured = (process.env.ADMIN_PASSWORD || "").length >= 12;
    const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    return res.status(401).json({ error: !configured ? "ADMIN_PASSWORD is not set (min 12 characters)"
      : given.startsWith("su.") ? "Wrong username or password. A temporary password stops working after 3 days: ask the owner for a new one."
      : given.startsWith("s2.") ? "You were logged out. Log in again." : "Wrong password" });
  }
  if (!dbConfigured()) return res.status(503).json({ error: "DATABASE_URL is not set" });

  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  // A temporary password must be changed before anything else.
  if (me.role === "staff" && (me.mustChange || req.method === "POST")) {
    const body0 = req.method === "POST" ? readBody(req) : {};
    if (req.method === "POST" && body0.action === "my_password") {
      const st = await import("./_lib/staff.mjs");
      try {
        const row = await st.setOwnPassword(me.id, body0.current, body0.password);
        await logStaff(me, "Changed their password");
        return res.status(200).json({ ok: true, token: st.staffSessionToken(row, body0.remember ? SESSION_DAYS : 1) });
      } catch (e) { return res.status(400).json({ error: e.message }); }
    }
    if (me.mustChange) {
      if (req.method === "GET" && query.view === "all") return res.status(200).json({ me: { role: "staff", name: me.name, username: me.username, perms: me.perms, must_change: true }, requests: [], unanswered: [], settings: {}, setup: [], statuses: [], stages: [] });
      if (!(req.method === "POST" && body0.action === "session")) return res.status(403).json({ error: CHANGE_FIRST, must_change: true });
    }
  }
  // Every customer row sent back carries its handover checklist (what's left before the job is finished).
  const checkSettings = req.method === "GET" ? {} : await getSettings().catch(() => ({}));
  const sendJson = res.json.bind(res);
  const hideMoney = me.role === "staff" && !can(me, "money");
  const strip = (r) => (hideMoney && r && typeof r === "object" && "payments" in r ? { ...r, payments: [], quote_amount: null, renewal_amount: null, services: [] } : r);
  res.json = (o) => {
    if (o && typeof o === "object" && !Array.isArray(o) && o.id && "payments" in o && "hosting" in o) o = { ...o, handover_check: handoverChecklist(o, checkSettings) };
    if (hideMoney && o && typeof o === "object") { o = strip(o); if (o.row) o = { ...o, row: strip(o.row) }; }
    return sendJson(o);
  };
  try {
    if (req.method === "GET") {
      if (query.view === "chats") return res.status(200).json({ chats: await listChats() });
      if ((query.view === "backup" && !can(me, "owner")) || ((query.view === "export" || query.view === "draft") && !can(me, "build"))) return res.status(403).json({ error: NOT_ALLOWED });
      if (query.view === "backup") {
        const b = await buildBackup();
        res.setHeader("Content-Type", "application/gzip");
        res.setHeader("Content-Disposition", `attachment; filename="${b.filename}"`);
        return res.status(200).send(b.gz);
      }
      if (query.view === "export") {
        await ensureStoreToken(Number(query.id));
        await ensureStatsKey(Number(query.id));
        const row = await getPreviewById(Number(query.id));
        if (!row) return res.status(404).json({ error: "Not found" });
        if (!row.draft_md) throw new Bad("Write the website text first");
        const site = buildSiteModel(row);
        const { pages, images } = exportFiles(site);
        const files = pages.map((p) => ({ name: p.name, data: p.html }));
        for (const im of images) {
          try {
            const r = await fetch(im.url);
            if (r.ok) files.push({ name: im.path, data: Buffer.from(await r.arrayBuffer()) });
          } catch (e) { console.error("export image failed", im.url, e); }
        }
        files.push({ name: "README.txt", data: `Website for ${site.name}, made by SIRRADDO GLOBAL LIMITED.\nUpload everything in this folder (keep the images folder) to the website host, e.g. Cloudflare Pages > Upload assets.\nindex.html is the home page.\n` });
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${slugify(site.name)}-website.zip"`);
        return res.status(200).send(zip(files));
      }
      if (query.view === "draft") {
        const row = await getBriefById(Number(query.id));
        if (!row) return res.status(404).json({ error: "Not found" });
        return res.status(200).json({ draft_md: row.draft_md, draft_at: row.draft_at, draft_error: row.draft_error });
      }
      const [requests, unanswered, settings, setup, totals] = await Promise.all([listRequests(), listUnanswered(), getSettings(), setupStatus(), dashboardTotals().catch(() => null)]);
      for (const r of requests) r.handover_check = handoverChecklist(r, settings);
      for (const r of requests) if (r.status === "won") r.review_link = await clientReviewUrl(r.id);
      const email_usage = await emailUsage(14).catch(() => null);
      const meOut = { role: me.role, name: me.name, username: me.username, perms: me.perms };
      if (me.role === "staff") {
        // Staff see customers and jobs, not the money totals, setup details or email usage unless they have Money.
        return res.status(200).json({ me: meOut, requests: can(me, "money") ? requests : requests.map((r) => ({ ...r, payments: [], quote_amount: null, renewal_amount: null, services: [] })),
          quick: QUICK_SERVICES, quick_extras: EXTRAS, extra_guides: EXTRA_GUIDES, quality_checks: QUALITY_CHECKS, job_stages: JOB_STAGES, unanswered, settings: Object.fromEntries(Object.entries(settings).filter(([k]) => !/^(pkg_|custom_|neon_plan|vercel_pro_at)/.test(k) && (can(me, "money") || !/^(bank_name|account_name|account_number)$/.test(k)))), setup: [], totals: can(me, "money") ? totals : null, email_usage: null, statuses: STATUSES, stages: STAGES,
          can_email_customers: customerEmailConfigured(), can_pay_online: paystackConfigured(), can_host: cloudflareConfigured() });
      }
      return res.status(200).json({ me: meOut, requests, quick: QUICK_SERVICES, quick_extras: EXTRAS, extra_guides: EXTRA_GUIDES, quality_checks: QUALITY_CHECKS, job_stages: JOB_STAGES, unanswered, settings, setup, totals, email_usage, statuses: STATUSES, stages: STAGES, can_email_customers: customerEmailConfigured(), can_pay_online: paystackConfigured(), can_host: cloudflareConfigured() });
    }

    if (req.method === "PATCH") {
      const body = readBody(req);
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Bad("Missing id");
      const needs = fieldPerms(body);
      if (!needs.every((p) => can(me, p))) return res.status(403).json({ error: NOT_ALLOWED });
      // Refunds are the owner's decision: staff (even with Money) can't add or remove one.
      if (me.role === "staff" && Array.isArray(body.payments)) {
        const cur = await getRequest(id);
        const refunds = (list) => JSON.stringify((list || []).filter((p) => p?.refund || Number(p?.amount) < 0).map((p) => [p.date, Math.abs(Number(p.amount))]));
        if (refunds(body.payments) !== refunds(cur?.payments)) return res.status(403).json({ error: "Refunds are recorded by the owner. Message him." });
      }
      await logStaff(me, "Edited " + Object.keys(body).filter((k) => k !== "id").join(", "), id);
      const changed = cleanFields(body);
      let row = await updateRequest(id, changed);
      if (!row) return res.status(404).json({ error: "Not found" });
      row = await applyRules(row, changed); // automatic status, follow-up and renewal dates
      // Quick services (flyers, cards, CVs…) sent their details with the order: no website project form.
      if (!isQuick(row.interest) && !row.brief_token && depositPaid(row)) {
        row = (await ensureBriefToken(id)) || row;
        await emailBriefLink(row); // emails the project form when customer emailing is set up
      }
      // Renewal marked paid by hand: switch a paused website back on now.
      if (changed.renewal_due && row.hosting?.pausedAt && (row.hosting.pauseReason || "renewal") === "renewal" && changed.renewal_due > todayLagos() && cloudflareConfigured()) {
        row = await restore(id).catch((e) => { console.error("restore failed", e); return row; });
      }
      // Balance marked paid by hand: connect their domain, or bring back a site paused for the balance.
      if ((changed.payments || changed.quote_amount !== undefined) && row.hosting?.project) {
        row = (await afterProjectPayment(id).catch((e) => { console.error("after payment hosting failed", e); return null; })) || row;
      }
      return res.status(200).json(row);
    }

    if (req.method === "DELETE" && me.role !== "owner") return res.status(403).json({ error: NOT_ALLOWED });
    if (req.method === "DELETE") {
      const id = Number(query.id);
      if (!Number.isInteger(id)) throw new Bad("Missing id");
      if (!(await deleteRequest(id))) return res.status(404).json({ error: "Not found" });
      // Their logo, photos and screenshots go too (privacy policy: deleted with the project).
      await Promise.all([deleteFiles(`briefs/${id}/`), deleteFiles(`design-refs/${id}/`), deleteFiles(`changes/${id}/`)]).catch((e) => console.error("file delete failed", id, e));
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      const body = readBody(req);
      if (!can(me, permFor(body.action))) return res.status(403).json({ error: NOT_ALLOWED });
      if (me.role === "staff" && !["session", "assistant", "mk_playbook", "mk_qr", "mk_captions", "mk_video_script", "changes", "mk_showcase_list", "mk_showcase", "mk_reviews", "mk_ref", "mk_ref_top", "mk_offer_get", "mk_demand", "mk_spend", "shop_orders", "site_stats"].includes(body.action)) await logStaff(me, String(body.action || "").replace(/_/g, " "), Number(body.id));
      if (body.action === "create") {
        const f = cleanFields({ name: body.name, contact: body.contact, email: body.email || "", business: body.business, interest: body.interest || "Other", details: body.details || "" });
        if (!f.name || !f.contact) throw new Bad("Name and contact are required");
        return res.status(201).json(await createRequest({ ...f, came_from: body.came_from }));
      }
      if (body.action === "brief_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const row = await ensureBriefToken(id);
        return row ? res.status(200).json(row) : res.status(404).json({ error: "Not found" });
      }
      if (body.action === "preview_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const before = await getRequest(id);
        if (!before) return res.status(404).json({ error: "Not found" });
        if (!before.has_draft) throw new Bad("Write the website text first");
        return res.status(200).json(await ensurePreviewToken(id));
      }
      if (body.action === "send_preview") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        if (!customerEmailConfigured()) throw new Bad("Emailing customers isn't set up yet (LEAD_EMAIL_FROM). Send it on WhatsApp for now.");
        const before = await getRequest(id);
        if (!before) return res.status(404).json({ error: "Not found" });
        if (!before.has_draft) throw new Bad("Write the website text first");
        const to = customerEmail(before);
        if (!to) throw new Bad("This customer has no email address. Add one under Edit customer details.");
        const row = await ensurePreviewToken(id);
        const again = (row.preview_feedback || []).length > 0;
        await sendCustomerEmail(to, again ? "Your updated website preview is ready" : "Your website preview is ready",
          customerHtml(row, [
            again ? "We've made the changes you asked for. Your updated website preview is ready." : "Good news: the first version of your website is ready for you to see.",
            "Open the preview, look through every page, then tap <b>Approve</b> at the bottom, or tell us what you'd like changed.",
            "It is a private preview. It isn't live on your domain yet.",
          ], { url: `${SITE}/preview?t=${row.preview_token}`, label: "See my website preview" }));
        await markSent(id, again ? "preview_resent" : "preview_sent");
        return res.status(200).json({ ok: true, to, row: await getRequest(id) });
      }
      if (body.action === "write_draft") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const result = await generateDraft(id, FUNCTION_BUDGET_MS() - 2000, { missingOnly: body.missingOnly === true });
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(await getRequest(id));
      }
      // Remove a photo's background (Design studio). Runs on the VPS's own background remover (BG_KEY, port 4105).
      if (body.action === "remove_bg") {
        const m = String(body.image || "").match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!m) throw new Bad("Send a JPG, PNG or WebP photo");
        const bytes = Buffer.from(m[2], "base64");
        if (bytes.length > 10 * 1024 * 1024) throw new Bad("That photo is too big (max 10 MB)");
        if (!process.env.BG_KEY) throw new Bad("The background remover isn't set up yet (it runs on the VPS: bash vps-app.sh bgremover).");
        const r = await fetch(`http://127.0.0.1:${process.env.BG_PORT || 4105}/remove`, { method: "POST", headers: { "x-bg-key": process.env.BG_KEY, "content-type": "application/octet-stream" }, body: bytes, signal: AbortSignal.timeout(50000) })
          .catch(() => { throw new Bad("The background remover isn't answering. On the VPS: pm2 restart bg-remover"); });
        if (!r.ok) throw new Bad(r.status === 401 ? "Background remover key doesn't match (BG_KEY)." : "Couldn't remove the background from that photo.");
        return res.status(200).json({ image: "data:image/png;base64," + Buffer.from(await r.arrayBuffer()).toString("base64") });
      }
      // Design studio "Save details to the order": business name, phone, socials, location… so the next open
      // starts with them (one labelled line each in the order, the same lines the order form writes).
      if (body.action === "order_info_set") {
        const r = await getRequest(Number(body.id));
        if (!r) return res.status(404).json({ error: "Not found" });
        const details = setOrderInfo(r.details, body.info || {});
        if (details === (r.details || "")) return res.status(200).json(r);
        await logStaff(me, "Saved design details", r.id);
        return res.status(200).json(await updateRequest(r.id, { details }));
      }
      // Photo labels for menu flyers in the Design studio (nothing is saved).
      if (body.action === "photo_labels") {
        const { photoLabels } = await import("./_lib/logos.mjs");
        const result = await photoLabels(body.images, body.items, FUNCTION_BUDGET_MS() - 2000);
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(result);
      }
      // Reviews and portfolio (shown on the website)
      if (/^sc_(reviews|review_set|gallery|gallery_add|gallery_remove)$/.test(body.action || "")) {
        const sc = await import("./_lib/showcase.mjs");
        if (body.action === "sc_reviews") return res.status(200).json({ reviews: await sc.listReviews({ all: true }), gallery: await sc.listGallery(), cats: sc.GALLERY_CATS });
        if (body.action === "sc_review_set") return res.status(200).json({ reviews: await sc.setReview(String(body.id), String(body.do)) });
        if (body.action === "sc_gallery") return res.status(200).json({ gallery: await sc.listGallery(), cats: sc.GALLERY_CATS });
        if (body.action === "sc_gallery_add") return res.status(200).json({ gallery: await sc.addGallery(body) });
        if (body.action === "sc_gallery_remove") return res.status(200).json({ gallery: await sc.removeGallery(String(body.id)) });
      }
      if (body.action === "headline_ideas") {
        const { headlineIdeas } = await import("./_lib/logos.mjs");
        const result = await headlineIdeas(body.brief || {}, FUNCTION_BUDGET_MS() - 2000);
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(result);
      }
      // Logo ideas for the Design studio: 3 original SVG logos from a short brief (nothing is saved).
      if (body.action === "logo_ideas") {
        const result = await logoIdeas(body.brief || {}, FUNCTION_BUDGET_MS() - 2000);
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(result);
      }
      if (body.action === "design") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const result = await generateDesign(id, undefined, body.note);
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(await getRequest(id));
      }
      // Screenshots of the look the customer likes (you take them from the sites they named): the AI design reads them.
      if (body.action === "design_ref_add" || body.action === "design_ref_remove") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const row = await getRequest(id);
        if (!row) return res.status(404).json({ error: "Not found" });
        let refs = row.design_refs || [];
        if (body.action === "design_ref_remove") refs = refs.filter((r) => r.url !== body.url);
        else {
          if (refs.length >= MAX_DESIGN_REFS) throw new Bad(`Up to ${MAX_DESIGN_REFS} screenshots. Remove one first.`);
          const type = String(body.type || "");
          if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Bad("Upload a screenshot (JPG, PNG or WebP)");
          const buf = Buffer.from(String(body.data || ""), "base64");
          if (!buf.length || buf.length > 4 * 1024 * 1024) throw new Bad("That picture is too big (max 4 MB)");
          const name = String(body.name || "screenshot").replace(/[^\w.\- ]+/g, "_").slice(0, 60) || "screenshot";
          const { url } = await putFile(`design-refs/${id}/${name}`, buf, { contentType: type });
          refs = [...refs, { url, name }];
        }
        await setDesignRefs(id, refs);
        return res.status(200).json(await getRequest(id));
      }
      if (body.action === "design_clear" || body.action === "design_option") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const result = await changeDesignOptions(id, body.action === "design_clear" ? "clear" : String(body.op || ""), String(body.option || ""));
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(await getRequest(id));
      }
      if (body.action === "session") {
        // Only with the real password (not with another session), so a stolen token can't renew itself forever.
        if (/^s[12]\./.test(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""))) throw new Bad("Log in with your password");
        if (me.role === "staff") return res.status(200).json({ token: staffSessionToken(me.row, SESSION_DAYS), days: SESSION_DAYS });
        return res.status(200).json({ token: makeSession(), days: SESSION_DAYS });
      }
      // Staff accounts (owner only).
      if (String(body.action || "").startsWith("staff_")) {
        if (me.role !== "owner") return res.status(403).json({ error: NOT_ALLOWED });
        const st = await import("./_lib/staff.mjs");
        try {
          if (body.action === "staff_list") return res.status(200).json({ staff: await st.listStaff(), log: await st.staffLog(100), perms: st.PERMS, presets: st.PRESETS });
          if (body.action === "staff_add") { const out = await st.addStaff(body.staff || {}); return res.status(200).json({ ...out, staff_list: await st.listStaff() }); }
          if (body.action === "staff_update") return res.status(200).json({ staff: await st.updateStaff(body.staff_id, body.staff || {}) });
          if (body.action === "staff_reset") { const out = await st.resetStaffPassword(body.staff_id); return res.status(200).json({ ...out, staff_list: await st.listStaff() }); }
          if (body.action === "staff_delete") return res.status(200).json({ staff: await st.deleteStaff(body.staff_id) });
        } catch (e) { throw new Bad(e.message); }
        throw new Bad("Unknown action");
      }
      if (body.action === "assistant") {
        const raw = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        const msgs = [];
        for (const m of raw) {
          if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) continue;
          const content = m.content.trim().slice(0, 4000);
          if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n" + content;
          else msgs.push({ role: m.role, content });
        }
        while (msgs.length && msgs[0].role !== "user") msgs.shift();
        if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new Bad("Ask a question");
        await ensureAiBackup();
        const provider = pickProvider();
        if (!provider) throw new Bad("No AI key is set in Netlify (GEMINI_API_KEY or ANTHROPIC_API_KEY)");
        const id = Number.isInteger(Number(body.id)) && Number(body.id) > 0 ? Number(body.id) : null;
        try {
          const out = await provider.call(provider.start(msgs), await assistantSystem(id, me), [], FUNCTION_BUDGET_MS() - 3000, { maxTokens: 1500, attemptMs: FUNCTION_BUDGET_MS() - 5000 });
          return res.status(200).json({ reply: (out.text || "").trim() || "Sorry, I couldn't answer that. Try asking another way." });
        } catch (e) {
          console.error("admin assistant failed", e.code, e.message);
          throw new Bad(friendlyAiError(e));
        }
      }
      if (body.action === "notices" || body.action === "notice_save" || body.action === "notice_delete") {
        try {
          if (body.action === "notice_save") await saveNotice(body.notice || {});
          if (body.action === "notice_delete") await deleteNotice(String(body.noticeId || ""));
        } catch (e) { throw new Bad(e.message); }
        return res.status(200).json({ notices: await noticesForAdmin(), kinds: NOTICE_KINDS });
      }
      if (body.action === "email_usage") return res.status(200).json({ usage: await emailUsage(14), refused: await listRefused(50) });
      if (body.action === "email_resend" || body.action === "email_refused_remove") {
        let result = null;
        if (body.action === "email_resend") result = await resendRefused(body.all ? "all" : [Number(body.emailId)]);
        else await removeRefused(body.emailId);
        return res.status(200).json({ result, usage: await emailUsage(14), refused: await listRefused(50) });
      }
      // A customer's website reviews, from admin (same as the owner's Manage link, plus Delete). Republishes a live site.
      if (body.action === "site_reviews" || body.action === "site_review_set") {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) throw new Bad("Missing id");
        const { listReviews, setReviewStatuses, deleteReview } = await import("./_lib/reviews.mjs");
        let republished = null;
        if (body.action === "site_review_set") {
          const st = String(body.status || "");
          const changed = st === "delete" ? await deleteReview(id, body.reviewId) : (await setReviewStatuses(id, { [Number(body.reviewId)]: st })).length > 0;
          const h = (await getRequest(id))?.hosting || {};
          if (changed && h.project && !h.pausedAt) {
            const { publish } = await import("./_lib/golive.mjs");
            republished = await publish(id, { force: true }).then(() => true).catch((e) => e.message);
          }
        }
        return res.status(200).json({ reviews: await listReviews(id, 100), republished });
      }
      if (body.action === "reviews" || body.action === "review_set") {
        const { listReviews, setReviewStatuses, OUR_ID } = await import("./_lib/reviews.mjs");
        if (body.action === "review_set") await setReviewStatuses(OUR_ID, { [Number(body.reviewId)]: String(body.status || "") });
        return res.status(200).json({ reviews: await listReviews(OUR_ID, 100) });
      }
      if (body.action === "manage_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const { manageLink } = await import("./_lib/manage.mjs");
        const link = await manageLink(id, { renew: body.renew === true });
        return link ? res.status(200).json({ ...link, row: await getRequest(id) }) : res.status(404).json({ error: "Not found" });
      }
      if (body.action === "paystack_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const link = await paystackConnectLink(id);
        return link ? res.status(200).json({ ...link, row: await getRequest(id) }) : res.status(404).json({ error: "Not found" });
      }
      if (body.action === "greetings" || body.action === "greetings_save" || body.action === "greetings_email") {
        try {
          if (body.action === "greetings_save") await saveConfig(body.changes);
          if (body.action === "greetings_email") await queueEmails(String(body.key || ""));
        } catch (e) { throw new Bad(e.message); }
        const list = occurrences(await getConfig());
        for (const o of list) o.email = await emailStatus(o.key);
        return res.status(200).json({ festivals: list, audience: (await audience()).length, per_day: GREETING_EMAILS_PER_DAY, can_email: customerEmailConfigured() });
      }
      if (["changes", "change_mark", "change_add", "change_ai_plan", "change_ai_apply", "change_ai_undo", "change_ai_send", "change_ai_sent", "site_stats", "report_send", "report_toggle"].includes(body.action)) {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) throw new Bad("Missing id");
        const row = await getRequest(id);
        if (!row) return res.status(404).json({ error: "Not found" });
        if (body.action === "changes") return res.status(200).json({ link: await changeLink(id), free_until: freeUntil(row), changes: await listChanges(id, 20) });
        // A request the customer sent on WhatsApp: type it in here so it's kept with the others (and AI can do it).
        if (body.action === "change_add") {
          try { await addChange(row, body.body, [], { quiet: true }); } catch (e) { throw new Bad(e.message); }
          return res.status(200).json({ link: await changeLink(id), free_until: freeUntil(row), changes: await listChanges(id, 20) });
        }
        // "Do it with AI": plan (nothing changes yet), apply (site updated + customer told), undo.
        if (body.action.startsWith("change_ai_")) {
          const { planChange, applyChange, undoChange, sendChangePreview, markPreviewSent } = await import("./_lib/ai-change.mjs");
          const cid = Number(body.change_id);
          try {
            let out = {};
            if (body.action === "change_ai_plan") out.plan = await planChange(id, cid);
            else if (body.action === "change_ai_apply") out = await applyChange(id, cid, { tell: body.tell !== false });
            else if (body.action === "change_ai_send") out = await sendChangePreview(id, cid);
            else if (body.action === "change_ai_sent") out = { url: await markPreviewSent(id, cid) };
            else out = await undoChange(id, cid);
            return res.status(200).json({ ...out, changes: await listChanges(id, 20) });
          } catch (e) {
            if (e.status === 404) return res.status(404).json({ error: "Not found" });
            throw new Bad(e.message);
          }
        }
        if (body.action === "change_mark") {
          const c = await markChange(id, Number(body.change_id), { done: Boolean(body.done), note: body.note });
          if (!c) return res.status(404).json({ error: "Not found" });
          return res.status(200).json({ change: c, changes: await listChanges(id, 20) });
        }
        if (body.action === "report_toggle") {
          await saveHosting(id, { reportsOff: body.off ? new Date().toISOString() : null });
          return res.status(200).json({ row: await getRequest(id) });
        }
        const to = new Date(Date.now() + 3600 * 1000);
        const from = new Date(to.getTime() - 29 * 86400000);
        const s = await siteSummary(id, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
        if (body.action === "site_stats") return res.status(200).json({ stats: s, tracking: Boolean(row.hosting?.statsKey) });
        const email = customerEmail(row);
        if (!email) throw new Bad("This customer has no email address. Add one under Edit customer details.");
        if (!customerEmailConfigured()) throw new Bad("Emailing customers isn't set up yet.");
        await sendCustomerEmail(email, `Your website in the last 30 days: ${s.visitors} visitor${s.visitors === 1 ? "" : "s"}`, reportHtml(row, s, "the last 30 days"));
        return res.status(200).json({ ok: true, to: email });
      }
      if (body.action === "shop_settings" || body.action === "shop_orders") {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) throw new Bad("Missing id");
        if (body.action === "shop_orders") return res.status(200).json({ orders: await listOrders(id, 20) });
        try {
          const row = await setShopPayments(id, { secretKey: body.secretKey, deliveryFee: body.deliveryFee, notify: body.notify, remove: Boolean(body.remove),
            paystackOn: body.paystackOn, flwOn: body.flwOn, flwRemove: Boolean(body.flwRemove), transfer: body.transfer, delivery: body.delivery,
            accounts: body.accounts, accountsOn: body.accountsOn, google: body.google, manageOn: body.manageOn });
          return res.status(200).json({ row, orders: await listOrders(id, 20) });
        } catch (e) { throw new Bad(e.message); }
      }
      // The store owner's own login for My store (/mystore): create, reset (temporary password), switch off/on, rename, remove.
      if (body.action === "store_logins_all") {
        const sa = await import("./_lib/storeaccounts.mjs");
        return res.status(200).json({ logins: await sa.allOwnerLogins() });
      }
      if (body.action === "store_login") {
        const id = Number(body.id);
        if (!Number.isInteger(id) || id <= 0) throw new Bad("Missing id");
        const sa = await import("./_lib/storeaccounts.mjs");
        try {
          if (body.do === "get") return res.status(200).json({ login: await sa.ownerLogin(id), suggest: sa.suggestOwnerUsername(await sa.storeRow(id)) });
          if (body.do === "create") return res.status(200).json(await sa.createOwnerLogin(id, { username: body.username }));
          if (body.do === "reset") return res.status(200).json(await sa.resetOwnerLogin(id));
          if (body.do === "set") return res.status(200).json(await sa.adminSetOwnerPassword(id, body.password));
          if (body.do === "active") return res.status(200).json({ login: await sa.updateOwnerLogin(id, { active: Boolean(body.active) }) });
          if (body.do === "username") return res.status(200).json({ login: await sa.updateOwnerLogin(id, { username: body.username }) });
          if (body.do === "delete") { await sa.deleteOwnerLogin(id); return res.status(200).json({ login: null }); }
        } catch (e) { throw new Bad(e.message); }
        throw new Bad("Unknown");
      }
      // ---------- Owner tools the Playbook and staff guides send people to ----------
      // White label: hide "Website by SIRRADDO · Get a website like this" on a client site (then update it live).
      if (body.action === "site_credit") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        await saveHosting(id, { noCredit: !body.on });
        const row = await getRequest(id);
        if (row?.hosting?.publishedAt && !row.hosting.pausedAt) await publish(id, { force: true }).catch((e) => console.error("credit republish failed", e));
        return res.status(200).json({ row: await getRequest(id) });
      }
      // Moved away / closed: no more renewal reminders, renewal invoices, auto-pause or service fees.
      if (body.action === "stop_renewals") {
        const id = Number(body.id);
        const row = await getRequest(id);
        if (!row) return res.status(404).json({ error: "Not found" });
        const note = `Renewals and services stopped ${new Date().toISOString().slice(0, 10)}${body.reason ? ": " + text(body.reason, 200) : ""}.`;
        const out = await updateRequest(id, { renewal_due: null, renewal_amount: null, services: (row.services || []).map((x) => ({ ...x, active: false })),
          notes: [row.notes, note].filter(Boolean).join("\n") });
        return res.status(200).json({ row: out });
      }
      // A store payment that didn't finish on the page (e.g. "I paid but got no order"): ask Paystack / Flutterwave again.
      if (body.action === "shop_check") {
        const { confirmOrder, orderByRef } = await import("./_lib/shop.mjs");
        const o = await orderByRef(body.ref);
        if (!o || o.request_id !== Number(body.id)) throw new Bad("Order not found");
        const { order } = await confirmOrder(o.ref);
        return res.status(200).json({ order });
      }
      // A buyer asked the store to delete their data: their account goes, and their details are removed from orders
      // (the amounts stay for the store's accounts).
      if (body.action === "shop_erase") {
        const { eraseBuyer } = await import("./_lib/storeaccounts.mjs");
        try { return res.status(200).json(await eraseBuyer(Number(body.id), { phone: body.phone })); } catch (e) { throw new Bad(e.message); }
      }
      // Delete one website chat (e.g. the person asked us to delete their data). Chats also go by themselves after 90 days.
      if (body.action === "chat_delete") {
        const sid = String(body.session_id || "");
        if (!/^[\w-]{6,80}$/.test(sid)) throw new Bad("Missing chat");
        const rows = await q(`DELETE FROM chat_logs WHERE session_id = $1 RETURNING created_at, updated_at`, [sid]);
        for (const t of rows) for (const d of [t.created_at, t.updated_at]) await deleteFiles(`chats/${new Date(d).toISOString().slice(0, 7)}/${sid}/`).catch(() => {});
        return res.status(200).json({ ok: rows.length > 0 });
      }
      // Company documents (CAC certificate, TIN, SCUML, letter of introduction…) ready to send to companies and tenders.
      if (body.action === "company_docs" || body.action === "company_doc_add" || body.action === "company_doc_remove") {
        let docs = [];
        try { docs = JSON.parse((await getMeta(["company_docs"])).company_docs || "[]"); } catch { docs = []; }
        if (body.action === "company_doc_remove") docs = docs.filter((d) => d.url !== body.url);
        if (body.action === "company_doc_add") {
          if (docs.length >= 12) throw new Bad("Up to 12 documents. Remove one first.");
          const type = String(body.type || "");
          if (!["application/pdf", "image/jpeg", "image/png"].includes(type)) throw new Bad("Upload a PDF or a photo (JPG/PNG)");
          const buf = Buffer.from(String(body.data || ""), "base64");
          if (!buf.length || buf.length > 4 * 1024 * 1024) throw new Bad("That file is too big (max 4 MB). Compress the PDF first.");
          const title = text(body.title, 80) || "Document";
          const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : "jpg";
          const { url } = await putFile(`company/${title.replace(/[^\w-]+/g, "-").toLowerCase()}.${ext}`, buf, { contentType: type });
          docs.push({ title, url, type, at: new Date().toISOString() });
        }
        if (body.action !== "company_docs") await setMeta("company_docs", JSON.stringify(docs));
        return res.status(200).json({ docs });
      }
      if (String(body.action || "").startsWith("host_")) {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        try {
          let out = { ok: true };
          if (body.action === "host_domain") out.row = await addDomain(id, body.domain);
          else if (body.action === "host_check") out.row = await checkHosting(id);
          else if (body.action === "host_rollback") out.row = await restorePrevious(id);
          else if (body.action === "host_publish") Object.assign(out, await publish(id, { force: Boolean(body.force) }));
          else if (body.action === "host_pause") out.row = await pause(id, "manual");
          else if (body.action === "host_restore") out.row = await restore(id);
          else if (body.action === "host_email") out.row = await setupEmail(id, body.locals, body.to, body.routes);
          else throw new Bad("Unknown action");
          // It worked: clear an old error so the badge stops saying "Problem".
          if (out.row?.hosting?.lastError || (!out.row && body.action === "host_publish")) {
            await saveHosting(id, { lastError: null }).catch(() => {});
            out.row = await getRequest(id);
          }
          return res.status(200).json(out);
        } catch (e) {
          if (/^Cloudflare:/.test(e.message) || !(e instanceof GoLiveError)) await saveHosting(id, { lastError: String(e.message).slice(0, 300), lastErrorAt: new Date().toISOString() }).catch(() => {});
          if (e instanceof GoLiveError || /^Cloudflare:/.test(e.message)) throw new Bad(e.message);
          throw e;
        }
      }
      if (body.action === "doc_link") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const row = await ensureDocToken(id);
        return row ? res.status(200).json(row) : res.status(404).json({ error: "Not found" });
      }
      if (body.action === "send_doc") {
        const id = Number(body.id);
        if (!Number.isInteger(id) || !DOC_TYPES.includes(body.type)) throw new Bad("Missing id or document type");
        if (!customerEmailConfigured()) throw new Bad("Emailing customers isn't set up yet: verify your domain in Resend and set LEAD_EMAIL_FROM in Netlify. Send it on WhatsApp for now.");
        const row = (await ensureDocToken(id)) || (await getRequest(id));
        if (!row) return res.status(404).json({ error: "Not found" });
        const to = customerEmail(row);
        if (!to) throw new Bad("This customer has no email address. Add one under Edit customer details.");
        if (body.type === "handover") await addHandoverExtras(row);
        const doc = buildDoc(row, body.type, await getSettings());
        if (doc.error) throw new Bad(doc.error);
        const link = `${SITE}/doc?t=${row.doc_token}&type=${body.type}`;
        const intro = body.type === "receipt" ? "Thank you for your payment. Your receipt is below."
          : body.type === "handover" ? `Your website is live at <a href="${row.website_url}">${row.website_url}</a>. Below is your handover pack with everything you need to know.${row.handover?.has_logins ? " Your passwords will come separately on WhatsApp." : ""}`
          : "Please find your invoice below.";
        await sendCustomerEmail(to, doc.subject, `<p style="font-family:Arial,sans-serif">Hello ${row.name.split(" ")[0]},</p>
          <p style="font-family:Arial,sans-serif">${intro}
          You can also <a href="${link}">view, print or save it as a PDF</a>.</p>${body.type === "invoice" ? payButton(row) : body.type === "renewal" ? payButton(row, "renewal") : ""}${doc.html}`);
        if (body.type === "handover") await markSent(id, "handover");
        return res.status(200).json({ ok: true, to, row: body.type === "handover" ? await getRequest(id) : undefined });
      }
      // Admin → Marketing → Agents: applications, commission, payouts (list for marketing staff; the rest owner only).
      if (/^agents?_/.test(String(body.action || ""))) {
        const ag = await import("./_lib/agents.mjs");
        if (body.action !== "agents_list" && !can(me, "owner")) return res.status(403).json({ error: NOT_ALLOWED });
        try {
          if (body.action === "agent_update") await ag.adminUpdate(body.id, body);
          if (body.action === "agent_payout") await ag.adminPayout(body.id, body);
          if (body.action === "agent_reset") return res.status(200).json(await ag.adminResetPassword(body.id));
          if (body.action === "agent_bonus") await ag.adminBonus(body.id, body);
          if (body.action === "agent_news") { const r2 = await ag.adminNews(body); const out2 = await ag.adminList(); return res.status(200).json({ ...out2, emailed: r2.emailed }); }
          if (body.action === "agent_news_delete") await ag.adminNewsDelete(body.id);
          if (body.action === "agents_settings") {
            const rate = Number(body.rate), min = Number(body.min);
            if (!(rate > 0 && rate <= 50)) throw new Bad("Commission must be between 1 and 50%.");
            if (!(min >= 1000)) throw new Bad("The smallest payout must be at least ₦1,000.");
            const set = { agent_rate: String(rate), agent_min: String(Math.round(min)) };
            if ("tiers" in body) {
              const t = String(body.tiers || "").trim();
              if (t && !/^off$/i.test(t) && !ag.parseTiers(t).length) throw new Bad('Write levels like "5:12, 15:15" (from the 5th paying client 12%…), or "off".');
              set.agent_tiers = /^off$/i.test(t) ? "off" : ag.parseTiers(t).map((x) => `${x.clients}:${x.rate}`).join(",");
            }
            if ("invite_bonus" in body) {
              const ib = Math.round(Number(body.invite_bonus));
              if (!(ib >= 0 && ib <= 100000)) throw new Bad("The invite bonus must be between ₦0 and ₦100,000.");
              set.agent_invite_bonus = String(ib);
            }
            await saveSettings(set);
          }
          const out = await ag.adminList();
          return res.status(200).json(can(me, "money") ? out : { ...out, agents: out.agents.map((a) => ({ ...a, bank: null, payouts: [], leads: a.leads.map((l) => ({ ...l, paid: null })) })) });
        } catch (e) { if (e instanceof ag.AgentError) throw new Bad(e.message); throw e; }
      }
      // Settings → Keys & connections (owner only): service keys stored encrypted; values are never sent back.
      if (String(body.action || "").startsWith("vault")) {
        if (!can(me, "owner")) return res.status(403).json({ error: NOT_ALLOWED });
        const vt = await import("./_lib/vault.mjs");
        try {
          if (body.action === "vault_save") { const r = await vt.vaultSave(String(body.key || ""), body.value); return res.status(200).json({ ...(await vt.vaultStatus()), test: r.test }); }
          if (body.action === "vault_remove") { await vt.vaultRemove(String(body.key || "")); return res.status(200).json(await vt.vaultStatus()); }
          if (body.action === "vault_import") { const n = await vt.vaultImport(); return res.status(200).json({ ...(await vt.vaultStatus()), copied: n }); }
          if (body.action === "vault_relock") { const n = await vt.vaultRelock(body.old); return res.status(200).json({ ...(await vt.vaultStatus()), relocked: n }); }
          if (body.action === "vault_test") return res.status(200).json({ ...(await vt.vaultStatus()), tests: await vt.vaultTestAll() });
          return res.status(200).json(await vt.vaultStatus());
        } catch (e) { throw new Bad(e.message); }
      }
      // Settings → AI backup (owner only): the key is stored encrypted and never sent back.
      if (String(body.action || "").startsWith("ai_backup")) {
        if (!can(me, "owner")) return res.status(403).json({ error: NOT_ALLOWED });
        const ab = await import("./_lib/aibackup.mjs");
        try {
          if (body.action === "ai_backup_save") return res.status(200).json(await ab.saveAiBackup(body));
          if (body.action === "ai_backup_test") {
            const { ensureAiBackup, chatProviders } = await import("./_lib/providers.mjs");
            const cfg = await ensureAiBackup(true);
            if (!cfg) throw new Bad("Save a key and switch the backup on first.");
            const p = chatProviders().find((x) => x.name === "backup");
            const t0 = Date.now();
            try {
              const out = await p.call(p.start([{ role: "user", content: "Reply with exactly: OK, backup ready." }]), "You are a test. Reply briefly.", [], 20000, { maxTokens: 30, where: "test" });
              return res.status(200).json({ ok: true, ms: Date.now() - t0, reply: String(out.text || "").slice(0, 120), status: await ab.aiBackupStatus() });
            } catch (e) {
              const m = String(e.code || "") + " " + e.message;
              const why = /_401|_403|invalid.*key|unauthor/i.test(m) ? "The key was refused. Copy it again from the service and save."
                : /_402|credit|balance|insufficient/i.test(m) ? "The service says there's no credit on the account. Add a little credit, then test again."
                : /_404|model/i.test(m) ? "The service doesn't know that model name. Check the model on its website."
                : /_429/.test(m) ? "Too many requests right now (or the free limit is used up). Try again later."
                : /timeout/i.test(m) ? "The service took too long. Try again." : "It didn't answer: " + e.message.slice(0, 160);
              return res.status(200).json({ ok: false, error: why, status: await ab.aiBackupStatus() });
            }
          }
          return res.status(200).json(await ab.aiBackupStatus());
        } catch (e) { if (e.status === 400) throw new Bad(e.message); throw e; }
      }
      if (body.action === "settings") {
        return res.status(200).json({ settings: await saveSettings(body.settings || {}) });
      }
      if (body.action === "question") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const ok = body.remove ? await deleteUnanswered(id) : await setUnansweredResolved(id, Boolean(body.resolved));
        return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "Not found" });
      }
      // Admin → Marketing (offers, referrals, ad spend, captions, picture maker data).
      if (String(body.action || "").startsWith("mk_")) {
        const m = await import("./_lib/marketing.mjs");
        const id = Number(body.id);
        try {
          switch (body.action) {
            case "mk_qr": return res.status(200).json(await m.qrSvg(body.tag, body.src || "qr"));
            case "mk_offer_get": return res.status(200).json({ offer: await m.getOffer() });
            case "mk_offer_save": return res.status(200).json({ offer: await m.saveOffer(body.offer || {}) });
            case "mk_ref": return res.status(200).json(await m.referralInfo(id));
            case "mk_ref_use": await m.useReward(id, Number(body.n) || 1); return res.status(200).json(await m.referralInfo(id));
            case "mk_ref_top": return res.status(200).json({ top: await m.topReferrers(), reward: await m.rewardText() });
            case "mk_spend": return res.status(200).json({ spend: await m.listSpend(), report: await m.spendReport() });
            case "mk_spend_add": await m.addSpend(body.entry || {}); return res.status(200).json({ spend: await m.listSpend(), report: await m.spendReport() });
            case "mk_spend_del": await m.deleteSpend(body.spend_id); return res.status(200).json({ spend: await m.listSpend(), report: await m.spendReport() });
            case "mk_showcase_list": return res.status(200).json({ sites: await m.showcaseList() });
            case "mk_showcase_ok": return res.status(200).json({ sites: await m.setShowcaseOk(id, body.ok) });
            case "mk_showcase": return res.status(200).json(await m.showcaseData(id));
            case "mk_reviews": return res.status(200).json({ reviews: await m.ourReviews() });
            case "mk_captions": return res.status(200).json({ captions: await m.writeCaptions(body) });
            case "mk_svc_paid": await recordServicePayment(id, String(body.service_id || ""), body.payment || {}); return res.status(200).json(await getRequest(id));
            case "mk_neon": {
              const nu = await import("./_lib/neon-usage.mjs");
              let usage = await nu.savedUsage(), error = null;
              if (body.refresh && nu.neonConfigured()) { try { usage = await nu.fetchUsage(); await setMeta("neon_usage", JSON.stringify(usage)); } catch (e) { error = e.message; } }
              return res.status(200).json({ configured: nu.neonConfigured(), usage, error, free: { cuh: nu.FREE_CUH, gb: nu.FREE_GB } });
            }
            case "mk_demand": return res.status(200).json({ demand: await m.demand() });
            case "mk_playbook": { const pb = await import("./_lib/playbook.mjs"); return res.status(200).json({ playbook: pb.PLAYBOOK, policy: pb.POLICY }); }
            case "mk_video_script": return res.status(200).json({ script: await m.videoScript(body) });
            default: throw new Bad("Unknown action");
          }
        } catch (e) {
          if (e instanceof Bad) throw e;
          if (e.message === "Not found") return res.status(404).json({ error: "Not found" });
          throw new Bad(e.message);
        }
      }
      throw new Bad("Unknown action");
    }

    res.setHeader("Allow", "GET, PATCH, DELETE, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    if (err instanceof Bad) return res.status(400).json({ error: err.message });
    console.error("requests failed", err);
    return res.status(500).json({ error: "Database error" });
  }
}
