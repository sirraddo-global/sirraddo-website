// The few things that differ between hosts (Netlify now; Vercel before). Everything else is plain Node.
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
  // Vercel (kept so the site can still run there) or local: fire and forget.
  import("@vercel/functions").then((m) => m.waitUntil(promise)).catch(() => promise);
}

const FILES_STORE = "uploads";
export const filesEnabled = () => Boolean(globalThis.__TEST_BLOB__ || process.env.BLOB_READ_WRITE_TOKEN || onNetlify());

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
  const { put } = await import("@vercel/blob");
  return put(path, body, { access: "public", addRandomSuffix: true, contentType });
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
