// What every customer website gets, whatever the package:
//   - Install as an app: "Add to home screen" gives the business its own app icon (no app store), and pages
//     already seen still open with a weak or no network.
//   - A quick-action bar on phones (Call, WhatsApp, Directions, and the main page) for sites without a shop cart
//     (online stores have their own bar: Home, Shop, Cart, Saved, Account).
//   - "Open now" / "Closed now" from the opening hours, in Lagos time (only when the hours can be read for sure).
//   - Share and Install buttons in the footer.
//   - Low-data friendly: with Data Saver on, nothing moves by itself.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const KIT_CSS = `.qbar{display:none}
@media(max-width:760px){.qbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:62;background:var(--qbar-bg,#fff);border-top:1px solid rgba(127,127,127,.25);box-shadow:0 -4px 16px rgba(0,0,0,.08);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.qbar a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:.74rem;font-weight:700;color:var(--qbar-ink,#1F2933);text-decoration:none;padding:4px 0}.qbar a svg{width:24px;height:24px}.qbar a.wa2{color:#1DA851}
body.has-qbar{padding-bottom:72px}body.has-qbar .wa{display:none!important}}
.opennow{display:flex;width:fit-content;align-items:center;gap:6px;font-weight:700;font-size:.92rem;border-radius:999px;padding:4px 12px;margin-top:10px;background:rgba(255,255,255,.92);color:#1F2933}.opennow[hidden]{display:none}
.opennow i{width:9px;height:9px;border-radius:50%;background:#16A34A;box-shadow:0 0 0 3px rgba(22,163,74,.25)}.opennow.shut i{background:#9CA3AF;box-shadow:none}
.kitbtns{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.kitbtns button{font:inherit;font-size:.85rem;font-weight:700;border-radius:999px;padding:7px 14px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;opacity:.85}.kitbtns button[hidden]{display:none}`;

const I = {
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  wa: '<path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9c0 3 2 5 5 6l1-1.5-2-1-1 1c-1-.5-1.6-1.1-2-2l1-1-1-2z" fill="currentColor"/>',
  map: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  page: '<path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n]}</svg>`;
const tel = (p) => String(p || "").replace(/[^\d+]/g, "");

// The phone bar: Call, WhatsApp, Directions and the most useful page (services, menu, prices or contact).
export function actionBar(site, link, waHref) {
  const items = [];
  if (site.phone && tel(site.phone).length >= 7) items.push(`<a href="tel:${esc(tel(site.phone))}">${svg("call")}Call</a>`);
  if (waHref) items.push(`<a class="wa2" href="${waHref}">${svg("wa")}WhatsApp</a>`);
  if (site.address) items.push(`<a href="https://www.google.com/maps/dir/?api=1&amp;destination=${encodeURIComponent(site.address.replace(/\s*\n\s*/g, ", "))}" target="_blank" rel="noopener">${svg("map")}Directions</a>`);
  const pg = site.pages.find((p) => ["services", "prices", "menu", "shop", "portfolio"].includes(p.kind)) || site.pages.find((p) => p.kind === "contact");
  if (pg) items.push(`<a href="${link(pg.slug)}">${svg("page")}${esc(pg.name.length > 12 ? pg.name.slice(0, 11) + "…" : pg.name)}</a>`);
  if (items.length < 2) return "";
  return `<nav class="qbar" aria-label="Quick actions">${items.join("")}</nav>`;
}

// "Open now" badge: the hours are read in the browser (Lagos time). If they can't be read for sure, nothing shows.
export const openBadge = (site) => (site.hours ? `<p class="opennow" hidden data-hours="${esc(site.hours)}"><i></i><span></span></p>` : "");

export function kitScript(site, { exportMode }) {
  return `<script>(function(){var low=false;try{var cn=navigator.connection;low=!!(cn&&(cn.saveData||/2g/.test(cn.effectiveType||'')))}catch(x){}if(low)document.documentElement.classList.add('lowdata');window.__lowData=low;
var qb=document.querySelector('.qbar');if(qb){document.body.classList.add('has-qbar');var bg='#fff',el=document.body;while(el){var c=getComputedStyle(el).backgroundColor;if(c&&c!=='transparent'&&!/rgba\\(.*,\\s*0\\)$/.test(c)){bg=c;break}el=el.parentElement}
var m=bg.match(/\\d+/g)||[255,255,255],dark=(+m[0]*299+ +m[1]*587+ +m[2]*114)/1000<128;qb.style.setProperty('--qbar-bg',bg);qb.style.setProperty('--qbar-ink',dark?'#F3F4F6':'#1F2933')}
// Opening hours → open / closed now (Lagos time).
var D=['sun','mon','tue','wed','thu','fri','sat'];function day(w){w=w.toLowerCase().slice(0,3);if(w==='tues')w='tue';var k=D.indexOf(w);return k}
function tm(h,mi,ap,fb){h=+h;mi=+(mi||0);ap=(ap||fb||'').toLowerCase();if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;return h*60+mi}
function parse(t){var bad=false;t=String(t).replace(/\\u2013|\\u2014/g,'-').replace(/\\bnoon\\b/ig,'12pm').replace(/\\bmidnight\\b/ig,'12am');if(/24\\s*\\/\\s*7|24\\s*hours/i.test(t))return {all:true};var R=[];
t.split(/[;\\n,]|\\.\\s/).forEach(function(seg){var dm=seg.match(/(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*(?:\\s*(?:-|to|till|until|through)\\s*(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*)?/i);
var days=[];if(/daily|every\\s*day|everyday|all\\s*week/i.test(seg))days=[0,1,2,3,4,5,6];else if(/weekdays/i.test(seg))days=[1,2,3,4,5];else if(dm){var a=day(dm[1]),b=dm[2]?day(dm[2]):a;if(a<0||b<0)return;for(var k=a;;k=(k+1)%7){days.push(k);if(k===b)break}}
if(!days.length)return;if(/closed/i.test(seg)){R.push({days:days,closed:true});return}
var tmx=seg.match(/(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?\\s*(?:-|to|till|until)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?/i);if(!tmx){bad=true;return}
var o=tm(tmx[1],tmx[2],tmx[3],tmx[6]&&!tmx[3]&&+tmx[1]<12?'am':''),c=tm(tmx[4],tmx[5],tmx[6],'pm');if(!tmx[3]&&!tmx[6]){bad=true;return}R.push({days:days,o:o,c:c})});return R.length&&!bad?R:null}
function lagos(){var p=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()),g=function(k){return(p.filter(function(x){return x.type===k})[0]||{}).value};return{d:day(g('weekday')),m:(+g('hour')%24)*60+(+g('minute'))}}
function fmt(m){var h=Math.floor(m/60)%24,mi=m%60,ap=h>=12?'pm':'am';h=h%12||12;return h+(mi?':'+(mi<10?'0':'')+mi:'')+ap}
document.querySelectorAll('.opennow[data-hours]').forEach(function(b){var R=parse(b.getAttribute('data-hours'));if(!R)return;var n=lagos(),open=false,until=null;
if(R.all)open=true;else R.forEach(function(r){if(!r.closed&&r.days.indexOf(n.d)>=0&&n.m>=r.o&&n.m<r.c){open=true;until=r.c}});
b.classList.toggle('shut',!open);b.querySelector('span').textContent=open?'Open now'+(until!==null?' \\u00b7 closes '+fmt(until):''):'Closed now';b.hidden=false});
// Share and install.
var sh=document.querySelector('.kitbtns .share');if(sh)sh.addEventListener('click',function(){var u=location.href.split('#')[0],t=document.title;if(navigator.share)navigator.share({title:t,url:u}).catch(function(){});else window.open('https://wa.me/?text='+encodeURIComponent(t+' '+u),'_blank')});
var ins=document.querySelector('.kitbtns .install'),dp=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;if(ins)ins.hidden=false});
if(ins)ins.addEventListener('click',function(){if(dp){dp.prompt();dp=null;ins.hidden=true}});
${exportMode ? `if('serviceWorker' in navigator&&location.protocol==='https:')window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});` : ""}})();</script>`;
}
export const kitButtons = () => `<span class="kitbtns"><button type="button" class="share">Share this website</button><button type="button" class="install" hidden>Install our app</button></span>`;

// ---------- Install as an app ----------
export function appIconSvg(site) {
  const letter = esc(String(site.name || "?").trim().charAt(0).toUpperCase() || "?");
  const bg = /^#[0-9a-f]{3,8}$/i.test(site.theme?.primary || "") ? site.theme.primary : "#13254F";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${bg}"/><text x="256" y="338" font-family="Arial,Helvetica,sans-serif" font-size="260" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
}
export function manifest(site) {
  const bg = /^#[0-9a-f]{3,8}$/i.test(site.theme?.primary || "") ? site.theme.primary : "#13254F";
  const icons = [{ src: "/app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }];
  return JSON.stringify({ name: site.name, short_name: String(site.name).slice(0, 12), start_url: "/", scope: "/", display: "standalone", background_color: "#ffffff", theme_color: bg, description: site.tagline || "", icons }, null, 1);
}
// Pages: network first (always the latest), with the last copy kept for a bad network. Photos: kept once loaded.
// Nothing from other websites (payments, our API) is ever stored.
export const SW_JS = `const V='site-v1';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
if(r.mode==='navigate'){e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put(r,c));return res}).catch(()=>caches.match(r).then(m=>m||caches.match('/'))));return}
if(/\\.(png|jpe?g|webp|gif|svg)$/i.test(u.pathname)){e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(V).then(x=>x.put(r,c))}return res})))}});
`;
