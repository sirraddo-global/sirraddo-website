// Online Stores: every way to pay (each a switch), the store owner's own admin (/mystore) and buyer accounts
// (Standard Store). Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";

let h;
before(async () => { h = await startHarness(); process.env.GOOGLE_SIGNIN_CLIENT_ID = "test-client.apps.googleusercontent.com"; });
after(async () => { await h.close(); });

const J = { "content-type": "application/json" };
const fakeKey = (body) => ["sk", "live", body].join("_");
const flwKey = (body) => ["FLWSECK", body].join("-") + "-X";
const shop = (body) => h.call("POST", "/api/shop", body, J);

async function makeStore(name, opts = {}) {
  const brief = { business_name: name, whatsapp: "08031112222", products: [{ name: "Ankara", price: "₦10,000", stock: "5" }, { name: "Lace", price: "₦20,000" }] };
  const id = (await h.action({ action: "create", name: name + " Owner", contact: "08031112222", interest: "Online Store", email: name.replace(/\W/g, "").toLowerCase() + "@gmail.com" })).json.id;
  await h.sql(`UPDATE customer_requests SET brief = $1::jsonb, draft_md = $2 WHERE id = $3`, [JSON.stringify(brief), "# Website text\n## Page: Home\n### Hero\nFabrics\nIbadan.\n## Page: Shop\n### Products\nOur fabrics.", id]);
  assert.equal((await h.action({ action: "host_publish", id, force: true })).status, 200);
  if (opts.paystack) assert.equal((await h.action({ action: "shop_settings", id, secretKey: fakeKey("STOREstoreSTOREstore" + id + "abcd") })).status, 200);
  return { id, tok: (await h.row(id)).shop.token };
}
const stockOf = async (id, i = 0) => (await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]))[0].brief.products[i].stock;
const ownerLogin = (u, p) => ["ou", Buffer.from(u).toString("base64url"), Buffer.from(p).toString("base64url")].join(".");
const my = (cred) => (action, body = {}) => h.call("POST", "/api/mystore", { action, ...body }, { ...J, authorization: "Bearer " + cred });

test("payment options: each is a switch; bank transfer and pay on delivery keep stock, the owner confirms; old pages still pay online", async () => {
  const { id, tok } = await makeStore("Tola Fabrics", { paystack: true });
  const buyer = { name: "Bisi Ade", phone: "08030000001", email: "bisi@x.com", address: "12 Ring Road, Ibadan" };
  let cfg = (await h.call("GET", `/api/shop?config=1&s=${tok}`)).json;
  assert.deepEqual(cfg.methods, { paystack: true, flutterwave: false, transfer: false, delivery: false });
  // Old store pages (no method) still pay online with Paystack.
  const old = await shop({ s: tok, items: [{ i: 1, q: 1 }], buyer });
  assert.equal(old.json.method, "paystack");
  // Bank transfer needs complete details; then it's on.
  assert.match((await h.action({ action: "shop_settings", id, transfer: { on: true, bank: "GTBank", name: "Tola Fabrics", number: "0123" } })).json.error, /10-digit/);
  assert.equal((await h.action({ action: "shop_settings", id, transfer: { on: true, bank: "GTBank", name: "Tola Fabrics", number: "0123456789" }, delivery: { on: true } })).status, 200);
  cfg = (await h.call("GET", `/api/shop?config=1&s=${tok}`)).json;
  assert.deepEqual(cfg.methods, { paystack: true, flutterwave: false, transfer: true, delivery: true });
  assert.ok(!JSON.stringify(cfg).includes("0123456789"), "the account number isn't in the public settings");
  // Transfer: the order waits, stock is kept for the buyer, the owner is emailed, the page shows the bank details.
  const n = h.sent.length;
  const t = await shop({ s: tok, method: "transfer", items: [{ i: 0, q: 2 }], buyer: { ...buyer, email: "" } });
  assert.equal(t.status, 200, t.text);
  assert.equal(await stockOf(id), "3");
  assert.ok(h.newMail(n).some((m) => /bank transfer, not paid yet/.test(m.subject) && /Don't send the items until you see the money/.test(m.html)));
  const page = await h.call("GET", `/api/shop?ref=${t.json.ref}`);
  assert.match(page.text, /0123456789/);
  assert.match(page.text, /GTBank/);
  assert.match(page.text, /I've paid/);
  assert.match(page.text, /₦20,000/);
  // The buyer says they paid: the owner is told to check their bank app.
  const n2 = h.sent.length;
  assert.equal((await shop({ action: "claim", ref: t.json.ref, from: "Bisi Ade", note: "Opay 2pm" })).status, 200);
  assert.ok(h.newMail(n2).some((m) => /says they paid/.test(m.subject) && /Check your bank app first/.test(m.html)));
  assert.match((await h.call("GET", `/api/shop?ref=${t.json.ref}`)).text, /You told Tola Fabrics you've paid/);
  // Pay on delivery needs an address.
  assert.match((await shop({ s: tok, method: "delivery", items: [{ i: 0, q: 1 }], buyer: { ...buyer, address: "" } })).json.error, /delivery address/);
  const d = await shop({ s: tok, method: "delivery", items: [{ i: 0, q: 1 }], buyer });
  assert.equal(await stockOf(id), "2");
  assert.match((await h.call("GET", `/api/shop?ref=${d.json.ref}`)).text, /pay on delivery/i);
  // Switching an option off takes it off the website straight away.
  await h.action({ action: "shop_settings", id, delivery: { on: false }, paystackOn: false });
  cfg = (await h.call("GET", `/api/shop?config=1&s=${tok}`)).json;
  assert.equal(cfg.methods.delivery, false);
  assert.equal(cfg.methods.paystack, false);
  assert.equal(cfg.online, false);
  assert.equal((await shop({ s: tok, method: "delivery", items: [{ i: 0, q: 1 }], buyer })).status, 409);
  assert.equal((await shop({ s: tok, method: "paystack", items: [{ i: 1, q: 1 }], buyer })).status, 409);
  await h.action({ action: "shop_settings", id, paystackOn: true });
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.methods.paystack, true, "the key was kept while it was off");
  // The order list in admin shows how each was paid.
  const orders = (await h.action({ action: "shop_orders", id })).json.orders;
  assert.ok(orders.some((o) => o.status === "awaiting") && orders.some((o) => o.status === "cod"));
});

test("Flutterwave: the store's own key, checked; payment confirmed by reference; can be switched off or removed", async () => {
  const { id, tok } = await makeStore("Ade Shoes");
  const { setShopPayments } = await import("../api/_lib/shop.mjs");
  await assert.rejects(setShopPayments(id, { flwKey: "FLWPUBK-abc" }), /PUBLIC key/);
  await assert.rejects(setShopPayments(id, { flwKey: flwKey("BADBADBADBADBADBADBADBAD") }), /didn't accept/);
  await setShopPayments(id, { flwKey: flwKey("ADEadeADEadeADEade1234") });
  const row = await h.row(id);
  assert.equal(row.shop.flwOnline, true);
  assert.ok(!JSON.stringify(row).includes("ADEadeADEade"), "the key never goes back to the browser");
  const cfg = (await h.call("GET", `/api/shop?config=1&s=${tok}`)).json;
  assert.equal(cfg.methods.flutterwave, true);
  assert.equal(cfg.online, true);
  const buyer = { name: "Femi", phone: "08030000002", email: "femi@x.com" };
  const co = await shop({ s: tok, items: [{ i: 1, q: 2 }], buyer });
  assert.equal(co.json.method, "flutterwave", "old pages' Pay online uses whichever online option is on");
  assert.match(co.json.url, /checkout\.flutterwave\.com/);
  assert.equal(globalThis.__FLW__[co.json.ref].amount, 40000, "server works out the price");
  assert.match((await h.call("GET", `/api/shop?paid=1&ref=${co.json.ref}`)).text, /Thank you/);
  assert.match((await h.call("GET", `/api/shop?ref=${co.json.ref}&receipt=1`)).text, /Flutterwave/);
  // A failed payment stays unpaid.
  globalThis.__FLW_STATUS__ = "failed";
  const bad = await shop({ s: tok, method: "flutterwave", items: [{ i: 1, q: 1 }], buyer });
  assert.match((await h.call("GET", `/api/shop?paid=1&ref=${bad.json.ref}`)).text, /Payment not completed/);
  delete globalThis.__FLW_STATUS__;
  await setShopPayments(id, { flwOn: false });
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.methods.flutterwave, false);
  await setShopPayments(id, { flwRemove: true });
  assert.equal((await h.row(id)).shop.flwOnline, false);
});

test("My store: owner login with a temporary password (must change), orders, confirm transfer, cancel gives stock back, only their own store", async () => {
  const { id, tok } = await makeStore("Kemi Wears", { paystack: true });
  const other = await makeStore("Other Shop", { paystack: true });
  await h.action({ action: "shop_settings", id, transfer: { on: true, bank: "Access", name: "Kemi Wears", number: "0987654321" }, delivery: { on: true } });
  await h.action({ action: "shop_settings", id: other.id, delivery: { on: true } });
  // You create their login (owner only); staff can't.
  const created = await h.action({ action: "store_login", id, do: "create" });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.json.login.username, "kemiwears");
  assert.equal((await h.action({ action: "store_login", id: other.id, do: "create", username: "kemiwears" })).status, 400, "usernames are unique");
  const otherLogin = (await h.action({ action: "store_login", id: other.id, do: "create" })).json;
  const temp = created.json.password;
  assert.equal((await my(temp)("me")).status, 401, "a password alone isn't a login");
  const first = my(ownerLogin("kemiwears", temp));
  assert.equal((await first("me")).json.me.must_change, true);
  assert.equal((await first("orders")).status, 403, "nothing until they choose a password");
  const ch = await first("my_password", { current: temp, password: "KemiStore2026" });
  assert.equal(ch.status, 200, ch.text);
  assert.equal((await first("me")).status, 401, "the temporary password stops working");
  const k = my(ch.json.token);
  const me = (await k("me")).json;
  assert.equal(me.store.name, "Kemi Wears");
  assert.equal(me.store.transfer.number, "0987654321");
  assert.equal(me.store.paystack.connected, true, "My store knows their Paystack is connected");
  assert.equal(me.store.methods.paystack, true);
  assert.ok(!JSON.stringify(me).includes("STOREstore"), "no payment keys");
  // Orders come in.
  const buyer = { name: "Ngozi", phone: "08030000003", address: "Bodija" };
  const t = (await shop({ s: tok, method: "transfer", items: [{ i: 0, q: 2 }], buyer })).json;
  const d = (await shop({ s: tok, method: "delivery", items: [{ i: 0, q: 1 }], buyer })).json;
  const o2 = (await shop({ s: other.tok, method: "delivery", items: [{ i: 0, q: 1 }], buyer })).json;
  assert.equal(await stockOf(id), "2");
  assert.equal((await k("me")).json.todo, 2);
  const todo = (await k("orders", { status: "todo" })).json.orders;
  assert.deepEqual(todo.map((o) => o.ref).sort(), [t.ref, d.ref].sort());
  assert.ok(!todo.some((o) => o.ref === o2.ref), "never another store's orders");
  assert.match((await k("order", { ref: o2.ref, do: "paid" })).json.error, /not found/i, "can't touch another store's order");
  // Confirm the transfer: paid, receipt ready; then delivered.
  const paid = (await k("order", { ref: t.ref, do: "paid" })).json.order;
  assert.equal(paid.status, "paid");
  assert.match((await h.call("GET", `/api/shop?ref=${t.ref}&receipt=1`)).text, /Paid by bank transfer, confirmed by the store/);
  assert.equal(await stockOf(id), "2", "confirming doesn't take stock twice");
  assert.equal((await k("order", { ref: t.ref, do: "delivered" })).json.order.delivered_at !== null, true);
  assert.match((await k("order", { ref: t.ref, do: "cancel" })).json.error, /refund/);
  // Cancel the pay-on-delivery order: its item goes back into stock.
  assert.equal((await k("order", { ref: d.ref, do: "cancel" })).json.order.status, "cancelled");
  assert.equal(await stockOf(id), "3");
  // Products and shop details from My store update the website.
  const saved = (await k("save", { products: { 0: { price: "₦11,000", stock: "7" } }, details: { hours: "Mon–Sat 9am–6pm" } })).json;
  assert.ok(saved.changes.some((c) => /price/.test(c)) && saved.changes.some((c) => /Opening hours/.test(c)));
  assert.equal(await stockOf(id), "7");
  // Payment switches from My store.
  const pay = (await k("payments", { payments: { delivery: { on: false }, transfer: { on: true, bank: "Access", name: "Kemi Wears", number: "0987654321", note: "We confirm 8am–8pm" } } })).json;
  assert.equal(pay.store.methods.delivery, false);
  assert.equal(pay.store.transfer.note, "We confirm 8am–8pm");
  assert.equal((await k("customers")).status, 409, "customers are part of the Standard Store");
  // Export.
  const csv = (await k("export")).json;
  assert.match(csv.orders, /Ngozi/);
  assert.equal(csv.customers, undefined);
  // The Manage link is a backup; switched off, it stops working.
  const link = (await k("manage_link")).json.url;
  assert.equal((await h.call("GET", "/manage?" + link.split("?")[1])).status, 200);
  await h.action({ action: "shop_settings", id, manageOn: false });
  assert.equal((await h.call("GET", "/manage?" + link.split("?")[1])).status, 404);
  assert.equal((await k("manage_link")).status, 409);
  // Reset: logged out, must change again; switch off: locked out.
  const reset = (await h.action({ action: "store_login", id, do: "reset" })).json;
  assert.equal((await k("me")).status, 401);
  assert.equal((await my(ownerLogin("kemiwears", reset.password))("me")).json.me.must_change, true);
  await h.action({ action: "store_login", id, do: "active", active: false });
  assert.equal((await my(ownerLogin("kemiwears", reset.password))("me")).status, 401);
  assert.ok(otherLogin.password);
});

test("Standard Store: buyer accounts (phone + password, Google), saved addresses, order history, reset code from the owner", async () => {
  const { id, tok } = await makeStore("Ada Beauty", { paystack: true });
  await h.action({ action: "shop_settings", id, delivery: { on: true } });
  assert.equal((await shop({ s: tok, action: "signup", name: "Ife", phone: "08031230000", password: "secret1" })).status, 409, "off until the Standard Store is switched on");
  await h.action({ action: "shop_settings", id, accounts: true, google: true });
  const cfg = (await h.call("GET", `/api/shop?config=1&s=${tok}`)).json;
  assert.equal(cfg.accounts, true);
  assert.equal(cfg.google, "test-client.apps.googleusercontent.com");
  assert.match((await shop({ s: tok, action: "signup", name: "Ife", phone: "0803", password: "secret1" })).json.error, /phone/);
  assert.match((await shop({ s: tok, action: "signup", name: "Ife", phone: "08031230000", password: "123" })).json.error, /6 characters/);
  const up = (await shop({ s: tok, action: "signup", name: "Ife Ola", phone: "0803 123 0000", password: "secret1" })).json;
  assert.match(up.token, /^b1\./);
  assert.match((await shop({ s: tok, action: "signup", name: "X", phone: "+2348031230000", password: "secret1" })).json.error, /already has an account/, "the same number in another form");
  assert.match((await shop({ s: tok, action: "login", phone: "08031230000", password: "wrong" })).json.error, /Wrong phone number or password/);
  const login = (await shop({ s: tok, action: "login", phone: "2348031230000", password: "secret1" })).json;
  assert.equal(login.buyer.name, "Ife Ola");
  const t = login.token;
  // Addresses (up to 5) and details.
  const upd = (await shop({ s: tok, t, action: "update", addresses: [{ label: "Home", text: "5 Oke Ado, Ibadan" }, { label: "", text: "" }], email: "ife@x.com" })).json;
  assert.deepEqual(upd.buyer.addresses, [{ label: "Home", text: "5 Oke Ado, Ibadan" }]);
  const many = Array.from({ length: 25 }, (_, k) => ({ label: "Place " + (k + 1), text: (k + 1) + " Ring Road, Ibadan" }));
  assert.equal((await shop({ s: tok, t, action: "update", addresses: many })).json.buyer.addresses.length, 20, "up to 20 delivery addresses to pick from");
  // Orders while signed in go into their account; a token from another store doesn't work here.
  const o = (await shop({ s: tok, t, method: "delivery", items: [{ i: 1, q: 1 }], buyer: { name: "Ife Ola", phone: "08031230000", address: "5 Oke Ado, Ibadan" } })).json;
  const p = (await shop({ s: tok, t, items: [{ i: 1, q: 2 }], buyer: { name: "Ife Ola", phone: "08031230000", email: "ife@x.com" } })).json;
  await h.call("GET", `/api/shop?paid=1&ref=${p.ref}`);
  await shop({ s: tok, items: [{ i: 1, q: 1 }], buyer: { name: "Guest", phone: "08039990000", email: "g@x.com" } }); // a guest still can buy
  const list = (await shop({ s: tok, t, action: "orders" })).json.orders;
  assert.deepEqual(list.map((x) => x.ref).sort(), [o.ref, p.ref].sort());
  assert.ok(list.find((x) => x.ref === p.ref).link.includes("receipt=1"));
  assert.equal(list.find((x) => x.ref === p.ref).items[0].i, 1, "Order again knows the product");
  const other = await makeStore("Other Beauty");
  await h.action({ action: "shop_settings", id: other.id, accounts: true });
  assert.equal((await shop({ s: other.tok, t, action: "me" })).status, 401);
  // The owner sees their customers, can reset a password with a code, and block an account.
  const cr = (await h.action({ action: "store_login", id, do: "create" })).json;
  const ok1 = await my(ownerLogin(cr.login.username, cr.password))("my_password", { current: cr.password, password: "AdaBeauty2026" });
  const k = my(ok1.json.token);
  const cs = (await k("customers")).json.customers;
  assert.equal(cs.length, 1);
  assert.equal(cs[0].orders, 1);
  assert.equal(cs[0].spent, 40000);
  const code = (await k("customer_reset", { buyer_id: cs[0].id })).json.code;
  assert.match(code, /^\d{6}$/);
  assert.match((await shop({ s: tok, action: "reset", phone: "08031230000", code: "000000", password: "newpass1" })).json.error, /wrong or has expired/);
  const rs = (await shop({ s: tok, action: "reset", phone: "08031230000", code, password: "newpass1" })).json;
  assert.match(rs.token, /^b1\./);
  assert.equal((await shop({ s: tok, t, action: "me" })).status, 401, "the old sign-in stops working after a new password");
  assert.match((await shop({ s: tok, action: "reset", phone: "08031230000", code, password: "again12" })).json.error, /wrong or has expired/, "a code works once");
  assert.match((await k("export")).json.customers, /Ife Ola/);
  await k("customer_active", { buyer_id: cs[0].id, active: false });
  assert.match((await shop({ s: tok, action: "login", phone: "08031230000", password: "newpass1" })).json.error, /Wrong/);
  // The owner can switch accounts off on their website (guests still buy).
  await k("payments", { payments: { accountsOn: false } });
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.accounts, false);
  await k("payments", { payments: { accountsOn: true } });
  // Google: first time asks for a phone number; then one tap.
  assert.match((await shop({ s: tok, action: "google", credential: "fake" })).json.error, /didn't work/);
  assert.equal((await shop({ s: tok, action: "google", credential: "good-g123" })).json.needPhone, true);
  const g = (await shop({ s: tok, action: "google", credential: "good-g123", phone: "08035550000" })).json;
  assert.equal(g.buyer.google, true);
  assert.equal(g.buyer.email, "g123@gmail.com");
  assert.ok((await shop({ s: tok, action: "google", credential: "good-g123" })).json.token);
  // Nothing was ever emailed to buyers.
  assert.ok(!h.sent.some((m) => /ife@x\.com|g123@gmail|g@x\.com/.test(JSON.stringify(m.to))));
});

test("the store website gets the new checkout buttons and the account panel; the preview doesn't", async () => {
  const { id } = await makeStore("Lola Bags", { paystack: true });
  const { buildSiteModel, renderPage } = await import("../api/_lib/sitegen.mjs");
  const [{ brief }] = await h.sql(`SELECT brief FROM customer_requests WHERE id = $1`, [id]);
  const site = buildSiteModel({ ...(await h.row(id)), brief, draft_md: "# Website text\n## Page: Home\n### Hero\nBags\nIbadan." });
  const html = renderPage(site, site.pages[0].slug, { mode: "export", link: (x) => x });
  for (const m of ["paystack", "flutterwave", "transfer", "delivery"]) assert.match(html, new RegExp(`data-m="${m}"`));
  assert.match(html, /window\.SAcct=/);
  assert.match(html, /Forgot password/);
  const names = (brief.products || []).map((p) => p.name);
  assert.ok(names.length >= 2 && names.every((n) => html.includes(">" + n + "<")), "the home page lists every product");
  assert.match(html, /class="shop-search"/, "with a search box"); assert.doesNotMatch(html, /Featured products|Shop all products/);
  const pv = renderPage(site, site.pages[0].slug, { mode: "preview", link: (x) => x, row: await h.row(id), token: "t" });
  assert.match(pv, /"preview":true/, "the preview loads the new look, with accounts switched off (no sign-in calls)");
});

test("backups leave out every login's scrambled password and reset code", async () => {
  const { buildBackup } = await import("../api/_lib/backup.mjs");
  const { gunzipSync } = await import("node:zlib");
  const b = await buildBackup();
  const data = JSON.parse(gunzipSync(b.gz).toString());
  for (const t of ["staff", "store_users", "store_buyers"]) assert.ok(t in data.tables, t);
  assert.ok(data.tables.store_buyers.length > 0, "buyers are backed up");
  assert.doesNotMatch(JSON.stringify(data), /"pass_hash"|"reset_hash"|scrypt\$/);
});

test("My store: sales at a glance — paid today and this month, orders to deliver, items running low", async () => {
  const { id, tok } = await makeStore("Glance Shop");
  await h.action({ action: "shop_settings", id, transfer: { on: true, bank: "Access", name: "Glance", number: "0987654321" }, delivery: { on: true } });
  const cr = (await h.action({ action: "store_login", id, do: "create" })).json;
  const k = my((await my(ownerLogin(cr.login.username, cr.password))("my_password", { current: cr.password, password: "GlanceShop2026" })).json.token);
  const buyer = { name: "Ada", phone: "08030000009", address: "Ring Road" };
  const t = (await shop({ s: tok, method: "transfer", items: [{ i: 0, q: 3 }], buyer })).json;
  await shop({ s: tok, method: "delivery", items: [{ i: 1, q: 1 }], buyer });
  let sm = (await k("me")).json.summary;
  assert.deepEqual([sm.today, sm.month, sm.toDeliver], [0, 0, 1], "nothing paid yet; pay-on-delivery waits to be delivered");
  assert.deepEqual(sm.low, [{ name: "Ankara", stock: 2 }], "5 in stock, 3 ordered: running low");
  await k("order", { ref: t.ref, do: "paid" });
  sm = (await k("me")).json.summary;
  assert.equal(sm.today, 30000); assert.equal(sm.todayOrders, 1); assert.equal(sm.month, 30000); assert.equal(sm.toDeliver, 2);
  await k("order", { ref: t.ref, do: "delivered" });
  assert.equal((await k("me")).json.summary.toDeliver, 1);
});

test("Google sign-in, one time for every store: the shared sirraddo.com.ng/signin page only hands a sign-in back to the store's own web address", async () => {
  const { id, tok } = await makeStore("Hub Shop");
  const hub = (o) => shop({ s: tok, action: "google_hub", o });
  await h.action({ action: "shop_settings", id, accounts: true });
  assert.equal((await hub("https://hubshop.com.ng")).status, 409, "Google sign-in not ticked yet");
  await h.action({ action: "shop_settings", id, google: true });
  await h.sql(`UPDATE customer_requests SET hosting = $1::jsonb, website_url = $2 WHERE id = $3`, [JSON.stringify({ domain: "hubshop.com.ng", pagesUrl: "https://hub-shop.pages.dev" }), "https://hubshop.com.ng/", id]);
  for (const o of ["https://hubshop.com.ng", "https://www.hubshop.com.ng", "https://hub-shop.pages.dev"]) {
    const ok = await hub(o);
    assert.equal(ok.status, 200, o); assert.equal(ok.json.client, "test-client.apps.googleusercontent.com"); assert.equal(ok.json.name, "Hub Shop");
  }
  for (const o of ["https://evil.com.ng", "http://hubshop.com.ng", "https://hubshop.com.ng.evil.com", "", "null"]) assert.equal((await hub(o)).status, 403, `refused: ${o}`);
  assert.equal((await shop({ s: "nope-not-a-store", action: "google_hub", o: "https://hubshop.com.ng" })).status, 404);
  // The store owner can switch Google off in My store; phone number + password always stays.
  const cr = (await h.action({ action: "store_login", id, do: "create" })).json;
  const k = my((await my(ownerLogin(cr.login.username, cr.password))("my_password", { current: cr.password, password: "HubShop2026x" })).json.token);
  assert.equal((await k("me")).json.store.googleFeature, true);
  await k("payments", { payments: { googleOn: false } });
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.google, null, "owner switched Google off");
  assert.equal((await hub("https://hubshop.com.ng")).status, 409);
  assert.equal((await h.call("GET", `/api/shop?config=1&s=${tok}`)).json.accounts, true, "phone + password sign-in still on");
  await k("payments", { payments: { googleOn: true } });
  assert.equal((await hub("https://hubshop.com.ng")).status, 200, "and back on");
  // The store website opens the shared page and only listens to sirraddo.com.ng for the answer.
  const { ACCOUNT_JS } = await import("../api/_lib/storejs.mjs");
  assert.match(ACCOUNT_JS, /\/signin\?s=/); assert.match(ACCOUNT_JS, /ev\.origin!==hub/); assert.doesNotMatch(ACCOUNT_JS, /gsi\/client/, "Google's script now loads only on sirraddo.com.ng");
  const { readFileSync } = await import("node:fs");
  assert.match(readFileSync(new URL("../assets/signin.js", import.meta.url), "utf8"), /postMessage\(\{ sirraddoGoogle: cred \}, o\)/, "never sent to '*'");
});
