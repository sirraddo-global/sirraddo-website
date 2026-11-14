// End-to-end checks of the business flows: leads, chat, payments, preview, go-live, store, changes, reports.
// Run with: npm test   (needs `npm install` once; nothing here touches real services)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startHarness, PAYSTACK_KEY } from "./harness.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

const refFrom = (url) => new URL(url).searchParams.get("ref");
const signed = (obj) => {
  const body = JSON.stringify(obj);
  return [body, { "content-type": "application/json", "x-paystack-signature": createHmac("sha512", PAYSTACK_KEY).update(body).digest("hex") }];
};

test("public pages are served and admin needs the password", async () => {
  for (const p of ["/", "/websites", "/terms", "/privacy", "/brief", "/admin"]) assert.equal((await h.call("GET", p)).status, 200, p);
  assert.equal((await h.call("GET", "/api/requests?view=all", undefined, { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await h.admin("GET", "/api/requests?view=all")).status, 200);
});

test("a website lead is saved and emailed; bots and bad numbers are not", async () => {
  const n = h.sent.length;
  const ok = await h.call("POST", "/api/lead", { name: "Ada Obi", contact: "0803 111 2222", business: "Ada Salon", interest: "Starter website" });
  assert.equal(ok.status, 200);
  const rows = (await h.admin("GET", "/api/requests?view=all")).json.requests;
  assert.ok(rows.some((r) => r.name === "Ada Obi" && r.interest === "Starter website"));
  assert.ok(h.newMail(n).some((m) => /Ada/.test(m.subject)));
  assert.equal((await h.call("POST", "/api/lead", { name: "Bot", contact: "08011112222", website: "http://spam" })).status, 200);
  assert.ok(!(await h.admin("GET", "/api/requests?view=all")).json.requests.some((r) => r.name === "Bot"));
  assert.equal((await h.call("POST", "/api/lead", { name: "X Y", contact: "123" })).status, 400);
});

test("the chat assistant saves the customer's request with their ideas and suggested package", async () => {
  const r = await h.call("POST", "/api/chat", { sessionId: "s-test-chat-0001", messages: [{ role: "user", content: "please save my details" }] });
  assert.equal(r.status, 200, r.text);
  const row = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((x) => x.name === "Bola Ade");
  assert.ok(row, "chat request saved");
  assert.equal(row.chat_ideas.business_name, "Bola Bakery");
  assert.ok(!("junk" in row.chat_ideas), "unknown idea fields are dropped");
  assert.match(row.chat_ideas.recommended || "", /Business/);
});

test("Paystack: deposit, webhook (signed, once only), balance, renewal", async () => {
  const id = (await h.action({ action: "create", name: "Tola Bello", contact: "08035551111", interest: "Starter website" })).json.id;
  await h.admin("PATCH", "/api/requests", { id, quote_amount: 50000 });
  const t = (await h.action({ action: "doc_link", id })).json.doc_token;
  const page = await h.call("GET", `/pay?t=${t}`);
  assert.match(page.text, /₦35,000/, "70% deposit due first");
  assert.equal((await h.call("POST", "/api/pay", { t, email: "bad" })).status, 400);
  const start = await h.call("POST", "/api/pay", { t, email: "tola@example.com", for: "deposit" });
  const ref = refFrom(start.json.url);
  // Unsigned or forged: only a payment Paystack itself confirms is recorded.
  await h.call("POST", "/api/paystack-webhook", JSON.stringify({ event: "charge.success", data: { reference: `SGL${id}-DEP-forged` } }), { "content-type": "application/json", "x-paystack-signature": "nope" });
  assert.equal((await h.row(id)).payments.length, 0, "forged webhook ignored");
  const [body, headers] = signed({ event: "charge.success", data: { reference: ref } });
  assert.equal((await h.call("POST", "/api/paystack-webhook", body, headers)).status, 200);
  await h.call("POST", "/api/paystack-webhook", body, headers);
  let r = await h.row(id);
  assert.equal(r.payments.length, 1, "same payment is recorded once");
  assert.equal(r.payments[0].amount, 35000);
  assert.equal(r.status, "won");
  assert.ok(r.brief_token, "project form link created after the deposit");

  const bal = await h.call("POST", "/api/pay", { t, email: "tola@example.com" });
  const [b2, h2] = signed({ event: "charge.success", data: { reference: refFrom(bal.json.url) } });
  await h.call("POST", "/api/paystack-webhook", b2, h2);
  assert.match((await h.call("GET", `/pay?t=${t}`)).text, /Nothing to pay/);

  await h.admin("PATCH", "/api/requests", { id, project_stage: "live", renewal_due: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) });
  r = await h.row(id);
  const ren = await h.call("POST", "/api/pay", { t, email: "tola@example.com", for: "renewal" });
  assert.equal(ren.status, 200, ren.text);
  assert.match((await h.call("GET", `/pay?t=${t}&reference=${refFrom(ren.json.url)}`)).text, /Payment received/);
  const after1 = await h.row(id);
  assert.ok(after1.renewal_due > r.renewal_due, "renewal date moves on a year");
});

let ada; // the salon used for preview, go-live, changes and reports
test("project form → AI website text → preview → customer picks a design and approves", async () => {
  ada = (await h.action({ action: "create", name: "Ada Obi", contact: "08031112222", interest: "Business website", email: "ada@gmail.com" })).json.id;
  await h.admin("PATCH", "/api/requests", { id: ada, quote_amount: 100000, payments: [{ amount: 70000, date: "2026-11-01", note: "deposit" }], status: "won" });
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, brief_submitted_at = now() WHERE id = $2`, [JSON.stringify({ business_name: "Ada Salon", what_you_do: "Braids and wigs", location: "Bodija, Ibadan", whatsapp: "08031112222" }), ada]);
  const w = await h.action({ action: "write_draft", id: ada });
  assert.equal(w.status, 200, w.text);
  assert.match((await h.sql(`SELECT draft_md FROM customer_requests WHERE id = $1`, [ada]))[0].draft_md, /Ada Salon/);

  const d = await h.action({ action: "design", id: ada });
  assert.equal(d.status, 200, d.text);
  const css = (await h.sql(`SELECT design_css FROM customer_requests WHERE id = $1`, [ada]))[0].design_css;
  assert.ok(!/evil\.example|<script|<\/style/i.test(css), "AI CSS is cleaned");

  let opts = await h.action({ action: "design_option", id: ada, op: "add_dark" });
  assert.equal(opts.status, 200, opts.text);
  assert.equal((await h.action({ action: "design_option", id: ada, op: "add_dark" })).json.error, "The dark design is already an option");

  const token = (await h.action({ action: "preview_link", id: ada })).json.preview_token;
  const pv = await h.call("GET", `/preview?t=${token}`);
  assert.equal(pv.status, 200);
  assert.match(pv.text, /noindex/);
  const row = await h.row(ada);
  const dark = row.design_choices.find((c) => c.by === "Dark");
  const n = h.sent.length;
  const ap = await h.call("POST", "/api/preview", { t: token, action: "approved", option: dark.id });
  assert.equal(ap.status, 200, ap.text);
  const css2 = (await h.sql(`SELECT design_css, preview_status FROM customer_requests WHERE id = $1`, [ada]))[0];
  assert.equal(css2.preview_status, "approved");
  assert.match(css2.design_css, /Dark design/, "the chosen design becomes the site's design");
  assert.ok(h.newMail(n).some((m) => /approved/.test(m.subject)), "owner told");
  assert.ok(h.newMail(n).some((m) => m.to.includes("ada@gmail.com") && /balance|invoice/i.test(m.subject + m.html)), "balance invoice sent");
});

test("go-live: publish to Cloudflare; domain only attached once the balance is paid", async () => {
  assert.match((await h.action({ action: "host_domain", id: ada, domain: "not a domain" })).json.error || "", /domain/i);
  const dom = await h.action({ action: "host_domain", id: ada, domain: "https://www.AdaSalon.com.ng/" });
  assert.equal(dom.json.row.hosting.domain, "adasalon.com.ng");
  const pub = await h.action({ action: "host_publish", id: ada, force: true });
  assert.equal(pub.status, 200, pub.text);
  const files = Object.keys(h.CF.deployments.at(-1).manifest);
  for (const f of ["/index.html", "/404.html", "/robots.txt", "/sitemap.xml"]) assert.ok(files.includes(f), f);
  h.CF.zones.forEach((z) => (z.status = "active"));
  let r = (await h.action({ action: "host_check", id: ada })).json.row;
  assert.ok(!r.hosting.attached, "not attached while the balance is owed");
  await h.admin("PATCH", "/api/requests", { id: ada, payments: [{ amount: 70000, date: "2026-11-01", note: "deposit" }, { amount: 30000, date: "2026-11-10", note: "balance" }] });
  r = (await h.action({ action: "host_check", id: ada })).json.row;
  assert.ok(r.hosting.attached, "attached after the balance");
  assert.equal(r.website_url, "https://adasalon.com.ng");
});

test("change requests: private page, emails, Mark done; free month then quote first", async () => {
  await h.sql(`UPDATE customer_requests SET live_on = CURRENT_DATE - 5 WHERE id = $1`, [ada]);
  const info = (await h.action({ action: "changes", id: ada })).json;
  const t = new URL(info.link).searchParams.get("t");
  const page = await h.call("GET", `/change?t=${t}`);
  assert.match(page.text, /free until/);
  const up = await h.call("POST", `/api/site?upload=1&t=${t}&name=photo.jpg&type=image/jpeg`, new Uint8Array([255, 216, 1, 2]), { "content-type": "application/octet-stream" });
  assert.equal(up.status, 200, up.text);
  const n = h.sent.length;
  assert.equal((await h.call("POST", "/api/site", { t, text: "" })).status, 400);
  const s = await h.call("POST", "/api/site", { t, text: "New phone number please", files: [up.json, { url: "javascript:alert(1)", name: "x" }] });
  assert.equal(s.status, 200, s.text);
  assert.equal(h.newMail(n).length, 2, "owner + customer emails");
  const list = (await h.action({ action: "changes", id: ada })).json.changes;
  assert.equal(list[0].files.length, 1, "only the uploaded file is kept");
  assert.equal((await h.row(ada)).open_changes, 1);
  const m = h.sent.length;
  await h.action({ action: "change_mark", id: ada, change_id: list[0].id, done: true, note: "Done on every page." });
  assert.ok(h.newMail(m).some((x) => /live/.test(x.subject)));
  await h.sql(`UPDATE customer_requests SET live_on = CURRENT_DATE - 60 WHERE id = $1`, [ada]);
  const later = await h.call("POST", "/api/site", { t, text: "Add a new service" });
  assert.match(later.json.message, /quote/);
});

test("visitor counts and the monthly report", async () => {
  const key = (await h.row(ada)).hosting.statsKey;
  assert.ok(key, "published sites get a stats key");
  const hit = (e, p, r, ua = "Mozilla/5.0 (iPhone)", ip = "1.1.1.1") =>
    h.call("POST", "/api/site?hit=1", JSON.stringify({ k: key, e, p, r }), { "content-type": "text/plain", "user-agent": ua, "x-forwarded-for": ip });
  await hit("view", "/", "https://www.google.com/");
  await hit("view", "/about-us.html", "https://adasalon.com.ng/");
  await hit("view", "/", "", undefined, "2.2.2.2");
  await hit("wa"); await hit("view", "/", "", "Googlebot/2.1");
  const s = (await h.action({ action: "site_stats", id: ada })).json.stats;
  assert.equal(s.views, 3, "bots are not counted");
  assert.equal(s.visitors, 2);
  assert.equal(s.wa, 1);
  assert.deepEqual(s.sources.map((x) => x.source).sort(), ["Direct", "Google"]);
  const n = h.sent.length;
  assert.equal((await h.action({ action: "report_send", id: ada })).status, 200);
  assert.ok(h.newMail(n)[0].subject.includes("visitor"));
});

// Fake keys, built at run time so GitHub's secret scanner doesn't mistake them for real ones.
const fakeKey = (body) => ["sk", "live", body].join("_");

test("Online Store: basket checkout into the store's own Paystack, order emails, no price tampering", async () => {
  const brief = { business_name: "Tola Fabrics", whatsapp: "08031112222", products: [{ name: "Ankara 6 yards", price: "₦12,500" }, { name: "Custom aso-ebi", price: "from 20k" }] };
  const id = (await h.action({ action: "create", name: "Tola Ade", contact: "08031112222", interest: "Online Store", email: "tola@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, draft_md = $2 WHERE id = $3`, [JSON.stringify(brief), "# Website text\n## Page: Home\n### Hero\nFabrics\nIbadan.\n## Page: Shop\n### Products\nOur fabrics.", id]);
  assert.equal((await h.action({ action: "host_publish", id, force: true })).status, 200);
  const tok = (await h.row(id)).shop.token;
  const J = { "content-type": "application/json" };
  const buyer = { name: "Bisi", phone: "08030000000", email: "bisi@x.com" };
  assert.equal((await h.call("POST", "/api/shop", { s: tok, items: [{ i: 0, q: 1 }], buyer }, J)).status, 409, "off until a key is added");
  assert.match((await h.action({ action: "shop_settings", id, secretKey: fakeKey("BADBADBADBADBADBADBADBAD") })).json.error, /didn't accept/);
  const ok = await h.action({ action: "shop_settings", id, secretKey: fakeKey("TOLAtolaTOLAtolaTOLA1234"), deliveryFee: "2000" });
  assert.equal(ok.json.row.shop.keyEnd, "1234");
  assert.ok(!JSON.stringify(ok.json).includes("TOLAtola"), "the key is never sent back");
  assert.match((await h.call("POST", "/api/shop", { s: tok, items: [{ i: 1, q: 1 }], buyer }, J)).json.error, /empty/, "WhatsApp-only products can't be paid online");
  const co = await h.call("POST", "/api/shop", { s: tok, items: [{ i: 0, q: 2, p: 1 }], buyer }, J);
  assert.equal(h.paystack[co.json.ref].amount, (2 * 12500 + 2000) * 100, "server works out the price");
  assert.ok(h.paystackCalls.at(-1).auth.endsWith("1234"), "the store's own key is used");
  const n = h.sent.length;
  assert.match((await h.call("GET", `/api/shop?paid=1&ref=${co.json.ref}`)).text, /Thank you/);
  await h.call("GET", `/api/shop?paid=1&ref=${co.json.ref}`);
  assert.equal(h.newMail(n).length, 2, "store + buyer emailed once");
});

test("daily run completes without errors", async () => {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => { errors.push(a.join(" ")); orig(...a); };
  try { await h.daily(); } finally { console.error = orig; }
  assert.deepEqual(errors.filter((e) => /daily cron failed/.test(e)), []);
});

test("backup: download has every table; Monday's email goes once with the file attached", async () => {
  const r = await fetch(h.base + "/api/requests?view=backup", { headers: { authorization: "Bearer testpassword123" } });
  assert.equal(r.status, 200);
  const { gunzipSync } = await import("node:zlib");
  const data = JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString());
  for (const t of ["customer_requests", "store_orders", "change_requests", "site_stats"]) assert.ok(Array.isArray(data.tables[t]), t);
  assert.ok(data.tables.customer_requests.length >= 3);
  const { weeklyBackup } = await import("../api/_lib/backup.mjs");
  const n = h.sent.length;
  assert.ok(await weeklyBackup(new Date("2026-11-16T06:00:00Z")), "Monday");
  assert.equal(await weeklyBackup(new Date("2026-11-16T09:00:00Z")), null, "once per Monday");
  assert.equal(await weeklyBackup(new Date("2026-11-17T06:00:00Z")), null, "not again on Tuesday");
  assert.ok(await weeklyBackup(new Date("2026-11-24T06:00:00Z")), "Monday 23rd missed: Tuesday catches up");
  assert.equal(await weeklyBackup(new Date("2026-11-25T06:00:00Z")), null, "and only once");
  const mail = h.newMail(n);
  assert.equal(mail.length, 2);
  assert.match(mail[0].attachments[0].filename, /sirraddo-backup-2026-11-16\.json\.gz/);
});

test("festive greetings: banner during the festival, optional emails in batches, opt-out works", async () => {
  const { currentGreeting, occurrences, getConfig, sendBatch } = await import("../api/_lib/greetings.mjs");
  const xmas = await currentGreeting(new Date("2026-12-27T09:00:00Z"));
  assert.equal(xmas.id, "christmas");
  assert.equal(await currentGreeting(new Date("2026-12-24T09:00:00Z")), null, "not before the day");
  assert.equal((await currentGreeting(new Date("2026-12-29T20:00:00Z"))).id, "christmas", "up to 29 Dec");
  assert.equal(await currentGreeting(new Date("2026-12-30T09:00:00Z")), null);
  assert.equal(await currentGreeting(new Date("2026-12-10T09:00:00Z")), null, "nothing between festivals");
  const occ = occurrences({}, new Date("2027-01-05T09:00:00Z"));
  assert.equal(occ.find((o) => o.id === "easter").date, "2027-03-28", "Easter worked out");
  assert.equal((await h.call("GET", "/api/site?greeting=1")).status, 200);

  const r = await h.action({ action: "greetings_save", changes: { christmas: { on: false } } });
  assert.equal(r.json.festivals.find((f) => f.id === "christmas").on, false);
  assert.equal(await currentGreeting(new Date("2026-12-26T09:00:00Z")), null, "switched off");
  await h.action({ action: "greetings_save", changes: { christmas: { on: true, message: "Merry Christmas to all our customers!" } } });
  await h.action({ action: "greetings_save", changes: { eid_fitr: { year: 2027, date: "2027-03-11" } } });
  assert.equal(occurrences(await getConfig(), new Date("2027-01-05T09:00:00Z")).find((o) => o.id === "eid_fitr").date, "2027-03-11", "moon date can be corrected");

  const key = r.json.festivals.find((f) => f.id === "christmas").key;
  const n = h.sent.length;
  const q = await h.action({ action: "greetings_email", key });
  assert.equal(q.status, 200, q.text);
  assert.equal(h.newMail(n).length, 0, "nothing goes out weeks early");
  await sendBatch(20, new Date("2026-12-24T07:00:00Z"));
  assert.equal(h.newMail(n).length, 0, "not the day before");
  await sendBatch(20, new Date("2026-12-25T07:00:00Z"));
  const mails = h.newMail(n);
  assert.ok(mails.length > 0 && mails.length <= 20, "first batch only");
  assert.match(mails[0].html, /Merry Christmas to all our customers!/);
  const stop = mails[0].html.match(/api\/site\?nogreet=([\w.-]+)/)[1];
  assert.equal((await h.call("GET", `/api/site?nogreet=${stop}`)).status, 200);
  assert.equal((await h.call("GET", `/api/site?nogreet=${stop}x`)).status, 404, "forged opt-out link refused");
  await sendBatch(60, new Date("2026-12-26T07:00:00Z"));
  const again = await h.action({ action: "greetings_email", key });
  const st = again.json.festivals.find((f) => f.key === key).email;
  assert.equal(st.pending, 0);
  const aud = (await h.action({ action: "greetings" })).json.audience;
  assert.ok(aud < st.queued, "opted-out customer is no longer in the audience");
});

test("handover pack fills itself from Go live, Settings and the go-live date", async () => {
  await h.action({ action: "settings", settings: { default_registrar: "Whogohost" } });
  await h.sql(`UPDATE customer_requests SET live_on = '2026-11-20', handover = '{}'::jsonb, hosting = hosting || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ email: { locals: ["info", "sales"], to: "ada@gmail.com", status: "active" } }), ada]);
  const t = (await h.action({ action: "doc_link", id: ada })).json.doc_token;
  let page = (await h.call("GET", `/doc?t=${t}&type=handover`)).text;
  assert.match(page, /adasalon\.com\.ng/);
  assert.match(page, /info@adasalon\.com\.ng/);
  assert.match(page, /Whogohost/, "usual registrar");
  assert.match(page, /ada@gmail\.com/, "inbox shown");
  assert.match(page, /20 November 2027|20 Nov 2027/, "registered until = go-live + 1 year");
  assert.match(page, /Home/, "pages listed");
  assert.match(page, /sitemap\.xml/);
  assert.match(page, /monthly report/i);
  await h.admin("PATCH", "/api/requests", { id: ada, handover: { domain_by: "customer", registrar: "Qservers" } });
  page = (await h.call("GET", `/doc?t=${t}&type=handover`)).text;
  assert.match(page, /Qservers/, "what you typed wins");
  assert.doesNotMatch(page, /20 November 2027|20 Nov 2027/, "no guessed expiry for their own domain");
});
