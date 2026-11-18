// Shared look for the ads, flyers and videos (scripts/make-marketing.mjs, scripts/make-videos.mjs).
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import QRCode from "qrcode";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(ROOT, "assets", "marketing");
export const SITE = "https://www.sirraddo.com.ng/websites";
export const WA = "0816 755 0937";
export const NAVY = "#13244F", DEEP = "#0C1733", GOLD = "#D9A21B";

export const link = (tag) => `${SITE}?utm_source=qr&utm_campaign=${tag}`;
export async function qr(tag, px) {
  const svg = await QRCode.toString(link(tag), { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: NAVY, light: "#FFFFFF" } });
  return `<div class="qr" style="--q:${px}px">${svg.replace("<svg ", `<svg width="${px}" height="${px}" `)}</div>`;
}
export const qrBox = async (tag, px, label) => `<div class="qrbox">${await qr(tag, px)}${label ? `<div class="qrl">${label}</div>` : ""}</div>`;

export const logo = (s = 1) => `<div class="logo" style="--s:${s}"><div class="wm">SI<b>RR</b>A<b>DD</b>O</div><div class="gl">GLOBAL LIMITED</div></div>`;
export const tick = `<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

export const BASE = (font) => `
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


export const loadFont = async () => (await readFile(join(ROOT, "assets", "fonts", "inter-latin-var.woff2"))).toString("base64");

// Playwright from this project, or from a global install (npm i -g playwright).
export async function getChromium() {
  try { return (await import("playwright")).chromium; }
  catch { return createRequire(join(execSync("npm root -g").toString().trim(), "x"))("playwright").chromium; }
}
