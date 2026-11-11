// Admin page for customer requests saved by the website assistant. Talks to /api/requests.
(function () {
  var KEY = 'sirraddo-admin';
  var $ = function (id) { return document.getElementById(id); };
  var password = null;
  try { password = sessionStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  var data = [];
  var statuses = ['new', 'contacted', 'quoted', 'won', 'lost'];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function api(method, body) {
    return fetch('/api/requests', {
      method: method,
      headers: { 'Authorization': 'Bearer ' + password, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status });
        return j;
      });
    });
  }
  function waLink(contact) {
    var d = String(contact).replace(/\D/g, '');
    if (d.length < 10) return null;
    if (d.charAt(0) === '0') d = '234' + d.slice(1);
    return 'https://wa.me/' + d;
  }
  function when(s) {
    try { return new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return s; }
  }

  function showBoard(on) {
    $('login').hidden = on;
    $('board').hidden = !on;
    $('logout').hidden = !on;
  }

  function load() {
    $('board-error').textContent = '';
    return api('GET').then(function (j) {
      data = j.requests || [];
      if (j.statuses) statuses = j.statuses;
      fillFilter();
      render();
      showBoard(true);
    }).catch(function (err) {
      if (err.status === 401 || err.status === 429) {
        logout();
        $('login-error').textContent = err.message;
      } else {
        showBoard(true);
        $('board-error').textContent = err.message;
      }
    });
  }

  function fillFilter() {
    var f = $('filter');
    if (f.options.length > 1) return;
    statuses.forEach(function (s) { f.appendChild(new Option(s.charAt(0).toUpperCase() + s.slice(1), s)); });
  }

  function render() {
    var filter = $('filter').value;
    var rows = data.filter(function (r) { return !filter || r.status === filter; });
    var list = $('list');
    list.textContent = '';
    $('count').textContent = rows.length + ' of ' + data.length;
    if (!rows.length) list.appendChild(el('p', 'admin-empty', 'No requests yet.'));
    rows.forEach(function (r) {
      var card = el('article', 'admin-card admin-card--' + r.status);
      var top = el('div', 'admin-card-top');
      top.appendChild(el('h2', null, r.name));
      top.appendChild(el('span', 'admin-tag', r.interest));
      card.appendChild(top);

      var meta = el('p', 'admin-meta');
      meta.appendChild(document.createTextNode(r.contact + ' '));
      var wa = waLink(r.contact);
      if (wa) {
        var a = el('a', null, 'WhatsApp');
        a.href = wa; a.target = '_blank'; a.rel = 'noopener';
        meta.appendChild(a);
      } else if (/@/.test(r.contact)) {
        var m = el('a', null, 'Email');
        m.href = 'mailto:' + r.contact;
        meta.appendChild(m);
      }
      meta.appendChild(document.createTextNode(' · ' + (r.business || 'No business given') + ' · ' + when(r.created_at)));
      card.appendChild(meta);
      card.appendChild(el('p', 'admin-details', r.details));

      var controls = el('div', 'admin-controls');
      var sel = el('select');
      sel.setAttribute('aria-label', 'Status for ' + r.name);
      statuses.forEach(function (s) { sel.appendChild(new Option(s, s, false, s === r.status)); });
      sel.addEventListener('change', function () {
        api('PATCH', { id: r.id, status: sel.value }).then(function () {
          r.status = sel.value;
          render();
        }).catch(function (err) { $('board-error').textContent = err.message; });
      });
      controls.appendChild(sel);

      var notes = el('textarea');
      notes.rows = 2;
      notes.placeholder = 'Your notes (saved when you leave the box)';
      notes.value = r.notes || '';
      notes.setAttribute('aria-label', 'Notes for ' + r.name);
      notes.addEventListener('change', function () {
        api('PATCH', { id: r.id, notes: notes.value }).then(function () { r.notes = notes.value; })
          .catch(function (err) { $('board-error').textContent = err.message; });
      });
      controls.appendChild(notes);
      card.appendChild(controls);

      if (r.transcript && r.transcript.length) {
        var det = el('details');
        det.appendChild(el('summary', null, 'Conversation (' + r.transcript.length + ' messages)'));
        r.transcript.forEach(function (m) {
          var p = el('p', 'admin-line');
          p.appendChild(el('strong', null, (m.role === 'user' ? 'Customer' : 'Assistant') + ': '));
          p.appendChild(document.createTextNode(m.content));
          det.appendChild(p);
        });
        card.appendChild(det);
      }
      list.appendChild(card);
    });
  }

  function logout() {
    password = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    showBoard(false);
  }

  $('login').addEventListener('submit', function (e) {
    e.preventDefault();
    $('login-error').textContent = '';
    password = $('password').value;
    try { sessionStorage.setItem(KEY, password); } catch (err) { /* ignore */ }
    $('password').value = '';
    load();
  });
  $('logout').addEventListener('click', logout);
  $('refresh').addEventListener('click', load);
  $('filter').addEventListener('change', render);

  if (password) load();
})();
