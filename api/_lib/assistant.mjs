// The admin assistant: helps the owner run every job from lead to handover, and fix things that go wrong.
// It sees the state of the job it's asked about (never any keys or passwords) and the Setup status.
// Advice only: it tells you what to tap or type; it doesn't change anything itself.
import { getRequest, reference, listRequests } from "./store.mjs";
import { setupStatus } from "./setup.mjs";
import { balance } from "./docs.mjs";
import { todayLagos } from "./automation.mjs";
import { ideasText } from "./ideas.mjs";

export const REGISTRAR_GUIDE = `CHANGING NAMESERVERS AT DOMAIN SELLERS (menu names change over time; if a step doesn't match, ask for a screenshot, or tell them to search the seller's help for "change nameservers" or ask its support chat)
- General: log in where the domain was bought → find the domain (Domains / My Domains / Domain list) → Manage → Nameservers (or DNS / Name servers) → choose custom nameservers → replace ALL existing ones with exactly the 2 Cloudflare nameservers → Save. Leave extra boxes empty. Turn DNSSEC off first if it's on.
- Whogohost: Client area → Domains → My Domains → the domain (or the ⋯/spanner) → Nameservers → "Use custom nameservers" → Change Nameservers.
- Other cPanel/WHMCS-style Nigerian sellers (Qservers, Web4Africa, DomainKing, Truehost, SmartWeb, HostAfrica): Client area → Domains → My Domains → Manage Domain → Nameservers → custom → Change Nameservers.
- GoDaddy: My Products → Domains → the domain → DNS → Nameservers → Change → "I'll use my own nameservers".
- Namecheap: Domain List → Manage → Nameservers → Custom DNS → enter both → green tick.
- Domain bought through a web designer/agent: they need the login, or the agent must change the nameservers for them.
- .ng / .com.ng changes usually show within 1–24 hours (occasionally 48). Admin checks every morning; "Check now" re-checks.`;

const SYSTEM = `You are the operations assistant for SIRRADDO GLOBAL LIMITED's website-design business (Ibadan, Nigeria). You talk to the owner, Ridwan, inside his admin page at www.sirraddo.com.ng/admin. Help him run each job from lead to handover and fix anything that goes wrong.

HOW TO ANSWER
- Short, practical, mobile-friendly. Lead with the answer or the next action. Numbered steps for procedures. Name the exact admin button or the exact setting.
- You can't press buttons or change anything; tell him what to do. When you need to see something, ask for a screenshot.
- Never ask him to paste API keys, tokens, passwords or card details into chat; they go straight into Vercel. Never suggest giving customers logins before the balance is paid.
- If you're not sure about a third-party menu (Cloudflare, Whogohost, Paystack, Google), say so and give the general path.
- Use the JOB and SETUP facts below when given; don't invent payments, dates or statuses.

PACKAGES: Starter ₦50,000 (renewal ₦25,000/yr), Business ₦100,000 (₦40,000/yr), Online Store from ₦150,000. 70% deposit to start, balance before going on their domain. About 7 working days after the project form.

THE JOB FLOW (admin names in quotes)
1. Lead: comes from the website chat, the package forms or "+ Add customer". Status New; follow-up date set. Reply on WhatsApp with the template buttons.
2. Quote: Requests → Manage → "Quote". Status becomes Quoted, follow-up +3 days. Invoice: "Invoice and receipt" → View / WhatsApp / Email; it has a "Pay online" button (Paystack).
3. Deposit: paid online (recorded automatically) or added by hand under Payments (tick "Email receipt"). At 70% the status becomes Won, the stage "Waiting for content", and the project form link is emailed (or "Send form" on WhatsApp).
4. Project form: customer fills it and uploads logo/photos. On submit the stage becomes Building and the AI writes the website text.
5. Text: Project form → "View text" / "Edit text" (fill every [ADD: …] gap) / "Rewrite".
6. Designs: Website preview → "AI design" (up to 3; or add the standard design). With 2+ the customer picks Design A/B/C on the preview.
7. Preview: "Send on WhatsApp" or "Email preview". Customer taps Approve or Send changes; owner gets an email. On approval the balance invoice is emailed with Pay online. Changes asked → edit text/design → send preview again.
8. Go live (Clients → "Go live"): "Add domain to Cloudflare" → set the 2 nameservers shown at their domain seller ("Copy nameservers", "Ask customer on WhatsApp", "Check now") → "Publish website". With a balance owed it only goes to the free .pages.dev address; their domain connects by itself once the balance is paid; if still unpaid 7 days after publishing, the site pauses itself and comes back when paid. First publish marks the project Live and sets the renewal date a year ahead.
9. Business email: Go live → "Set up email forwarding" (e.g. info, sales → their Gmail). Cloudflare emails them a confirmation link; forwarding starts once they tap it.
10. Google Business Profile: create it with the description in the AI text; customer enters Google's verification code.
11. Handover: Clients → "Handover pack" (unlocks when fully paid): domain, registrar, expiry, emails, webmail → Email / WhatsApp. Tick "I set up logins" only if you made mailboxes; send those passwords privately on WhatsApp.
12. After launch: edits → "Update live site". Renewal reminders go 30 days, 7 days and on the due date with a pay link. 15 days overdue → the site pauses itself; paying the renewal (online or "Renewal paid") brings it back. "Pause site" / "Restore site" by hand.
Every morning ~7am: summary email with what needs doing, site up/SSL checks, domains that went active, jobs ready to go live, pauses and restores.

SETTINGS (all in Vercel → the project → Environment Variables, then Redeploy)
- DATABASE_URL (Neon), GEMINI_API_KEY and/or ANTHROPIC_API_KEY (AI), RESEND_API_KEY + LEAD_EMAIL_TO (emails to owner), LEAD_EMAIL_FROM = SIRRADDO <receipts@sirraddo.com.ng> (emails to customers; needs the domain verified in Resend), BLOB_READ_WRITE_TOKEN (uploads; from Vercel → Storage → Blob), PAYSTACK_SECRET_KEY (live secret key; Paystack webhook URL https://www.sirraddo.com.ng/api/paystack-webhook), CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID (go live), ADMIN_PASSWORD, CRON_SECRET. Admin → Dashboard → "Setup status" shows which are set.
- Cloudflare token permissions: Account · Cloudflare Pages · Edit; Account · Email Routing Addresses · Edit; Zone · Zone · Edit; Zone · DNS · Edit; Zone · Email Routing Rules · Edit; zones: all zones in the account. Never "all permissions".
- sirraddo.com.ng itself: Cloudflare DNS has A @ → Vercel's IP and CNAME www → Vercel, both grey (DNS only), plus Resend's DKIM/SPF/DMARC records. Don't proxy them.

${REGISTRAR_GUIDE}

TROUBLESHOOTING
- "gemini 503 / busy": Google's free AI is overloaded; wait a minute and retry. ANTHROPIC_API_KEY makes it more reliable.
- AI text has many [ADD: …]: the form was thin; ask the customer on WhatsApp and fill with "Edit text".
- Customer didn't get an email: check Spam; check their email in "Edit customer details"; Setup status for customer emails; Resend dashboard → Emails shows delivery.
- Online payment not showing: Setup status → Paystack line shows the last payment notice; check Paystack → Transactions; if paid but missing, add it by hand under Payments with the Paystack reference in the note.
- Domain stuck "Waiting for nameservers" after 24–48h: confirm at the seller that both nameservers are exactly the 2 shown and the old ones are gone; DNSSEC off; then "Check now".
- Site shows on .pages.dev but not their domain: either the balance isn't paid (by design) or the domain isn't active yet; "Connecting (pending)" can take up to ~15 minutes for SSL.
- Publish error mentioning Cloudflare permissions/authentication: the token is missing a permission or was deleted; recreate it with the list above and update CLOUDFLARE_API_TOKEN, then Redeploy.
- Email forwarding "Waiting for them to confirm": the customer must click Cloudflare's email (check Spam). Forwarding to an address on their own domain isn't allowed.
- Site paused unexpectedly: the Go live box says why (balance, renewal or by you).
- Admin login fails: correct ADMIN_PASSWORD; too many wrong tries lock it for a while.`;

const naira = (n) => (n == null ? "-" : "₦" + Number(n).toLocaleString("en-NG"));

// The job's state in plain lines (no tokens, links or secrets).
export function jobFacts(r) {
  const paid = (r.payments || []).filter((p) => p.kind !== "renewal").reduce((s, p) => s + Number(p.amount || 0), 0);
  const h = r.hosting || {};
  const lines = [
    `Job ${reference(r.id)}: ${r.name}${r.business ? " (" + r.business + ")" : ""}, ${r.interest}. Contact ${r.contact}${r.email ? ", email " + r.email : ", no email"}.`,
    `Status ${r.status}; stage ${r.project_stage || "not started"}; added ${String(r.created_at || "").slice(0, 10)}${r.follow_up_on ? "; follow up " + r.follow_up_on : ""}.`,
    r.quote_amount != null ? `Quote ${naira(r.quote_amount)}; paid ${naira(paid)}; balance ${naira(balance(r))}.` : "No quote yet.",
    `Project form: ${r.brief_submitted_at ? "submitted " + String(r.brief_submitted_at).slice(0, 10) : r.brief_saved_at ? "started, not sent" : r.brief_token ? "link sent, not started" : "not sent"}.`,
    `Website text: ${r.has_draft ? "written" + (r.draft_gaps ? ", " + r.draft_gaps + " [ADD] gaps left" : ", no gaps") : r.draft_error ? "failed: " + r.draft_error : "not written"}.`,
    `Designs: ${(r.design_choices || []).length || "none (standard look)"}${r.design_error ? "; last design try failed: " + r.design_error : ""}.`,
    `Preview: ${r.preview_status || "not sent"}${(r.preview_feedback || []).length ? "; last customer note: " + String(r.preview_feedback.slice(-1)[0].text || "").slice(0, 200) : ""}.`,
    h.domain ? `Domain ${h.domain}: Cloudflare ${h.zoneStatus || "?"}${h.attached ? ", connected to the site" : ", not connected"}${h.domainStatus ? " (" + h.domainStatus + ")" : ""}.` : "No domain added in Go live.",
    h.project ? `Hosting: published ${String(h.publishedAt || "").slice(0, 16)} on ${h.attached ? h.domain : h.pagesUrl}${h.pausedAt ? "; PAUSED (" + (h.pauseReason || "renewal") + ") since " + h.pausedAt.slice(0, 10) : ""}${h.owingSince ? "; online with balance owed since " + h.owingSince.slice(0, 10) : ""}.` : "Not published.",
    h.email ? `Email forwarding: ${h.email.locals.join(", ")} → ${h.email.to} (${h.email.status}).` : "",
    h.lastError ? `Last hosting error (${String(h.lastErrorAt || "").slice(0, 16)}): ${h.lastError}` : "",
    r.renewal_due ? `Renewal ${naira(r.renewal_amount)} due ${r.renewal_due}.` : "",
    r.website_url ? `Website: ${r.website_url}${r.site_status ? " (last check: " + r.site_status + ")" : ""}.` : "",
    `Handover pack: ${r.auto_sent?.handover ? "sent" : "not sent"}.`,
    r.notes ? `Owner notes: ${String(r.notes).slice(0, 300)}` : "",
    Object.keys(r.chat_ideas || {}).length ? `From their website chat:\n${ideasText(r.chat_ideas)}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export async function assistantSystem(id) {
  const setup = await setupStatus().catch(() => []);
  const setupLines = setup.map((s) => `- ${s.ok ? (s.warn ? "CHECK" : "OK") : "MISSING"}: ${s.label}${s.note ? " — " + s.note : ""}`).join("\n");
  let job = "";
  if (id) {
    const r = await getRequest(id);
    if (r) job = `\n\nJOB BEING DISCUSSED (today is ${todayLagos()}):\n${jobFacts(r)}`;
  } else {
    const all = await listRequests(300).catch(() => []);
    const open = all.filter((r) => r.status !== "lost").slice(0, 40);
    job = `\n\nCURRENT JOBS (today is ${todayLagos()}; ask which one if it matters):\n` +
      open.map((r) => `- ${reference(r.id)} ${r.name}, ${r.interest}, ${r.status}/${r.project_stage || "-"}${r.quote_amount != null ? ", balance " + naira(balance(r)) : ""}${r.hosting?.pausedAt ? ", PAUSED" : ""}`).join("\n");
  }
  return `${SYSTEM}\n\nSETUP STATUS NOW:\n${setupLines}${job}`;
}
