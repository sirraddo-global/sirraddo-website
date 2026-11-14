// GET /files/<path> — photos, logos and documents uploaded through the project form and change requests,
// kept in Netlify Blobs (store "uploads"). The paths have long random parts, so they can't be guessed.
import { getFileResponse } from "../../api/_lib/platform.mjs";

export default async (request) => {
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
  const key = decodeURIComponent(new URL(request.url).pathname.replace(/^\/files\//, ""));
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const res = await getFileResponse(key).catch((err) => { console.error("file read failed", key, err); return null; });
  return res || new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
};
export const config = { path: "/files/*" };
