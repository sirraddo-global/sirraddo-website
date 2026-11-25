// Reviews (customers rate a finished order on their tracking page; shown on the site once approved in admin)
// and the portfolio (finished designs with the customer's "before" photo, by category). Kept as small JSON lists.
import { getMeta, setMeta, getByDocToken, reference } from "./store.mjs";
import { putFile } from "./platform.mjs";

export const GALLERY_CATS = ["Food & drinks", "Fashion & beauty", "Events & invitations", "Church & mosque", "Business & services", "Sales & offers"];
const clip = (v, n) => String(v ?? "").replace(/[\r<>]/g, " ").trim().slice(0, n);
async function readList(key) { try { return JSON.parse((await getMeta([key]))[key] || "[]"); } catch { return []; } }
const writeList = (key, list) => setMeta(key, JSON.stringify(list));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Saves a picture sent as a data URL (from the studio or tracker) and returns its public URL. */
export async function saveDataImage(dataUrl, folder) {
  const m = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return "";
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 4 * 1024 * 1024) throw Object.assign(new Error("Picture too big (max 4 MB)."), { status: 400 });
  const { url } = await putFile(`${folder}/${newId()}.${m[1].split("/")[1].replace("jpeg", "jpg")}`, buf, { contentType: m[1] });
  return url;
}

// ---------- Reviews ----------
export async function listReviews({ all = false } = {}) {
  const list = await readList("reviews");
  return all ? list : list.filter((r) => r.ok).slice(0, 12).map(({ id, name, business, service, stars, text, photo, at }) => ({ id, name, business, service, stars, text, photo, at }));
}
export async function addReview(token, { stars, text, photo } = {}) {
  const row = token ? await getByDocToken(String(token).slice(0, 100)).catch(() => null) : null;
  if (!row) throw Object.assign(new Error("Order not found."), { status: 404 });
  const n = Math.round(Number(stars));
  if (!(n >= 1 && n <= 5)) throw Object.assign(new Error("Please pick 1 to 5 stars."), { status: 400 });
  const list = await readList("reviews");
  if (list.some((r) => r.req === row.id)) throw Object.assign(new Error("Thanks! You've already rated this order."), { status: 409 });
  const pic = photo ? await saveDataImage(photo, "reviews") : "";
  list.unshift({ id: newId(), req: row.id, ref: reference(row.id), name: clip(String(row.name || "").split(" ")[0], 30), business: clip(row.business, 60),
    service: clip(row.interest, 60), stars: n, text: clip(text, 400), photo: pic, at: new Date().toISOString(), ok: false });
  await writeList("reviews", list.slice(0, 200));
  return { ok: true };
}
export async function setReview(id, action) {
  let list = await readList("reviews");
  if (action === "remove") list = list.filter((r) => r.id !== id);
  else list = list.map((r) => (r.id === id ? { ...r, ok: action === "approve" } : r));
  await writeList("reviews", list);
  return list;
}

// ---------- Portfolio (before → after) ----------
export async function listGallery() { return readList("gallery"); }
export async function addGallery({ cat, title, before, after } = {}) {
  if (!after) throw Object.assign(new Error("Add the finished design."), { status: 400 });
  const item = { id: newId(), cat: GALLERY_CATS.includes(cat) ? cat : GALLERY_CATS[4], title: clip(title, 60),
    after: /^https?:/.test(after) ? clip(after, 400) : await saveDataImage(after, "gallery"),
    before: !before ? "" : /^https?:/.test(before) ? clip(before, 400) : await saveDataImage(before, "gallery"), at: new Date().toISOString() };
  const list = await readList("gallery"); list.unshift(item);
  await writeList("gallery", list.slice(0, 60));
  return list;
}
export async function removeGallery(id) {
  const list = (await readList("gallery")).filter((g) => g.id !== id);
  await writeList("gallery", list); return list;
}
