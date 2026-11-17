// Everything a website job needs before it is finished "once and for all", in order. Used by the admin
// Handover card (✓/✗ list with how-to steps and a ready WhatsApp message for the customer) and the admin
// Assistant ("what's next?"). After every item is done, only change requests are left.
//   item = { key, label, done, auto, fix, steps: [what YOU do], tell: "message for the CUSTOMER" }
import { handoverAuto, balance, naira, COMPANY } from "./docs.mjs";
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
  if (kind === "project" || r.status !== "won") return [];
  const h = handoverAuto(r, settings);
  const host = r.hosting || {};
  const mail = host.email || {};
  const w = r.brief_wants || {};
  const first = String(r.name || "").split(" ")[0] || "there";
  const domain = host.domain || h.domain || "";
  const items = [];
  const add = (key, label, done, more) => items.push({ key, label, done: Boolean(done), auto: false, fix: "", steps: [], tell: "", ...more, ...(done ? { fix: "", steps: [], tell: "" } : {}) });

  const bal = balance(r);
  add("paid", "Balance paid in full", r.quote_amount != null && bal === 0, {
    fix: r.quote_amount == null ? "Add the quote first (Requests → this customer → Quote), then record the payments." : `${naira(bal)} still owed. Nothing is handed over before it's paid.`,
    steps: ["Requests → this customer → Invoice and receipt → WhatsApp or Email: it has a Pay online button.", "Paid another way? Add it under Payments (tick Email receipt)."],
  });

  const ns = host.nameservers || [];
  add("live", "Website live on their own domain", host.attached && r.website_url, {
    fix: !host.zoneId ? "Add their domain in Go live." : host.zoneStatus !== "active" ? "Waiting for the nameservers to be changed at their domain seller." : !host.project ? "Domain is ready: publish the website." : "Connecting: tap Check now (up to ~15 minutes for the padlock).",
    steps: [
      "Clients → this customer → Go live → type their domain (e.g. theirbusiness.com.ng) → Add domain to Cloudflare.",
      "Change the domain's nameservers to the 2 shown: either tap 'Send steps on WhatsApp' below for the customer, or log in to the domain seller yourself (Whogohost: My domains → Manage → Nameservers → use custom nameservers).",
      "Tap Publish website: it's on the free .pages.dev address at once.",
      "Their domain connects by itself once the nameservers work (minutes to 24 hours); tap Check now to see.",
    ],
    tell: domain && ns.length ? `Hello ${first}, to connect your website to ${domain}, please:\n1. Log in where you bought the domain (e.g. Whogohost → My domains → ${domain} → Manage).\n2. Open Nameservers and choose "custom nameservers".\n3. Delete the old ones and put exactly these two:\n${ns.join("\n")}\n4. Save.\nIt can take a few hours to work. If it's easier, send me a screenshot of that page and I'll guide you.` : "",
  });

  add("domain", "Domain details (registrar and expiry date)", h.domain && h.registrar && h.domain_expires, {
    auto: true,
    fix: !h.domain ? "Fills in by itself after Go live." : "Fills in by itself from Settings → Handover (your usual registrar) and the go-live date.",
    steps: ["Once: Admin → Settings → Handover → 'Domains I buy for customers are registered with' (e.g. Whogohost) → Save. Every job fills it in from then on.", "Their own domain? In the handover pack choose 'Their own domain' and type the seller and expiry date."],
  });

  const allow = emailAllowance(r.interest);
  const have = mail.locals || [];
  const want = wantedEmails(r);
  const missing = want.filter((x) => !have.includes(x));
  const room = Math.max(0, allow - have.length);
  const names = (have.length ? have.concat(missing.slice(0, room)) : (want.length ? want : ["info"]).slice(0, allow));
  const addrs = names.map((x) => `${x}@${domain || "theirdomain"}`).join(", ");
  add("email", `Business email: ${have.length} of ${allow} set up${want.length ? `; they asked for ${want.map((x) => x + "@").join(", ")}` : ""}`,
    have.length && (!missing.length || !room) && mail.status === "active", {
    fix: !domain || host.zoneStatus !== "active" ? "Needs their domain active first (Go live)." : !have.length ? "Set up forwarding to their Gmail." : mail.status !== "active" ? "Waiting for them to tap Cloudflare's confirmation email." : `Add ${missing.slice(0, room).map((x) => x + "@").join(", ")}.`,
    steps: [
      "Go live → Set up email forwarding: the names are filled in from their form; type their Gmail in 'Forward to' → tap the button.",
      "Cloudflare emails their Gmail once. Send them the message below so they tap Verify.",
      "The badge turns Working by itself (or tap Check now). Adding more names later doesn't need a new confirmation.",
    ],
    // Only once the addresses exist on their real domain.
    tell: !domain || !have.length ? "" : `Hello ${first}, your business email${names.length > 1 ? "s are" : " is"} ready: ${addrs}. Cloudflare (our email service) has sent an email to ${[...new Set([mail.to, ...Object.values(mail.routes || {})].filter(Boolean))].join(" and ") || "your Gmail"} to confirm it. Please open it (check Spam or Promotions if you don't see it) and tap "Verify email address". After that, every email sent to your business address${names.length > 1 ? "es" : ""} arrives in your Gmail.`,
  });

  if (kind === "store") {
    const help = w.paystack === "Please help me set one up";
    add("paystack", "Online payments (their own Paystack)", (r.shop?.online && r.shop?.keyMode !== "test") || h.whatsapp_only, {
      fix: r.shop?.keyMode === "test" ? "Their key is a TEST key (no real money): they need to connect the Live key." : help ? "They asked for help opening a Paystack account." : "Send them the Connect Paystack link.",
      steps: help ? [
        "Call them or sit together (it needs their own details, not yours).",
        "Send them the message below: they create the account and activate it (BVN, ID, bank account; CAC papers if registered). Approval usually takes a few days.",
        "When approved: store card above → Send 'Connect Paystack' link. They paste their Live Secret Key; Pay online turns on and you get an email.",
        "Ask them to place a small test order and check it in Paystack → Transactions.",
        "If they don't want Paystack: tick 'WhatsApp orders only' in the handover pack.",
      ] : [
        "Store card above → Send 'Connect Paystack' link (or Copy link). The page shows them where to find the Live key.",
        "Pay online turns on by itself and you get an email.",
        "Ask them to place a small test order and check it in Paystack → Transactions.",
      ],
      tell: help ? `Hello ${first}, let's open your Paystack account so your store can take card and transfer payments straight into your bank:\n1. Go to paystack.com and tap "Create free account". Use your own email and business name, country Nigeria.\n2. Confirm your email.\n3. In the dashboard tap "Activate your business" (or Compliance) and fill in: business type (if it isn't registered with CAC, pick the option for unregistered/starter businesses), your BVN, a valid ID, your bank account for payouts and your business address. If you're registered, add your CAC documents.\n4. Submit. Paystack usually approves in a few days.\nTell me when it's approved and I'll send you a private link to connect it to your website. Never send your Paystack password to anyone.` : "",
    });
  }

  if (kind !== "starter") {
    const owner = h.gbp_owner || w.gbp_gmail || "";
    // The description from their website text, ready to paste (no "I'll send you" second message).
    const gbpText = String(r.gbp_text || "").replace(/\*\*[^*]+:\*\*\s*/g, "").replace(/\[ADD:[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 750);
    add("gbp", "Google Business Profile", h.gbp_done, {
      fix: `Owner: ${owner || "their Gmail"}. Google needs the owner to verify it.`,
      steps: [
        "Send them the message below (or do it together on their phone).",
        gbpText ? "The description from their website text is already in the message." : "Their website text has no Google Business Profile description yet: write one (Project form → Edit text) or send it separately.",
        `Their step 5 invites ${COMPANY.email} as Manager. The invitation arrives in your Gmail (forwarded): open it and accept while signed in to the Google account for ${COMPANY.email}. Then you can fix photos, hours and replies for them.`,
        "Then tick 'Google profile done' and Save handover details.",
      ],
      tell: `Hello ${first}, let's put your business on Google Maps and Search (free):\n1. Open business.google.com${owner ? ` and sign in with ${owner}` : " with your Gmail"}.\n2. Tap "Add business" and fill in your business name, category, address (or the areas you serve), phone number and website${r.website_url ? ` (${r.website_url})` : ""}.${gbpText ? `\n3. For the description, copy and paste this:\n"${gbpText}"` : "\n3. For the description, write 2–3 sentences about what you do, for whom and where (no links or prices)."}\n4. Google will verify it's you (code by SMS, phone call, email or a short video). Enter the code when it comes.\n5. Once it's verified, add us as a Manager so we can help keep it up to date: on your Business Profile tap ⋮ (More) → Business Profile settings → People and access → Add → type ${COMPANY.email} → under Access choose Manager → Invite. You stay the owner; you can remove us any time.\nSend me a screenshot if you get stuck.`,
    });
  }

  add("report", "Monthly visitor report switched on", host.statsKey && !host.reportsOff, {
    auto: true,
    fix: host.reportsOff ? "You switched it off for this customer." : "Switches on by itself when the website is published.",
    steps: host.reportsOff ? ["After launch → tick 'Email them a visitor report on the 1st of every month'."] : ["Nothing to do: it starts when you Publish (older sites: tap Update live site once)."],
  });

  add("pack", "Handover pack sent", r.auto_sent?.handover, {
    fix: "Last step, once everything above is ✓.",
    steps: ["Check the boxes below and tap Save handover details.", "Tap View to read it as they will.", "Tap Email and/or WhatsApp. Only change requests remain after this."],
  });
  return items;
}

export const checklistText = (items) => items.map((i) => `${i.done ? "✓" : "✗"} ${i.label}${i.done ? "" : `${i.auto ? " (automatic)" : ""} → ${i.fix}${i.steps.length ? " Steps: " + i.steps.join(" / ") : ""}`}`).join("\n");
