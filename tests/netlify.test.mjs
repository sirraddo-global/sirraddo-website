// Checks for the Netlify setup: the adapter's headers, the 30-second-safe AI drafts, the old-uploads mover
// and the /files function. Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startHarness, ROOT } from "./harness.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

test("function replies carry security headers; private pages are never cached or indexed", async () => {
  const r = await fetch(h.base + "/preview?t=nope");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  const api = await fetch(h.base + "/api/requests?view=all", { headers: { authorization: "Bearer wrong" } });
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("x-content-type-options"), "nosniff");
});

test("every API handler has a Netlify function with its paths, plus the daily schedule", async () => {
  const want = { connect: "/connect", chat: "/api/chat", requests: "/api/requests", lead: "/api/lead", brief: "/api/brief", "brief-upload": "/api/brief-upload",
    doc: "/doc", preview: "/preview", pay: "/pay", "paystack-webhook": "/api/paystack-webhook", shop: "/api/shop", site: "/change", "cron-daily": "/api/cron-daily" };
  for (const [name, path] of Object.entries(want)) {
    const mod = await import(join(ROOT, "netlify/functions", name + ".mjs"));
    assert.equal(typeof mod.default, "function", name);
    assert.ok([].concat(mod.config.path).includes(path), `${name} serves ${path}`);
  }
  assert.equal((await import(join(ROOT, "netlify/functions/daily.mjs"))).config.schedule, "0 6 * * *");
  const toml = await readFile(join(ROOT, "netlify.toml"), "utf8");
  assert.match(toml, /publish = "public"/);
});

test("the scheduled daily run happens once a day even if it's started twice; a manual run always runs", async () => {
  const { runDaily } = await import("../api/_lib/automation.mjs");
  const day = new Date("2026-11-18T06:00:00Z");
  const [a, b] = await Promise.all([runDaily(day, { once: true }), runDaily(day, { once: true })]);
  assert.equal([a, b].filter((r) => r.skipped).length, 1);
  const manual = await h.call("GET", "/api/cron-daily", undefined, { authorization: "Bearer cronsecretcronsecret" });
  assert.equal(manual.status, 200);
  assert.equal(manual.json.skipped, undefined);
});

test("/files refuses path tricks", async () => {
  const files = (await import(join(ROOT, "netlify/functions/files.mjs"))).default;
  assert.equal((await files(new Request("https://x.test/files/a%2F..%2Fsecret"))).status, 404);
  assert.equal((await files(new Request("https://x.test/files/a.png", { method: "POST" }))).status, 405);
});

test("website text is written in parallel page groups, so it fits Netlify's 30 seconds", async () => {
  await h.call("POST", "/api/lead", { name: "Kemi", contact: "08031110000", business: "Kemi Foods", interest: "Business website" });
  const id = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.name === "Kemi").id;
  await h.sql(`UPDATE customer_requests SET brief = $1, brief_submitted_at = now() WHERE id = $2`,
    [JSON.stringify({ business_name: "Kemi Foods", pages: ["Home", "About us", "Menu", "Contact", "FAQ"] }), id]);
  let calls = 0; const prev = globalThis.fetch;
  globalThis.fetch = (u, o) => { if (String(u).includes("generativelanguage")) calls++; return prev(u, o); };
  try {
    const r = await h.action({ action: "write_draft", id });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  } finally { globalThis.fetch = prev; }
  assert.ok(calls >= 3, "5 pages → 3 page groups (+ Google profile) at once, got " + calls);
  const md = (await h.sql(`SELECT draft_md FROM customer_requests WHERE id = $1`, [id]))[0].draft_md;
  assert.match(md, /^# Website text: Kemi Foods/);
  assert.equal((md.match(/^# /gm) || []).length, 1, "only one title");
});

test("a wrong ANTHROPIC_API_KEY falls back to Gemini instead of failing", async () => {
  const prev = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "wrong";
  globalThis.fetch = (u, o) => String(u).includes("api.anthropic.com")
    ? Promise.resolve(new Response('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}', { status: 401 }))
    : prev(u, o);
  try {
    const r = await h.action({ action: "assistant", messages: [{ role: "user", content: "Which jobs need my attention today?" }] });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(r.json.reply);
  } finally { globalThis.fetch = prev; delete process.env.ANTHROPIC_API_KEY; }
});

test("Connect Paystack link: the owner pastes their own live key once", async () => {
  const id = (await h.action({ action: "create", name: "Kunle Shop", contact: "08037770000", interest: "Online Store", email: "kunle@gmail.com" })).json.id;
  const link = (await h.action({ action: "paystack_link", id })).json;
  assert.match(link.url, /\/connect\?t=[\w-]{20,}/);
  const path = "/connect?" + link.url.split("?")[1];
  const page = await h.call("GET", path);
  assert.equal(page.status, 200);
  assert.match(page.text, /Live Secret Key/);
  assert.match(page.text, /sk_test_/, "explains test keys");
  const post = (key) => fetch(h.base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "key=" + encodeURIComponent(key) });
  const testKey = ["sk", "test", "abcdefghijklmnopqrstuvwx1234"].join("_");
  let r = await post(testKey);
  assert.equal(r.status, 400);
  assert.match(await r.text(), /TEST key/);
  const liveKey = ["sk", "live", "abcdefghijklmnopqrstuvwx9876"].join("_");
  r = await post(liveKey);
  assert.equal(r.status, 200, await r.clone().text());
  const done = await r.text();
  assert.match(done, /connected/);
  assert.match(done, /test it yourself now with a small amount/, "owner is told to test with a small amount");
  const row = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((x) => x.id === id);
  assert.equal(row.shop.online, true);
  assert.equal(row.shop.keyEnd, "9876");
  assert.equal((await h.call("GET", path)).status, 404, "one-time link");
});

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("website chat: a visitor sends a photo with 📎 and the AI sees it", async () => {
  const up = await fetch(h.base + "/api/chat-upload?s=chat-photo-1&type=image/png&name=logo.png", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: PNG });
  assert.equal(up.status, 200);
  const { url } = await up.json();
  const bad = await fetch(h.base + "/api/chat-upload?s=chat-photo-1&type=text/html&name=x.html", { method: "POST", body: "<script>" });
  assert.equal(bad.status, 415, "only photos and PDFs");
  let sent = "";
  const prev = globalThis.fetch;
  globalThis.fetch = (u, o) => { if (String(u).includes("generativelanguage")) sent += o.body; return prev(u, o); };
  try {
    const r = await h.call("POST", "/api/chat", { sessionId: "chat-photo-1", messages: [{ role: "user", content: `[photo] ${url}\nI want a site that looks like this` }] });
    assert.equal(r.status, 200);
  } finally { globalThis.fetch = prev; }
  assert.match(sent, /inline_data/, "the picture went to the AI");
  assert.match(sent, new RegExp(PNG.toString("base64").slice(0, 20).replace(/[+/]/g, "\\$&")));
});

test("AI design reads screenshots you add of the look they like", async () => {
  const id = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.has_draft)?.id;
  assert.ok(id, "a job with website text");
  const add = await h.action({ action: "design_ref_add", id, name: "header.png", type: "image/png", data: PNG.toString("base64") });
  assert.equal(add.status, 200, JSON.stringify(add.json));
  assert.equal(add.json.design_refs.length, 1);
  let sent = "";
  const prev = globalThis.fetch;
  globalThis.fetch = (u, o) => { if (String(u).includes("generativelanguage")) sent += o.body; return prev(u, o); };
  try { await h.action({ action: "design", id }); } finally { globalThis.fetch = prev; }
  assert.match(sent, /inline_data/);
  assert.match(sent, /screenshot\(s\) of the look they like/);
  const rm = await h.action({ action: "design_ref_remove", id, url: add.json.design_refs[0].url });
  assert.equal(rm.json.design_refs.length, 0);
});

test("big store: up to 100 products, sections per category, photos matched by file name", async () => {
  const { buildSiteModel, productPhotoFor, renderPage } = await import("../api/_lib/sitegen.mjs");
  const products = Array.from({ length: 90 }, (_, i) => ({ name: `Item ${i + 1}`, price: String(1000 + i), category: ["Fabrics", "Groceries", "Accessories"][Math.floor(i / 30)] }));
  const row = { id: 9, name: "Demo", business: "Demo Market", interest: "Online Store", status: "won", brief: { business_name: "Demo Market", products, pages: ["Home", "Shop", "Contact"], whatsapp: "08031234567" },
    brief_files: { product_photos: [{ url: "https://x.test/files/a.jpg", name: "item-90.jpg", type: "image/jpeg" }, { url: "https://x.test/files/b.jpg", name: "IMG_001.jpg", type: "image/jpeg" }] },
    draft_md: "# Website text: Demo\n\n## Page: Home\n### Hero\n**Headline:** Hi\n\n## Page: Shop\n### Intro\n**Text:** All products\n\n## Page: Contact\n### Intro\n**Text:** Call us" };
  const site = buildSiteModel(row);
  assert.equal(site.products.length, 90, "all 90 kept");
  assert.equal(productPhotoFor(site, site.products[89]).name, "item-90.jpg", "matched by file name");
  assert.equal(productPhotoFor(site, site.products[0]).name, "IMG_001.jpg", "unnamed photos go in order");
  assert.equal(productPhotoFor(site, site.products[1]), null);
  // A photo chosen for a product in the form wins, and is no longer used for anything else.
  products[1].photo = "https://x.test/files/b.jpg";
  const site2 = buildSiteModel(row);
  assert.equal(productPhotoFor(site2, site2.products[1]).name, "IMG_001.jpg");
  assert.equal(productPhotoFor(site2, site2.products[0]), null);
  delete products[1].photo;
  const { cleanAnswers } = await import("../api/_lib/brief-schema.mjs");
  const kept = cleanAnswers("store", { products: [{ name: "Rice", price: "100", photo: "https://www.sirraddo.com.ng/files/x.jpg" }, { photo: "https://evil" }] });
  assert.deepEqual(kept.products, [{ name: "Rice", price: "100", category: "", details: "", photo: "https://www.sirraddo.com.ng/files/x.jpg" }], "photo kept; a row with only a photo dropped");
  const { SECTIONS } = await import("../api/_lib/brief-schema.mjs");
  assert.equal(SECTIONS.flatMap((s) => s.fields).find((f) => f.key === "products").max, 100);
  const shop = site.pages.find((p) => p.kind === "shop");
  const html = renderPage(site, shop.slug, { mode: "export", link: (s) => "/" + s });
  assert.match(html, /class="cat-nav"/);
  assert.match(html, /id="cat-groceries"/);
  assert.match(html, /Accessories <span>\(30\)/);
  assert.match(html, /Add to cart<\/button><span class="step" hidden>/, "add button + quantity stepper");
  assert.doesNotMatch(html, /basket</i);
  assert.doesNotMatch(html, /class="menu-btn"/, "3 pages: no phone menu button");
  const many = { ...site, pages: [...site.pages, ...["About us", "FAQ", "Gallery"].map((n) => ({ ...site.pages[2], name: n, slug: n.toLowerCase().replace(/ /g, "-") }))] };
  assert.match(renderPage(many, "index", { mode: "export", link: (s) => "/" + s }), /class="menu-btn"/, "6 pages: ☰ Menu on phones");
});
