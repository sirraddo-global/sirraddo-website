// Every script on every page we make must run: customer websites (each kind, with tricky names), our own pages,
// and the pages our functions serve. A single stray apostrophe can silently break a form, so this checks them all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildSiteModel, exportFiles } from "../api/_lib/sitegen.mjs";

const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*(?:type="application\/(?:ld\+)?json"|src=))[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const compiles = (where, html) => inlineScripts(html).forEach((code, i) => {
  try { new Function(code); } catch (e) { assert.fail(`${where}: script ${i + 1} doesn't run: ${e.message}`); }
});
const jsonOk = (where, html) => [...html.matchAll(/<script type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)].forEach((m) => {
  try { JSON.parse(m[1]); } catch (e) { assert.fail(`${where}: bad JSON data: ${e.message}`); }
});

const md = `## Page: Home\n### Hero\n**Headline:** Don't miss it\n**Button text:** Shop now\n\n## Page: Shop\n### Intro\n**Text:** It's all here.\n\n## Page: FAQ\n### Questions\n#### Can't I pay later?\nYou can't.\n\n## Page: Testimonials\n### Intro\n**Text:** Reviews.\n\n## Page: Gallery\n### Intro\n**Text:** Photos.\n\n## Page: Contact\n### Intro\n**Text:** Contact us.`;
for (const [interest, name] of [["Online Store", "Ada's \"Best\" Kitchen </script><b>"], ["Business website", "O'Neil & Sons"], ["Starter website", "Tolu's"]]) {
  test(`Customer website scripts run (${interest}, name ${name})`, () => {
    const row = { id: 9, name: "Ada", business: name, interest, status: "won", draft_md: md, shop: { online: true },
      hosting: { statsKey: "k123456789012", domain: "ada.com.ng", email: { status: "active", locals: ["info"], to: "x@gmail.com" } },
      reviews: { count: 1, average: 4, list: [{ name: "Bisi's mum", stars: 4, text: "It's \"great\" </script>" }] },
      brief: { business_name: name, pages: ["Home", "Shop", "FAQ", "Testimonials", "Gallery", "Contact"], whatsapp: "08031234567", phone: "08031234567",
        address: "1 O'Brien Road\nIbadan", hours: "Mon–Sat", delivery_areas: "Nationwide", tagline: "Don't wait",
        products: [{ name: "Chef's \"Special\" </script>", price: "5000", category: "Food's", details: "It's hot" }, { name: "Plain", price: "100" }] } };
    for (const f of exportFiles(buildSiteModel(row)).pages.filter((p) => p.name.endsWith(".html"))) {
      compiles(`${interest} ${f.name}`, f.html);
      jsonOk(`${interest} ${f.name}`, f.html);
      assert.doesNotMatch(f.html, /<\/script><b>/, "names can't break out of a script");
    }
  });
}

test("Our own pages' scripts run, and every asset script parses", () => {
  const P = join(process.cwd(), "public");
  for (const f of readdirSync(P).filter((x) => x.endsWith(".html"))) { const html = readFileSync(join(P, f), "utf8"); compiles(f, html); jsonOk(f, html); }
  for (const f of readdirSync(join(process.cwd(), "assets")).filter((x) => x.endsWith(".js"))) {
    try { new Function(readFileSync(join(process.cwd(), "assets", f), "utf8")); } catch (e) { assert.fail(`assets/${f}: ${e.message}`); }
  }
});

test("Pages our functions serve (project form, preview, manage, connect, documents) have working scripts", async () => {
  const { startHarness } = await import("./harness.mjs");
  const h = await startHarness();
  try {
    const id = (await h.action({ action: "create", name: "Ade O'Brien", contact: "08032220000", interest: "Online Store", email: "ade@gmail.com" })).json.id;
    await h.action({ action: "payment", id, amount: 70000 }).catch(() => {});
    await h.sql(`UPDATE customer_requests SET quote_amount = 100000, brief = $1::jsonb, draft_md = $2 WHERE id = $3`,
      [JSON.stringify({ business_name: "Ade's Shop", phone: "08032220000", whatsapp: "08032220000", products: [{ name: "Ade's Garri", price: "5000" }] }), "## Page: Home\n### Hero\n**Headline:** Hi", id]);
    const links = {};
    for (const a of ["manage_link", "paystack_link"]) links[a] = (await h.action({ action: a, id })).json?.url || "";
    const t = (await h.action({ action: "brief_link", id })).json.brief_token;
    const pv = (await h.action({ action: "preview_link", id })).json.preview_token;
    const dt = (await h.action({ action: "doc_link", id })).json.doc_token;
    Object.assign(links, { brief: `${h.base}/brief.html?t=${t}`, preview: `${h.base}/preview?t=${pv}`, invoice: `${h.base}/doc?t=${dt}&type=invoice`, quote: `${h.base}/doc?t=${dt}&type=quote` });
    let checked = 0;
    for (const [a, url] of Object.entries(links)) {
      if (!url) continue;
      const u = new URL(url);
      const page = await h.call("GET", u.pathname + u.search);
      if (page.status !== 200 || !/<html/i.test(page.text || "")) continue;
      compiles(`${a} page`, page.text);
      checked++;
    }
    assert.ok(checked >= 5, `checked ${checked} pages: ${JSON.stringify(links)}`);
  } finally { await h.close(); }
});
