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
import { timingSafeEqual, createHash } from "node:crypto";
import {
  dbConfigured, listRequests, createRequest, updateRequest, deleteRequest, listChats, listUnanswered,
  setUnansweredResolved, deleteUnanswered, getSettings, saveSettings, ensureBriefToken, STATUSES, STAGES,
  ensureDocToken, getRequest, customerEmail, customerEmailConfigured, sendCustomerEmail,
  ensurePreviewToken, getPreviewById, markSent, saveDesign, saveHosting,
} from "./_lib/store.mjs";
import { buildDoc, DOC_TYPES } from "./_lib/docs.mjs";
import { applyRules, emailBriefLink, SITE, customerHtml } from "./_lib/automation.mjs";
import { buildSiteModel, exportFiles, zip, slugify } from "./_lib/sitegen.mjs";
import { paystackConfigured, payButton } from "./_lib/paystack.mjs";
import { setupStatus } from "./_lib/setup.mjs";
import { assistantSystem } from "./_lib/assistant.mjs";
import { pickProvider, friendlyAiError } from "./_lib/providers.mjs";
import { generateDesign, changeDesignOptions } from "./_lib/design.mjs";
import { addDomain, checkHosting, publish, pause, restore, setupEmail, afterProjectPayment, GoLiveError } from "./_lib/golive.mjs";
import { cloudflareConfigured } from "./_lib/cloudflare.mjs";
import { todayLagos } from "./_lib/automation.mjs";
import { generateDraft } from "./_lib/drafts.mjs";
import { getBriefById } from "./_lib/store.mjs";

// The project brief link is created once the deposit is in: 70% of the quote paid
// (or any project payment if no quote was entered).
function depositPaid(row) {
  const paid = (row.payments || []).filter((p) => p.kind !== "renewal").reduce((s, p) => s + Number(p.amount || 0), 0);
  if (!paid) return false;
  return row.quote_amount ? paid >= Math.round(row.quote_amount * 0.7) : true;
}

const failed = new Map(); // ip -> timestamps of wrong passwords

function authorised(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (expected.length < 12) return false; // refuse weak or missing passwords
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

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
      emails: text(h.emails, 1000), webmail, notes: text(h.notes, 2000), has_logins: h.has_logins === true,
    };
  }
  if (has("payments")) {
    if (!Array.isArray(body.payments) || body.payments.length > 200) throw new Bad("Payments must be a list");
    out.payments = body.payments.map((p) => {
      const amount = naira(p?.amount);
      if (!amount) throw new Bad("Each payment needs an amount");
      return {
        date: date(p.date) || new Date().toISOString().slice(0, 10),
        amount,
        kind: p.kind === "renewal" ? "renewal" : "project",
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

  if (!authorised(req)) {
    recent.push(now);
    failed.set(ip, recent);
    const configured = (process.env.ADMIN_PASSWORD || "").length >= 12;
    return res.status(401).json({ error: configured ? "Wrong password" : "ADMIN_PASSWORD is not set (min 12 characters)" });
  }
  if (!dbConfigured()) return res.status(503).json({ error: "DATABASE_URL is not set" });

  const query = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  try {
    if (req.method === "GET") {
      if (query.view === "chats") return res.status(200).json({ chats: await listChats() });
      if (query.view === "export") {
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
      const [requests, unanswered, settings, setup] = await Promise.all([listRequests(), listUnanswered(), getSettings(), setupStatus()]);
      return res.status(200).json({ requests, unanswered, settings, setup, statuses: STATUSES, stages: STAGES, can_email_customers: customerEmailConfigured(), can_pay_online: paystackConfigured(), can_host: cloudflareConfigured() });
    }

    if (req.method === "PATCH") {
      const body = readBody(req);
      const id = Number(body.id);
      if (!Number.isInteger(id)) throw new Bad("Missing id");
      const changed = cleanFields(body);
      let row = await updateRequest(id, changed);
      if (!row) return res.status(404).json({ error: "Not found" });
      row = await applyRules(row, changed); // automatic status, follow-up and renewal dates
      if (!row.brief_token && depositPaid(row)) {
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

    if (req.method === "DELETE") {
      const id = Number(query.id);
      if (!Number.isInteger(id)) throw new Bad("Missing id");
      return (await deleteRequest(id)) ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "Not found" });
    }

    if (req.method === "POST") {
      const body = readBody(req);
      if (body.action === "create") {
        const f = cleanFields({ name: body.name, contact: body.contact, email: body.email || "", business: body.business, interest: body.interest || "Other", details: body.details || "" });
        if (!f.name || !f.contact) throw new Bad("Name and contact are required");
        return res.status(201).json(await createRequest(f));
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
        const result = await generateDraft(id, 50000);
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(await getRequest(id));
      }
      if (body.action === "design") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const result = await generateDesign(id);
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(await getRequest(id));
      }
      if (body.action === "design_clear" || body.action === "design_option") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const result = await changeDesignOptions(id, body.action === "design_clear" ? "clear" : String(body.op || ""), String(body.option || ""));
        if (!result.ok) throw new Bad(result.error);
        return res.status(200).json(await getRequest(id));
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
        const provider = pickProvider();
        if (!provider) throw new Bad("No AI key is set in Vercel (GEMINI_API_KEY or ANTHROPIC_API_KEY)");
        const id = Number.isInteger(Number(body.id)) && Number(body.id) > 0 ? Number(body.id) : null;
        try {
          const out = await provider.call(provider.start(msgs), await assistantSystem(id), [], 45000, { maxTokens: 1500, attemptMs: 40000 });
          return res.status(200).json({ reply: (out.text || "").trim() || "Sorry, I couldn't answer that. Try asking another way." });
        } catch (e) {
          console.error("admin assistant failed", e.code, e.message);
          throw new Bad(friendlyAiError(e));
        }
      }
      if (String(body.action || "").startsWith("host_")) {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        try {
          let out = { ok: true };
          if (body.action === "host_domain") out.row = await addDomain(id, body.domain);
          else if (body.action === "host_check") out.row = await checkHosting(id);
          else if (body.action === "host_publish") Object.assign(out, await publish(id, { force: Boolean(body.force) }));
          else if (body.action === "host_pause") out.row = await pause(id, "manual");
          else if (body.action === "host_restore") out.row = await restore(id);
          else if (body.action === "host_email") out.row = await setupEmail(id, body.locals, body.to);
          else throw new Bad("Unknown action");
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
        if (!customerEmailConfigured()) throw new Bad("Emailing customers isn't set up yet: verify your domain in Resend and set LEAD_EMAIL_FROM in Vercel. Send it on WhatsApp for now.");
        const row = (await ensureDocToken(id)) || (await getRequest(id));
        if (!row) return res.status(404).json({ error: "Not found" });
        const to = customerEmail(row);
        if (!to) throw new Bad("This customer has no email address. Add one under Edit customer details.");
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
      if (body.action === "settings") {
        return res.status(200).json({ settings: await saveSettings(body.settings || {}) });
      }
      if (body.action === "question") {
        const id = Number(body.id);
        if (!Number.isInteger(id)) throw new Bad("Missing id");
        const ok = body.remove ? await deleteUnanswered(id) : await setUnansweredResolved(id, Boolean(body.resolved));
        return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ error: "Not found" });
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
