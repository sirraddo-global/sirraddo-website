// What we ask each customer for after their deposit, by package.
// The form at /brief and the admin view are both built from this list.
// To add or change a question, edit it here. Keys must stay unique.
//
// Field types: text, email, tel, textarea, select, multi (checkboxes), files, rows (a small table),
// confirm (a required tick box). "only" limits a section or field to some kinds of brief.

const PAGES_STARTER = ["Home", "About us", "Services", "Prices", "Gallery", "Testimonials", "FAQ", "Contact"];
const PAGES_BUSINESS = PAGES_STARTER.concat(["Blog / News", "Our team", "Booking / Appointments", "Location and map", "Careers"]);

export const KINDS = {
  "Starter website": "starter",
  "Business website": "business",
  "Online Store": "store",
};
export const kindFor = (interest) => KINDS[interest] || "project";

export const KIND_LABEL = {
  starter: "Starter website",
  business: "Business website",
  store: "Online Store",
  project: "Custom project",
};

export const SECTIONS = [
  {
    title: "About your business",
    fields: [
      { key: "business_name", label: "Business name (as it should appear on the website)", type: "text", required: true },
      { key: "tagline", label: "Slogan or tagline", type: "text", hint: "One short line, e.g. \"Fresh bread every morning in Ibadan\"" },
      { key: "description", label: "What do you do, and who are your customers?", type: "textarea", required: true, hint: "A few sentences in your own words. We will polish the wording." },
      { key: "started", label: "Year you started (optional)", type: "text" },
    ],
  },
  {
    title: "Contact details for the website",
    fields: [
      { key: "phone", label: "Phone number", type: "tel", required: true },
      { key: "whatsapp", label: "WhatsApp number (if different)", type: "tel" },
      { key: "email", label: "Email address customers should use", type: "email" },
      { key: "address", label: "Business address", type: "textarea", hint: "Leave empty if you don't want your address shown." },
      { key: "hours", label: "Opening hours", type: "text", hint: "e.g. Mon–Sat 8am–6pm" },
      { key: "socials", label: "Social media links", type: "textarea", hint: "Instagram, Facebook, TikTok, X… one per line" },
    ],
  },
  {
    title: "Domain name and business email",
    only: ["starter", "business", "store"],
    fields: [
      { key: "domain_choice", label: "Domain name", type: "select", required: true,
        options: ["Register a new domain for me", "I already have a domain"] },
      { key: "domain_ideas", label: "New domain: give us 2–3 ideas in order of preference", type: "text",
        hint: "e.g. adasalon.com.ng, adahair.com.ng. We check which is free.", only: ["starter"] },
      { key: "domain_ideas_any", label: "New domain: 2–3 ideas in order of preference, and .com or .com.ng", type: "text",
        hint: "e.g. adasalon.com, adasalon.com.ng", only: ["business", "store"] },
      { key: "existing_domain", label: "Existing domain: the name, and where you bought it", type: "text", hint: "e.g. adasalon.com.ng, bought from Whogohost" },
      { key: "email_names", label: "Business email address you want", type: "text", hint: "e.g. info@ or your name@ (1 address included)", only: ["starter"] },
      { key: "email_names_5", label: "Business email addresses you want (up to 5)", type: "textarea", hint: "e.g. info@, sales@, ada@", only: ["business", "store"] },
    ],
  },
  {
    title: "Look and feel",
    fields: [
      { key: "logo", label: "Your logo", type: "files", max: 2, accept: "image/*,.pdf",
        hint: "No logo yet? Leave this empty and we will make a simple text logo." },
      { key: "colours", label: "Brand colours", type: "text", hint: "e.g. navy and gold, or \"use the colours in my logo\"" },
      { key: "style", label: "Style you like", type: "select", options: ["Clean and modern", "Bold and colourful", "Elegant and classy", "Simple and friendly", "Not sure – you decide"] },
      { key: "examples", label: "Websites you like (optional)", type: "textarea", hint: "Links, and what you like about them" },
    ],
  },
  {
    title: "Pages and content",
    only: ["starter", "business", "store"],
    fields: [
      { key: "pages", label: "Choose your pages (up to 5)", type: "multi", options: PAGES_STARTER, max: 5, only: ["starter"] },
      { key: "pages_10", label: "Choose your pages (up to 10)", type: "multi", options: PAGES_BUSINESS, max: 10, only: ["business", "store"] },
      { key: "services", label: "Your services or main products", type: "rows", max: 20,
        columns: [{ key: "name", label: "Name" }, { key: "details", label: "Short description" }, { key: "price", label: "Price (optional)" }],
        hint: "Add one row per service. Leave the price empty if you don't want prices shown." },
      { key: "photos", label: "Photos for the website", type: "files", max: 12, accept: "image/*",
        hint: "Your shop, products, team or work. Up to 12. Clear, bright photos work best." },
      { key: "testimonials", label: "Customer reviews you'd like to show (optional)", type: "textarea", hint: "Name and what they said" },
    ],
  },
  {
    title: "Google Business Profile (Google Maps)",
    only: ["business", "store"],
    fields: [
      { key: "gbp_name", label: "Business name exactly as on your signboard", type: "text", required: true },
      { key: "gbp_category", label: "Type of business", type: "text", hint: "e.g. Hair salon, Bakery, Law firm", required: true },
      { key: "gbp_visit", label: "Do customers come to you?", type: "select", required: true,
        options: ["Yes, customers visit my address", "No, I go to customers (service area)", "Both"] },
      { key: "gbp_area", label: "Areas you serve", type: "text", hint: "e.g. Ibadan, Ogbomoso, Oyo State" },
      { key: "gbp_gmail", label: "Gmail address that should own the profile", type: "email", required: true,
        hint: "Google sends a verification code to the owner. Use an account you will keep." },
    ],
  },
  {
    title: "Blog or news",
    only: ["business", "store"],
    fields: [
      { key: "blog", label: "Who will write the first posts?", type: "select",
        options: ["Not needed for now", "I will write them", "Please write the first 2 posts for me"] },
      { key: "blog_topics", label: "Topics you'd like to write about", type: "textarea" },
    ],
  },
  {
    title: "Products",
    only: ["store"],
    fields: [
      { key: "product_count", label: "How many products to start with?", type: "select", required: true, options: ["Up to 20", "21–50", "51–100", "More than 100"] },
      { key: "products", label: "Products", type: "rows", max: 60,
        columns: [{ key: "name", label: "Product" }, { key: "price", label: "Price (₦)" }, { key: "category", label: "Category" }, { key: "details", label: "Description, sizes, colours" }],
        hint: "Add your main products here. For a long list, a spreadsheet sent on WhatsApp is fine." },
      { key: "product_photos", label: "Product photos", type: "files", max: 30, accept: "image/*",
        hint: "Name each photo after the product if you can. Plain background works best." },
    ],
  },
  {
    title: "Orders, delivery and payment",
    only: ["store"],
    fields: [
      { key: "delivery_areas", label: "Where do you deliver, and how much?", type: "textarea", required: true, hint: "e.g. Ibadan ₦2,000, rest of Oyo ₦4,000, other states by quote" },
      { key: "pickup", label: "Can customers pick up from you?", type: "select", options: ["Yes", "No"] },
      { key: "paystack", label: "Paystack (for card and bank payments)", type: "select", required: true,
        options: ["I have a Paystack business account", "Please help me set one up"], hint: "Payments go straight to your own Paystack account." },
      { key: "order_alerts", label: "Phone or email for new order alerts", type: "text", required: true },
      { key: "returns", label: "Returns and refund policy", type: "textarea", hint: "e.g. Exchanges within 7 days with receipt" },
    ],
  },
  {
    title: "Your project",
    only: ["project"],
    fields: [
      { key: "project_summary", label: "What should the app or system do?", type: "textarea", required: true },
      { key: "project_users", label: "Who will use it?", type: "textarea", hint: "e.g. my staff, my customers, managers" },
      { key: "project_features", label: "Must-have features", type: "textarea", required: true, hint: "One per line" },
      { key: "project_platforms", label: "Where should it work?", type: "multi", options: ["Website / web app", "Android phone", "iPhone", "Computer (office)"] },
      { key: "project_examples", label: "Similar apps you like (optional)", type: "textarea" },
      { key: "project_deadline", label: "When do you need it?", type: "text" },
      { key: "project_files", label: "Documents or screenshots (optional)", type: "files", max: 10, accept: "image/*,.pdf" },
    ],
  },
  {
    title: "Finally",
    fields: [
      { key: "anything_else", label: "Anything else we should know?", type: "textarea" },
      { key: "confirm", label: "The text and images I send are mine, or I have permission to use them on my website.", type: "confirm", required: true },
    ],
  },
];

// The sections and fields that apply to one kind of brief.
export function schemaFor(kind) {
  return SECTIONS.filter((s) => !s.only || s.only.includes(kind))
    .map((s) => ({ title: s.title, fields: s.fields.filter((f) => !f.only || f.only.includes(kind)).map(({ only, ...f }) => f) }))
    .filter((s) => s.fields.length);
}

const LIMITS = { text: 300, email: 200, tel: 40, textarea: 4000, select: 200 };

// Keep only known answers, trimmed to sensible sizes. Files are stored separately (server-side).
export function cleanAnswers(kind, raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const section of schemaFor(kind)) {
    for (const f of section.fields) {
      const v = raw[f.key];
      if (v === undefined || v === null || f.type === "files") continue;
      if (f.type === "confirm") out[f.key] = v === true;
      else if (f.type === "select") { if (f.options.includes(v)) out[f.key] = v; }
      else if (f.type === "multi") {
        if (Array.isArray(v)) out[f.key] = v.filter((x) => f.options.includes(x)).slice(0, f.max || f.options.length);
      } else if (f.type === "rows") {
        if (Array.isArray(v)) {
          out[f.key] = v.slice(0, f.max || 50).map((row) => {
            const r = {};
            for (const c of f.columns) r[c.key] = typeof row?.[c.key] === "string" ? row[c.key].trim().slice(0, 500) : "";
            return r;
          }).filter((r) => Object.values(r).some(Boolean));
        }
      } else if (typeof v === "string") out[f.key] = v.trim().slice(0, LIMITS[f.type] || 1000);
    }
  }
  return out;
}

// Required fields that are still empty (for the final submit).
export function missingRequired(kind, answers, files) {
  const missing = [];
  for (const section of schemaFor(kind)) {
    for (const f of section.fields) {
      if (!f.required) continue;
      const v = f.type === "files" ? (files?.[f.key] || []) : answers[f.key];
      const empty = f.type === "confirm" ? v !== true : Array.isArray(v) ? v.length === 0 : !v;
      if (empty) missing.push(f.label);
    }
  }
  return missing;
}

export function fileField(kind, key) {
  for (const s of schemaFor(kind)) for (const f of s.fields) if (f.key === key && f.type === "files") return f;
  return null;
}
