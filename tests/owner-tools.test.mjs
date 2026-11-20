// The owner tools that staff guides and the Playbook send people to: each one must really exist and work.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });
const J = { "content-type": "application/json" };

async function client(name, extra = {}) {
  const id = (await h.action({ action: "create", name, contact: "0803" + String(Math.floor(1e7 + Math.random() * 8e7)), interest: "Business website", email: name.split(" ")[0].toLowerCase() + "@gmail.com", ...extra })).json.id;
  return id;
}

test("refunds: recorded as a negative payment with a reason; the paid total and receipt show it", async () => {
  const id = await client("Refund Rita");
  await h.admin("PATCH", "/api/requests", { id, quote_amount: 100000, payments: [{ date: "2026-11-01", amount: 70000, kind: "project" }] });
  const noReason = await h.admin("PATCH", "/api/requests", { id, payments: [{ date: "2026-11-01", amount: 70000 }, { date: "2026-11-05", amount: -35000, refund: true }] });
  assert.equal(noReason.status, 400);
  assert.match(noReason.json.error, /why the refund/);
  const ok = await h.admin("PATCH", "/api/requests", { id, payments: [{ date: "2026-11-01", amount: 70000 }, { date: "2026-11-05", amount: 35000, refund: true, note: "Cancelled before the preview (50%)" }] });
  assert.equal(ok.status, 200, ok.text);
  const row = await h.row(id);
  assert.equal(row.payments[1].amount, -35000);
  assert.equal(row.payments[1].refund, true);
  const t = (await h.action({ action: "doc_link", id })).json.doc_token;
  const page = await h.call("GET", `/doc?t=${t}&type=receipt`);
  assert.match(page.text, /Refund paid back to you/);
  assert.match(page.text, /35,000/);
});

test("instalments: deposit share per job and a next instalment; invoices and pay links follow them", async () => {
  const { amountDue } = await import("../api/_lib/paystack.mjs");
  const id = await client("Instalment Ike");
  assert.equal((await h.admin("PATCH", "/api/requests", { id, deposit_pct: 5 })).status, 400);
  await h.admin("PATCH", "/api/requests", { id, quote_amount: 200000, deposit_pct: 50 });
  let r = await h.row(id);
  assert.equal(r.deposit_pct, 50);
  assert.deepEqual([amountDue(r).for, amountDue(r).amount], ["deposit", 100000]);
  assert.match(amountDue(r).label, /50% deposit/);
  // 50% paid: the project form link is made by itself (the deposit you set is reached).
  await h.admin("PATCH", "/api/requests", { id, payments: [{ date: "2026-11-02", amount: 100000 }] });
  r = await h.row(id);
  assert.ok(r.brief_token, "project form ready at the 50% deposit");
  assert.equal(amountDue(r).amount, 100000, "no next instalment set: the whole balance");
  await h.admin("PATCH", "/api/requests", { id, next_payment: 60000 });
  r = await h.row(id);
  assert.deepEqual([amountDue(r).for, amountDue(r).amount], ["balance", 60000]);
  assert.match(amountDue(r).label, /Next instalment/);
  await h.admin("PATCH", "/api/requests", { id, payments: [{ date: "2026-11-02", amount: 100000 }, { date: "2026-11-10", amount: 60000 }] });
  r = await h.row(id);
  assert.equal(amountDue(r).amount, 40000, "then the last 20%");
  // Back to the usual 70% is stored as "not set".
  await h.admin("PATCH", "/api/requests", { id, deposit_pct: 70 });
  assert.equal((await h.row(id)).deposit_pct, null);
});

test("white label, stop renewals, delete chat, company documents, full delete", async () => {
  const id = await client("Agency Ade");
  const md = "# Website text\n## Page: Home\n### Hero\nAde Prints\nIbadan.";
  await h.sql(`UPDATE customer_requests SET brief = '{"business_name":"Ade Prints"}'::jsonb, draft_md = $1, status = 'won', live_on = CURRENT_DATE, renewal_amount = 40000, renewal_due = CURRENT_DATE + 20 WHERE id = $2`, [md, id]);
  await h.admin("PATCH", "/api/requests", { id, services: [{ name: "Care plan", amount: 5000, period: "monthly", next_due: "2026-12-01" }] });
  assert.equal((await h.action({ action: "host_publish", id, force: true })).status, 200);
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const render = async () => { const row = await h.row(id); const [{ brief }] = await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]); const site = buildSiteModel({ ...row, brief, draft_md: md }); return renderPage(site, site.pages[0].slug, { mode: "export", link: (x) => x }); };
  assert.match(await render(), /Website by/);
  const before = h.CF.deployments.length;
  assert.equal((await h.action({ action: "site_credit", id, on: false })).status, 200);
  assert.doesNotMatch(await render(), /Website by|Get a website like this/);
  assert.ok(h.CF.deployments.length > before, "the live site was updated");
  await h.action({ action: "site_credit", id, on: true });
  assert.match(await render(), /Website by/);
  // Stop renewals & services.
  const st = await h.action({ action: "stop_renewals", id, reason: "Moved away" });
  assert.equal(st.status, 200, st.text);
  const r = await h.row(id);
  assert.equal(r.renewal_due, null);
  assert.equal(r.renewal_amount, null);
  assert.equal(r.services[0].active, false);
  assert.match(r.notes, /Renewals and services stopped .*Moved away/);
  // Staff can't use these.
  const { loginCredential } = await import("../api/_lib/staff.mjs");
  const sa = (await h.action({ action: "staff_add", staff: { name: "Sam Helper", username: "samhelper", perms: ["customers", "changes", "marketing", "money", "build"] } })).json;
  await h.sql(`UPDATE staff SET must_change = false WHERE id = $1`, [sa.staff.id]);
  const staff = (body) => h.call("POST", "/api/requests", body, { ...J, authorization: "Bearer " + loginCredential("samhelper", sa.password) });
  for (const a of ["site_credit", "stop_renewals", "shop_erase", "chat_delete", "company_doc_add", "shop_check"]) assert.equal((await staff({ action: a, id })).status, 403, a);
  const sp = (body) => h.call("PATCH", "/api/requests", body, { ...J, authorization: "Bearer " + loginCredential("samhelper", sa.password) });
  assert.equal((await sp({ id, payments: [{ date: "2026-11-03", amount: 5000, refund: true, note: "x" }] })).status, 403, "staff can't record a refund");
  assert.equal((await sp({ id, payments: [{ date: "2026-11-03", amount: 5000 }] })).status, 200, "but Money staff can record a payment");
  // Delete one chat.
  await h.sql(`INSERT INTO chat_logs (session_id, messages) VALUES ('chat-delete-me-1', '[{"role":"user","content":"hi, delete my data"}]'::jsonb)`);
  assert.equal((await h.action({ action: "chat_delete", session_id: "chat-delete-me-1" })).json.ok, true);
  assert.equal((await h.sql(`SELECT 1 FROM chat_logs WHERE session_id = 'chat-delete-me-1'`)).length, 0);
  // Company documents.
  assert.match((await h.action({ action: "company_doc_add", title: "CAC certificate", type: "text/plain", data: "aGk=" })).json.error, /PDF or a photo/);
  const add = await h.action({ action: "company_doc_add", title: "CAC certificate", type: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") });
  assert.equal(add.status, 200, add.text);
  assert.equal(add.json.docs[0].title, "CAC certificate");
  assert.equal((await h.action({ action: "company_docs" })).json.docs.length, 1);
  assert.equal((await h.action({ action: "company_doc_remove", url: add.json.docs[0].url })).json.docs.length, 0);
  // Deleting a customer removes everything linked to them.
  await h.sql(`INSERT INTO site_reviews (request_id, name, stars, body, status) VALUES ($1, 'Bola', 5, 'Great', 'shown')`, [id]).catch(() => {});
  await h.sql(`INSERT INTO store_users (request_id, name, username, pass_hash) VALUES ($1, 'Ade Prints', 'adeprints', 'x')`, [id]);
  assert.equal((await h.admin("DELETE", `/api/requests?id=${id}`)).status, 200);
  for (const t of ["store_users", "site_reviews", "change_requests"]) assert.equal((await h.sql(`SELECT 1 FROM ${t} WHERE request_id = $1`, [id])).length, 0, t);
});

test("store: check an unfinished payment, and delete a buyer's data (you or the store owner)", async () => {
  const brief = { business_name: "Bimpe Bags", products: [{ name: "Tote", price: "₦8,000" }] };
  const id = (await h.action({ action: "create", name: "Bimpe", contact: "08031119999", interest: "Online Store", email: "bimpe@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, draft_md = $2 WHERE id = $3`, [JSON.stringify(brief), "# Website text\n## Page: Home\n### Hero\nBags\nIbadan.", id]);
  await h.action({ action: "host_publish", id, force: true });
  await h.action({ action: "shop_settings", id, secretKey: ["sk", "live", "BIMPEbimpeBIMPEbimpe1234"].join("_"), accounts: true, delivery: { on: true } });
  const tok = (await h.row(id)).shop.token;
  const shop = (b) => h.call("POST", "/api/shop", b, J);
  // Paid on Paystack but the buyer never came back to the page: Check payment confirms it.
  const co = (await shop({ s: tok, items: [{ i: 0, q: 1 }], buyer: { name: "Kunle", phone: "08032223333", email: "k@x.com" } })).json;
  assert.equal((await h.sql(`SELECT status FROM store_orders WHERE ref = $1`, [co.ref]))[0].status, "pending");
  const chk = await h.action({ action: "shop_check", id, ref: co.ref });
  assert.equal(chk.json.order.status, "paid", chk.text);
  // The store owner can do the same in My store.
  const sa = await import("../api/_lib/storeaccounts.mjs");
  const login = (await h.action({ action: "store_login", id, do: "create" })).json;
  const cred = ["ou", Buffer.from(login.login.username).toString("base64url"), Buffer.from(login.password).toString("base64url")].join(".");
  const tokn = (await h.call("POST", "/api/mystore", { action: "my_password", current: login.password, password: "BimpeBags2026" }, { ...J, authorization: "Bearer " + cred })).json.token;
  const my = (action, body = {}) => h.call("POST", "/api/mystore", { action, ...body }, { ...J, authorization: "Bearer " + tokn });
  const co2 = (await shop({ s: tok, items: [{ i: 0, q: 2 }], buyer: { name: "Kunle", phone: "08032223333", email: "k@x.com" } })).json;
  assert.ok((await my("orders", { status: "pending" })).json.orders.some((o) => o.ref === co2.ref), "unfinished payments are listed");
  assert.equal((await my("check", { ref: co2.ref })).json.order.status, "paid");
  // A buyer with an account asks for their data to be deleted.
  const acc = (await shop({ s: tok, action: "signup", name: "Kunle Ade", phone: "08032223333", password: "kunle123" })).json;
  await shop({ s: tok, t: acc.token, method: "delivery", items: [{ i: 0, q: 1 }], buyer: { name: "Kunle Ade", phone: "08032223333", address: "Ring Road" } });
  const buyers = (await my("customers")).json.customers;
  const del = (await my("customer_delete", { buyer_id: buyers[0].id })).json;
  assert.equal(del.account, true);
  assert.equal(del.orders, 3, "every order with their phone");
  const rows = await h.sql(`SELECT buyer, total FROM store_orders WHERE request_id = $1`, [id]);
  assert.ok(rows.every((o) => o.buyer.phone === "" && /Removed/.test(o.buyer.name)), "details removed");
  assert.ok(rows.every((o) => o.total > 0), "amounts kept");
  assert.equal((await my("customers")).json.customers.length, 0);
  // You can do it too, by phone, from the client card.
  await shop({ s: tok, method: "delivery", items: [{ i: 0, q: 1 }], buyer: { name: "Tayo", phone: "+234 803 444 5555", address: "Bodija" } });
  assert.equal((await h.action({ action: "shop_erase", id, phone: "08034445555" })).json.orders, 1);
  assert.ok(sa.normPhone);
});

test("the change-request AI can change colours", async () => {
  const { applyOps } = await import("../api/_lib/ai-change.mjs");
  const row = { id: 1, interest: "Business website", brief: { business_name: "X", colours: "blue" }, draft_md: "# Website text\n## Page: Home\nHi", brief_files: {} };
  const plain = applyOps(row, [{ op: "set_info", field: "colours", value: "navy and gold" }], []);
  assert.equal(plain.brief.colours, "navy and gold");
  assert.ok(plain.results[0].ok);
  const designed = applyOps({ ...row, design_css: "body{}" }, [{ op: "set_info", field: "colours", value: "navy and gold" }], []);
  assert.match(designed.results[0].text, /Add another AI design/);
});
