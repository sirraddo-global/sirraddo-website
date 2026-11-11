// Builds the site into ./public for Vercel. No dependencies: needs only Node.
//   node scripts/build.mjs
// - copies the HTML pages and assets/
// - replaces {{SITE_URL}} with SITE_URL from site.config.mjs
// - removes the demo cards between DEMO_CARDS markers unless SHOW_DEMO_CARDS is true
// - writes sitemap.xml and robots.txt
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE_URL, SHOW_DEMO_CARDS, SITEMAP_PAGES } from "../site.config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public");

if (!/^https:\/\/[^/\s]+$/.test(SITE_URL)) {
  throw new Error(`SITE_URL must look like "https://example.com" with no trailing slash. Got: ${SITE_URL}`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
cpSync(join(root, "assets"), join(out, "assets"), { recursive: true });

const DEMO_BLOCK = /[ \t]*<!-- DEMO_CARDS:START[\s\S]*?<!-- DEMO_CARDS:END -->\n?/g;
const DEMO_MARKERS = /[ \t]*<!-- DEMO_CARDS:(START|END)[^>]*-->\n?/g;

const pages = readdirSync(root).filter((f) => f.endsWith(".html"));
for (const page of pages) {
  let html = readFileSync(join(root, page), "utf8");
  html = html.replaceAll("{{SITE_URL}}", SITE_URL);
  html = SHOW_DEMO_CARDS ? html.replace(DEMO_MARKERS, "") : html.replace(DEMO_BLOCK, "");
  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`${page}: unknown placeholder ${left[0]}`);
  writeFileSync(join(out, page), html);
}

const urls = SITEMAP_PAGES.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${pages.length} pages into public/ for ${SITE_URL} (demo cards ${SHOW_DEMO_CARDS ? "on" : "off"})`);
