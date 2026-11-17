// Extra facts the handover pack shows that live outside the customer's row: their change-request link and
// the names of their website's pages (from the website text).
import { getPreviewById, getBriefById } from "./store.mjs";
import { buildSiteModel } from "./sitegen.mjs";
import { changeLink } from "./changes.mjs";

export async function addHandoverExtras(r) {
  r.change_link = await changeLink(r.id);
  // Live websites: the owner's own "Manage my store/website" link (prices, sold out, hours, numbers, notice, slogan, reviews).
  if (r.website_url || r.live_on || r.hosting?.publishedAt) r.manage_link = (await (await import("./manage.mjs")).manageLink(r.id).catch(() => null))?.url || "";
  try {
    const b = await getBriefById(r.id);
    r.files = Object.values(b?.brief_files || {}).flat().filter((f) => f && f.url).slice(0, 30).map((f) => ({ url: f.url, name: f.name || "file" }));
  } catch (e) { console.error("handover files failed", e); }
  try {
    const p = await getPreviewById(r.id);
    if (p?.draft_md) r.page_names = buildSiteModel(p).pages.map((x) => x.name);
  } catch (e) { console.error("handover pages failed", e); }
  return r;
}
