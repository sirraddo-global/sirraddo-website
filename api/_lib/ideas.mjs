// Ideas a customer shared with the website chat assistant, kept in customer_requests.chat_ideas.
export const IDEA_LABELS = {
  business_name: "Business name", what_they_do: "What they do", location: "Location", customers: "Customers", goals: "Goals for the website",
  pages: "Pages wanted", products_services: "Products / services", style: "Colours and style", examples: "Websites they like",
  slogan: "Slogan", hours: "Opening hours", domain: "Domain", has_logo: "Logo", special: "Other wishes", recommended: "Package recommended in chat",
};
export function cleanIdeas(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of Object.keys(IDEA_LABELS)) {
    const v = typeof raw[k] === "string" ? raw[k].trim().slice(0, 600) : "";
    if (v) out[k] = v;
  }
  return out;
}
export function ideasText(ideas) {
  return Object.entries(IDEA_LABELS).filter(([k]) => ideas?.[k]).map(([k, l]) => `${l}: ${ideas[k]}`).join("\n");
}
