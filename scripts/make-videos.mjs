// Makes the short video ads in assets/marketing (1080 × 1920, for WhatsApp Status, Reels, TikTok and Stories).
// Run on your computer:  node scripts/make-videos.mjs [name]   (needs Playwright and ffmpeg)
// Each video is one HTML page; every frame is drawn from its time (t, in seconds) and piped into ffmpeg.
// Elements animate with data attributes:
//   data-in="1.2"      appears at 1.2 s         data-out="5"      leaves at 5 s
//   data-fx="up|pop|left|right|fade"            data-type="text"  types the text out from data-in
// No music is added (add a sound from the app's own library when you post, so it's licensed).
import { spawn } from "node:child_process";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { OUT, WA, NAVY, DEEP, GOLD, qr, logo, tick, BASE, loadFont, getChromium } from "./marketing-common.mjs";

const W = 1080, H = 1920, FPS = 30;

// The timeline: sets opacity/transform of every animated element for time t.
const ENGINE = `
const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
const els = [...document.querySelectorAll('[data-in]')].map((e) => ({ e, i: +e.dataset.in, o: e.dataset.out ? +e.dataset.out : 1e9, fx: e.dataset.fx || 'up', full: e.dataset.type ? e.textContent : null, d: +(e.dataset.dur || 0.55) }));
window.render = (t) => {
  for (const x of els) {
    const a = ease((t - x.i) / x.d), b = ease((t - x.o) / 0.4), v = a * (1 - b);
    const m = 1 - a;
    const tr = { up: 'translateY(' + (m * 70) + 'px)', pop: 'scale(' + (0.6 + 0.4 * a + 0.06 * Math.sin(Math.min(1, (t - x.i) / x.d) * Math.PI)) + ')', left: 'translateX(' + (-m * 120) + 'px)', right: 'translateX(' + (m * 120) + 'px)', fade: 'none', zoom: 'scale(' + (1.15 - 0.15 * a) + ')' }[x.fx];
    x.e.style.opacity = v; x.e.style.transform = tr;
    if (x.full != null) x.e.textContent = x.full.slice(0, Math.max(0, Math.floor((t - x.i) * 14)));
  }
  document.querySelectorAll('[data-tap]').forEach((e) => { const p = (t - +e.dataset.tap) / 0.6; e.style.opacity = p > 0 && p < 1 ? 1 - p : 0; e.style.transform = 'scale(' + (0.4 + p) + ')'; });
  document.querySelectorAll('[data-sel]').forEach((e) => { e.classList.toggle('sel', t >= +e.dataset.sel); });
};`;

const CSS = `
.v{position:relative;width:${W}px;height:${H}px;overflow:hidden}
.scene{position:absolute;inset:0;padding:120px 84px 110px;display:flex;flex-direction:column;justify-content:center}
.center{align-items:center;justify-content:center;text-align:center}
[data-in]{opacity:0;will-change:transform,opacity}
.big{font-weight:800;letter-spacing:-.03em;line-height:1.02}
.card{background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.14);border-radius:30px}
.phone{width:560px;height:1080px;border-radius:64px;background:#0B1022;border:14px solid #1E2A4A;box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;position:relative}
.scr{position:absolute;inset:0;background:#F5F6FA;color:#13244F;padding:34px 26px;font-size:24px;text-align:left}
.tap{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;background:rgba(217,162,27,.55);border:4px solid ${GOLD};opacity:0;pointer-events:none}
.pill{display:inline-block;background:${GOLD};color:${DEEP};font-weight:800;border-radius:999px}
.design{width:270px;border-radius:22px;overflow:hidden;outline:0 solid ${GOLD};outline-offset:8px;transition:none}
.design.sel{outline-width:8px}
`;

const endCard = async (tag, at, line) => `
<div class="scene center" data-in="${at}" data-fx="fade" data-dur="0.4">
  <div data-in="${at + 0.1}" data-fx="pop">${logo(2)}</div>
  <div class="big" style="font-size:84px;margin-top:70px" data-in="${at + 0.4}">${line}</div>
  <div style="margin-top:60px" data-in="${at + 0.7}" data-fx="pop">${await qr(tag, 420)}</div>
  <div style="font-size:36px;font-weight:700;margin-top:28px;color:#C9D1E6" data-in="${at + 0.9}">Scan or visit</div>
  <div class="pill" style="font-size:76px;padding:22px 56px;margin-top:22px" data-in="${at + 1.1}" data-fx="pop">sirraddo.com.ng</div>
  <div style="font-size:44px;font-weight:700;margin-top:40px" data-in="${at + 1.4}">WhatsApp ${WA}</div>
  <div style="font-size:26px;margin-top:20px;color:#AEB8D3" data-in="${at + 1.6}">SIRRADDO GLOBAL LIMITED · RC 9939920 · Ibadan</div>
</div>`;

const priceRows = (at) => [["Starter", "₦50,000"], ["Business", "₦100,000"], ["Online Store", "from ₦150,000"]].map(([a, b], i) =>
  `<div class="card" style="padding:40px 46px;display:flex;justify-content:space-between;align-items:center;font-size:52px;font-weight:700" data-in="${at + i * 0.35}" data-fx="left"><span>${a}</span><span style="color:${GOLD};font-weight:800">${b}</span></div>`).join("");

async function videos() {
  return [
    {
      file: "video-websites", dur: 21,
      html: `
<div class="scene center" data-in="0" data-out="3.6" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:150px;margin-top:80px" data-in="0.5">Is your business on <span style="color:${GOLD}">Google</span> yet?</div>
</div>
<div class="scene" data-in="3.8" data-out="8.6" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:96px" data-in="3.9">Customers search before they buy.</div>
  <div class="card" style="margin-top:80px;padding:34px 40px;display:flex;align-items:center;gap:26px;background:#fff;color:${NAVY};font-size:50px;font-weight:600" data-in="4.3" data-fx="pop">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
    <span data-in="4.8" data-type="1" data-fx="fade" data-dur="0.01">tailor near me in Ibadan</span>
  </div>
  <div class="card" style="margin-top:40px;padding:44px;background:#fff;color:${NAVY}" data-in="6.6" data-fx="up">
    <div style="font-size:30px;color:#4B5B84">www.yourbusiness.com.ng</div>
    <div style="font-size:52px;font-weight:800;margin-top:10px;color:#1A4FD6">Your Business, Ibadan</div>
    <div style="font-size:32px;margin-top:12px;color:#334">★★★★★ · Open now · Call · WhatsApp</div>
  </div>
  <div style="font-size:48px;font-weight:700;margin-top:60px;color:${GOLD}" data-in="7.3">Be the one they find.</div>
</div>
<div class="scene" data-in="8.8" data-out="13.8" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:100px" data-in="8.9">A professional website for your business</div>
  <div style="display:flex;flex-direction:column;gap:26px;margin-top:80px">${priceRows(9.6)}</div>
  <div style="font-size:40px;margin-top:40px;color:#C9D1E6" data-in="10.9">Live in 7 working days</div>
</div>
<div class="scene" data-in="14" data-out="17.4" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:104px" data-in="14.1">Everything included</div>
  <div style="display:flex;flex-direction:column;gap:44px;margin-top:90px;font-size:62px;font-weight:700">
    ${["Free .com.ng domain", "Hosting and SSL", "Business email", "Works on every phone", "On Google Maps"].map((t, i) => `<div style="display:flex;gap:30px;align-items:center" data-in="${14.5 + i * 0.35}" data-fx="left"><span style="font-size:1.1em">${tick}</span><span>${t}</span></div>`).join("")}
  </div>
</div>
${await endCard("video-websites", 17.6, "Get your business online")}`,
    },
    {
      file: "video-store", dur: 22,
      html: `
<div class="scene center" data-in="0" data-out="3.6" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:140px;margin-top:80px" data-in="0.5">Sell online.</div>
  <div class="big" style="font-size:110px;margin-top:20px;color:${GOLD}" data-in="1.1">Get paid straight to your account.</div>
</div>
<div class="scene center" data-in="3.8" data-out="13.4" data-fx="fade" data-dur="0.3">
  <div style="font-size:52px;font-weight:800;margin-bottom:46px" data-in="3.9">Your own online store</div>
  <div class="phone" data-in="4.1" data-fx="up">
    <div class="scr">
      <div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:30px"><span>Your Store</span><span style="background:${NAVY};color:#fff;border-radius:999px;padding:6px 16px;font-size:22px">🛒 <b data-in="7.4" data-fx="pop" style="display:inline-block">1</b></span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:26px">
        ${[["Ankara 6 yards", "₦12,500", "#E9A23B"], ["Lace blouse", "₦15,000", "#9B5DE5"], ["Gele", "₦5,000", "#00A6A6"], ["Silk scarf", "₦9,000", "#EF476F"]].map(([n, p, c], i) => `<div style="background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.08)" data-in="${4.6 + i * 0.2}" data-fx="pop"><div style="height:170px;background:linear-gradient(135deg,${c},#fff)"></div><div style="padding:14px"><div style="font-weight:700;font-size:22px">${n}</div><div style="font-weight:800;color:#0E7C3A;margin-top:4px">${p}</div><div style="background:#0E7C3A;color:#fff;border-radius:10px;text-align:center;padding:8px;margin-top:10px;font-size:20px;font-weight:700">Add to cart</div></div></div>`).join("")}
      </div>
      <div class="tap" data-tap="7.0" style="left:140px;top:420px"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:30px 30px 0 0;padding:34px 30px;box-shadow:0 -10px 30px rgba(0,0,0,.15)" data-in="8.3" data-fx="up">
        <div style="font-weight:800;font-size:30px">Checkout</div>
        <div style="display:flex;justify-content:space-between;margin-top:18px;font-size:26px"><span>Ankara 6 yards</span><b>₦12,500</b></div>
        <div style="background:#0E7C3A;color:#fff;border-radius:14px;text-align:center;padding:18px;margin-top:22px;font-weight:800;font-size:28px">Pay ₦12,500</div>
        <div style="text-align:center;font-size:20px;margin-top:10px;color:#556">Card · Transfer · USSD</div>
      </div>
      <div class="tap" data-tap="9.6" style="left:280px;top:960px"></div>
      <div style="position:absolute;inset:0;background:#0E7C3A;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px" data-in="10.2" data-fx="fade" data-dur="0.3">
        <div style="font-size:120px" data-in="10.4" data-fx="pop">✓</div>
        <div style="font-size:44px;font-weight:800;margin-top:20px">Payment successful</div>
        <div style="font-size:26px;margin-top:14px;opacity:.9">Receipt ready to save or share</div>
      </div>
    </div>
  </div>
  <div class="card" style="position:absolute;left:84px;right:84px;top:300px;background:#fff;color:${NAVY};padding:30px 34px;display:flex;gap:24px;align-items:center;box-shadow:0 20px 50px rgba(0,0,0,.4)" data-in="11.2" data-fx="up">
    <div style="width:84px;height:84px;border-radius:20px;background:#25D366;display:flex;align-items:center;justify-content:center;font-size:48px;flex:none">💬</div>
    <div><div style="font-size:32px;font-weight:800">New order paid: ₦12,500</div><div style="font-size:26px;color:#4B5B84;margin-top:6px">Ankara 6 yards × 1 · money sent to your bank</div></div>
  </div>
</div>
<div class="scene" data-in="13.6" data-out="18.2" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:100px" data-in="13.7">Your store, your customers, your brand</div>
  <div style="display:flex;flex-direction:column;gap:40px;margin-top:80px;font-size:56px;font-weight:700">
    ${["Products with photos and prices", "Shopping basket", "Pay by card, transfer or USSD", "Orders on WhatsApp too", "Stock counts you control"].map((t, i) => `<div style="display:flex;gap:28px;align-items:center" data-in="${14.2 + i * 0.35}" data-fx="left"><span style="font-size:1.1em">${tick}</span><span>${t}</span></div>`).join("")}
  </div>
  <div style="font-size:64px;font-weight:800;margin-top:80px" data-in="16.2" data-fx="pop">From <span style="color:${GOLD}">₦150,000</span></div>
</div>
${await endCard("video-store", 18.4, "Start your online store")}`,
    },
    {
      file: "video-see-first", dur: 20,
      html: `
<div class="scene center" data-in="0" data-out="3.6" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:130px;margin-top:80px" data-in="0.5">See your website <span style="color:${GOLD}">before</span> you pay the balance.</div>
</div>
<div class="scene" data-in="3.8" data-out="10.4" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:92px" data-in="3.9">We make up to 3 designs.</div>
  <div style="font-size:50px;font-weight:700;margin-top:24px;color:${GOLD}" data-in="4.4">You pick your favourite.</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:80px;justify-items:center">
    ${[["Design A", "#fff", "#1E2A4A", "#A9B3C9"], ["Design B", "#fff", "#7A2E6A", "#D8B9D3"], ["Dark", "#1B2440", "#2B4C93", "#3A4666"]].map(([n, bg, bar, block], i) => `<div style="text-align:center;${i === 2 ? "grid-column:1/3" : ""}" data-in="${5 + i * 0.4}" data-fx="pop"><div class="design" ${i === 1 ? 'data-sel="7.6"' : ""} style="background:${bg};height:330px"><div style="height:44px;background:${bar}"></div><div style="padding:24px"><div style="height:22px;width:70%;background:${bar};border-radius:10px"></div><div style="height:14px;width:92%;background:${block};border-radius:7px;margin-top:16px"></div><div style="height:14px;width:60%;background:${block};border-radius:7px;margin-top:10px"></div><div style="height:38px;width:48%;background:${GOLD};border-radius:19px;margin-top:22px"></div><div style="display:flex;gap:14px;margin-top:22px"><div style="flex:1;height:80px;background:${block};border-radius:10px"></div><div style="flex:1;height:80px;background:${block};border-radius:10px"></div></div></div></div><div style="font-size:40px;font-weight:700;margin-top:22px">${n}</div></div>`).join("")}
  </div>
  <div class="tap" data-tap="7.3" style="left:780px;top:880px"></div>
  <div class="pill" style="font-size:54px;padding:24px 50px;align-self:center;margin-top:50px" data-in="8.2" data-fx="pop">✓ Approve Design B</div>
</div>
<div class="scene" data-in="10.6" data-out="15.4" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:100px" data-in="10.7">Easy steps, no surprises</div>
  <div style="display:flex;flex-direction:column;gap:46px;margin-top:90px">
    ${[["Chat with us", "WhatsApp or our website"], ["Pay 70% to start", "Card, transfer or USSD"], ["Approve your preview", "Ask for changes any time"], ["Pay the balance, go live", "On your own domain"]].map(([a, b], i) => `<div style="display:flex;gap:34px;align-items:center" data-in="${11.2 + i * 0.45}" data-fx="left"><div style="width:110px;height:110px;border-radius:50%;background:${GOLD};color:${DEEP};font-weight:800;font-size:58px;display:flex;align-items:center;justify-content:center;flex:none">${i + 1}</div><div><div style="font-size:58px;font-weight:800">${a}</div><div style="font-size:38px;color:#AEB8D3;margin-top:6px">${b}</div></div></div>`).join("")}
  </div>
</div>
${await endCard("video-see-first", 15.6, "Websites from ₦50,000")}`,
    },
    {
      file: "video-why", dur: 21,
      html: `
<div class="scene center" data-in="0" data-out="3.4" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:132px;margin-top:80px" data-in="0.5">Tired of answering <span style="color:${GOLD}">"How much?"</span> all day?</div>
</div>
<div class="scene center" data-in="3.6" data-out="9.4" data-fx="fade" data-dur="0.3">
  <div class="phone" data-in="3.7" data-fx="up" style="height:1180px">
    <div class="scr" style="background:#ECE5DD;padding:0">
      <div style="background:#075E54;color:#fff;padding:30px 26px;font-weight:700;font-size:34px">💬 WhatsApp · 23 unread</div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:20px;font-size:36px">
        ${["How much is this one?", "Do you deliver to Bodija?", "Send me your price list", "Where is your shop?", "Are you open on Sunday?", "How much again? 🙏", "Do you have it in red?"].map((t, i) => `<div style="background:#fff;border-radius:20px 20px 20px 6px;padding:20px 24px;max-width:88%;box-shadow:0 1px 2px rgba(0,0,0,.12)" data-in="${4.1 + i * 0.6}" data-fx="left">${t}</div>`).join("")}
      </div>
    </div>
  </div>
  <div class="big" style="position:absolute;left:84px;right:84px;bottom:150px;font-size:64px;text-shadow:0 6px 30px rgba(0,0,0,.6)" data-in="8.4" data-fx="pop">Same questions. Every day. 😩</div>
</div>
<div class="scene" data-in="9.6" data-out="15.6" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:104px" data-in="9.7">Your website answers for you, <span style="color:${GOLD}">24/7</span></div>
  <div style="display:flex;flex-direction:column;gap:40px;margin-top:80px;font-size:58px;font-weight:700">
    ${["Prices and photos of everything", "Delivery areas and opening hours", "Your location on Google Maps", "Customers order on WhatsApp in one tap"].map((t, i) => `<div style="display:flex;gap:28px;align-items:center" data-in="${10.4 + i * 0.45}" data-fx="left"><span style="font-size:1.1em">${tick}</span><span>${t}</span></div>`).join("")}
  </div>
  <div style="font-size:52px;font-weight:800;margin-top:80px;color:${GOLD}" data-in="12.8">You focus on selling.</div>
</div>
${await endCard("video-why", 15.8, "Websites from ₦50,000")}`,
    },
    {
      file: "video-maps", dur: 21,
      html: `
<div class="scene center" data-in="0" data-out="3.6" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:136px;margin-top:80px" data-in="0.5">Can customers find you on <span style="color:${GOLD}">Google Maps?</span></div>
</div>
<div class="scene center" data-in="3.8" data-out="10.4" data-fx="fade" data-dur="0.3">
  <div class="phone" data-in="3.9" data-fx="up" style="height:1180px">
    <div class="scr" style="padding:0;background:#E8EEF3">
      <div style="position:absolute;inset:0;background:
        linear-gradient(90deg,transparent 47%,#fff 47%,#fff 53%,transparent 53%),
        linear-gradient(0deg,transparent 30%,#fff 30%,#fff 34%,transparent 34%),
        linear-gradient(0deg,transparent 68%,#fff 68%,#fff 71%,transparent 71%),
        linear-gradient(120deg,#DDE8D5 0 22%,transparent 22%),#E8EEF3"></div>
      <div style="position:absolute;left:24px;right:24px;top:26px;background:#fff;border-radius:40px;padding:22px 30px;font-size:28px;color:#555;box-shadow:0 2px 8px rgba(0,0,0,.15)"><span data-in="4.4" data-type="1" data-fx="fade" data-dur="0.01">salon near me</span></div>
      <div style="position:absolute;left:236px;top:330px;font-size:96px" data-in="6.0" data-fx="pop">📍</div>
      <div style="position:absolute;left:20px;right:20px;bottom:20px;background:#fff;border-radius:28px;padding:30px;box-shadow:0 -6px 24px rgba(0,0,0,.18)" data-in="6.6" data-fx="up">
        <div style="font-size:38px;font-weight:800;color:#13244F">Your Business</div>
        <div style="font-size:26px;color:#555;margin-top:6px"><span style="color:#E8A317">★★★★★</span> 4.9 · Hair salon · Open now</div>
        <div style="display:flex;gap:14px;margin-top:22px">${["Directions", "Call", "Website"].map((b, i) => `<div style="flex:1;text-align:center;border-radius:30px;padding:16px 0;font-weight:700;font-size:24px;${i === 0 ? "background:#1A73E8;color:#fff" : "border:2px solid #C9D3E0;color:#1A73E8"}">${b}</div>`).join("")}</div>
      </div>
      <div class="tap" data-tap="8.6" style="left:440px;top:1060px"></div>
    </div>
  </div>
  <div class="big" style="position:absolute;left:84px;right:84px;bottom:130px;font-size:62px;text-shadow:0 6px 30px rgba(0,0,0,.6)" data-in="9.0" data-fx="pop">Be the one they visit. 📍</div>
</div>
<div class="scene" data-in="10.6" data-out="16" data-fx="fade" data-dur="0.3">
  <div class="kick" style="font-size:36px" data-in="10.7">Business website</div>
  <div class="big" style="font-size:180px;margin-top:20px;color:${GOLD}" data-in="10.9" data-fx="pop">₦100,000</div>
  <div style="display:flex;flex-direction:column;gap:38px;margin-top:70px;font-size:56px;font-weight:700">
    ${["Up to 10 pages", "Help setting up Google Maps", "Customer reviews on your site", "Free .com.ng domain and hosting"].map((t, i) => `<div style="display:flex;gap:28px;align-items:center" data-in="${11.6 + i * 0.4}" data-fx="left"><span style="font-size:1.1em">${tick}</span><span>${t}</span></div>`).join("")}
  </div>
</div>
${await endCard("video-maps", 16.2, "Get found on Google")}`,
    },
    {
      file: "video-manage", dur: 21,
      html: `
<div class="scene center" data-in="0" data-out="3.6" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:132px;margin-top:80px" data-in="0.5">Your website. <span style="color:${GOLD}">Your control.</span></div>
  <div style="font-size:50px;margin-top:40px;color:#C9D1E6" data-in="1.2">Update it from your phone.</div>
</div>
<div class="scene center" data-in="3.8" data-out="11.4" data-fx="fade" data-dur="0.3">
  <div style="font-size:52px;font-weight:800;margin-bottom:44px" data-in="3.9">Your private Manage link</div>
  <div class="phone" data-in="4.1" data-fx="up">
    <div class="scr" style="padding:30px 24px">
      <div style="font-size:40px;font-weight:800">Manage my store</div>
      <div style="font-size:28px;color:#556;margin-top:4px">Kemi Wears</div>
      ${[["Ankara gown", "20000", "4", false], ["Lace blouse", "12000", "", false], ["Gele", "5000", "0", true]].map(([n, p, st, so], i) => `<div style="background:#fff;border-radius:16px;padding:18px;margin-top:18px;box-shadow:0 2px 8px rgba(0,0,0,.06)">
        <div style="font-weight:700;font-size:32px">${n}</div>
        <div style="display:flex;gap:10px;margin-top:12px;align-items:center;font-size:25px">
          <div style="flex:1;border:2px solid #D5DAE6;border-radius:10px;padding:10px 12px;white-space:nowrap">₦ ${i === 1 ? `<span data-in="6.4" data-fx="fade" data-dur="0.01" style="font-weight:800;color:#0E7C3A">15000</span><span data-in="0" data-out="6.3" data-fx="fade" data-dur="0.01">${p}</span>` : p}</div>
          <div style="border:2px solid #D5DAE6;border-radius:10px;padding:10px 12px">Stock ${i === 0 ? `<span data-in="7.6" data-fx="fade" data-dur="0.01" style="font-weight:800;color:#0E7C3A">10</span><span data-in="0" data-out="7.5" data-fx="fade" data-dur="0.01">${st}</span>` : st || "–"}</div>
          <div style="border-radius:10px;padding:10px 12px;font-weight:700;${so ? "background:#FDE2E1;color:#B42318" : "background:#E6F4EA;color:#0E7C3A"}">${so ? "Sold out" : "In stock"}</div>
        </div></div>`).join("")}
      <div class="tap" data-tap="6.0" style="left:150px;top:420px"></div>
      <div class="tap" data-tap="7.2" style="left:360px;top:250px"></div>
      <div style="background:#13244F;color:#fff;border-radius:14px;text-align:center;padding:20px;margin-top:26px;font-weight:800;font-size:28px">Save changes</div>
      <div class="tap" data-tap="8.6" style="left:256px;top:890px"></div>
      <div style="position:absolute;left:24px;right:24px;top:980px;background:#0E7C3A;color:#fff;border-radius:14px;text-align:center;padding:16px;font-weight:700;font-size:24px" data-in="9.0" data-fx="pop">Saved ✓ Your website is updated</div>
    </div>
  </div>
</div>
<div class="scene" data-in="11.6" data-out="16" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:100px" data-in="11.7">No waiting. No extra cost.</div>
  <div style="display:flex;flex-direction:column;gap:40px;margin-top:80px;font-size:56px;font-weight:700">
    ${["Prices, stock and opening hours", "Mark items sold out", "Approve customer reviews", "Bigger changes: free for your first month"].map((t, i) => `<div style="display:flex;gap:28px;align-items:center" data-in="${12.2 + i * 0.4}" data-fx="left"><span style="font-size:1.1em">${tick}</span><span>${t}</span></div>`).join("")}
  </div>
</div>
${await endCard("video-manage", 16.2, "Websites you control")}`,
    },
    {
      file: "video-pidgin", dur: 20,
      html: `
<div class="scene center" data-in="0" data-out="3.6" data-fx="fade" data-dur="0.01">
  <div data-in="0.2" data-fx="pop">${logo(1.6)}</div>
  <div class="big" style="font-size:136px;margin-top:80px" data-in="0.5">Your business dey <span style="color:${GOLD}">Google</span>?</div>
</div>
<div class="scene" data-in="3.8" data-out="8.6" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:100px" data-in="3.9">Customers dey search before dem buy.</div>
  <div style="font-size:60px;font-weight:700;margin-top:60px;color:${GOLD}" data-in="5.0">If dem no see you, dem go buy from another person. 🤷🏾</div>
</div>
<div class="scene" data-in="8.8" data-out="14" data-fx="fade" data-dur="0.3">
  <div class="big" style="font-size:100px" data-in="8.9">We go build your website</div>
  <div style="display:flex;flex-direction:column;gap:26px;margin-top:70px">${priceRows(9.6)}</div>
  <div style="font-size:44px;margin-top:44px;color:#C9D1E6" data-in="10.9">E go ready inside 7 working days. Domain, hosting and business email dey inside.</div>
</div>
${await endCard("video-pidgin", 14.2, "Make we start today!")}`,
    },
  ];
}

const only = process.argv[2];
const font = await loadFont();
const chromium = await getChromium();
const browser = await chromium.launch();
for (const v of await videos()) {
  if (only && v.file !== only) continue;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${BASE(font)}${CSS}</style></head><body><div class="v page">${v.html}</div><script>${ENGINE}</script></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  // --stills: a few frames to look at before the full render.
  if (process.argv.includes("--stills")) {
    for (const t of String(process.argv[process.argv.indexOf("--stills") + 1]).split(",").map(Number)) {
      await page.evaluate((t) => window.render(t), t);
      await page.screenshot({ path: `/tmp/${v.file}-${t}.jpg`, type: "jpeg", quality: 80 });
    }
    await page.close();
    continue;
  }
  const tmp = join(OUT, v.file + ".part.mp4");
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "64k", tmp], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, bad) => ff.on("exit", (c) => (c === 0 ? ok() : bad(new Error("ffmpeg failed " + c)))));
  for (let f = 0; f < v.dur * FPS; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  await rename(tmp, join(OUT, v.file + ".mp4"));
  // A cover picture for admin (the end card).
  await page.evaluate((t) => window.render(t), v.dur - 0.5);
  await page.screenshot({ path: join(OUT, v.file + ".jpg"), type: "jpeg", quality: 85 });
  await page.close();
  console.log("made", v.file);
}
await browser.close();
