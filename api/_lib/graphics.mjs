// Quick services: small fixed-price jobs ordered and paid online (flyers, CVs, Google Maps listing, mini
// websites…). Not the AI website designs in design.mjs. This one list drives the order API, the on/off switches
// (Admin → Packages → Side services), the step-by-step guides in admin, renewals for yearly/monthly ones and the
// tests. Prices also appear on design.html / services.html (a test checks they match).
//
//   key        short id (used for the on/off switch)
//   page       "design" (/design) or "services" (/services)
//   design     true = the order form also asks size, colours, style and deadline
//   recurring  { amount, period: "yearly" | "monthly" } added as a renewal once the first payment is in
//   on         shown on the website when the owner hasn't chosen yet
//
// House rule for every design: the customer gets 2–3 options to choose from (3 logo ideas), then 2 rounds of
// changes on the one they pick. The guides below say how many options to make for each.
export const QUICK_SERVICES = [
  // ---------- Flyers & graphics (/design) ----------
  {
    key: "flyer", workdays: 2, extras: ["express", "animated"], interest: "Flyer design", page: "design", design: true, on: true, price: 5000, days: "1–2 working days",
    what: "2 flyer designs to choose from, for WhatsApp, Instagram or print",
    ask: ["Words to put on it", "e.g. Business name, the offer or event, prices, date and venue, phone/WhatsApp, address, Instagram handle"],
    guide: [
      "Read the order on the request card: words, size, colours, deadline, and open the uploaded logo/photos.",
      "Pick the size: square 1080×1080 for posts, 1080×1920 for status, A4/A5 at 300 dpi with 3 mm bleed for print.",
      "Design it (Canva, Adobe Express or Photopea). Use only their logo/photos or free stock photos: never other brands' logos or characters.",
      "Make 2 different designs (different layout and style, same words). A third is a nice bonus when you have time.",
      "Send the options together on WhatsApp as pictures marked Option 1, 2 (3) and ask them to pick one (watermark 'PREVIEW' if they haven't paid).",
      "Make up to 2 rounds of changes on the one they pick. Bigger new ideas after that: quote first.",
      "Send the final PNG (and PDF for print). Mark the request Done in admin and ask them for a review.",
    ],
  },
  {
    key: "social", workdays: 3, extras: ["animated"], interest: "Social media designs", page: "design", design: true, on: true, price: 15000, days: "2–3 working days",
    what: "2 looks to choose from, then 5 matching designs",
    ask: ["What should the 5 designs say?", "e.g. Post 1: our new menu… Post 2: weekend offer… (or tell us the topics and we'll write the words)"],
    guide: [
      "Read the order and files. Agree the 5 topics with them on WhatsApp if they only gave ideas.",
      "Design post 1 in 2 different looks (Option 1 and Option 2) and send both; they pick one.",
      "Make all 5 designs in the chosen look so they match, and write a short caption for each.",
      "Send all 5 as previews; up to 2 rounds of changes.",
      "Send the finals (PNG, right sizes for post/status) and the captions. Mark Done; offer the monthly posts plan.",
    ],
  },
  {
    key: "card", workdays: 2, extras: ["express"], interest: "Business card design", page: "design", design: true, on: true, price: 5000, days: "1–2 working days",
    what: "2 designs to choose from, front and back, print-ready",
    ask: ["What goes on the card?", "e.g. Name, job title, business name, phone/WhatsApp, email, address, website, Instagram"],
    guide: [
      "Size 3.5 × 2 inches (89 × 51 mm) + 3 mm bleed, 300 dpi, keep text 4 mm inside the edge.",
      "Front: logo and name. Back: contacts (add a WhatsApp QR code if they like).",
      "Make 2 different designs (both sides each) and send them as Option 1 and Option 2; they pick one.",
      "Up to 2 rounds of changes on the chosen one.",
      "Send a print-ready PDF (with bleed) and PNG. Tell them any printer can use the PDF. Mark Done.",
    ],
  },
  {
    key: "logo", workdays: 5, extras: [], interest: "Logo design", page: "design", design: true, on: true, price: 20000, days: "3–5 working days",
    what: "3 ideas, then your favourite refined",
    ask: ["Tell us about the business", "e.g. Business name, what you sell, who your customers are, colours you like or hate, logos you like the style of"],
    guide: [
      "Ask 3 questions on WhatsApp if needed: who are the customers, which colours, any style they like.",
      "Make 3 different ideas (no copying any brand). Send them together as Option 1, 2, 3; they pick one.",
      "Refine their favourite; up to 2 rounds of changes.",
      "Deliver: colour, white and black versions as PNG (transparent), PDF and SVG, plus the colour codes. Mark Done.",
      "Offer the business card or brand kit next.",
    ],
  },
  {
    key: "brand", workdays: 7, extras: [], interest: "Brand kit", page: "design", design: true, on: true, price: 45000, days: "5–7 working days",
    what: "Logo, business card, letterhead and 3 social templates",
    ask: ["Tell us about the business", "e.g. Business name, what you sell, customers, colours you like, contacts for the card and letterhead"],
    guide: [
      "Do the logo first: 3 ideas to choose from (see Logo design), then get the chosen one approved.",
      "Then the business card and letterhead (A4, Word/Google Docs so they can type in it, plus PDF).",
      "Then 3 social media templates in their colours (post, status, announcement). Show 2 looks for the first template and let them pick.",
      "Write a one-page guide: colours (codes), fonts, how to use the logo.",
      "Send everything in one folder (Google Drive link or zip). Up to 2 rounds of changes. Mark Done.",
    ],
  },
  {
    key: "invite", workdays: 2, extras: ["express", "animated"], interest: "Invitation design", page: "design", design: true, on: false, price: 5000, days: "1–2 working days",
    what: "2 designs to choose from, WhatsApp e-invite + print-ready card",
    ask: ["Event details", "e.g. Type of event, names, date and time, venue, dress code / colours, RSVP numbers, a Bible verse or quote"],
    guide: [
      "Check every name, date, time and venue twice: mistakes on invitations are the most common complaint.",
      "Make the WhatsApp e-invite (1080×1920 or 1080×1350) and the print card (A5 or 5×7 in, 3 mm bleed) in the same design.",
      "Make 2 different designs and send them as Option 1 and Option 2; they pick one.",
      "Up to 2 rounds of changes on the chosen one.",
      "Send PNG for WhatsApp and PDF for print. Video invites: quote separately on WhatsApp. Mark Done.",
    ],
  },
  // ---------- Bundles and seasonal packs (/design) ----------
  {
    key: "launch", workdays: 7, extras: [], interest: "Launch pack", page: "design", design: true, on: false, price: 30000, worth: 37000, days: "5–7 working days",
    what: "Logo + business card + flyer + Google Maps listing",
    ask: ["Tell us about the business", "e.g. Business name, what you sell, customers, colours you like, address and opening hours, phone/WhatsApp, the first offer for your flyer"],
    guide: [
      "Logo first: 3 ideas to choose from (see Logo design). Get the chosen one approved before anything else.",
      "Business card: 2 options in the new logo's colours (see Business card design).",
      "Flyer: 2 options announcing the business or its first offer (see Flyer design).",
      "Google Maps listing with the new logo and photos (see Google Maps listing).",
      "Deliver everything in one Google Drive folder with mockups, and send the Maps review link. Mark Done.",
    ],
  },
  {
    key: "xmas", workdays: 3, extras: ["express", "animated"], interest: "Christmas & New Year pack", page: "design", design: true, on: false, price: 12000, worth: 15000,
    season: { from: "11-15", to: "01-10", label: "15 Nov – 10 Jan" }, days: "2–3 working days",
    what: "3 festive designs: Christmas sale, season's greetings and Happy New Year",
    ask: ["What should the 3 designs say?", "e.g. Christmas sale: 20% off all cakes till 24 Dec. Greetings: from all of us at Bola's Kitchen. New Year: open again from 3 Jan. Phone/WhatsApp"],
    guide: [
      "Agree the 3 messages: a sale/offer, season's greetings, Happy New Year (or new opening hours).",
      "Make 2 festive looks for the first design (Option 1, Option 2); they pick one and the other 2 follow that look.",
      "Keep it their brand first, festive second: their colours and logo, with tasteful red/gold/green touches. No cartoon characters from films or brands.",
      "Up to 2 rounds of changes. Send WhatsApp sizes (post and status) and print PDF if asked.",
      "Remind them when to post: sale early December, greetings around 20 Dec, New Year on 31 Dec/1 Jan. Mark Done.",
    ],
  },
  {
    key: "sallah", workdays: 3, extras: ["express", "animated"], interest: "Ramadan & Sallah pack", page: "design", design: true, on: false, price: 12000, worth: 15000,
    season: { from: "2027-02-01", to: "2027-03-22", label: "1 Feb – 22 Mar 2027" }, days: "2–3 working days",
    what: "3 designs: Ramadan Kareem, a Ramadan offer and Eid Mubarak",
    ask: ["What should the 3 designs say?", "e.g. Ramadan Kareem from Bola's Kitchen; iftar packs ₦3,500 delivered; Eid Mubarak. Phone/WhatsApp"],
    guide: [
      "Agree the 3 messages: Ramadan greeting, an offer (iftar packs, opening hours), Eid Mubarak.",
      "Make 2 looks for the first design; they pick one and the other 2 follow it. Respectful style: crescent, lanterns, geometric patterns, their colours.",
      "Up to 2 rounds of changes. Send post and status sizes.",
      "Next year: update the dates in api/_lib/graphics.mjs (Ramadan moves about 11 days earlier each year). Mark Done.",
    ],
  },
  {
    key: "easter", workdays: 3, extras: ["express", "animated"], interest: "Easter pack", page: "design", design: true, on: false, price: 8000, worth: 10000,
    season: { from: "2027-03-08", to: "2027-03-29", label: "8 – 29 Mar 2027" }, days: "2–3 working days",
    what: "2 designs: an Easter offer and Happy Easter greetings",
    ask: ["What should the 2 designs say?", "e.g. Easter offer: buy 2 get 1 free till Saturday; Happy Easter from Bola's Kitchen. Phone/WhatsApp"],
    guide: [
      "Agree the 2 messages: the Easter offer and the greeting.",
      "Make 2 looks for the first design; they pick one and the other follows it. Fresh spring colours with their brand.",
      "Up to 2 rounds of changes. Send post and status sizes.",
      "Next year: update the dates in api/_lib/graphics.mjs (Easter moves). Mark Done.",
    ],
  },
  {
    key: "independence", workdays: 3, extras: ["express", "animated"], interest: "Independence Day pack", page: "design", design: true, on: false, price: 8000, worth: 10000,
    season: { from: "09-10", to: "10-02", label: "10 Sep – 2 Oct" }, days: "2–3 working days",
    what: "2 designs: an Independence Day offer and Happy Independence Day greetings",
    ask: ["What should the 2 designs say?", "e.g. 1st October sale: 10% off everything; Happy Independence Day from Bola's Kitchen. Phone/WhatsApp"],
    guide: [
      "Agree the 2 messages: the offer and the greeting.",
      "Make 2 looks for the first design in green and white with their brand; they pick one. Use the national colours tastefully; don't use the coat of arms.",
      "Up to 2 rounds of changes. Send post and status sizes. Mark Done.",
    ],
  },
  // ---------- Quick services (/services) ----------
  {
    key: "maps", workdays: 5, extras: [], interest: "Google Maps listing", page: "services", on: false, price: 7000, days: "2–5 days (Google's own check can take longer)",
    what: "Your business on Google Maps and Search",
    ask: ["Business details for Google", "e.g. Business name, full address (or areas you serve), category, opening hours, phone/WhatsApp, website or Instagram"],
    files: "Photos of the shop, products and logo (optional)",
    guide: [
      "Search Google Maps first: if the business is already listed, ask them to 'Claim this business' instead of making a new one.",
      "On WhatsApp, ask for their Gmail and arrange a short call: they must own the listing (our rule: they set up and look after their profile, we guide them; we don't add ourselves as manager).",
      "On the call, guide them at business.google.com/create: name, category, address (or service area), phone, website, hours.",
      "Verification: Google asks for a video of the shop/sign, a phone code or a postcard. Help them record the video if asked.",
      "Add 5–10 good photos and the logo, a short description and the WhatsApp link.",
      "Send them their review link (Ask for reviews button) to share with customers. Mark Done when it shows on Maps.",
    ],
  },
  {
    key: "whatsapp", workdays: 1, extras: [], interest: "WhatsApp Business setup", page: "services", on: false, price: 5000, days: "Same or next day",
    what: "A professional WhatsApp Business profile",
    ask: ["About the business", "e.g. Business name, what you sell (and prices), opening hours, address, and when a video call suits you"],
    files: "Logo and product photos (optional)",
    guide: [
      "Arrange a 30–45 minute video call (or in person). They need the WhatsApp Business app on the phone (it can move their normal WhatsApp number).",
      "Profile: logo, business name, category, description, address, hours, email, website/Instagram.",
      "Catalogue: add their products/services with photos and prices.",
      "Messaging tools: greeting message, away message (outside hours), 5–10 quick replies for common questions, labels (New, Paid, Delivered).",
      "Make a QR code / short link (wa.me) poster they can print or post.",
      "Send a short summary of what you set up. Mark Done; offer flyers or a mini website.",
    ],
  },
  {
    key: "cv", workdays: 2, extras: ["express"], interest: "CV design", page: "services", on: false, price: 3000, days: "1–2 working days",
    what: "A clean, professional CV, 2 layouts to choose from",
    ask: ["About you", "e.g. The job you want, education, work experience (company, role, dates, what you did), skills, phone and email"],
    files: "Your old CV (optional)",
    guide: [
      "Read their old CV/details. Ask on WhatsApp about anything missing (dates, results, the job they want).",
      "Use a simple one-column layout (2 pages at most): no photos or tables, so company screening software can read it.",
      "Write strong lines with results ('Grew sales by 20%'). AI can help draft; check every fact with them.",
      "Put it in 2 different clean layouts and send both as PDF previews (Option 1, Option 2); they pick one.",
      "Up to 2 rounds of changes on the chosen one.",
      "Send the final as Word (so they can update it) and PDF. Mark Done.",
    ],
  },
  {
    key: "cvcover", workdays: 2, extras: ["express"], interest: "CV + cover letter", page: "services", on: false, price: 5000, days: "1–2 working days",
    what: "CV plus a cover letter for the job",
    ask: ["About you and the job", "e.g. The job and company you're applying to (paste the advert), education, experience, skills, contacts"],
    files: "Your old CV and the job advert (optional)",
    guide: [
      "Do the CV as in 'CV design'.",
      "Write a one-page cover letter for that job: why them, 2–3 matching achievements, a polite close.",
      "Send both in 2 layouts to choose from (matching CV and letter); up to 2 rounds of changes on the chosen one.",
      "Send the finals as Word and PDF, and tip them to change the company name for each new job. Mark Done.",
    ],
  },
  {
    key: "minisite", workdays: 3, extras: [], interest: "Mini website", page: "services", on: false, price: 10000, recurring: { amount: 5000, period: "yearly" }, days: "2–3 working days",
    what: "A one-page website / digital business card",
    ask: ["What should the page show?", "e.g. Business name, what you do, prices, opening hours, address, phone/WhatsApp, Instagram, the web address you'd like (yourname.sirraddo.com.ng)"],
    files: "Logo and photos (optional)",
    guide: [
      "Create it in Admin as a client site like a Starter website, but one page only: logo, about, price list, photos, WhatsApp/call buttons, map, socials.",
      "Address: theirname.sirraddo.com.ng (add the record in Cloudflare), or their own domain if they also buy 'Domain + business email'.",
      "Show them 2 looks for the page (e.g. different colours/layout from the client-site designs) and let them pick; up to 2 rounds of changes.",
      "Publish (Go live). The yearly ₦5,000 renewal is added by itself and reminded by email.",
      "Mark Done. In 2–3 months, offer the full Business website (count what they paid towards it if you like).",
    ],
  },
  {
    key: "domain", workdays: 2, extras: [], interest: "Domain + business email", page: "services", on: false, price: 15000, recurring: { amount: 15000, period: "yearly" }, days: "1–2 working days",
    what: "Your own .com.ng name and email address",
    ask: ["The name you want", "e.g. bolacakes.com.ng (give 2–3 choices), the email names you want (info@, sales@) and the Gmail they should forward to"],
    guide: [
      "Check the name is free (Whogohost) and buy it for 1 year (about ₦7,200), in the customer's name and details.",
      "Add the domain to Cloudflare (free) and change the nameservers at Whogohost.",
      "Turn on Cloudflare Email Routing: info@theirdomain → their Gmail (and any other addresses they asked for). They confirm the email from Cloudflare.",
      "Optional: in their Gmail, set 'Send mail as' so they can reply from info@ (needs a free SMTP service; guide them on a call).",
      "Send them a summary: domain, expiry date, email addresses. The yearly ₦15,000 renewal is added by itself. Mark Done.",
    ],
  },
  {
    key: "qrmenu", workdays: 3, extras: [], interest: "QR menu / price list", page: "services", on: false, price: 10000, recurring: { amount: 5000, period: "yearly" }, days: "2–3 working days",
    what: "Customers scan a QR code to see your menu or prices",
    ask: ["Your menu or price list", "e.g. Business name, categories and items with prices, opening hours, WhatsApp for orders (or upload a photo of your current menu)"],
    files: "Photo of the current menu, logo, food/product photos (optional)",
    guide: [
      "Make a one-page menu site (same as a Mini website) with categories, items, prices and photos, at theirname.sirraddo.com.ng/menu or their own domain.",
      "Give the owner a way to update prices: My store / Manage link, or they send changes on WhatsApp and you update (agree which).",
      "Make 2 QR poster designs (A5/A6) in their colours: 'Scan to see our menu' + logo. They pick one; send the print-ready PDF.",
      "Test the QR code on 2 phones before sending.",
      "The yearly ₦5,000 renewal is added by itself. Mark Done.",
    ],
  },
  {
    key: "posts", workdays: 3, extras: [], interest: "Monthly social media posts", page: "services", on: false, price: 20000, recurring: { amount: 20000, period: "monthly" }, days: "First posts within 3 working days",
    what: "8 designed posts every month, with captions",
    ask: ["About the business and what to post", "e.g. What you sell, offers coming up, your Instagram/Facebook, colours, how often you want to post"],
    files: "Logo and product photos (optional)",
    guide: [
      "Agree a simple plan on WhatsApp: 8 posts a month (2 a week), topics (products, offers, tips, reviews), their colours. First month: show 2 looks and let them pick the style.",
      "Make the month's posts in one go with captions, and send them all for approval at the start of the month.",
      "They post them (or you post if they give access; agree it in writing).",
      "Ask them each month for new photos and offers. Keep a folder per customer.",
      "The monthly ₦20,000 renewal is added by itself and reminded by email; pause the work if it isn't paid. Bigger plan (12 posts) = quote ₦30,000.",
    ],
  },
];

// Paid extras the customer can tick on the order form (only for services that list them in `extras`).
export const EXTRAS = {
  express: { label: "Same-day delivery", price: 2000, note: "Order and pay by 12 noon, get your options the same day" },
  animated: { label: "Animated WhatsApp status version", price: 3000, note: "A 10–15 second moving version for your status" },
};
export const EXTRA_GUIDES = {
  express: "Same-day: paid by 12 noon → send the options by 6 pm and the final the same evening. Paid later → by 12 noon the next working day. Start it before anything else.",
  animated: "Animated status: in Canva use Animate (or Adobe Express), 1080×1920, 10–15 seconds, text appears in order, logo last. Export MP4 and send on WhatsApp. Check it plays on a phone.",
};
// Checked before ANY design is sent (shown under every design guide in admin).
export const QUALITY_CHECKS = [
  "Spelling and grammar checked twice; names, dates and prices exactly as the customer wrote them.",
  "Phone/WhatsApp number dialled or tapped once to be sure it's right.",
  "Readable on a phone: look at it at 30% size. Main message readable in 3 seconds.",
  "Their logo is sharp (not blurry or stretched) and their colours are used.",
  "Print files: CMYK-safe colours, 300 dpi, 3 mm bleed, text 4 mm from the edge.",
  "Each option shown on a mockup (Admin → Packages → Side services → Mockup maker) and labelled Option 1, 2, 3.",
  "Nothing copied: no other brands' logos, characters or paid photos without a licence.",
];
export const ON_TIME_PROMISE = "If we deliver after the promised date, you get 20% off your next order.";

/** Is a seasonal pack in its selling window today? (MM-DD windows repeat every year and may cross New Year.) */
export function inSeason(svc, today = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10)) {
  if (!svc.season) return true;
  const { from, to } = svc.season;
  if (from.length === 10) return today >= from && today <= to;
  const md = today.slice(5);
  return from <= to ? md >= from && md <= to : md >= from || md <= to;
}

/** The order's total and the extras chosen (unknown or not-offered extras are ignored). */
export function orderTotal(svc, extras = []) {
  const chosen = (Array.isArray(extras) ? extras : []).filter((x, i, a) => a.indexOf(x) === i && (svc.extras || []).includes(x) && EXTRAS[x]);
  return { chosen, total: svc.price + chosen.reduce((n, x) => n + EXTRAS[x].price, 0) };
}

/** Working days after a date (Mon–Fri). */
export function addWorkdays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  let left = n;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
}

export const QUICK_KEYS = QUICK_SERVICES.map((s) => s.key);
export const QUICK_NAMES = QUICK_SERVICES.map((s) => s.interest);
export const quickByInterest = (interest) => QUICK_SERVICES.find((s) => s.interest === interest) || null;
export const isQuick = (interest) => !!quickByInterest(interest);
export const quickPrice = (interest) => quickByInterest(interest)?.price ?? null;

// Kept for existing imports (the design page).
export const DESIGN_SERVICES = QUICK_SERVICES.filter((s) => s.page === "design");
export const DESIGN_NAMES = QUICK_NAMES; // every quick service is a valid package name
export const isDesign = isQuick;
export const designPrice = quickPrice;

/** Which services the website shows: the owner's choice (setting svc_visible, keys separated by commas) or the defaults. */
export function visibleKeys(settings = {}, today) {
  const raw = settings.svc_visible;
  let keys;
  if (raw == null || raw === "") keys = QUICK_SERVICES.filter((s) => s.on).map((s) => s.key);
  else if (raw === "none") keys = [];
  else { const want = new Set(String(raw).split(",").map((k) => k.trim())); keys = QUICK_KEYS.filter((k) => want.has(k)); }
  // Seasonal packs only show in their window, even when switched on.
  return keys.filter((k) => inSeason(QUICK_SERVICES.find((s) => s.key === k), today));
}

export const DESIGN_SIZES = [
  "WhatsApp / Instagram post (square)", "WhatsApp / Instagram status (tall)", "Facebook post", "A4 print", "A5 print (handbill)",
  "Banner / roll-up", "Business card", "Not sure: please advise",
];

const str = (v, n) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const naira = (n) => "₦" + Number(n).toLocaleString("en-NG");

/** Checks an order from the form and writes it up as the request's details (what we need to do the job). */
export function cleanOrder(body = {}, allowed = QUICK_KEYS) {
  const svc = quickByInterest(body.service);
  if (!svc) throw Object.assign(new Error("Please choose a service."), { status: 400 });
  if (!allowed.includes(svc.key)) throw Object.assign(new Error("That service isn't available right now. Please message us on WhatsApp."), { status: 400 });
  const words = str(body.words, 1500);
  if (words.length < 5) throw Object.assign(new Error(`Please fill in "${svc.ask[0]}".`), { status: 400 });
  const size = svc.design ? (DESIGN_SIZES.includes(body.size) ? body.size : "Not sure: please advise") : "";
  const colours = svc.design ? str(body.colours, 200) : "";
  const style = svc.design ? str(body.style, 300) : "";
  const deadline = ISO.test(String(body.deadline || "")) ? body.deadline : "";
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 4)
    .map((f) => ({ url: str(f?.url, 400), name: str(f?.name, 60) || "file" }))
    .filter((f) => /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(f.url));
  const { chosen, total } = orderTotal(svc, body.extras);
  const lines = [
    `ORDER: ${svc.interest} (${naira(svc.price)}${svc.recurring ? `, then ${naira(svc.recurring.amount)} ${svc.recurring.period === "monthly" ? "a month" : "a year"}` : ""})`,
    chosen.length ? `Extras: ${chosen.map((x) => `${EXTRAS[x].label} (+${naira(EXTRAS[x].price)})`).join(", ")} · Total ${naira(total)}` : null,
    size && `Size / where it's used: ${size}`,
    deadline && `Needed by: ${deadline}`,
    colours && `Colours: ${colours}`,
    style && `Style / ideas: ${style}`,
    "", `${svc.ask[0]}:`, words,
    files.length ? "" : null,
    files.length ? `Files (${files.length}):` : null,
    ...files.map((f) => `• ${f.name}: ${f.url}`),
  ].filter((x) => x !== null && x !== false);
  return { svc, extras: chosen, total, service: svc.interest, size, deadline, details: lines.join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 3800), files };
}
export const cleanDesignOrder = (body) => cleanOrder(body);
