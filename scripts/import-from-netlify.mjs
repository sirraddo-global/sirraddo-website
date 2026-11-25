// One-time move from Netlify to the VPS. Run on the VPS, in the website folder:
//   node scripts/import-from-netlify.mjs
// It asks for a Netlify personal access token (typed hidden, never saved), then:
//   1. copies the site's environment variables into .env (keeps PORT, URL and FILES_DIR that are already there)
//   2. copies every uploaded file (Netlify Blobs store "uploads") into FILES_DIR, so old /files/ links keep working
// Safe to run again: it overwrites with the same values and skips files that are already copied.
import { readFile, writeFile, mkdir, stat, chmod } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";

const SITE = process.argv[2] || "sirraddo.netlify.app";
const ENV_FILE = ".env";
const KEEP = ["PORT", "URL", "FILES_DIR"]; // set for the VPS; never replaced by Netlify's values
const SKIP = /^(NETLIFY|NODE_VERSION|AWS_|DEPLOY_|CONTEXT|BRANCH|COMMIT_REF|SITE_ID|SITE_NAME)/;

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
    rl.question(question, (a) => { rl.close(); process.stdout.write("\n"); resolve(a.trim()); });
  });
}
const api = async (token, path) => {
  const r = await fetch(`https://api.netlify.com/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Netlify said ${r.status} for ${path}${r.status === 401 ? " (check the token)" : ""}`);
  return r.json();
};
const quote = (v) => (/^[\w@%+=:,./-]*$/.test(v) ? v : JSON.stringify(v));

const token = process.env.NETLIFY_AUTH_TOKEN || await askHidden("Netlify personal access token (hidden): ");
if (!token) { console.error("No token given."); process.exit(1); }

const site = await api(token, `/sites/${SITE}`);
console.log(`Site: ${site.name} (${site.ssl_url || site.url})`);

// ---------- 1. environment variables ----------
const current = {};
const existing = await readFile(ENV_FILE, "utf8").catch(() => "");
for (const line of existing.split("\n")) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) current[m[1]] = m[2]; }
const vars = await api(token, `/accounts/${site.account_slug || site.account_id}/env?site_id=${site.id}`);
const copied = [], missing = [];
for (const v of vars) {
  if (SKIP.test(v.key) || KEEP.includes(v.key)) continue;
  const pick = (v.values || []).find((x) => x.context === "production") || (v.values || []).find((x) => x.context === "all") || (v.values || [])[0];
  if (!pick || pick.value == null || pick.value === "") { missing.push(v.key); continue; }
  current[v.key] = quote(pick.value);
  copied.push(v.key);
}
current.FILES_DIR ||= "/opt/apps/sirraddo-website/files";
current.URL ||= "https://www.sirraddo.com.ng";
await writeFile(ENV_FILE, Object.entries(current).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
await chmod(ENV_FILE, 0o600);
console.log(`\nSettings copied (${copied.length}): ${copied.join(", ")}`);
if (missing.length) console.log(`Not readable, add by hand with 'bash vps-app.sh env sirraddo-website' (${missing.length}): ${missing.join(", ")}`);

// ---------- 2. uploaded files ----------
const { getStore } = await import("@netlify/blobs");
const store = getStore({ name: "uploads", siteID: site.id, token });
const dir = (current.FILES_DIR || "").replace(/^"|"$/g, "");
const { blobs } = await store.list();
let done = 0, skipped = 0;
for (const b of blobs) {
  const target = join(dir, b.key);
  if (!target.startsWith(dir + "/") || b.key.includes("..")) continue;
  if (await stat(target).catch(() => null)) { skipped++; continue; }
  const r = await store.getWithMetadata(b.key, { type: "arrayBuffer" });
  if (!r) continue;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(r.data));
  await writeFile(target + ".type", r.metadata?.type || "application/octet-stream");
  done++;
  if (done % 20 === 0) console.log(`  …${done} files`);
}
console.log(`\nFiles: ${done} copied, ${skipped} already there (of ${blobs.length}) into ${dir}`);
console.log("\nDone. Restart the website so it reads the settings: pm2 restart sirraddo-website --update-env");
console.log("You can now delete the Netlify token (Netlify → User settings → Applications).");
