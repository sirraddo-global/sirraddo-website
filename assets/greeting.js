/* Festive greeting ribbon (Christmas, Sallah, New Year…). Admin → Settings → Festive greetings decides
   which festivals show and the message; the dates and message come from /api/site?greeting=1. */
(function () {
  function show(g) {
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
    fetch('/api/site?greeting=1').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.greeting) show(j.greeting); }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
