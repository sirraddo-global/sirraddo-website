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

test("FAQ opens and closes, stray 'Text:' labels go, Location shows a map, empty gallery uses product photos", async () => {
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const row = { id: 1, name: "D", business: "D", interest: "Online Store", status: "won",
    brief: { business_name: "D", pages: ["Home", "FAQ", "Gallery", "Location and map"], address: "Ibadan Nigeria", products: [{ name: "Rice", price: "100" }] },
    brief_files: { product_photos: [{ url: "https://x.test/files/r.jpg", name: "rice.jpg", type: "image/jpeg" }] },
    draft_md: "## Page: Home\n### Hero\n**Headline:** Hi\n\n## Page: FAQ\n### Questions\n#### What do you sell?\n Text: We sell rice.\n\n## Page: Gallery\n### Our work\n**Text:** Look\n\n## Page: Location and map\n### Find us\n**Text:** Here" };
  const site = buildSiteModel(row);
  const page = (slug) => renderPage(site, slug, { mode: "export", link: (s) => s });
  const faq = page(site.pages.find((p) => p.kind === "faq").slug);
  assert.match(faq, /<details class="faq"><summary>What do you sell\?<\/summary><p>We sell rice\.<\/p><\/details>/);
  assert.match(page(site.pages.find((p) => p.kind === "location").slug), /maps\.google\.com\/maps\?q=Ibadan%20Nigeria/);
  assert.match(page(site.pages.find((p) => p.kind === "gallery").slug), /x\.test\/files\/r\.jpg/);
});

test("email forwarding: an unconfirmed inbox gets a new confirmation; missing token permissions are explained", async () => {
  const { startForwarding } = await import("../api/_lib/cloudflare.mjs");
  const { CF } = await import("./cloudflare-mock.mjs");
  const before = CF.addresses.length;
  let r = await startForwarding("zone-x", "Owner@Gmail.com");
  assert.deepEqual(r, { verified: false, resent: false });
  r = await startForwarding("zone-x", "owner@gmail.com");
  assert.equal(r.resent, true, "unconfirmed: removed and added again so Cloudflare resends");
  assert.equal(CF.addresses.filter((a) => a.email.toLowerCase() === "owner@gmail.com").length, 1);
  CF.addresses.find((a) => a.email.toLowerCase() === "owner@gmail.com").verified = "2026-11-16";
  assert.equal((await startForwarding("zone-x", "owner@gmail.com")).verified, true);
  CF.denyEmail = true;
  await assert.rejects(startForwarding("zone-x", "x@gmail.com"), /Email Routing Addresses · Edit/);
  CF.denyEmail = false;
  assert.ok(CF.addresses.length >= before);
});

test("Manage my store: the owner changes a price, marks sold out, sets a notice; the site and checkout follow", async () => {
  const id = (await h.action({ action: "create", name: "Tola Store", contact: "08035550000", interest: "Online Store", email: "tola@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb WHERE id = $2`, [JSON.stringify({ business_name: "Tola Store", phone: "08035550000",
    products: [{ name: "Rice 5kg", price: "9500", category: "Food" }, { name: "Beans 5kg", price: "11000", category: "Food" }] }), id]);
  const link = (await h.action({ action: "manage_link", id })).json.url;
  const path = "/manage?" + link.split("?")[1];
  const page = await h.call("GET", path);
  assert.equal(page.status, 200);
  assert.match(page.text, /Rice 5kg/);
  const r = await fetch(h.base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ price_0: "9800", price_1: "11000", sold_1: "on", hours: "Mon–Sat 9am–6pm", phone: "08035550000", whatsapp: "", site_notice: "Closed Monday" }) });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Saved ✓/);
  const b = (await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]))[0].brief;
  assert.equal(b.products[0].price, "9800");
  assert.equal(b.products[1].soldout, true);
  assert.equal(b.site_notice, "Closed Monday");
  assert.equal(b.phone, "08035550000", "other answers kept");
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const site = buildSiteModel({ id, name: "Tola", interest: "Online Store", status: "won", brief: b, draft_md: "## Page: Shop\n### Intro\n**Text:** Hi" });
  const html = renderPage(site, site.pages.find((p) => p.kind === "shop").slug, { mode: "export", link: (s) => s });
  assert.match(html, /class="soldout">Sold out/);
  assert.match(html, /class="site-notice"[^>]*>Closed Monday/);
  const renewed = (await h.action({ action: "manage_link", id, renew: true })).json.url;
  assert.notEqual(renewed, link);
  assert.equal((await h.call("GET", path)).status, 404, "old link stops");
});

test("Reviews: a visitor gives stars; nothing shows until the owner chooses Show in Manage my store; then the site shows it", async () => {
  const id = (await h.action({ action: "create", name: "Bisi Shop", contact: "08036660000", interest: "Online Store", email: "bisi@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, hosting = $2::jsonb WHERE id = $3`, [JSON.stringify({ business_name: "Bisi Shop", phone: "08036660000", whatsapp: "08036660000",
    products: [{ name: "Garri 5kg", price: "6000" }] }), JSON.stringify({ statsKey: "bisikey1234567" }), id]);
  const post = (b, ip = "5.5.5.5") => h.call("POST", "/api/site?review=1", JSON.stringify({ k: "bisikey1234567", ...b }), { "content-type": "application/json", "x-forwarded-for": ip, "user-agent": "Mozilla/5.0" });
  assert.equal((await post({ stars: 9, name: "Ada" })).status, 400, "stars 1–5 only");
  assert.equal((await post({ stars: 5, name: "Ada", text: "visit www.spam.com" })).status, 400, "no links");
  assert.equal((await post({ stars: 5, name: "Ada", text: "x", k: "wrongkey12345" })).status, 400);
  const n = h.sent.length;
  const ok = await post({ stars: 5, name: "Ada Obi", text: "Fast delivery & <b>great</b> garri" });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(h.newMail(n).some((m) => m.to.includes("bisi@gmail.com") && /5-star review/.test(m.subject) && /Manage my store/.test(m.html)), "owner emailed with the link");
  assert.equal((await post({ stars: 4, name: "Bot", website: "http://x" })).status, 200, "robots get a quiet OK");
  for (let i = 0; i < 3; i++) await post({ stars: 1, name: "Same person" }, "6.6.6.6");
  assert.equal((await post({ stars: 1, name: "Same person" }, "6.6.6.6")).status, 400, "3 a day per person");
  const { shownReviews } = await import("../api/_lib/reviews.mjs");
  assert.equal((await shownReviews(id)).count, 0, "waits for the owner");
  const link = (await h.action({ action: "manage_link", id })).json.url;
  const path = "/manage?" + link.split("?")[1];
  const page = await h.call("GET", path);
  assert.match(page.text, /Ada Obi/);
  assert.match(page.text, /4 new/);
  const rv = (await h.sql(`SELECT id, name FROM site_reviews WHERE request_id = $1 ORDER BY id`, [id]));
  const ada = rv.find((x) => x.name === "Ada Obi").id, spam = rv.find((x) => x.name === "Same person").id;
  const r = await fetch(h.base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ price_0: "6000", phone: "08036660000", [`rv_${ada}`]: "shown", [`rv_${spam}`]: "hidden" }) });
  assert.match(await r.text(), /Saved ✓/);
  const shown = await shownReviews(id);
  assert.equal(shown.count, 1);
  assert.equal(shown.average, 5);
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const site = buildSiteModel({ id, name: "Bisi", interest: "Online Store", status: "won", brief: (await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]))[0].brief,
    hosting: { statsKey: "bisikey1234567" }, reviews: shown, draft_md: "## Page: Home\n### Hero\n**Headline:** Hi" });
  const html = renderPage(site, site.pages[0].slug, { mode: "export", link: (s) => s });
  assert.match(html, /What customers say/);
  assert.match(html, /5\.0<\/b> out of 5 from 1 review/);
  assert.match(html, /Fast delivery &amp; &lt;b&gt;great/, "review text escaped");
  assert.doesNotMatch(html, /Same person/);
  assert.match(html, /class="rv-form/, "the form is there to write another");
  // From admin: hide, then delete for good.
  const ar = (await h.action({ action: "site_reviews", id })).json.reviews;
  assert.ok(ar.length >= 2);
  const hid = await h.action({ action: "site_review_set", id, reviewId: ada, status: "hidden" });
  assert.equal(hid.json.reviews.find((x) => x.id === ada).status, "hidden");
  const del = await h.action({ action: "site_review_set", id, reviewId: ada, status: "delete" });
  assert.ok(!del.json.reviews.some((x) => x.id === ada), "deleted");
});

test("Reviews of SIRRADDO: sent from our website, approved in admin, then listed for the Websites page", async () => {
  const n = h.sent.length;
  const ok = await h.call("POST", "/api/site?review=1", JSON.stringify({ k: "sirraddo", stars: 5, name: "Ada, Ada's Kitchen", text: "Our website was ready in a week." }), { "content-type": "application/json", "x-forwarded-for": "9.9.9.9", "user-agent": "Mozilla/5.0" });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(h.newMail(n).some((m) => /review for SIRRADDO/.test(m.subject)), "you get an email");
  let pub = await h.call("GET", "/api/site?reviews=sirraddo");
  assert.equal(pub.json.count, 0, "nothing shows before approval");
  const list = (await h.action({ action: "reviews" })).json.reviews;
  assert.equal(list[0].status, "pending");
  const after = (await h.action({ action: "review_set", reviewId: list[0].id, status: "shown" })).json.reviews;
  assert.equal(after[0].status, "shown");
  pub = await h.call("GET", "/api/site?reviews=sirraddo");
  assert.equal(pub.json.count, 1);
  assert.equal(pub.json.list[0].name, "Ada, Ada's Kitchen");
  const html = await readFile(join(ROOT, "public/websites.html"), "utf8");
  assert.match(html, /id="reviews"/);
  assert.match(html, /\/assets\/reviews\.js\?v=/);
});

test("Email: different inboxes per address; changed inbox updated, dropped address removed; store buyers reply to the business address", async () => {
  const { CF } = h;
  const id = (await h.action({ action: "create", name: "Femi Store", contact: "08037770000", interest: "Online Store", email: "femi@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET hosting = $1::jsonb WHERE id = $2`, [JSON.stringify({ zoneId: "zone-femi", domain: "femistore.com.ng", zoneStatus: "active" }), id]);
  const bad = await h.action({ action: "host_email", id, locals: "info, sales", to: "femi@gmail.com", routes: "receipts not-an-email" });
  assert.equal(bad.status, 400);
  const r1 = await h.action({ action: "host_email", id, locals: "info, sales", to: "femi@gmail.com", routes: "receipts acct@gmail.com" });
  assert.equal(r1.status, 200, r1.text);
  let em = r1.json.row.hosting.email;
  assert.deepEqual(em.locals, ["info", "sales", "receipts"], "a routed name is added to the list");
  assert.equal(em.routes.receipts, "acct@gmail.com");
  assert.equal(em.status, "verifying");
  assert.ok(CF.addresses.some((a) => a.email === "femi@gmail.com") && CF.addresses.some((a) => a.email === "acct@gmail.com"), "both inboxes get a confirmation");
  CF.addresses.filter((a) => a.email === "femi@gmail.com").forEach((a) => (a.verified = "2026-11-17"));
  em = (await h.action({ action: "host_check", id })).json.row.hosting.email;
  assert.equal(em.status, "verifying", "waits for every inbox");
  CF.addresses.filter((a) => a.email === "acct@gmail.com").forEach((a) => (a.verified = "2026-11-17"));
  em = (await h.action({ action: "host_check", id })).json.row.hosting.email;
  assert.equal(em.status, "active");
  const rules = () => CF.rules.filter((r) => r.zone === "zone-femi").map((r) => r.matchers[0].value + ">" + r.actions[0].value[0]).sort();
  assert.deepEqual(rules(), ["info@femistore.com.ng>femi@gmail.com", "receipts@femistore.com.ng>acct@gmail.com", "sales@femistore.com.ng>femi@gmail.com"]);
  // Move sales to the accountant too, drop info.
  await h.action({ action: "host_email", id, locals: "sales, receipts", to: "femi@gmail.com", routes: "sales acct@gmail.com\nreceipts acct@gmail.com" });
  assert.deepEqual(rules(), ["receipts@femistore.com.ng>acct@gmail.com", "sales@femistore.com.ng>acct@gmail.com"]);
  const row = await h.row(id);
  assert.match(row.handover.notes || "", /arrive in/);
  const { storeReplyTo } = await import("../api/_lib/shop.mjs");
  assert.equal(storeReplyTo(row), "sales@femistore.com.ng");
  assert.equal(storeReplyTo({ hosting: {} }), "");
});

test("Email usage: every send is counted by type, refusals recorded, and admin sees it", async () => {
  const { sendCustomerEmail, sendEmail, emailUsage, emailKind } = await import("../api/_lib/store.mjs");
  const before = (await emailUsage(2)).today.sent;
  await sendCustomerEmail("someone@gmail.com", "Your invoice INV-1", "<p>x</p>");
  await sendEmail("New request from Ada", "<p>x</p>");
  const u = (await h.action({ action: "email_usage" })).json.usage;
  assert.ok(u.today.sent >= before + 2);
  assert.ok(u.today.byKind.some((k) => k.kind === "Invoices & receipts"));
  assert.equal(u.limits.day, 100);
  assert.equal(u.days.length, 14);
  assert.equal(emailKind("New order ₦5,000 from Bisi", false), "Store order alerts");
  globalThis.__RESEND_429__ = true;
  await assert.rejects(sendCustomerEmail("someone@gmail.com", "Your invoice INV-2", "<p>x</p>"), /Resend 429/);
  globalThis.__RESEND_429__ = false;
  const ur = (await h.action({ action: "email_usage" })).json;
  const kept = ur.refused.find((m) => m.subject === "Your invoice INV-2");
  assert.ok(kept, "the refused email is kept");
  assert.equal(ur.usage.refusedWaiting >= 1, true);
  const n3 = h.sent.length;
  const again = await h.action({ action: "email_resend", emailId: kept.id });
  assert.equal(again.json.result.sent, 1);
  assert.ok(h.newMail(n3).some((m) => m.subject === "Your invoice INV-2" && m.to.includes("someone@gmail.com")), "sent again to the same person");
  assert.ok(!again.json.refused.some((m) => m.id === kept.id));
  const u2 = (await h.action({ action: "email_usage" })).json.usage;
  assert.equal(u2.blocked.why, "daily_quota_exceeded");
  assert.ok(u2.today.failed >= 1);
  assert.ok(u2.today.resend >= 1, "Resend's own count is kept");
  const all = await h.admin("GET", "/api/requests?view=all");
  assert.ok(all.json.email_usage && all.json.email_usage.today.sent >= 2, "dashboard gets the counts");
});

test("Manage my website: non-store sites get the same private link (hours, numbers, slogan, notice, reviews)", async () => {
  const id = (await h.action({ action: "create", name: "Tayo Salon", contact: "08035550000", interest: "Business website", email: "tayo@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, website_url = 'https://tayosalon.com.ng' WHERE id = $2`, [JSON.stringify({ business_name: "Tayo Salon", phone: "08035550000" }), id]);
  const link = (await h.action({ action: "manage_link", id })).json.url;
  const page = await h.call("GET", "/manage?" + link.split("?")[1]);
  assert.match(page.text, /<h1>Manage my website<\/h1>/);
  assert.doesNotMatch(page.text, /mark items sold out/);
  assert.match(page.text, /Customer reviews/);
  const { addHandoverExtras } = await import("../api/_lib/handover.mjs");
  const r = await h.row(id);
  await addHandoverExtras(r);
  assert.match(r.manage_link || "", /\/manage\?t=/, "live non-store sites get the link in the handover pack");
  // Website improvements: choose "Ask me first"; a waiting new version is shown with its notes.
  await h.sql(`UPDATE customer_requests SET hosting = '{"publishedAt":"2026-11-01T00:00:00Z","look":"old"}'::jsonb WHERE id = $1`, [id]);
  const path = "/manage?" + link.split("?")[1];
  const p2 = await h.call("GET", path);
  assert.match(p2.text, /Website improvements/);
  assert.match(p2.text, /A new version of your website is ready/);
  const saved = await fetch(h.base + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ phone: "08035550000", look_mode: "ask" }) });
  assert.match(await saved.text(), /Saved ✓/);
  assert.equal((await h.row(id)).hosting.lookMode, "ask");
});
