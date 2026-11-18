// Makes the ready-made ads and print flyers in assets/marketing (shown in admin → Marketing).
// Run on your computer after changing a price or wording here:  node scripts/make-marketing.mjs
// Needs Playwright (npm i -g playwright && npx playwright install chromium) and the dev dependency "qrcode".
// Each QR code opens the website with its own tag (utm_source=qr&utm_campaign=<piece>), so admin → Dashboard →
// "Where customers come from" shows which flyer or post brought each customer.
import { readFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

// Playwright from this project, or from a global install (npm i -g playwright).
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = createRequire(join(execSync("npm root -g").toString().trim(), "x"))("playwright")); }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "marketing");
const SITE = "https://www.sirraddo.com.ng/websites";
const WA = "0816 755 0937";
const NAVY = "#13244F", DEEP = "#0C1733", GOLD = "#D9A21B";

const link = (tag) => `${SITE}?utm_source=qr&utm_campaign=${tag}`;
async function qr(tag, px) {
  const svg = await QRCode.toString(link(tag), { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: NAVY, light: "#FFFFFF" } });
  return `<div class="qr" style="--q:${px}px">${svg.replace("<svg ", `<svg width="${px}" height="${px}" `)}</div>`;
}
const qrBox = async (tag, px, label) => `<div class="qrbox">${await qr(tag, px)}${label ? `<div class="qrl">${label}</div>` : ""}</div>`;

const logo = (s = 1) => `<div class="logo" style="--s:${s}"><div class="wm">SI<b>RR</b>A<b>DD</b>O</div><div class="gl">GLOBAL LIMITED</div></div>`;
const tick = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

const BASE = (font) => `
@font-face{font-family:Inter;src:url("data:font/woff2;base64,${font}") format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${NAVY}}
body{font-family:Inter,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
.page{position:relative;overflow:hidden;background:radial-gradient(120% 80% at 100% 0%,#1B3170 0%,${NAVY} 45%,${DEEP} 100%)}
.logo .wm{font-weight:800;font-size:calc(46px*var(--s));letter-spacing:-.01em;line-height:1}
.logo .wm b{color:${GOLD};font-weight:800}
.logo .gl{font-weight:700;font-size:calc(12.5px*var(--s));letter-spacing:.42em;margin-top:calc(6px*var(--s));opacity:.85}
.kick{color:${GOLD};font-weight:700;letter-spacing:.14em;text-transform:uppercase}
h1{font-weight:800;letter-spacing:-.03em;line-height:1.02}
.gold{color:${GOLD}}
.muted{color:#C9D1E6}
.qrbox{display:flex;flex-direction:column;align-items:center;gap:10px}
.qr{background:#fff;padding:calc(var(--q)*.07);border-radius:calc(var(--q)*.09);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.qr svg{display:block}
.qrl{font-weight:700;color:#fff;text-align:center;line-height:1.2}
.cta{background:${GOLD};color:${DEEP};border-radius:22px;font-weight:800}
.small{color:#AEB8D3}
`;

async function pieces() {
  return [
    {
      file: "story-websites", w: 1080, h: 1920,
      html: `<div class="page" style="width:1080px;height:1920px;padding:96px 84px 80px;display:flex;flex-direction:column">
${logo(1.4)}
<div class="kick" style="font-size:30px;margin-top:60px">Websites for Nigerian businesses</div>
<h1 style="font-size:112px;margin-top:20px">Your business deserves a website.</h1>
<p class="muted" style="font-size:38px;line-height:1.35;margin-top:28px">Mobile-friendly, Google-ready and live in 7 working days.</p>
<div style="margin-top:44px;display:flex;flex-direction:column;gap:18px">
${[["Starter", "₦50,000"], ["Business", "₦100,000"], ["Online Store", "<small style='font-size:.55em;color:#fff;margin-right:10px'>from</small>₦150,000"]].map(([a, b]) => `<div style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:26px 36px;display:flex;justify-content:space-between;align-items:center;font-size:42px;font-weight:700"><span>${a}</span><span class="gold" style="font-weight:800">${b}</span></div>`).join("")}
</div>
<p class="small" style="font-size:28px;margin-top:22px">Domain, hosting, SSL and business email included.</p>
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:40px;margin-bottom:40px">
${await qrBox("status-websites", 230)}
<div><div style="font-size:44px;font-weight:800;line-height:1.15">Scan to see prices<br>and real websites</div><div class="small" style="font-size:28px;margin-top:12px">or tap the link</div></div>
</div>
<div class="cta" style="padding:30px 40px"><div style="font-size:28px;font-weight:700">See packages and examples</div><div style="font-size:64px;margin-top:4px">sirraddo.com.ng</div></div>
<div style="font-size:32px;font-weight:700;margin-top:28px">WhatsApp: ${WA}</div>
<div class="small" style="font-size:22px;margin-top:10px">SIRRADDO GLOBAL LIMITED · RC 9939920 · Ibadan</div>
</div>`,
    },
    {
      file: "story-online-store", w: 1080, h: 1920,
      html: `<div class="page" style="width:1080px;height:1920px;padding:110px 84px 90px;display:flex;flex-direction:column">
${logo(1.45)}
<div class="kick" style="font-size:30px;margin-top:70px">Online store websites</div>
<h1 style="font-size:112px;margin-top:22px">Sell online. Get paid straight to your account.</h1>
<div style="margin-top:60px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:26px;padding:40px 44px;display:flex;flex-direction:column;gap:24px;font-size:38px;font-weight:600">
${["Your products with photos and prices", "Shopping basket for your buyers", "Pay online: card, transfer or USSD", "Or order straight on your WhatsApp", "Order alerts to you, receipts for buyers"].map((t) => `<div style="display:flex;gap:20px;align-items:center">${tick}<span>${t}</span></div>`).join("")}
</div>
<div style="font-size:44px;font-weight:800;margin-top:40px">From <span class="gold">₦150,000</span> <span class="small" style="font-size:28px;font-weight:600">· live in 7 working days</span></div>
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:40px;margin-bottom:40px">
${await qrBox("status-store", 230)}
<div><div style="font-size:44px;font-weight:800;line-height:1.15">Scan to try our<br>demo store</div><div class="small" style="font-size:28px;margin-top:12px">see how your buyers will shop</div></div>
</div>
<div class="cta" style="padding:30px 40px"><div style="font-size:28px;font-weight:700">Start your store today</div><div style="font-size:64px;margin-top:4px">sirraddo.com.ng</div></div>
<div style="font-size:32px;font-weight:700;margin-top:28px">WhatsApp: ${WA}</div>
</div>`,
    },
    {
      file: "post-starter", w: 1080, h: 1080,
      html: `<div class="page" style="width:1080px;height:1080px;padding:80px 80px 70px;display:flex;flex-direction:column">
${logo(1.2)}
<div style="font-size:40px;font-weight:600;margin-top:46px" class="muted">A professional website for your business</div>
<h1 class="gold" style="font-size:190px;margin-top:6px">₦50,000</h1>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:36px;flex:1">
<div style="display:flex;flex-direction:column;gap:22px;font-size:38px;font-weight:600">
${["Free .com.ng domain", "Hosting and SSL", "Business email", "Works on every phone"].map((t) => `<div style="display:flex;gap:18px;align-items:center">${tick}<span>${t}</span></div>`).join("")}
</div>
${await qrBox("post-starter", 220, '<span style="font-size:24px">Scan me</span>')}
</div>
<div class="cta" style="margin-top:44px;padding:26px 36px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:54px">sirraddo.com.ng</span><span style="font-size:24px;font-weight:700;text-align:right;line-height:1.25">Live in<br>7 working days</span></div>
</div>`,
    },
    {
      file: "post-how-it-works", w: 1080, h: 1080,
      html: `<div class="page" style="width:1080px;height:1080px;padding:80px;display:flex;flex-direction:column">
<div style="display:flex;justify-content:space-between;align-items:flex-start">${logo(1.2)}<div class="kick" style="font-size:24px;margin-top:10px">How it works</div></div>
<h1 style="font-size:88px;margin-top:50px">Your website in 4 easy steps</h1>
<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:46px;flex:1">
<div style="display:flex;flex-direction:column;gap:30px">
${[["Chat with us", "On WhatsApp or on our website"], ["Pay 70% to start", "Card, transfer or USSD"], ["Approve your preview", "Pick from up to 3 designs"], ["Pay the balance and go live", "On your own domain"]].map(([a, b], i) => `<div style="display:flex;gap:24px;align-items:center"><div style="width:76px;height:76px;border-radius:50%;background:${GOLD};color:${DEEP};font-weight:800;font-size:40px;display:flex;align-items:center;justify-content:center;flex:none">${i + 1}</div><div><div style="font-size:40px;font-weight:700">${a}</div><div class="small" style="font-size:26px;margin-top:4px">${b}</div></div></div>`).join("")}
</div>
${await qrBox("post-steps", 200, '<span style="font-size:24px">Scan to start</span>')}
</div>
<div style="font-size:40px;font-weight:800;margin-top:40px"><span class="gold">sirraddo.com.ng</span> <span style="font-size:28px;font-weight:600" class="muted">· WhatsApp ${WA}</span></div>
</div>`,
    },
    {
      file: "post-see-it-first", w: 1080, h: 1080,
      html: `<div class="page" style="width:1080px;height:1080px;padding:80px;display:flex;flex-direction:column">
${logo(1.2)}
<h1 style="font-size:76px;margin-top:36px">See your website before you pay the balance.</h1>
<p class="muted" style="font-size:32px;margin-top:18px">Pick your favourite of up to 3 designs, or ask for changes.</p>
<div style="display:flex;gap:30px;margin-top:36px;align-items:flex-end">
${[["Design A", "#fff", "#1E2A4A", "#A9B3C9", false], ["Design B", "#fff", "#7A2E6A", "#D8B9D3", true], ["Dark", "#1B2440", "#2B4C93", "#3A4666", false]].map(([n, bg, bar, block, pick]) => `<div style="text-align:center"><div style="width:210px;height:220px;border-radius:18px;background:${bg};overflow:hidden;${pick ? `outline:6px solid ${GOLD};outline-offset:6px` : ""}"><div style="height:34px;background:${bar}"></div><div style="padding:18px"><div style="height:16px;width:70%;background:${bar};border-radius:8px"></div><div style="height:10px;width:90%;background:${block};border-radius:6px;margin-top:12px"></div><div style="height:10px;width:60%;background:${block};border-radius:6px;margin-top:8px"></div><div style="height:28px;width:45%;background:${GOLD};border-radius:14px;margin-top:16px"></div><div style="display:flex;gap:10px;margin-top:16px"><div style="flex:1;height:52px;background:${block};border-radius:8px"></div><div style="flex:1;height:52px;background:${block};border-radius:8px"></div></div></div></div><div style="font-size:28px;font-weight:700;margin-top:18px;${pick ? `color:${GOLD}` : ""}">${n}</div></div>`).join("")}
</div>
<div style="flex:1"></div>
<div style="display:flex;justify-content:space-between;align-items:flex-end">
<div style="font-size:44px;font-weight:800"><span class="gold">sirraddo.com.ng</span><div class="muted" style="font-size:28px;font-weight:600;margin-top:8px">from ₦50,000 · WhatsApp ${WA}</div></div>
${await qrBox("post-see-first", 180)}
</div>
</div>`,
    },
    {
      file: "banner", w: 1200, h: 630,
      html: `<div class="page" style="width:1200px;height:630px;padding:56px 72px;display:flex;justify-content:space-between;gap:40px">
<div style="display:flex;flex-direction:column">
${logo(1.05)}
<h1 style="font-size:66px;margin-top:34px">Websites for your business <span class="gold">from ₦50,000</span></h1>
<p class="muted" style="font-size:24px;margin-top:18px">Domain, hosting and business email included<br>Live in 7 working days</p>
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:30px"><div class="cta" style="padding:16px 28px;font-size:38px;border-radius:16px">sirraddo.com.ng</div><div style="font-size:24px;font-weight:700">WhatsApp ${WA}</div></div>
</div>
<div style="display:flex;align-items:flex-end">${await qrBox("banner", 180, '<span style="font-size:20px">Scan me</span>')}</div>
</div>`,
    },
    // ---- Print ----
    {
      file: "flyer-a5", w: 1748, h: 2480, pdf: { width: "148mm", height: "210mm" }, print: true,
      html: `<div class="page" style="width:1748px;height:2480px;padding:120px 130px 100px;display:flex;flex-direction:column">
${logo(2.2)}
<div class="kick" style="font-size:42px;margin-top:70px">Websites for Nigerian businesses</div>
<h1 style="font-size:156px;margin-top:26px">Get your business online.</h1>
<p class="muted" style="font-size:52px;line-height:1.35;margin-top:36px">A professional website your customers can find on Google, live in 7 working days.</p>
<div style="margin-top:52px;display:flex;flex-direction:column;gap:22px">
${[["Starter", "₦50,000", "Up to 5 pages"], ["Business", "₦100,000", "Up to 10 pages + Google Maps"], ["Online Store", "from ₦150,000", "Products, basket, pay online"]].map(([a, b, c]) => `<div style="background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14);border-radius:34px;padding:34px 52px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:62px;font-weight:800">${a}</div><div class="small" style="font-size:38px;margin-top:6px">${c}</div></div><div class="gold" style="font-size:70px;font-weight:800">${b}</div></div>`).join("")}
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px 40px;margin-top:48px;font-size:44px;font-weight:600">
${["Free .com.ng domain", "Hosting & SSL", "Business email", "Works on every phone"].map((t) => `<div style="display:flex;gap:20px;align-items:center">${tick}<span>${t}</span></div>`).join("")}
</div>
<div style="flex:1"></div>
<div style="display:flex;align-items:center;gap:60px;background:rgba(255,255,255,.06);border-radius:44px;padding:48px">
${await qrBox("flyer-a5", 360)}
<div><div style="font-size:68px;font-weight:800;line-height:1.1">Scan to see prices and real websites</div><div class="gold" style="font-size:62px;font-weight:800;margin-top:28px">sirraddo.com.ng</div><div style="font-size:52px;font-weight:700;margin-top:18px">WhatsApp ${WA}</div></div>
</div>
<div class="small" style="font-size:30px;margin-top:36px;text-align:center">SIRRADDO GLOBAL LIMITED · RC 9939920 · Agbaakin Layout, Iwo Road, Ibadan</div>
</div>`,
    },
    {
      file: "qr-card", w: 1240, h: 1748, pdf: { width: "105mm", height: "148mm" }, print: true,
      html: `<div class="page" style="width:1240px;height:1748px;padding:96px 100px;display:flex;flex-direction:column;align-items:center;text-align:center">
${logo(1.9)}
<h1 style="font-size:100px;margin-top:64px">Want a website like this?</h1>
<p class="muted" style="font-size:44px;margin-top:30px">Scan with your phone camera</p>
<div style="margin-top:60px">${await qr("qr-card", 600)}</div>
<div style="flex:1"></div>
<div class="cta" style="padding:30px 60px;font-size:72px;border-radius:30px">sirraddo.com.ng</div>
<div style="font-size:46px;font-weight:700;margin-top:34px">Websites from ₦50,000</div><div class="muted" style="font-size:40px;font-weight:600;margin-top:10px">WhatsApp ${WA}</div>
</div>`,
    },
  ];
}

const font = (await readFile(join(ROOT, "assets", "fonts", "inter-latin-var.woff2"))).toString("base64");
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const p of await pieces()) {
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE(font)}</style></head><body>${p.html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  // Nothing may spill past the bottom padding (text cut off on the picture).
  const spill = await page.evaluate(() => {
    const pg = document.querySelector(".page"), pad = parseFloat(getComputedStyle(pg).paddingBottom), limit = pg.getBoundingClientRect().bottom - pad + 2;
    return Math.max(...[...pg.querySelectorAll("*")].map((e) => e.getBoundingClientRect().bottom)) - limit;
  });
  if (spill > 0) { console.error(`✗ ${p.file}: ${Math.ceil(spill)}px too tall. Make something smaller.`); process.exitCode = 1; }
  await page.screenshot({ path: join(OUT, p.file + ".jpg"), type: "jpeg", quality: 90 });
  if (p.pdf) {
    // Print PDF: the same page scaled to the paper size, colours to the edge.
    const scale = Math.min(1, (parseFloat(p.pdf.width) / 25.4 * 96) / p.w);
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE(font)}@page{size:${p.pdf.width} ${p.pdf.height};margin:0}body{zoom:${scale}}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${p.html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: join(OUT, p.file + ".pdf"), width: p.pdf.width, height: p.pdf.height, printBackground: true, pageRanges: "1" });
  }
  await page.close();
  console.log("made", p.file);
}
await browser.close();
