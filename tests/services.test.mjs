// Side services (/services + /design): on/off switches in admin, hidden ones can't be ordered, yearly/monthly
// ones add their renewal once paid, every service has a guide, and the pages show the catalog prices.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startHarness, PAYSTACK_KEY, ROOT } from "./harness.mjs";
import { QUICK_SERVICES, visibleKeys, cleanOrder } from "../api/_lib/graphics.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });
const signed = (obj) => { const body = JSON.stringify(obj); return [body, { "content-type": "application/json", "x-paystack-signature": createHmac("sha512", PAYSTACK_KEY).update(body).digest("hex") }]; };
const naira = (n) => "₦" + n.toLocaleString("en-NG");

test("catalog: unique keys, a guide for each, prices on the pages, new ones start hidden", () => {
  const keys = QUICK_SERVICES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const s of QUICK_SERVICES) {
    assert.ok(s.guide.length >= 3, `${s.key} guide`);
    const page = readFileSync(join(ROOT, `${s.page}.html`), "utf8");
    assert.ok(page.includes(`<option value="${s.interest.replace("&", "&amp;")}" data-svc="${s.key}"`), `${s.key} in the ${s.page} form`);
    assert.match(page, new RegExp(`<article[^>]*data-svc="${s.key}"`), `${s.key} card`);
    assert.ok(page.includes(naira(s.price)), `${s.key} price`);
  }
  assert.deepEqual(visibleKeys({}), ["flyer", "social", "card", "logo", "brand"]);
  assert.deepEqual(visibleKeys({ svc_visible: "none" }), []);
  assert.deepEqual(visibleKeys({ svc_visible: "cv,maps,nope" }), ["maps", "cv"]);
});

test("switches: hidden services can't be ordered; switched on, a yearly one adds its renewal once paid", async () => {
  let g = await h.call("GET", "/api/order");
  assert.equal(g.status, 200); assert.equal(g.json.pages.services, false); assert.ok(!g.json.visible.includes("minisite"));
  const order = { name: "Bola", contact: "08022223333", email: "bola@example.com", service: "Mini website", words: "Bola Cakes, cakes and small chops in Ibadan" };
  assert.equal((await h.call("POST", "/api/order", order)).status, 400, "hidden: refused");

  const set = await h.action({ action: "settings", settings: { svc_visible: "flyer,minisite,cv" } });
  assert.equal(set.status, 200, set.text);
  g = await h.call("GET", "/api/order");
  assert.deepEqual(g.json.visible, ["flyer", "cv", "minisite"]); assert.equal(g.json.pages.services, true);
  assert.equal((await h.call("POST", "/api/order", { ...order, service: "Logo design" })).status, 400, "logo now switched off");
  assert.equal((await h.call("GET", "/services")).status, 200);

  const all = await h.admin("GET", "/api/requests?view=all");
  assert.equal(all.json.quick.length, QUICK_SERVICES.length, "admin gets the catalog with guides");

  const res = await h.call("POST", "/api/order", order);
  assert.equal(res.status, 200, res.text);
  const id = Number(res.json.ref.replace(/\D/g, ""));
  let r = await h.row(id);
  assert.equal(r.source, "service"); assert.equal(r.quote_amount, 10000); assert.equal(r.deposit_pct, 100);
  assert.match(r.details, /ORDER: Mini website \(₦10,000, then ₦5,000 a year\)/);
  assert.doesNotMatch(r.details, /Size/);

  const t = new URL("http://x" + res.json.pay).searchParams.get("t");
  const start = await h.call("POST", "/api/pay", { t, email: "bola@example.com", for: "deposit" });
  assert.equal(start.status, 200, start.text);
  const [body, headers] = signed({ event: "charge.success", data: { reference: new URL(start.json.url).searchParams.get("ref") } });
  assert.equal((await h.call("POST", "/api/paystack-webhook", body, headers)).status, 200);
  r = await h.row(id);
  assert.equal(r.status, "won"); assert.equal(r.brief_token, null);
  assert.equal(r.services.length, 1);
  assert.equal(r.services[0].name, "Mini website"); assert.equal(r.services[0].amount, 5000); assert.equal(r.services[0].period, "yearly");
  assert.ok(r.services[0].next_due > r.services[0].started);

  await h.action({ action: "settings", settings: { svc_visible: "none" } });
  assert.deepEqual((await h.call("GET", "/api/order")).json.visible, []);
  assert.equal((await h.call("POST", "/api/design", { ...order, service: "Flyer design" })).status, 400, "all off");
});

test("extras add to the price; seasonal packs only in season; paid order gets a promised date and a tracker", async () => {
  const { inSeason, QUICK_SERVICES: Q, orderTotal, addWorkdays } = await import("../api/_lib/graphics.mjs");
  const xmas = Q.find((s) => s.key === "xmas");
  assert.equal(inSeason(xmas, "2026-12-20"), true); assert.equal(inSeason(xmas, "2027-01-05"), true); assert.equal(inSeason(xmas, "2027-02-01"), false);
  assert.equal(orderTotal(Q.find((s) => s.key === "logo"), ["express"]).total, 20000, "logo has no same-day option");
  assert.equal(addWorkdays("2026-11-27", 1), "2026-11-30", "Friday + 1 working day = Monday");

  await h.action({ action: "settings", settings: { svc_visible: "flyer,easter" } });
  assert.deepEqual((await h.call("GET", "/api/order")).json.visible.includes("easter"), false, "Easter pack hidden out of season");

  const res = await h.call("POST", "/api/order", { name: "Ife", contact: "08077778888", email: "ife@example.com", service: "Flyer design",
    words: "Ife Fabrics: new Ankara arrivals this week", extras: ["animated", "bogus"],
    samples: [{ url: "https://example.com/liked.jpg", name: "liked.jpg" }, { url: "javascript:alert(1)", name: "bad" }, { url: "https://example.com/3.jpg", name: "3" }] });
  assert.equal(res.status, 200, res.text);
  assert.match(res.json.track, /^\/track\?t=/);
  const id = Number(res.json.ref.replace(/\D/g, ""));
  let r = await h.row(id);
  assert.equal(r.quote_amount, 8000, "₦5,000 + ₦3,000 animated");
  assert.match(r.details, /Extras: Animated WhatsApp status version \(\+₦3,000\) · Total ₦8,000/);
  assert.match(r.details, /Style samples they like \(1\)/);
  assert.match(r.details, /^◦ liked\.jpg: https:\/\/example\.com\/liked\.jpg$/m);
  assert.doesNotMatch(r.details, /javascript:|3\.jpg/);

  let page = await h.call("GET", res.json.track);
  assert.equal(page.status, 200); assert.match(page.text, /Order received/); assert.match(page.text, /Pay ₦8,000 now/);

  const t = new URL("http://x" + res.json.pay).searchParams.get("t");
  const start = await h.call("POST", "/api/pay", { t, email: "ife@example.com", for: "deposit" });
  const [body, headers] = signed({ event: "charge.success", data: { reference: new URL(start.json.url).searchParams.get("ref") } });
  await h.call("POST", "/api/paystack-webhook", body, headers);
  r = await h.row(id);
  assert.equal(r.status, "won"); assert.match(r.deliver_by, /^\d{4}-\d{2}-\d{2}$/);
  assert.doesNotMatch((await h.call("GET", res.json.track)).text, /Pay ₦/, "no pay button once paid");

  assert.equal((await h.call("PATCH", "/api/requests", { id, job_stage: "nonsense" }, { authorization: "Bearer testpassword123" })).status, 400);
  // Delivered late -> note about 20% off next order
  await h.call("PATCH", "/api/requests", { id, deliver_by: "2026-01-02" }, { authorization: "Bearer testpassword123" });
  const done = await h.call("PATCH", "/api/requests", { id, job_stage: "done" }, { authorization: "Bearer testpassword123" });
  assert.equal(done.status, 200, done.text);
  r = await h.row(id);
  assert.equal(r.job_stage, "done"); assert.match(r.notes, /owes 20% off their next order/);
  page = await h.call("GET", res.json.track);
  assert.match(page.text, /Delivered/);
  assert.equal((await h.call("GET", "/track?t=nope")).status, 404);
});

test("design form boxes: business name, phone, card name… become labelled lines; card words can be left empty", () => {
  const o = cleanOrder({ service: "Business card design", words: "", business: "SIRRADDO GLOBAL LIMITED",
    info: { person: "Adeyemo Ridwan", title: "Managing Director", phone: "08112999073", bizmail: "info@sirraddo.com.ng", address: "Iwo Road, Ibadan", junk: "x" } });
  assert.match(o.details, /^Business name: SIRRADDO GLOBAL LIMITED$/m);
  assert.match(o.details, /^Name on card: Adeyemo Ridwan$/m);
  assert.match(o.details, /^Job title: Managing Director$/m);
  assert.match(o.details, /^Phone on design: 08112999073$/m);
  assert.match(o.details, /^Email on design: info@sirraddo.com.ng$/m);
  assert.ok(!/junk|Anything else/.test(o.details));
  assert.throws(() => cleanOrder({ service: "Flyer design", words: "" }), /Words to put on it/);
});
