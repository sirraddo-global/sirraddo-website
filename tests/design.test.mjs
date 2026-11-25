// Flyers & graphics (/design): order with files, full payment online, no website steps; prices match the page.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startHarness, PAYSTACK_KEY, ROOT } from "./harness.mjs";
import { DESIGN_SERVICES } from "../api/_lib/graphics.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });
const signed = (obj) => { const body = JSON.stringify(obj); return [body, { "content-type": "application/json", "x-paystack-signature": createHmac("sha512", PAYSTACK_KEY).update(body).digest("hex") }]; };
const naira = (n) => "₦" + n.toLocaleString("en-NG");

test("design page shows the same prices as the order API, and is linked from the site", async () => {
  const page = readFileSync(join(ROOT, "design.html"), "utf8");
  for (const d of DESIGN_SERVICES) {
    assert.ok(page.includes(`<option value="${d.interest.replace("&", "&amp;")}" data-svc="${d.key}"`), `${d.interest} in the form`);
    assert.ok(page.includes(`(${naira(d.price)})`), `${d.interest} price ${naira(d.price)} in the form`);
    assert.ok(page.includes(`<p class="price">${naira(d.price)}`), `${d.interest} price card`);
  }
  assert.equal((await h.call("GET", "/design")).status, 200);
  for (const f of ["index.html", "websites.html"]) assert.match(readFileSync(join(ROOT, f), "utf8"), /href="\/design"/, f);
});

test("design order: validated, files listed, full price set, pay link; after payment Won without the website form", async () => {
  assert.equal((await h.call("POST", "/api/design", { name: "Bot", contact: "08011112222", service: "Flyer design", words: "spam spam", website: "x" })).status, 200);
  assert.equal((await h.call("POST", "/api/design", { name: "Kemi", contact: "08033334444", service: "Website", words: "hello there" })).status, 400);
  assert.equal((await h.call("POST", "/api/design", { name: "Kemi", contact: "08033334444", service: "Flyer design", words: "" })).status, 400);

  const up = await h.call("POST", "/api/chat-upload?s=design-abc&name=logo.png&type=image/png", Buffer.from("png"), { "content-type": "image/png" });
  assert.equal(up.status, 200, up.text);
  const res = await h.call("POST", "/api/design", {
    name: "Kemi Ade", contact: "0803 333 4444", email: "kemi@example.com", business: "Kemi Cakes", service: "Flyer design",
    words: "Kemi Cakes: 20% off birthday cakes this December. Call 0803 333 4444", size: "A4 print", colours: "pink and gold",
    deadline: "2026-12-01", files: [{ url: up.json.url, name: "logo.png" }, { url: "javascript:alert(1)", name: "bad" }],
  });
  assert.equal(res.status, 200, res.text);
  assert.match(res.json.pay, /^\/pay\?/, "goes straight to payment");
  const id = Number(res.json.ref.replace(/\D/g, ""));
  let r = await h.row(id);
  assert.equal(r.interest, "Flyer design"); assert.equal(r.source, "design");
  assert.equal(r.quote_amount, 5000); assert.equal(r.deposit_pct, 100);
  assert.match(r.details, /Size \/ where it's used: A4 print/); assert.match(r.details, /Needed by: 2026-12-01/);
  assert.match(r.details, /• logo\.png: http/); assert.doesNotMatch(r.details, /javascript:/);

  const page = await h.call("GET", res.json.pay);
  assert.match(page.text, /₦5,000/, "full price due"); assert.match(page.text, /Payment for your Flyer design/);
  const t = new URL("http://x" + res.json.pay).searchParams.get("t");
  const start = await h.call("POST", "/api/pay", { t, email: "kemi@example.com", for: "deposit" });
  assert.equal(start.status, 200, start.text);
  const [body, headers] = signed({ event: "charge.success", data: { reference: new URL(start.json.url).searchParams.get("ref") } });
  assert.equal((await h.call("POST", "/api/paystack-webhook", body, headers)).status, 200);
  r = await h.row(id);
  assert.equal(r.payments[0].amount, 5000); assert.equal(r.status, "won");
  assert.equal(r.brief_token, null, "no website project form for a design job");
  assert.equal(r.project_stage, null);
  assert.ok(r.follow_up_on, "follow-up set so it gets started");
  assert.match((await h.call("GET", `/pay?t=${t}`)).text, /Nothing to pay/);

  const noEmail = await h.call("POST", "/api/design", { name: "Tunde", contact: "08055556666", service: "Logo design", words: "Tunde Motors, car repairs" });
  assert.equal(noEmail.status, 200); assert.equal(noEmail.json.pay, undefined, "without email: we follow up on WhatsApp");
  assert.equal((await h.row(Number(noEmail.json.ref.replace(/\D/g, "")))).quote_amount, 20000);
});
