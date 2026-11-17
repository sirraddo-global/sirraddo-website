// Client reviews on the Websites page: shows approved reviews of SIRRADDO and sends new ones (they wait for approval in admin).
(function () {
  var list = document.getElementById('rv-list'), sum = document.getElementById('rv-sum'), form = document.getElementById('rv-form');
  if (!list || !form) return;
  var msg = document.getElementById('rv-msg');
  function stars(n) {
    var s = document.createElement('span'); s.className = 'rv-stars'; s.setAttribute('aria-label', n + ' out of 5 stars');
    s.textContent = '★'.repeat(n); var off = document.createElement('span'); off.className = 'off'; off.textContent = '★'.repeat(5 - n); s.appendChild(off);
    return s;
  }
  fetch('/api/site?reviews=sirraddo').then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.count) { document.getElementById('rv-write').open = true; return; }
    sum.hidden = false; sum.textContent = '';
    sum.appendChild(stars(Math.round(j.average)));
    var b = document.createElement('b'); b.textContent = ' ' + j.average.toFixed(1); sum.appendChild(b);
    sum.appendChild(document.createTextNode(' out of 5 from ' + j.count + ' review' + (j.count === 1 ? '' : 's')));
    j.list.slice(0, 9).forEach(function (x) {
      var f = document.createElement('figure'); f.className = 'card rv-card';
      f.appendChild(stars(x.stars));
      if (x.text) { var q = document.createElement('blockquote'); q.textContent = x.text; f.appendChild(q); }
      var c = document.createElement('figcaption'); c.textContent = x.name; f.appendChild(c);
      list.appendChild(f);
    });
  }).catch(function () {});
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var s = form.querySelector('input[name=stars]:checked'), name = document.getElementById('rv-name').value.trim();
    if (!s) { msg.textContent = 'Please tap the stars to give a rating.'; return; }
    if (name.length < 2) { msg.textContent = 'Please write your name.'; return; }
    var btn = form.querySelector('button'); btn.disabled = true; msg.textContent = 'Sending…';
    fetch('/api/site?review=1', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ k: 'sirraddo', stars: +s.value, name: name, text: document.getElementById('rv-text').value, website: document.getElementById('rv-hp').value }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) { form.innerHTML = '<p class="rv-msg">Thank you! Your review will appear here once we have checked it.</p>'; }
        else { btn.disabled = false; msg.textContent = (x.j && x.j.error) || 'Sorry, that didn’t send.'; }
      }).catch(function () { btn.disabled = false; msg.textContent = 'No connection. Please try again.'; });
  });
})();
