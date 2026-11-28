// Live preview on /services for Mini website and QR menu orders: their one page, drawn by our real website
// builder from what they typed (no AI, nothing saved). Lines with a price become their price list / menu.
import { buildSiteModel, renderPage } from "./sitegen.mjs";

const clip = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);
const PRICE = /(?:₦|N|NGN)\s?(\d[\d,]*(?:\.\d+)?\s?[kK]?)|(\d[\d,]{2,})\s?(?:naira|NGN)/;
const TRADE_PICS = [
  [/cake|chip|snack|chops|bak|pastr|bread|treat|kitchen|food|grill|suya|cater|restaurant|eatery|zobo|juice|menu|rice|soup|amala/i, ["restaurant", "restaurant-2"]],
  [/salon|hair|beauty|spa|nail|lash|make ?up|barb/i, ["salon", "salon-2"]],
  [/church|ministr|assembly|chapel|parish/i, ["church", "church-2"]],
  [/school|academy|college|nursery/i, ["school", "school-2"]],
  [/home|propert|realt|estate|land|apartment/i, ["property", "property-2"]],
  [/pharm|clinic|hospital|health|medic|lab\b/i, ["clinic", "clinic-2"]],
  [/hotel|suites|lodge|resort|guest ?house|shortlet/i, ["hotel", "hotel-2"]],
  [/gas|fuel|petrol|filling/i, ["fuel", "fuel-2"]],
  [/fashion|cloth|wears?\b|boutique|tailor|fabric/i, ["fashion"]],
];

export function onePagePreview({ words, business, contact, kind }) {
  const menu = kind === "qrmenu";
  const text = clip(words, 2000);
  const lines = text.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  const services = [], about = [];
  for (const l of lines) {
    const m = PRICE.exec(l);
    if (m && services.length < 40) {
      const price = (m[0].includes("₦") || /^N/i.test(m[0]) ? m[0] : "₦" + m[2]).replace(/^NGN\s?|^N(?=\d)/i, "₦").replace(/\s+/g, "");
      const name = l.replace(m[0], "").replace(/[-–—:·|,]+\s*$|^\s*[-–—:·|,•*]+/g, "").replace(/\s{2,}/g, " ").trim();
      if (name) services.push({ name: clip(name, 80), details: "", price: clip(price, 30) });
    } else about.push(l);
  }
  const name = clip(business, 80) || clip(about[0], 60) || "Your business";
  const desc = about.filter((l) => l !== name).join(" ").slice(0, 400);
  const pics = (TRADE_PICS.find((t) => t[0].test(`${name} ${text}`)) || [null, ["p1", "p2"]])[1];
  const phone = clip(contact, 30);
  const brief = {
    business_name: name, description: desc || (menu ? `${name}: our menu and prices.` : `${name}.`), phone, whatsapp: phone,
    style: "Not sure – you decide", surface: "Brand tinted (recommended)", pages: ["Home"], services,
  };
  const hero = menu
    ? `### Hero\n**Headline:** Our menu\n**Subheadline:** ${desc ? clip(desc, 140) : "See our prices and order on WhatsApp."}\n**Button text:** Order on WhatsApp\n`
    : `### Hero\n**Headline:** ${name}\n**Subheadline:** ${desc ? clip(desc, 160) : "Call or chat with us on WhatsApp."}\n**Button text:** Chat on WhatsApp\n`;
  const row = { id: 0, name, business: name, interest: menu ? "QR menu / price list" : "Mini website", status: "won", brief,
    brief_files: { photos: pics.map((p) => ({ url: `/assets/demo/${p}.svg`, name: `${p}.svg`, type: "image/svg+xml" })) },
    draft_md: `# Website text: ${name}\n\n## Page: Home\n**SEO title:** ${name}\n**Meta description:** ${name}\n${hero}` };
  const site = buildSiteModel(row);
  return renderPage(site, "index", { mode: "preview", link: () => "#", top: "Live preview · your page will use your own photos and wording, made by SIRRADDO", panel: "" });
}
