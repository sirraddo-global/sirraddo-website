// Sets settings in .env safely, with hidden typing (nothing shows on screen or in history). Run on the VPS:
//   node scripts/set-env.mjs DATABASE_URL PAYSTACK_SECRET_KEY ...
// Press Enter on an empty answer to skip one. CRON_SECRET is made up automatically if asked for.
// Afterwards: pm2 restart sirraddo-website --update-env
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const keys = process.argv.slice(2).filter((k) => /^[A-Z0-9_]+$/.test(k));
if (!keys.length) { console.log("Usage: node scripts/set-env.mjs NAME [NAME…]"); process.exit(1); }

function hidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin; let value = "";
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") { stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", onData); process.stdout.write("\n"); return resolve(value.trim()); }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(1); }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1); else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
// Single quotes are read literally by Node; backticks if the value has a single quote.
const quote = (v) => (/^[\w@%+=:,./-]*$/.test(v) ? v : !v.includes("'") ? `'${v}'` : !v.includes("`") ? `\`${v}\`` : JSON.stringify(v));

const lines = readFileSync(".env", "utf8").split("\n").filter(Boolean);
const set = (k, v) => { const i = lines.findIndex((l) => l.startsWith(k + "=")); const line = `${k}=${quote(v)}`; if (i >= 0) lines[i] = line; else lines.push(line); };
const done = [];
for (const k of keys) {
  if (k === "CRON_SECRET") { set(k, randomBytes(24).toString("base64url")); done.push(k + " (new, made up)"); continue; }
  let v = await hidden(`${k} (hidden, Enter to skip): `);
  if (!v) { console.log("  skipped"); continue; }
  if (k === "GOOGLE_SERVICE_ACCOUNT") {
    try { const j = JSON.parse(v); if (!j.client_email || !j.private_key) throw 0; v = JSON.stringify(j); }
    catch { console.log("  That isn't the service-account JSON (needs client_email and private_key). Skipped."); continue; }
  }
  if (k === "DATABASE_URL" && !/^postgres(ql)?:\/\//.test(v)) { console.log("  Should start with postgresql:// . Skipped."); continue; }
  set(k, v); done.push(`${k} (${v.length} chars)`);
}
writeFileSync(".env", lines.join("\n") + "\n", { mode: 0o600 });
console.log(`\nSaved: ${done.join(", ") || "nothing"}\nNow: pm2 restart sirraddo-website --update-env`);
