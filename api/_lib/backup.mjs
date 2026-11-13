// Weekly backup of the business data: every table in the database, as one gzipped JSON file emailed to you
// (Mondays, from the daily run). Admin → Settings → "Download backup now" gives the same file any time.
// Store owners' Paystack keys stay encrypted inside it. Keep the emails: they are your restore points.
import { gzipSync } from "node:zlib";
import { q, ensureSchema, sendEmail, emailConfigured, getMeta, setMeta } from "./store.mjs";

export async function buildBackup(now = new Date()) {
  await ensureSchema();
  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`, []))
    .map((t) => t.table_name).filter((t) => /^[a-z_][a-z0-9_]*$/.test(t));
  const data = {};
  for (const t of tables) data[t] = await q(`SELECT * FROM "${t}"`, []);
  const day = new Date(now.getTime() + 3600 * 1000).toISOString().slice(0, 10);
  const json = JSON.stringify({ app: "sirraddo-website", made: new Date().toISOString(), tables: data });
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return { filename: `sirraddo-backup-${day}.json.gz`, gz: gzipSync(json), counts, day };
}

export async function weeklyBackup(now = new Date()) {
  const lagos = new Date(now.getTime() + 3600 * 1000);
  if (lagos.getUTCDay() !== 1 || !emailConfigured()) return null; // Mondays
  const key = `backup:${lagos.toISOString().slice(0, 10)}`;
  if ((await getMeta([key]))[key]) return null;
  const b = await buildBackup(now);
  const list = Object.entries(b.counts).map(([k, n]) => `<li>${k.replace(/_/g, " ")}: ${n}</li>`).join("");
  await sendEmail(`🗄️ Weekly backup ${b.day} (${b.counts.customer_requests ?? 0} customers)`,
    `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5"><p>Your weekly backup of the website's business data is attached (${(b.gz.length / 1024).toFixed(0)} KB).</p>
<ul>${list}</ul><p>Keep these emails: they are your restore points. If anything is ever lost, send the latest file to your developer (or Claude) to restore it. It contains customer details, so don't forward it to anyone else.</p></div>`,
    [{ filename: b.filename, content: b.gz.toString("base64") }]);
  await setMeta(key, new Date().toISOString());
  return b.counts;
}
