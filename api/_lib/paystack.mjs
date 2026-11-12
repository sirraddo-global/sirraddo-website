// Paystack: online payment of deposits, balances and renewals.
// Needs PAYSTACK_SECRET_KEY in Vercel. Paystack's webhook (/api/paystack-webhook) and the return page (/pay)
// both record the payment; recordPayment() makes sure it is only counted once.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  getRequest, addPaymentOnce, ensureBriefToken, ensureDocToken, updateRequest, getSettings, customerEmail,
  customerEmailConfigured, sendCustomerEmail, sendEmail, emailConfigured, reference, esc,
} from "./store.mjs";
import { applyRules, emailBriefLink, todayLagos, addYear, daysBetween, SITE } from "./automation.mjs";
import { buildDoc, balance, naira } from "./docs.mjs";

const API = "https://api.paystack.co";
export const paystackConfigured = () => /^sk_(live|test)_/.test(process.env.PAYSTACK_SECRET_KEY || "");

async function call(path, body) {
  const res = await fetch(API + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.status === false) throw new Error(j.message || `Paystack ${res.status}`);
  return j.data;
}

const projectPaid = (r) => (r.payments || []).filter((p) => p.kind !== "renewal").reduce((s, p) => s + Number(p.amount || 0), 0);

// What the customer can pay now, worked out on the server (never trusted from the browser).
// for: "deposit" | "balance" | "renewal" | "" (auto)
export function amountDue(r, want = "") {
  const deposit = r.quote_amount && !projectPaid(r) ? Math.round(r.quote_amount * 0.7) : 0;
  const bal = r.quote_amount != null && projectPaid(r) > 0 ? balance(r) : 0;
  // Renewals can be paid from 60 days before the due date (or any time after it).
  const renewalOpen = r.renewal_amount && r.renewal_due && (r.project_stage === "live" || r.live_on) && daysBetween(todayLagos(), r.renewal_due) <= 60;
  const options = {
    deposit: deposit ? { kind: "project", amount: deposit, label: `70% deposit for your ${r.interest}` } : null,
    balance: bal > 0 ? { kind: "project", amount: bal, label: `Balance for your ${r.interest}` } : null,
    renewal: renewalOpen ? { kind: "renewal", amount: r.renewal_amount, label: `Yearly website renewal (due ${r.renewal_due})`, renewal_due: r.renewal_due } : null,
  };
  if (want) return options[want] ? { for: want, ...options[want] } : null;
  for (const k of ["deposit", "balance", "renewal"]) if (options[k]) return { for: k, ...options[k] };
  return null;
}

export const payLink = (r, want = "") => (r.doc_token ? `${SITE}/pay?t=${r.doc_token}${want ? "&for=" + want : ""}` : "");

// Start a payment: returns Paystack's checkout URL.
export async function startPayment(r, due, email) {
  const ref = `SGL${r.id}-${due.for.slice(0, 3).toUpperCase()}-${randomBytes(5).toString("hex")}`;
  const data = await call("/transaction/initialize", {
    email,
    amount: due.amount * 100, // kobo
    currency: "NGN",
    reference: ref,
    callback_url: `${SITE}/pay?t=${r.doc_token}`,
    metadata: {
      request_id: r.id, for: due.for, kind: due.kind, renewal_due: due.renewal_due || null,
      custom_fields: [
        { display_name: "Reference", variable_name: "sgl_ref", value: reference(r.id) },
        { display_name: "For", variable_name: "for", value: due.label },
      ],
    },
  });
  return data.authorization_url;
}

export async function verifyPayment(ref) {
  return call(`/transaction/verify/${encodeURIComponent(ref)}`);
}

// Paystack signs each webhook with HMAC-SHA512 of the raw body using your secret key.
export function validSignature(raw, signature) {
  if (!paystackConfigured() || !signature) return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(raw).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Record a successful Paystack transaction (from the webhook or the return page). Safe to call twice.
// Returns { row, added } or null if the transaction isn't ours or isn't a success.
export async function recordPayment(tx) {
  if (!tx || tx.status !== "success" || tx.currency !== "NGN") return null;
  const meta = typeof tx.metadata === "string" ? (() => { try { return JSON.parse(tx.metadata); } catch { return {}; } })() : tx.metadata || {};
  const id = Number(meta.request_id);
  if (!Number.isInteger(id) || !/^SGL\d+-/.test(tx.reference || "")) return null;
  const amount = Math.round(Number(tx.amount) / 100);
  if (!(amount > 0)) return null;
  const kind = meta.kind === "renewal" ? "renewal" : "project";
  const date = String(tx.paid_at || tx.paidAt || "").slice(0, 10) || todayLagos();
  const note = kind === "renewal" ? `Paystack · renewal${meta.renewal_due ? " due " + meta.renewal_due : ""}` : `Paystack · ${meta.for === "deposit" ? "deposit" : "balance"}`;
  let row = await addPaymentOnce(id, { date, amount, kind, note, ref: tx.reference });
  if (!row) return { row: await getRequest(id), added: false }; // already recorded
  const changed = { payments: row.payments };
  // A renewal paid online moves the next renewal date on a year (only once, for the due date it was paid for).
  if (kind === "renewal" && meta.renewal_due && row.renewal_due === meta.renewal_due) {
    row = (await updateRequest(id, { renewal_due: addYear(meta.renewal_due) })) || row;
  }
  row = await applyRules(row, changed); // deposit -> won, renewal defaults, stage
  const paidProject = projectPaid(row);
  if (!row.brief_token && paidProject > 0 && (!row.quote_amount || paidProject >= Math.round(row.quote_amount * 0.7))) {
    row = (await ensureBriefToken(id)) || row;
    await emailBriefLink(row);
  }
  await notifyPayment(row, amount, kind, meta.for, tx.reference).catch((e) => console.error("payment emails failed", e));
  return { row, added: true };
}

async function notifyPayment(row, amount, kind, forWhat, ref) {
  const what = kind === "renewal" ? "renewal" : forWhat === "deposit" ? "deposit" : "balance";
  if (emailConfigured()) {
    await sendEmail(`💳 ${naira(amount)} paid online by ${row.name} (${what}, ${reference(row.id)})`,
      `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5"><p><b>${esc(row.name)}</b> paid <b>${naira(amount)}</b> on Paystack for their ${what} (${esc(row.interest)}, ${reference(row.id)}).</p>
      <p>Paystack reference: ${esc(ref)}. It is recorded in admin and their receipt was emailed${customerEmail(row) ? "" : " (no email on file, so send it on WhatsApp)"}.</p>
      ${row.quote_amount != null ? `<p>Project balance now: ${naira(balance(row))}.</p>` : ""}
      ${what === "balance" && balance(row) === 0 ? "<p><b>Fully paid.</b> Put the site live, mark it Live and send the handover pack.</p>" : ""}
      <p><a href="${SITE}/admin">Open admin</a></p></div>`);
  }
  const to = customerEmail(row);
  if (to && customerEmailConfigured()) {
    const withDoc = (await ensureDocToken(row.id)) || row;
    const doc = buildDoc(withDoc, "receipt", await getSettings());
    if (!doc.error) {
      await sendCustomerEmail(to, doc.subject, `<p style="font-family:Arial,sans-serif">Hello ${esc(String(row.name).split(" ")[0])},</p>
        <p style="font-family:Arial,sans-serif">Thank you for your payment of ${naira(amount)}. Your receipt is below. You can also <a href="${SITE}/doc?t=${withDoc.doc_token}&type=receipt">view, print or save it as a PDF</a>.</p>${doc.html}`);
    }
  }
}

// A "Pay online" button for emails (empty when Paystack isn't set up or nothing is due).
export function payButton(r, want = "") {
  if (!paystackConfigured() || !r.doc_token) return "";
  const due = amountDue(r, want);
  if (!due) return "";
  return `<p style="margin:16px 0"><a href="${payLink(r, due.for)}" style="display:inline-block;background:#D9A21B;color:#13254F;font-family:Arial,sans-serif;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px">Pay ${naira(due.amount)} online</a></p>`;
}
