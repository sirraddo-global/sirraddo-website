// Runs the api/*.mjs handlers (written in the Vercel/Node (req, res) style) as Netlify Functions.
// Netlify gives a web Request and wants a Response back; this turns one into the other, so the same
// handler code works on both hosts and in the tests.
const SECURITY = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};
// Private pages: never cached, never indexed, never leak their link to other sites.
const PRIVATE = /^\/(preview|pay|change|doc|brief|admin)(\/|$)/;

function parseBody(buf, type) {
  if (!buf.length) return undefined;
  if (/multipart|octet-stream|^image\/|^application\/pdf/i.test(type)) return undefined; // read as a stream
  const text = buf.toString("utf8");
  if (/json/i.test(type)) { try { return JSON.parse(text); } catch { return text; } }
  if (/x-www-form-urlencoded/i.test(type)) return Object.fromEntries(new URLSearchParams(text));
  try { return JSON.parse(text); } catch { return text; }
}

export function adapt(handler) {
  return async function netlifyFunction(request, context) {
    globalThis.__requestContext = context; // lets waitUntil() keep work going after the reply
    const url = new URL(request.url);
    const headers = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    // The visitor's real address from Netlify (a visitor can fake their own X-Forwarded-For; this can't be faked).
    const ip = context?.ip || headers["x-nf-client-connection-ip"];
    if (ip) headers["x-forwarded-for"] = ip;
    const buf = ["GET", "HEAD"].includes(request.method) ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());

    const req = {
      method: request.method,
      url: url.pathname + url.search,
      headers,
      query: Object.fromEntries(url.searchParams),
      body: parseBody(buf, headers["content-type"] || ""),
      async *[Symbol.asyncIterator]() { if (buf.length) yield buf; },
    };

    const out = new Headers();
    const chunks = [];
    const res = {
      statusCode: 200,
      headersSent: false,
      status(code) { this.statusCode = code; return this; },
      setHeader(k, v) {
        if (Array.isArray(v)) { out.delete(k); v.forEach((x) => out.append(k, String(x))); } else out.set(k, String(v));
        return this;
      },
      getHeader(k) { return out.get(k) ?? undefined; },
      removeHeader(k) { out.delete(k); },
      write(b) { if (b != null) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(b)); return true; },
      end(b) { this.write(b); this.headersSent = true; return this; },
      send(b) {
        if (b && typeof b === "object" && !Buffer.isBuffer(b) && !(b instanceof Uint8Array)) return this.json(b);
        if (typeof b === "string" && !out.has("content-type")) out.set("content-type", "text/html; charset=utf-8");
        return this.end(b);
      },
      json(o) { if (!out.has("content-type")) out.set("content-type", "application/json; charset=utf-8"); return this.end(JSON.stringify(o)); },
      redirect(a, b) { const [code, loc] = typeof a === "number" ? [a, b] : [307, a]; out.set("location", loc); return this.status(code).end(); },
    };

    try {
      await handler(req, res);
    } catch (err) {
      console.error("handler crashed", url.pathname, err);
      res.statusCode = 500; chunks.length = 0;
      out.set("content-type", "application/json"); chunks.push(Buffer.from(JSON.stringify({ error: "Something went wrong" })));
    }

    for (const [k, v] of Object.entries(SECURITY)) if (!out.has(k)) out.set(k, v);
    if (PRIVATE.test(url.pathname)) {
      if (!out.has("x-robots-tag")) out.set("x-robots-tag", "noindex, nofollow");
      if (!out.has("cache-control")) out.set("cache-control", "no-store");
      out.set("referrer-policy", "no-referrer");
    }
    const body = request.method === "HEAD" || [204, 304].includes(res.statusCode) ? null : Buffer.concat(chunks);
    return new Response(body, { status: res.statusCode, headers: out });
  };
}
