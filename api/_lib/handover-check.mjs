// Everything a website job needs before it is finished "once and for all", in order. Used by the admin
// Handover card (✓/✗ list), the admin Assistant ("what's next?") and the morning email. After every item is
// done, only change requests are left (free fixes for 30 days, then quoted).
import { handoverAuto, balance, naira } from "./docs.mjs";
import { kindFor, emailAllowance } from "./brief-schema.mjs";
export { emailAllowance };

// The addresses the customer asked for on the project form ("info@, sales@" → ["info", "sales"]).
export function wantedEmails(r) {
  const w = r.brief_wants || {};
  return [...new Set([w.emails, w.emails5].filter(Boolean).join(",").split(/[\s,;]+/)
    .map((s) => s.replace(/@.*$/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "")).filter(Boolean))];
}

export function handoverChecklist(r, settings = {}) {
  const kind = kindFor(r.interest);
  if (kind === "project" || !["won"].includes(r.status)) return [];
  const h = handoverAuto(r, settings);
  const host = r.hosting || {};
  const mail = host.email || {};
  const w = r.brief_wants || {};
  const items = [];
  const add = (key, label, done, fix) => items.push({ key, label, done: Boolean(done), fix: done ? "" : fix });

  const bal = balance(r);
  add("paid", "Balance paid in full", r.quote_amount != null && bal === 0,
    `${naira(bal)} still owed: send the balance invoice (Invoice and receipt → WhatsApp / Email). Nothing is handed over before it's paid.`);
  add("live", "Website live on their own domain", host.attached && r.website_url,
    host.project ? "Go live: their domain connects by itself once the balance is paid and the nameservers are set (Check now)."
      : "Clients → Go live: Add domain to Cloudflare → set the 2 nameservers at their domain seller → Publish website.");
  add("domain", "Domain details (registrar and expiry date)", h.domain && h.registrar && h.domain_expires,
    "Handover pack: fill Registered with and Registered until (or set your usual registrar in Settings once).");

  const allow = emailAllowance(r.interest);
  const have = mail.locals || [];
  const want = wantedEmails(r);
  const missing = want.filter((x) => !have.includes(x));
  const room = Math.max(0, allow - have.length);
  const asked = want.length ? `; they asked for ${want.map((x) => x + "@").join(", ")}` : "";
  add("email", `Business email: ${have.length} of ${allow} set up${asked}`,
    have.length && (!missing.length || !room) && mail.status === "active",
    !have.length ? `Go live → Set up email forwarding: ${(want.length ? want : ["info"]).slice(0, allow).map((x) => x + "@").join(", ")} → their own Gmail. Cloudflare emails them a link to confirm (check Spam).`
      : mail.status !== "active" ? "Waiting for them to tap Cloudflare's confirmation email (check Spam), then Check in Go live."
      : `Go live → Set up email forwarding: add ${missing.slice(0, room).map((x) => x + "@").join(", ")} (keep the ones already there).`);

  if (kind === "store") {
    const help = w.paystack === "Please help me set one up";
    add("paystack", "Online payments (their own Paystack)",
      (r.shop?.online && r.shop?.keyMode !== "test") || h.whatsapp_only,
      r.shop?.keyMode === "test" ? "Their key is a TEST key (no real money): replace it with their Live Secret Key in Online Store."
        : help ? "They asked for help: open a Paystack account WITH them in their name (their email, BVN, ID, payout bank account; CAC papers if registered). When Paystack approves it: Clients → Online store payments → Send 'Connect Paystack' link; they paste their own Live Secret Key there (the page shows where to find it). Test with a small order."
        : "Clients → Online store payments → Send \"Connect Paystack\" link: they paste their own Live Secret Key (the page shows where to find it), and Pay online turns on by itself. Test with a small order. Or tick 'WhatsApp orders only' in the handover pack.");
  }
  if (kind !== "starter") {
    add("gbp", "Google Business Profile", h.gbp_done,
      `Create it at business.google.com with the description in their website text, owner ${h.gbp_owner || w.gbp_gmail || "their Gmail"}, you as manager; they enter Google's code. Then tick 'Google profile done' in the handover pack.`);
  }
  add("report", "Monthly visitor report switched on", host.statsKey && !host.reportsOff,
    "After launch: tick 'Email them a visitor report' (sites published before reports existed need one Update live site).");
  add("pack", "Handover pack sent", r.auto_sent?.handover, "Handover pack: Save the details, then Email and/or WhatsApp it.");
  return items;
}

export const checklistText = (items) => items.map((i) => `${i.done ? "✓" : "✗"} ${i.label}${i.done ? "" : " → " + i.fix}`).join("\n");
