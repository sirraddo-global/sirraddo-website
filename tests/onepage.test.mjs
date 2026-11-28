// One-page sites from quick-service orders (Mini website, QR menu): AI fills the form, the page is written,
// and it goes live on a free name.sirraddo.com.ng address without touching anything else in our zone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";

let h, id;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

test("Mini website: form filled from the order, one page written", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    if (String(u).includes("generativelanguage") && String(o?.body || "").includes("Fill in the form.")) {
      const reply = JSON.stringify({ business_name: "Kassy Treats", description: "Cakes and small chops in Ibadan.", phone: "08000000000", address: "Bodija, Ibadan",
        services: [{ name: "Birthday cake", price: "₦15,000" }, { name: "Small chops tray", price: "₦8,000" }, { name: "" }] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] }, finishReason: "STOP" }] }), { status: 200 });
    }
    return prev(u, o);
  };
  try {
    id = (await h.action({ action: "create", name: "Kassy", contact: "08000000000", interest: "Mini website", details: "ORDER: Mini website\nWhat should the page show?:\nCakes ₦15,000, small chops ₦8,000. Bodija." })).json.id;
    const b = await h.action({ action: "onepage_brief", id });
    assert.equal(b.status, 200, b.text);
    assert.deepEqual(b.json.brief.pages, ["Home"]);
    assert.equal(b.json.brief.services.length, 2, "empty rows dropped");
    assert.match(b.json.brief.description, /one-page website/);
    assert.ok(b.json.row.brief_submitted_at, "form counts as received");
  } finally { globalThis.fetch = prev; }
  const d = await h.action({ action: "write_draft", id });
  assert.equal(d.status, 200, d.text);
  assert.ok(d.json.has_draft || d.json.draft_md, "page written");
});

test("free address: name.sirraddo.com.ng, safe names only, no www", async () => {
  h.CF.zones.push({ id: "zown", name: "sirraddo.com.ng", status: "active", name_servers: [] });
  h.CF.dns.push({ id: "taken1", zone: "zown", type: "A", name: "taken.sirraddo.com.ng", content: "1.2.3.4" });
  const bad = async (domain, re) => { const r = await h.action({ action: "host_domain", id, domain }); assert.equal(r.status, 400, domain); assert.match(r.json.error, re, domain); };
  h.CF.denyDns = true;
  await bad("kassytreats.sirraddo.com.ng", /isn't allowed to add records[\s\S]*Zone · DNS · Edit/);
  h.CF.denyDns = false;
  assert.ok(!h.CF.dns.some((r) => /_sirraddo-check/.test(r.name)), "the test record is always removed");
  await bad("sirraddo.com.ng", /our own website/);
  await bad("admin.sirraddo.com.ng", /kept for SIRRADDO/);
  await bad("a.b.sirraddo.com.ng", /one simple name/);
  await bad("taken.sirraddo.com.ng", /already in use/);
  assert.ok(h.CF.dns.some((r) => r.id === "taken1"), "an existing record is never touched");
  const ok = await h.action({ action: "host_domain", id, domain: "KassyTreats.sirraddo.com.ng" });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.row.hosting.domain, "kassytreats.sirraddo.com.ng");
  assert.equal(ok.json.row.hosting.sub, true);
  const pub = await h.action({ action: "host_publish", id, force: true });
  assert.equal(pub.status, 200, pub.text);
  const r = (await h.action({ action: "host_check", id })).json.row;
  assert.ok(r.hosting.attached, "attached at once (no nameservers to wait for)");
  const recs = h.CF.dns.filter((x) => x.zone === "zown");
  assert.ok(recs.some((x) => x.name === "kassytreats.sirraddo.com.ng" && x.type === "CNAME" && /\.pages\.dev$/.test(x.content)));
  assert.ok(!recs.some((x) => x.name === "www.kassytreats.sirraddo.com.ng"), "no www. record for a free address");
  const em = await h.action({ action: "host_email", id, locals: "info", to: "kassy@gmail.com" });
  assert.equal(em.status, 400);
  assert.match(em.json.error, /don't include email/);
});
