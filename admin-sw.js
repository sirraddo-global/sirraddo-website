// Service worker for the installable Admin app (scope /admin only).
// It always uses the network so you see live data; it only shows a short message when you're offline.
// It never caches API responses.
const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIRRADDO Admin</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,Arial,sans-serif;background:#F5F7FB;color:#13254F;text-align:center;padding:20px">
<div><h1 style="font-size:1.3rem">You're offline</h1><p>Admin needs the internet. Check your data or Wi-Fi, then try again.</p>
<button onclick="location.reload()" style="font:inherit;font-weight:700;padding:12px 20px;border-radius:10px;border:0;background:#13254F;color:#fff">Try again</button></div>`;
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // everything else goes straight to the network
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
