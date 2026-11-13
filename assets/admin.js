// SIRRADDO admin page: customer requests, clients and renewals, assistant questions and chats,
// invoices and receipts, settings. Talks to /api/requests (password in the Authorization header).
(function () {
  'use strict';
  var KEY = 'sirraddo-admin';
  var $ = function (id) { return document.getElementById(id); };

  var COMPANY = {
    name: 'SIRRADDO GLOBAL LIMITED',
    rc: 'RC 9939920', tin: 'TIN 2623092457685',
    address: 'PLT 106/107 Agbaakin Layout, Iwo Road, Olowotinfiowosanu Area, Ibadan, Oyo State, Nigeria',
    phone: '+234 816 755 0937', email: 'sirraddogloballimited@gmail.com'
  };
  var PACKAGES = ['Starter website', 'Business website', 'Online Store', 'Custom app', 'Business software', 'ZAPPI PAY', 'Other'];
  var DEFAULT_QUOTE = { 'Starter website': 50000, 'Business website': 100000, 'Online Store': 150000 };
  var DEFAULT_RENEWAL = { 'Starter website': 25000, 'Business website': 40000 };
  var STAGE_LABEL = { '': 'Not started', content: 'Waiting for content', building: 'Building', review: 'Preview sent', live: 'Live' };
  var PREVIEW_LABEL = { sent: ['Waiting for customer', 'is-new'], changes: ['Changes asked', 'is-due'], approved: ['Approved', 'is-won'] };
  var DEFAULT_HANDOVER_TERMS = "Small fixes to text and photos are free for 30 days after your website goes live. After that, tell us what you'd like changed and we'll quote it before we start. Your yearly renewal keeps your domain, hosting, SSL certificate, business email and backups running.";
  var TEMPLATES = {
    tpl_new: { label: 'First contact', text: 'Hello {name}, this is SIRRADDO GLOBAL LIMITED. Thank you for your interest in our {package} package. Could you tell us a bit more about your business so we can get started?' },
    tpl_quoted: { label: 'Quote follow-up', text: 'Hello {name}, following up on your {package} quote of {amount}. To start, we need a 70% deposit of {deposit}, and the balance when your site is ready. Any questions, just ask.' },
    tpl_won: { label: 'Send your content', text: 'Hello {name}, thank you for choosing SIRRADDO! To begin, please send your logo, photos, a short business description and your contact details. Your website will be live within 7 working days after we receive them.' },
    tpl_payment: { label: 'Payment received', text: 'Hello {name}, we have received your payment, thank you. Total paid: {paid}. Balance: {balance}.' },
    tpl_brief: { label: 'Send project form', text: 'Hello {name}, thank you for your deposit! Please fill in your project details here: {brief_link}\nIt takes about 10-15 minutes, and you can save and finish later with the same link.' },
    tpl_invoice: { label: 'Send invoice', text: 'Hello {name}, here is your invoice for the {package} package. Total: {amount}. Paid: {paid}. Balance: {balance}. View or save it here: {doc_link}\nPay online: {pay_link}' },
    tpl_receipt: { label: 'Send receipt', text: 'Hello {name}, thank you for your payment of {last_payment}. Your receipt: {doc_link}' },
    tpl_preview: { label: 'Send website preview', text: 'Hello {name}, your website preview is ready! Please look through every page here: {preview_link}\nAt the bottom you can approve it or tell us what to change.' },
    tpl_handover: { label: 'Website is live (handover)', text: 'Hello {name}, your website is now live at {website}! Here is your handover pack with your domain, email and renewal details: {doc_link}\nI will send your logins in a separate message. Please change the passwords the first time you log in.' },
    tpl_renewal: { label: 'Renewal reminder', text: 'Hello {name}, your website renewal of {renewal_amount} is due on {renewal_due}. It covers your domain, hosting, SSL, business email and backups. Please let us know once you have paid so everything keeps running.\nPay online: {pay_link}' }
  };

  var password = null;
  try { password = sessionStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  var state = {
    tab: 'dashboard', requests: [], unanswered: [], settings: {}, statuses: [], stages: [], chats: null,
    open: {}, filters: { q: '', status: '', interest: '', due: false }, chatQuery: '', canEmail: false, canPay: false, justPaid: {}
  };

  // ---------- Small helpers ----------
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }
  function naira(n) { return n == null || n === '' ? '-' : '₦' + Number(n).toLocaleString('en-NG'); }
  function today() {
    var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }
  function addYears(dateStr, n) {
    var d = new Date(dateStr + 'T12:00:00'); d.setFullYear(d.getFullYear() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    return Math.round((new Date(dateStr + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  }
  function when(s) {
    try { return new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return s; }
  }
  function niceDate(s) {
    try { return new Date(s + 'T12:00:00').toLocaleDateString('en-NG', { dateStyle: 'medium' }); } catch (e) { return s; }
  }
  function waNumber(contact) {
    var d = String(contact || '').replace(/\D/g, '');
    if (d.length < 10) return null;
    return d.charAt(0) === '0' ? '234' + d.slice(1) : d;
  }
  function payments(r) { return Array.isArray(r.payments) ? r.payments : []; }
  function emailOf(r) { return r.email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact || '') ? r.contact : null); }
  function docUrl(r, type) { return location.origin + '/doc?t=' + r.doc_token + '&type=' + type; }
  function paid(r, kind) {
    return payments(r).filter(function (p) { return !kind || p.kind === kind; })
      .reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
  }
  function balance(r) { return r.quote_amount == null ? null : Math.max(0, r.quote_amount - paid(r, 'project')); }
  function isOpen(r) { return r.status !== 'won' && r.status !== 'lost'; }
  function followUpDue(r) { var d = daysUntil(r.follow_up_on); return isOpen(r) && d !== null && d <= 0; }
  function setError(msg) { $('app-error').textContent = msg || ''; }
  var statusTimer;
  function flash(msg) {
    setError(''); // a success clears any old error message
    $('app-status').textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { $('app-status').textContent = ''; }, 2500);
  }

  function api(method, body, query) {
    return fetch('/api/requests' + (query || ''), {
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
  function fail(err) {
    if (err.status === 401 || err.status === 429) { logout(); $('login-error').textContent = err.message; return; }
    setError(err.message);
  }
  function replaceRequest(row) {
    state.requests = state.requests.map(function (r) { return r.id === row.id ? row : r; });
  }
  function update(r, fields, msg) {
    fields.id = r.id;
    return api('PATCH', fields).then(function (row) {
      replaceRequest(row); setError(''); flash(msg || 'Saved'); render();
    }).catch(fail);
  }

  // ---------- Loading, login, tabs ----------
  function load() {
    setError('');
    return api('GET', null, '?view=all').then(function (j) {
      state.requests = j.requests || [];
      state.unanswered = j.unanswered || [];
      state.settings = j.settings || {};
      state.statuses = j.statuses || [];
      state.stages = j.stages || [];
      state.canEmail = Boolean(j.can_email_customers);
      state.canPay = Boolean(j.can_pay_online);
      state.setup = j.setup || [];
      showApp(true);
      render();
    }).catch(function (err) {
      if (err.status === 401 || err.status === 429) { logout(); $('login-error').textContent = err.message; }
      else { showApp(true); setError(err.message); }
    });
  }
  function showApp(on) {
    $('login').hidden = on; $('app').hidden = !on; $('logout').hidden = !on;
  }
  function logout() {
    password = null;
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    showApp(false);
  }
  function setTab(tab) {
    state.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll('.admin-tabs button'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tab') === tab ? 'true' : 'false');
    });
    setError('');
    if (tab === 'chats' && state.chats === null) {
      $('view').textContent = 'Loading conversations…';
      api('GET', null, '?view=chats').then(function (j) { state.chats = j.chats || []; render(); }).catch(fail);
      return;
    }
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    var view = $('view');
    view.textContent = '';
    var fn = { dashboard: renderDashboard, requests: renderRequests, clients: renderClients,
      questions: renderQuestions, chats: renderChats, settings: renderSettings }[state.tab];
    fn(view);
  }

  // ---------- Dashboard ----------
  function tile(label, value, note, onclick) {
    return el(onclick ? 'button' : 'div', { class: 'admin-tile', type: onclick ? 'button' : null, onclick: onclick },
      [el('span', { class: 'admin-tile-label', text: label }), el('strong', { text: String(value) }), note ? el('small', { text: note }) : null]);
  }
  // Which connections are set in Vercel (values are never sent to the browser).
  function setupCard() {
    var items = state.setup || [];
    if (!items.length) return null;
    var problems = items.filter(function (s) { return !s.ok || s.warn; }).length;
    var d = el('details', { class: 'admin-card admin-setup' });
    if (problems) d.open = true;
    d.appendChild(el('summary', null, [el('strong', { text: 'Setup status' }), ' ',
      badge(problems ? problems + ' to check' : 'All set', problems ? 'is-due' : 'is-won')]));
    d.appendChild(el('ul', null, items.map(function (s) {
      var mark = !s.ok ? '✗' : s.warn ? '!' : '✓';
      return el('li', { class: !s.ok ? 'is-bad' : s.warn ? 'is-warn' : 'is-ok' }, [
        el('span', { class: 'admin-setup-mark', text: mark, 'aria-label': !s.ok ? 'Not set' : s.warn ? 'Check' : 'Set' }),
        el('div', null, [el('b', { text: s.label }),
          s.note ? el('small', { text: s.note.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, function (m) { return when(m); }) }) : null,
          !s.ok ? el('small', { class: 'admin-setup-fix', text: 'How to fix: ' + s.fix }) : null])
      ]);
    })));
    return d;
  }

  function renderDashboard(view) {
    var rs = state.requests;
    var sc = setupCard();
    if (sc) view.appendChild(sc);
    var weekAgo = Date.now() - 7 * 86400000;
    var thisWeek = rs.filter(function (r) { return new Date(r.created_at) > weekAgo; }).length;
    var open = rs.filter(isOpen).length;
    var due = rs.filter(followUpDue);
    var won = rs.filter(function (r) { return r.status === 'won'; });
    var lost = rs.filter(function (r) { return r.status === 'lost'; }).length;
    var winRate = won.length + lost ? Math.round(100 * won.length / (won.length + lost)) + '%' : '-';
    var valueWon = won.reduce(function (s, r) { return s + Number(r.quote_amount || 0); }, 0);
    var paidAll = rs.reduce(function (s, r) { return s + paid(r); }, 0);
    var outstanding = won.reduce(function (s, r) { return s + (balance(r) || 0); }, 0);
    var renewals = won.filter(function (r) { var d = daysUntil(r.renewal_due); return d !== null && d <= 30; });
    var openQs = state.unanswered.filter(function (q) { return !q.resolved; }).length;

    view.appendChild(el('div', { class: 'admin-tiles' }, [
      tile('New this week', thisWeek),
      tile('Open leads', open, null, function () { state.filters = { q: '', status: '', interest: '', due: false }; setTab('requests'); }),
      tile('Follow-ups due', due.length, due.length ? 'tap to see' : null, function () { state.filters.due = true; setTab('requests'); }),
      tile('Win rate', winRate, won.length + ' won, ' + lost + ' lost'),
      tile('Value won', naira(valueWon)),
      tile('Paid so far', naira(paidAll), 'projects and renewals'),
      tile('Outstanding', naira(outstanding), 'balances on won jobs'),
      tile('Renewals in 30 days', renewals.length, null, function () { setTab('clients'); }),
      tile('Unanswered questions', openQs, null, function () { setTab('questions'); }),
      tile('Client sites down', rs.filter(function (r) { return r.status === 'won' && r.site_status && r.site_status !== 'up'; }).length, 'checked every morning', function () { setTab('clients'); })
    ]));

    var counts = {};
    rs.forEach(function (r) { counts[r.interest] = (counts[r.interest] || 0) + 1; });
    var max = Math.max.apply(null, [1].concat(Object.keys(counts).map(function (k) { return counts[k]; })));
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Requests by package' }));
    view.appendChild(rs.length ? el('div', { class: 'admin-bars' }, Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) {
      return el('div', { class: 'admin-bar-row' }, [
        el('span', { text: k }),
        el('span', { class: 'admin-bar-track' }, [el('span', { class: 'admin-bar-fill', style: 'width:' + Math.round(100 * counts[k] / max) + '%' })]),
        el('b', { text: String(counts[k]) })
      ]);
    })) : el('p', { class: 'admin-empty', text: 'No requests yet.' }));

    if (due.length) {
      view.appendChild(el('h2', { class: 'admin-h2', text: 'Follow up now' }));
      view.appendChild(el('ul', { class: 'admin-mini' }, due.map(function (r) {
        var d = -daysUntil(r.follow_up_on);
        return el('li', null, [el('b', { text: r.name }), ' · ' + r.interest + ' · ' + (d ? d + ' day(s) overdue' : 'today')]);
      })));
    }
    if (renewals.length) {
      view.appendChild(el('h2', { class: 'admin-h2', text: 'Renewals coming up' }));
      view.appendChild(el('ul', { class: 'admin-mini' }, renewals.map(function (r) {
        var d = daysUntil(r.renewal_due);
        return el('li', null, [el('b', { text: r.name }), ' · ' + naira(r.renewal_amount) + ' · ' + (d < 0 ? (-d) + ' day(s) overdue' : d === 0 ? 'today' : 'in ' + d + ' day(s)')]);
      })));
    }
  }

  // ---------- Requests ----------
  function matches(r) {
    var f = state.filters;
    if (f.status && r.status !== f.status) return false;
    if (f.interest && r.interest !== f.interest) return false;
    if (f.due && !followUpDue(r)) return false;
    if (f.q) {
      var hay = [r.name, r.contact, r.email, r.business, r.details, r.notes, r.interest, 'sgl-' + String(r.id).padStart(4, '0')].join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
    }
    return true;
  }
  function select(options, value, attrs) {
    var s = el('select', attrs);
    options.forEach(function (o) {
      var v = typeof o === 'string' ? o : o[0], label = typeof o === 'string' ? o : o[1];
      s.appendChild(new Option(label, v, false, v === (value || '')));
    });
    return s;
  }
  function renderRequests(view) {
    var f = state.filters;
    var search = el('input', { type: 'search', placeholder: 'Search name, phone, business…', value: f.q, 'aria-label': 'Search requests' });
    var timer;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { f.q = search.value; drawList(); }, 200);
    });
    var status = select([['', 'All statuses']].concat(state.statuses.map(function (s) { return [s, cap(s)]; })), f.status, { 'aria-label': 'Status' });
    status.addEventListener('change', function () { f.status = status.value; drawList(); });
    var interest = select([['', 'All packages']].concat(PACKAGES), f.interest, { 'aria-label': 'Package' });
    interest.addEventListener('change', function () { f.interest = interest.value; drawList(); });
    var due = el('input', { type: 'checkbox', id: 'f-due' });
    due.checked = f.due;
    due.addEventListener('change', function () { f.due = due.checked; drawList(); });

    view.appendChild(el('div', { class: 'admin-toolbar' }, [
      search, status, interest,
      el('label', { class: 'admin-check', for: 'f-due' }, [due, ' Follow-ups due']),
      el('button', { class: 'btn btn--navy', type: 'button', text: '+ Add customer', onclick: function () { addForm.hidden = !addForm.hidden; } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Export CSV', onclick: exportCsv })
    ]));
    var addForm = renderAddForm();
    view.appendChild(addForm);
    var count = el('p', { class: 'admin-count' });
    var list = el('div', { class: 'admin-list' });
    view.appendChild(count);
    view.appendChild(list);

    function drawList() {
      var rows = state.requests.filter(matches);
      count.textContent = rows.length + ' of ' + state.requests.length;
      list.textContent = '';
      if (!rows.length) list.appendChild(el('p', { class: 'admin-empty', text: state.requests.length ? 'Nothing matches.' : 'No requests yet.' }));
      rows.forEach(function (r) { list.appendChild(requestCard(r)); });
    }
    drawList();
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function renderAddForm() {
    var name = el('input', { required: true, placeholder: 'Name' });
    var contact = el('input', { required: true, placeholder: 'Phone (WhatsApp) or email' });
    var email = el('input', { type: 'email', placeholder: 'Email (optional, for receipts)' });
    var business = el('input', { placeholder: 'Business (optional)' });
    var interest = select(PACKAGES, 'Starter website', { 'aria-label': 'Package' });
    var details = el('textarea', { rows: 2, placeholder: 'What they need' });
    var form = el('form', { class: 'admin-card admin-add', hidden: true }, [
      el('h2', { text: 'Add a customer' }), name, contact, email, business, interest, details,
      el('button', { class: 'btn btn--navy', type: 'submit', text: 'Save' })
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', { action: 'create', name: name.value, contact: contact.value, email: email.value, business: business.value, interest: interest.value, details: details.value })
        .then(function (row) {
          state.requests.unshift(row); state.open[row.id] = true; flash('Customer added'); render();
        }).catch(fail);
    });
    return form;
  }

  function field(label, input, hint) {
    return el('label', { class: 'admin-field' }, [el('span', { text: label }), input, hint ? el('small', { text: hint }) : null]);
  }
  function badge(text, cls) { return el('span', { class: 'admin-badge ' + (cls || ''), text: text }); }

  function requestCard(r) {
    var card = el('article', { class: 'admin-card admin-card--' + r.status });
    var top = el('div', { class: 'admin-card-top' }, [el('h2', { text: r.name }), el('span', { class: 'admin-tag', text: r.interest })]);
    card.appendChild(top);

    var badges = el('div', { class: 'admin-badges' }, [badge(cap(r.status), 'is-' + r.status)]);
    var SOURCE = { manual: 'Added by hand', form: 'Package form', contact: 'Contact form', 'chat-form': 'Chat (no AI reply)' };
    if (SOURCE[r.source]) badges.appendChild(badge(SOURCE[r.source]));
    if (r.follow_up_on && isOpen(r)) {
      var d = daysUntil(r.follow_up_on);
      badges.appendChild(badge(d < 0 ? 'Follow-up ' + (-d) + 'd overdue' : d === 0 ? 'Follow up today' : 'Follow up ' + niceDate(r.follow_up_on), d <= 0 ? 'is-due' : ''));
    }
    if (r.quote_amount != null) badges.appendChild(badge('Quote ' + naira(r.quote_amount) + ' · paid ' + naira(paid(r, 'project'))));
    card.appendChild(badges);

    var meta = el('p', { class: 'admin-meta' }, [r.contact + (r.email && r.email !== r.contact ? ' · ' + r.email : '') + ' · ' + (r.business || 'No business given') + ' · ' + when(r.created_at)]);
    card.appendChild(meta);
    card.appendChild(el('p', { class: 'admin-details', text: r.details }));
    card.appendChild(whatsAppRow(r));

    var details = el('details', { class: 'admin-manage' });
    details.open = Boolean(state.open[r.id]);
    details.addEventListener('toggle', function () { state.open[r.id] = details.open; });
    details.appendChild(el('summary', { text: 'Manage' }));
    details.appendChild(manageBody(r));
    card.appendChild(details);
    return card;
  }

  function fill(text, r) {
    var quote = r.quote_amount;
    if (!state.canPay || !r.doc_token) text = text.split('\n').filter(function (l) { return l.indexOf('{pay_link}') === -1; }).join('\n');
    var vals = {
      name: (r.name || '').split(' ')[0], package: r.interest, amount: naira(quote),
      deposit: quote ? naira(Math.round(quote * 0.7)) : '-', paid: naira(paid(r, 'project')), balance: naira(balance(r)),
      renewal_amount: naira(r.renewal_amount), renewal_due: r.renewal_due ? niceDate(r.renewal_due) : '-',
      brief_link: r.brief_token ? briefUrl(r) : '(no project form link yet)',
      last_payment: payments(r).length ? naira(payments(r)[payments(r).length - 1].amount) : '-',
      doc_link: r._docType && r.doc_token ? docUrl(r, r._docType) : '',
      preview_link: r.preview_token ? previewUrl(r) : '(no preview link yet)',
      website: r.website_url || '(add their website address)',
      pay_link: r.doc_token ? location.origin + '/pay?t=' + r.doc_token + (r._docType === 'renewal' ? '&for=renewal' : '') : ''
    };
    return text.replace(/\{(\w+)\}/g, function (m, k) { return k in vals ? vals[k] : m; });
  }
  function briefUrl(r) { return location.origin + '/brief?t=' + r.brief_token; }
  function previewUrl(r) { return location.origin + '/preview?t=' + r.preview_token; }
  function suggestedTemplate(r) {
    if (r.brief_token && !r.brief_submitted_at && !r.brief_saved_at) return 'tpl_brief';
    if (r.project_stage === 'live' && !(r.auto_sent || {}).handover && balance(r) === 0) return 'tpl_handover';
    if (r.preview_status === 'sent' && r.project_stage === 'review') return 'tpl_preview';
    if (r.status === 'won') {
      var d = daysUntil(r.renewal_due);
      if (d !== null && d <= 30) return 'tpl_renewal';
      return paid(r, 'project') ? 'tpl_payment' : 'tpl_won';
    }
    return r.status === 'quoted' ? 'tpl_quoted' : 'tpl_new';
  }
  function whatsAppRow(r) {
    var num = waNumber(r.contact);
    var email = /@/.test(r.contact) ? r.contact : null;
    if (!num && !email) return el('span');
    var sel = select(Object.keys(TEMPLATES).map(function (k) { return [k, TEMPLATES[k].label]; }), suggestedTemplate(r), { 'aria-label': 'Message for ' + r.name });
    var go = el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: num ? 'WhatsApp' : 'Email' });
    go.addEventListener('click', function () {
      var text = fill(state.settings[sel.value] || TEMPLATES[sel.value].text, r);
      var url = num ? 'https://wa.me/' + num + '?text=' + encodeURIComponent(text)
        : 'mailto:' + email + '?subject=' + encodeURIComponent('SIRRADDO: ' + r.interest) + '&body=' + encodeURIComponent(text);
      window.open(url, '_blank', 'noopener');
      if (r.status === 'new') update(r, { status: 'contacted' }, 'Marked as contacted');
    });
    return el('div', { class: 'admin-wa' }, [sel, go]);
  }

  function manageBody(r) {
    var wrap = el('div', { class: 'admin-manage-body' });

    // Status and follow-up
    var status = select(state.statuses, r.status, null);
    status.addEventListener('change', function () {
      var f = { status: status.value };
      if (status.value === 'won') {
        if (r.quote_amount == null && DEFAULT_QUOTE[r.interest]) f.quote_amount = DEFAULT_QUOTE[r.interest];
        if (r.renewal_amount == null && DEFAULT_RENEWAL[r.interest]) f.renewal_amount = DEFAULT_RENEWAL[r.interest];
        if (!r.project_stage) f.project_stage = 'content';
        f.follow_up_on = null;
      }
      if (status.value === 'lost') f.follow_up_on = null;
      update(r, f, status.value === 'won' ? 'Won! It now appears under Clients.' : 'Status saved');
    });
    var follow = el('input', { type: 'date', value: r.follow_up_on || '' });
    follow.addEventListener('change', function () { update(r, { follow_up_on: follow.value }, 'Follow-up saved'); });
    var quick = el('div', { class: 'admin-quick' }, [['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(function (o) {
      return el('button', { class: 'admin-chip', type: 'button', text: o[0], onclick: function () {
        var d = new Date(today() + 'T12:00:00'); d.setDate(d.getDate() + o[1]);
        update(r, { follow_up_on: d.toISOString().slice(0, 10) }, 'Follow-up saved');
      } });
    }));
    wrap.appendChild(el('div', { class: 'admin-grid' }, [field('Status', status), field('Follow up on', follow)]));
    wrap.appendChild(quick);

    // Quote and payments
    var quote = el('input', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: r.quote_amount == null ? '' : r.quote_amount, placeholder: DEFAULT_QUOTE[r.interest] || '' });
    quote.addEventListener('change', function () { update(r, { quote_amount: quote.value }, 'Quote saved'); });
    var bal = balance(r);
    wrap.appendChild(el('div', { class: 'admin-grid' }, [
      field('Quote (₦)', quote, r.quote_amount ? '70% deposit: ' + naira(Math.round(r.quote_amount * 0.7)) : 'Package price, e.g. ' + naira(DEFAULT_QUOTE[r.interest] || 50000)),
      el('div', { class: 'admin-field' }, [el('span', { text: 'Balance' }), el('strong', { class: bal ? 'admin-owed' : '', text: naira(bal) })])
    ]));
    wrap.appendChild(paymentsBlock(r));

    // Documents
    wrap.appendChild(docsBlock(r));

    wrap.appendChild(briefBlock(r));

    // Notes
    var notes = el('textarea', { rows: 2, placeholder: 'Your notes (saved when you leave the box)', value: r.notes || '' });
    notes.addEventListener('change', function () { update(r, { notes: notes.value }, 'Notes saved'); });
    wrap.appendChild(field('Notes', notes));

    // Edit details
    var edit = el('details', { class: 'admin-sub' }, [el('summary', { text: 'Edit customer details' })]);
    var n = el('input', { value: r.name }), c = el('input', { value: r.contact }), b = el('input', { value: r.business || '' });
    var em = el('input', { type: 'email', value: r.email || '', placeholder: 'For invoices and receipts' });
    var i = select(PACKAGES.indexOf(r.interest) === -1 ? PACKAGES.concat([r.interest]) : PACKAGES, r.interest, null);
    var dt = el('textarea', { rows: 3, value: r.details });
    var saveBtn = el('button', { class: 'admin-btn', type: 'button', text: 'Save details', onclick: function () {
      update(r, { name: n.value, contact: c.value, email: em.value, business: b.value, interest: i.value, details: dt.value }, 'Details saved');
    } });
    [field('Name', n), field('Phone (WhatsApp)', c), field('Email', em), field('Business', b), field('Package', i), field('Summary', dt), saveBtn].forEach(function (x) { edit.appendChild(x); });
    wrap.appendChild(edit);

    // Conversation
    if (r.transcript && r.transcript.length) wrap.appendChild(transcript(r.transcript, 'Conversation (' + r.transcript.length + ' messages)'));

    // Delete
    wrap.appendChild(el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Delete request', onclick: function () {
      if (!window.confirm('Delete ' + r.name + '? This cannot be undone.')) return;
      api('DELETE', null, '?id=' + r.id).then(function () {
        state.requests = state.requests.filter(function (x) { return x.id !== r.id; });
        flash('Deleted'); render();
      }).catch(fail);
    } }));
    return wrap;
  }

  // Project brief: the form the customer fills in after paying the deposit.
  function briefBlock(r) {
    var box = el('div', { class: 'admin-brief' }, [el('span', { class: 'admin-label', text: 'Project form' })]);
    if (!r.brief_token) {
      box.appendChild(el('p', { class: 'admin-empty', text: 'Created automatically when the 70% deposit is recorded.' }));
      box.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Create link now', onclick: function () {
        api('POST', { action: 'brief_link', id: r.id }).then(function (row) { replaceRequest(row); flash('Project form link created'); render(); }).catch(fail);
      } }));
      return box;
    }
    var st = r.brief_submitted_at ? 'Sent by customer ' + when(r.brief_submitted_at)
      : r.brief_saved_at ? 'Customer started it (saved ' + when(r.brief_saved_at) + ')' : 'Not opened yet';
    box.appendChild(el('p', { class: 'admin-meta' }, [badge(r.brief_submitted_at ? 'Received' : r.brief_saved_at ? 'In progress' : 'Waiting', r.brief_submitted_at ? 'is-won' : 'is-new'), ' ' + st]));
    var num = waNumber(r.contact);
    var actions = el('div', { class: 'admin-actions' });
    if (num) actions.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send form on WhatsApp', onclick: function () {
      var text = fill(state.settings.tpl_brief || TEMPLATES.tpl_brief.text, r);
      window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    } }));
    actions.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy link', onclick: function () {
      var url = briefUrl(r);
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { flash('Link copied'); })
        .catch(function () { window.prompt('Copy this link:', url); });
    } }));
    if (r.brief_saved_at) actions.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'View answers', onclick: function () { viewBrief(r); } }));
    box.appendChild(actions);
    if (r.brief_submitted_at) box.appendChild(draftRow(r));
    return box;
  }

  // AI-written website text from the project form.
  function draftRow(r) {
    var row = el('div', { class: 'admin-draft' }, [el('span', { class: 'admin-label', text: 'Website text (AI draft)' })]);
    var status = r.has_draft ? 'Ready ' + when(r.draft_at) : r.draft_error ? 'Not written: ' + r.draft_error : 'Being written…';
    row.appendChild(el('p', { class: 'admin-meta' }, [badge(r.has_draft ? 'Ready' : r.draft_error ? 'Failed' : 'Writing', r.has_draft ? 'is-won' : r.draft_error ? 'is-due' : 'is-new'), ' ' + status]));
    var acts = el('div', { class: 'admin-actions' });
    if (r.has_draft) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'View text', onclick: function () { viewDraft(r); } }));
    var write = el('button', { class: 'admin-btn', type: 'button', text: r.has_draft ? 'Rewrite' : 'Write website text' });
    write.addEventListener('click', function () {
      if (r.has_draft && !window.confirm('Write a new draft? The current one will be replaced.')) return;
      write.disabled = true; write.textContent = 'Writing… (up to a minute)';
      api('POST', { action: 'write_draft', id: r.id }).then(function (row2) { replaceRequest(row2); flash('Website text ready'); render(); })
        .catch(function (e) { write.disabled = false; write.textContent = 'Try again'; fail(e); });
    });
    acts.appendChild(write);
    if (r.has_draft) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Edit text', onclick: function () { editDraft(r); } }));
    row.appendChild(acts);
    if (r.has_draft && r.draft_gaps > 0) row.appendChild(el('p', { class: 'admin-hint', text: r.draft_gaps + ' highlighted gap' + (r.draft_gaps === 1 ? '' : 's') + ' ([ADD: …]) still in the text. Fill them with "Edit text", or the customer will see them marked "To be added".' }));
    if (r.has_draft) row.appendChild(previewBlock(r));
    return row;
  }

  // Edit the website text by hand (it is what the preview and the download are built from).
  function editDraft(r) {
    api('GET', null, '?view=draft&id=' + r.id).then(function (d) {
      var area = $('print-area');
      area.innerHTML = '';
      var ta = el('textarea', { class: 'draft-editor', 'aria-label': 'Website text', spellcheck: 'true' });
      ta.value = d.draft_md || '';
      var info = el('p', { class: 'draft-note' });
      function count() {
        var n = (ta.value.match(/\[ADD:[^\]]*\]/g) || []).length;
        info.textContent = 'Edit the text, then Save. Keep the "## Page:", "### Section" and "**Headline:**" lines: the preview is built from them. ' + (n ? n + ' [ADD: …] gap' + (n === 1 ? '' : 's') + ' left.' : 'No gaps left.');
      }
      ta.addEventListener('input', count); count();
      function close() { document.body.classList.remove('printing', 'viewing'); area.innerHTML = ''; }
      var save = el('button', { class: 'btn btn--navy admin-view-close', type: 'button', text: 'Save', onclick: function () {
        save.disabled = true; save.textContent = 'Saving…';
        api('PATCH', { id: r.id, draft_md: ta.value }).then(function (row) { replaceRequest(row); close(); flash('Website text saved'); render(); })
          .catch(function (e) { save.disabled = false; save.textContent = 'Save'; fail(e); });
      } });
      var cancel = el('button', { class: 'admin-btn admin-view-print', type: 'button', text: 'Cancel', onclick: function () {
        if (ta.value !== (d.draft_md || '') && !window.confirm('Close without saving your changes?')) return;
        close();
      } });
      area.appendChild(save); area.appendChild(cancel);
      area.appendChild(el('div', { class: 'doc draft-doc' }, [info, ta]));
      document.body.classList.add('printing', 'viewing');
      window.scrollTo(0, 0);
    }).catch(fail);
  }

  // The website preview the customer approves, and the download for hosting.
  function previewBlock(r) {
    var box = el('div', { class: 'admin-preview' }, [el('span', { class: 'admin-label', text: 'Website preview' })]);
    var st = PREVIEW_LABEL[r.preview_status];
    var meta = st ? [badge(st[0], st[1])] : [badge('Not sent yet', '')];
    if (r.preview_status === 'approved' && r.preview_approved_at) meta.push(' ' + when(r.preview_approved_at));
    box.appendChild(el('p', { class: 'admin-meta' }, meta));
    var fb = (r.preview_feedback || []).slice(-3).reverse();
    if (fb.length) box.appendChild(el('ul', { class: 'admin-feedback' }, fb.map(function (f) {
      return el('li', null, [el('b', { text: (f.result === 'approved' ? 'Approved' : 'Changes') + ' · ' + when(f.at) + (f.text ? ': ' : '') }), f.text || '']);
    })));
    function withLink(fn) {
      if (r.preview_token) return fn(r);
      return api('POST', { action: 'preview_link', id: r.id }).then(function (row) { replaceRequest(row); render(); return fn(row); }).catch(fail);
    }
    var acts = el('div', { class: 'admin-actions' });
    acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Open preview', onclick: function () {
      var win = window.open('', '_blank');
      withLink(function (row) { if (win) win.location.href = previewUrl(row); else window.location.href = previewUrl(row); });
    } }));
    var num = waNumber(r.contact), mail = emailOf(r);
    if (num) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send on WhatsApp', onclick: function () {
      var win = window.open('', '_blank');
      withLink(function (row) {
        var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(fill(state.settings.tpl_preview || TEMPLATES.tpl_preview.text, row));
        if (win) win.location.href = url; else window.location.href = url;
      });
    } }));
    if (mail) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Email preview', disabled: !state.canEmail, onclick: function (e) {
      var b = e.currentTarget; b.disabled = true;
      api('POST', { action: 'send_preview', id: r.id }).then(function (j) { if (j.row) replaceRequest(j.row); flash('Preview emailed to ' + j.to); render(); })
        .catch(function (err) { b.disabled = false; fail(err); });
    } }));
    acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Download site (.zip)', onclick: function (e) { downloadSite(r, e.currentTarget); } }));
    box.appendChild(acts);
    // Designs (up to 3). With 2 or more, the customer switches between them on the preview and approves one.
    var choices = r.design_choices || [];
    var LET = 'ABC';
    var dsg = el('div', { class: 'admin-designs' }, [el('span', { class: 'admin-label', text: 'Designs' })]);
    function designAct(body, okMsg, btn) {
      if (btn) btn.disabled = true;
      return api('POST', Object.assign({ id: r.id }, body)).then(function (row) { replaceRequest(row); flash(okMsg); render(); })
        .catch(function (err) { if (btn) btn.disabled = false; fail(err); });
    }
    if (choices.length) dsg.appendChild(el('ul', { class: 'admin-design-list' }, choices.map(function (c, i) {
      var li = el('li', null, [el('b', { text: 'Design ' + LET[i] }), ' ' + (c.standard ? 'Standard' : (c.by || 'AI')) + ' · ' + when(c.at) + ' ',
        c.current ? badge(r.preview_status === 'approved' ? 'Chosen' : 'In download', 'is-won') : null]);
      if (!c.current) li.appendChild(el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: 'Use for download', onclick: function (e) { designAct({ action: 'design_option', op: 'use', option: c.id }, 'Design ' + LET[i] + ' is now used for the download', e.currentTarget); } }));
      li.appendChild(el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: 'Remove', onclick: function (e) {
        if (!window.confirm('Remove Design ' + LET[i] + '?')) return;
        designAct({ action: 'design_option', op: 'remove', option: c.id }, 'Design removed', e.currentTarget);
      } }));
      return li;
    })));
    var dz = el('div', { class: 'admin-actions' });
    if (choices.length < 3) {
      var dbtn = el('button', { class: 'admin-btn', type: 'button', text: choices.length ? 'Add another AI design' : 'AI design (custom look)', onclick: function () {
        var label = dbtn.textContent; dbtn.disabled = true; dbtn.textContent = 'Designing… (up to a minute)';
        api('POST', { action: 'design', id: r.id }).then(function (row) { replaceRequest(row); flash('New design ready. Tap "Open preview" to see it.'); render(); })
          .catch(function (e) { dbtn.disabled = false; dbtn.textContent = label; fail(e); });
      } });
      dz.appendChild(dbtn);
      if (choices.length && !choices.some(function (c) { return c.standard; })) dz.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Add standard design as an option', onclick: function (e) { designAct({ action: 'design_option', op: 'add_standard' }, 'Standard design added as an option', e.currentTarget); } }));
    }
    if (choices.length) dz.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Remove all designs', onclick: function (e) {
      if (!window.confirm('Remove all designs and go back to the standard look?')) return;
      designAct({ action: 'design_clear' }, 'Back to the standard design', e.currentTarget);
    } }));
    dsg.appendChild(dz);
    dsg.appendChild(el('p', { class: 'admin-hint', text: (r.design_error && !choices.length ? 'Last try failed: ' + r.design_error + ' ' : '') + (
      choices.length >= 2 ? 'The customer sees "Design A / B' + (choices.length > 2 ? ' / C' : '') + '" buttons on the preview, switches between them, and approves the one they like. Their choice is used for the download.'
      : choices.length === 1 ? 'Add another design (AI or the standard one) to let the customer choose between them. Only the look changes; your checked text, prices and photos stay the same.'
      : 'Optional: the AI designs a unique look. Make 2 or 3 and the customer picks their favourite on the preview. Only the look changes; your checked text, prices and photos stay the same.') }));
    box.appendChild(dsg);
    return box;
  }
  function downloadSite(r, btn) {
    var was = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
    fetch('/api/requests?view=export&id=' + r.id, { headers: { 'Authorization': 'Bearer ' + password } }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { throw Object.assign(new Error(j.error || 'Download failed'), { status: res.status }); });
      var name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'website.zip';
      return res.blob().then(function (b) {
        var a = el('a', { href: URL.createObjectURL(b), download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        flash('Downloaded ' + name);
      });
    }).catch(fail).then(function () { btn.disabled = false; btn.textContent = was; });
  }

  // Everything the customer needs after the balance is paid. Passwords never go in here.
  function handoverBlock(r) {
    var h = r.handover || {};
    var box = el('div', { class: 'admin-handover' }, [el('span', { class: 'admin-label', text: 'Handover pack' })]);
    var sent = (r.auto_sent || {}).handover;
    var bal = balance(r);
    var locked = r.quote_amount == null || bal > 0;
    box.appendChild(el('p', { class: 'admin-meta' }, [sent ? badge('Sent', 'is-won') : badge(locked ? 'Locked' : 'Ready to send', locked ? '' : 'is-new'),
      ' ' + (sent ? 'Emailed ' + when(sent) : locked ? (r.quote_amount == null ? 'Add the quote first.' : 'Unlocks when the balance (' + naira(bal) + ') is paid.') : 'Fill in the details, then send.')]));
    var domain = el('input', { value: h.domain || '', placeholder: 'theirbusiness.com.ng' });
    var registrar = el('input', { value: h.registrar || '', placeholder: 'e.g. Whogohost' });
    var expires = el('input', { type: 'date', value: h.domain_expires || '' });
    var emails = el('textarea', { rows: 2, value: h.emails || '', placeholder: 'info@theirbusiness.com.ng (addresses only, no passwords)' });
    var webmail = el('input', { value: h.webmail || '', placeholder: 'Webmail link, e.g. https://mail.zoho.com' });
    var notes = el('textarea', { rows: 2, value: h.notes || '', placeholder: 'Anything else for them (optional)' });
    box.appendChild(el('div', { class: 'admin-grid' }, [field('Domain', domain), field('Registered with', registrar), field('Domain registered until', expires), field('Webmail', webmail)]));
    box.appendChild(field('Business email addresses', emails));
    box.appendChild(field('Note for the customer', notes));
    var save = el('button', { class: 'admin-btn', type: 'button', text: 'Save handover details', onclick: function () {
      update(r, { handover: { domain: domain.value, registrar: registrar.value, domain_expires: expires.value, emails: emails.value, webmail: webmail.value, notes: notes.value } }, 'Handover details saved');
    } });
    var ready = !locked && r.website_url;
    var why = locked ? 'Unlocks when the balance is paid' : !r.website_url ? 'Add their website address above first' : null;
    var acts = el('div', { class: 'admin-actions' }, [save,
      el('button', { class: 'admin-btn', type: 'button', text: 'View', disabled: !ready, title: why, onclick: function () { docAction(r, 'handover', 'view'); } })]);
    if (waNumber(r.contact)) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'WhatsApp', disabled: !ready, title: why, onclick: function () { docAction(r, 'handover', 'whatsapp'); } }));
    if (emailOf(r)) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: sent ? 'Email again' : 'Email', disabled: !ready || !state.canEmail, title: why, onclick: function () { docAction(r, 'handover', 'email'); } }));
    box.appendChild(acts);
    box.appendChild(el('p', { class: 'admin-hint', text: 'Save the details before sending. Send passwords separately on WhatsApp, never by email.' }));
    return box;
  }

  // A small Markdown renderer for the draft: headings, bold, lists, rules, paragraphs.
  function mdToHtml(md) {
    var inline = function (t) { return h(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[ADD:([^\]]*)\]/g, '<mark>[ADD:$1]</mark>'); };
    var out = [], list = null;
    md.split('\n').forEach(function (line) {
      var m;
      if ((m = line.match(/^\s*[-*] (.*)/)) || (m = line.match(/^\s*\d+\. (.*)/))) {
        var tag = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
        if (list !== tag) { if (list) out.push('</' + list + '>'); out.push('<' + tag + '>'); list = tag; }
        out.push('<li>' + inline(m[1]) + '</li>'); return;
      }
      if (list) { out.push('</' + list + '>'); list = null; }
      if ((m = line.match(/^(#{1,4}) (.*)/))) out.push('<h' + (m[1].length + 1) + '>' + inline(m[2]) + '</h' + (m[1].length + 1) + '>');
      else if (/^---+\s*$/.test(line)) out.push('<hr>');
      else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    });
    if (list) out.push('</' + list + '>');
    return out.join('');
  }
  function plain(md) { return md.replace(/^#{1,4} /gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[-*] /gm, '• ').trim(); }
  function copyText(t, label, btn) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      flash(label + ' copied');
      if (btn) { var was = btn.textContent; btn.textContent = 'Copied ✓'; setTimeout(function () { btn.textContent = was; }, 1800); }
    }).catch(function () { window.prompt('Copy this text:', t); });
  }

  function viewDraft(r) {
    api('GET', null, '?view=draft&id=' + r.id).then(function (d) {
      if (!d.draft_md) { setError('No draft yet.'); return; }
      // Split into sections at each "## " heading so each can be copied on its own.
      var parts = d.draft_md.split(/\n(?=## )/);
      var area = $('print-area');
      area.innerHTML = '';
      var close = el('button', { class: 'btn btn--navy admin-view-close', type: 'button', text: 'Close', onclick: function () { document.body.classList.remove('printing', 'viewing'); area.innerHTML = ''; } });
      var all = el('button', { class: 'admin-btn admin-view-print', type: 'button', text: 'Copy all', onclick: function (e) { copyText(plain(d.draft_md), 'All text', e.currentTarget); } });
      var pr = el('button', { class: 'admin-btn admin-view-print', type: 'button', text: 'Print / Save PDF', onclick: function () { window.print(); } });
      area.appendChild(close); area.appendChild(all); area.appendChild(pr);
      var doc = el('div', { class: 'doc draft-doc' });
      doc.appendChild(el('p', { class: 'draft-note', text: 'AI draft for ' + r.name + ' (' + r.interest + '). Check every fact and replace each highlighted [ADD: …] before it goes on the site.' }));
      parts.forEach(function (part) {
        var sec = el('section', { class: 'draft-section' });
        var body = el('div');
        body.innerHTML = mdToHtml(part);
        if (/^## /.test(part)) {
          var title = part.split('\n')[0].replace(/^## /, '');
          sec.appendChild(el('button', { class: 'admin-btn draft-copy', type: 'button', text: 'Copy', 'aria-label': 'Copy ' + title, onclick: function (e) { copyText(plain(part.replace(/^## .*\n/, '')), title, e.currentTarget); } }));
        }
        sec.appendChild(body);
        doc.appendChild(sec);
      });
      area.appendChild(doc);
      document.body.classList.add('printing', 'viewing');
      window.scrollTo(0, 0);
    }).catch(fail);
  }

  function viewBrief(r) {
    fetch('/api/brief?t=' + encodeURIComponent(r.brief_token)).then(function (res) { return res.json(); }).then(function (d) {
      var parts = [];
      d.sections.forEach(function (s) {
        var rows = [];
        s.fields.forEach(function (f) {
          var v = f.type === 'files' ? (d.files[f.key] || []) : d.answers[f.key];
          var html = '';
          if (f.type === 'files') html = v.map(function (x) { return /^image\//.test(x.type || '') ? '<a href="' + h(x.url) + '"><img src="' + h(x.url) + '" alt="' + h(x.name) + '"></a>' : '<a href="' + h(x.url) + '">' + h(x.name) + '</a>'; }).join(' ');
          else if (f.type === 'rows') html = (v || []).map(function (row) { return f.columns.map(function (c) { return h(row[c.key]); }).filter(Boolean).join(' · '); }).filter(Boolean).join('<br>');
          else if (Array.isArray(v)) html = h(v.join(', '));
          else if (f.type === 'confirm') html = v ? 'Yes' : '';
          else html = h(v || '').replace(/\n/g, '<br>');
          if (html) rows.push('<tr><th>' + h(f.label) + '</th><td>' + html + '</td></tr>');
        });
        if (rows.length) parts.push('<h2>' + h(s.title) + '</h2><table class="brief-view">' + rows.join('') + '</table>');
      });
      var area = $('print-area');
      area.innerHTML = '<div class="doc"><div class="doc-head"><div>' + LOGO + '</div><div class="doc-co"><b>Project brief</b><br>' + h(r.name) + ' · ' + h(r.interest) + '<br>' + h(r.contact) + (d.submitted_at ? '<br>Sent ' + h(when(d.submitted_at)) : '<br>Not sent yet (draft)') + '</div></div>' + (parts.join('') || '<p>No answers yet.</p>') + '</div>';
      document.body.classList.add('printing', 'viewing');
      var close = el('button', { class: 'btn btn--navy admin-view-close', type: 'button', text: 'Close', onclick: function () { document.body.classList.remove('printing', 'viewing'); close.remove(); printBtn.remove(); } });
      var printBtn = el('button', { class: 'admin-btn admin-view-print', type: 'button', text: 'Print / Save PDF', onclick: function () { window.print(); } });
      area.prepend(printBtn); area.prepend(close);
      window.scrollTo(0, 0);
    }).catch(function () { setError('Could not load the answers.'); });
  }

  function paymentsBlock(r) {
    var box = el('div', { class: 'admin-payments' }, [el('span', { class: 'admin-label', text: 'Payments' })]);
    var list = payments(r);
    if (list.length) {
      box.appendChild(el('ul', null, list.map(function (p, idx) {
        return el('li', null, [
          niceDate(p.date) + ' · ' + naira(p.amount) + ' · ' + (p.kind === 'renewal' ? 'renewal' : 'project') + (p.note ? ' · ' + p.note : ''),
          el('button', { class: 'admin-x', type: 'button', 'aria-label': 'Remove payment', text: '×', onclick: function () {
            if (!window.confirm('Remove this payment of ' + naira(p.amount) + '?')) return;
            update(r, { payments: list.filter(function (_, j) { return j !== idx; }) }, 'Payment removed');
          } })
        ]);
      })));
    } else {
      box.appendChild(el('p', { class: 'admin-empty', text: 'No payments yet.' }));
    }
    var bal = balance(r);
    var suggested = paid(r, 'project') === 0 && r.quote_amount ? Math.round(r.quote_amount * 0.7) : bal || '';
    var amount = el('input', { type: 'number', min: 1, step: 500, inputmode: 'numeric', placeholder: 'Amount ₦', value: suggested });
    var date = el('input', { type: 'date', value: today() });
    var kind = select([['project', 'Project'], ['renewal', 'Renewal']], 'project', { 'aria-label': 'Payment type' });
    var note = el('input', { placeholder: 'Note (e.g. transfer ref)' });
    var autoEmail = el('input', { type: 'checkbox', id: 'ae' + r.id });
    autoEmail.checked = Boolean(state.canEmail && emailOf(r));
    var autoLabel = state.canEmail && emailOf(r) ? el('label', { class: 'admin-check', for: 'ae' + r.id }, [autoEmail, ' Email the receipt to ' + emailOf(r)]) : null;
    var add = el('button', { class: 'admin-btn', type: 'button', text: 'Add payment', onclick: function () {
      if (!Number(amount.value)) { setError('Enter the amount paid'); return; }
      var next = list.concat([{ date: date.value || today(), amount: Number(amount.value), kind: kind.value, note: note.value }]);
      var sendMail = autoLabel && autoEmail.checked;
      var wasWon = r.status === 'won';
      state.justPaid[r.id] = true;
      update(r, { payments: next }, 'Payment recorded').then(function () {
        var now = state.requests.filter(function (x) { return x.id === r.id; })[0];
        if (now && !wasWon && now.status === 'won') flash('Deposit recorded: marked won, project form link ready');
        if (!sendMail) return;
        api('POST', { action: 'send_doc', id: r.id, type: 'receipt' }).then(function (j) { flash('Payment recorded · receipt emailed to ' + j.to); })
          .catch(function (e) { setError('Receipt not emailed: ' + e.message); });
      });
    } });
    box.appendChild(el('div', { class: 'admin-pay-form' }, [amount, date, kind, note, autoLabel, add]));
    return box;
  }

  function transcript(messages, title) {
    var det = el('details', { class: 'admin-sub' }, [el('summary', { text: title })]);
    messages.forEach(function (m) {
      det.appendChild(el('p', { class: 'admin-line' }, [el('strong', { text: (m.role === 'user' ? 'Customer' : 'Assistant') + ': ' }), m.content]));
    });
    return det;
  }

  // ---------- Clients (won) and renewals ----------
  function renderClients(view) {
    var won = state.requests.filter(function (r) { return r.status === 'won'; });
    won.sort(function (a, b) {
      var da = a.renewal_due || '9999', db = b.renewal_due || '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    view.appendChild(el('p', { class: 'admin-intro', text: 'Customers you have won. Track each build, then the yearly renewal. Renewals due in the next 30 days are also in the daily email.' }));
    if (!won.length) { view.appendChild(el('p', { class: 'admin-empty', text: 'No clients yet. Set a request to "won" and it appears here.' })); return; }
    var list = el('div', { class: 'admin-list' });
    won.forEach(function (r) { list.appendChild(clientCard(r)); });
    view.appendChild(list);
  }
  function clientCard(r) {
    var card = el('article', { class: 'admin-card admin-card--won' });
    card.appendChild(el('div', { class: 'admin-card-top' }, [el('h2', { text: r.name }), el('span', { class: 'admin-tag', text: r.interest })]));
    var badges = el('div', { class: 'admin-badges' }, [badge(STAGE_LABEL[r.project_stage || ''], r.project_stage === 'live' ? 'is-won' : '')]);
    var bal = balance(r);
    if (bal) badges.appendChild(badge('Owes ' + naira(bal), 'is-due'));
    var d = daysUntil(r.renewal_due);
    if (d !== null) badges.appendChild(badge(d < 0 ? 'Renewal ' + (-d) + 'd overdue' : d === 0 ? 'Renewal due today' : 'Renewal in ' + d + 'd', d <= 30 ? 'is-due' : ''));
    if (r.site_status) badges.appendChild(badge(r.site_status === 'up' ? 'Site up' : 'Site ' + r.site_status, r.site_status === 'up' ? 'is-won' : 'is-due'));
    card.appendChild(badges);
    card.appendChild(el('p', { class: 'admin-meta', text: r.contact + (r.business ? ' · ' + r.business : '') }));
    card.appendChild(whatsAppRow(r));

    var stage = select(state.stages.length ? [['', 'Not started']].concat(state.stages.map(function (s) { return [s, STAGE_LABEL[s]]; })) : [['', 'Not started']], r.project_stage || '', null);
    stage.addEventListener('change', function () {
      var f = { project_stage: stage.value };
      if (stage.value === 'live' && !r.live_on) {
        f.live_on = today();
        if (!r.renewal_due) f.renewal_due = addYears(today(), 1);
      }
      update(r, f, stage.value === 'live' ? 'Live! Renewal date set for a year from today.' : 'Stage saved');
    });
    var live = el('input', { type: 'date', value: r.live_on || '' });
    live.addEventListener('change', function () {
      var f = { live_on: live.value };
      if (live.value && !r.renewal_due) f.renewal_due = addYears(live.value, 1);
      update(r, f, 'Live date saved');
    });
    var ramount = el('input', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: r.renewal_amount == null ? '' : r.renewal_amount, placeholder: DEFAULT_RENEWAL[r.interest] || '' });
    ramount.addEventListener('change', function () { update(r, { renewal_amount: ramount.value }, 'Renewal amount saved'); });
    var rdue = el('input', { type: 'date', value: r.renewal_due || '' });
    rdue.addEventListener('change', function () { update(r, { renewal_due: rdue.value }, 'Renewal date saved'); });
    var site = el('input', { type: 'url', inputmode: 'url', value: r.website_url || '', placeholder: 'https://theirbusiness.com.ng' });
    site.addEventListener('change', function () { update(r, { website_url: site.value }, 'Website saved. It will be checked every morning.'); });
    card.appendChild(el('div', { class: 'admin-grid' }, [field('Project stage', stage), field('Went live on', live), field('Renewal (₦/year)', ramount), field('Renewal due', rdue)]));
    card.appendChild(field('Their website (checked daily)', site, r.site_checked_at
      ? 'Last check ' + when(r.site_checked_at) + ': ' + (r.site_status || '-') + (r.ssl_expires ? ' · SSL until ' + niceDate(r.ssl_expires) : '')
      : 'Add the address once the site is live.'));

    var renewed = el('button', { class: 'btn btn--navy', type: 'button', text: 'Renewal paid', disabled: !r.renewal_amount || !r.renewal_due, onclick: function () {
      if (!window.confirm('Record ' + naira(r.renewal_amount) + ' renewal paid today and move the next renewal to ' + niceDate(addYears(r.renewal_due, 1)) + '?')) return;
      update(r, {
        payments: payments(r).concat([{ date: today(), amount: r.renewal_amount, kind: 'renewal', note: 'Renewal for year to ' + addYears(r.renewal_due, 1) }]),
        renewal_due: addYears(r.renewal_due, 1)
      }, 'Renewal recorded');
    } });
    card.appendChild(el('div', { class: 'admin-actions' }, [
      renewed,
      el('button', { class: 'admin-btn', type: 'button', text: 'Renewal invoice', disabled: !r.renewal_amount, onclick: function () { docAction(r, 'renewal', 'view'); } }),
      el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send renewal invoice', disabled: !r.renewal_amount || !waNumber(r.contact), onclick: function () { docAction(r, 'renewal', 'whatsapp'); } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Open in Requests', onclick: function () {
        state.filters = { q: r.contact, status: '', interest: '', due: false }; state.open[r.id] = true; setTab('requests');
      } })
    ]));
    card.appendChild(briefBlock(r));
    card.appendChild(handoverBlock(r));
    return card;
  }

  // ---------- Unanswered questions ----------
  function renderQuestions(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'Questions the assistant could not answer from what it knows. Add the answers to the assistant (ask Claude to update api/_lib/knowledge.mjs), then tick them as done.' }));
    var qs = state.unanswered;
    if (!qs.length) { view.appendChild(el('p', { class: 'admin-empty', text: 'No unanswered questions yet.' })); return; }
    view.appendChild(el('div', { class: 'admin-list' }, qs.map(function (q) {
      var box = el('input', { type: 'checkbox', id: 'q' + q.id });
      box.checked = q.resolved;
      box.addEventListener('change', function () {
        api('POST', { action: 'question', id: q.id, resolved: box.checked }).then(function () { q.resolved = box.checked; flash('Saved'); render(); }).catch(fail);
      });
      return el('div', { class: 'admin-card admin-q' + (q.resolved ? ' is-done' : '') }, [
        el('label', { for: 'q' + q.id, class: 'admin-check' }, [box, ' ' + q.question]),
        el('small', { text: when(q.created_at) }),
        el('button', { class: 'admin-x', type: 'button', 'aria-label': 'Delete question', text: '×', onclick: function () {
          api('POST', { action: 'question', id: q.id, remove: true }).then(function () {
            state.unanswered = state.unanswered.filter(function (x) { return x.id !== q.id; }); render();
          }).catch(fail);
        } })
      ]);
    })));
  }

  // ---------- Chats ----------
  function renderChats(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'Every conversation with the assistant from the last 90 days, newest first. Older ones are deleted automatically.' }));
    var search = el('input', { type: 'search', placeholder: 'Search conversations…', value: state.chatQuery, 'aria-label': 'Search conversations' });
    var list = el('div', { class: 'admin-list' });
    var count = el('p', { class: 'admin-count' });
    view.appendChild(el('div', { class: 'admin-toolbar' }, [search, el('button', { class: 'admin-btn', type: 'button', text: 'Refresh', onclick: function () { state.chats = null; setTab('chats'); } })]));
    view.appendChild(count);
    view.appendChild(list);
    function draw() {
      var qy = state.chatQuery.toLowerCase();
      var rows = (state.chats || []).filter(function (c) {
        return !qy || (c.messages || []).some(function (m) { return String(m.content).toLowerCase().indexOf(qy) !== -1; });
      });
      count.textContent = rows.length + ' conversation(s)';
      list.textContent = '';
      if (!rows.length) list.appendChild(el('p', { class: 'admin-empty', text: 'No conversations yet.' }));
      rows.forEach(function (c) {
        var msgs = c.messages || [];
        var first = (msgs.filter(function (m) { return m.role === 'user'; })[0] || {}).content || '';
        var badges = el('div', { class: 'admin-badges' }, [badge(msgs.length + ' messages')]);
        if (c.lead_saved) badges.appendChild(badge('Request saved', 'is-won'));
        if (c.fallbacks) badges.appendChild(badge(c.fallbacks + ' failed repl' + (c.fallbacks === 1 ? 'y' : 'ies'), 'is-due'));
        list.appendChild(el('article', { class: 'admin-card' }, [
          el('p', { class: 'admin-meta', text: when(c.updated_at) + ' · ' + (c.page || '') }),
          el('p', { class: 'admin-details', text: '“' + first.slice(0, 160) + (first.length > 160 ? '…' : '') + '”' }),
          badges,
          transcript(msgs, 'Read conversation')
        ]));
      });
    }
    var t;
    search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.chatQuery = search.value; draw(); }, 200); });
    draw();
  }

  // ---------- Settings ----------
  function renderSettings(view) {
    var s = state.settings;
    var inputs = {};
    function text(key, label, placeholder, area) {
      var inp = area ? el('textarea', { rows: 3, value: s[key] || '', placeholder: placeholder }) : el('input', { value: s[key] || '', placeholder: placeholder });
      inputs[key] = inp;
      return field(label, inp);
    }
    var form = el('form', { class: 'admin-card admin-settings' }, [
      el('h2', { text: 'Bank details for invoices' }),
      text('bank_name', 'Bank', 'e.g. GTBank'),
      text('account_name', 'Account name', 'SIRRADDO GLOBAL LIMITED'),
      text('account_number', 'Account number', '10 digits'),
      text('invoice_note', 'Note at the bottom of invoices', 'e.g. Work starts after the 70% deposit is received.', true),
      el('h2', { text: 'WhatsApp messages' }),
      el('p', { class: 'admin-intro', text: 'Leave a box empty to use the standard message. You can use {name}, {package}, {amount}, {deposit}, {paid}, {balance}, {renewal_amount}, {renewal_due}, {preview_link} and {website}.' })
    ]);
    Object.keys(TEMPLATES).forEach(function (k) { form.appendChild(text(k, TEMPLATES[k].label, TEMPLATES[k].text, true)); });
    form.appendChild(el('h2', { text: 'Handover pack' }));
    form.appendChild(text('handover_terms', 'Changes and support policy (shown in every handover pack)', DEFAULT_HANDOVER_TERMS, true));
    form.appendChild(el('button', { class: 'btn btn--navy', type: 'submit', text: 'Save settings' }));
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var values = {};
      Object.keys(inputs).forEach(function (k) { values[k] = inputs[k].value.trim(); });
      if (values.account_number && !/^\d{10}$/.test(values.account_number)) { setError('Account number should be 10 digits.'); return; }
      api('POST', { action: 'settings', settings: values }).then(function (j) { state.settings = j.settings || {}; setError(''); flash('Settings saved'); }).catch(fail);
    });
    view.appendChild(form);
  }

  // ---------- CSV export ----------
  function exportCsv() {
    var cols = [
      ['id', 'ID'], ['created_at', 'Created'], ['source', 'Source'], ['name', 'Name'], ['contact', 'Contact'], ['email', 'Email'], ['business', 'Business'],
      ['interest', 'Package'], ['status', 'Status'], ['follow_up_on', 'Follow up on'], ['quote_amount', 'Quote (NGN)'],
      ['_paid', 'Paid (NGN)'], ['_balance', 'Balance (NGN)'], ['project_stage', 'Project stage'], ['live_on', 'Live on'],
      ['renewal_amount', 'Renewal (NGN)'], ['renewal_due', 'Renewal due'], ['details', 'Summary'], ['notes', 'Notes']
    ];
    var rows = state.requests.filter(matches);
    var q = function (v) {
      var s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheets treating text as a formula
      return '"' + s.replace(/"/g, '""') + '"';
    };
    var lines = [cols.map(function (c) { return q(c[1]); }).join(',')];
    rows.forEach(function (r) {
      var x = Object.assign({}, r, { _paid: paid(r), _balance: balance(r) });
      lines.push(cols.map(function (c) { return q(x[c[0]]); }).join(','));
    });
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: 'sirraddo-requests-' + today() + '.csv' });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    flash('Exported ' + rows.length + ' row(s)');
  }

  // ---------- Invoices and receipts (print, or Save as PDF) ----------
  var LOGO = '<svg viewBox="0 0 208 60" width="170" aria-hidden="true"><text x="0" y="33" textLength="206" lengthAdjust="spacing" font-family="Inter, Arial Black, Arial, sans-serif" font-weight="900" font-size="40" letter-spacing="-1"><tspan fill="#13254F">SI</tspan><tspan fill="#D9A21B">RR</tspan><tspan fill="#13254F">A</tspan><tspan fill="#D9A21B">DD</tspan><tspan fill="#13254F">O</tspan></text><rect fill="#13254F" x="1" y="40" width="168" height="3"/><rect fill="#D9A21B" x="169" y="40" width="37" height="3"/><text fill="#13254F" x="1" y="57" textLength="205" lengthAdjust="spacing" font-family="Inter, Arial, sans-serif" font-weight="700" font-size="10.5">GLOBAL LIMITED</text></svg>';
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // Invoices and receipts live at /doc?t=...: a page the customer can open, print or save as PDF.
  function ensureDoc(r) {
    if (r.doc_token) return Promise.resolve(r);
    return api('POST', { action: 'doc_link', id: r.id }).then(function (row) { replaceRequest(row); return row; });
  }
  function docAction(r, type, how) {
    var label = type === 'receipt' ? 'receipt' : type === 'handover' ? 'handover pack' : 'invoice';
    if (how === 'email') {
      flash('Sending ' + label + '…');
      return api('POST', { action: 'send_doc', id: r.id, type: type })
        .then(function (j) { if (j.row) replaceRequest(j.row); setError(''); flash(cap(label) + ' emailed to ' + j.to); delete state.justPaid[r.id]; render(); })
        .catch(fail);
    }
    // Open the new tab straight away (phones block tabs opened after a delay), then point it at the link.
    var win = window.open('', '_blank');
    ensureDoc(r).then(function (row) {
      var url;
      if (how === 'whatsapp') {
        var tpl = type === 'receipt' ? 'tpl_receipt' : type === 'renewal' ? 'tpl_renewal' : type === 'handover' ? 'tpl_handover' : 'tpl_invoice';
        var withLink = Object.assign({}, row, { _docType: type });
        var text = fill(state.settings[tpl] || TEMPLATES[tpl].text, withLink);
        if (text.indexOf(docUrl(row, type)) === -1) text += '\n' + docUrl(row, type);
        url = 'https://wa.me/' + waNumber(row.contact) + '?text=' + encodeURIComponent(text);
        delete state.justPaid[r.id];
      } else url = docUrl(row, type);
      if (win) win.location.href = url; else window.location.href = url;
      render();
    }).catch(function (e) { if (win) win.close(); fail(e); });
  }
  function docsBlock(r) {
    var hasQuote = r.quote_amount != null, hasPay = payments(r).length > 0;
    var box = el('div', { class: 'admin-docs' }, [el('span', { class: 'admin-label', text: 'Invoice and receipt' })]);
    if (state.justPaid[r.id] && hasPay) box.appendChild(el('p', { class: 'admin-callout', text: 'Payment recorded. Send the receipt?' }));
    var num = waNumber(r.contact), mail = emailOf(r);
    function line(type, label, enabled, why) {
      var row = el('div', { class: 'admin-doc-row' }, [el('span', { text: label })]);
      row.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'View', disabled: !enabled, title: enabled ? null : why, onclick: function () { docAction(r, type, 'view'); } }));
      if (num) row.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'WhatsApp', disabled: !enabled, title: enabled ? null : why, onclick: function () { docAction(r, type, 'whatsapp'); } }));
      if (mail) row.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Email', disabled: !enabled || !state.canEmail,
        title: !enabled ? why : !state.canEmail ? 'Set up a sending domain in Resend and LEAD_EMAIL_FROM first' : null, onclick: function () { docAction(r, type, 'email'); } }));
      return row;
    }
    box.appendChild(line('receipt', 'Receipt', hasPay, 'Record a payment first'));
    box.appendChild(line('invoice', 'Invoice', hasQuote, 'Add a quote first'));
    if (state.canPay && hasQuote && (balance(r) > 0 || !paid(r, 'project'))) {
      var payRow = el('div', { class: 'admin-doc-row' }, [el('span', { text: 'Pay online' })]);
      payRow.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy pay link', onclick: function (e) {
        var b = e.currentTarget;
        ensureDoc(r).then(function (row) { copyText(location.origin + '/pay?t=' + row.doc_token, 'Pay link', b); }).catch(fail);
      } }));
      box.appendChild(payRow);
      box.appendChild(el('p', { class: 'admin-hint', text: 'Payments made on Paystack are recorded here automatically, with the receipt emailed. No need to add them by hand.' }));
    }
    if (!mail) box.appendChild(el('p', { class: 'admin-hint', text: 'No email for this customer. Add one under "Edit customer details" to email documents.' }));
    else if (!state.canEmail) box.appendChild(el('p', { class: 'admin-hint', text: 'Emailing customers starts once your domain is verified in Resend (LEAD_EMAIL_FROM).' }));
    return box;
  }

  // ---------- Start ----------
  $('login').addEventListener('submit', function (e) {
    e.preventDefault();
    $('login-error').textContent = '';
    password = $('password').value;
    try { sessionStorage.setItem(KEY, password); } catch (err) { /* ignore */ }
    $('password').value = '';
    load();
  });
  $('logout').addEventListener('click', logout);
  Array.prototype.forEach.call(document.querySelectorAll('.admin-tabs button'), function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });
  if (password) load();
})();
