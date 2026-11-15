// The few things that are specific to the host (Netlify). Everything else is plain Node.
//   onNetlify          true inside a Netlify Function
//   FUNCTION_BUDGET_MS how long a request may safely run (Netlify stops functions at 30 s)
//   waitUntil(p)       keep working after the response has been sent
//   putFile(...)       store an uploaded file and get its public URL
import { randomBytes } from "node:crypto";
import { SITE_URL } from "../../site.config.mjs";

export const onNetlify = () => Boolean(globalThis.Netlify || process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
export const FUNCTION_BUDGET_MS = () => (onNetlify() ? 26000 : 55000);

export function waitUntil(promise) {
  const ctx = globalThis.__requestContext;
  if (ctx?.waitUntil) return ctx.waitUntil(promise);
  promise.catch?.((e) => console.error("background work failed", e)); // local runs: just let it finish
}

const FILES_STORE = "uploads";
export const filesEnabled = () => Boolean(globalThis.__TEST_BLOB__ || onNetlify());

// Stores a public file. path like "brief/12/logo.png". Returns { url }.
export async function putFile(path, body, { contentType } = {}) {
  if (globalThis.__TEST_BLOB__) return globalThis.__TEST_BLOB__.put(path, body, { access: "public", addRandomSuffix: true, contentType });
  if (onNetlify()) {
    const { getStore } = await import("@netlify/blobs");
    const dot = path.lastIndexOf(".");
    const key = `${dot > path.lastIndexOf("/") ? path.slice(0, dot) : path}-${randomBytes(8).toString("hex")}${dot > path.lastIndexOf("/") ? path.slice(dot) : ""}`
      .replace(/[^\w./-]+/g, "_");
    await getStore({ name: FILES_STORE, consistency: "strong" }).set(key, body, { metadata: { type: contentType || "application/octet-stream" } });
    // URL is Netlify's address for the site (the custom domain once it's set, the .netlify.app one before),
    // and both keep working afterwards.
    return { url: `${(process.env.URL || SITE_URL).replace(/\/$/, "")}/files/${key}` };
  }
  throw new Error("File storage is only available on Netlify");
}

// Deletes every stored file whose path starts with prefix (e.g. "briefs/12/" when a project is deleted).
export async function deleteFiles(prefix) {
  if (globalThis.__TEST_BLOB__) return globalThis.__TEST_BLOB__.deleted?.push(prefix) ?? 0;
  if (!onNetlify() || !/^[\w-]+\/[\w./-]*$/.test(prefix)) return 0;
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: FILES_STORE });
  const { blobs } = await store.list({ prefix });
  for (const b of blobs) await store.delete(b.key);
  return blobs.length;
}
// Chat photos are stored by month (chats/2026-11/...). Deletes the months that ended more than `days` ago.
export async function deleteOldChatFiles(days = 90, now = new Date()) {
  if (!onNetlify()) return 0;
  const { getStore } = await import("@netlify/blobs");
  const { directories } = await getStore({ name: FILES_STORE }).list({ prefix: "chats/", directories: true });
  const cutoff = now.getTime() - days * 86400000;
  let n = 0;
  for (const dir of directories || []) {
    const m = dir.match(/^chats\/(\d{4})-(\d{2})\/?$/);
    if (m && Date.UTC(Number(m[1]), Number(m[2]), 1) <= cutoff) n += await deleteFiles(`chats/${m[1]}-${m[2]}/`);
  }
  return n;
}

// Reads one of OUR uploaded pictures so the AI can look at it: { mime, data (base64) } or null.
// Only files stored by this site (…/files/… or the test store); never fetches other websites.
const AI_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export async function readImageForAi(url) {
  try {
    let buf, mime;
    if (globalThis.__TEST_BLOB__ && /\/__blob\//.test(url)) {
      const r = await fetch(url); mime = (r.headers.get("content-type") || "").split(";")[0]; buf = Buffer.from(await r.arrayBuffer());
    } else {
      const m = String(url).match(/^https:\/\/([^/]+)\/files\/([\w./-]+)$/);
      const hosts = [SITE_URL, process.env.URL, "https://sirraddo.com.ng", "https://sirraddo.netlify.app"].filter(Boolean).map((u) => new URL(u).host);
      if (!m || !hosts.includes(m[1]) || m[2].includes("..") || !onNetlify()) return null;
      const { getStore } = await import("@netlify/blobs");
      const r = await getStore({ name: FILES_STORE }).getWithMetadata(m[2], { type: "arrayBuffer" });
      if (!r) return null;
      buf = Buffer.from(r.data); mime = r.metadata?.type;
    }
    if (!AI_IMAGE_TYPES.includes(mime) || !buf.length || buf.length > 4 * 1024 * 1024) return null;
    return { mime, data: buf.toString("base64") };
  } catch (e) {
    console.error("image for AI failed", url, e.message);
    return null;
  }
}

// Serves /files/<key> (Netlify). Returns a Response or null.
export async function getFileResponse(key) {
  const { getStore } = await import("@netlify/blobs");
  const r = await getStore({ name: FILES_STORE }).getWithMetadata(key, { type: "arrayBuffer" });
  if (!r) return null;
  return new Response(r.data, { headers: { "Content-Type": r.metadata?.type || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff",
    // Uploaded files come from customers: never let one run scripts on this site (e.g. an SVG with a script in it).
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", "X-Frame-Options": "SAMEORIGIN" } });
}
