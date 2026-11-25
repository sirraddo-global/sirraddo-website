// Runs the website on our own VPS (behind Nginx), with the same code Netlify runs:
//   - every netlify/functions/*.mjs handler, on the paths in its `config.path`
//   - scheduled ones (`config.schedule`, e.g. the 06:00 UTC morning run) on a simple timer
//   - the built pages in public/ with pretty URLs (/design → design.html), 404.html, and the headers from netlify.toml
//   - /health for the VPS monitor
// Start: npm start  (builds public/ first, reads settings from .env). Uploaded files go to FILES_DIR.
import http from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT || 4104);
const CANONICAL = (process.env.URL || "https://www.sirraddo.com.ng").replace(/\/$/, "");
const MAX_BODY = 15 * 1024 * 1024;

// ---------- functions and schedules ----------
const routes = []; // { exact?: string, prefix?: string, fn }
const schedules = []; // { cron, fn, name }
for (const file of (await readdir(join(ROOT, "netlify/functions"))).filter((f) => f.endsWith(".mjs")).sort()) {
  const mod = await import(pathToFileURL(join(ROOT, "netlify/functions", file)).href);
  const cfg = mod.config || {};
  if (cfg.schedule) schedules.push({ cron: cfg.schedule, fn: mod.default, name: file });
  for (const p of [].concat(cfg.path || [])) routes.push(p.endsWith("/*") ? { prefix: p.slice(0, -1), fn: mod.default } : { exact: p, fn: mod.default });
}
const findRoute = (path) => routes.find((r) => (r.exact ? r.exact === path : path.startsWith(r.prefix)));

// ---------- headers from netlify.toml ([[headers]] for = "..." blocks) ----------
const headerRules = [];
{
  const toml = await readFile(join(ROOT, "netlify.toml"), "utf8");
  for (const block of toml.split("[[headers]]").slice(1)) {
    const forPath = (block.match(/for\s*=\s*"([^"]+)"/) || [])[1];
    if (!forPath) continue;
    const values = {};
    const vals = block.split("[headers.values]")[1] || "";
    for (const line of vals.split("\n")) {
      if (/^\s*\[/.test(line)) break;
      const m = line.match(/^\s*([\w-]+)\s*=\s*"(.*)"\s*$/);
      if (m) values[m[1]] = m[2].replace(/\\"/g, '"');
    }
    headerRules.push({ forPath, values });
  }
}
const ruleMatches = (rule, path) => (rule.forPath.endsWith("/*") ? path.startsWith(rule.forPath.slice(0, -1)) : rule.forPath === path);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2", ".woff": "font/woff", ".pdf": "application/pdf", ".mp4": "video/mp4", ".webm": "video/webm",
};

async function staticFile(path) {
  let rel = decodeURIComponent(path);
  if (rel.endsWith("/")) rel += "index.html";
  const tries = [rel];
  if (!extname(rel)) tries.push(rel + ".html", rel + "/index.html");
  for (const t of tries) {
    const full = normalize(join(PUBLIC, t));
    if (!full.startsWith(PUBLIC)) return null;
    const st = await stat(full).catch(() => null);
    if (st?.isFile()) return { full, type: TYPES[extname(full).toLowerCase()] || "application/octet-stream" };
  }
  return null;
}

// ---------- request handling ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error("too big"), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function send(res, response, method) {
  const headers = {};
  response.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  if (method === "HEAD" || [204, 304].includes(response.status)) return res.end();
  res.end(Buffer.from(await response.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || "").toLowerCase().split(":")[0];
    const url = new URL(req.url, CANONICAL);
    // Bare domain → www (Netlify did this for us before).
    if (host && host === new URL(CANONICAL).host.replace(/^www\./, "")) {
      res.writeHead(301, { location: CANONICAL + url.pathname + url.search }); return res.end();
    }
    if (url.pathname === "/health") { res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }); return res.end("ok"); }

    const route = findRoute(url.pathname);
    if (route) {
      const body = ["GET", "HEAD"].includes(req.method) ? undefined : await readBody(req);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      // The visitor's real address comes from Nginx (X-Real-IP); a visitor can't fake it.
      const ip = String(req.headers["x-real-ip"] || req.socket.remoteAddress || "");
      headers.set("x-forwarded-for", ip);
      const request = new Request(`${CANONICAL}${url.pathname}${url.search}`, { method: req.method, headers, body: body?.length ? body : undefined });
      const context = { ip, waitUntil: (p) => Promise.resolve(p).catch((e) => console.error("background work failed", e)) };
      return send(res, await route.fn(request, context), req.method);
    }

    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405, { allow: "GET, HEAD" }); return res.end(); }
    const file = await staticFile(url.pathname);
    const headers = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY" };
    for (const rule of headerRules) if (ruleMatches(rule, url.pathname)) Object.assign(headers, Object.fromEntries(Object.entries(rule.values).map(([k, v]) => [k.toLowerCase(), v])));
    if (!file) {
      const nf = await readFile(join(PUBLIC, "404.html")).catch(() => Buffer.from("Not found"));
      res.writeHead(404, { ...headers, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(req.method === "HEAD" ? undefined : nf);
    }
    if (!headers["cache-control"]) headers["cache-control"] = file.type.startsWith("text/html") ? "public, max-age=0, must-revalidate" : "public, max-age=3600";
    res.writeHead(200, { ...headers, "content-type": file.type });
    res.end(req.method === "HEAD" ? undefined : await readFile(file.full));
  } catch (err) {
    console.error("request failed", req.method, req.url, err);
    if (!res.headersSent) res.writeHead(err.status || 500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.status === 413 ? "That's too big." : "Something went wrong" }));
  }
});
server.requestTimeout = 120000;
server.listen(PORT, "127.0.0.1", () => console.log(`website on http://127.0.0.1:${PORT} (${routes.length} routes, ${schedules.length} scheduled)`));

// ---------- schedules ("M H * * *" in UTC, which is all Netlify needed) ----------
for (const s of schedules) {
  const m = s.cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (!m) { console.error("schedule not understood, skipped:", s.name, s.cron); continue; }
  const [min, hour] = [Number(m[1]), Number(m[2])];
  const next = () => {
    const now = new Date(), t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, min));
    if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
    return t - now;
  };
  const run = async () => {
    console.log("scheduled run:", s.name);
    try { const r = await s.fn(new Request(`${CANONICAL}/.schedule`), { waitUntil: (p) => Promise.resolve(p).catch(() => {}) }); console.log("scheduled run done:", s.name, r?.status); }
    catch (e) { console.error("scheduled run failed:", s.name, e); }
    setTimeout(run, next());
  };
  setTimeout(run, next());
}
