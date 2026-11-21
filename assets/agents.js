/* SIRRADDO agents page: apply, log in, and the agent's dashboard (link, ready messages, clients, earnings, payouts). */
(function () {
  var KEY = 'sirraddo-agent';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') n.textContent = v; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var naira = function (n) { return '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG'); };
  var token = function () { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
  var setToken = function (t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) {} };
  function api(body) {
    return fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.status = r.status; throw e; } return j; }); });
  }
  function copy(text, btn) {
    var done = function () { var t = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = t; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallback(); }); else fallback();
    function fallback() { var t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove(); }
  }

  // ----- Commission figures on the page -----
  function showProgramme(p) {
    $$('[data-rate]').forEach(function (n) { n.textContent = p.rate; });
    $$('[data-min]').forEach(function (n) { n.textContent = naira(p.min); });
    $$('[data-earn]').forEach(function (n) { var v = naira(Number(n.getAttribute('data-earn')) * p.rate / 100); n.textContent = n.hasAttribute('data-from') ? 'from ' + v : v; });
  }
  fetch('/api/agent').then(function (r) { return r.json(); }).then(showProgramme).catch(function () {});

  // ----- Tabs -----
  function tab(which) {
    ['apply', 'login'].forEach(function (k) {
      var on = k === which;
      $('#tab-' + k).setAttribute('aria-selected', on ? 'true' : 'false');
      var panel = $('#' + k); if (panel) panel.hidden = !on;
    });
  }
  $('#tab-apply').addEventListener('click', function () { tab('apply'); });
  $('#tab-login').addEventListener('click', function () { tab('login'); });
  function fromHash() {
    if (location.hash === '#login') { tab('login'); $('#join').scrollIntoView(); }
    if (location.hash === '#apply') { tab('apply'); $('#join').scrollIntoView(); }
  }
  window.addEventListener('hashchange', fromHash);
  $$('a[href="#apply"], a[href="#login"]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); fromHash(); var f = $(a.getAttribute('href') + ' input'); if (f) f.focus({ preventScroll: true }); }); });

  // ----- Apply -----
  $('#apply').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('.ag-msg', f), btn = $('button[type=submit]', f);
    var v = { action: 'apply', name: f.name.value, phone: f.phone.value, email: f.email.value, city: f.city.value, pitch: f.pitch.value, password: f.password.value, agree: f.agree.checked };
    if (v.name.trim().length < 3) { msg.textContent = 'Please enter your full name.'; f.name.focus(); return; }
    if (v.phone.replace(/\D/g, '').length < 10) { msg.textContent = 'Please enter your WhatsApp number, e.g. 08031234567.'; f.phone.focus(); return; }
    if (v.password.length < 8) { msg.textContent = 'Choose a password of at least 8 characters.'; f.password.focus(); return; }
    if (!v.agree) { msg.textContent = 'Please tick that you agree to the agent rules.'; f.agree.focus(); return; }
    msg.textContent = ''; btn.disabled = true; btn.textContent = 'Sending…';
    api(v).then(function () {
      f.replaceWith(el('div', { class: 'ag-done', id: 'apply', role: 'status' }, [el('b', { text: 'Thank you, ' + v.name.trim().split(/\s+/)[0] + '! 🎉' }),
        el('p', { text: 'We\'ve got your application. We\'ll check it and message you on WhatsApp, usually within 1–2 days. Then log in here with your WhatsApp number and the password you chose.' })]));
    }).catch(function (err) { btn.disabled = false; btn.textContent = 'Send my application'; msg.textContent = err.message; });
  });

  // ----- Log in -----
  $('#login').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = $('.ag-msg', f), btn = $('button[type=submit]', f);
    if (!f.phone.value.trim() || !f.password.value) { msg.textContent = 'Enter your WhatsApp number and password.'; return; }
    msg.textContent = ''; btn.disabled = true; btn.textContent = 'Logging in…';
    api({ action: 'login', phone: f.phone.value, password: f.password.value }).then(function (j) {
      setToken(j.token); f.password.value = ''; btn.disabled = false; btn.textContent = 'Log in'; load(true);
    }).catch(function (err) { btn.disabled = false; btn.textContent = 'Log in'; msg.textContent = err.message; });
  });

  // ----- Dashboard -----
  var wrap = $('#dashboard-wrap'), dash = $('#ag-dash');
  function load(scroll) {
    if (!token()) return;
    api({ action: 'me' }).then(function (d) { draw(d); if (scroll) wrap.scrollIntoView({ behavior: 'smooth' }); })
      .catch(function (e) { if (e.status === 401) { setToken(''); showLoggedOut(); } });
  }
  function showLoggedOut() { wrap.hidden = true; $('#join').hidden = false; $('.ag-hero .ag-cta').hidden = false; }
  function messages(d) {
    var link = d.link;
    return [
      ['For any business', 'Hello! Does your business have a website yet? SIRRADDO builds professional websites from ₦50,000, with your own .com.ng name, WhatsApp button and Google listing. Take a look: ' + link],
      ['For shops and sellers', 'Sell online 24/7 with your own online store: customers pick products, pay by card or transfer, and you get the order on WhatsApp. SIRRADDO builds it for you: ' + link],
      ['For churches, schools and groups', 'Give your church, school or association a proper website for announcements, events, photos and contact. SIRRADDO sets it all up: ' + link],
    ];
  }
  function stat(label, value, cls) { return el('div', { class: 'ag-stat' + (cls ? ' ' + cls : '') }, [el('span', { text: label }), el('b', { text: value })]); }
  function draw(d) {
    wrap.hidden = false; $('#join').hidden = true; $('.ag-hero .ag-cta').hidden = true;
    dash.textContent = '';
    var a = d.agent;
    dash.appendChild(el('div', { class: 'ag-dash-head' }, [el('div', null, [el('p', { class: 'eyebrow eyebrow--dark', text: 'Your agent dashboard' }), el('h2', { text: 'Hello, ' + a.name.split(/\s+/)[0] + ' 👋' })]),
      el('div', { class: 'ag-code' }, [el('span', { text: 'Agent code' }), el('b', { text: a.code })])]));
    if (a.must_change) dash.appendChild(passwordBox(true));
    // Stats
    dash.appendChild(el('div', { class: 'ag-stats' }, [stat('Businesses sent', String(d.count)), stat('Paying clients', String(d.clients)), stat('You\'ve earned', naira(d.earned)), stat('Paid to you', naira(d.paidOut)), stat('Balance', naira(d.balance), 'is-bal')]));
    // Link + messages
    var link = el('input', { value: d.link, readonly: true, 'aria-label': 'Your link' });
    var share = el('div', { class: 'ag-box' }, [el('h3', { text: 'Your link' }), el('p', { class: 'ag-small', text: 'Everyone who contacts us through this link is counted as yours. You earn ' + d.rate + '% when they pay for their website.' }),
      el('div', { class: 'ag-linkrow' }, [link, el('button', { type: 'button', class: 'btn btn--navy', text: 'Copy', onclick: function (e) { copy(d.link, e.currentTarget); } })])]);
    share.appendChild(el('h4', { text: 'Ready messages: tap to share on WhatsApp' }));
    messages(d).forEach(function (m) {
      share.appendChild(el('div', { class: 'ag-msgcard' }, [el('b', { text: m[0] }), el('p', { text: m[1] }), el('div', { class: 'ag-acts' }, [
        el('a', { class: 'btn btn--gold', href: 'https://wa.me/?text=' + encodeURIComponent(m[1]), target: '_blank', rel: 'noopener', text: 'Share on WhatsApp' }),
        el('button', { type: 'button', class: 'btn btn--outline', text: 'Copy', onclick: function (e) { copy(m[1], e.currentTarget); } })])]));
    });
    dash.appendChild(share);
    // Payout
    var pay = el('div', { class: 'ag-box' }, [el('h3', { text: 'Get paid' })]);
    if (!a.bank) pay.appendChild(el('p', { class: 'ag-small', text: 'Add the bank account we should pay you into.' }));
    var bank = el('form', { class: 'ag-bank', novalidate: true }, [
      el('label', null, ['Bank', el('input', { name: 'bank', value: a.bank ? a.bank.bank : '', placeholder: 'e.g. Opay, GTBank', maxlength: 60 })]),
      el('label', null, ['Account number', el('input', { name: 'account_no', value: a.bank ? a.bank.account_no : '', inputmode: 'numeric', maxlength: 10 })]),
      el('label', null, ['Account name', el('input', { name: 'account_name', value: a.bank ? a.bank.account_name : '', maxlength: 100 })]),
      el('p', { class: 'ag-msg', role: 'alert' }), el('button', { type: 'submit', class: 'btn btn--navy', text: a.bank ? 'Update bank details' : 'Save bank details' })]);
    bank.addEventListener('submit', function (e) {
      e.preventDefault(); var b = $('button', bank); b.disabled = true;
      api({ action: 'bank', bank: bank.bank.value, account_no: bank.account_no.value, account_name: bank.account_name.value }).then(draw).catch(function (err) { b.disabled = false; $('.ag-msg', bank).textContent = err.message; });
    });
    if (a.bank) {
      var can = d.balance >= d.min && !a.payout_requested_at;
      var req = el('button', { type: 'button', class: 'btn btn--gold btn--block', disabled: !can, text: a.payout_requested_at ? 'Payout requested: we\'re on it' : 'Request payout of ' + naira(d.balance) });
      var note = el('p', { class: 'ag-small', role: 'status', text: a.payout_requested_at ? 'We pay within 7 working days of your request.' : d.balance < d.min ? 'You can request a payout once your balance reaches ' + naira(d.min) + '.' : 'We send it to ' + a.bank.bank + ' · ' + a.bank.account_no + ' within 7 working days.' });
      req.addEventListener('click', function () { req.disabled = true; api({ action: 'payout' }).then(draw).catch(function (err) { req.disabled = false; note.textContent = err.message; }); });
      pay.appendChild(req); pay.appendChild(note);
      pay.appendChild(el('details', null, [el('summary', { text: 'Bank details: ' + a.bank.bank + ' · ' + a.bank.account_no }), bank]));
    } else pay.appendChild(bank);
    if (d.payouts.length) {
      pay.appendChild(el('h4', { text: 'Payouts' }));
      pay.appendChild(el('ul', { class: 'ag-list' }, d.payouts.map(function (p) { return el('li', null, [el('span', { text: new Date(p.when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + (p.ref ? ' · ' + p.ref : '') }), el('b', { text: naira(p.amount) })]); })));
    }
    dash.appendChild(pay);
    // Clients
    var cl = el('div', { class: 'ag-box' }, [el('h3', { text: 'Businesses you sent' })]);
    if (!d.leads.length) cl.appendChild(el('p', { class: 'ag-small', text: 'None yet. Share your link or a ready message above: when someone contacts us through it, they show here.' }));
    else cl.appendChild(el('ul', { class: 'ag-list ag-leads' }, d.leads.map(function (l) {
      return el('li', null, [el('div', null, [el('b', { text: l.who }), el('small', { text: (l.what || 'Website') + ' · ' + new Date(l.when).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }), el('span', { class: 'ag-stage', text: l.stage })]),
        el('b', { class: l.earned ? 'ag-earned' : 'ag-zero', text: l.earned ? '+' + naira(l.earned) : '₦0' })]);
    })));
    dash.appendChild(cl);
    // Account
    var acc = el('div', { class: 'ag-box ag-account' }, [el('details', null, [el('summary', { text: 'Change my password' }), passwordBox(false)]),
      el('p', { class: 'ag-small' }, ['Rules: ', el('a', { href: '#rules', text: 'how commission works' }), ' · Questions? ', el('a', { href: 'https://wa.me/2348167550937', target: '_blank', rel: 'noopener', text: 'WhatsApp us' })]),
      el('button', { type: 'button', class: 'btn btn--outline', text: 'Log out', onclick: function () { setToken(''); showLoggedOut(); window.scrollTo({ top: 0, behavior: 'smooth' }); } })]);
    dash.appendChild(acc);
  }
  function passwordBox(forced) {
    var f = el('form', { class: 'ag-bank' + (forced ? ' ag-forced' : ''), novalidate: true }, [
      forced ? el('p', null, [el('b', { text: 'Please choose your own password' }), ' (you logged in with a temporary one).']) : null,
      el('label', null, [forced ? 'Temporary password' : 'Current password', el('input', { name: 'current', type: 'password', autocomplete: 'current-password' })]),
      el('label', null, ['New password', el('input', { name: 'next', type: 'password', autocomplete: 'new-password', minlength: 8 })]),
      el('p', { class: 'ag-msg', role: 'alert' }), el('button', { type: 'submit', class: 'btn btn--navy', text: 'Save password' })]);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var b = $('button', f);
      b.disabled = true;
      api({ action: 'password', current: f.current.value, next: f.next.value }).then(function (j) { setToken(j.token); load(); }).catch(function (err) { b.disabled = false; $('.ag-msg', f).textContent = err.message; });
    });
    return f;
  }
  if (token()) load(false); else fromHash();
})();
