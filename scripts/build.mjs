// Builds the site into ./public for Netlify. No dependencies: needs only Node.
//   node scripts/build.mjs
// - copies the HTML pages and assets/
// - replaces {{SITE_URL}} with SITE_URL from site.config.mjs
// - removes the demo cards between DEMO_CARDS markers unless SHOW_DEMO_CARDS is true
// - adds ?v=<hash> to CSS/JS links so browsers never use an outdated cached file
// - writes sitemap.xml and robots.txt, and version.txt (the commit Netlify built, for the live check)
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
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
cpSync(join(root, "admin-sw.js"), join(out, "admin-sw.js")); // the installable Admin app

const DEMO_BLOCK = /[ \t]*<!-- DEMO_CARDS:START[\s\S]*?<!-- DEMO_CARDS:END -->\n?/g;
const DEMO_MARKERS = /[ \t]*<!-- DEMO_CARDS:(START|END)[^>]*-->\n?/g;

const pages = readdirSync(root).filter((f) => f.endsWith(".html"));
for (const page of pages) {
  let html = readFileSync(join(root, page), "utf8");
  html = html.replaceAll("{{SITE_URL}}", SITE_URL);
  html = SHOW_DEMO_CARDS ? html.replace(DEMO_MARKERS, "") : html.replace(DEMO_BLOCK, "");
  // Add ?v=<content hash> to CSS and JS links, so browsers fetch new files after every change
  // instead of using an old cached copy.
  html = html.replace(/((?:href|src)="\/assets\/[\w.-]+\.(?:css|js))"/g, (m, url) => {
    const file = join(root, url.slice(url.indexOf("/assets/") + 1));
    const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
    return `${url}?v=${hash}"`;
  });
  const left = html.match(/\{\{[A-Z_]+\}\}/);
  if (left) throw new Error(`${page}: unknown placeholder ${left[0]}`);
  writeFileSync(join(out, page), html);
  if (page === "admin.html") writeFileSync(join(out, "staff.html"), staffPage(html));
}

// The staff login page (/staff): the same admin app, with a username + password form and no install-app bits.
function staffPage(html) {
  const form = `    <form id="login" class="admin-login">
      <h1>Staff log in</h1>
      <label for="username">Username</label>
      <input id="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      <label for="password">Password</label>
      <input id="password" type="password" autocomplete="current-password" required>
      <label class="admin-check"><input id="remember" type="checkbox"> Keep me logged in on this device (30 days)</label>
      <button class="btn btn--navy" type="submit">Log in</button>
      <p id="login-error" class="admin-error" role="alert"></p>
      <p class="admin-hint">Use the username and password the owner sent you on WhatsApp. The first time, you’ll choose your own password. Forgot it? Ask the owner to reset it.</p>
      <p class="admin-hint">Only tick "keep me logged in" on your own phone. Log out to remove it.</p>
    </form>`;
  const swaps = [
    [/    <form id="login" class="admin-login">[\s\S]*?<\/form>/, form],
    [/<title>Admin – /, "<title>Staff – "],
    [/  <link rel="manifest"[^>]*>\n/, ""],
    [/<strong>SIRRADDO · Admin<\/strong>/, "<strong>SIRRADDO · Staff</strong>"],
    [/<body class="admin">/, '<body class="admin" data-mode="staff">'],
  ];
  for (const [re, to] of swaps) {
    if (!re.test(html)) throw new Error(`staff page: can't find ${re}`);
    html = html.replace(re, to);
  }
  return html;
}

const urls = SITEMAP_PAGES.map((p) => `  <url><loc>${SITE_URL}${p}</loc></url>`).join("\n");
writeFileSync(
  join(out, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /brief\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${pages.length} pages into public/ for ${SITE_URL} (demo cards ${SHOW_DEMO_CARDS ? "on" : "off"})`);

// The commit this build is from (Netlify sets COMMIT_REF), so the live check knows the new version is up.
writeFileSync(join(out, "version.txt"), (process.env.COMMIT_REF || "local") + "\n");

// The website chat always knows the current FAQ: every question and answer on the Websites and Home pages is
// copied into api/_lib/site-faq.generated.mjs on each build, so editing the FAQ updates the chat too.
{
  const plain = (h) => h.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const faq = [];
  for (const page of ["websites.html", "index.html"]) {
    const html = readFileSync(join(root, page), "utf8");
    for (const m of html.matchAll(/<details[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)) faq.push({ q: plain(m[1]), a: plain(m[2]), page });
  }
  const text = faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  writeFileSync(join(root, "api/_lib/site-faq.generated.mjs"),
    `// Made by scripts/build.mjs from the FAQ on our pages. Don't edit: edit the FAQ in websites.html instead.\nexport const SITE_FAQ = ${JSON.stringify(text)};\nexport const SITE_FAQ_COUNT = ${faq.length};\n`);
  console.log(`Chat knows ${faq.length} FAQ answers`);
}
