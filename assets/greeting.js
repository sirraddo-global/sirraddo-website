/* Banners at the top of the page:
   - Service notices (planned upgrades, service problems, holiday breaks…): Admin → Settings → Service notices.
   - Festive greeting ribbon (Christmas, Sallah, New Year…): Admin → Settings → Festive greetings.
   Both come from /api/site?greeting=1. A closed banner stays closed on this device. */
(function () {
  function closed(key) { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } }
  function remember(key) { try { localStorage.setItem(key, '1'); } catch (e) {} }
  function styles() {
    if (document.getElementById('sgl-notice-css')) return;
    var css = document.createElement('style');
    css.id = 'sgl-notice-css';
    css.textContent = '.sgl-notice{display:flex;align-items:center;gap:12px;padding:10px 16px;background:#13254F;color:#fff;font:15px/1.45 system-ui,Arial,sans-serif;border-bottom:3px solid #D9A21B}' +
      '.sgl-notice p{margin:0 auto;max-width:1100px;flex:1}.sgl-notice--issue{background:#7A1E1E;border-color:#F2B8B5}' +
      '.sgl-notice button{background:none;border:0;color:inherit;font-size:24px;line-height:1;min-width:44px;min-height:44px;cursor:pointer}';
    document.head.appendChild(css);
  }
  function notice(n) {
    var key = 'sirraddo-notice-' + n.id;
    if (closed(key)) return;
    styles();
    var bar = document.createElement('div');
    bar.className = 'sgl-notice sgl-notice--' + n.kind;
    bar.setAttribute('role', n.kind === 'issue' ? 'alert' : 'status');
    var text = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = n.emoji + ' ' + n.title + ': ';
    text.appendChild(strong);
    text.appendChild(document.createTextNode(n.message));
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close notice');
    close.textContent = '×';
    close.addEventListener('click', function () { bar.remove(); remember(key); });
    bar.appendChild(text);
    bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function greeting(g) {
    var key = 'sirraddo-greeting-closed';
    try { if (localStorage.getItem(key) === g.key) return; } catch (e) {}
    var bar = document.createElement('div');
    bar.className = 'greeting-bar greeting-bar--' + g.id;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', g.title);
    var text = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = g.emoji + ' ' + g.title + ' from SIRRADDO!';
    text.appendChild(strong);
    text.appendChild(document.createTextNode(' ' + g.message));
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'greeting-close';
    close.setAttribute('aria-label', 'Close greeting');
    close.textContent = '×';
    close.addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem(key, g.key); } catch (e) {}
    });
    bar.appendChild(text);
    bar.appendChild(close);
    document.body.insertBefore(bar, document.body.firstChild);
  }
  function load() {
    fetch('/api/site?greeting=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return;
      if (j.greeting && document.querySelector('link[href*="styles.css"]')) greeting(j.greeting);
      (j.notices || []).slice().reverse().forEach(notice); // notices sit above the greeting
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
