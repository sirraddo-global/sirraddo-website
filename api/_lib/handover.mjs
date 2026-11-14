// Extra facts the handover pack shows that live outside the customer's row: their change-request link and
// the names of their website's pages (from the website text).
import { getPreviewById } from "./store.mjs";
import { buildSiteModel } from "./sitegen.mjs";
import { changeLink } from "./changes.mjs";

export async function addHandoverExtras(r) {
  r.change_link = await changeLink(r.id);
  try {
    const p = await getPreviewById(r.id);
    if (p?.draft_md) r.page_names = buildSiteModel(p).pages.map((x) => x.name);
  } catch (e) { console.error("handover pages failed", e); }
  return r;
}
