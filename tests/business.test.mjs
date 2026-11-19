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
  const ok = await h.call("POST", "/api/lead", { name: "Ada Obi", contact: "0803 111 2222", business: "Ada Salon", interest: "Starter website", from: "Facebook / Ibadan-Test<script>" });
  assert.equal(ok.status, 200);
  const rows = (await h.admin("GET", "/api/requests?view=all")).json.requests;
  assert.ok(rows.some((r) => r.name === "Ada Obi" && r.interest === "Starter website"));
  assert.equal(rows.find((r) => r.name === "Ada Obi").came_from, "facebook / ibadan-testscript", "where they came from is kept (cleaned)");
  // Added by you (a WhatsApp ad customer), and changed later.
  const man = (await h.action({ action: "create", name: "Wale", contact: "08030001111", interest: "Other", came_from: "whatsapp ad" })).json;
  assert.equal(man.came_from, "whatsapp ad");
  assert.equal((await h.admin("PATCH", "/api/requests", { id: man.id, came_from: "referral" })).json.came_from, "referral");
  // Saving the card with an empty summary works (it used to fail).
  const saved = await h.admin("PATCH", "/api/requests", { id: man.id, name: "Wale", contact: "08030001111", details: "", came_from: "flyer" });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.json.details, "");
  assert.ok(h.newMail(n).some((m) => /Ada/.test(m.subject)));
  assert.equal((await h.call("POST", "/api/lead", { name: "Bot", contact: "08011112222", website: "http://spam" })).status, 200);
  assert.ok(!(await h.admin("GET", "/api/requests?view=all")).json.requests.some((r) => r.name === "Bot"));
  assert.equal((await h.call("POST", "/api/lead", { name: "X Y", contact: "123" })).status, 400);
});

test("the chat assistant saves the customer's request with their ideas and suggested package", async () => {
  const r = await h.call("POST", "/api/chat", { sessionId: "s-test-chat-0001", from: "google (search)", messages: [{ role: "user", content: "please save my details" }] });
  assert.equal(r.status, 200, r.text);
  const row = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((x) => x.name === "Bola Ade");
  assert.ok(row, "chat request saved");
  assert.equal(row.came_from, "google (search)");
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

test("Do it with AI: a change request is read and applied to the live site (add, remove, change); Undo puts it back", async () => {
  const brief = { business_name: "Kemi Wears", phone: "08035550000", products: [{ name: "Ankara gown", price: "20000", stock: "4" }, { name: "Lace blouse", price: "12000" }, { name: "Gele", price: "5000" }] };
  const md = "# Website text\n## Page: Home\n### Hero\n**Headline:** Kemi Wears\n### Visit\n**Text:** Open Monday to Saturday in Bodija.\n## Page: About us\n### Story\n**Text:** We sew in Ibadan.\n## Product descriptions\n### Lace blouse\nSoft lace.\n### Gele\nBright gele.\n\n---\n*Draft written by AI from the project form on 2026-11-01. Check it.*";
  const id = (await h.action({ action: "create", name: "Kemi Ola", contact: "08035550000", interest: "Online Store", email: "kemi@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, draft_md = $2, live_on = CURRENT_DATE - 3 WHERE id = $3`, [JSON.stringify(brief), md, id]);
  assert.equal((await h.action({ action: "host_publish", id, force: true })).status, 200);
  const t = new URL((await h.action({ action: "changes", id })).json.link).searchParams.get("t");
  const up = await h.call("POST", `/api/site?upload=1&t=${t}&name=silk-scarf.jpg&type=image/jpeg`, new Uint8Array([255, 216, 1, 2]), { "content-type": "application/octet-stream" });
  globalThis.__AI_CHANGE_REPLY__ = JSON.stringify({ understood: "Add a scarf, remove Gele, new Lace price, open on Sundays.", ops: [
    { op: "add_product", name: "Silk scarf", price: "9000", details: "A light silk scarf.", photo: "A1" },
    { op: "remove_product", product: 3 },
    { op: "update_product", product: 2, price: "15000" },
    { op: "replace_text", page: "Home", find: "Monday to Saturday", replace: "Monday to Sunday" },
    { op: "replace_text", page: "Home", find: "text that is not there", replace: "x" },
    { op: "hack_db", sql: "drop" },
  ], not_done: ["Pink colours: needs a new design"] });
  await h.call("POST", "/api/site", { t, text: "Please add Silk scarf for 9000 (photo attached), remove Gele, Lace blouse is now 15000, we now open Monday to Sunday, and make the colours pink.", files: [up.json] });
  const c = (await h.action({ action: "changes", id })).json.changes[0];
  assert.equal(c.plan?.ops?.length, 5, "the AI got the edits ready as soon as the customer sent the request");
  const plan = (await h.action({ action: "change_ai_plan", id, change_id: c.id })).json;
  assert.equal(plan.plan.view_token, c.plan.view_token, "asking again keeps the same preview link");
  assert.ok(plan.plan, JSON.stringify(plan));
  assert.equal(plan.plan.ops.length, 5, "unknown edits are dropped");
  assert.ok(plan.plan.lines.includes("Remove product: Gele"));
  assert.deepEqual(plan.plan.not_done, ["Pink colours: needs a new design"]);
  assert.match(globalThis.__LAST_AI_PROMPT__, /3\. Gele \| 5000/, "the AI sees the current products");
  assert.match(globalThis.__LAST_AI_PROMPT__, /Open Monday to Saturday/, "and the current text");
  assert.match(globalThis.__LAST_AI_PROMPT__, /A1\. silk-scarf\.jpg \(photo\)/);
  assert.ok(globalThis.__LAST_AI_PARTS__.some((p) => p.inline_data), "the photo is shown to the AI");
  let b = (await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]))[0].brief;
  assert.equal(b.products.length, 3, "planning changes nothing");

  // Preview: their current site + the edits, same design. You open it and send it; the customer checks it.
  const vt = plan.plan.view_token;
  const home = await h.call("GET", `/preview?c=${vt}`);
  assert.equal(home.status, 200);
  assert.match(home.text, /Open Monday to Sunday in Bodija/);
  assert.match(home.text, /Put these changes live/);
  assert.match(home.text, /Not live yet/);
  const shopPv = await h.call("GET", `/preview?c=${vt}&p=shop`);
  assert.match(shopPv.text, /Silk scarf/);
  assert.doesNotMatch(shopPv.text, />Gele</);
  assert.equal((await h.call("GET", `/preview?c=${vt}x`)).status, 404);
  assert.equal((await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]))[0].brief.products.length, 3, "viewing changes nothing");
  const e0 = h.sent.length;
  const sentTo = (await h.action({ action: "change_ai_send", id, change_id: c.id })).json;
  assert.equal(sentTo.to, "kemi@gmail.com");
  assert.ok(h.newMail(e0).some((m) => m.to.includes("kemi@gmail.com") && m.html.includes(`/preview?c=${vt}`)));
  // The customer says something's not right: you're told, and "Ask AI again" reads it.
  assert.equal((await h.call("POST", "/api/preview", { c: vt, action: "changes", text: "" })).status, 400);
  const said = await h.call("POST", "/api/preview", { c: vt, action: "changes", text: "Scarf should be 9500" });
  assert.equal(said.status, 200, said.text);
  assert.match((await h.action({ action: "changes", id })).json.changes[0].plan.customer.text, /9500/);
  await h.action({ action: "change_ai_plan", id, change_id: c.id });
  assert.match(globalThis.__LAST_AI_PROMPT__, /THEY LOOKED AT A PREVIEW[\s\S]*Scarf should be 9500/);

  // The customer taps "Put these changes live": applied and published by itself.
  const n = h.sent.length;
  const okd = await h.call("POST", "/api/preview", { c: vt, action: "approved" });
  assert.equal(okd.status, 200, okd.text);
  assert.match(okd.json.message, /Your website is updated/);
  const ap = { ...(await h.action({ action: "changes", id })).json.changes[0].plan, changes: (await h.action({ action: "changes", id })).json.changes };
  assert.equal(ap.live, "updated", JSON.stringify(ap));
  assert.equal(ap.applied_by, "customer");
  const [row] = await h.sql(`SELECT brief, brief_files, draft_md FROM customer_requests WHERE id = $1`, [id]);
  assert.deepEqual(row.brief.products.map((p) => p.name), ["Ankara gown", "Lace blouse", "Silk scarf"]);
  assert.equal(row.brief.products[0].stock, "4", "stock the owner set is kept");
  assert.equal(row.brief.products[1].price, "15000");
  assert.equal(row.brief.products[2].photo, up.json.url);
  assert.ok(row.brief_files.product_photos.some((f) => f.url === up.json.url));
  assert.match(row.draft_md, /Open Monday to Sunday in Bodija/);
  assert.doesNotMatch(row.draft_md, /### Gele/);
  assert.match(row.draft_md, /We sew in Ibadan/, "other text untouched");
  assert.match(row.draft_md, /\*Draft written by AI/);
  assert.ok(ap.results.some((r) => !r.ok && /couldn't find/.test(r.text)), "a wrong piece of text is skipped, not guessed");
  const done = ap.changes.find((x) => x.id === c.id);
  assert.equal(done.status, "done");
  assert.ok(h.newMail(n).some((m) => /approved their changes/.test(m.subject)), "you are told");
  assert.match((await h.call("GET", `/preview?c=${vt}`)).text, /These changes are live/);
  assert.match((await h.call("POST", "/api/preview", { c: vt, action: "approved" })).json.message, /already live/);
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const site = buildSiteModel({ ...(await h.row(id)), ...row });
  const shop = renderPage(site, site.pages.find((p) => p.kind === "shop").slug, { mode: "export", link: (x) => x });
  assert.match(shop, /Silk scarf/);
  assert.doesNotMatch(shop, />Gele</);
  assert.match((await h.action({ action: "change_ai_apply", id, change_id: c.id })).json.error, /already applied/);
  // (You can also apply it yourself without the customer: change_ai_apply, tested via the "already applied" guard.)

  const un = (await h.action({ action: "change_ai_undo", id, change_id: c.id })).json;
  assert.equal(un.live, "updated");
  b = (await h.sql(`SELECT brief, draft_md FROM customer_requests WHERE id = $1`, [id]))[0];
  assert.deepEqual(b.brief.products.map((p) => p.name), ["Ankara gown", "Lace blouse", "Gele"]);
  assert.equal(b.draft_md, md);
  assert.equal(un.changes.find((x) => x.id === c.id).status, "open");
  // Or you apply it yourself (no customer check): done + the customer is emailed what changed.
  const n3 = h.sent.length;
  const mine = (await h.action({ action: "change_ai_apply", id, change_id: c.id })).json;
  assert.equal(mine.live, "updated", JSON.stringify(mine));
  assert.ok(h.newMail(n3).some((m) => m.to.includes("kemi@gmail.com") && /live/.test(m.subject)));

  // A request that came on WhatsApp: typed in by you, no emails.
  const m2 = h.sent.length;
  const add = (await h.action({ action: "change_add", id, body: "Change our phone to 0809 111 2222" })).json;
  assert.equal(add.changes[0].body, "Change our phone to 0809 111 2222");
  assert.equal(h.newMail(m2).length, 0);
  delete globalThis.__AI_CHANGE_REPLY__;
});

test("Marketing: offer bar + chat, referrals with rewards, ad spend report, QR, showcase, captions, link page", async () => {
  // Offer: shows on the website feed and the chat knows it.
  assert.match((await h.action({ action: "mk_offer_save", offer: { title: "", until: "2099-01-01" } })).json.error, /title/);
  const off = (await h.action({ action: "mk_offer_save", offer: { title: "₦10,000 off Business websites", text: "This month only", until: "2099-12-31" } })).json.offer;
  assert.equal(off.tag, "10000-off-business-websites");
  const feed = (await h.call("GET", "/api/site?greeting=1")).json;
  assert.equal(feed.offer.title, "₦10,000 off Business websites");
  assert.match(feed.offer.ends, /2099-12-31T23:59:59/);
  await h.call("POST", "/api/chat", { sessionId: "s-offer-chat-0001", messages: [{ role: "user", content: "how much?" }] });
  assert.match(globalThis.__LAST_AI_SYSTEM__, /SPECIAL OFFER RUNNING NOW[^"]*10,000 off Business/);
  await h.action({ action: "mk_offer_save", offer: { remove: true } });
  assert.equal((await h.call("GET", "/api/site?greeting=1")).json.offer, null);

  // Referral: a live customer's link brings a business that pays; the reward shows and can be marked given.
  const id = (await h.action({ action: "create", name: "Tunde Bello", contact: "08037778888", business: "Tunde Prints", interest: "Business website" })).json.id;
  await h.sql(`UPDATE customer_requests SET status = 'won', website_url = 'https://tundeprints.com.ng' WHERE id = $1`, [id]);
  const ref = (await h.action({ action: "mk_ref", id })).json;
  assert.equal(ref.code, "TUND" + id);
  assert.match(ref.link, /websites\?ref=TUND/);
  await h.call("POST", "/api/lead", { name: "Bisi Cakes", contact: "08039990000", interest: "Starter website", from: "referral:" + ref.code.toLowerCase() });
  const friend = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.name === "Bisi Cakes");
  await h.admin("PATCH", "/api/requests", { id: friend.id, status: "won" });
  let info = (await h.action({ action: "mk_ref", id })).json;
  assert.equal(info.list.length, 1); assert.equal(info.paid, 1); assert.equal(info.used, 0);
  info = (await h.action({ action: "mk_ref_use", id, n: 1 })).json;
  assert.equal(info.used, 1);
  assert.equal((await h.action({ action: "mk_ref_top" })).json.top[0].paid, 1);
  const mlink = (await h.action({ action: "manage_link", id })).json.url;
  const mp = (await h.call("GET", "/manage?" + mlink.split("?")[1])).text;
  assert.match(mp, /Invite a business/);
  assert.match(mp, new RegExp("ref=" + ref.code));

  // Ad spend: cost per enquiry and per paying customer for a campaign.
  assert.match((await h.action({ action: "mk_spend_add", entry: { tag: "x", amount: "" } })).json.error, /how much/);
  await h.call("POST", "/api/lead", { name: "Kola Ads", contact: "08031110001", interest: "Online Store", from: "facebook / nov-test" });
  await h.call("POST", "/api/lead", { name: "Ife Ads", contact: "08031110002", interest: "Online Store", from: "facebook / nov-test" });
  const kola = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.name === "Kola Ads");
  await h.admin("PATCH", "/api/requests", { id: kola.id, status: "won", quote_amount: 150000 });
  const sp = (await h.action({ action: "mk_spend_add", entry: { platform: "Facebook / Instagram", tag: "nov-test", amount: "₦10,000" } })).json;
  const row = sp.report.find((x) => x.tag === "nov-test");
  assert.equal(row.spend, 10000); assert.equal(row.leads, 2); assert.equal(row.paid, 1);
  assert.equal(row.perLead, 5000); assert.equal(row.perPaid, 10000); assert.equal(row.value, 150000);
  assert.equal((await h.action({ action: "mk_spend_del", spend_id: sp.spend[0].id })).json.spend.length, 0);

  // QR (tagged), showcase (only with the customer's OK), our review list, AI captions.
  const qr = (await h.action({ action: "mk_qr", tag: "Showcase 12" })).json;
  assert.match(qr.url, /utm_source=qr&utm_campaign=showcase-12/); assert.match(qr.svg, /^<svg/);
  let sites = (await h.action({ action: "mk_showcase_list" })).json.sites;
  assert.ok(sites.some((x) => x.id === id && !x.ok));
  sites = (await h.action({ action: "mk_showcase_ok", id, ok: true })).json.sites;
  assert.ok(sites.find((x) => x.id === id).ok);
  // Agreed sites appear on the public "Websites we have built" list; others don't.
  const work = (await h.call("GET", "/api/site?work=1")).json.work;
  assert.deepEqual(work.map((w) => w.name), ["Tunde Prints"]);
  assert.equal(work[0].url, "https://tundeprints.com.ng");
  await h.action({ action: "mk_showcase_ok", id, ok: false });
  assert.equal((await h.call("GET", "/api/site?work=1")).json.work.length, 0, "untick removes it");
  await h.action({ action: "mk_showcase_ok", id, ok: true });
  // Customer sites: "Get a website like this" in the footer, tagged with the site.
  const { buildSiteModel: bsm, renderPage: rp } = await import("../api/_lib/sitegen.mjs");
  const tsite = bsm({ id, interest: "Business website", website_url: "https://tundeprints.com.ng", brief: { business_name: "Tunde Prints" }, draft_md: "# Website text\n## Page: Home\n### Hero\n**Headline:** Hi" });
  const thtml = rp(tsite, "index", { mode: "export", link: (x) => x });
  assert.match(thtml, /Get a website like this/);
  assert.match(thtml, /utm_source=client-site&amp;utm_campaign=tundeprints"/);
  const sc = (await h.action({ action: "mk_showcase", id })).json;
  assert.equal(sc.name, "Tunde Prints"); assert.equal(sc.url, "tundeprints.com.ng"); assert.ok(sc.primary);
  assert.ok(Array.isArray((await h.action({ action: "mk_reviews" })).json.reviews));
  const cap = (await h.action({ action: "mk_captions", topic: "Starter ₦50,000", lang: "Nigerian Pidgin", link: "https://www.sirraddo.com.ng/websites?utm_source=post" })).json;
  assert.equal(cap.captions.length, 3);
  assert.match(globalThis.__LAST_AI_PROMPT__, /in Nigerian Pidgin/);
  assert.match(globalThis.__LAST_AI_PROMPT__, /Never name or compare with any other company/);

  // Video maker: the AI writes the scenes (cleaned up); the browser makes the video.
  const vs = (await h.action({ action: "mk_video_script", idea: "Christmas promo for online stores", lang: "Nigerian Pidgin" })).json.script;
  assert.equal(vs.hook.title, "Your shop never close");
  assert.equal(vs.scenes.length, 2, "an empty scene is dropped");
  assert.equal(vs.scenes[0].points.length, 4, "at most 4 points");
  assert.equal(vs.scenes[1].price, "from ₦150,000");
  assert.equal(vs.tag, "shop-never-close");
  assert.match(globalThis.__LAST_AI_PROMPT__, /in Nigerian Pidgin/);

  // Link-in-bio page.
  const lp = await h.call("GET", "/links");
  assert.equal(lp.status, 200);
  assert.match(lp.text, /sirraddodemo\.com\.ng/);
});

test("monthly/yearly services: invoice, pay online, next due moves on, reminders, receipt; project balance untouched", async () => {
  const id = (await h.action({ action: "create", name: "Musa Bello", contact: "08036660000", interest: "Custom app", email: "musa@gmail.com" })).json.id;
  await h.admin("PATCH", "/api/requests", { id, quote_amount: 300000, status: "won" });
  const t = (await h.action({ action: "doc_link", id })).json.doc_token;
  const today = new Date(Date.now() + 3600000).toISOString().slice(0, 10);
  const in5 = new Date(Date.now() + 3600000 + 5 * 86400000).toISOString().slice(0, 10);
  assert.equal((await h.admin("PATCH", "/api/requests", { id, services: [{ name: "", amount: 1, next_due: today }] })).status, 400);
  let row = (await h.admin("PATCH", "/api/requests", { id, services: [{ name: "Custom system hosting and care", amount: "₦30,000", period: "monthly", next_due: in5 }] })).json;
  const sid = row.services[0].id;
  assert.match(sid, /^[a-z0-9]{6,16}$/);
  // Invoice + pay button
  const inv = await h.call("GET", `/doc?t=${t}&type=service&s=${sid}`);
  assert.equal(inv.status, 200);
  assert.match(inv.text, /Custom system hosting and care — monthly fee/);
  assert.match(inv.text, /for=service-/);
  assert.equal((await h.call("GET", `/doc?t=${t}&type=service&s=nope00`)).status, 404);
  // Pay online: the project deposit is due too, so ask for the service explicitly
  const pg = await h.call("GET", `/pay?t=${t}&for=service-${sid}`);
  assert.match(pg.text, /₦30,000/);
  const start = await h.call("POST", "/api/pay", { t, email: "musa@gmail.com", for: "service-" + sid });
  const ref = refFrom(start.json.url);
  const [body, headers] = signed({ event: "charge.success", data: { reference: ref } });
  await h.call("POST", "/api/paystack-webhook", body, headers);
  await h.call("POST", "/api/paystack-webhook", body, headers);
  row = await h.row(id);
  assert.equal(row.payments.length, 1, "recorded once");
  assert.equal(row.payments[0].kind, "service");
  const next = new Date(in5 + "T12:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1);
  assert.equal(row.services[0].next_due, next.toISOString().slice(0, 10), "next due moved on a month");
  const rc = await h.call("GET", `/doc?t=${t}&type=receipt`);
  assert.match(rc.text, /Custom system hosting and care payment/);
  assert.match((await h.call("GET", `/pay?t=${t}`)).text, /70% deposit|₦210,000/, "the project deposit is still fully due (service payment doesn't count)");
  // Recorded by hand (transfer)
  row = (await h.action({ action: "mk_svc_paid", id, service_id: sid, payment: { amount: "30000" } })).json;
  assert.equal(row.payments.length, 2);
  const next2 = new Date(next.toISOString().slice(0, 10) + "T12:00:00Z"); next2.setUTCMonth(next2.getUTCMonth() + 1);
  assert.equal(row.services[0].next_due, next2.toISOString().slice(0, 10));
  // Reminder: due in 5 days → email with a pay link; daily summary lists it
  await h.admin("PATCH", "/api/requests", { id, services: [{ ...row.services[0], next_due: in5 }] });
  const { runDaily } = await import("../api/_lib/automation.mjs");
  const n = h.sent.length;
  await runDaily(new Date(), { once: false });
  const mails = h.newMail(n);
  assert.ok(mails.some((m) => m.to.includes("musa@gmail.com") && /Custom system hosting and care: payment due/.test(m.subject) && /for=service-/.test(m.html)), "client reminded with a pay link");
  assert.ok(mails.some((m) => /Monthly \/ yearly service fees due/.test(m.html)), "you see it in the daily summary");
  // Stop: no more reminders
  await h.admin("PATCH", "/api/requests", { id, services: [{ ...row.services[0], next_due: in5, active: false }] });
  assert.match((await h.call("GET", `/pay?t=${t}&for=service-${sid}`)).text, /₦210,000|Nothing to pay/);
});

test("demand: the chat and forms tag people who want customer accounts or a custom system", async () => {
  const { detectWants } = await import("../api/_lib/store.mjs");
  assert.equal(detectWants("I want my customers to login and see order history"), "customer_accounts");
  assert.equal(detectWants("need saved delivery addresses for buyers"), "customer_accounts");
  assert.equal(detectWants("a school portal where students check results"), "custom_system");
  assert.equal(detectWants("a nice bakery website"), null);
  await h.call("POST", "/api/lead", { name: "Ife Store", contact: "08031234321", interest: "Online Store", details: "Customers should have accounts with order history" });
  const all = (await h.admin("GET", "/api/requests?view=all")).json.requests;
  assert.equal(all.find((r) => r.name === "Ife Store").wants, "customer_accounts");
  const d = (await h.action({ action: "mk_demand" })).json.demand;
  assert.ok(d.some((x) => x.name === "Ife Store" && x.wants === "customer_accounts"));
  const { SAVE_TOOL } = await import("../api/_lib/knowledge.mjs");
  assert.deepEqual(SAVE_TOOL.input_schema.properties.needs.enum, ["customer_accounts", "custom_system"]);
});

test("database usage watch: reads Neon, shows in admin, emails once at 70% and once at 90%", async () => {
  assert.equal((await h.action({ action: "mk_neon" })).json.configured, false);
  process.env.NEON_API_KEY = "napi_test";
  try {
    const nu = await import("../api/_lib/neon-usage.mjs");
    globalThis.__NEON_CU_SECONDS__ = 3600 * 20;
    const j = (await h.action({ action: "mk_neon", refresh: true })).json;
    assert.equal(j.usage.cuh, 20); assert.equal(j.usage.storageGB, 0.12); assert.equal(j.usage.project, "proj-test");
    let n = h.sent.length;
    await nu.checkNeonUsage({ plan: "free" });
    assert.equal(h.newMail(n).length, 0, "no warning at 20%");
    globalThis.__NEON_CU_SECONDS__ = 3600 * 75;
    n = h.sent.length;
    await nu.checkNeonUsage({ plan: "free" }); await nu.checkNeonUsage({ plan: "free" });
    assert.equal(h.newMail(n).filter((m) => /Database at 75%/.test(m.subject)).length, 1, "70% warning once");
    globalThis.__NEON_CU_SECONDS__ = 3600 * 93;
    n = h.sent.length;
    await nu.checkNeonUsage({ plan: "free" });
    assert.ok(h.newMail(n).some((m) => /Database at 93%/.test(m.subject) && /Upgrade today/.test(m.html)), "90% warning");
    n = h.sent.length;
    await nu.checkNeonUsage({ plan: "launch" });
    assert.equal(h.newMail(n).length, 0, "no warnings on Launch");
    assert.equal((await h.action({ action: "mk_neon" })).json.usage.cuh, 93);
  } finally { delete process.env.NEON_API_KEY; delete globalThis.__NEON_CU_SECONDS__; }
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
  assert.equal(h.newMail(n).length, 1, "only the store owner (our customer) is emailed");
  const thanks = await h.call("GET", `/api/shop?paid=1&ref=${co.json.ref}`);
  assert.match(thanks.text, /data-save="png"/);
  assert.match(thanks.text, /data-save="pdf"/);
  assert.match(thanks.text, /data-save="share"/);
  assert.match(thanks.text, /Copy receipt link/);
  assert.match(thanks.text, /"link":"[^"]*receipt=1"/, "the link to get it again later");
  assert.match(thanks.text, /id="rcpt">\{/);
  assert.doesNotMatch(thanks.text, /on its way/);
  const page = await h.call("GET", `/api/shop?ref=${co.json.ref}&receipt=1`);
  assert.match(page.text, /Save as picture/);
  assert.match(page.text, /₦12,500/, "unit price shown");
  assert.ok(!h.sent.some((m) => m.to.includes("bisi@x.com")), "buyers are never emailed by us");

  const briefOf = async () => (await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]))[0].brief;
  // Stock: the owner sets 3 in their Manage link; a cart of 5 is refused; a paid order of 2 leaves 1; buying the last one sells it out.
  const link = (await h.action({ action: "manage_link", id })).json.url;
  const mpath = "/manage?" + link.split("?")[1];
  const setStock = (v) => fetch(h.base + mpath, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ price_0: "₦12,500", price_1: "from 20k", stock_0: v, phone: "08031112222" }) }).then((r) => r.text());
  assert.match(await setStock("abc"), /whole number/);
  assert.match(await setStock("3"), /Saved ✓/);
  assert.match((await h.call("GET", mpath)).text, /name="stock_0" value="3"/);
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.stock[0], 3, "live stock for the website");
  const tooMany = await h.call("POST", "/api/shop", { s: tok, items: [{ i: 0, q: 5 }], buyer }, J);
  assert.equal(tooMany.status, 409);
  assert.match(tooMany.json.error, /Only 3 Ankara 6 yards left/);
  const co2 = await h.call("POST", "/api/shop", { s: tok, items: [{ i: 0, q: 2 }], buyer }, J);
  const n2 = h.sent.length;
  await h.call("GET", `/api/shop?paid=1&ref=${co2.json.ref}`);
  assert.equal((await briefOf()).products[0].stock, "1");
  assert.match(h.newMail(n2)[0].html, /Stock left:<\/b> Ankara 6 yards: 1/);
  const co3 = await h.call("POST", "/api/shop", { s: tok, items: [{ i: 0, q: 1 }], buyer }, J);
  await h.call("GET", `/api/shop?paid=1&ref=${co3.json.ref}`);
  assert.equal((await briefOf()).products[0].stock, "0");
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.stock[0], 0);
  assert.match((await h.call("POST", "/api/shop", { s: tok, items: [{ i: 0, q: 1 }], buyer }, J)).json.error, /empty/, "sold out can't be bought");
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const site = buildSiteModel({ ...(await h.row(id)), brief: await briefOf() });
  assert.match(renderPage(site, site.pages[0].slug, { mode: "export", link: (x) => x }), /Sold out/);
  // Restock: typing a number above 0 brings it back.
  assert.match(await setStock("10"), /Saved ✓/);
  const b2 = (await briefOf()).products[0];
  assert.equal(b2.stock, "10");
  assert.ok(!b2.soldout);
  // You add a product after launch by saving their project form: stock the owner set stays.
  await h.action({ action: "brief_link", id });
  const [{ brief_token: bt }] = await h.sql(`SELECT brief_token FROM customer_requests WHERE id = $1`, [id]);
  assert.ok(bt);
  {
    const cur = await briefOf();
    const sv = await h.call("POST", "/api/brief", { t: bt, answers: { ...cur, products: [...cur.products.map(({ stock, soldout, ...p }) => p), { name: "New Gele", price: "8000" }] } }, J);
    assert.equal(sv.status, 200, sv.text);
    const after = await briefOf();
    assert.equal(after.products[0].stock, "10", "Manage stock kept when the form is saved again");
    assert.ok(after.products.some((p) => p.name === "New Gele"));
  }
});

test("daily run completes without errors", async () => {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => { errors.push(a.join(" ")); orig(...a); };
  // A live site built with an older look is republished by the morning job (no unpublished edits on it).
  await h.sql(`UPDATE customer_requests SET hosting = hosting || '{"look":"old"}'::jsonb, draft_at = NULL, design_at = NULL WHERE id = $1`, [ada]);
  const before = h.CF.deployments.length;
  try { await h.daily(); } finally { console.error = orig; }
  assert.deepEqual(errors.filter((e) => /daily cron failed/.test(e)), []);
  assert.ok(h.CF.deployments.length > before, "old-look site republished");
  assert.notEqual((await h.row(ada)).hosting.look, "old");
  assert.ok(h.sent.some((m) => /Your website has been improved/.test(m.subject) && /What's new/.test(m.html) && /Don't like something/.test(m.html)), "the owner is told what changed");
  // "Ask me first": only an email, the site is not changed; asked once per new version.
  await h.sql(`UPDATE customer_requests SET hosting = hosting || '{"look":"old","lookMode":"ask"}'::jsonb WHERE id = $1`, [ada]);
  const d0 = h.CF.deployments.length, n0 = h.sent.length;
  await h.sql(`DELETE FROM settings WHERE key LIKE '\_daily%'`).catch(() => {});
  try { await h.daily(); } finally { console.error = orig; }
  assert.equal(h.CF.deployments.length, d0, "not republished");
  assert.ok(h.newMail(n0).some((m) => /A new version of your website is ready/.test(m.subject)));
  assert.equal((await h.row(ada)).hosting.lookAsked !== undefined, true);
  // Restore previous version: two publishes are kept, so the earlier one can be put back.
  await h.sql(`UPDATE customer_requests SET hosting = hosting || '{"lookMode":"auto"}'::jsonb WHERE id = $1`, [ada]);
  await h.action({ action: "host_publish", id: ada, force: true });
  const hb = (await h.row(ada)).hosting;
  assert.ok(hb.history.length >= 2, "versions kept");
  const rb = await h.action({ action: "host_rollback", id: ada });
  assert.equal(rb.status, 200, rb.text);
  assert.ok(h.CF.rolledBack.includes(hb.history[1].id), "the earlier deployment is live again");
  const ha = rb.json.row.hosting;
  assert.equal(ha.deploymentId, hb.history[1].id);
  assert.equal(ha.lookMode, "ask", "7am won't undo it");
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
  assert.ok(await weeklyBackup(new Date("2030-11-18T06:00:00Z")), "Monday");
  assert.equal(await weeklyBackup(new Date("2030-11-18T09:00:00Z")), null, "once per Monday");
  assert.equal(await weeklyBackup(new Date("2030-11-19T06:00:00Z")), null, "not again on Tuesday");
  assert.ok(await weeklyBackup(new Date("2030-11-26T06:00:00Z")), "Monday 25th missed: Tuesday catches up");
  assert.equal(await weeklyBackup(new Date("2030-11-27T06:00:00Z")), null, "and only once");
  const mail = h.newMail(n);
  assert.equal(mail.length, 2);
  assert.match(mail[0].attachments[0].filename, /sirraddo-backup-2030-11-18\.json\.gz/);
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
  // Everything the customer could ask for later is in the pack.
  assert.match(page, /You can have 3 more at no extra cost/, "Business includes 5 addresses, 2 set up");
  assert.match(page, /When you reply/);
  assert.match(page, /What belongs to you/);
  assert.match(page, /domain transfer code/);
  assert.match(page, /Need help\?/);
});

test("handover checklist: admin rows and the Assistant say exactly what's left", async () => {
  await h.sql(`UPDATE customer_requests SET brief = COALESCE(brief, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ email_names_5: "info@, sales@, bookings@", gbp_gmail: "adasalon@gmail.com" }), ada]);
  const row = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.id === ada);
  const byKey = Object.fromEntries(row.handover_check.map((i) => [i.key, i]));
  assert.equal(byKey.email.done, false, "bookings@ asked for but not set up");
  assert.match(byKey.email.fix, /bookings@/);
  assert.match(byKey.email.label, /2 of 5/);
  assert.equal(byKey.gbp.done, false);
  assert.match(byKey.gbp.fix, /adasalon@gmail\.com/);
  assert.match(byKey.gbp.tell, /copy and paste this:\n"Ada Salon [^"]+\."/, "the description from their website text is in the message itself");
  assert.doesNotMatch(byKey.gbp.tell, /I'll send you/);
  assert.doesNotMatch(byKey.gbp.tell, /Manager/, "we guide them; we don't ask to be added");
  assert.match(byKey.gbp.tell, /keep it strong with the short guide in your handover pack/);
  assert.match(byKey.gbp.tell2, /keep your Google Business Profile strong yourself[\s\S]*Every month:[\s\S]*Reply to every new Google review/, "a do-it-yourself guide to send");
  assert.ok(byKey.gbp.steps.some((t) => /If they get stuck/.test(t)));
  const saved = await h.admin("PATCH", "/api/requests", { id: ada, handover: { ...row.handover, gbp_done: true } });
  assert.equal(saved.json.handover_check.find((i) => i.key === "gbp").done, true, "PATCH replies carry the checklist too");
  const { assistantSystem } = await import("../api/_lib/assistant.mjs");
  const sys = await assistantSystem(ada);
  assert.match(sys, /HANDOVER CHECKLIST/);
  assert.match(sys, /✗ Business email: 2 of 5 set up/);
  assert.match(sys, /✓ Google Business Profile/);
});

test("store checklist: Paystack help request and test keys are flagged", async () => {
  const id = (await h.action({ action: "create", name: "Bisi Store", contact: "08039990000", interest: "Online Store", email: "bisi@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET status = 'won', quote_amount = 150000, payments = $1::jsonb, brief = $2::jsonb WHERE id = $3`,
    [JSON.stringify([{ amount: 150000, date: "2026-11-15" }]), JSON.stringify({ paystack: "Please help me set one up", email_names_5: "info" }), id]);
  let row = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.id === id);
  let pay = row.handover_check.find((i) => i.key === "paystack");
  assert.equal(pay.done, false);
  assert.match(pay.tell, /BVN/);
  assert.ok(pay.steps.length >= 3, "how-to steps");
  row = (await h.admin("PATCH", "/api/requests", { id, handover: { whatsapp_only: true } })).json;
  assert.equal(row.handover_check.find((i) => i.key === "paystack").done, true, "WhatsApp-only stores don't need Paystack");
  const { assistantSystem } = await import("../api/_lib/assistant.mjs");
  assert.match(await assistantSystem(null), /Bisi Store.*still to do: .*Business email/);
});

test("service notices: scheduled banner with {date}/{from}/{to}, hides itself after", async () => {
  const bad = await h.action({ action: "notice_save", notice: { kind: "upgrade", message: "Upgrade on {date}" } });
  assert.equal(bad.status, 400, "placeholders need a date");
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const r = await h.action({ action: "notice_save", notice: { kind: "upgrade", title: "Planned upgrade",
    message: "We're upgrading on {date} from {from} to {to}.", date: day, from: "22:00", to: "02:00" } });
  assert.equal(r.status, 200);
  const n = r.json.notices[0];
  assert.equal(n.status, "showing", "default: shows from 3 days before");
  assert.match(n.preview, /from 10pm to 2am on /, "overnight window ends the next morning");
  let pub = (await h.call("GET", "/api/site?greeting=1")).json;
  assert.equal(pub.notices.length, 1);
  assert.match(pub.notices[0].message, /10pm/);
  await h.action({ action: "notice_save", notice: { ...n, on: false } });
  pub = (await h.call("GET", "/api/site?greeting=1")).json;
  assert.equal(pub.notices.length, 0, "hidden");
  const { noticeStatus } = await import("../api/_lib/notices.mjs");
  assert.equal(noticeStatus({ ...n, on: true }, new Date(Date.now() + 5 * 86400000)), "ended");
  await h.action({ action: "notice_delete", noticeId: n.id });
  assert.equal((await h.action({ action: "notices" })).json.notices.length, 0);
});

test("design uses the websites the customer likes and the designer's notes (inspiration, not a copy)", async () => {
  await h.sql(`UPDATE customer_requests SET brief = COALESCE(brief, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
    [JSON.stringify({ examples: "https://example-salon.com - love the dark header and big photos" }), ada]);
  const row = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.id === ada);
  assert.match(row.brief_wants.examples, /example-salon/);
  let sent = "";
  const prev = globalThis.fetch;
  globalThis.fetch = (u, o) => { if (String(u).includes("generativelanguage")) sent += o.body; return prev(u, o); };
  try { await h.action({ action: "design", id: ada, note: "rounded gold buttons" }); } finally { globalThis.fetch = prev; }
  assert.match(sent, /example-salon/);
  assert.match(sent, /rounded gold buttons/);
  assert.match(sent, /never copy/);
});

test("Google Search Console: a live domain is verified, added, sitemap submitted and owners added by itself", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({ client_email: "sa@test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  try {
    const id = (await h.action({ action: "create", name: "Kunle Prints", contact: "08031110000", interest: "Business website", email: "kunle@gmail.com" })).json.id;
    await h.sql(`UPDATE customer_requests SET hosting = $1::jsonb WHERE id = $2`, [JSON.stringify({ zoneId: "zone-kp", domain: "kunleprints.com.ng", zoneStatus: "active", attached: true, project: "kunle-prints" }), id]);
    const G = globalThis.__GOOGLE__;
    G.verifyFails = 1; // the TXT record hasn't spread yet on the first try
    let gs = (await h.action({ action: "host_check", id })).json.row.hosting.google;
    assert.equal(gs.step, "dns");
    assert.match(gs.error, /TXT record not found/);
    assert.ok(h.CF.dns.some((r) => r.zone === "zone-kp" && r.type === "TXT" && r.content === "google-site-verification=abc123"), "TXT record added");
    gs = (await h.action({ action: "host_check", id })).json.row.hosting.google;
    assert.equal(gs.step, "done", gs.error || "");
    assert.ok(gs.owners.includes("kunle@gmail.com") && gs.owners.includes("info@sirraddo.com.ng"), "owner and us added");
    assert.ok(G.calls.some((c) => /sitemaps\/https%3A%2F%2Fkunleprints\.com\.ng%2Fsitemap\.xml/.test(c)), "sitemap submitted");
    const n = G.calls.length;
    await h.action({ action: "host_check", id });
    assert.equal(G.calls.length, n, "nothing more once done");
    assert.equal(h.CF.dns.filter((r) => r.zone === "zone-kp" && r.type === "TXT").length, 1, "TXT added once");
    // A site already live before this was set up is submitted by the 7am job too.
    const id2 = (await h.action({ action: "create", name: "Old Site", contact: "08031110001", interest: "Business website" })).json.id;
    await h.sql(`UPDATE customer_requests SET hosting = $1::jsonb WHERE id = $2`, [JSON.stringify({ zoneId: "zone-old", domain: "oldsite.com.ng", zoneStatus: "active", attached: true, project: "old-site", publishedAt: "2026-11-01T00:00:00Z", look: "x", lookMode: "ask", lookAsked: "x" }), id2]);
    const { dailyHosting } = await import("../api/_lib/golive.mjs");
    await dailyHosting([await h.row(id2)]);
    assert.equal((await h.row(id2)).hosting.google?.step, "done", "already-live site submitted by the daily job");
  } finally { delete process.env.GOOGLE_SERVICE_ACCOUNT; }
});

test("Website chat knows our whole published FAQ (kept in step by the build) and recent features", async () => {
  const { readFile } = await import("node:fs/promises");
  const html = await readFile(new URL("../websites.html", import.meta.url), "utf8");
  const questions = [...html.matchAll(/<summary>([^<]+)<\/summary>/g)].map((m) => m[1].replace(/&amp;/g, "&").trim());
  assert.ok(questions.length >= 15);
  await h.call("POST", "/api/chat", { sessionId: "s-test-faq-00001", messages: [{ role: "user", content: "Can I have a .com?" }] });
  const sys = globalThis.__LAST_AI_SYSTEM__ || "";
  for (const q of questions) assert.ok(sys.includes(q.replace(/"/g, '\\"')) || sys.includes(q), `chat doesn't know: ${q}`);
  for (const fact of ["Manage", "Ask me first", "Search Console", ".com.ng", "sirraddodemo.com.ng", "receipt"]) assert.ok(sys.includes(fact), `chat doesn't know: ${fact}`);
});
