// Test harness: runs every API handler in-process against an in-memory Postgres (PGlite), with fake
// Resend, Gemini, Paystack, Cloudflare and Blob. Nothing leaves the machine. Used by tests/*.test.mjs.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { CF, cfFetch } from "./cloudflare-mock.mjs";
import { adapt } from "../netlify/lib/adapter.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ADMIN = "testpassword123";
export const CRON = "cronsecretcronsecret";
export const PAYSTACK_KEY = "sk_test_abc123";

export async function startHarness() {
  const db = new PGlite();
  globalThis.__TEST_DB__ = { query: (t, p) => db.query(t, p) };
  Object.assign(process.env, {
    GEMINI_API_KEY: "g", RESEND_API_KEY: "r", LEAD_EMAIL_TO: "me@x.com", ADMIN_PASSWORD: ADMIN, CRON_SECRET: CRON,
    PAYSTACK_SECRET_KEY: PAYSTACK_KEY, CLOUDFLARE_API_TOKEN: "cftoken", CLOUDFLARE_ACCOUNT_ID: "acct1",
    LEAD_EMAIL_FROM: "SIRRADDO <receipts@sirraddo.test>", BLOB_READ_WRITE_TOKEN: "blob",
  });
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DATABASE_URL;

  const server = http.createServer();
  await new Promise((r) => server.listen(0, "localhost", r));
  const base = `http://localhost:${server.address().port}`;

  const sent = [], paystack = {}, paystackCalls = [], blobs = new Map();
  globalThis.__TEST_BLOB__ = { put: async (path, body, o) => { const id = String(blobs.size + 1); blobs.set(id, { body, type: o.contentType }); return { url: `${base}/__blob/${id}` }; } };

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.startsWith(base)) return realFetch(url, opts);
    if (url.includes("api.cloudflare.com")) return cfFetch(url, opts);
    if (url.includes("resend.com")) { if (globalThis.__RESEND_429__) return new Response('{"name":"daily_quota_exceeded","message":"You have reached your daily email quota"}', { status: 429 }); sent.push(JSON.parse(opts.body)); return new Response("{}", { status: 200, headers: { "x-resend-daily-quota": String(sent.length), "x-resend-monthly-quota": String(sent.length) } }); }
    if (url.includes("api.paystack.co")) return paystackFake(url, opts);
    if (url.includes("api.flutterwave.com")) return flwFake(url, opts);
    if (url.includes("oauth2.googleapis.com/tokeninfo")) {
      const t = decodeURIComponent(url.split("id_token=")[1] || "");
      if (!t.startsWith("good-")) return new Response(JSON.stringify({ error: "invalid_token" }), { status: 400 });
      return new Response(JSON.stringify({ aud: process.env.GOOGLE_SIGNIN_CLIENT_ID, sub: t.slice(5), iss: "https://accounts.google.com", exp: String(Math.floor(Date.now() / 1000) + 600), email: t.slice(5) + "@gmail.com", email_verified: "true", name: "Google Buyer" }), { status: 200 });
    }
    if (url.includes("console.neon.tech")) {
      const j = (o) => new Response(JSON.stringify(o), { status: 200 });
      if (url.includes("/projects?")) return j({ projects: [{ id: "proj-test" }] });
      if (url.includes("/projects/proj-test")) return j({ project: { id: "proj-test", compute_time_seconds: globalThis.__NEON_CU_SECONDS__ ?? 3600 * 20, active_time_seconds: 3600 * 80, synthetic_storage_size: 120e6, consumption_period_start: "2026-11-01T00:00:00Z" } });
      return new Response("{}", { status: 404 });
    }
    if (url.includes("generativelanguage")) return geminiFake(JSON.parse(opts.body));
    // The backup AI (any OpenAI-compatible service).
    if (url.endsWith("/chat/completions")) {
      const body = JSON.parse(opts.body); globalThis.__LAST_BACKUP__ = { url, body, auth: opts.headers?.Authorization };
      if (globalThis.__BACKUP_FAIL__) return new Response('{"error":{"message":"Invalid API key"}}', { status: 401 });
      const last = body.messages[body.messages.length - 1];
      const text = typeof last.content === "string" ? last.content : (last.content || []).map((p) => p.text || "").join(" ");
      const msg = last.role === "tool" ? { role: "assistant", content: "Backup: saved, the team will reach out." }
        : body.tools && /save/i.test(text) ? { role: "assistant", content: null, tool_calls: [{ id: "tc1", type: "function", function: { name: "save_customer_request", arguments: JSON.stringify({ name: "Ngozi Eze", contact: "08039998888", business: "Ngozi Foods", interest: "Online Store", details: "Food store", recommended: "Online Store" }) } }] }
        : /PRODUCT LISTING FROM A PHOTO/.test(text) ? { role: "assistant", content: '{"name":"Blue Sneakers","category":"Shoes","details":"Comfortable blue sneakers."}' }
        : { role: "assistant", content: "Backup here: the Starter package is ₦50,000." };
      return new Response(JSON.stringify({ choices: [{ message: msg }] }), { status: 200 });
    }
    if (url.includes("oauth2.googleapis.com") || url.includes("www.googleapis.com")) return googleFake(url, opts);
    throw new Error("Test tried to reach the internet: " + url);
  };
  // Google Search Console / Site Verification (submitting customer sites to Google).
  const google = { calls: [], verifyFails: 0 };
  globalThis.__GOOGLE__ = google;
  function googleFake(url, opts) {
    const m = opts.method || "GET", body = opts.body && typeof opts.body === "string" && opts.body.startsWith("{") ? JSON.parse(opts.body) : null;
    google.calls.push(m + " " + url.replace("https://www.googleapis.com", ""));
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url.includes("oauth2.googleapis.com/token")) return json({ access_token: "gtok", expires_in: 3600 });
    if (url.includes("/siteVerification/v1/token")) return json({ method: "DNS_TXT", token: "google-site-verification=abc123" });
    if (url.includes("/siteVerification/v1/webResource?")) {
      if (google.verifyFails > 0) { google.verifyFails--; return json({ error: { message: "Verification failed: TXT record not found" } }, 400); }
      return json({ id: "dns%3A%2F%2F" + body.site.identifier, site: body.site, owners: ["sa@test.iam.gserviceaccount.com"] });
    }
    if (url.includes("/siteVerification/v1/webResource/")) return json({ id: "x", owners: body.owners });
    if (url.includes("/webmasters/v3/sites/")) return new Response("", { status: 200 });
    return json({ error: { message: "unknown" } }, 404);
  }
  const flw = {};
  globalThis.__FLW__ = flw;
  function flwFake(url, opts) {
    const auth = String(opts.headers?.Authorization || "");
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
    if (auth.includes("BAD")) return json({ status: "error", message: "Invalid authorization key" }, 401);
    if (url.includes("/balances/NGN")) return json({ status: "success", data: { currency: "NGN", available_balance: 0 } });
    if (url.endsWith("/payments")) { const b = JSON.parse(opts.body); flw[b.tx_ref] = { tx_ref: b.tx_ref, amount: b.amount, currency: "NGN", status: globalThis.__FLW_STATUS__ || "successful" }; return json({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/" + b.tx_ref } }); }
    const ref = decodeURIComponent((url.split("tx_ref=")[1] || ""));
    return flw[ref] ? json({ status: "success", data: flw[ref] }) : json({ status: "error", message: "No transaction was found" }, 404);
  }
  function paystackFake(url, opts) {
    const auth = String(opts.headers?.Authorization || "");
    paystackCalls.push({ url, auth });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
    if (auth.includes("BAD")) return json({ status: false, message: "Invalid key" }, 401);
    if (url.includes("/transaction?perPage")) return json({ status: true, data: [] });
    if (url.includes("/transaction/initialize")) {
      const b = JSON.parse(opts.body);
      paystack[b.reference] = { reference: b.reference, amount: b.amount, currency: "NGN", status: "success", paid_at: new Date().toISOString(), metadata: b.metadata, customer: { email: b.email } };
      return json({ status: true, data: { authorization_url: "https://checkout.paystack.com/x?ref=" + b.reference, reference: b.reference } });
    }
    const ref = decodeURIComponent(url.split("/verify/")[1] || "");
    return paystack[ref] ? json({ status: true, data: paystack[ref] }) : json({ status: false, message: "Transaction reference not found" }, 400);
  }
  function geminiFake(body) {
    globalThis.__LAST_AI_SYSTEM__ = JSON.stringify(body.systemInstruction || body.system_instruction || '');
    const reply = (parts) => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }] }), { status: 200 });
    if (!body.tools) {
      const parts0 = body.contents[0].parts;
      const p = parts0[parts0.length - 1].text;
      globalThis.__LAST_AI_PARTS__ = parts0;
      if (p.includes("short vertical video ad")) { globalThis.__LAST_AI_PROMPT__ = p; return reply([{ text: '```json\n{"hook":{"title":"Your shop never close","sub":"Sell online any time"},"scenes":[{"type":"points","title":"Your own store","points":["Photos and prices","Pay online","Orders on WhatsApp","x","y"]},{"type":"price","label":"Online Store","price":"from ₦150,000","points":["Live in 7 days"]},{"type":"bogus"}],"end":"Start today","tag":"Shop Never Close!","caption":"Sell any time 🛒 #Ibadan"}\n```' }]); }
      if (p.includes("PRODUCT LISTING FROM A PHOTO")) { globalThis.__LAST_AI_PROMPT__ = p; return reply([{ text: '```json\n{"name":"Red Ankara Gown","category":"Fashion","details":"A flowing red Ankara gown with a fitted waist. Lovely for weddings and Sunday service."}\n```' }]); }
      if (p.includes("social media captions")) { globalThis.__LAST_AI_PROMPT__ = p; return reply([{ text: '["Caption one https://x", "Caption two", "Caption three"]' }]); }
      if (p.includes("CHANGE REQUEST FROM THE OWNER")) { globalThis.__LAST_AI_PROMPT__ = p; return reply([{ text: globalThis.__AI_CHANGE_REPLY__ || '{"understood":"nothing","ops":[],"not_done":[]}' }]); }
      if (p.includes("Write the CSS that gives")) return reply([{ text: "```css\n/* fonts: Playfair Display, Inter */\nbody{font-family:Inter,sans-serif;background:#FBF7F2}\nh1,h2,h3{font-family:'Playfair Display',serif;letter-spacing:-.5px}\n.top{background:#2B0F3A;border-bottom:3px solid #C9971C}\n.hero{background:radial-gradient(circle at 80% 20%,#5B2A86,#2B0F3A 70%);padding:72px 0}\n.hero h1{font-size:clamp(2.2rem,8vw,3.6rem)}\n.card{border:0;box-shadow:0 10px 30px rgba(43,15,58,.12);border-top:4px solid #C9971C}\n.btn{border-radius:999px;padding:14px 26px}\nsection.block:nth-of-type(even){background:#F3ECF7}\n.bad{background:url(https://evil.example/x.png)} </style><script>alert(1)</script>\n@import url(https://evil.example/a.css);\n.cta{background:linear-gradient(90deg,#C9971C,#E8B600)}\n```" }]);
      return reply([{ text: "# Website text: Ada Salon\n## Page: Home\n**SEO title:** Ada Salon | Hair salon in Bodija, Ibadan\n**Meta description:** Braids and wigs in Bodija.\n### Hero\nBeautiful hair, done right\nBraids and wigs in Bodija.\nBook on WhatsApp\n### Our services\n- Braids\n- Wigs\n## Page: About us\n**SEO title:** About Ada Salon\n**Meta description:** Our story.\n### Our story\nAda Salon has served Bodija since 2015.\n## Google Business Profile description\nAda Salon is a hair salon in Bodija, Ibadan." }]);
    }
    const last = body.contents[body.contents.length - 1];
    if (last.parts[0].functionResponse) return reply([{ text: "Done, the team will reach out." }]);
    const t = last.parts[0].text.toLowerCase();
    if (t.includes("fail")) return new Response("busy", { status: 503 });
    if (t.includes("save")) return reply([{ functionCall: { name: "save_customer_request", args: { name: "Bola Ade", contact: "08031234567", business: "Bola Bakery", interest: "Business website", details: "Bakery site with Google Maps", recommended: "Business: wants Google Maps", ideas: { business_name: "Bola Bakery", what_they_do: "Fresh bread", location: "Bodija, Ibadan", junk: "x" } } } }]);
    return reply([{ text: "The Starter package is ₦50,000." }]);
  }

  const handlers = {};
  for (const [path, file] of Object.entries({
    "/api/chat": "chat", "/api/requests": "requests", "/api/cron-daily": "cron-daily", "/api/lead": "lead", "/api/brief": "brief",
    "/api/brief-upload": "brief-upload", "/doc": "doc", "/preview": "preview", "/api/preview": "preview", "/change": "site", "/api/site": "site",
    "/pay": "pay", "/api/pay": "pay", "/api/paystack-webhook": "paystack-webhook", "/api/shop": "shop", "/connect": "connect", "/manage": "manage", "/api/mystore": "mystore", "/api/chat-upload": "chat-upload", "/api/agent": "agent", "/demo": "demo",
  })) handlers[path] = (await import(join(ROOT, "api", file + ".mjs"))).default;

  // Every API call goes through the same Netlify adapter the live site uses (netlify/lib/adapter.mjs).
  for (const k of Object.keys(handlers)) handlers[k] = adapt(handlers[k]);
  const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".xml": "application/xml", ".txt": "text/plain", ".svg": "image/svg+xml", ".mp4": "video/mp4" };
  server.on("request", async (req, res) => {
    const u = new URL(req.url, base);
    if (u.pathname.startsWith("/__blob/")) { const b = blobs.get(u.pathname.slice(8)); res.setHeader("content-type", b.type); return res.end(b.body); }
    const h = handlers[u.pathname] || (u.pathname.startsWith("/demo/") ? handlers["/demo"] : null);
    if (h) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const request = new Request(u, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const waits = [];
      const r = await h(request, { ip: String(req.headers["x-forwarded-for"] || "127.0.0.1").split(",")[0].trim(), waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})) });
      res.statusCode = r.status;
      r.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(Buffer.from(await r.arrayBuffer()));
      await Promise.all(waits);
      return;
    }
    let p = u.pathname === "/" ? "/index.html" : u.pathname;
    if (!extname(p)) p += ".html";
    try { const data = await readFile(join(ROOT, "public", p)); res.setHeader("content-type", TYPES[extname(p)] || "application/octet-stream"); res.end(data); }
    catch { res.statusCode = 404; res.end("not found"); }
  });

  async function call(method, path, body, headers = {}) {
    const isBuf = body instanceof Uint8Array || typeof body === "string";
    const r = await realFetch(base + path, { method, headers: { ...(body !== undefined && !isBuf ? { "content-type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : isBuf ? body : JSON.stringify(body), redirect: "manual" });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  }
  const auth = { authorization: "Bearer " + ADMIN };
  const admin = async (method, path, body) => (await call(method, path, body, auth));
  const action = async (body) => (await admin("POST", "/api/requests", body));
  const row = async (id) => (await admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.id === id);
  const sql = async (q, p) => (await db.query(q, p)).rows;
  const daily = async () => (await call("GET", "/api/cron-daily", undefined, { authorization: "Bearer " + CRON })).json;

  return {
    base, db, sql, call, admin, action, row, daily, sent, paystack, paystackCalls, CF,
    newMail: (from) => sent.slice(from),
    async close() { globalThis.fetch = realFetch; await new Promise((r) => server.close(r)); await db.close(); },
  };
}
