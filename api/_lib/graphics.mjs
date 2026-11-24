// Flyers & graphics: fixed-price design jobs ordered from /design (not the AI website designs in design.mjs). Used by the order API,
// the automation rules (design jobs skip the website steps) and the tests; design.html shows the same prices.
// Change a price: edit it here AND on design.html (a test checks they match).
export const DESIGN_SERVICES = [
  { interest: "Flyer design", price: 5000, days: "1–2 working days", what: "One flyer for WhatsApp, Instagram or print" },
  { interest: "Social media designs", price: 15000, days: "2–3 working days", what: "5 matching post or status designs" },
  { interest: "Business card design", price: 5000, days: "1–2 working days", what: "Front and back, print-ready" },
  { interest: "Logo design", price: 20000, days: "3–5 working days", what: "3 ideas, then your favourite refined" },
  { interest: "Brand kit", price: 45000, days: "5–7 working days", what: "Logo, business card, letterhead and 3 social templates" },
];
export const DESIGN_NAMES = DESIGN_SERVICES.map((d) => d.interest);
export const isDesign = (interest) => DESIGN_NAMES.includes(interest);
export const designPrice = (interest) => DESIGN_SERVICES.find((d) => d.interest === interest)?.price ?? null;

export const DESIGN_SIZES = [
  "WhatsApp / Instagram post (square)", "WhatsApp / Instagram status (tall)", "Facebook post", "A4 print", "A5 print (handbill)",
  "Banner / roll-up", "Business card", "Not sure: please advise",
];

const str = (v, n) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, n) : "");
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Checks an order from the form and writes it up as the request's details (what the designer needs). */
export function cleanDesignOrder(body = {}) {
  const service = isDesign(body.service) ? body.service : null;
  if (!service) throw Object.assign(new Error("Please choose what you want designed."), { status: 400 });
  const words = str(body.words, 1200);
  if (words.length < 5) throw Object.assign(new Error("Please type the words that should be on the design (name, offer, prices, contacts…)."), { status: 400 });
  const size = DESIGN_SIZES.includes(body.size) ? body.size : "Not sure: please advise";
  const colours = str(body.colours, 200);
  const style = str(body.style, 300);
  const deadline = ISO.test(String(body.deadline || "")) ? body.deadline : "";
  const files = (Array.isArray(body.files) ? body.files : []).slice(0, 4)
    .map((f) => ({ url: str(f?.url, 400), name: str(f?.name, 60) || "file" }))
    .filter((f) => /^https:\/\/|^http:\/\/localhost/.test(f.url));
  const lines = [
    `DESIGN ORDER: ${service}`,
    `Size / where it's used: ${size}`,
    deadline && `Needed by: ${deadline}`,
    colours && `Colours: ${colours}`,
    style && `Style / ideas: ${style}`,
    "", "Words to put on it:", words,
    files.length ? "" : null,
    files.length ? `Files (${files.length}):` : null,
    ...files.map((f) => `• ${f.name}: ${f.url}`),
  ].filter((x) => x !== null);
  return { service, size, deadline, details: lines.join("\n").replace(/\n{3,}/g, "\n\n").slice(0, 3800), files };
}
