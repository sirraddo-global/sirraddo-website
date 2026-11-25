// Keys & connections: keys copied from the server once, saved encrypted, tested before saving, never sent back,
// and unlockable after an admin password change.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";

let h, vault;
before(async () => {
  process.env.LEAD_EMAIL_TO = "owner@example.com";
  process.env.NEON_PROJECT_ID = "•••••••••"; // a Netlify placeholder must not be copied
  h = await startHarness();
  vault = await import("../api/_lib/vault.mjs");
});
after(async () => { await h.close(); });

test("first start-up copies the server's keys once (not placeholders); values never come back", async () => {
  await vault.loadVault();
  const st = await h.action({ action: "vault" });
  assert.equal(st.status, 200, st.text);
  const by = Object.fromEntries(st.json.keys.map((k) => [k.key, k]));
  assert.equal(by.LEAD_EMAIL_TO.saved, true); assert.equal(by.LEAD_EMAIL_TO.from, "server");
  assert.equal(by.CLOUDFLARE_ACCOUNT_ID.saved, true);
  assert.equal(by.PAYSTACK_SECRET_KEY.saved, true); assert.match(by.PAYSTACK_SECRET_KEY.end, /^….{4}$/, "only the last 4 shown");
  assert.equal(by.NEON_PROJECT_ID.saved, false, "placeholder skipped");
  assert.ok(!st.text.includes(process.env.PAYSTACK_SECRET_KEY), "value never sent");
  // A second start-up doesn't copy again over admin changes.
  await h.action({ action: "vault_remove", key: "LEAD_EMAIL_TO" });
  await vault.loadVault();
  assert.equal((await h.action({ action: "vault" })).json.keys.find((k) => k.key === "LEAD_EMAIL_TO").saved, false);
});

test("a key is tested before saving, works straight away and wins over .env", async () => {
  const bad = await h.action({ action: "vault_save", key: "CLOUDFLARE_ACCOUNT_ID", value: "nope" });
  assert.equal(bad.status, 400); assert.match(bad.json.error, /Not saved/);
  assert.equal((await h.action({ action: "vault_save", key: "LEAD_EMAIL_TO", value: "••••••" })).status, 400);
  assert.equal((await h.action({ action: "vault_save", key: "NOT_A_KEY", value: "x" })).status, 400);
  const good = await h.action({ action: "vault_save", key: "CLOUDFLARE_ACCOUNT_ID", value: "fedcba9876543210fedcba9876543210" });
  assert.equal(good.status, 200, good.text);
  assert.equal(good.json.test.ok, true);
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, "fedcba9876543210fedcba9876543210", "live straight away");
  process.env.CLOUDFLARE_ACCOUNT_ID = "from-dotenv";
  await vault.loadVault();
  assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, "fedcba9876543210fedcba9876543210", "saved key wins at start-up");
  const g = await h.action({ action: "vault_save", key: "GOOGLE_SERVICE_ACCOUNT", value: "{not json" });
  assert.equal(g.status, 400);
});

test("after an admin password change the keys are locked until unlocked with the old one", async () => {
  const old = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = "a-brand-new-password-123";
  try {
    assert.equal((await vault.vaultStatus()).locked, true);
    assert.equal((await vault.loadVault()).locked, true);
    await assert.rejects(vault.vaultRelock("wrong password!!"), /isn't the old admin password/);
    assert.equal(await vault.vaultRelock(old) > 0, true);
    assert.equal((await vault.vaultStatus()).locked, false);
    await vault.loadVault();
    assert.equal(process.env.CLOUDFLARE_ACCOUNT_ID, "fedcba9876543210fedcba9876543210");
  } finally { process.env.ADMIN_PASSWORD = old; await vault.vaultRelock("a-brand-new-password-123").catch(() => {}); }
});

test("staff can't see or change keys", async () => {
  const r = await h.call("POST", "/api/requests", { action: "vault" }, { authorization: "Bearer s1.nope" });
  assert.ok([401, 403].includes(r.status));
});
