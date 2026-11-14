// Checks for the Netlify setup: the adapter's headers, the 30-second-safe AI drafts, the old-uploads mover
// and the /files function. Run with: npm test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { startHarness, ROOT } from "./harness.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

test("function replies carry security headers; private pages are never cached or indexed", async () => {
  const r = await fetch(h.base + "/preview?t=nope");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  const api = await fetch(h.base + "/api/requests?view=all", { headers: { authorization: "Bearer wrong" } });
  assert.equal(api.status, 401);
  assert.equal(api.headers.get("x-content-type-options"), "nosniff");
});

test("every API handler has a Netlify function with its paths, plus the daily schedule", async () => {
  const want = { chat: "/api/chat", requests: "/api/requests", lead: "/api/lead", brief: "/api/brief", "brief-upload": "/api/brief-upload",
    doc: "/doc", preview: "/preview", pay: "/pay", "paystack-webhook": "/api/paystack-webhook", shop: "/api/shop", site: "/change", "cron-daily": "/api/cron-daily" };
  for (const [name, path] of Object.entries(want)) {
    const mod = await import(join(ROOT, "netlify/functions", name + ".mjs"));
    assert.equal(typeof mod.default, "function", name);
    assert.ok([].concat(mod.config.path).includes(path), `${name} serves ${path}`);
  }
  assert.equal((await import(join(ROOT, "netlify/functions/daily.mjs"))).config.schedule, "0 6 * * *");
  const toml = await readFile(join(ROOT, "netlify.toml"), "utf8");
  assert.match(toml, /publish = "public"/);
});

test("the scheduled daily run happens once a day even if two hosts start it", async () => {
  const { runDaily } = await import("../api/_lib/automation.mjs");
  const day = new Date("2026-11-18T06:00:00Z");
  const [a, b] = await Promise.all([runDaily(day, { once: true }), runDaily(day, { once: true })]);
  assert.equal([a, b].filter((r) => r.skipped).length, 1);
  const vercel = await h.call("GET", "/api/cron-daily", undefined, { authorization: "Bearer cronsecretcronsecret", "user-agent": "vercel-cron/1.0" });
  assert.equal(vercel.json.skipped, undefined, "a different day (today) still runs");
  const again = await h.call("GET", "/api/cron-daily", undefined, { authorization: "Bearer cronsecretcronsecret", "user-agent": "vercel-cron/1.0" });
  assert.equal(again.json.skipped, "already ran today");
});

test("/files refuses path tricks", async () => {
  const files = (await import(join(ROOT, "netlify/functions/files.mjs"))).default;
  assert.equal((await files(new Request("https://x.test/files/a%2F..%2Fsecret"))).status, 404);
  assert.equal((await files(new Request("https://x.test/files/a.png", { method: "POST" }))).status, 405);
});

test("website text is written in parallel page groups, so it fits Netlify's 30 seconds", async () => {
  await h.call("POST", "/api/lead", { name: "Kemi", contact: "08031110000", business: "Kemi Foods", interest: "Business website" });
  const id = (await h.admin("GET", "/api/requests?view=all")).json.requests.find((r) => r.name === "Kemi").id;
  await h.sql(`UPDATE customer_requests SET brief = $1, brief_submitted_at = now() WHERE id = $2`,
    [JSON.stringify({ business_name: "Kemi Foods", pages: ["Home", "About us", "Menu", "Contact", "FAQ"] }), id]);
  let calls = 0; const prev = globalThis.fetch;
  globalThis.fetch = (u, o) => { if (String(u).includes("generativelanguage")) calls++; return prev(u, o); };
  try {
    const r = await h.action({ action: "write_draft", id });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  } finally { globalThis.fetch = prev; }
  assert.ok(calls >= 3, "5 pages → 3 page groups (+ Google profile) at once, got " + calls);
  const md = (await h.sql(`SELECT draft_md FROM customer_requests WHERE id = $1`, [id]))[0].draft_md;
  assert.match(md, /^# Website text: Kemi Foods/);
  assert.equal((md.match(/^# /gm) || []).length, 1, "only one title");
});

test("Move old uploads copies Vercel Blob files and swaps every link", async () => {
  const id = (await h.admin("GET", "/api/requests?view=all")).json.requests[0].id;
  const old = "https://abc123.public.blob.vercel-storage.com/briefs/1/logo/logo-AbCdEfGhIjKlMnOpQrStUv.png";
  await h.sql(`UPDATE customer_requests SET brief_files = $1, notes = $2 WHERE id = $3`,
    [JSON.stringify({ logo: [{ url: old, name: "logo.png" }] }), "logo at " + old, id]);
  const prev = globalThis.fetch;
  globalThis.fetch = (u, o) => String(u).startsWith(old) ? Promise.resolve(new Response("PNG", { headers: { "content-type": "image/png" } })) : prev(u, o);
  let r;
  try { r = (await h.action({ action: "move_files" })).json; } finally { globalThis.fetch = prev; }
  assert.deepEqual([r.ok, r.found, r.moved, r.left], [true, 1, 1, 0]);
  const row = (await h.sql(`SELECT brief_files, notes FROM customer_requests WHERE id = $1`, [id]))[0];
  assert.ok(!JSON.stringify(row).includes("vercel-storage"), "no old links left");
  assert.equal(await (await fetch(row.brief_files.logo[0].url)).text(), "PNG");
  assert.equal((await h.action({ action: "move_files" })).json.found, 0, "second tap: nothing left");
});
