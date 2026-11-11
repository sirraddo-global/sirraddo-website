// Invoices and receipts. One builder for the web page (/doc?t=...), the customer email and printing.
// Uses inline styles so the same HTML looks right in email apps.
import { esc } from "./store.mjs";

export const COMPANY = {
  name: "SIRRADDO GLOBAL LIMITED",
  rc: "RC 9939920",
  tin: "TIN 2623092457685",
  address: "PLT 106/107 Agbaakin Layout, Iwo Road, Olowotinfiowosanu Area, Ibadan, Oyo State, Nigeria",
  phone: "+234 816 755 0937",
  email: "sirraddogloballimited@gmail.com",
};

export const naira = (n) => (n == null || n === "" ? "-" : "₦" + Number(n).toLocaleString("en-NG"));
const niceDate = (d) => {
  try {
    return new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  } catch {
    return String(d);
  }
};
const payments = (r) => (Array.isArray(r.payments) ? r.payments : []);
const paid = (r, kind) => payments(r).filter((p) => !kind || p.kind === kind).reduce((s, p) => s + Number(p.amount || 0), 0);
const projectPaid = (r) => payments(r).filter((p) => p.kind !== "renewal").reduce((s, p) => s + Number(p.amount || 0), 0);
export const balance = (r) => (r.quote_amount == null ? null : Math.max(0, r.quote_amount - projectPaid(r)));

export const DOC_TYPES = ["invoice", "receipt", "renewal"];

// Returns { title, number, subject, html } or { error } if the document can't be made yet.
export function buildDoc(r, type, settings = {}) {
  const year = new Date().getFullYear();
  const num = String(r.id).padStart(4, "0");
  let title, number;
  const rows = [];
  const totals = [];
  if (type === "invoice") {
    if (r.quote_amount == null) return { error: "Add a quote first" };
    title = "INVOICE";
    number = `SGL-INV-${year}-${num}`;
    rows.push([`${r.interest} — design and setup, first year of domain, hosting, SSL and business email included`, r.quote_amount]);
    totals.push(["Total", r.quote_amount]);
    const pp = projectPaid(r);
    if (!pp) totals.push(["Deposit to start (70%)", Math.round(r.quote_amount * 0.7)]);
    else totals.push(["Paid so far", pp]);
    totals.push(["Balance due", balance(r)]);
  } else if (type === "renewal") {
    if (!r.renewal_amount) return { error: "Add the renewal amount first" };
    title = "INVOICE";
    number = `SGL-REN-${year}-${num}`;
    rows.push([`Yearly renewal — domain, hosting, SSL, business email and backups${r.renewal_due ? ` (due ${niceDate(r.renewal_due)})` : ""}`, r.renewal_amount]);
    totals.push(["Amount due", r.renewal_amount]);
  } else if (type === "receipt") {
    if (!payments(r).length) return { error: "Record a payment first" };
    title = "RECEIPT";
    number = `SGL-RCT-${year}-${num}-${payments(r).length}`;
    for (const p of payments(r)) {
      rows.push([`${niceDate(p.date)} — ${p.kind === "renewal" ? "Renewal payment" : `Payment for ${r.interest}`}${p.note ? ` (${p.note})` : ""}`, p.amount]);
    }
    totals.push(["Total received", paid(r)]);
    if (r.quote_amount != null) totals.push(["Project balance", balance(r)]);
  } else return { error: "Unknown document" };

  const td = "padding:9px 6px;border-bottom:1px solid #E1E6EF;vertical-align:top;";
  const right = "text-align:right;white-space:nowrap;";
  const bank = settings.account_number
    ? `<p style="margin:12px 0"><b>Pay to:</b> ${esc(settings.account_name || COMPANY.name)} · ${esc(settings.bank_name || "")} · <b>${esc(settings.account_number)}</b></p>`
    : `<p style="margin:12px 0"><b>Payment:</b> bank transfer to ${COMPANY.name}. Account details are sent on WhatsApp.</p>`;
  const lastTotal = totals.length - 1;
  const html = `
<div style="font-family:Inter,Arial,Helvetica,sans-serif;color:#1B2433;font-size:15px;line-height:1.5;max-width:720px;margin:0 auto;">
  <table role="presentation" style="width:100%;border-collapse:collapse;border-bottom:3px solid #D9A21B;">
    <tr>
      <td style="padding:0 0 10px;vertical-align:top;">
        <div style="font-weight:900;font-size:28px;letter-spacing:-1px;line-height:1;"><span style="color:#13254F">SI</span><span style="color:#D9A21B">RR</span><span style="color:#13254F">A</span><span style="color:#D9A21B">DD</span><span style="color:#13254F">O</span></div>
        <div style="font-weight:700;font-size:9px;letter-spacing:5px;color:#13254F;margin-top:4px;">GLOBAL LIMITED</div>
      </td>
      <td style="padding:0 0 10px;text-align:right;font-size:12px;line-height:1.45;vertical-align:top;">
        <b>${COMPANY.name}</b><br>${COMPANY.rc} · ${COMPANY.tin}<br>${esc(COMPANY.address)}<br>${COMPANY.phone} · ${COMPANY.email}
      </td>
    </tr>
  </table>
  <h1 style="font-size:28px;color:#13254F;margin:18px 0 10px;letter-spacing:1px;">${title}</h1>
  <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:14px;">
    <tr>
      <td style="vertical-align:top;padding:0;"><b>${type === "receipt" ? "Received from" : "Bill to"}</b><br>${esc(r.name)}${r.business ? `<br>${esc(r.business)}` : ""}<br>${esc(r.contact)}</td>
      <td style="vertical-align:top;padding:0;text-align:right;"><b>No.</b> ${number}<br><b>Date</b> ${niceDate(new Date().toISOString())}</td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;margin:10px 0 16px;">
    <thead><tr><th style="${td}background:#13254F;color:#fff;text-align:left;">Description</th><th style="${td}${right}background:#13254F;color:#fff;">Amount</th></tr></thead>
    <tbody>${rows.map(([d, a]) => `<tr><td style="${td}">${esc(d)}</td><td style="${td}${right}">${naira(a)}</td></tr>`).join("")}</tbody>
    <tfoot>${totals.map(([l, a], i) => {
      const strong = i === lastTotal ? "font-weight:800;color:#13254F;border-bottom:2px solid #13254F;font-size:16px;" : "font-weight:600;";
      return `<tr><th style="${td}text-align:right;${strong}">${esc(l)}</th><td style="${td}${right}${strong}">${naira(a)}</td></tr>`;
    }).join("")}</tfoot>
  </table>
  ${type === "receipt" ? `<p style="margin:12px 0">Thank you for your payment.</p>` : bank + (settings.invoice_note ? `<p style="margin:12px 0">${esc(settings.invoice_note)}</p>` : "")}
  <p style="margin-top:28px;font-size:12px;color:#4A5568;border-top:1px solid #E1E6EF;padding-top:8px;">${COMPANY.name} is a private company limited by shares, registered with the Corporate Affairs Commission of Nigeria (${COMPANY.rc}).</p>
</div>`;
  const subject = `${title === "RECEIPT" ? "Receipt" : "Invoice"} ${number} from ${COMPANY.name}`;
  return { title, number, subject, html };
}

// A full web page around the document, with Print / Save as PDF.
export function docPage(doc, r) {
  return `<!doctype html>
<html lang="en-NG"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">
<title>${doc.number} – ${esc(r.name)}</title>
<style>
  body{margin:0;background:#F5F7FB;}
  .wrap{max-width:760px;margin:0 auto;padding:16px;}
  .sheet{background:#fff;border:1px solid #E1E6EF;border-radius:14px;padding:22px;}
  .bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;font-family:Inter,Arial,sans-serif;}
  .bar button,.bar a{font:inherit;font-weight:700;border-radius:10px;padding:10px 16px;border:1px solid #13254F;background:#13254F;color:#fff;text-decoration:none;cursor:pointer;}
  .bar a{background:#fff;color:#13254F;}
  .note{font-family:Inter,Arial,sans-serif;font-size:13px;color:#4A5568;margin:10px 0 0;}
  @media print{body{background:#fff}.bar,.note{display:none}.wrap{padding:0}.sheet{border:0;padding:0}@page{margin:14mm}}
</style></head>
<body><div class="wrap">
  <div class="bar"><button type="button" onclick="window.print()">Print / Save as PDF</button><a href="https://wa.me/2348167550937">WhatsApp us</a></div>
  <div class="sheet">${doc.html}</div>
  <p class="note">To save a copy, tap "Print / Save as PDF" and choose "Save as PDF".</p>
</div></body></html>`;
}
