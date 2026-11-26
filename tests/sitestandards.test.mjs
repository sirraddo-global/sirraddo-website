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
