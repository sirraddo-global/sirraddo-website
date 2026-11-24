// Side services (/services + /design): on/off switches in admin, hidden ones can't be ordered, yearly/monthly
// ones add their renewal once paid, every service has a guide, and the pages show the catalog prices.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startHarness, PAYSTACK_KEY, ROOT } from "./harness.mjs";
import { QUICK_SERVICES, visibleKeys } from "../api/_lib/graphics.mjs";

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
    assert.ok(page.includes(`data-svc="${s.key}">`), `${s.key} card`);
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
