// Customer websites: colours by type of business (new requests only), WhatsApp order button with a ready
// message, where they work under the hero, CAC badge in the trust bar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSiteModel, renderPage, themeFor } from "../api/_lib/sitegen.mjs";

const draft = "# Home\n## Hero\nFresh cakes for every celebration\nBaked to order in Ibadan\n## About\nWe bake.";
const row = (brief, created = "2026-11-27T10:00:00Z") => ({ id: 7, interest: "Business website", name: "Kemi", contact: "08031234567", created_at: created, draft_md: draft,
  brief: { business_name: "Kemi Cakes", description: "Bakery: birthday cakes and small chops", phone: "08031234567", address: "12 Iwo Road, Ibadan", style: "Clean and modern", ...brief } });

test("industry colours: bakery gets espresso and gold on new requests; their own colours win; old requests keep their look", () => {
  assert.equal(buildSiteModel(row({})).theme.primary, "#3B2416");
  assert.equal(buildSiteModel(row({ colours: "navy and gold" })).theme.primary, "#14254F");
  assert.equal(buildSiteModel(row({}, "2026-10-01T10:00:00Z")).theme.primary, themeFor({ style: "Clean and modern" }).primary);
  assert.equal(themeFor({ description: "Pharmacy and drug store" }, { industry: true }).accent, "#0FA3A3");
});

test("home hero: Order on WhatsApp with a ready message, city under the words, CAC in the trust bar", () => {
  const site = buildSiteModel(row({ cac: "RC 1234567" }));
  const html = renderPage(site, "index", { mode: "export", link: (s) => s });
  assert.match(html, /href="https:\/\/wa\.me\/2348031234567\?text=Hello%20Kemi%20Cakes/);
  assert.match(html, />Order on WhatsApp</);
  assert.match(html, /class="where">[^<]*Ibadan/);
  assert.match(html, /CAC registered \(RC 1234567\)/);
  assert.match(html, /class="wa" href="https:\/\/wa\.me\/2348031234567\?text=/);
});

test("each industry gets its own page structure on the home page", () => {
  const svc = (list) => list.map(([name, price]) => ({ name, details: "", price }));
  const page = (brief) => renderPage(buildSiteModel(row(brief)), "index", { mode: "export", link: (s) => s });
  const food = page({ services: svc([["Birthday cake", "18000"], ["Meat pie", "1200"]]) });
  assert.match(food, /class="page-home[^"]*ind-food/); assert.match(food, /class="mq-order" href="https:\/\/wa\.me\/2348031234567\?text=Hello%20Kemi%20Cakes%2C%20I'd%20like%20to%20order%3A%20Meat%20pie/);
  const fashion = page({ business_name: "Glam by Tolu", description: "Hair salon and makeup", services: svc([["Knotless braids", "15000"]]) });
  assert.match(fashion, /ind-fashion/); assert.match(fashion, /class="lb-list"/);
  const homes = page({ business_name: "Oak Homes", description: "Real estate agency", services: svc([["3-bedroom flat for Rent in Bodija", "1500000"], ["Land for Sale in Akobo", "12000000"]]) });
  assert.match(homes, /class="lf"/); assert.match(homes, /data-k="rent"/); assert.match(homes, /📍 Bodija/);
  const clinic = page({ business_name: "Bright Smile Dental Clinic", description: "Dental clinic", services: svc([["Check-up", "10000"]]) });
  assert.match(clinic, /<form class="bk"/); assert.match(clinic, />Book an appointment</);
});

test("websites page showcase: 5 sample sites, framable only by our own site, each with a WhatsApp 'Build a website like this'", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../websites.html", import.meta.url), "utf8"), js = readFileSync(new URL("../assets/showcase.js", import.meta.url), "utf8");
  assert.match(page, /id="showcase"/); assert.match(page, /Build a Website Like This \(From ₦50,000\)/);
  for (const k of ["kassy", "crestline", "zainab", "olivecare", "brightpath"]) {
    const html = readFileSync(new URL(`../assets/showcase/${k}.html`, import.meta.url), "utf8");
    assert.match(js, new RegExp(`k: '${k}'`)); assert.match(html, /Sample website made by SIRRADDO/); assert.doesNotMatch(html, /wa\.me\//, `${k} never messages a real number`);
  }
  assert.match(readFileSync(new URL("../netlify.toml", import.meta.url), "utf8"), /for = "\/assets\/showcase\/\*"[\s\S]*?X-Frame-Options = "SAMEORIGIN"/);
});

test("filling stations: the owner updates pump prices and stock in Manage; the website shows the price board", async () => {
  const { FUEL, isFuelBusiness } = await import("../api/_lib/sitegen.mjs");
  assert.ok(isFuelBusiness({ business_name: "PrimeFuel", description: "Filling station and cooking gas plant" }));
  assert.ok(!isFuelBusiness({ description: "Bakery: we opened 10 years ago" }));
  assert.equal(FUEL.length, 3);
  const site = buildSiteModel(row({ business_name: "PrimeFuel", description: "Filling station", fuel_prices: { pms: { price: "980", status: "available" }, ago: { price: "1150", status: "low" }, lpg: { price: "", status: "out" }, updated: "2026-11-26T06:30:00Z" } }));
  const html = renderPage(site, "index", { mode: "export", link: (s) => s });
  assert.match(html, /Today's prices/); assert.match(html, /₦980<small>\/L/); assert.match(html, /fb-low[\s\S]*Low stock/);
  assert.doesNotMatch(html, /Cooking gas \(LPG\)/, "not sold = not shown");
  assert.match(html, /Updated 26 Nov, 7:30 am/i);
  assert.doesNotMatch(renderPage(buildSiteModel(row({})), "index", { mode: "export", link: (s) => s }), /Today's prices/);
});

test("hotels get rooms with nightly rates and a dates booking form; stations get a delivery request priced from the board", async () => {
  const { DEMOS, demoRow } = await import("../api/_lib/demos.mjs");
  for (const k of ["realestate", "clinic", "hotel", "fuel"]) assert.ok(DEMOS[k], k);
  const hotel = buildSiteModel(demoRow("hotel"));
  assert.equal(hotel.theme.ind, "hotel");
  const h = renderPage(hotel, "index", { mode: "export", link: (s) => s });
  assert.match(h, /class="rb"/); assert.match(h, /name="i" type="date"/); assert.match(h, /₦45,000 <small>\/ night/); assert.match(h, /Rooms &amp; rates/);
  const fuel = buildSiteModel(demoRow("fuel"));
  assert.equal(fuel.theme.ind, "fuel");
  const f = renderPage(fuel, "index", { mode: "export", link: (s) => s });
  assert.match(f, /Today's prices/); assert.match(f, /class="fo"/); assert.match(f, /data-p="1150" data-u="L"/);
  for (const html of [h, f]) for (const js of html.match(/<script>[\s\S]*?<\/script>/g) || []) assert.doesNotThrow(() => new Function(js.slice(8, -9)), "inline scripts are valid");
});

test("page backgrounds, web fonts and the content fixes on the demos", async () => {
  const { demoRow } = await import("../api/_lib/demos.mjs");
  const { surfaceOf } = await import("../api/_lib/sitegen.mjs");
  assert.equal(surfaceOf("Midnight dark"), "dark"); assert.equal(surfaceOf("Warm cream & gold"), "cream"); assert.equal(surfaceOf("Crisp light"), "light"); assert.equal(surfaceOf(""), "tinted");
  const page = (k, o) => renderPage(buildSiteModel(demoRow(k, o)), "index", { mode: "export", link: (s) => s });
  const hotel = page("hotel");
  assert.match(hotel, /class="[^"]*s-tinted"/); assert.match(hotel, /fonts\.googleapis\.com\/css2\?family=Plus\+Jakarta\+Sans[^"]*Playfair\+Display/);
  { const dk = page("hotel", { surface: "dark" }); assert.match(dk, /body\.s-dark\{background:#0B1120/); assert.match(dk, /<body class="[^"]*s-dark"/); }
  assert.match(hotel, /Events &amp; Conference Hall/); assert.match(hotel, /from ₦150,000\/day/);
  assert.match(page("fuel"), /'Outfit'/);
  const church = page("church");
  assert.match(church, /Worshipped with Grace Assembly Ibadan\? Share a testimony/); assert.match(church, /Online giving · Tithes &amp; offerings/); assert.match(church, /Copy account details/);
  assert.match(page("school"), />Book a school visit</);
  assert.match(page("restaurant"), /Ibadan delivery zones/);
  const re = page("realestate");
  assert.match(re, /value="100000000">Up to ₦100m/); assert.doesNotMatch(re, />No listing matches/);
  assert.doesNotMatch(page("shop"), />No products match/);
  const salon = page("salon"); assert.doesNotMatch(salon, />Our work</, "the lookbook already shows the photos");
});
