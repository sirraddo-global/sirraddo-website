// The few things that are specific to the host (Netlify, or our own VPS). Everything else is plain Node.
//   onNetlify          true inside a Netlify Function
//   FUNCTION_BUDGET_MS how long a request may safely run (Netlify stops functions at 30 s)
//   waitUntil(p)       keep working after the response has been sent
//   putFile(...)       store an uploaded file and get its public URL (Netlify Blobs, or FILES_DIR on the VPS)
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
// Where uploaded files live: Netlify Blobs on Netlify, or a folder on our own server (FILES_DIR, set on the VPS).
const filesDir = () => (process.env.FILES_DIR || "").replace(/\/$/, "");
export const filesEnabled = () => Boolean(globalThis.__TEST_BLOB__ || onNetlify() || filesDir());

// One small interface over both: put / get / list / delete by key ("chats/2026-11/photo-ab12.jpg").
async function storage() {
  if (filesDir()) {
    const fs = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const root = filesDir();
    const full = (key) => {
      const p = join(root, key);
      if (!p.startsWith(root + "/") || key.includes("..")) throw new Error("bad file key");
      return p;
    };
    const walk = async (dir, base, out) => {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(join(dir, e.name), rel, out);
        else if (!e.name.endsWith(".type")) out.push(rel);
      }
      return out;
    };
    return {
      async put(key, body, type) {
        const p = full(key);
        await fs.mkdir(dirname(p), { recursive: true });
        await fs.writeFile(p, Buffer.isBuffer(body) ? body : Buffer.from(body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer()));
        await fs.writeFile(p + ".type", type || "application/octet-stream");
      },
      async get(key) {
        try {
          const p = full(key);
          const data = await fs.readFile(p);
          const type = (await fs.readFile(p + ".type", "utf8").catch(() => "")).trim() || "application/octet-stream";
          return { data, type };
        } catch { return null; }
      },
      async list(prefix) { const base = prefix.replace(/\/$/, ""); return walk(full(base), base, []); },
      async dirs(prefix) {
        const base = prefix.replace(/\/$/, "");
        return (await fs.readdir(full(base), { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => `${base}/${e.name}/`);
      },
      async del(key) { const p = full(key); await fs.rm(p, { force: true }); await fs.rm(p + ".type", { force: true }); },
    };
  }
  if (onNetlify()) {
    const { getStore } = await import("@netlify/blobs");
    const st = getStore({ name: FILES_STORE, consistency: "strong" });
    return {
      put: (key, body, type) => st.set(key, body, { metadata: { type: type || "application/octet-stream" } }),
      async get(key) { const r = await st.getWithMetadata(key, { type: "arrayBuffer" }); return r ? { data: Buffer.from(r.data), type: r.metadata?.type } : null; },
      async list(prefix) { return (await st.list({ prefix })).blobs.map((b) => b.key); },
      async dirs(prefix) { return (await st.list({ prefix, directories: true })).directories || []; },
      del: (key) => st.delete(key),
    };
  }
  return null;
}

// Stores a public file. path like "brief/12/logo.png". Returns { url }.
export async function putFile(path, body, { contentType } = {}) {
  if (globalThis.__TEST_BLOB__) return globalThis.__TEST_BLOB__.put(path, body, { access: "public", addRandomSuffix: true, contentType });
  const st = await storage();
  if (!st) throw new Error("File storage isn't set up (Netlify, or FILES_DIR on the server)");
  const dot = path.lastIndexOf(".");
  const key = `${dot > path.lastIndexOf("/") ? path.slice(0, dot) : path}-${randomBytes(8).toString("hex")}${dot > path.lastIndexOf("/") ? path.slice(dot) : ""}`
    .replace(/[^\w./-]+/g, "_");
  await st.put(key, body, contentType);
  // URL is the site's own address (the custom domain once it's set). Old links on other hosts keep working.
  return { url: `${(process.env.URL || SITE_URL).replace(/\/$/, "")}/files/${key}` };
}

// Deletes every stored file whose path starts with prefix (e.g. "briefs/12/" when a project is deleted).
export async function deleteFiles(prefix) {
  if (globalThis.__TEST_BLOB__) return globalThis.__TEST_BLOB__.deleted?.push(prefix) ?? 0;
  if (!/^[\w-]+\/[\w./-]*$/.test(prefix)) return 0;
  const st = await storage();
  if (!st) return 0;
  const keys = await st.list(prefix);
  for (const k of keys) await st.del(k);
  return keys.length;
}
// Chat photos are stored by month (chats/2026-11/...). Deletes the months that ended more than `days` ago.
export async function deleteOldChatFiles(days = 90, now = new Date()) {
  const st = globalThis.__TEST_BLOB__ ? null : await storage();
  if (!st) return 0;
  const cutoff = now.getTime() - days * 86400000;
  let n = 0;
  for (const dir of await st.dirs("chats/")) {
    const m = dir.match(/^chats\/(\d{4})-(\d{2})\/?$/);
    if (m && Date.UTC(Number(m[1]), Number(m[2]), 1) <= cutoff) n += await deleteFiles(`chats/${m[1]}-${m[2]}/`);
  }
  return n;
}

// Our own addresses: a /files/ link on any of them is one of our stored files.
const ourHosts = () => [SITE_URL, process.env.URL, "https://sirraddo.com.ng", "https://www.sirraddo.com.ng", "https://sirraddo.netlify.app"].filter(Boolean).map((u) => new URL(u).host);
const ourKey = (url) => {
  const m = String(url).match(/^https:\/\/([^/]+)\/files\/([\w./-]+)$/);
  return m && ourHosts().includes(m[1]) && !m[2].includes("..") ? m[2] : null;
};

// Reads one of our stored files (for publishing photos to a customer's site): Buffer, or null if not ours / missing.
export async function readStoredFile(url) {
  if (globalThis.__TEST_BLOB__ && /\/__blob\//.test(url)) {
    const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  const key = ourKey(url);
  if (!key) return null;
  const st = await storage();
  if (st) { const r = await st.get(key); return r ? r.data : null; }
  // Anywhere else (tests, local runs): fetch our own /files/ link.
  const r = await fetch(url); return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
}

// Reads one of OUR uploaded pictures so the AI can look at it: { mime, data (base64) } or null.
// Only files stored by this site (…/files/… or the test store); never fetches other websites.
const AI_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]; // PDFs too: both AIs read them
export async function readImageForAi(url) {
  try {
    let buf, mime;
    if (globalThis.__TEST_BLOB__ && /\/__blob\//.test(url)) {
      const r = await fetch(url); mime = (r.headers.get("content-type") || "").split(";")[0]; buf = Buffer.from(await r.arrayBuffer());
    } else {
      const key = ourKey(url);
      const st = key ? await storage() : null;
      const r = st ? await st.get(key) : null;
      if (!r) return null;
      buf = r.data; mime = r.type;
    }
    if (!AI_IMAGE_TYPES.includes(mime) || !buf.length || buf.length > 4 * 1024 * 1024) return null;
    return { mime, data: buf.toString("base64") };
  } catch (e) {
    console.error("image for AI failed", url, e.message);
    return null;
  }
}

// Serves /files/<key>. Returns a Response or null.
export async function getFileResponse(key) {
  const st = await storage();
  const r = st ? await st.get(key) : null;
  if (!r) return null;
  return new Response(r.data, { headers: { "Content-Type": r.type || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff",
    // Uploaded files come from customers: never let one run scripts on this site (e.g. an SVG with a script in it).
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox", "X-Frame-Options": "SAMEORIGIN" } });
}
