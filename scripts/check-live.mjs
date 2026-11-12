// Checks that the live /websites page has the expected content.
//   node scripts/check-live.mjs            checks SITE_URL from site.config.mjs
//   BASE_URL=http://localhost:8000 node scripts/check-live.mjs
// Options (environment variables):
//   WAIT_MINUTES   keep retrying the content checks this long, so a deploy in progress can finish (default 0)
//   LAYOUT_CHECK=1 also open the page in Chromium (needs the "playwright" package) and check
//                  that the Recommended band sits on the Business card at phone and desktop widths
import { SITE_URL, SHOW_DEMO_CARDS } from "../site.config.mjs";

const BASE = (process.env.BASE_URL || SITE_URL).replace(/\/$/, "");
const PAGE = `${BASE}/websites`;
const WAIT_MS = Number(process.env.WAIT_MINUTES || 0) * 60_000;
const RETRY_MS = 20_000;

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const section = (html, re) => (html.match(re) || [""])[0];

function contentChecks(html) {
  const features = section(html, /<ul class="features">[\s\S]*?<\/ul>/);
  const work = section(html, /<section[^>]*id="work"[\s\S]*?<\/section>/);
  const renewal = section(html, /<section[^>]*aria-labelledby="renewal-title"[\s\S]*?<\/section>/);
  const h1 = text(section(html, /<h1[\s\S]*?<\/h1>/));
  const steps = text(section(html, /<ol class="steps">[\s\S]*?<\/ol>/));
  const faq = text(section(html, /<div class="faq">[\s\S]*?<\/div>\s*<\/div>/));
  const cards = html.match(/<article class="card package[\s\S]*?<\/article>/g) || [];
  const card = (id) => text(cards.find((c) => c.includes(`id="${id}"`)) || "");
  const featured = cards.filter((c) => c.includes("package--featured"));

  return [
    ["1. 'Google Maps & Business setup' is not in 'What's included in every website'",
      features !== "" && !/Google Maps/i.test(features)],
    ["2. Hero H1 says '7 working days'", h1.includes("7 working days")],
    ["2. 'How it works' step 4 says '7 working days'", /live in 7 working days/.test(steps)],
    ["2. FAQ says '7 working days'", faq.includes("7 working days")],
    ["2. No plain '7 days' left on the page", !/\b7 days\b/.test(text(html))],
    ["3. Starter card: Renewal from year 2: ₦25,000/year", card("pkg-starter").includes("Renewal from year 2: ₦25,000/year")],
    ["3. Business card: Renewal from year 2: ₦40,000/year", card("pkg-business").includes("Renewal from year 2: ₦40,000/year")],
    ["3. Online Store card: renewal quoted per store", card("pkg-online-store").includes("Renewal from year 2: quoted per store")],
    ["3. Renewal section lists all three and keeps 'No hidden charges.'",
      ["Starter", "₦25,000/year", "Business", "₦40,000/year", "Online Store", "Quoted per store", "No hidden charges."]
        .every((s) => text(renewal).includes(s))],
    [`4. Demo cards ${SHOW_DEMO_CARDS ? "shown" : "hidden"} (SHOW_DEMO_CARDS = ${SHOW_DEMO_CARDS})`,
      ["Restaurant demo", "School demo", "Shop demo"].every((d) => text(work).includes(d) === SHOW_DEMO_CARDS)],
    ["4. 'Websites we have built' shows ZAPPI PAY and SIRRADDO GLOBAL LIMITED",
      text(work).includes("ZAPPI PAY") && text(work).includes("SIRRADDO GLOBAL LIMITED")],
    ["5. Exactly one 'Recommended' badge, inside the Business card only",
      (html.match(/class="package-flag"/g) || []).length === 1 && featured.length === 1 &&
      featured[0].includes('id="pkg-business"') && /class="package-flag">Recommended</.test(featured[0])],
  ];
}

async function layoutChecks() {
  let browser;
  try {
    const { chromium } = await import("playwright");
    // PW_CHANNEL=chrome uses the Chrome already installed on GitHub's runners (no download needed).
    browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  } catch (err) {
    console.log(`Layout check skipped: no browser available (${String(err.message).split("\n")[0]})`);
    return [];
  }
  const results = [];
  for (const [w, h, label] of [[375, 740, "phone"], [1280, 800, "desktop"]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(PAGE, { waitUntil: "networkidle" });
    const r = await page.evaluate(() => {
      const flag = document.querySelector(".package-flag");
      const card = flag && flag.closest(".package");
      if (!flag || !card) return null;
      const f = flag.getBoundingClientRect(), c = card.getBoundingClientRect();
      const others = [...document.querySelectorAll(".package")].filter((p) => p !== card).map((p) => p.getBoundingClientRect());
      const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return {
        business: !!card.querySelector("#pkg-business"),
        inside: f.top >= c.top - 1 && f.bottom <= c.bottom + 1 && f.left >= c.left - 1 && f.right <= c.right + 1,
        atTop: f.top - c.top <= 3,
        touchesOther: others.some((o) => overlaps(f, o)),
      };
    });
    results.push([`5. Recommended band sits on top of the Business card only (${label}, ${w}px)`,
      !!r && r.business && r.inside && r.atTop && !r.touchesOther]);
    await page.close();
  }
  await browser.close();
  return results;
}

async function extraChecks() {
  const results = [];
  // The preview page answers (an invalid link shows the friendly "not valid" page), and Terms has the Paystack policies.
  try {
    const r = await fetch(`${BASE}/preview?t=live-check-invalid-token-0000`);
    results.push(["6. /preview is served (invalid link page)", r.status === 404 && (await r.text()).includes("preview link is not valid")]);
  } catch (e) { results.push([`6. /preview: ${e.message}`, false]); }
  try {
    const r = await fetch(`${BASE}/pay?t=live-check-invalid-token-0000`);
    results.push(["8. /pay is served (invalid link page)", r.status === 404 && (await r.text()).includes("This link is not valid")]);
  } catch (e) { results.push([`8. /pay: ${e.message}`, false]); }
  try {
    const t = await (await fetch(`${BASE}/terms?check=${Date.now()}`)).text();
    results.push(["7. Terms has the delivery and refunds policies", t.includes('id="delivery"') && t.includes('id="payments-refunds"')]);
  } catch (e) { results.push([`7. /terms: ${e.message}`, false]); }
  return results;
}

const deadline = Date.now() + WAIT_MS;
let results, attempt = 0;
while (true) {
  attempt++;
  try {
    const res = await fetch(`${PAGE}?check=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    results = contentChecks(await res.text());
    if (results.every(([, ok]) => ok)) results.push(...(await extraChecks())); // new pages may still be deploying: retried too
  } catch (e) {
    results = [[`Load ${PAGE}: ${e.message}`, false]];
  }
  if (results.every(([, ok]) => ok) || Date.now() >= deadline) break;
  console.log(`Attempt ${attempt}: ${results.filter(([, ok]) => !ok).length} check(s) not passing yet, retrying in ${RETRY_MS / 1000}s`);
  await new Promise((r) => setTimeout(r, RETRY_MS));
}
if (process.env.LAYOUT_CHECK === "1" && results.every(([, ok]) => ok)) results.push(...(await layoutChecks()));

console.log(`\nLive check of ${PAGE}\n`);
for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed ? `\n${failed} check(s) failed.` : `\nAll ${results.length} checks passed.`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### Live check: ${PAGE}\n\n| | Check |\n|---|---|\n` +
    results.map(([n, ok]) => `| ${ok ? "✅" : "❌"} | ${n} |`).join("\n") + "\n");
}
process.exit(failed ? 1 : 0);
