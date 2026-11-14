// One-off after the move to Netlify: copies photos/files that were uploaded while the site was on Vercel
// (…blob.vercel-storage.com links) into Netlify's own storage, and swaps the links everywhere in the
// database. Safe to tap again: each run moves what it can in ~20 seconds and says how many are left.
import { q } from "./store.mjs";
import { putFile, onNetlify } from "./platform.mjs";

const RX = /https:\/\/[\w.-]+\.blob\.vercel-storage\.com\/[^\s"'<>)\\]+/g;
const ident = (s) => '"' + String(s).replace(/"/g, '""') + '"';

async function placesWithOldLinks() {
  const cols = await q(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema = current_schema() AND data_type IN ('text', 'jsonb', 'json', 'character varying')`);
  const places = [], urls = new Set();
  for (const c of cols) {
    const rows = await q(`SELECT ${ident(c.column_name)}::text AS v FROM ${ident(c.table_name)} WHERE strpos(${ident(c.column_name)}::text, 'blob.vercel-storage.com') > 0`);
    if (!rows.length) continue;
    places.push(c);
    for (const r of rows) for (const u of String(r.v).match(RX) || []) urls.add(u);
  }
  return { places, urls: [...urls] };
}

export async function oldFilesLeft() {
  return (await placesWithOldLinks()).urls.length;
}

export async function moveOldFiles(budgetMs = 20000) {
  if (!onNetlify() && !globalThis.__TEST_BLOB__) return { ok: false, error: "This only works once the site is running on Netlify." };
  const started = Date.now();
  const { places, urls } = await placesWithOldLinks();
  let moved = 0, failed = 0;
  for (const u of urls) {
    if (Date.now() - started > budgetMs) break;
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const body = Buffer.from(await r.arrayBuffer());
      const name = decodeURIComponent(new URL(u).pathname.slice(1)).replace(/-[A-Za-z0-9]{20,}(\.\w+)?$/, "$1");
      const { url } = await putFile("moved/" + name, body, { contentType: r.headers.get("content-type") || undefined });
      for (const c of places) {
        const col = ident(c.column_name), cast = c.data_type === "jsonb" || c.data_type === "json" ? "::" + c.data_type : "";
        await q(`UPDATE ${ident(c.table_name)} SET ${col} = replace(${col}::text, $1, $2)${cast} WHERE strpos(${col}::text, $1) > 0`, [u, url]);
      }
      moved++;
    } catch (err) {
      console.error("move file failed", u, err.message);
      failed++;
    }
  }
  return { ok: true, found: urls.length, moved, failed, left: urls.length - moved };
}
