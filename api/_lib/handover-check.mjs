// Everything a website job needs before it is finished "once and for all", in order. Used by the admin
// Handover card (✓/✗ list with how-to steps and a ready WhatsApp message for the customer) and the admin
// Assistant ("what's next?"). After every item is done, only change requests are left.
//   item = { key, label, done, auto, fix, steps: [what YOU do], tell: "message for the CUSTOMER" }
import { handoverAuto, balance, naira, COMPANY, GBP_SETUP, GBP_MONTHLY, GBP_NEVER } from "./docs.mjs";
export { GBP_SETUP, GBP_MONTHLY, GBP_NEVER };
import { kindFor, emailAllowance } from "./brief-schema.mjs";
import { googleSearchConfigured } from "./google-search.mjs";
export { emailAllowance };

// The addresses the customer asked for on the project form ("info@, sales@" → ["info", "sales"]).
export function wantedEmails(r) {
  const w = r.brief_wants || {};
  return [...new Set([w.emails, w.emails5].filter(Boolean).join(",").split(/[\s,;]+/)
    .map((s) => s.replace(/@.*$/, "").toLowerCase().replace(/[^a-z0-9._-]/g, "")).filter(Boolean))];
}

// Only if a customer must SEND from their business address (e.g. reply as info@): a real Zoho Mail mailbox, set up by hand.
// Zoho and Cloudflare forwarding can't work together on one domain: email goes to one or the other (the MX records).
export const ZOHO_STEPS = [
  "Only if they need to SEND as info@ (forwarding only receives). Zoho Mail Forever Free: up to 5 mailboxes, 5 GB each, web and the Zoho Mail app only (no Outlook or phone's built-in mail app).",
  "IMPORTANT: Zoho and Cloudflare forwarding can't run together on one domain. Email goes to whichever the MX records point to. Switching to Zoho ends forwarding for ALL their addresses, so create every address they need in Zoho.",
  "1. With the customer: sign up at zoho.com/mail → Forever Free plan (if it isn't offered, the cheapest paid plan) → 'Sign up with a domain I already own' → their domain. Their own account, their phone number.",
  "2. Zoho shows a TXT code to verify the domain. Cloudflare dashboard → their domain → DNS → Add record: Type TXT, Name @, Content = Zoho's code → Save → back in Zoho tap Verify.",
  "3. In Zoho, create the mailboxes (info@, sales@ …) and set each password. Send the logins to the owner privately on WhatsApp.",
  "4. Switch email to Zoho: Cloudflare → their domain → Email → Email Routing → Settings → Disable Email Routing (removes Cloudflare's MX records). Then DNS → add Zoho's 3 MX records exactly as Zoho lists them (mx.zoho.com 10, mx2.zoho.com 20, mx3.zoho.com 50; check Zoho's page, regions differ).",
  "5. Add Zoho's SPF (TXT @ v=spf1 include:zoho.com ~all, replacing any old SPF) and the DKIM TXT record Zoho generates (Zoho → Domains → Email configuration → DKIM). Then tap Verify for MX, SPF and DKIM in Zoho.",
  "6. Test: send to info@ from another address and reply from Zoho. Then in admin's handover details tick 'I set up logins for them' and put the Zoho webmail (mail.zoho.com) in Webmail.",
  "To go back to free forwarding later: delete Zoho's MX records in Cloudflare, re-enable Email Routing, and run Go live → Set up email forwarding again.",
];

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
      ...ZOHO_STEPS,
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
        "This ticks itself when the owner confirms in their Manage link (\"My Google Business Profile is verified\"); you can also tick it in the handover details.",
        "Send them the setup message below (or do it together on their phone), then the \"do it yourself\" guide so they keep it strong themselves. Both buttons are below; the guide is in their handover pack too.",
        "If they get stuck, go through it with them on a call or in person: " + GBP_SETUP.map((t) => t.split(":")[0]).join(", ") + ".",
        "Then tick 'Google profile done' and Save handover details.",
      ],
      tell: `Hello ${first}, let's put your business on Google Maps and Search (free):\n1. Open business.google.com${owner ? ` and sign in with ${owner}` : " with your Gmail"}.\n2. Tap "Add business" and fill in your business name, category, address (or the areas you serve), phone number and website${r.website_url ? ` (${r.website_url})` : ""}.${gbpText ? `\n3. For the description, copy and paste this:\n"${gbpText}"` : "\n3. For the description, write 2–3 sentences about what you do, for whom and where (no links or prices)."}\n4. Google will verify it's you (code by SMS, phone call, email or a short video). Enter the code when it comes.\n5. When Google says your business is verified, open your Manage link and tick \"My Google Business Profile is verified\", so we know it's done.\n6. Then keep it strong with the short guide in your handover pack (Google Business Profile): photos, products, replying to reviews and more.\nSend me a screenshot if you get stuck.`,
      tell2: `Hello ${first}, here's how to keep your Google Business Profile strong yourself (business.google.com or the Google Maps app, signed in as the owner):\n\nFirst, once:\n${GBP_SETUP.map((t, k) => `${k + 1}. ${t}`).join("\n")}\n\nEvery month:\n${GBP_MONTHLY.map((t) => `• ${t}`).join("\n")}\n\n${GBP_NEVER}\nAny questions, just message me.`,
      tell2Label: 'Send "do it yourself" guide',
    });
  }

  // Submitted to Google Search Console: automatic once the domain works (needs the one-time Google setup).
  if (host.domain) {
    const gs = host.google || {};
    add("google", "Submitted to Google (Search Console)", gs.step === "done", {
      auto: true,
      fix: !googleSearchConfigured()
        ? "One-time setup needed: the GOOGLE_SERVICE_ACCOUNT setting (README → Google Search Console). After that every site is submitted by itself."
        : gs.error ? `Trying again automatically (${gs.tries || 1} so far). Last answer from Google: ${gs.error}` : "Happens by itself once the domain is working (Go live → Check now to speed it up).",
      steps: ["Nothing to do: the system verifies their domain with Google, adds it to Search Console, submits the sitemap and adds the owner's Gmail and info@sirraddo.com.ng as owners.",
        "To look at it: search.google.com/search-console, signed in as info@sirraddo.com.ng."],
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
