// Run on the VPS in the website folder: node scripts/fix-env-quotes.mjs   (then: pm2 restart sirraddo-website --update-env)
// Re-writes .env so values with " or \ are read back exactly (single quotes are taken literally by Node).
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
const lines = readFileSync(".env", "utf8").split("\n");
let fixed = 0;
const out = lines.map((line) => {
  const m = line.match(/^([A-Z0-9_]+)="(.*)"$/);
  if (!m) return line;
  let v; try { v = JSON.parse(`"${m[2]}"`); } catch { return line; }
  if (v.includes("'") || v.includes("\n")) return line; // leave as is (none expected)
  fixed++;
  return `${m[1]}='${v}'`;
});
writeFileSync(".env", out.join("\n")); chmodSync(".env", 0o600);
console.log(`Fixed ${fixed} setting(s).`);
