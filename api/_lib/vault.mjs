// Keys & connections (Admin → Settings → Keys): the site's service keys kept in the database, encrypted with a key
// made from ADMIN_PASSWORD. So moving the site to another server only needs DATABASE_URL and ADMIN_PASSWORD in .env;
// everything here comes along by itself. At start-up (server/vps.mjs) the saved keys are loaded into process.env, so
// the rest of the code keeps reading process.env as before. A key saved here wins over the same key in .env.
// The first start-up copies the keys already in .env into here (once); "Copy from server" does it again on request.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getMeta, setMeta, dbConfigured, q } from "./store.mjs";
import { testKey } from "./keycheck.mjs";

const g = (key, label, group, where) => ({ key, label, group, where });
export const VAULT_KEYS = [
  g("PAYSTACK_SECRET_KEY", "Paystack live secret key", "Payments", "Paystack → Settings → API Keys & Webhooks → Live Secret Key"),
  g("RESEND_API_KEY", "Resend API key", "Email", "resend.com → API Keys → Create API key"),
  g("LEAD_EMAIL_FROM", "Send emails from", "Email", "e.g. SIRRADDO <receipts@sirraddo.com.ng> (a verified Resend domain)"),
  g("LEAD_EMAIL_TO", "Send owner emails to", "Email", "Your inbox, e.g. sirraddogloballimited@gmail.com"),
  g("GEMINI_API_KEY", "Google Gemini API key", "AI", "aistudio.google.com → Get API key"),
  g("ANTHROPIC_API_KEY", "Claude API key (optional)", "AI", "console.anthropic.com → API Keys"),
  g("CLOUDFLARE_API_TOKEN", "Cloudflare API token", "Customer websites", "Cloudflare → My Profile → API Tokens (the 'SIRRADDO website' token → Roll)"),
  g("CLOUDFLARE_ACCOUNT_ID", "Cloudflare account ID", "Customer websites", "Cloudflare home → your account → ⋯ → Copy account ID"),
  g("GOOGLE_SERVICE_ACCOUNT", "Google service account (JSON)", "Google", "console.cloud.google.com → SIRRADDO Sign-in → IAM → Service accounts → Keys → JSON"),
  g("GOOGLE_SIGNIN_CLIENT_ID", "Google sign-in client ID", "Google", "Google Cloud → APIs & Services → Credentials → OAuth client ID"),
  g("NEON_API_KEY", "Neon API key (usage meter)", "Database", "Neon → Organization → Settings → API keys (project-scoped)"),
  g("NEON_PROJECT_ID", "Neon project ID", "Database", "Neon → your project → Settings → Project ID"),
  g("CRON_SECRET", "Internal secret (daily jobs, unsubscribe links)", "Internal", "Made up by the site; no need to change"),
  g("STORE_KEYS_SECRET", "Store keys secret (encrypts your customers' payment keys)", "Internal", "Made up by the site; never change it once stores use it"),
];
const NAMES = VAULT_KEYS.map((k) => k.key);
const masked = (v) => /[•*]{3}/.test(String(v || ""));

const vkey = (pw = process.env.ADMIN_PASSWORD) => createHash("sha256").update("sirraddo-vault:" + (pw || "")).digest();
function seal(plain, key = vkey()) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}
function open(sealed, key = vkey()) {
  const [iv, tag, data] = String(sealed || "").split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}
const ending = (v) => (String(v).length > 12 ? "…" + String(v).slice(-4) : "");

async function read() {
  const m = await getMeta(["vault", "vault_check", "vault_imported"]);
  let items = {}; try { items = m.vault ? JSON.parse(m.vault) : {}; } catch { items = {}; }
  return { items, check: m.vault_check || "", imported: Boolean(m.vault_imported) };
}
const unlocked = (check) => { if (!check) return true; try { return open(check) === "ok"; } catch { return false; } };
async function write(items) {
  await setMeta("vault", JSON.stringify(items));
  await setMeta("vault_check", seal("ok"));
}
// Values the site normalises before saving (the Google key is kept as one line of JSON).
function clean(name, value) {
  let v = String(value || "").trim();
  if (name === "GOOGLE_SERVICE_ACCOUNT" && v) { try { v = JSON.stringify(JSON.parse(v)); } catch { throw new Error("That isn't the JSON key file: paste all of it."); } }
  if (name === "GOOGLE_SIGNIN_CLIENT_ID") v = v.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (name !== "GOOGLE_SERVICE_ACCOUNT" && name !== "LEAD_EMAIL_FROM") v = v.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (v.length > 8000) throw new Error("That's too long for a key.");
  return v;
}

/** Start-up: copy .env keys in (first time only), then load every saved key into process.env. */
export async function loadVault() {
  if (!dbConfigured() || (process.env.ADMIN_PASSWORD || "").length < 12) return { loaded: 0, skipped: "no database or admin password" };
  const v = await read();
  if (!unlocked(v.check)) { console.error("vault: locked (saved with a different ADMIN_PASSWORD); using .env only"); return { loaded: 0, locked: true }; }
  if (!v.imported) {
    let n = 0;
    for (const k of NAMES) {
      const val = process.env[k];
      if (val && !masked(val) && !v.items[k]) { v.items[k] = { s: seal(val), end: ending(val), at: new Date().toISOString(), from: "server" }; n++; }
    }
    await write(v.items); await setMeta("vault_imported", new Date().toISOString());
    console.log(`vault: copied ${n} key(s) from the server's settings`);
  }
  // Store payment keys are encrypted with STORE_KEYS_SECRET (or CRON_SECRET when it's missing). Pin it once to the
  // current CRON_SECRET, so changing CRON_SECRET later can never lock store owners' keys again.
  if (!v.items.STORE_KEYS_SECRET) {
    const pin = process.env.STORE_KEYS_SECRET || (v.items.CRON_SECRET ? open(v.items.CRON_SECRET.s) : process.env.CRON_SECRET);
    if (pin && pin.length >= 16 && !masked(pin)) {
      v.items.STORE_KEYS_SECRET = { s: seal(pin), end: ending(pin), at: new Date().toISOString(), from: "server" };
      await write(v.items);
      console.log("vault: store keys secret pinned");
    }
  }
  let loaded = 0;
  for (const [k, e] of Object.entries(v.items)) {
    if (!NAMES.includes(k)) continue;
    try { process.env[k] = open(e.s); loaded++; } catch { console.error("vault: couldn't open", k); }
  }
  console.log(`vault: ${loaded} key(s) loaded`);
  return { loaded };
}

/** For admin: which keys are saved (never their values), where they came from, and anything that needs attention. */
export async function vaultStatus() {
  const v = await read();
  const locked = !unlocked(v.check);
  const keys = VAULT_KEYS.map((k) => {
    const e = v.items[k.key];
    return { ...k, saved: Boolean(e), end: e?.end || "", at: e?.at || null, from: e?.from || null,
      inEnv: Boolean(process.env[k.key]) && !masked(process.env[k.key]), envOnly: !e && Boolean(process.env[k.key]) && !masked(process.env[k.key]) };
  });
  // Values encrypted with CRON_SECRET / STORE_KEYS_SECRET elsewhere (store payment keys, AI backup) that no longer open.
  const sealedProblems = [];
  try {
    const { openKey } = await import("./shop.mjs");
    const rows = await q(`SELECT id, name, shop->>'key' AS k, shop->>'flwKey' AS f FROM customer_requests WHERE shop ? 'key' OR shop ? 'flwKey'`);
    for (const r of rows) for (const [col, label] of [["k", "Paystack"], ["f", "Flutterwave"]]) {
      if (!r[col]) continue;
      try { openKey(r[col]); } catch { sealedProblems.push(`${label} key for ${r.name}'s store (SGL-${String(r.id).padStart(4, "0")}): reconnect it in their store settings`); }
    }
    const ab = (await getMeta(["ai_backup"])).ai_backup;
    const s = ab ? JSON.parse(ab) : null;
    if (s?.key) { try { openKey(s.key); } catch { sealedProblems.push("AI backup key: save it again in Settings → AI backup"); } }
  } catch (e) { /* no stores yet */ }
  return { locked, keys, sealedProblems };
}

export async function vaultSave(name, value) {
  if (!NAMES.includes(name)) throw new Error("Unknown key");
  const v = await read();
  if (!unlocked(v.check)) throw new Error("The saved keys are locked with an older admin password. Unlock them first.");
  const val = clean(name, value);
  if (!val) throw new Error("Paste the key first.");
  if (masked(val)) throw new Error("That's a hidden placeholder, not the real key.");
  const test = await testKey(name, val, { ...process.env, [name]: val });
  if (test.ok === false) throw new Error(`Not saved: ${test.note}`);
  v.items[name] = { s: seal(val), end: ending(val), at: new Date().toISOString(), from: "admin" };
  await write(v.items);
  process.env[name] = val; // takes effect straight away
  return { test };
}
export async function vaultRemove(name) {
  const v = await read();
  delete v.items[name];
  await write(v.items);
  return true;
}
/** Copies every key the server has (in .env or loaded) into the store, replacing what's saved. */
export async function vaultImport() {
  const v = await read();
  if (!unlocked(v.check)) throw new Error("The saved keys are locked with an older admin password. Unlock them first.");
  let n = 0;
  for (const k of NAMES) { const val = process.env[k]; if (val && !masked(val)) { v.items[k] = { s: seal(val), end: ending(val), at: new Date().toISOString(), from: "server" }; n++; } }
  await write(v.items); await setMeta("vault_imported", new Date().toISOString());
  return n;
}
/** After changing ADMIN_PASSWORD: re-lock the saved keys with the new one, using the old password. */
export async function vaultRelock(oldPassword) {
  const v = await read();
  const old = vkey(String(oldPassword || ""));
  try { if (open(v.check, old) !== "ok") throw 0; } catch { throw new Error("That isn't the old admin password."); }
  const items = {};
  for (const [k, e] of Object.entries(v.items)) items[k] = { ...e, s: seal(open(e.s, old)) };
  await write(items);
  for (const [k, e] of Object.entries(items)) process.env[k] = open(e.s);
  return Object.keys(items).length;
}
export async function vaultTestAll() {
  const out = {};
  for (const k of NAMES) out[k] = await testKey(k, process.env[k]);
  return out;
}
