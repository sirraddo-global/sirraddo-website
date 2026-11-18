/* Light / dark theme. Follows the phone or laptop setting until the visitor taps the sun/moon button,
   which remembers their choice on this device. Loaded in <head> so the page never flashes the wrong colours. */
(function () {
  var KEY = 'sirraddo-theme', root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var chosen = saved === 'dark' || saved === 'light';
  function system() { return mq && mq.matches ? 'dark' : 'light'; }
  root.setAttribute('data-theme', chosen ? saved : system());
  function current() { return root.getAttribute('data-theme'); }
  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var btn = null;
  function paint() {
    var dark = current() === 'dark';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0A1226' : '#13254F');
    if (btn) {
      btn.innerHTML = dark ? SUN : MOON;
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = dark ? 'Light mode' : 'Dark mode';
    }
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!chosen) { root.setAttribute('data-theme', system()); paint(); } });
  function mount() {
    var host = document.querySelector('.header-inner, .admin-bar-inner');
    if (host && !host.querySelector('.theme-toggle')) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-toggle' + (host.classList.contains('admin-bar-inner') ? ' theme-toggle--bar' : '');
      btn.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        chosen = true;
        try { localStorage.setItem(KEY, next); } catch (e) {}
        paint();
      });
      var before = host.classList.contains('admin-bar-inner') ? host.lastElementChild : host.querySelector('.menu-toggle') || host.querySelector('.site-nav');
      if (before) host.insertBefore(btn, before); else host.appendChild(btn);
    }
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();

/* Where this visitor came from (an ad, Google, Facebook…), so admin shows which ads bring customers.
   The first source in the last 30 days is kept on this device; nothing is sent anywhere until they
   leave their details. Ad links: add ?utm_source=facebook&utm_campaign=ibadan-test (any names). */
(function () {
  var KEY = 'sirraddo-from', DAYS = 30;
  function label() {
    var p = new URLSearchParams(location.search);
    var src = (p.get('utm_source') || p.get('src') || '').trim(), camp = (p.get('utm_campaign') || '').trim();
    if (!src && p.get('gclid')) src = 'google-ads';
    if (!src && p.get('fbclid')) src = 'facebook';
    if (src) return (src + (camp ? ' / ' + camp : '')).toLowerCase().slice(0, 80);
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    if (!ref || ref === location.hostname) return '';
    if (/(^|\.)google\./.test(ref)) return 'google (search)';
    if (/facebook|fb\.com/.test(ref)) return 'facebook';
    if (/instagram/.test(ref)) return 'instagram';
    if (/whatsapp|wa\.me/.test(ref)) return 'whatsapp';
    if (/t\.co$|twitter|x\.com/.test(ref)) return 'x (twitter)';
    if (/tiktok/.test(ref)) return 'tiktok';
    if (/bing\.|yahoo\.|duckduckgo/.test(ref)) return 'search engine';
    return ref.replace(/^www\./, '').slice(0, 80);
  }
  try {
    var now = Date.now(), saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && now - saved.at > DAYS * 86400000) saved = null;
    var l = label();
    if (l && (!saved || !saved.v)) localStorage.setItem(KEY, JSON.stringify({ v: l, at: now }));
    else if (!saved) localStorage.setItem(KEY, JSON.stringify({ v: '', at: now }));
  } catch (e) {}
  window.sirraddoFrom = function () {
    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); return (s && s.v) || 'direct'; } catch (e) { return ''; }
  };
})();
