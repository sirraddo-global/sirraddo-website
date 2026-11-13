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
