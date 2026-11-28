// One-page sites from a quick-service order (Mini website, QR menu / price list): the AI reads what the
// customer wrote on the order and fills in the project form for them, one page only, with their logo and
// photos. Then the usual tools take over: Write website text → (optional) AI design → Preview → Go live.
import { pickProvider, friendlyAiError } from "./providers.mjs";
import { setBriefFromOrder, getRequest } from "./store.mjs";
import { readImageForAi } from "./platform.mjs";

const clip = (v, n) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

const SYSTEM = `You fill in a website project form for a small Nigerian business from what they wrote when ordering.
Use ONLY what they wrote. Never invent prices, addresses, phone numbers or claims. Leave a field empty ("") if it isn't given.
"description": 2–4 sentences in their own facts: what they do and who for.
"services": every product/service/menu item they listed, with its price exactly as written (e.g. "₦2,500"); "details" a few words if given.
Reply with ONLY JSON: {"business_name":"","tagline":"","description":"","phone":"","whatsapp":"","email":"","address":"","hours":"","socials":"one per line","colours":"","services":[{"name":"","details":"","price":""}]}`;

export async function onePageBrief(id, budgetMs = 40000) {
  const r = await getRequest(id);
  if (!r) return { ok: false, error: "Not found" };
  const provider = pickProvider();
  if (!provider) return { ok: false, error: "No AI is set up yet (Admin → Settings → Keys & connections)." };
  const details = String(r.details || "");
  const files = [...details.matchAll(/^• (.+?): (https?:\/\/\S+)$/gm)].map((m) => ({ name: m[1].trim(), url: m[2] }))
    .filter((f) => /\.(png|jpe?g|webp)(\?|$)/i.test(f.url));
  const menu = /menu|price list/i.test(r.interest || "");
  const text = details.replace(/^[•◦] .+?: https?:\/\/\S+$/gm, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 8000);
  const prompt = `Order: ${clip(r.interest, 60)} for ${clip(r.name, 80)}${r.business ? ` (${clip(r.business, 80)})` : ""}\nContact on the order: ${clip(r.contact, 80)}${r.email ? `, ${clip(r.email, 100)}` : ""}\n\nWhat they wrote:\n${text}\n\nFill in the form.`;
  // Their pictures go to the AI too: a photo of their current menu or price list is read like text.
  const images = (await Promise.all(files.filter((f) => !/logo/i.test(f.name)).slice(0, 3).map((f) => readImageForAi(f.url)))).filter(Boolean);
  const model = provider.name === "anthropic" ? process.env.ANTHROPIC_DESIGN_MODEL || "claude-haiku-5-5" : undefined;
  let a;
  try {
    const out = await provider.call(provider.start([{ role: "user", content: prompt + (images.length ? `\n\n${images.length} of their pictures are attached: if one is a menu or price list, read every item and price from it.` : ""), images }]), SYSTEM, [], budgetMs, { maxTokens: 3000, attemptMs: budgetMs - 1500, model });
    const t = String(out.text || ""); a = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch (err) {
    if (err instanceof SyntaxError) return { ok: false, error: "The AI didn't return usable details. Please try again." };
    console.error("one-page brief failed", err.code, err.message);
    return { ok: false, error: friendlyAiError(err) };
  }
  const services = (Array.isArray(a.services) ? a.services : []).slice(0, 60)
    .map((s) => ({ name: clip(s?.name, 80), details: clip(s?.details, 160), price: clip(s?.price, 40) })).filter((s) => s.name);
  const name = clip(a.business_name, 80) || clip(r.business, 80) || clip(r.name, 80);
  const note = menu ? " This one-page website is their menu / price list: show every item with its price, grouped if they gave groups, with a big Order on WhatsApp button."
    : " This is a one-page website (digital business card): who they are, what they offer with prices, photos, contact buttons and the map.";
  const brief = {
    business_name: name, tagline: clip(a.tagline, 120), description: (clip(a.description, 900) || `${name}.`) + note,
    phone: clip(a.phone, 40) || clip(r.contact, 40), whatsapp: clip(a.whatsapp, 40), email: clip(a.email, 100) || (/@/.test(r.email || "") ? r.email : ""),
    address: clip(a.address, 300), hours: clip(a.hours, 120), socials: clip(a.socials, 400), colours: clip(a.colours, 120),
    style: "Not sure – you decide", surface: "Brand tinted (recommended)", pages: ["Home"], services,
  };
  const logo = files.filter((f) => /logo/i.test(f.name)).slice(0, 1);
  const photos = files.filter((f) => !/logo/i.test(f.name)).slice(0, 8);
  const toFile = (f) => ({ url: f.url, name: f.name, size: 0, type: /\.png/i.test(f.url) ? "image/png" : /\.webp/i.test(f.url) ? "image/webp" : "image/jpeg" });
  await setBriefFromOrder(id, brief, { ...(logo.length ? { logo: logo.map(toFile) } : {}), ...(photos.length ? { photos: photos.map(toFile) } : {}) });
  return { ok: true, brief, files: { logo: logo.length, photos: photos.length } };
}
