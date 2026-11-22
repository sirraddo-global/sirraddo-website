// SIRRADDO admin page: customer requests, clients and renewals, assistant questions and chats,
// invoices and receipts, settings. Talks to /api/requests (password in the Authorization header).
(function () {
  'use strict';
  // Two doors to the same app: /admin for the owner (password only), /staff for staff (username + password).
  var STAFF_PAGE = document.body.getAttribute('data-mode') === 'staff';
  var KEY = STAFF_PAGE ? 'sirraddo-staff' : 'sirraddo-admin';
  var $ = function (id) { return document.getElementById(id); };

  var COMPANY = {
    name: 'SIRRADDO GLOBAL LIMITED',
    rc: 'RC 9939920', tin: 'TIN 2623092457685',
    address: 'PLT 106/107 Agbaakin Layout, Iwo Road, Olowotinfiowosanu Area, Ibadan, Oyo State, Nigeria',
    phone: '+234 816 755 0937', email: 'info@sirraddo.com.ng'
  };
  var PACKAGES = ['Starter website', 'Business website', 'Online Store', 'Custom app', 'Business software', 'ZAPPI PAY', 'Other'];
  var DEFAULT_QUOTE = { 'Starter website': 50000, 'Business website': 100000, 'Online Store': 150000 };
  // "Business: wants Google Maps…" (from the chat assistant) -> 'Business website'
  function recommendedPackage(text) {
    var t = String(text || '').split(':')[0].toLowerCase();
    return /store|shop/.test(t) ? 'Online Store' : /business/.test(t) ? 'Business website' : /starter/.test(t) ? 'Starter website' : null;
  }
  var DEFAULT_RENEWAL = { 'Starter website': 25000, 'Business website': 40000 };
  var IDEA_LABELS = { recommended: 'Package suggested', business_name: 'Business name', what_they_do: 'What they do', location: 'Location', customers: 'Customers',
    goals: 'Goals', pages: 'Pages wanted', products_services: 'Products / services', style: 'Colours and style', examples: 'Websites they like',
    slogan: 'Slogan', hours: 'Opening hours', domain: 'Domain', has_logo: 'Logo', special: 'Other wishes' };
  var STAGE_LABEL = { '': 'Not started', content: 'Waiting for content', building: 'Building', review: 'Preview sent', live: 'Live' };
  var PREVIEW_LABEL = { sent: ['Waiting for customer', 'is-new'], changes: ['Changes asked', 'is-due'], approved: ['Approved', 'is-won'] };
  var DEFAULT_HANDOVER_TERMS = "Small fixes to text and photos are free for 30 days after your website goes live. After that, tell us what you'd like changed and we'll quote it before we start. Your yearly renewal keeps your domain, hosting, SSL certificate, business email and backups running.";
  var TEMPLATES = {
    tpl_new: { label: 'First contact', text: 'Hello {name}, this is SIRRADDO GLOBAL LIMITED. Thank you for your interest in our {package} package. Could you tell us a bit more about your business so we can get started?' },
    tpl_quoted: { label: 'Quote follow-up', text: 'Hello {name}, following up on your {package} quote of {amount}. To start, we need a {deposit_pct} deposit of {deposit}, and the balance when your site is ready. Any questions, just ask.' },
    tpl_won: { label: 'Send your content', text: 'Hello {name}, thank you for choosing SIRRADDO! To begin, please send your logo, photos, a short business description and your contact details. Your website will be live within 7 working days after we receive them.' },
    tpl_payment: { label: 'Payment received', text: 'Hello {name}, we have received your payment, thank you. Total paid: {paid}. Balance: {balance}.' },
    tpl_brief: { label: 'Send project form', text: 'Hello {name}, thank you for your deposit! Please fill in your project details here: {brief_link}\nIt takes about 10-15 minutes, and you can save and finish later with the same link.' },
    tpl_invoice: { label: 'Send invoice', text: 'Hello {name}, here is your invoice for the {package} package. Total: {amount}. Paid: {paid}. Balance: {balance}. View or save it here: {doc_link}\nPay online: {pay_link}' },
    tpl_receipt: { label: 'Send receipt', text: 'Hello {name}, thank you for your payment of {last_payment}. Your receipt: {doc_link}' },
    tpl_preview: { label: 'Send website preview', text: 'Hello {name}, your website preview is ready! Please look through every page here: {preview_link}\nAt the bottom you can approve it or tell us what to change.' },
    tpl_handover: { label: 'Website is live (handover)', text: 'Hello {name}, your website is now live at {website}! Here is your handover pack: your domain, email and renewal details, your private Manage link (change prices, opening hours, numbers and more yourself, and approve customer reviews) and how to get on Google Maps: {doc_link}' },
    tpl_renewal: { label: 'Renewal reminder', text: 'Hello {name}, your website renewal of {renewal_amount} is due on {renewal_due}. It covers your domain, hosting, SSL, business email and backups. Please let us know once you have paid so everything keeps running.\nPay online: {pay_link}' },
    tpl_review: { label: 'Ask for a review', text: 'Hello {name}, thank you for choosing SIRRADDO! If you are happy with your website, would you rate us? It takes a minute, and you can add your photo or logo: {review_link}' }
  };

  var password = null;
  var typedPw = null; // a staff member's password, kept in memory only for the "choose your new password" screen
  function b64url(t) { return btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  var LONG = STAFF_PAGE ? 'sirraddo-staff-session' : 'sirraddo-admin-session'; // "keep me logged in": a 30-day token (never the password) in this device's storage
  try { password = localStorage.getItem(LONG) || sessionStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  // The installable Admin app (Add to Home screen / Install app).
  if ('serviceWorker' in navigator && !STAFF_PAGE) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' }).catch(function () {}); });
  }
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
    state.requests = state.requests.map(function (r) { if (r.id === row.id && r.review_link && !row.review_link) row.review_link = r.review_link; return r.id === row.id ? row : r; });
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
      state.me = j.me || { role: 'owner', perms: [] };
      if (STAFF_PAGE !== (state.me.role === 'staff')) {
        logout();
        $('login-error').textContent = STAFF_PAGE ? 'This is the staff login. Owner: log in at sirraddo.com.ng/admin.' : 'This is the owner login. Staff: log in at sirraddo.com.ng/staff.';
        return;
      }
      applyRole();
      var tabsBar = document.querySelector('.admin-tabs:not(.admin-subtabs)');
      if (tabsBar) tabsBar.style.display = state.me.must_change ? 'none' : '';
      state.totals = j.totals || null;
      state.statuses = j.statuses || [];
      state.stages = j.stages || [];
      state.canEmail = Boolean(j.can_email_customers);
      state.canPay = Boolean(j.can_pay_online);
      state.canHost = Boolean(j.can_host);
      state.setup = j.setup || [];
      state.emailUsage = j.email_usage || null;
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
    password = null; typedPw = null;
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(LONG); } catch (e) { /* ignore */ }
    showApp(false);
  }
  // Staff accounts see only the tabs and parts their permissions allow (the server checks everything too).
  function canDo(perm) { var m = state.me || { role: 'owner' }; return m.role === 'owner' || (perm === 'view') || ((m.perms || []).indexOf(perm) !== -1); }
  function isOwner() { return !state.me || state.me.role === 'owner'; }
  var TAB_PERM = { settings: 'owner', packages: 'owner', marketing: 'marketing', access: 'staff' };
  function tabAllowed(t) {
    var need = TAB_PERM[t];
    if (!need) return true;
    if (need === 'staff') return !isOwner();
    if (need === 'owner') return isOwner();
    return canDo(need);
  }
  function applyRole() {
    Array.prototype.forEach.call(document.querySelectorAll('.admin-tabs button[data-tab]'), function (b) { b.hidden = !tabAllowed(b.getAttribute('data-tab')); });
    if (!tabAllowed(state.tab)) state.tab = 'dashboard';
    var who = $('who');
    if (who) { who.hidden = isOwner(); who.textContent = isOwner() ? '' : 'Signed in as ' + state.me.name; }
  }
  function setTab(tab) {
    if (!tabAllowed(tab)) tab = 'dashboard';
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
    if (state.me && state.me.must_change) { renderMustChange(view); return; }
    var fn = { dashboard: renderDashboard, requests: renderRequests, clients: renderClients,
      questions: renderQuestions, chats: renderChats, settings: renderSettings, assistant: renderAssistant, marketing: renderMarketing, packages: renderPackages, playbook: renderPlaybook, access: renderAccess }[state.tab];
    fn(view);
  }

  // ---------- Assistant (advice from lead to handover; it sees the chosen job, never keys) ----------
  var asst = { id: null, msgs: [], busy: false };
  function askAbout(r, question) {
    if (asst.id !== r.id) asst = { id: r.id, msgs: [], busy: false };
    setTab('assistant');
    if (question) sendAssistant(question);
  }
  function sendAssistant(text) {
    text = String(text || '').trim();
    if (!text || asst.busy) return;
    asst.msgs.push({ role: 'user', content: text });
    asst.busy = true; render();
    api('POST', { action: 'assistant', id: asst.id, messages: asst.msgs }).then(function (j) {
      asst.msgs.push({ role: 'assistant', content: j.reply });
    }).catch(function (e) {
      asst.msgs.push({ role: 'assistant', content: '⚠ ' + (e.message || 'Something went wrong') });
    }).then(function () { asst.busy = false; if (state.tab === 'assistant') { render(); var l = document.querySelector('.asst-log'); if (l) l.scrollTop = l.scrollHeight; } });
  }
  // Service notices: a banner on your website (and the project form, pay and change pages) for planned upgrades,
  // service problems, holiday breaks or any news. It shows from a chosen day and hides itself when it ends.
  function noticesCard() {
    var card = el('div', { class: 'admin-card admin-settings' }, [
      el('h2', { text: 'Service notices' }),
      el('p', { class: 'admin-intro', text: 'Tell customers about a planned upgrade, a problem, a holiday break or any news. It shows as a banner at the top of your website, project form, pay and change pages, and the website chat knows about it. It appears from the day you choose (3 days before by default) and disappears by itself when it ends.' })
    ]);
    var box = el('div', null, [el('p', { class: 'admin-hint', text: 'Loading…' })]);
    card.appendChild(box);
    var kinds = {};
    function form(n, into) {
      n = n || {};
      var kind = el('select', null, Object.keys(kinds).map(function (k) { return el('option', { value: k, text: kinds[k].emoji + ' ' + kinds[k].title }); }));
      kind.value = n.kind || 'upgrade';
      var title = el('input', { value: n.title || kinds[kind.value].title, maxlength: '80' });
      var msg = el('textarea', { rows: '4', maxlength: '600' }); msg.value = n.message || kinds[kind.value].message;
      var date = el('input', { type: 'date', value: n.date || '' });
      var from = el('input', { type: 'time', value: n.from || '' });
      var to = el('input', { type: 'time', value: n.to || '' });
      var showFrom = el('input', { type: 'date', value: n.show_from || '' });
      var on = el('input', { type: 'checkbox' }); on.checked = n.on !== false;
      kind.addEventListener('change', function () {
        var k = kinds[kind.value];
        if (!n.id) { title.value = k.title; msg.value = k.message; }
      });
      into.appendChild(el('div', { class: 'admin-golive' }, [
        el('div', { class: 'admin-grid' }, [field('Type', kind), field('Title', title, 'Shown in bold before the message')]),
        field('Message', msg, 'You can write {date}, {from} and {to}: they become e.g. "Saturday 22 November", "10pm" and "2am".'),
        el('div', { class: 'admin-grid' }, [field('Date', date, 'For upgrades and holidays'), field('From (Lagos time)', from), field('Until', to, 'Earlier than From = the next morning')]),
        el('div', { class: 'admin-grid' }, [field('Show the banner from', showFrom, 'Empty = 3 days before the date (or now if no date)'), el('label', { class: 'admin-check' }, [on, ' Showing (untick to hide it)'])]),
        el('div', { class: 'admin-actions' }, [
          el('button', { class: 'admin-btn', type: 'button', text: n.id ? 'Save notice' : 'Add notice', onclick: function (e) {
            act({ action: 'notice_save', notice: { id: n.id, kind: kind.value, title: title.value, message: msg.value, date: date.value, from: from.value, to: to.value, show_from: showFrom.value, on: on.checked } }, n.id ? 'Notice saved' : 'Notice added', e.currentTarget);
          } }),
          n.id ? el('button', { class: 'admin-btn', type: 'button', text: 'Delete', onclick: function (e) {
            if (window.confirm('Delete this notice?')) act({ action: 'notice_delete', noticeId: n.id }, 'Notice deleted', e.currentTarget);
          } }) : null
        ])
      ]));
    }
    function draw(j) {
      kinds = j.kinds; box.innerHTML = '';
      j.notices.forEach(function (n) {
        var st = { showing: ['Showing now', 'is-won'], scheduled: ['Scheduled', 'is-new'], ended: ['Ended', ''], off: ['Hidden', ''] }[n.status] || ['', ''];
        var d = el('details', { class: 'admin-fold' }, [el('summary', null, [el('span', { class: 'admin-fold-title', text: (kinds[n.kind] || {}).emoji + ' ' + n.title }), badge(st[0], st[1])])]);
        d.appendChild(el('p', { class: 'admin-hint', text: 'Customers see: ' + n.preview }));
        form(n, d);
        box.appendChild(d);
      });
      var add = el('details', { class: 'admin-fold', open: !j.notices.length }, [el('summary', null, [el('span', { class: 'admin-fold-title', text: '+ New notice' })])]);
      form(null, add);
      box.appendChild(add);
    }
    function act(body, okMsg, btn) {
      if (btn) btn.disabled = true;
      api('POST', body).then(function (j) { flash(okMsg); draw(j); }).catch(function (e) { if (btn) btn.disabled = false; fail(e); });
    }
    api('POST', { action: 'notices' }).then(draw).catch(function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'admin-error', text: e.message })); });
    return card;
  }
  // ---------- Email usage (Resend free plan: 100 a day, 3,000 a month, shared by every email we send) ----------
  function usageLevel(used, limit) { var p = limit ? used / limit : 0; return p >= 0.9 ? 'danger' : p >= 0.7 ? 'warn' : 'ok'; }
  function usageBar(label, used, limit) {
    var pct = Math.min(100, Math.round(100 * used / (limit || 1))), lvl = usageLevel(used, limit);
    return el('div', { class: 'admin-usage admin-usage--' + lvl }, [
      el('div', { class: 'admin-usage-top' }, [el('b', { text: label }), el('span', { text: used + ' of ' + limit + ' (' + pct + '%)' })]),
      el('div', { class: 'admin-usage-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(limit), 'aria-valuenow': String(used), 'aria-label': label }, [el('div', { class: 'admin-usage-fill', style: 'width:' + pct + '%' })])
    ]);
  }
  function todayUsed(u) { return Math.max(u.today.sent, u.today.resend || 0); }
  function monthUsed(u) { return Math.max(u.month.sent, u.month.resend || 0); }
  // Small strip on the dashboard; only stands out when getting close or when Resend refused emails today.
  function emailUsageStrip() {
    var u = state.emailUsage; if (!u) return null;
    var t = todayUsed(u), m = monthUsed(u), lvl = usageLevel(Math.max(t / u.limits.day, m / u.limits.month), 1);
    var blockedToday = u.blocked && String(u.blocked.at).slice(0, 10) === u.today.day;
    var waiting = u.refusedWaiting || 0;
    var box = el('div', { class: 'admin-card admin-usage-strip admin-usage--' + (blockedToday ? 'danger' : waiting ? 'warn' : lvl) }, [
      el('p', null, [el('b', { text: 'Emails today: ' + t + ' of ' + u.limits.day }), ' · this month ' + m + ' of ' + u.limits.month + (blockedToday ? ' · Resend refused emails today (limit reached)' : lvl === 'danger' ? ' · nearly at the limit' : lvl === 'warn' ? ' · getting close' : '') + (waiting ? ' · ' + waiting + ' refused email' + (waiting === 1 ? '' : 's') + ' to send again' : '') + ' ',
        el('button', { class: 'admin-btn', type: 'button', text: 'Details', onclick: function () { state.settingsTab = 'email'; setTab('settings'); } })])
    ]);
    return box;
  }
  function emailUsageCard() {
    var card = el('div', { class: 'admin-card admin-settings' }, [
      el('h2', { text: 'Email usage' }),
      el('p', { class: 'admin-intro', text: 'Every email the system sends (to you and to your customers) counts toward Resend\'s free plan: ' + (state.emailUsage ? state.emailUsage.limits.day : 100) + ' a day (resets at 1am Lagos time) and ' + (state.emailUsage ? state.emailUsage.limits.month : 3000) + ' a month. Past the limit, Resend refuses emails until it resets. Upgrading Resend to Pro removes the daily limit. Our email is only used for our own customers, never for their buyers or visitors.' })
    ]);
    var box = el('div', null, [el('p', { class: 'admin-hint', text: 'Loading…' })]);
    card.appendChild(box);
    // Emails Resend refused (usually the daily limit): kept 30 days to send again once the limit resets.
    var refBox = el('div');
    card.appendChild(refBox);
    function refusedAct(body, okMsg, btn) {
      btn.disabled = true;
      api('POST', body).then(function (j) {
        if (j.result) flash(j.result.sent + ' sent' + (j.result.failed ? ', ' + j.result.failed + ' still refused (' + j.result.error + ')' : ''));
        else flash(okMsg);
        state.emailUsage = j.usage; drawRefused(j.refused || []);
      }).catch(function (e) { btn.disabled = false; fail(e); });
    }
    function drawRefused(list) {
      refBox.innerHTML = '';
      refBox.appendChild(el('h3', { text: 'Refused emails' + (list.length ? ' (' + list.length + ')' : '') }));
      if (!list.length) { refBox.appendChild(el('p', { class: 'admin-hint', text: 'None. If Resend refuses an email (e.g. the daily limit), it waits here so you can send it again.' })); return; }
      refBox.appendChild(el('p', { class: 'admin-hint', text: 'Send them again once the limit has reset (1am Lagos time). Kept for 30 days.' }));
      refBox.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'btn btn--navy', type: 'button', text: 'Send all again', onclick: function (e) { refusedAct({ action: 'email_resend', all: true }, 'Sent', e.currentTarget); } })]));
      list.forEach(function (m) {
        refBox.appendChild(el('div', { class: 'admin-golive' }, [
          el('p', null, [el('b', { text: m.subject }), ' ', badge(m.kind, '')]),
          el('p', { class: 'admin-hint', text: (m.to_us ? 'To you' : 'To ' + m.recipient) + ' · ' + new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + m.error }),
          el('div', { class: 'admin-actions' }, [
            el('button', { class: 'admin-btn', type: 'button', text: 'Send again', onclick: function (e) { refusedAct({ action: 'email_resend', emailId: m.id }, 'Sent', e.currentTarget); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'Remove', onclick: function (e) { refusedAct({ action: 'email_refused_remove', emailId: m.id }, 'Removed', e.currentTarget); } })
          ])
        ]));
      });
    }
    api('POST', { action: 'email_usage' }).then(function (j) {
      var u = j.usage; state.emailUsage = u; box.innerHTML = '';
      if (!u) { box.appendChild(el('p', { class: 'admin-hint', text: 'No database: usage can\'t be counted.' })); return; }
      if (u.blocked) box.appendChild(el('p', { class: 'admin-error', text: 'Resend last refused an email on ' + new Date(u.blocked.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + (u.blocked.why ? ' (' + u.blocked.why.replace(/_/g, ' ') + ')' : '') + '.' }));
      box.appendChild(usageBar('Today', todayUsed(u), u.limits.day));
      box.appendChild(usageBar('This month', monthUsed(u), u.limits.month));
      if (u.today.resend != null) box.appendChild(el('p', { class: 'admin-hint', text: 'Resend\'s own count today: ' + u.today.resend + (u.month.resend != null ? ' · this month: ' + u.month.resend : '') + '.' }));
      if (u.today.byKind.length) {
        box.appendChild(el('h3', { text: 'Today by type' }));
        box.appendChild(el('ul', { class: 'admin-usage-kinds' }, u.today.byKind.map(function (k) { return el('li', { text: k.kind + ': ' + k.sent + (k.failed ? ' (' + k.failed + ' refused)' : '') }); })));
      }
      box.appendChild(el('h3', { text: 'Last 14 days' }));
      var max = Math.max.apply(null, u.days.map(function (d) { return d.sent; }).concat([u.limits.day]));
      box.appendChild(el('div', { class: 'admin-usage-days' }, u.days.slice().reverse().map(function (d) {
        var h = Math.round(100 * d.sent / max), lvl = usageLevel(d.sent, u.limits.day);
        return el('div', { class: 'admin-usage-day', title: d.day + ': ' + d.sent + ' sent' + (d.failed ? ', ' + d.failed + ' refused' : '') }, [
          el('span', { class: 'admin-usage-n', text: String(d.sent) }),
          el('div', { class: 'admin-usage-col admin-usage--' + lvl, style: 'height:' + Math.max(2, h) + '%' }),
          el('span', { class: 'admin-usage-d', text: d.day.slice(8) })
        ]);
      })));
      box.appendChild(el('p', { class: 'admin-hint', text: 'Bars are days in UTC (Resend\'s day). The line at the top of the chart is the daily limit.' }));
      drawRefused(j.refused || []);
    }).catch(function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'admin-error', text: e.message })); });
    return card;
  }

  // Reviews of SIRRADDO left on www.sirraddo.com.ng (Websites page). Nothing shows until you choose Show on website.
  function reviewsCard() {
    var card = el('div', { class: 'admin-card admin-settings' }, [
      el('h2', { text: 'Reviews of SIRRADDO' }),
      el('p', { class: 'admin-intro', text: 'Clients rate you on the Websites page of your website, or from their own review link (emailed 7 days after their site goes live; also under their client card → WhatsApp → Ask for a review). Those show as Verified client, with their business and photo. New ones wait here (and you get an email). Choose Show on website for genuine reviews, Hide for fake or rude ones. Shown reviews appear on your website within about 5 minutes.' })
    ]);
    var box = el('div', null, [el('p', { class: 'admin-hint', text: 'Loading…' })]);
    card.appendChild(box);
    function draw(j) {
      box.innerHTML = '';
      if (!j.reviews.length) { box.appendChild(el('p', { class: 'admin-hint', text: 'No reviews yet. Ask happy clients to leave one at sirraddo.com.ng/websites#reviews.' })); return; }
      j.reviews.forEach(function (r) {
        var st = { pending: ['New', 'is-new'], shown: ['On website', 'is-won'], hidden: ['Hidden', ''] }[r.status] || ['', ''];
        var stars = new Array(r.stars + 1).join('\u2605') + new Array(6 - r.stars).join('\u2606');
        box.appendChild(el('div', { class: 'admin-golive' }, [
          r.photo ? el('img', { src: r.photo, alt: '', class: 'admin-rv-photo' }) : null,
          el('p', null, [el('b', { text: stars + '  ' + r.name }), r.business ? ' · ' + r.business : '', ' ', badge(st[0], st[1]), r.client_id ? badge('Verified client', 'is-won') : null]),
          r.body ? el('p', { text: r.body }) : null,
          el('p', { class: 'admin-hint', text: new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }),
          el('div', { class: 'admin-actions' }, [
            r.status !== 'shown' ? el('button', { class: 'admin-btn', type: 'button', text: 'Show on website', onclick: function (e) { set(r.id, 'shown', e.currentTarget); } }) : null,
            r.status !== 'hidden' ? el('button', { class: 'admin-btn', type: 'button', text: 'Hide', onclick: function (e) { set(r.id, 'hidden', e.currentTarget); } }) : null
          ])
        ]));
      });
    }
    function set(id, status, btn) {
      btn.disabled = true;
      api('POST', { action: 'review_set', reviewId: id, status: status }).then(function (j) { flash(status === 'shown' ? 'Shown on your website' : 'Hidden'); draw(j); }).catch(function (e) { btn.disabled = false; fail(e); });
    }
    api('POST', { action: 'reviews' }).then(draw).catch(function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'admin-error', text: e.message })); });
    return card;
  }
  // Festive greetings: a banner on the website during each festival (automatic) + optional emails you send.
  function greetingsCard() {
    var card = el('div', { class: 'admin-card admin-settings' }, [
      el('h2', { text: 'Festive greetings' }),
      el('p', { class: 'admin-intro', text: 'During each festival a greeting banner shows on your website by itself. Emailing it is optional: tap Email everyone any time before, and it goes to your clients and recent contacts from the festival day, a batch a day, so your daily email limit is never used up.' })
    ]);
    var box = el('div', null, [el('p', { class: 'admin-hint', text: 'Loading…' })]);
    card.appendChild(box);
    function draw(j) {
      box.innerHTML = '';
      j.festivals.forEach(function (f) {
        var d = el('details', { class: 'admin-fold' });
        var status = !f.on ? ['Off', ''] : f.showing ? ['Showing now', 'is-won'] : ['From ' + niceDay(f.from), ''];
        d.appendChild(el('summary', null, [el('span', { class: 'admin-fold-title', text: f.emoji + ' ' + f.name + ' · ' + niceDay(f.date) }), badge(status[0], status[1])]));
        var on = el('input', { type: 'checkbox' }); on.checked = f.on;
        var date = el('input', { type: 'date', value: f.date });
        var msg = el('textarea', { rows: '3', maxlength: '400' }); msg.value = f.message;
        var inner = el('div', { class: 'admin-golive' }, [
          el('label', { class: 'admin-check' }, [on, ' Show the banner on my website']),
          field('Date' + (f.moon ? ' (moon sighting: change it when the Sultan announces)' : ''), date, 'Banner shows ' + niceDay(f.from) + ' to ' + niceDay(f.to) + '.'),
          field('Message', msg, 'Shown after "' + f.emoji + ' ' + f.title + ' from SIRRADDO!"'),
        ]);
        var acts = el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Save', onclick: function (e) {
          var ch = {}; ch[f.id] = { on: on.checked, message: msg.value, year: f.year, date: date.value === f.date ? undefined : date.value };
          if (ch[f.id].date === undefined) delete ch[f.id].year;
          act({ action: 'greetings_save', changes: ch }, 'Saved', e.currentTarget);
        } })]);
        var em = f.email || {};
        if (em.queued) acts.appendChild(el('span', { class: 'admin-meta', text: 'Emails: ' + em.sent + ' sent' + (em.pending ? ', ' + em.pending + ' waiting (from ' + niceDay(f.sendFrom) + ', ' + j.per_day + ' a day)' : '') + (em.failed ? ', ' + em.failed + ' failed' : '') }));
        else acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Email everyone (' + j.audience + ')', disabled: !j.can_email || !j.audience, onclick: function (e) {
          if (!window.confirm('Email the ' + f.title + ' greeting to ' + j.audience + ' customers? They go out from ' + niceDay(f.sendFrom) + ', up to ' + j.per_day + ' a day.')) return;
          act({ action: 'greetings_email', key: f.key }, 'Greeting emails scheduled', e.currentTarget);
        } }));
        inner.appendChild(acts);
        d.appendChild(inner);
        box.appendChild(d);
      });
      box.appendChild(el('p', { class: 'admin-hint', text: 'Emails go to clients and anyone who contacted you in the last year (not marked lost). Each email has a "stop festive greetings" link.' }));
    }
    function act(body, okMsg, btn) {
      if (btn) btn.disabled = true;
      api('POST', body).then(function (j) { flash(okMsg); draw(j); }).catch(function (e) { if (btn) btn.disabled = false; fail(e); });
    }
    api('POST', { action: 'greetings' }).then(draw).catch(function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'admin-error', text: e.message })); });
    return card;
  }
  function niceDay(d) { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

  // Ready-made ads that lead to sirraddo.com.ng: share straight to WhatsApp Status / Instagram from a phone,
  // or download. Images live in /assets/marketing (made from the "SIRRADDO website ads" design canvas).
  // Each picture has its own QR code (tagged, so Dashboard → "Where customers come from" shows "qr / <piece>"),
  // and each caption link is tagged too. Made by scripts/make-marketing.mjs (change the wording there).
  var MK_V = '4';
  var L = function (src, camp) { return 'https://www.sirraddo.com.ng/websites?utm_source=' + src + '&utm_campaign=' + camp; };
  var ADS = [
    { file: 'story-websites.jpg', title: 'Status / Story: Websites', size: '1080 × 1920', group: 'story',
      caption: 'Is your business on Google yet? Get a professional website from ₦50,000, live in 7 working days 👉 ' + L('status', 'websites') },
    { file: 'story-online-store.jpg', title: 'Status / Story: Online Store', size: '1080 × 1920', group: 'story',
      caption: 'Let customers order and pay you online, any time 🛒 Online Store websites from ₦150,000. Try our demo store 👉 ' + L('status', 'store') },
    { file: 'post-starter.jpg', title: 'Post: Starter ₦50,000', size: '1080 × 1080', group: 'square',
      caption: 'A professional website for your business: ₦50,000 with a free .com.ng domain, hosting, SSL and business email. Live in 7 working days 👉 ' + L('post', 'starter') },
    { file: 'post-how-it-works.jpg', title: 'Post: How it works', size: '1080 × 1080', group: 'square',
      caption: 'Your website in 4 easy steps: chat with us, pay 70% to start, approve your preview, then go live 👉 ' + L('post', 'steps') },
    { file: 'post-see-it-first.jpg', title: 'Post: See it first', size: '1080 × 1080', group: 'square',
      caption: 'No surprises: see your website and pick your favourite design before paying the balance 👉 ' + L('post', 'see-first') },
    { file: 'banner.jpg', title: 'Banner (Facebook, groups)', size: '1200 × 630', group: 'banner',
      caption: 'Websites for your business from ₦50,000. Domain, hosting and business email included 👉 ' + L('facebook', 'banner') },
    { file: 'video-websites.mp4', poster: 'video-websites.jpg', title: 'Video: Websites (21 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'Is your business on Google yet? 📍 Get a professional website from ₦50,000, live in 7 working days 👉 ' + L('video', 'websites') },
    { file: 'video-store.mp4', poster: 'video-store.jpg', title: 'Video: Online Store (22 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'Sell online and get paid straight to your account 🛒 Your own online store from ₦150,000 👉 ' + L('video', 'store') },
    { file: 'video-see-first.mp4', poster: 'video-see-first.jpg', title: 'Video: See it first (20 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'See your website before you pay the balance. Pick your favourite of up to 3 designs 👉 ' + L('video', 'see-first') },
    { file: 'video-why.mp4', poster: 'video-why.jpg', title: 'Video: Tired of "How much?" (21 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'Tired of answering the same questions on WhatsApp all day? 😅 Your own website shows your prices, photos, delivery areas and location 24/7. From ₦50,000 👉 ' + L('video', 'why') },
    { file: 'video-maps.mp4', poster: 'video-maps.jpg', title: 'Video: Google Maps (21 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'When people search "near me", can they find your business? 📍 Business website with Google Maps setup help: ₦100,000 👉 ' + L('video', 'maps') },
    { file: 'video-manage.mp4', poster: 'video-manage.jpg', title: 'Video: Update from your phone (21 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'Your website, your control 📱 Change prices, stock and opening hours from your phone in seconds. Bigger changes are free for your first month 👉 ' + L('video', 'manage') },
    { file: 'video-pidgin.mp4', poster: 'video-pidgin.jpg', title: 'Video: Pidgin (20 s)', size: '1080 × 1920 · MP4', group: 'video',
      caption: 'Your business dey Google? 👀 Customers dey search before dem buy. Make we build your website from ₦50,000, e go ready inside 7 working days 👉 ' + L('video', 'pidgin') },
    { file: 'flyer-a5.jpg', pdf: 'flyer-a5.pdf', title: 'Flyer (A5, print)', size: 'A5 · 148 × 210 mm', group: 'print',
      caption: 'Print the PDF at any business centre (A5, or 2 on one A4 sheet). Hand out at markets, shops and association meetings.' },
    { file: 'qr-card.jpg', pdf: 'qr-card.pdf', title: 'QR counter card (A6, print)', size: 'A6 · 105 × 148 mm', group: 'print',
      caption: 'Print, laminate and stand it on the counter of every customer whose website you built (with their permission).' }
  ];
  // ===================== Packages: Standard Store guide (built; switch it on per store) =====================
  // A planning page: what the Standard Store (Online Store + customer accounts) includes, every subscription it
  // needs and what each costs, a cost calculator, and the full process from first chat to handover.
  // Prices checked 19 Nov 2026 (Netlify, Neon, Render, Whogohost); change PKG below if they move.
  var PKG_DEFAULTS = { pkg_build: 200000, pkg_addon: 50000, pkg_renewal_addon: 25000, pkg_rate: 1400, custom_build_from: 300000, custom_monthly: 30000, neon_plan: 'free' };
  var PKG = {
    rate: 1400, // ₦ per $1 (official ~₦1,330–1,380 + card charges); from Settings (Packages → Prices)
    netlify: { freeCredits: 300, personal: { usd: 9, credits: 1000 }, pro: { usd: 20, credits: 5000 }, deploy: 15, perCall: 0.0012 },
    neon: { freeCuH: 100, cuh: 0.106, gbMonth: 0.35, size: 0.25 },
    domainYear: 7200, // .com.ng renewal at Whogohost (the cheap first-year prices online are promos)
    price: { build: 200000, addon: 50000, renewalAddon: 25000 },
    custom: { build: 300000, monthly: 30000 }
  };
  function pkgSetting(k) { var v = state.settings && state.settings[k]; return v != null && v !== '' ? v : PKG_DEFAULTS[k]; }
  function loadPkg() {
    PKG.rate = Number(pkgSetting('pkg_rate')) || 1400;
    PKG.price = { build: Number(pkgSetting('pkg_build')), addon: Number(pkgSetting('pkg_addon')), renewalAddon: Number(pkgSetting('pkg_renewal_addon')) };
    PKG.custom = { build: Number(pkgSetting('custom_build_from')), monthly: Number(pkgSetting('custom_monthly')) };
  }
  function nN(n) { return '₦' + Math.round(n).toLocaleString('en-NG'); }
  var PKG_TABS = [['standard', 'Standard Store'], ['custom', 'Custom system'], ['database', 'Database'], ['demand', 'Who\u2019s asking'], ['prices', 'Prices']];
  function renderPackages(view) {
    loadPkg();
    var tab = state.pkgTab || 'standard';
    view.appendChild(el('div', { class: 'admin-tabs admin-subtabs', role: 'group', 'aria-label': 'Packages' }, PKG_TABS.map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': t[0] === tab ? 'true' : 'false', text: t[1], onclick: function () { state.pkgTab = t[0]; render(); } });
    })));
    ({ standard: pkgStandard, custom: pkgCustom, database: pkgDatabase, demand: pkgDemand, prices: pkgPrices })[tab](view);
  }
  function pkgStandard(view) {
    view.appendChild(el('div', { class: 'admin-card' }, [
      el('span', { class: 'admin-badge is-won', text: 'Available now' }),
      el('h2', { text: 'Standard Store (Online Store + customer accounts)' }),
      el('p', { class: 'admin-hint', text: 'Built and ready: switch it on for a store on its client card → Online store payments → Ways to pay and Standard Store features → Customer accounts. On the website and in the chat it says "Price on request"; the prices below are only for you (and staff with Money).' }),
      el('p', { class: 'admin-hint', text: 'A full shopping experience like the big online marketplaces: buyers create an account, sign in, keep their order records and save delivery addresses. Use this page to quote it, see what it costs you to run, and follow the steps when you are ready to build it with Claude. (In ads and on the website, never name other companies.)' })
    ]));

    // 1. What the buyer and the store owner get
    view.appendChild(el('h2', { class: 'admin-h2', text: '1. What it includes' }));
    view.appendChild(el('div', { class: 'admin-card' }, [
      el('h3', { text: 'For buyers (the store’s customers)' }),
      el('ul', { class: 'admin-mini' }, [
        'Create an account and sign in: "Sign in with Google" (one tap) or phone number + password',
        'My orders: every order with status, items, amounts and the receipt (save as picture/PDF, share)',
        'Saved delivery addresses: up to 5 (home, office…), offered at checkout; a new address is saved by itself',
        'Order again in one tap, edit name and email, change password',
        'Checkout faster: name, phone and address already filled in',
        'No emails to buyers (our rule): Google sign-in needs none; a forgotten password is reset by the store owner'
      ].map(function (t) { return el('li', { text: t }); })),
      el('h3', { text: 'For the store owner (My store → Customers)' }),
      el('ul', { class: 'admin-mini' }, [
        'Customers list: name, phone, number of orders, total spent, last order',
        'Each customer’s orders and saved addresses (for delivery)',
        'Reset a buyer’s password (gives a one-time code to send on WhatsApp)',
        'Block or unblock an account',
        'Download customers and orders as a spreadsheet (CSV)',
        'Turn accounts off/on (My store → Payments); buyers can still check out as guests'
      ].map(function (t) { return el('li', { text: t }); }))
    ]));

    // 2. Price to the customer
    view.appendChild(el('h2', { class: 'admin-h2', text: '2. Your price (only you see this)' }));
    view.appendChild(el('div', { class: 'admin-card' }, [
      el('p', { class: 'admin-hint', text: 'Customers see "Price on request". Quote these (change them in Prices). The AI can suggest a price for an unusual job, but your saved price always comes first.' }),
      el('ul', { class: 'admin-mini' }, [
        el('li', null, [el('b', { text: 'Build: ' + nN(PKG.price.build) }), ' (Online Store ₦150,000 + customer accounts ' + nN(PKG.price.addon) + ')']),
        el('li', null, [el('b', { text: 'Yearly: their normal renewal + ' + nN(PKG.price.renewalAddon) }), ' (covers your share of the database and hosting upgrades below)']),
        el('li', null, [el('b', { text: 'Existing Online Store customers: ' + nN(PKG.price.addon) }), ' to add accounts to their store'])
      ]),
      el('div', { class: 'admin-actions' }, [
        el('button', { class: 'admin-btn', type: 'button', text: 'Change my prices', onclick: function () { state.pkgTab = 'prices'; render(); } }),
        el('button', { class: 'admin-btn', type: 'button', text: 'Ask the AI for a price suggestion', onclick: function () {
          asst = { id: null, msgs: [], busy: false }; setTab('assistant');
          sendAssistant('A customer wants a Standard Store. Show my saved prices first, then suggest a price for a bigger job (e.g. 300+ products, delivery zones, extra pages) and say why. Label yours as a suggestion.');
        } })])
    ]));
    // Ways to pay (every Online Store; each one a switch)
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Ways to pay (every Online Store)' }));
    view.appendChild(el('div', { class: 'pkg-costs' }, [
      ['Online payment: Paystack', 'Card, bank transfer, USSD into the store’s own account', ['1.5% + ₦100 per payment (₦100 waived under ₦2,500), capped at ₦2,000: paid by the store', '₦0 to you']],
      ['Online payment: Flutterwave (optional second option)', 'The owner adds their own key in My store → Payments', ['About 2% per payment (1.4% + 0.6%): paid by the store', 'Suggested add-on: ₦20,000–₦30,000 one-off (you decide)']],
      ['Bank transfer to the store’s account', 'The buyer pays and taps "I’ve paid"; the owner confirms in My store after checking their bank app', ['No fees', '₦0 to run']],
      ['Pay on delivery', 'The owner calls the buyer, delivers, then taps Paid & delivered', ['No fees; risk: buyers who don’t pay or pick up', '₦0 to run']],
      ['Store owner admin (My store)', 'Login + password for orders, stock, prices, payments, customers', ['₦0 to run (same website and database)', 'Included in the Standard Store; for normal Online Stores your call (suggested ₦30,000–₦40,000 or free)']]
    ].map(function (c) {
      return el('div', { class: 'admin-card pkg-cost' }, [el('h3', { text: c[0] }), el('p', { class: 'admin-meta', text: c[1] }), el('ul', { class: 'admin-mini' }, c[2].map(function (t) { return el('li', { text: t }); }))]);
    })));

    // 3. Subscriptions and costs
    view.appendChild(el('h2', { class: 'admin-h2', text: '3. What it costs you to run' }));
    view.appendChild(el('p', { class: 'admin-hint', text: 'All Standard Stores share the same hosting and database, so these are not per store: you pay only when total use outgrows the free plans. ₦ at ' + nN(PKG.rate) + ' per $1.' }));
    var costs = [
      ['Netlify', 'Your site and the store logins, orders and addresses', 'Free: 300 credits a month (sites pause if you pass it)',
        ['Personal: $9/month (1,000 credits) = ' + nN(9 * PKG.rate) + '/month · ' + nN(9 * PKG.rate * 12) + '/year', 'Pro: from $20/month = ' + nN(20 * PKG.rate) + '/month · ' + nN(20 * PKG.rate * 12) + '/year (only if you pass 1,000 credits)']],
      ['Neon', 'The database: accounts, orders, saved addresses', 'Free: 100 CU-hours and 1 GB a month (pauses at the limit)',
        ['Launch, pay as you go: $0.106 per CU-hour + $0.35 per GB-month, no minimum', 'Light use: ~' + nN(5.65 * PKG.rate) + '/month · ~' + nN(5.65 * PKG.rate * 12) + '/year', 'Busy all day: ~' + nN(19.7 * PKG.rate) + '/month · ~' + nN(19.7 * PKG.rate * 12) + '/year']],
      ['Cloudflare', 'Store websites, DNS, email forwarding', 'Free', ['Not needed: ₦0']],
      ['Google sign-in', 'Google Cloud (project sirraddo-websites)', 'Free', ['Not needed: ₦0']],
      ['Phone + password login', 'No SMS', 'Free', ['Not needed: ₦0']],
      ['.com.ng domain', 'Per store; the customer pays it in their renewal', '', [nN(PKG.domainYear) + '/year renewal at Whogohost (first-year promos are cheaper)']],
      ['Paystack', 'The store pays Paystack\u2019s fee on each sale, not you', '', ['₦0 to you']]
    ];
    view.appendChild(el('div', { class: 'pkg-costs' }, costs.map(function (c) {
      return el('div', { class: 'admin-card pkg-cost' }, [
        el('h3', { text: c[0] }), el('p', { class: 'admin-meta', text: c[1] }),
        c[2] ? el('p', null, [el('b', { text: 'Now: ' }), c[2]]) : null,
        el('ul', { class: 'admin-mini' }, c[3].map(function (t) { return el('li', { text: t }); }))
      ]);
    })));
    view.appendChild(el('p', { class: 'admin-hint', text: 'Worst case with everything upgraded: about ' + nN((9 + 19.7) * PKG.rate) + ' a month (' + nN((9 + 19.7) * PKG.rate * 12) + ' a year), shared by all your stores. Likely ₦0 for a good while. Note: the database cost is mostly fixed (about ' + nN(19.7 * PKG.rate) + ' a month once it is busy all day), so the more Standard Stores you have, the cheaper each one is. Your normal Online Stores may push the database onto the paid plan too as they grow.' }));

    // 4. Calculator
    view.appendChild(el('h2', { class: 'admin-h2', text: '4. Cost calculator' }));
    var calc = el('div', { class: 'admin-card' });
    var stores = el('input', { type: 'number', min: 0, value: 5, inputmode: 'numeric' });
    var buyers = el('input', { type: 'number', min: 0, value: 200, inputmode: 'numeric' });
    var deploys = el('input', { type: 'number', min: 0, value: 8, inputmode: 'numeric' });
    var rate = el('input', { type: 'number', min: 1, value: PKG.rate, inputmode: 'numeric' });
    var out = el('div');
    function calcNow() {
      var s = Math.max(0, +stores.value || 0), b = Math.max(0, +buyers.value || 0), d = Math.max(0, +deploys.value || 0), fx = Math.max(1, +rate.value || PKG.rate);
      // Each active buyer ≈ 20 account calls a month (sign-in, orders, addresses, checkout); your own site and admin ≈ 60 credits.
      var calls = s * b * 20;
      var credits = Math.round(d * PKG.netlify.deploy + calls * PKG.netlify.perCall + 60);
      var plan = credits <= PKG.netlify.freeCredits * 0.85 ? ['Free', 0] : credits <= PKG.netlify.personal.credits * 0.9 ? ['Personal', 9] : ['Pro', 20];
      // Database: awake ~5 minutes after each use. 80% of use in 16 daytime hours, 20% at night.
      var dayRate = calls * 0.8 / 30 / 16, nightRate = calls * 0.2 / 30 / 8;
      var awake = 16 * (1 - Math.exp(-dayRate * 5 / 60)) + 8 * (1 - Math.exp(-nightRate * 5 / 60)) + 1;
      var cuh = Math.round(awake * 30 * PKG.neon.size + 15); // + your own admin, site and chat
      var neonUsd = cuh <= PKG.neon.freeCuH ? 0 : cuh * PKG.neon.cuh + 0.35;
      var month = (plan[1] + neonUsd) * fx;
      var revenue = s * PKG.price.renewalAddon;
      out.innerHTML = '';
      out.appendChild(el('ul', { class: 'admin-mini' }, [
        el('li', null, ['Account calls: ', el('b', { text: calls.toLocaleString('en-NG') + ' a month' })]),
        el('li', null, ['Netlify: ', el('b', { text: '~' + credits + ' credits a month → ' + plan[0] + (plan[1] ? ' ($' + plan[1] + ' = ' + nN(plan[1] * fx) + '/month)' : ' (₦0)') })]),
        el('li', null, ['Neon: ', el('b', { text: '~' + cuh + ' CU-hours a month → ' + (neonUsd ? 'Launch (~$' + neonUsd.toFixed(2) + ' = ' + nN(neonUsd * fx) + '/month)' : 'Free (₦0)') })]),
        el('li', null, ['Total running cost: ', el('b', { text: nN(month) + ' a month · ' + nN(month * 12) + ' a year' })]),
        el('li', null, ['Your yearly add-on income from ' + s + ' store' + (s === 1 ? '' : 's') + ': ', el('b', { text: nN(revenue) + (revenue >= month * 12 ? ' ✓ covers it' : ' ✗ not enough yet') })]),
        month > 0 ? el('li', null, ['Break-even: ', el('b', { text: Math.ceil(month * 12 / PKG.price.renewalAddon) + ' Standard Stores at ' + nN(PKG.price.renewalAddon) + ' a year' }), ' (or charge more per store)']) : null
      ]));
      out.appendChild(el('p', { class: 'admin-hint', text: 'An estimate: real use shows in Netlify → Usage and Neon → Billing. Check monthly.' }));
    }
    [stores, buyers, deploys, rate].forEach(function (x) { x.addEventListener('input', calcNow); });
    [field('Standard Stores', stores), field('Active buyers per store per month', buyers), field('Website updates (deploys) per month', deploys), field('₦ per $1', rate)].forEach(function (x) { calc.appendChild(x); });
    calc.appendChild(out);
    view.appendChild(calc);
    calcNow();

    // 5. Process
    view.appendChild(el('h2', { class: 'admin-h2', text: '5. From first chat to handover' }));
    var steps = [
      ['A customer asks', 'From the website chat, WhatsApp or an ad. The chat says "Price on request" (never a number) and tags them "Wants customer accounts" (Packages → Who\u2019s asking). Reply with your price from section 2.'],
      ['Quote and invoice', 'Requests → their request → Package "Online Store", Quote ' + nN(PKG.price.build) + ', and write "Standard Store (customer accounts)" in the summary. Send the invoice.'],
      ['70% deposit', 'They pay online (Paystack link on the invoice) or by transfer; it is recorded and the receipt goes out by itself.'],
      ['Project form', 'They fill the Online Store form: products, photos, delivery areas, and connect their own Paystack (Connect link).'],
      ['Switch it on', 'Client card → Online store payments → Ways to pay and Standard Store features: tick Customer accounts (and the ways to pay they want), Save switches. Then Store owner login → Create their login → Send login on WhatsApp.'],
      ['Google sign-in (one time only)', 'One time: Google Cloud → APIs & Services → OAuth consent screen (External, app name SIRRADDO) → Credentials → Create OAuth client ID (Web). Add https://www.sirraddo.com.ng and https://sirraddo.com.ng to "Authorised JavaScript origins". Put the client ID in Netlify as GOOGLE_SIGNIN_CLIENT_ID. Every store then signs buyers in through sirraddo.com.ng/signin: nothing to add per store. Free.'],
      ['Preview and approval', 'They choose a design and test: sign up, add an address, place a test order, see it under My orders.'],
      ['Balance and go live', 'They pay the 30% balance; Go live puts the store on their domain. Test once more on the real domain.'],
      ['Handover', 'The handover pack, plus their My store login (sirraddo.com.ng/mystore): orders (confirm transfers, mark delivered), customers list, resetting a buyer’s password, downloading customers and orders. The Manage link stays as a backup.'],
      ['Every month', 'Packages → Database shows the database use (and emails you at 70% and 90%). Check Netlify → Usage too. Upgrade only when the free limits are close.'],
      ['Their yearly add-on', 'Client card → Monthly / yearly services → "Customer accounts (Standard Store)" (yearly). Invoices, reminders and receipts then run by themselves.']
    ];
    view.appendChild(el('ol', { class: 'admin-steps' }, steps.map(function (s) { return el('li', null, [el('b', { text: s[0] }), el('p', { class: 'admin-hint', text: s[1] })]); })));

    // 6. Upgrades
    view.appendChild(el('h2', { class: 'admin-h2', text: '6. How to upgrade (only when needed)' }));
    view.appendChild(el('div', { class: 'admin-card' }, [
      el('h3', { text: 'Neon (database) → Launch' }),
      el('ol', { class: 'admin-mini' }, [
        'When: Neon → Billing shows close to 100 CU-hours or 1 GB in a month (the database pauses at the limit until next month).',
        'console.neon.tech → your organisation → Billing → Upgrade → Launch. Add a dollar card.',
        'Nothing to move: the same database and connection string keep working (no change in Netlify).',
        'Keep "scale to zero" on, and set a spending limit (e.g. $25/month) so a busy month can’t surprise you.',
        'Cost: pay only for use, $0.106 per CU-hour and $0.35 per GB-month, no monthly minimum (about ' + nN(5.65 * PKG.rate) + '–' + nN(19.7 * PKG.rate) + ' a month).'
      ].map(function (t) { return el('li', { text: t }); })),
      el('h3', { text: 'Netlify (hosting) → Personal' }),
      el('ol', { class: 'admin-mini' }, [
        'When: Netlify → Usage shows over ~250 of 300 credits in a month (on Free, sites pause at 300).',
        'app.netlify.com → team SIRRADDO GLOBAL LIMITED → Team settings → Billing → Change plan → Personal ($9/month, 1,000 credits). Add a dollar card.',
        'Leave "auto recharge" off unless you want it to buy extra credits by itself.',
        'Cost: ' + nN(9 * PKG.rate) + ' a month (' + nN(9 * PKG.rate * 12) + ' a year). Pro (from $20/month) only if you outgrow 1,000 credits.'
      ].map(function (t) { return el('li', { text: t }); })),
      el('h3', { text: 'Paying in dollars' }),
      el('p', { class: 'admin-hint', text: 'Both bill in US dollars. Use a dollar (domiciliary) card or a virtual dollar card, and keep a little extra for exchange-rate changes.' })
    ]));

    // 7. Before launch
    view.appendChild(el('h2', { class: 'admin-h2', text: '7. Before you sell it' }));
    view.appendChild(el('ul', { class: 'admin-mini' }, [
      'Privacy page: add buyer accounts (what is stored, that it belongs to the store owner, how to delete an account).',
      'Terms: the store owner is responsible for their customers’ data on their store.',
      'Website and chat: add the package and price (Claude can do this when building it).',
      'Never email buyers from SIRRADDO’s email (our rule): Google sign-in or owner password resets only.'
    ].map(function (t) { return el('li', { text: t }); })));

  }

  // ---------- Packages → Database: live usage + how to run it ----------
  function neonCard() {
    var card = el('div', { class: 'admin-card' }, [el('h2', { text: 'Database usage this month (Neon)' }), el('p', { class: 'admin-hint', text: 'Loading…' })]);
    function draw(j) {
      while (card.children.length > 1) card.lastChild.remove();
      if (!j.configured) {
        card.appendChild(el('p', { class: 'admin-hint', text: 'Not connected yet. To see usage here and get an email at 70% and 90% of the free plan:' }));
        card.appendChild(el('ol', { class: 'admin-mini' }, [
          'Neon → your account (top right) → Account settings → API keys → Create new API key (name it "sirraddo-usage"). Copy it.',
          'Netlify → project sirraddo → Site configuration → Environment variables → Add: NEON_API_KEY = the key. Never paste it in a chat or email.',
          'If you have more than one Neon project, also add NEON_PROJECT_ID (Neon → your project → Settings → Project ID).',
          'It starts working after the next deploy. Reading usage never wakes the database.'
        ].map(function (t) { return el('li', { text: t }); })));
        return;
      }
      var u = j.usage, free = (pkgSetting('neon_plan') || 'free') === 'free';
      if (!u) { card.appendChild(el('p', { class: 'admin-hint', text: j.error || 'No reading yet. Tap Check now.' })); }
      else {
        var pctH = Math.min(100, Math.round(100 * u.cuh / j.free.cuh)), pctS = Math.min(100, Math.round(100 * u.storageGB / j.free.gb));
        var bar = function (label, pct, text) {
          return el('div', { class: 'usage-row' }, [el('div', { class: 'usage-top' }, [el('span', { text: label }), el('b', { text: text })]),
            el('div', { class: 'usage-bar' + (pct >= 90 ? ' is-bad' : pct >= 70 ? ' is-warn' : '') }, [el('span', { style: 'width:' + pct + '%' })])]);
        };
        card.appendChild(bar('Compute hours', free ? pctH : 0, u.cuh + (free ? ' of ' + j.free.cuh + ' (' + pctH + '%)' : ' hours · about $' + (u.cuh * PKG.neon.cuh).toFixed(2) + ' = ' + nN(u.cuh * PKG.neon.cuh * PKG.rate))));
        card.appendChild(bar('Storage', free ? pctS : 0, u.storageGB + ' GB' + (free ? ' of ' + j.free.gb + ' GB (' + pctS + '%)' : '')));
        card.appendChild(el('p', { class: 'admin-hint', text: (free ? (pctH >= 90 ? 'Upgrade to Launch today (steps below).' : pctH >= 70 ? 'Plan to upgrade this week (steps below).' : 'Fine for now.') : 'On Launch: you pay for the hours used.') + ' Checked ' + when(u.at) + (u.periodStart ? ' · month started ' + niceDay(u.periodStart.slice(0, 10)) : '') + '.' }));
        if (j.error) card.appendChild(el('p', { class: 'admin-error', text: j.error }));
      }
      card.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Check now', onclick: function (e) {
        var b = e.currentTarget; b.disabled = true; b.textContent = 'Checking…';
        api('POST', { action: 'mk_neon', refresh: true }).then(draw).catch(fail);
      } }));
    }
    api('POST', { action: 'mk_neon' }).then(draw).catch(fail);
    return card;
  }
  function pkgDatabase(view) {
    view.appendChild(neonCard());

    // 8. Running the database: checks, upgrades, moving one store
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Running the database (all stores share one)' }));
    view.appendChild(el('p', { class: 'admin-hint', text: 'Every store uses the one Neon database behind this website (each record is labelled with its store). The store pages live on Cloudflare and keep showing even if the database pauses; only checkout, sign-in, reviews, admin and Manage need it. On Free it can be awake 100 hours a month; past that it pauses for every store until next month.' }));
    function stepCard(title, intro, list, foot) {
      return el('div', { class: 'admin-card' }, [el('h3', { text: title }), intro ? el('p', { class: 'admin-hint', text: intro }) : null,
        el('ol', { class: 'admin-mini' }, list.map(function (t) { return el('li', { text: t }); })), foot ? el('p', { class: 'admin-hint', text: foot }) : null]);
    }
    view.appendChild(stepCard('A. Monthly check (5 minutes, first week of the month)', null, [
      'Neon: console.neon.tech → your project → Billing / Usage. Under 70 compute hours and 0.7 GB: nothing to do. 70–100 hours: upgrade this month (B).',
      'Netlify: app.netlify.com → team → Usage. Under ~250 credits is fine; above, see C.',
      'Neon → Monitoring: if one store causes most of the activity, read D.'
    ]));
    view.appendChild(stepCard('B. Upgrade Neon to Launch (10 minutes, no downtime)', null, [
      'console.neon.tech → your organisation → Billing → Upgrade → Launch.',
      'Add a dollar card (domiciliary or virtual).',
      'Set a spending limit (e.g. $25 a month) so a surprise month can’t run up a big bill.',
      'Leave "scale to zero" on: quiet hours cost nothing.',
      'Nothing else changes: same database and connection string, no Netlify change, no deploy.'
    ], 'Cost: about ' + nN(5.65 * PKG.rate) + ' a month light, up to about ' + nN(19.7 * PKG.rate) + ' busy.'));
    view.appendChild(stepCard('C. Upgrade Netlify to Personal (5 minutes)', null, [
      'app.netlify.com → team SIRRADDO GLOBAL LIMITED → Team settings → Billing → Change plan → Personal ($9/month, 1,000 credits).',
      'Add the dollar card. Leave "auto recharge" off.'
    ], 'Cost: ' + nN(9 * PKG.rate) + ' a month.'));
    view.appendChild(stepCard('D. When a store needs its own database', 'Move a store only if one of these is true:', [
      'That one store keeps the database awake almost all day, or uses most of the storage.',
      'It gets thousands of orders or sign-ins a day and other stores feel slower.',
      'The customer asks for their data to be kept separate (and pays for it).'
    ]));
    view.appendChild(stepCard('E. Move one store to its own database', 'Not built yet. The first time, ask Claude: "Build per-store database moving". It adds the switch plus "Pause checkout", "Move to own database", "Move back" and "Remove old copy" buttons to the client card (one deploy, 15 credits). Then each move takes about 30 minutes, best at night:', [
      'Agree the price: their database costs ' + nN(5.65 * PKG.rate) + '–' + nN(19.7 * PKG.rate) + ' a month; charge e.g. ₦15,000–₦35,000 a month (or yearly).',
      'Create their database: console.neon.tech → New project → "store-theirname", same region and Postgres version as your main project → copy the pooled connection string.',
      'Save it as a secret: Netlify → project sirraddo → Environment variables → add STORE_DB_<client ID> = the connection string. Never paste it in a chat or email. Saving it needs one redeploy (15 credits).',
      'Client card → Pause checkout (buyers see "Back in a few minutes"; pages stay up).',
      'Client card → Move to own database: it copies their products, orders, buyers, addresses and reviews and shows the counts (e.g. Orders 1,240 = 1,240 ✓).',
      'Test on their live site: a test order, sign in, save an address, a review, their Manage page.',
      'Client card → Resume checkout.',
      'Keep the old copy 7 days as a backup, then Remove old copy.',
      'Bill their database monthly or yearly with their normal invoices.'
    ], 'Undo within 7 days: Move back (orders made since the move are copied back, and checkout uses the main database again).'));
    view.appendChild(stepCard('F. Backups', null, [
      'Before any upgrade or move: Settings → Backup → download a backup and keep it safe (never forward it).',
      'Neon can restore the database to an earlier time: Neon → your project → Restore. Paid plans keep a longer history, one more reason to upgrade once real stores depend on it.'
    ]));

  }

  // ---------- Packages → Custom system ----------
  function pkgCustom(view) {
    var c = PKG.custom;
    view.appendChild(el('div', { class: 'admin-card' }, [
      el('h2', { text: 'Custom systems (built as separate projects)' }),
      el('p', { class: 'admin-hint', text: 'For anything bigger than a website with a store: school portals and result checkers, clinic or hospital records, booking systems with staff, property sites where agents log in, marketplaces with many sellers, savings/ajo apps, internal dashboards. Each one gets its own server and database; their website links to it (e.g. portal.theirbusiness.com.ng).' })
    ]));
    view.appendChild(el('h2', { class: 'admin-h2', text: '1. Price (you decide)' }));
    view.appendChild(el('div', { class: 'admin-card' }, [el('ul', { class: 'admin-mini' }, [
      el('li', null, [el('b', { text: 'Build: from ' + nN(c.build) }), ', depending on size (screens, user types, payments, reports).']),
      el('li', null, [el('b', { text: 'Hosting and care: ' + nN(c.monthly) + ' a month' }), ' (or ' + nN(c.monthly * 10) + ' a year, 2 months free), added as a monthly/yearly service on their client card so invoices and reminders go out by themselves.']),
      el('li', { text: 'Changes after launch: quoted each time (or a care plan with a few hours a month).' })
    ])]));
    view.appendChild(el('h2', { class: 'admin-h2', text: '2. What each one costs you to run (per project)' }));
    view.appendChild(el('div', { class: 'pkg-costs' }, [
      ['Server (Render)', 'Starter web service, always on', ['$7/month = ' + nN(7 * PKG.rate) + '/month · ' + nN(7 * PKG.rate * 12) + '/year']],
      ['Database', 'A new Neon project (free plan: 100 hours, 1 GB) or Render Postgres', ['Neon Free: ₦0 to start', 'Neon Launch when busy: ~' + nN(5.65 * PKG.rate) + '–' + nN(19.7 * PKG.rate) + '/month', 'Render Postgres Basic: $6/month = ' + nN(6 * PKG.rate) + '/month']],
      ['Address', 'portal.theirdomain.com.ng on their existing domain (Cloudflare)', ['₦0']],
      ['Emails to their users', 'Password resets, notices: from THEIR own email account on their domain (never SIRRADDO’s)', ['They pay their email provider (many have a free plan)']],
      ['Code', 'A private repo under the sirraddo-global GitHub organisation', ['₦0']]
    ].map(function (x) {
      return el('div', { class: 'admin-card pkg-cost' }, [el('h3', { text: x[0] }), el('p', { class: 'admin-meta', text: x[1] }), el('ul', { class: 'admin-mini' }, x[2].map(function (t) { return el('li', { text: t }); }))]);
    })));
    view.appendChild(el('p', { class: 'admin-hint', text: 'Typical running cost: ' + nN(7 * PKG.rate) + '–' + nN(13 * PKG.rate) + ' a month per project. At ' + nN(c.monthly) + ' a month you keep ' + nN(c.monthly - 13 * PKG.rate) + ' or more for care and exchange-rate changes.' }));
    view.appendChild(el('h2', { class: 'admin-h2', text: '3. From first chat to handover' }));
    var steps = [
      ['A customer asks', 'The chat saves it as "Custom app" and tags it "custom system" (see Who’s asking). Call or WhatsApp them the same day.'],
      ['Understand the job (30 minutes)', 'Who logs in (types of users), what each can do, payments, reports, how many users, deadlines. Write it down as a one-page scope.'],
      ['Quote', 'Requests → their request → Package "Custom app", Quote (build price), summary = the scope. Send the invoice; say the monthly hosting and care fee too.'],
      ['70% deposit', 'Paid online or by transfer; recorded with a receipt.'],
      ['Build with Claude', 'New private repo under sirraddo-global. Ask Claude to build it from the scope, with tests. Weekly progress on WhatsApp.'],
      ['Server and database', 'Render: new Web Service from the repo (Starter). Neon: new project for this client (or Render Postgres). Their secrets only in Render’s environment settings.'],
      ['Test link', 'They try it on the Render address with test accounts and say what to change.'],
      ['Balance and go live', 'They pay the 30% balance. Cloudflare: add portal.theirdomain (CNAME to the Render address), and add the custom domain in Render. Add a "Login" button on their website.'],
      ['Handover', 'Admin logins privately on WhatsApp, a short how-to, and who to call. On their client card → Monthly / yearly services → add "Custom system hosting and care" so the monthly invoices and reminders run by themselves.'],
      ['Every month', 'Render and Neon usage for that project; the service fee comes in; backups.']
    ];
    view.appendChild(el('ol', { class: 'admin-steps' }, steps.map(function (x) { return el('li', null, [el('b', { text: x[0] }), el('p', { class: 'admin-hint', text: x[1] })]); })));
  }

  // ---------- Packages → Who's asking ----------
  function pkgDemand(view) {
    var box = el('div');
    view.appendChild(el('p', { class: 'admin-intro', text: 'People who asked for things you don’t sell yet (last 90 days): the chat tags them, and website forms are tagged from what they wrote. When enough ask, build it.' }));
    view.appendChild(box);
    api('POST', { action: 'mk_demand' }).then(function (j) {
      var acc = j.demand.filter(function (d) { return d.wants === 'customer_accounts'; }), cus = j.demand.filter(function (d) { return d.wants === 'custom_system'; });
      box.appendChild(el('div', { class: 'admin-tiles' }, [tile('Customer accounts', acc.length, 'Standard Store'), tile('Custom systems', cus.length, 'portals, bookings…')]));
      [['Standard Store (customer accounts)', acc], ['Custom systems', cus]].forEach(function (g) {
        box.appendChild(el('h2', { class: 'admin-h2', text: g[0] }));
        box.appendChild(g[1].length ? el('ul', { class: 'admin-mini' }, g[1].map(function (d) {
          return el('li', null, [el('b', { text: d.business || d.name }), ' · ' + d.contact + ' · ' + d.interest + ' · ' + d.status + ' · ' + niceDay(String(d.created_at).slice(0, 10))]);
        })) : el('p', { class: 'admin-empty', text: 'Nobody yet.' }));
      });
    }).catch(fail);
  }

  // ---------- Packages → Prices ----------
  function pkgPrices(view) {
    var card = el('div', { class: 'admin-card' }, [el('h2', { text: 'Prices used on these pages' }), el('p', { class: 'admin-hint', text: 'Change them here; the guides and calculator update. (The public website doesn’t show these packages yet.)' })]);
    var inputs = {};
    [['pkg_build', 'Standard Store: build (₦)'], ['pkg_addon', 'Add accounts to an existing store (₦)'], ['pkg_renewal_addon', 'Standard Store: extra per year (₦)'],
      ['custom_build_from', 'Custom system: build from (₦)'], ['custom_monthly', 'Custom system: hosting and care per month (₦)'], ['pkg_rate', '₦ per $1 (for costs)']].forEach(function (f) {
      inputs[f[0]] = el('input', { type: 'number', min: 0, inputmode: 'numeric', value: pkgSetting(f[0]) });
      card.appendChild(field(f[1], inputs[f[0]]));
    });
    var plan = select([['free', 'Free (warn me at 70% and 90%)'], ['launch', 'Launch (paid, no warnings)']], pkgSetting('neon_plan') || 'free', { 'aria-label': 'Neon plan' });
    card.appendChild(field('Neon plan', plan, 'Set to Launch after you upgrade.'));
    card.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Save prices', onclick: function () {
      var out = { neon_plan: plan.value };
      Object.keys(inputs).forEach(function (k) { out[k] = String(Math.max(0, Math.round(Number(inputs[k].value) || 0)) || ''); });
      api('POST', { action: 'settings', settings: out }).then(function (j) { state.settings = j.settings; flash('Saved'); render(); }).catch(fail);
    } }));
    view.appendChild(card);
  }

  // ---------- Client card → Monthly / yearly services ----------
  function servicesBlock(r) {
    var box = el('div', { class: 'admin-golive' });
    var list = el('div');
    function save(services, msg) {
      return api('PATCH', { id: r.id, services: services }).then(function (row) { Object.assign(r, row); flash(msg || 'Saved'); draw(); }).catch(fail);
    }
    function draw() {
      list.innerHTML = '';
      var svcs = r.services || [];
      if (!svcs.length) list.appendChild(el('p', { class: 'admin-hint', text: 'None. Add a monthly or yearly fee (dedicated database, custom system hosting and care, customer accounts…). Invoices, reminders, online payment and receipts then run by themselves.' }));
      svcs.forEach(function (s, i) {
        var d = Math.round((new Date(s.next_due + 'T00:00:00Z') - new Date(new Date(Date.now() + 3600000).toISOString().slice(0, 10) + 'T00:00:00Z')) / 86400000);
        var status = !s.active ? 'Stopped' : d < 0 ? (-d) + ' day(s) overdue' : d === 0 ? 'Due today' : 'Next due ' + niceDay(s.next_due) + (d <= 14 ? ' (in ' + d + ' days)' : '');
        var link = r.doc_token ? location.origin + '/doc?t=' + r.doc_token + '&type=service&s=' + s.id : '';
        var num = waNumber(r.contact);
        list.appendChild(el('div', { class: 'admin-card mk-row' }, [
          el('div', null, [el('b', { text: s.name }), el('div', { class: 'admin-meta', text: naira(s.amount) + ' ' + s.period + ' · ' + status })]),
          el('div', { class: 'admin-actions' }, [
            link ? el('a', { class: 'admin-btn', href: link, target: '_blank', rel: 'noopener', text: 'Invoice' }) : null,
            link && num ? el('a', { class: 'admin-btn admin-btn--wa', target: '_blank', rel: 'noopener', text: 'Send on WhatsApp',
              href: 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hello ' + String(r.name).split(' ')[0] + ', your ' + s.period + ' ' + s.name + ' fee of ' + naira(s.amount) + ' is due ' + niceDay(s.next_due) + '. Invoice and online payment: ' + link) }) : null,
            el('button', { class: 'admin-btn', type: 'button', text: 'Record payment', onclick: function () {
              var amt = window.prompt('Amount received (₦) for ' + s.name + ' due ' + niceDay(s.next_due) + ':', String(s.amount));
              if (!amt) return;
              api('POST', { action: 'mk_svc_paid', id: r.id, service_id: s.id, payment: { amount: amt } }).then(function (row) { Object.assign(r, row); flash('Payment recorded; next due date moved on'); draw(); }).catch(fail);
            } }),
            el('button', { class: 'admin-btn', type: 'button', text: s.active ? 'Stop' : 'Start again', onclick: function () {
              var copy = svcs.map(function (x) { return Object.assign({}, x); }); copy[i].active = !s.active; save(copy, s.active ? 'Stopped (no more reminders)' : 'Started again');
            } })
          ])
        ]));
      });
    }
    var name = select(SERVICE_PRESETS.map(function (p) { return p[0]; }).concat(['Other']), SERVICE_PRESETS[0][0], { 'aria-label': 'Service' });
    var other = el('input', { placeholder: 'Name of the service', hidden: true, maxlength: 80 });
    var amount = el('input', { type: 'number', min: 1, inputmode: 'numeric', placeholder: 'Amount ₦', value: '' });
    var period = select([['monthly', 'Monthly'], ['yearly', 'Yearly']], 'monthly', { 'aria-label': 'How often' });
    var due = el('input', { type: 'date', value: new Date(Date.now() + 3600000).toISOString().slice(0, 10) });
    name.addEventListener('change', function () {
      other.hidden = name.value !== 'Other';
      var p = SERVICE_PRESETS.filter(function (x) { return x[0] === name.value; })[0];
      if (p) period.value = p[1];
      if (name.value === 'Custom system hosting and care' && !amount.value) amount.value = PKG.custom.monthly;
      if (name.value === 'Customer accounts (Standard Store)' && !amount.value) amount.value = PKG.price.renewalAddon;
    });
    var add = el('details', { class: 'admin-ai-own' }, [el('summary', { text: '+ Add a monthly or yearly fee' }),
      field('Service', name), other, field('Amount (₦)', amount), field('How often', period), field('First due date', due, 'The first invoice and reminders go out from 7 days before.'),
      el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Add', onclick: function () {
        var n = name.value === 'Other' ? other.value.trim() : name.value;
        if (!n || !(Number(amount.value) > 0)) return fail(new Error('Choose the service and the amount'));
        save((r.services || []).concat([{ name: n, amount: Number(amount.value), period: period.value, next_due: due.value, active: true }]), 'Added. Reminders and invoices are automatic.').then(function () { amount.value = ''; add.open = false; });
      } })]);
    box.appendChild(list); box.appendChild(add);
    draw();
    return box;
  }
  var SERVICE_PRESETS = [['Dedicated database', 'monthly'], ['Custom system hosting and care', 'monthly'], ['Customer accounts (Standard Store)', 'yearly'], ['Website care plan', 'monthly']];

  // ===================== Playbook: what to do when the unexpected happens =====================
  function renderPlaybook(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'What to do when something unexpected comes up: what to check, the steps, and a ready WhatsApp reply. The admin assistant knows all of these too (ask it, e.g. "a customer says their site is down").' }));
    var search = el('input', { type: 'search', placeholder: 'Search: refund, domain, down, discount, app…', 'aria-label': 'Search the playbook', value: state.pbQuery || '' });
    var who = el('input', { placeholder: 'Customer’s first name (for the replies)', 'aria-label': 'Customer first name', value: state.pbName || '' });
    var list = el('div'), policyBox = el('div');
    view.appendChild(el('div', { class: 'admin-card' }, [search, who]));
    if (!isOwner()) view.appendChild(el('p', { class: 'admin-hint admin-callout', text: 'Some steps need the owner (refunds, discounts, prices, invoices, going live, settings, anything about passwords or keys). Do what your account allows, tell the customer the team will get back to them, then tap "Message the owner" in My access.' }));
    view.appendChild(policyBox);
    view.appendChild(list);
    var data = null;
    function fillReply(t) { return String(t || '').replace(/\{name\}/g, (who.value.trim() || 'there')); }
    function draw() {
      if (!data) return;
      var qv = search.value.trim().toLowerCase();
      // Match by words (any word of 3+ letters, ignoring small words), best matches first.
      var STOP = ['the', 'and', 'for', 'not', 'isn', 'can', 'you', 'our', 'my', 'is', 'a', 'to', 'of', 'what', 'how', 'customer', 'customers', 'wants', 'want'];
      var words = qv.split(/[^a-z0-9₦]+/).filter(function (w) { return w.length >= 3 && STOP.indexOf(w) === -1; });
      var score = function (p) {
        if (!qv) return 1;
        var title = p.title.toLowerCase(), hay = (p.title + ' ' + p.group + ' ' + p.check.join(' ') + ' ' + p.steps.join(' ') + ' ' + p.reply).toLowerCase();
        if (hay.indexOf(qv) !== -1) return 100;
        return words.reduce(function (n, w) { var stem = w.replace(/(ing|ed|es|s)$/, ''); return n + (title.indexOf(stem) !== -1 ? 3 : hay.indexOf(stem) !== -1 ? 1 : 0); }, 0);
      };
      list.innerHTML = '';
      var groups = [];
      var shown = data.playbook.map(function (p) { return { p: p, sc: score(p) }; }).filter(function (x) { return x.sc > 0; });
      shown.sort(function (a, b) { return b.sc - a.sc; });
      shown.forEach(function (x) { if (groups.indexOf(x.p.group) === -1) groups.push(x.p.group); });
      if (!groups.length) { list.appendChild(el('p', { class: 'admin-empty', text: 'Nothing found. Ask the admin assistant instead.' })); return; }
      groups.forEach(function (g) {
        list.appendChild(el('h2', { class: 'admin-h2', text: g }));
        shown.filter(function (x) { return x.p.group === g; }).map(function (x) { return x.p; }).forEach(function (p) {
          var d = el('details', { class: 'admin-card pb-item', open: Boolean(qv) }, [el('summary', { text: p.title })]);
          if (p.check.length) { d.appendChild(el('h3', { text: 'Check first' })); d.appendChild(el('ul', { class: 'admin-mini' }, p.check.map(function (t) { return el('li', { text: t }); }))); }
          d.appendChild(el('h3', { text: 'What to do' }));
          d.appendChild(el('ol', { class: 'admin-mini' }, p.steps.map(function (t) { return el('li', { text: t }); })));
          if (p.reply) {
            var rep = el('p', { class: 'mk-caption', text: fillReply(p.reply) });
            d.appendChild(el('h3', { text: 'Ready reply' }));
            d.appendChild(rep);
            d.appendChild(el('div', { class: 'admin-actions' }, [
              el('button', { class: 'admin-btn', type: 'button', text: 'Copy reply', onclick: function (e) { copyText(fillReply(p.reply), 'Reply', e.currentTarget); } }),
              el('a', { class: 'admin-btn admin-btn--wa', target: '_blank', rel: 'noopener', text: 'Open in WhatsApp', href: 'https://wa.me/?text=' + encodeURIComponent(fillReply(p.reply)) })
            ]));
            if (/\{[a-z_]+\}/.test(fillReply(p.reply))) d.appendChild(el('p', { class: 'admin-hint', text: 'Replace the {…} part before sending (e.g. the link from their client card).' }));
          }
          list.appendChild(d);
        });
      });
    }
    search.addEventListener('input', function () { state.pbQuery = search.value; draw(); });
    who.addEventListener('input', function () { state.pbName = who.value; draw(); });
    api('POST', { action: 'mk_playbook' }).then(function (j) {
      data = j;
      policyBox.appendChild(el('details', { class: 'admin-card' }, [el('summary', { text: 'Your policies (also on the Terms page and known by both assistants)' }),
        el('ul', { class: 'admin-mini' }, [['Instalments', j.policy.instalments], ['Discounts', j.policy.discounts], ['Quiet customers', j.policy.quiet], ['What we don’t build', j.policy.wontBuild]].map(function (x) {
          return el('li', null, [el('b', { text: x[0] + ': ' }), x[1]]);
        }))]));
      draw();
    }).catch(fail);
  }

  // ===================== Staff: Settings → Staff (owner) and My access (staff) =====================
  var PERM_INFO = {
    customers: ['Customers', 'Add customers, update details, status (not Won), follow-up dates and notes; answer website questions; reviews'],
    changes: ['Change requests', 'Change requests (incl. Do it with AI and previews), send customers their Manage link, visitor reports'],
    marketing: ['Marketing', 'Ready ads, picture and video maker, AI captions, showcase, referrals'],
    money: ['Money', 'Quotes, invoices, receipts, payments, Won status, renewals, monthly/yearly services, ad spend'],
    build: ['Build and publish', 'Website text, AI design, previews, project stage, go live, publish, pause, restore']
  };
  var PERM_PRESETS = [['support', 'Customer support', ['customers', 'changes', 'marketing']], ['manager', 'Manager (everything except settings)', ['customers', 'changes', 'marketing', 'money', 'build']], ['marketing', 'Marketing only', ['marketing']]];
  function ownerWa() { return String((state.settings && state.settings.owner_whatsapp) || '2348112999073').replace(/\D/g, ''); }
  function staffSettings(view) {
    var card = el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Staff accounts' }),
      el('p', { class: 'admin-hint', text: 'Give someone their own login with limited access (for example while you’re away). They log in at sirraddo.com.ng/staff (their own login page, not yours) with their username and a temporary password, then choose their own. Settings, offers, emails, backups, staff and deleting stay yours only. Everything they change is listed below.' })]);
    var name = el('input', { placeholder: 'Their name', maxlength: 80 });
    var uname = el('input', { placeholder: 'e.g. tunde', autocapitalize: 'none', spellcheck: 'false', maxlength: 60 });
    var unameTouched = false;
    uname.addEventListener('input', function () { unameTouched = true; });
    name.addEventListener('input', function () { if (!unameTouched) uname.value = String(name.value.trim().split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z0-9._-]/g, ''); });
    var phone = el('input', { placeholder: 'Their WhatsApp number', inputmode: 'tel' });
    var preset = select(PERM_PRESETS.map(function (p) { return [p[0], p[1]]; }), 'support', { 'aria-label': 'Role' });
    var boxes = {};
    var perms = el('div', { class: 'perm-list' }, Object.keys(PERM_INFO).map(function (k) {
      boxes[k] = el('input', { type: 'checkbox' });
      return el('label', null, [boxes[k], el('span', null, [el('b', { text: PERM_INFO[k][0] }), ' · ' + PERM_INFO[k][1]])]);
    }));
    function setPreset() { var p = PERM_PRESETS.filter(function (x) { return x[0] === preset.value; })[0]; Object.keys(boxes).forEach(function (k) { boxes[k].checked = p[2].indexOf(k) !== -1; }); }
    preset.addEventListener('change', setPreset); setPreset();
    var shown = el('div');
    var owa = el('input', { value: (state.settings && state.settings.owner_whatsapp) || '2348112999073', inputmode: 'tel' });
    [field('Name', name), field('Username', uname, 'What they type to log in (letters and numbers; an email address works too). Must be different for each person.'), field('WhatsApp', phone), field('Role', preset, 'Start from a role, then tick or untick'), perms].forEach(function (x) { card.appendChild(x); });
    function showPassword(st, password, days) {
      shown.innerHTML = '';
      var url = location.origin + '/staff';
      var msg = 'Hello ' + st.name.split(' ')[0] + ', here is your SIRRADDO admin login.\nPage: ' + url + '\nUsername: ' + st.username + '\nTemporary password: ' + password + '\nIt works for ' + (days || 3) + ' days. When you log in, you\u2019ll choose your own password. Keep it private. Then open "My access" to see what you can do.';
      var num = String(st.phone || '').replace(/\D/g, '').replace(/^0/, '234');
      shown.appendChild(el('div', { class: 'admin-card' }, [el('h3', { text: 'Login for ' + st.name }), el('p', { class: 'admin-meta', text: 'Username: ' + st.username }),
        el('p', { class: 'admin-label', text: 'Temporary password (shown once)' }), el('p', { class: 'staff-pass', text: password }),
        el('p', { class: 'admin-hint', text: 'Send it privately on WhatsApp. It works for ' + (days || 3) + ' days; they must choose their own password when they first log in. You can\u2019t see it again: use "Reset password" if it\u2019s lost.' }),
        el('div', { class: 'admin-actions' }, [
          el('button', { class: 'admin-btn', type: 'button', text: 'Copy password', onclick: function (e) { copyText(password, 'Password', e.currentTarget); } }),
          num ? el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'Send login on WhatsApp' }) : null])]));
      shown.scrollIntoView({ behavior: 'smooth' });
    }
    card.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Add staff', onclick: function () {
      api('POST', { action: 'staff_add', staff: { name: name.value, username: uname.value, phone: phone.value, perms: Object.keys(boxes).filter(function (k) { return boxes[k].checked; }) } })
        .then(function (j) { name.value = phone.value = uname.value = ''; unameTouched = false; flash('Staff added'); showPassword(j.staff, j.password, j.temp_days); drawList(j.staff_list); }).catch(fail);
    } }));
    card.appendChild(shown);
    card.appendChild(field('Your WhatsApp (staff tap "Message the owner")', owa));
    card.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Save number', onclick: function () {
      api('POST', { action: 'settings', settings: { owner_whatsapp: owa.value.replace(/\D/g, '').replace(/^0/, '234') } }).then(function (j) { state.settings = j.settings; flash('Saved'); }).catch(fail);
    } }));
    view.appendChild(card);
    view.appendChild(awayCard());
    var listBox = el('div'), logBox = el('div');
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Staff' })); view.appendChild(listBox);
    view.appendChild(el('h2', { class: 'admin-h2', text: 'What staff did (latest first)' })); view.appendChild(logBox);
    function drawList(list) {
      listBox.innerHTML = '';
      if (!list.length) { listBox.appendChild(el('p', { class: 'admin-empty', text: 'No staff yet.' })); return; }
      list.forEach(function (st) {
        var cb = {};
        var c = el('div', { class: 'admin-card' }, [el('h3', { text: st.name + (st.active ? '' : ' (switched off)') }),
          el('p', { class: 'admin-meta', text: 'Username: ' + st.username + ' · ' + (st.phone || 'no number') + ' · last seen ' + (st.last_seen_at ? when(st.last_seen_at) : 'never') }),
          st.must_change ? el('p', { class: 'admin-meta' }, [badge(st.temp_expires && Date.parse(st.temp_expires) < Date.now() ? 'Temporary password expired' : 'Waiting to choose their password', st.temp_expires && Date.parse(st.temp_expires) < Date.now() ? 'is-due' : 'is-new'),
            st.temp_expires && Date.parse(st.temp_expires) >= Date.now() ? ' Temporary password works until ' + when(st.temp_expires) : ' Tap "Reset password" to send a new one.']) : null]);
        c.appendChild(el('div', { class: 'perm-list' }, Object.keys(PERM_INFO).map(function (k) {
          cb[k] = el('input', { type: 'checkbox' }); cb[k].checked = st.perms.indexOf(k) !== -1;
          cb[k].addEventListener('change', function () {
            api('POST', { action: 'staff_update', staff_id: st.id, staff: { perms: Object.keys(cb).filter(function (x) { return cb[x].checked; }) } }).then(function (j) { flash('Access updated'); drawList(j.staff); }).catch(fail);
          });
          return el('label', null, [cb[k], el('span', { text: PERM_INFO[k][0] })]);
        })));
        c.appendChild(el('div', { class: 'admin-actions' }, [
          el('button', { class: 'admin-btn', type: 'button', text: st.active ? 'Switch off' : 'Switch on', onclick: function () {
            api('POST', { action: 'staff_update', staff_id: st.id, staff: { active: !st.active } }).then(function (j) { flash(st.active ? 'Switched off: they are logged out' : 'Switched on'); drawList(j.staff); }).catch(fail);
          } }),
          el('button', { class: 'admin-btn', type: 'button', text: 'Change username', onclick: function () {
            var u = window.prompt('New username for ' + st.name + ' (they log in with it at /staff):', st.username);
            if (!u || u === st.username) return;
            api('POST', { action: 'staff_update', staff_id: st.id, staff: { username: u } }).then(function (j) { flash('Username changed. Tell them on WhatsApp.'); drawList(j.staff); }).catch(fail);
          } }),
          el('button', { class: 'admin-btn', type: 'button', text: 'Reset password', onclick: function () {
            if (!window.confirm('Reset ' + st.name + '\u2019s password? They get a temporary one (send it on WhatsApp), are logged out everywhere, and must choose a new password when they log in.')) return;
            api('POST', { action: 'staff_reset', staff_id: st.id }).then(function (j) { showPassword(j.staff, j.password, j.temp_days); drawList(j.staff_list); }).catch(fail);
          } }),
          el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Remove', onclick: function () {
            if (!window.confirm('Remove ' + st.name + '? Their login stops working. (What they did stays in the list below.)')) return;
            api('POST', { action: 'staff_delete', staff_id: st.id }).then(function (j) { flash('Removed'); drawList(j.staff); }).catch(fail);
          } })
        ]));
        listBox.appendChild(c);
      });
    }
    api('POST', { action: 'staff_list' }).then(function (j) {
      drawList(j.staff);
      logBox.appendChild(j.log.length ? el('ul', { class: 'admin-mini' }, j.log.map(function (l) {
        return el('li', null, [el('b', { text: l.staff_name }), ' · ' + l.what + (l.customer ? ' · ' + l.customer : '') + ' · ' + when(l.at)]);
      })) : el('p', { class: 'admin-empty', text: 'Nothing yet.' }));
    }).catch(fail);
  }

  // Staff: choose a new password (compulsory after a temporary one; also from My access at any time).
  function passwordForm(forced, done) {
    var cur = el('input', { type: 'password', autocomplete: 'current-password' });
    var p1 = el('input', { type: 'password', autocomplete: 'new-password' });
    var p2 = el('input', { type: 'password', autocomplete: 'new-password' });
    var err = el('p', { class: 'admin-error', role: 'alert' });
    if (forced && typedPw) cur.value = typedPw;
    var show = el('input', { type: 'checkbox' });
    show.addEventListener('change', function () { [cur, p1, p2].forEach(function (x) { x.type = show.checked ? 'text' : 'password'; }); });
    var btn = el('button', { class: 'btn btn--navy', type: 'submit', text: 'Save my new password' });
    var form = el('form', { class: 'admin-card admin-settings' }, [
      (forced && typedPw) ? null : field(forced ? 'Temporary password (from the owner)' : 'Current password', cur),
      field('New password', p1, 'At least 8 characters, with letters and a number. Don’t reuse a password from another site.'),
      field('Type it again', p2),
      el('label', { class: 'admin-check' }, [show, ' Show passwords']),
      btn, err]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      if (p1.value !== p2.value) { err.textContent = 'The two new passwords are not the same.'; return; }
      btn.disabled = true;
      api('POST', { action: 'my_password', current: cur.value, password: p1.value, remember: Boolean(state.remember || (function () { try { return localStorage.getItem(LONG); } catch (x) { return null; } })()) }).then(function (j) {
        password = j.token; typedPw = null;
        try { if (localStorage.getItem(LONG)) localStorage.setItem(LONG, j.token); else sessionStorage.setItem(KEY, j.token); } catch (x) { /* ignore */ }
        flash('Password changed'); done();
      }).catch(function (e2) { btn.disabled = false; err.textContent = e2.message; });
    });
    return form;
  }
  function renderMustChange(view) {
    var me = state.me || {};
    view.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Welcome, ' + String(me.name || '').split(' ')[0] + '. Choose your own password' }),
      el('p', { class: 'admin-hint', text: 'You logged in with a temporary password from the owner. Before you start, choose a password only you know. Your username stays: ' + (me.username || '') + '.' })]));
    view.appendChild(passwordForm(true, function () { load().then(function () { setTab('access'); }); }));
  }

  // Company documents (Playbook → formal quote / tender): CAC certificate, TIN, SCUML, letter of introduction… kept
  // here so they can be sent on WhatsApp or by email in one tap. Anyone with a document's link can open it.
  function companyDocs(view) {
    var card = el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Company documents' }),
      el('p', { class: 'admin-hint', text: 'For companies, banks and tenders: upload PDFs (or photos) of your CAC certificate, TIN / tax clearance, SCUML certificate, letter of introduction, etc. Each gets a private link to send. Anyone with the link can open it, so send it only to the company asking. Max 4 MB each.' })]);
    var title = el('input', { placeholder: 'Name, e.g. CAC certificate', maxlength: 80 });
    var file = el('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png' });
    var list = el('div');
    function draw(docs) {
      list.textContent = '';
      if (!docs.length) { list.appendChild(el('p', { class: 'admin-empty', text: 'No documents yet.' })); return; }
      docs.forEach(function (d) {
        var msg = 'Hello, please find our ' + d.title + ' here: ' + d.url + '\nSIRRADDO GLOBAL LIMITED (RC 9939920)';
        list.appendChild(el('div', { class: 'admin-card' }, [el('h3', { text: d.title }), el('p', { class: 'admin-meta', text: 'Added ' + when(d.at) }),
          el('div', { class: 'admin-actions' }, [
            el('a', { class: 'admin-btn', href: d.url, target: '_blank', rel: 'noopener', text: 'Open' }),
            el('button', { class: 'admin-btn', type: 'button', text: 'Copy link', onclick: function (e) { copyText(d.url, 'Link', e.currentTarget); } }),
            el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'Send on WhatsApp' }),
            el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Remove', onclick: function () {
              if (!window.confirm('Remove ' + d.title + '?')) return;
              api('POST', { action: 'company_doc_remove', url: d.url }).then(function (j) { draw(j.docs); flash('Removed'); }).catch(fail);
            } })])]));
      });
    }
    card.appendChild(field('Document name', title));
    card.appendChild(field('File (PDF, JPG or PNG)', file));
    card.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Upload', onclick: function (e) {
      var f = file.files && file.files[0], b = e.currentTarget;
      if (!f) { fail(new Error('Choose a file')); return; }
      if (f.size > 4 * 1024 * 1024) { fail(new Error('That file is too big (max 4 MB). Compress the PDF first.')); return; }
      b.disabled = true;
      var rd = new FileReader();
      rd.onload = function () {
        api('POST', { action: 'company_doc_add', title: title.value || f.name.replace(/\.[^.]+$/, ''), type: f.type, data: String(rd.result).split(',')[1] })
          .then(function (j) { b.disabled = false; title.value = ''; file.value = ''; draw(j.docs); flash('Uploaded'); }).catch(function (er) { b.disabled = false; fail(er); });
      };
      rd.readAsDataURL(f);
    } }));
    view.appendChild(card);
    view.appendChild(list);
    api('POST', { action: 'company_docs' }).then(function (j) { draw(j.docs); }).catch(fail);
  }

  // Away mode: staff become the first contact; the website says replies may be slower (never that you're away).
  function awayInfo() {
    var u = state.settings && state.settings.away_until;
    return u && u >= today() ? { until: u, web: state.settings.away_web !== '0' } : null;
  }
  function awayCard() {
    var a = awayInfo();
    var until = el('input', { type: 'date', min: today(), value: a ? a.until : '' });
    var web = el('input', { type: 'checkbox' }); web.checked = !a || a.web;
    function save(v) {
      api('POST', { action: 'settings', settings: { away_until: v, away_web: web.checked ? '1' : '0' } }).then(function (j) { state.settings = j.settings; flash(v ? 'Away mode on until ' + niceDay(v) : 'Away mode off'); render(); }).catch(fail);
    }
    return el('div', { class: 'admin-card admin-settings' + (a ? ' admin-callout' : '') }, [el('h2', { text: a ? 'Away mode is ON until ' + niceDay(a.until) : 'Away mode' }),
      el('p', { class: 'admin-hint', text: 'Going away? Staff see a banner saying they are the first contact, and their assistant tells them what to handle and what to send you. The website chat says the team is answering and replies may take a little longer (it never says you are away). It switches off by itself after the last day.' }),
      field('Away until (last day)', until),
      el('label', { class: 'admin-check' }, [web, ' Also show "Replies may take a little longer" on the website']),
      el('div', { class: 'admin-actions' }, [
        el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: a ? 'Save' : 'Turn on away mode', onclick: function () { if (!until.value) { fail(new Error('Choose your last day away')); return; } save(until.value); } }),
        a ? el('button', { class: 'admin-btn', type: 'button', text: 'I\u2019m back: turn off', onclick: function () { save(''); } }) : null])]);
  }

  // Staff → My access: what this account can do, step-by-step guides, and when to hand over to the owner.
  var ACCESS_GUIDES = {
    view: [['See today’s work', ['Dashboard shows follow-ups due, new requests and website questions.', 'Tap a name to open the customer.']],
      ['Find the right reply for a situation', ['Open Playbook and search (e.g. "refund", "not opening", "domain").', 'Type the customer’s first name, tap Copy reply or Open in WhatsApp.', 'If the steps need something your account can’t do, message the owner (button below).']],
      ['Ask for help', ['Open Assistant and describe the situation in your own words, e.g. "a customer says their website isn’t opening".', 'Pick the customer in the About box for advice about that job.']]],
    customers: [['Reply to a new request', ['Requests → open the newest one and read what they need.', 'Tap the WhatsApp message buttons (ready messages) and send.', 'Set Status to Contacted and a Follow up on date (Tomorrow / In 3 days).']],
      ['Follow up', ['Dashboard → Follow up today → open each one.', 'Send the follow-up message, then move the follow-up date on, or set Lost with a note if they said no.']],
      ['Add a customer who messaged on WhatsApp', ['Requests → Add a customer: name, phone, package, How did they find us?, what they need.', 'Then reply and set a follow-up date.']],
      ['Answer a website question', ['Questions → read the question → type the answer (the chat learns it).']]],
    changes: [['Handle a change request', ['Clients → the customer → After launch → Show change requests.', 'Tap Do it with AI (or wait: it is often ready already). Check the list of edits.', 'Open preview to check, then Send preview on WhatsApp. The customer taps "Put these changes live".', 'If the AI couldn\u2019t do something (e.g. a new design, fonts or layout), message the owner. New colours the AI can do.']],
      ['A request that came on WhatsApp', ['Show change requests → Add a request from WhatsApp → paste what they asked → Do it with AI.']],
      ['Customer lost their Manage link', ['Client → Manage my website → copy their link and send it privately on WhatsApp.', 'If it may have leaked, ask the owner to make a new one.']]],
    marketing: [['Post today’s ad', ['Marketing → Today → Share (phone) or Download, then paste the caption.', 'Tick "I posted today".']],
      ['Captions in Pidgin or Yoruba', ['Any ad → Write captions with AI → choose the language → Copy.']],
      ['Make a video', ['Marketing → Video maker → type the idea → Write the video → check the lines → Make the video (keep the screen on) → Share.']]],
    money: [['Send an invoice', ['Client card → Documents → Invoice → send on WhatsApp.']], ['Record a transfer', ['Client card → Payments → add the amount and date.']]],
    build: [['Update a live website', ['Client → Go live → Update live site after a change.', 'Something broke? Restore previous version.']]]
  };
  function renderAccess(view) {
    var me = state.me || {};
    var aw = awayInfo();
    if (aw) view.appendChild(el('div', { class: 'admin-card admin-callout' }, [el('strong', { text: 'The owner is away until ' + niceDay(aw.until) + '. You are the first contact for customers.' }),
      el('p', { class: 'admin-hint', text: 'Reply quickly and kindly. Do what your account allows; for everything else tell the customer the team will get back to them. Message the owner only for urgent things: money, an angry customer, or a website that is down. Never tell customers the owner is away.' })]));
    view.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Welcome, ' + String(me.name || '').split(' ')[0] }),
      el('p', { class: 'admin-hint', text: 'This is what your account can do, with step-by-step guides. If something isn’t here, your account can’t do it: message the owner.' }),
      el('div', { class: 'admin-actions' }, [
        el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + ownerWa() + '?text=' + encodeURIComponent('Hello Ridwan, it’s ' + me.name + ' from admin. I need your help with: '), target: '_blank', rel: 'noopener', text: 'Message the owner' }),
        el('button', { class: 'admin-btn', type: 'button', text: 'Ask the assistant', onclick: function () { setTab('assistant'); } }),
        el('button', { class: 'admin-btn', type: 'button', text: 'Open the Playbook', onclick: function () { setTab('playbook'); } })])]));
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Your account can' }));
    view.appendChild(el('ul', { class: 'admin-mini' }, [el('li', { text: 'See requests, clients, website questions, chats, the Playbook and the assistant' })].concat(Object.keys(PERM_INFO).filter(function (k) { return canDo(k); }).map(function (k) {
      return el('li', null, [el('b', { text: PERM_INFO[k][0] + ': ' }), PERM_INFO[k][1]]);
    }))));
    var not = Object.keys(PERM_INFO).filter(function (k) { return !canDo(k); });
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Ask the owner for' }));
    view.appendChild(el('ul', { class: 'admin-mini' }, not.map(function (k) { return el('li', null, [el('b', { text: PERM_INFO[k][0] + ': ' }), PERM_INFO[k][1]]); }).concat([
      el('li', { text: 'Refunds, discounts or price changes; angry or legal complaints; copyright or data-deletion requests; a new design, fonts or layout; company documents for tenders; anything about passwords or keys; settings, offers, emails and backups; deleting anything. The Playbook has a page for each.' })])));
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Step by step' }));
    ['view'].concat(Object.keys(PERM_INFO).filter(function (k) { return canDo(k); })).forEach(function (k) {
      (ACCESS_GUIDES[k] || []).forEach(function (g) {
        view.appendChild(el('details', { class: 'admin-card pb-item' }, [el('summary', { text: g[0] }), el('ol', { class: 'admin-mini' }, g[1].map(function (t) { return el('li', { text: t }); }))]));
      });
    });
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Your login' }));
    view.appendChild(el('p', { class: 'admin-hint', text: 'Username: ' + (me.username || '') + '. Forgot your password? Ask the owner to reset it: you get a temporary one and choose a new one when you log in.' }));
    view.appendChild(el('details', { class: 'admin-card pb-item' }, [el('summary', { text: 'Change my password' }), passwordForm(false, function () { render(); })]));
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Golden rules' }));
    view.appendChild(el('ul', { class: 'admin-mini' }, ['Reply to customers within an hour during the day, politely, in their language.', 'Never ask customers for passwords, card numbers or Paystack keys.', 'Never share one customer’s details with another.', 'Never promise prices, discounts or dates that aren’t in the Playbook policies.', 'Not sure? Ask the assistant, then the owner.'].map(function (t) { return el('li', { text: t }); })));
  }

  // ===================== Marketing =====================
  // Tabs: Today (what to post), Ready ads, Showcase, Review cards, Festive, Offer, Referrals, Ad spend.
  // Pictures for Showcase / Review cards / Festive / Offer are drawn here in the browser (canvas), with a tagged QR.
  var MKC = { navy: '#13244F', deep: '#0C1733', gold: '#D9A21B', soft: '#C9D1E6', dim: '#AEB8D3' };
  var MK_TABS = [['today', 'Today'], ['ads', 'Ready ads'], ['video', 'Video maker'], ['showcase', 'Showcase'], ['reviews', 'Review cards'], ['festive', 'Festive'], ['offer', 'Offer'], ['referrals', 'Referrals'], ['agents', 'Agents'], ['spend', 'Ad spend']];
  var LINKS_URL = 'https://www.sirraddo.com.ng/links';
  var MK_PERM = { festive: 'owner', offer: 'owner', spend: 'money' };
  function renderMarketing(view) {
    var tabs = MK_TABS.filter(function (t) { return !MK_PERM[t[0]] || (MK_PERM[t[0]] === 'owner' ? isOwner() : canDo(MK_PERM[t[0]])); });
    var tab = state.mkTab || 'today';
    if (!tabs.some(function (t) { return t[0] === tab; })) tab = 'today';
    view.appendChild(el('div', { class: 'admin-tabs admin-subtabs', role: 'group', 'aria-label': 'Marketing' }, tabs.map(function (t) {
      return el('button', { type: 'button', 'aria-pressed': t[0] === tab ? 'true' : 'false', text: t[1], onclick: function () { state.mkTab = t[0]; render(); } });
    })));
    ({ today: mkToday, ads: mkReadyAds, video: mkVideoMaker, showcase: mkShowcase, reviews: mkReviewCards, festive: mkFestive, offer: mkOffer, referrals: mkReferrals, agents: mkAgents, spend: mkSpend })[tab](view);
  }

  // ---------- Ready ads (pictures, videos, flyers) ----------
  function adCard(ad) {
    var url = '/assets/marketing/' + ad.file + '?v=' + MK_V;
    var actions = el('div', { class: 'admin-actions' });
    if (navigator.canShare && window.File && !ad.pdf) actions.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Share', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true;
      if (navigator.clipboard) navigator.clipboard.writeText(ad.caption).catch(function () {});
      fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
        return shareFile(new File([blob], 'sirraddo-' + ad.file, { type: /\.mp4$/.test(ad.file) ? 'video/mp4' : 'image/jpeg' }), ad.caption);
      }).catch(function (err) { if (err && err.name !== 'AbortError') fail(err); }).then(function () { b.disabled = false; });
    } }));
    if (ad.pdf) actions.appendChild(el('a', { class: 'admin-btn admin-btn--primary', href: '/assets/marketing/' + ad.pdf + '?v=' + MK_V, download: 'sirraddo-' + ad.pdf, text: 'Download PDF for printing' }));
    actions.appendChild(el('a', { class: 'admin-btn', href: url, download: 'sirraddo-' + ad.file, text: ad.pdf ? 'Download picture' : 'Download' }));
    if (!ad.pdf) actions.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy caption', onclick: function (e) { copyText(ad.caption, 'Caption', e.currentTarget); } }));
    var card = el('article', { class: 'admin-card mk-card' }, [
      ad.poster ? el('video', { src: url, poster: '/assets/marketing/' + ad.poster + '?v=' + MK_V, controls: true, playsinline: true, muted: true, preload: 'none', class: 'mk-img' })
        : el('img', { src: url, alt: ad.title, loading: 'lazy', class: 'mk-img' }),
      el('h3', { text: ad.title }),
      el('p', { class: 'admin-meta', text: ad.size }),
      el('p', { class: 'mk-caption', text: ad.caption }),
      actions
    ]);
    if (!ad.pdf) card.appendChild(captionBox(ad.title + ': ' + ad.caption.replace(/👉.*$/, ''), (ad.caption.match(/https:\/\/\S+/) || [LINKS_URL])[0]));
    return card;
  }
  function shareFile(file, caption) {
    var data = { files: [file], text: caption };
    if (!navigator.canShare(data)) data = { files: [file] };
    if (!navigator.canShare(data)) return Promise.reject(new Error('This device can’t share this file. Use Download instead.'));
    return navigator.share(data).then(function () { flash('Shared. The caption is copied: paste it in.'); });
  }
  function mkReadyAds(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'Ready-made ads. On your phone, Share opens WhatsApp, Instagram, TikTok or Facebook with the file ready (the caption is copied: paste it in). Videos have no music: add a sound from the app’s own library when you post (it’s licensed there).' }));
    var groups = [['story', 'Status & Story'], ['video', 'Videos'], ['square', 'Square posts'], ['banner', 'Banner'], ['print', 'Flyers (print)']];
    var pickAd = state.adsTab || 'story';
    view.appendChild(el('div', { class: 'admin-tabs admin-subtabs', role: 'group', 'aria-label': 'Ad types' }, groups.map(function (g) {
      var n = ADS.filter(function (a) { return a.group === g[0]; }).length;
      return el('button', { type: 'button', 'aria-pressed': g[0] === pickAd ? 'true' : 'false', text: g[1] + ' (' + n + ')', onclick: function () { state.adsTab = g[0]; render(); } });
    })));
    view.appendChild(el('div', { class: 'mk-grid' }, ADS.filter(function (a) { return a.group === pickAd; }).map(adCard)));
    view.appendChild(el('p', { class: 'admin-hint', text: 'Every QR code and caption link is tagged, so Dashboard → "Where customers come from" shows which ad brought each customer. To change wording or prices, ask Claude to update scripts/make-marketing.mjs and scripts/make-videos.mjs.' }));
  }

  // ---------- AI captions (English, Pidgin, Yoruba, Hausa, Igbo) ----------
  function captionBox(topic, link) {
    var box = el('details', { class: 'mk-cap' }, [el('summary', { text: '✨ Write captions with AI' })]);
    var lang = select(['English', 'Nigerian Pidgin', 'Yoruba', 'Hausa', 'Igbo'], state.mkLang || 'English', { 'aria-label': 'Language' });
    lang.addEventListener('change', function () { state.mkLang = lang.value; });
    var out = el('div');
    var go = el('button', { class: 'admin-btn', type: 'button', text: 'Write 3 captions', onclick: function () {
      go.disabled = true; go.textContent = 'Writing…'; out.innerHTML = '';
      api('POST', { action: 'mk_captions', topic: topic, lang: lang.value, link: link }).then(function (j) {
        j.captions.forEach(function (c) {
          out.appendChild(el('div', { class: 'mk-capt' }, [el('p', { text: c }), el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: 'Copy', onclick: function (e) { copyText(c, 'Caption', e.currentTarget); } })]));
        });
      }).catch(fail).then(function () { go.disabled = false; go.textContent = 'Write 3 more'; });
    } });
    box.appendChild(el('div', { class: 'admin-actions' }, [lang, go]));
    box.appendChild(out);
    return box;
  }

  // ---------- Picture maker (canvas) ----------
  function mkFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['800 60px Inter', '700 60px Inter', '500 60px Inter'].map(function (f) { return document.fonts.load(f).catch(function () {}); }));
  }
  function mkImg(src) {
    return new Promise(function (res) { if (!src) return res(null); var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; });
  }
  var qrCache = {};
  function mkQr(tag) {
    if (qrCache[tag]) return Promise.resolve(qrCache[tag]);
    return api('POST', { action: 'mk_qr', tag: tag }).then(function (j) {
      return mkImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(j.svg.replace('<svg ', '<svg width="600" height="600" '))).then(function (im) { qrCache[tag] = { img: im, url: j.url }; return qrCache[tag]; });
    });
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function font(c, weight, size) { c.font = weight + ' ' + size + 'px Inter, Arial, sans-serif'; }
  function bgFill(c, w, h, a, b, d) {
    var g = c.createRadialGradient(w, 0, 0, w, 0, Math.max(w, h) * 1.1);
    g.addColorStop(0, a || '#1B3170'); g.addColorStop(0.45, b || MKC.navy); g.addColorStop(1, d || MKC.deep);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function mkLogo(c, x, y, s, align) {
    var parts = [['SI', '#fff'], ['RR', MKC.gold], ['A', '#fff'], ['DD', MKC.gold], ['O', '#fff']];
    font(c, 800, 46 * s);
    var total = parts.reduce(function (a, p) { return a + c.measureText(p[0]).width; }, 0);
    var sx = align === 'center' ? x - total / 2 : x;
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    parts.forEach(function (p) { c.fillStyle = p[1]; c.fillText(p[0], sx, y); sx += c.measureText(p[0]).width; });
    font(c, 700, 12.5 * s); c.fillStyle = 'rgba(255,255,255,.85)';
    var gl = 'G L O B A L   L I M I T E D';
    c.fillText(gl, align === 'center' ? x - c.measureText(gl).width / 2 : x, y + 22 * s);
  }
  function wrapText(c, text, x, y, maxW, lh, maxLines, align) {
    var words = String(text || '').split(/\s+/), lines = [], line = '';
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    if (maxLines && lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    c.textAlign = align || 'left';
    lines.forEach(function (l, i) { c.fillText(l, x, y + i * lh); });
    c.textAlign = 'left';
    return y + lines.length * lh;
  }
  // Largest font size (from max down to min) at which the text fits in maxLines lines.
  function fitSize(c, text, weight, max, min, maxW, maxLines) {
    for (var s = max; s > min; s -= 2) {
      font(c, weight, s);
      var words = String(text || '').split(/\s+/), n = 1, line = '';
      for (var i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (c.measureText(t).width > maxW && line) { n++; line = words[i]; } else line = t; }
      if (n <= maxLines) return s;
    }
    return min;
  }
  // Largest size whose wrapped text fits in maxW wide and maxH tall (line height = size × lh).
  function fitBox(c, text, weight, max, min, maxW, maxH, lh) {
    for (var s = max; s > min; s -= 2) {
      font(c, weight, s);
      var words = String(text || '').split(/\s+/), n = 1, line = '';
      for (var i = 0; i < words.length; i++) { var t = line ? line + ' ' + words[i] : words[i]; if (c.measureText(t).width > maxW && line) { n++; line = words[i]; } else line = t; }
      if (n * s * lh <= maxH) return { size: s, lines: n };
    }
    return { size: min, lines: Math.max(1, Math.floor(maxH / (min * lh))) };
  }
  function footerTop(h, fmt) { return h - (fmt === 'story' ? 260 + 110 : 190 + 70); }
  function cover(c, img, x, y, w, h) {
    if (!img) return;
    var r = Math.max(w / img.width, h / img.height), iw = img.width * r, ih = img.height * r;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); c.restore();
  }
  function qrTile(c, q, x, y, size) {
    c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
    c.fillStyle = '#fff'; rr(c, x, y, size, size, size * 0.09); c.fill(); c.restore();
    if (q && q.img) c.drawImage(q.img, x + size * 0.07, y + size * 0.07, size * 0.86, size * 0.86);
  }
  function pill(c, text, cx, y, size, fill, color) {
    font(c, 800, size); var w = c.measureText(text).width + size * 1.4, h = size * 1.7;
    c.fillStyle = fill || MKC.gold; rr(c, cx - w / 2, y, w, h, h / 2); c.fill();
    c.fillStyle = color || MKC.deep; c.textAlign = 'center'; c.fillText(text, cx, y + h * 0.66); c.textAlign = 'left';
    return y + h;
  }
  function stars(c, n, x, y, size, align) {
    font(c, 800, size); var s = '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
    c.fillStyle = MKC.gold; c.textAlign = align || 'left'; c.fillText(s, x, y); c.textAlign = 'left';
  }
  // A picture with Story / Square switch, Share, Download and AI captions.
  function mkOutput(title, draw, tag, topic) {
    var fmt = state.mkFmt || 'story';
    var canvas = el('canvas', { class: 'mk-canvas' });
    var box = el('article', { class: 'admin-card mk-card' });
    var sw = el('div', { class: 'admin-tabs admin-subtabs', role: 'group', 'aria-label': 'Size' });
    var status = el('p', { class: 'admin-hint', text: 'Drawing…' });
    function paint() {
      var w = 1080, h = fmt === 'story' ? 1920 : 1080;
      canvas.width = w; canvas.height = h;
      status.textContent = 'Drawing…';
      return mkFonts().then(function () { return mkQr(tag); }).then(function (q) { return draw(canvas.getContext('2d'), w, h, q, fmt); })
        .then(function () { status.textContent = (fmt === 'story' ? 'Status / Story / Reels (1080 × 1920)' : 'Post (1080 × 1080)') + ' · QR tagged "' + tag + '"'; })
        .catch(function (e) { status.textContent = 'Could not draw: ' + e.message; });
    }
    [['story', 'Status / Story'], ['square', 'Square post']].forEach(function (f) {
      sw.appendChild(el('button', { type: 'button', 'aria-pressed': f[0] === fmt ? 'true' : 'false', text: f[1], onclick: function (e) {
        fmt = state.mkFmt = f[0]; Array.prototype.forEach.call(sw.children, function (b) { b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); }); paint();
      } }));
    });
    var name = 'sirraddo-' + tag + '.jpg';
    function blob() { return new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', 0.92); }); }
    var acts = el('div', { class: 'admin-actions' });
    if (navigator.canShare && window.File) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Share', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true;
      blob().then(function (bl) { return shareFile(new File([bl], name, { type: 'image/jpeg' }), ''); }).catch(function (err) { if (err && err.name !== 'AbortError') fail(err); }).then(function () { b.disabled = false; });
    } }));
    acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Download', onclick: function () {
      blob().then(function (bl) { var a = el('a', { href: URL.createObjectURL(bl), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); });
    } }));
    [el('h3', { text: title }), sw, canvas, status, acts, captionBox(topic, 'https://www.sirraddo.com.ng/websites?utm_source=post&utm_campaign=' + tag)].forEach(function (x) { box.appendChild(x); });
    paint();
    return box;
  }
  function footerQr(c, w, h, q, fmt, line) {
    var size = fmt === 'story' ? 260 : 190, y = h - size - (fmt === 'story' ? 110 : 70);
    qrTile(c, q, 84, y, size);
    font(c, 800, fmt === 'story' ? 52 : 40); c.fillStyle = '#fff';
    c.fillText(line || 'Want a website?', 84 + size + 40, y + size * 0.36);
    font(c, 800, fmt === 'story' ? 50 : 40); c.fillStyle = MKC.gold;
    c.fillText('sirraddo.com.ng', 84 + size + 40, y + size * 0.36 + (fmt === 'story' ? 70 : 54));
    font(c, 600, fmt === 'story' ? 32 : 26); c.fillStyle = MKC.soft;
    c.fillText('WhatsApp 0816 755 0937', 84 + size + 40, y + size * 0.36 + (fmt === 'story' ? 124 : 96));
  }

  // ---------- Showcase: "We built this" ----------
  function drawPhone(c, d, imgs, x, y, pw, ph) {
    c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 50; c.shadowOffsetY = 20;
    c.fillStyle = '#1E2A4A'; rr(c, x, y, pw, ph, pw * 0.11); c.fill(); c.restore();
    var b = pw * 0.025, sx = x + b, sy = y + b, sw = pw - 2 * b, sh = ph - 2 * b;
    c.save(); rr(c, sx, sy, sw, sh, pw * 0.095); c.clip();
    c.fillStyle = '#F5F6FA'; c.fillRect(sx, sy, sw, sh);
    var hh = sh * 0.085; c.fillStyle = d.primary; c.fillRect(sx, sy, sw, hh);
    var u = sw / 100;
    if (imgs.logo) { var lh = hh * 0.6, lw = Math.min(sw * 0.35, imgs.logo.width * lh / imgs.logo.height); c.drawImage(imgs.logo, sx + 6 * u, sy + (hh - lh) / 2, lw, lh); }
    else { font(c, 800, 5 * u); c.fillStyle = '#fff'; wrapText(c, d.name, sx + 6 * u, sy + hh * 0.62, sw * 0.8, 6 * u, 1); }
    var heroH = sh * 0.36, hy = sy + hh;
    if (imgs.hero) { cover(c, imgs.hero, sx, hy, sw, heroH); c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(sx, hy, sw, heroH); }
    else { c.fillStyle = d.primary; c.fillRect(sx, hy, sw, heroH); }
    font(c, 800, 7.2 * u); c.fillStyle = '#fff';
    var ty = wrapText(c, d.headline || d.name, sx + 6 * u, hy + heroH * 0.34, sw * 0.86, 8.4 * u, 2);
    font(c, 500, 4 * u); c.fillStyle = 'rgba(255,255,255,.9)';
    ty = wrapText(c, d.tagline, sx + 6 * u, ty + 2 * u, sw * 0.86, 5.2 * u, 2);
    font(c, 800, 4 * u); var bt = d.kind === 'store' ? 'Shop now' : 'Contact us', bw = c.measureText(bt).width + 8 * u;
    c.fillStyle = d.accent; rr(c, sx + 6 * u, ty + 2 * u, bw, 10 * u, 5 * u); c.fill();
    c.fillStyle = d.accentText || '#111'; c.fillText(bt, sx + 10 * u, ty + 8.6 * u);
    var py = hy + heroH + 5 * u;
    if (d.products && d.products.length) {
      var gw = (sw - 15 * u) / 2, gh = gw * 1.25;
      d.products.slice(0, 4).forEach(function (p, i) {
        var gx = sx + 5 * u + (i % 2) * (gw + 5 * u), gy = py + Math.floor(i / 2) * (gh + 4 * u);
        c.fillStyle = '#fff'; rr(c, gx, gy, gw, gh, 3 * u); c.fill();
        c.save(); rr(c, gx, gy, gw, gh * 0.62, 3 * u); c.clip();
        if (imgs.products[i]) cover(c, imgs.products[i], gx, gy, gw, gh * 0.62); else { c.fillStyle = '#E3E7F0'; c.fillRect(gx, gy, gw, gh * 0.62); }
        c.restore();
        font(c, 700, 3.6 * u); c.fillStyle = '#13244F'; wrapText(c, p.name, gx + 3 * u, gy + gh * 0.62 + 6 * u, gw - 6 * u, 4.4 * u, 1);
        font(c, 800, 3.6 * u); c.fillStyle = '#0E7C3A'; c.fillText(p.price ? (/^[\d,.]+$/.test(p.price) ? '₦' + Number(String(p.price).replace(/,/g, '')).toLocaleString('en-NG') : p.price) : '', gx + 3 * u, gy + gh * 0.62 + 12 * u);
      });
    } else {
      font(c, 800, 5 * u); c.fillStyle = '#13244F'; c.fillText('Welcome', sx + 6 * u, py + 6 * u);
      c.fillStyle = '#D5DAE6'; [0.86, 0.72, 0.8, 0.5].forEach(function (f, i) { rr(c, sx + 6 * u, py + 12 * u + i * 6 * u, sw * f - 12 * u, 3 * u, 1.5 * u); c.fill(); });
      c.fillStyle = d.accent; rr(c, sx + 6 * u, py + 40 * u, sw - 12 * u, 22 * u, 3 * u); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1;
    }
    c.restore();
  }
  function drawShowcase(d) {
    return function (c, w, h, q, fmt) {
      return Promise.all([mkImg(d.logo), mkImg(d.hero)].concat((d.products || []).map(function (p) { return mkImg(p.photo); }))).then(function (im) {
        var imgs = { logo: im[0], hero: im[1], products: im.slice(2) };
        bgFill(c, w, h);
        var story = fmt === 'story';
        mkLogo(c, 84, story ? 150 : 110, story ? 1.3 : 1.05);
        font(c, 700, story ? 34 : 28); c.fillStyle = MKC.gold; c.fillText('W E   B U I L T   T H I S   F O R', 84, story ? 260 : 200);
        var ns = fitSize(c, d.name, 800, story ? 110 : 84, 50, w - 168, 2); font(c, 800, ns); c.fillStyle = '#fff';
        var y = wrapText(c, d.name, 84, (story ? 260 : 200) + ns * 1.05, w - 168, ns * 1.02, 2);
        if (story) {
          var ph = Math.min(1010, footerTop(h, fmt) - (y + 30) - 170), pw = Math.round(ph * 0.555);
          drawPhone(c, d, imgs, (w - pw) / 2, y + 30, pw, ph);
          var by = y + 30 + ph + 30;
          if (d.rating) { stars(c, d.rating.average, w / 2, by + 44, 46, 'center'); font(c, 600, 30); c.fillStyle = MKC.soft; c.textAlign = 'center'; c.fillText(d.rating.average + ' from ' + d.rating.count + ' review' + (d.rating.count === 1 ? '' : 's') + ' · ' + d.interest, w / 2, by + 92); c.textAlign = 'left'; }
          else { font(c, 600, 34); c.fillStyle = MKC.soft; c.textAlign = 'center'; c.fillText(d.interest + (d.url ? ' · ' + d.url : ''), w / 2, by + 50); c.textAlign = 'left'; }
          footerQr(c, w, h, q, fmt, 'Want yours?');
        } else {
          drawPhone(c, d, imgs, w - 84 - 400, y + 20, 400, 730);
          var ly = y + 70;
          font(c, 600, 30); c.fillStyle = MKC.soft; wrapText(c, d.interest, 84, ly, 460, 38, 2);
          if (d.rating) { stars(c, d.rating.average, 84, ly + 80, 38); font(c, 600, 26); c.fillStyle = MKC.soft; c.fillText(d.rating.average + ' from ' + d.rating.count + ' review' + (d.rating.count === 1 ? '' : 's'), 84, ly + 120); }
          if (d.url) { font(c, 700, 28); c.fillStyle = '#fff'; wrapText(c, d.url, 84, ly + 180, 460, 34, 2); }
          var size = 170, qy = h - size - 70; qrTile(c, q, 84, qy, size);
          font(c, 800, 32); c.fillStyle = '#fff'; c.fillText('Want yours?', 84 + size + 28, qy + 70);
          font(c, 800, 32); c.fillStyle = MKC.gold; c.fillText('sirraddo.com.ng', 84 + size + 28, qy + 116);
        }
      });
    };
  }
  function mkShowcase(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'Show off websites you built. Only after the customer says yes, tick "Customer agreed": their website then also appears under "Websites we have built" on sirraddo.com.ng/websites (untick to remove it). Their photos, colours, products and star rating are used.' }));
    var list = el('div'), out = el('div', { class: 'mk-grid' });
    view.appendChild(list); view.appendChild(out);
    function draw(sites) {
      list.innerHTML = '';
      if (!sites.length) { list.appendChild(el('p', { class: 'admin-empty', text: 'No live client websites yet.' })); return; }
      sites.forEach(function (s) {
        var cb = el('input', { type: 'checkbox' }); cb.checked = Boolean(s.ok);
        cb.addEventListener('change', function () { api('POST', { action: 'mk_showcase_ok', id: s.id, ok: cb.checked }).then(function (j) { flash(cb.checked ? 'Marked: customer agreed' : 'Unmarked'); draw(j.sites); }).catch(fail); });
        list.appendChild(el('div', { class: 'admin-card mk-row' }, [
          el('div', null, [el('b', { text: s.business || s.name }), el('div', { class: 'admin-meta', text: s.interest + ' · ' + String(s.website_url || '').replace(/^https?:\/\//, '') })]),
          el('label', { class: 'admin-hint' }, [cb, ' Customer agreed']),
          el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Make post', disabled: !s.ok, onclick: function (e) {
            var b = e.currentTarget; b.disabled = true;
            api('POST', { action: 'mk_showcase', id: s.id }).then(function (d) {
              out.innerHTML = '';
              out.appendChild(mkOutput('We built this: ' + d.name, drawShowcase(d), 'showcase-' + s.id, 'A website we built for ' + d.name + ' (' + d.interest + ')' + (d.url ? ' at ' + d.url : '')));
              out.scrollIntoView({ behavior: 'smooth' });
            }).catch(fail).then(function () { b.disabled = false; });
          } })
        ]));
      });
    }
    api('POST', { action: 'mk_showcase_list' }).then(function (j) { draw(j.sites); }).catch(fail);
  }

  // ---------- Review cards ----------
  function drawReview(rv) {
    return function (c, w, h, q, fmt) {
      bgFill(c, w, h);
      var story = fmt === 'story';
      mkLogo(c, 84, story ? 150 : 110, story ? 1.3 : 1.05);
      font(c, 800, story ? 300 : 170); c.fillStyle = MKC.gold; c.globalAlpha = 0.9; c.fillText('“', 64, story ? 520 : 290); c.globalAlpha = 1;
      stars(c, rv.stars, 84, story ? 560 : 300, story ? 70 : 48);
      var text = rv.body || '', maxW = w - 168, top = story ? 660 : 360;
      var room = footerTop(h, fmt) - 50 - (story ? 110 : 90) - top; // leave space for the name lines
      var f = fitBox(c, text, 700, story ? 76 : 56, story ? 36 : 26, maxW, room, 1.25); font(c, 700, f.size); c.fillStyle = '#fff';
      var s = f.size;
      var y = wrapText(c, text, 84, top + s * 0.9, maxW, s * 1.25, f.lines) - s * 0.5;
      font(c, 800, story ? 44 : 34); c.fillStyle = MKC.gold; c.fillText('— ' + (rv.name || 'A customer'), 84, y + (story ? 50 : 30));
      font(c, 500, story ? 30 : 24); c.fillStyle = MKC.dim; c.fillText('Review on sirraddo.com.ng', 84, y + (story ? 100 : 70));
      footerQr(c, w, h, q, fmt, 'Get your website');
    };
  }
  function mkReviewCards(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'Your 4 and 5-star reviews (shown on your website) as branded pictures. Short reviews look best.' }));
    var list = el('div'), out = el('div', { class: 'mk-grid' });
    view.appendChild(list); view.appendChild(out);
    api('POST', { action: 'mk_reviews' }).then(function (j) {
      if (!j.reviews.length) { list.appendChild(el('p', { class: 'admin-empty', text: 'No 4 or 5-star reviews shown on your website yet. Ask happy customers to leave one at sirraddo.com.ng/websites#reviews.' })); return; }
      j.reviews.forEach(function (rv) {
        list.appendChild(el('div', { class: 'admin-card mk-row' }, [
          el('div', null, [el('b', { text: '★'.repeat(rv.stars) + ' ' + rv.name }), el('div', { class: 'admin-meta', text: rv.body.length > 140 ? rv.body.slice(0, 140) + '…' : rv.body })]),
          el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Make picture', onclick: function () {
            out.innerHTML = '';
            out.appendChild(mkOutput('Review from ' + rv.name, drawReview(rv), 'review-' + rv.id, 'A ' + rv.stars + '-star customer review: "' + rv.body + '" by ' + rv.name));
            out.scrollIntoView({ behavior: 'smooth' });
          } })
        ]));
      });
    }).catch(fail);
  }

  // ---------- Festive pictures ----------
  var FEST_COLORS = { christmas: ['#1C6B47', '#0F5132', '#062A1A'], new_year: ['#1B3170', MKC.navy, MKC.deep], independence: ['#0E8A4F', '#006B3C', '#003D22'], eid_fitr: ['#14706B', '#0B4F4A', '#05302D'], eid_adha: ['#14706B', '#0B4F4A', '#05302D'], easter: ['#5B3E96', '#3F2A6B', '#22173B'] };
  function drawFestive(f) {
    return function (c, w, h, q, fmt) {
      var col = FEST_COLORS[f.id] || [];
      bgFill(c, w, h, col[0], col[1], col[2]);
      var story = fmt === 'story';
      mkLogo(c, w / 2, story ? 170 : 110, story ? 1.3 : 1.05, 'center');
      font(c, 400, story ? 240 : 150); c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(f.emoji, w / 2, story ? 560 : 330); c.textAlign = 'left';
      var ts = fitSize(c, f.title, 800, story ? 130 : 96, 60, w - 168, 2); font(c, 800, ts); c.fillStyle = MKC.gold;
      var y = wrapText(c, f.title, w / 2, (story ? 640 : 400) + ts * 0.8, w - 168, ts * 1.05, 2, 'center');
      font(c, 600, story ? 46 : 34); c.fillStyle = '#fff';
      y = wrapText(c, f.message, w / 2, y + (story ? 40 : 24), w - 200, story ? 62 : 46, story ? 6 : 3, 'center');
      font(c, 600, story ? 34 : 26); c.fillStyle = MKC.soft; c.textAlign = 'center';
      c.fillText('From all of us at SIRRADDO GLOBAL LIMITED', w / 2, y + (story ? 50 : 34)); c.textAlign = 'left';
      footerQr(c, w, h, q, fmt, 'Websites from ₦50,000');
    };
  }
  function mkFestive(view) {
    view.appendChild(el('p', { class: 'admin-intro', text: 'Greeting pictures for the next festivals (the same ones as Settings → Festive greetings). Post on the day.' }));
    var out = el('div', { class: 'mk-grid' });
    api('POST', { action: 'greetings' }).then(function (j) {
      var list = el('div');
      j.festivals.slice(0, 6).forEach(function (f) {
        list.appendChild(el('div', { class: 'admin-card mk-row' }, [
          el('div', null, [el('b', { text: f.emoji + ' ' + f.name }), el('div', { class: 'admin-meta', text: niceDay(f.date) + (f.moon ? ' (moon sighting may move it)' : '') })]),
          el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Make picture', onclick: function () {
            out.innerHTML = '';
            out.appendChild(mkOutput(f.title, drawFestive(f), 'festive-' + f.id, f.title + ' greeting from SIRRADDO GLOBAL LIMITED: ' + f.message));
            out.scrollIntoView({ behavior: 'smooth' });
          } })
        ]));
      });
      view.insertBefore(list, out);
    }).catch(fail);
    view.appendChild(out);
  }

  // ---------- Offer ----------
  function drawOffer(o) {
    return function (c, w, h, q, fmt) {
      bgFill(c, w, h);
      var story = fmt === 'story';
      var bd = story ? 170 : 130, bh = story ? 84 : 64;
      c.save(); c.translate(w, 0); c.rotate(Math.PI / 4); c.fillStyle = MKC.gold; c.fillRect(-500, bd, 1000, bh);
      font(c, 800, story ? 36 : 28); c.fillStyle = MKC.deep; c.textAlign = 'center'; c.fillText('LIMITED OFFER', 0, bd + bh * 0.66); c.restore(); c.textAlign = 'left';
      mkLogo(c, 84, story ? 150 : 110, story ? 1.3 : 1.05);
      font(c, 700, story ? 34 : 28); c.fillStyle = MKC.gold; c.fillText('S P E C I A L   O F F E R', 84, story ? 330 : 210);
      var ts = fitSize(c, o.title, 800, story ? 140 : 84, 50, w - 168, story ? 4 : 2); font(c, 800, ts); c.fillStyle = '#fff';
      var y = wrapText(c, o.title, 84, (story ? 330 : 210) + ts * 1.1, w - 168, ts * 1.02, story ? 4 : 2);
      if (o.text) { font(c, 600, story ? 46 : 30); c.fillStyle = MKC.soft; y = wrapText(c, o.text, 84, y + (story ? 50 : 16), w - 168, story ? 60 : 40, story ? 3 : 2); }
      var d = new Date(o.until + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      var ps = story ? 48 : 30; font(c, 800, ps); var pw2 = c.measureText('Ends ' + d).width + ps * 1.4;
      pill(c, 'Ends ' + d, story ? w / 2 : 84 + pw2 / 2, Math.min(y + (story ? 70 : 24), footerTop(h, fmt) - ps * 1.7 - 30), ps);
      footerQr(c, w, h, q, fmt, 'Claim it now');
    };
  }
  function mkOffer(view) {
    var card = el('div', { class: 'admin-card' }, [el('h2', { text: 'Special offer' }), el('p', { class: 'admin-hint', text: 'While it runs, every page of your website shows a gold bar with a live countdown, the chat mentions it, and you can make ad pictures for it. The offer is applied by you on the quote.' })]);
    var title = el('input', { placeholder: 'e.g. ₦10,000 off Business websites', maxlength: 80 });
    var text = el('input', { placeholder: 'Short detail (optional), e.g. For new customers who start this month', maxlength: 200 });
    var until = el('input', { type: 'date' });
    var status = el('p', { class: 'admin-hint' });
    var out = el('div', { class: 'mk-grid' });
    function show(o) {
      out.innerHTML = '';
      if (o) { title.value = o.title || ''; text.value = o.text || ''; until.value = o.until || ''; }
      var live = o && o.on && o.until && o.until >= new Date(Date.now() + 3600000).toISOString().slice(0, 10);
      status.textContent = live ? '🔥 Showing on your website now, until the end of ' + niceDay(o.until) + '.' : o ? 'Not showing (ended or switched off).' : 'No offer set.';
      if (live) out.appendChild(mkOutput('Offer: ' + o.title, drawOffer(o), 'offer-' + o.tag, 'Limited offer: ' + o.title + (o.text ? ' (' + o.text + ')' : '') + ', ends ' + o.until));
    }
    card.appendChild(field('Offer', title)); card.appendChild(field('Detail', text)); card.appendChild(field('Last day', until));
    card.appendChild(el('div', { class: 'admin-actions' }, [
      el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Save & show on website', onclick: function () {
        api('POST', { action: 'mk_offer_save', offer: { title: title.value, text: text.value, until: until.value, on: true } }).then(function (j) { flash('Offer is live'); show(j.offer); }).catch(fail);
      } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'End offer now', onclick: function () {
        if (!window.confirm('Stop the offer now? The bar disappears from your website.')) return;
        api('POST', { action: 'mk_offer_save', offer: { remove: true } }).then(function () { flash('Offer ended'); title.value = text.value = until.value = ''; show(null); }).catch(fail);
      } })
    ]));
    card.appendChild(status);
    view.appendChild(card); view.appendChild(out);
    api('POST', { action: 'mk_offer_get' }).then(function (j) { show(j.offer); }).catch(fail);
  }

  // ---------- Referrals ----------
  function mkReferrals(view) {
    var card = el('div', { class: 'admin-card' }, [el('h2', { text: 'Referral programme' }),
      el('p', { class: 'admin-hint', text: 'Every live customer gets their own link (in their Manage page, and under their client card → Referrals). When a business comes from it and pays, the customer earns the reward below. You give it on their next renewal and tap "Reward given".' })]);
    var reward = el('input', { value: (state.settings && state.settings.referral_reward) || '₦5,000 off your next renewal', maxlength: 120 });
    card.appendChild(field('Reward for each business that pays', reward));
    if (!isOwner()) reward.disabled = true;
    if (isOwner()) card.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Save reward', onclick: function () {
      api('POST', { action: 'settings', settings: { referral_reward: reward.value } }).then(function (j) { state.settings = j.settings; flash('Saved'); }).catch(fail);
    } }));
    view.appendChild(card);
    var top = el('div', { class: 'admin-card' }, [el('h2', { text: 'Top referrers' }), el('p', { class: 'admin-hint', text: 'Loading…' })]);
    view.appendChild(top);
    api('POST', { action: 'mk_ref_top' }).then(function (j) {
      top.lastChild.remove();
      top.appendChild(j.top.length ? el('ul', { class: 'admin-mini' }, j.top.map(function (t) {
        return el('li', null, [el('b', { text: t.business || t.name }), ' · code ' + t.ref_code + ' · ' + t.sent + ' sent · ' + t.paid + ' paid']);
      })) : el('p', { class: 'admin-empty', text: 'No referrals yet. Remind happy customers about their link (it’s on their Manage page).' }));
    }).catch(fail);
  }

  // ---------- Marketing → Agents: people who bring clients for a commission ----------
  function mkAgents(view) {
    var head = el('div', { class: 'admin-card' }, [el('h2', { text: 'Agents' }),
      el('p', { class: 'admin-hint' }, ['People apply on ', el('a', { href: '/agents', target: '_blank', rel: 'noopener', text: 'sirraddo.com.ng/agents' }),
        '. Approve them here and they get their own link. Requests that come through it are theirs (the request shows “agent:CODE” as where it came from; you can also set that by hand if a client mentions an agent code). They earn the commission on what that client pays for the build in the first 12 months, and see it all on their dashboard.'])]);
    view.appendChild(head);
    var box = el('div'); view.appendChild(box);
    box.appendChild(el('p', { class: 'admin-hint', text: 'Loading…' }));
    var openId = null;
    function draw(j) {
      box.textContent = '';
      if (isOwner()) {
        var rate = el('input', { type: 'number', min: 1, max: 50, value: j.rate, inputmode: 'decimal' });
        var min = el('input', { type: 'number', min: 1000, step: 500, value: j.min, inputmode: 'numeric' });
        var tiers = el('input', { value: j.tiers.length ? j.tiers.map(function (t) { return t.clients + ':' + t.rate; }).join(', ') : 'off', placeholder: '5:12, 15:15' });
        var inv = el('input', { type: 'number', min: 0, step: 500, value: j.inviteBonus, inputmode: 'numeric' });
        box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Commission' }),
          el('div', { class: 'admin-grid2' }, [field('Commission (% of what the client pays for the build)', rate), field('Smallest payout (₦)', min),
            field('Levels (from the Nth paying client, this %)', tiers, '"5:12, 15:15" = from the 5th paying client 12% (Silver), from the 15th 15% (Gold). "off" = everyone at the base %.'),
            field('Invite bonus (₦)', inv, 'Paid to an agent when someone they invited earns their first commission. 0 = none.')]),
          el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Save', onclick: function () { api('POST', { action: 'agents_settings', rate: rate.value, min: min.value, tiers: tiers.value, invite_bonus: inv.value }).then(function (x) { flash('Saved'); draw(x); }).catch(fail); } })]));
        // Announcements
        var nt = el('input', { placeholder: 'Title, e.g. December promo', maxlength: 120 }), nbody = el('textarea', { rows: 3, maxlength: 1500, placeholder: 'What agents should know' }), nlink = el('input', { placeholder: 'Link (optional), https://…' });
        var nmail = el('input', { type: 'checkbox' });
        var news = el('div', { class: 'admin-card' }, [el('h2', { text: 'Announcements to agents' }), el('p', { class: 'admin-hint', text: 'Shows at the top of every agent\'s dashboard. Tick email to also send it (up to 60 agents, from today\'s email allowance).' }),
          nt, nbody, nlink, el('label', { class: 'admin-check' }, [nmail, ' Also email it to agents']),
          el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Post announcement', onclick: function () {
            api('POST', { action: 'agent_news', title: nt.value, body: nbody.value, link: nlink.value, email: nmail.checked }).then(function (x) { flash(x.emailed ? 'Posted and emailed to ' + x.emailed : 'Posted'); draw(x); }).catch(fail);
          } })]);
        if (j.news.length) news.appendChild(el('ul', { class: 'admin-mini' }, j.news.map(function (n) {
          return el('li', null, [el('b', { text: n.title }), ' · ' + new Date(n.created_at).toLocaleDateString('en-GB') + (n.emailed ? ' · emailed ' + n.emailed : '') + ' ',
            el('button', { class: 'admin-btn', type: 'button', text: 'Delete', onclick: function () { if (window.confirm('Delete this announcement?')) api('POST', { action: 'agent_news_delete', id: n.id }).then(draw).catch(fail); } })]);
        })));
        box.appendChild(news);
      }
      if (j.top && j.top.length) box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: '🏆 Top agents this month' }), el('ol', { class: 'admin-mini' }, j.top.map(function (t) { return el('li', { text: t.name + (t.city ? ' (' + t.city + ')' : '') + ' · ' + t.clients + ' paying' }); })),
        el('p', { class: 'admin-hint', text: 'Reward the top agent with "Add bonus" on their card below.' })]));
      var pending = j.agents.filter(function (a) { return a.status === 'pending'; });
      var owed = j.agents.filter(function (a) { return a.payout_requested_at; });
      var list = el('div', { class: 'admin-card' }, [el('h2', { text: 'Your agents (' + j.agents.filter(function (a) { return a.status === 'active'; }).length + ' active)' })]);
      if (pending.length || owed.length) list.appendChild(el('p', { class: 'admin-flag', text: [pending.length ? pending.length + ' waiting for approval' : '', owed.length ? owed.length + ' asked for a payout' : ''].filter(Boolean).join(' · ') }));
      if (!j.agents.length) list.appendChild(el('p', { class: 'admin-empty', text: 'No agents yet. Share sirraddo.com.ng/agents on your status and pages to find some.' }));
      j.agents.forEach(function (a) { list.appendChild(agentRow(a, j)); });
      box.appendChild(list);
    }
    function agentRow(a, j) {
      var badge = { pending: 'Waiting for approval', active: 'Active', paused: 'Paused', declined: 'Declined' }[a.status] || a.status;
      var d = el('details', { class: 'admin-agent', open: a.id === openId || a.status === 'pending' || a.payout_requested_at ? true : null });
      d.addEventListener('toggle', function () { if (d.open) openId = a.id; });
      d.appendChild(el('summary', null, [el('b', { text: a.name }), ' · ' + (a.code || 'no code yet') + ' · ' + badge + (a.status === 'active' ? ' · ' + a.count + ' sent · ' + a.clients + ' paying · balance ' + naira(a.balance) : '') + (a.payout_requested_at ? ' · 💰 payout requested' : '')]));
      var num = waNumber(a.phone);
      d.appendChild(el('p', { class: 'admin-meta', text: [a.phone, a.email, a.city, 'applied ' + new Date(a.created_at).toLocaleDateString('en-GB'), a.last_login_at ? 'last log in ' + new Date(a.last_login_at).toLocaleDateString('en-GB') : 'never logged in', a.status === 'active' ? (a.trained_at ? '🎓 trained' : 'not trained yet') : null].filter(Boolean).join(' · ') }));
      if (a.pitch) d.appendChild(el('p', { class: 'admin-meta', text: 'How they’ll find clients: ' + a.pitch }));
      if (a.link) d.appendChild(el('p', { class: 'admin-meta', text: 'Link: ' + a.link + ' · commission ' + a.rate + '%' + (a.own_rate != null ? ' (their own rate)' : '') }));
      if (a.status === 'active') d.appendChild(el('p', { class: 'admin-meta', text: a.level + ' · commission ' + naira(a.earned) + (a.bonusTotal ? ' · bonuses ' + naira(a.bonusTotal) : '') + (a.inviteTotal ? ' · invite bonuses ' + naira(a.inviteTotal) : '') + ' · paid ' + naira(a.paidOut) + ' · balance ' + naira(a.balance) + (a.prospects ? ' · ' + a.prospects + ' registered prospect' + (a.prospects === 1 ? '' : 's') : '') + (a.invites ? ' · invited ' + a.invites + ' agent' + (a.invites === 1 ? '' : 's') : '') }));
      if (a.invited_by) d.appendChild(el('p', { class: 'admin-meta', text: 'Invited by ' + a.invited_by }));
      var acts = el('div', { class: 'admin-actions' });
      if (isOwner()) {
        var set = function (status, ok) { return function () { api('POST', { action: 'agent_update', id: a.id, status: status }).then(function (x) { flash(ok); openId = a.id; draw(x); }).catch(fail); }; };
        if (a.status !== 'active') acts.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: a.status === 'pending' ? 'Approve' : 'Make active', onclick: set('active', 'Approved') }));
        if (a.status === 'pending') acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Decline', onclick: function () { if (window.confirm('Decline ' + a.name + '?')) set('declined', 'Declined')(); } }));
        if (a.status === 'active') acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Pause', onclick: function () { if (window.confirm('Pause ' + a.name + '? They can’t log in while paused; their clients still count.')) set('paused', 'Paused')(); } }));
        if (num && a.status === 'active') acts.appendChild(el('a', { class: 'admin-btn admin-btn--wa', target: '_blank', rel: 'noopener', text: 'Welcome on WhatsApp',
          href: 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hello ' + a.name.split(' ')[0] + ', welcome to SIRRADDO agents! 🎉 You’re approved. Your link: ' + a.link + '\nYou earn ' + a.rate + '% when a business you bring pays for their website. Log in to your dashboard at https://www.sirraddo.com.ng/agents#login with your WhatsApp number and password: it has ready messages to share.') }));
        acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Reset password', onclick: function () {
          if (!window.confirm('Give ' + a.name + ' a new temporary password?')) return;
          api('POST', { action: 'agent_reset', id: a.id }).then(function (x) {
            var msg = 'Hello ' + a.name.split(' ')[0] + ', your temporary SIRRADDO agent password is ' + x.password + ' . Log in at https://www.sirraddo.com.ng/agents#login and choose your own.';
            window.prompt('Send this to them on WhatsApp (it’s shown once):', msg);
            if (num) window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
          }).catch(fail);
        } }));
        var own = el('input', { type: 'number', min: 1, max: 50, placeholder: String(j.rate), value: a.own_rate != null ? a.own_rate : '', style: 'max-width:90px' });
        acts.appendChild(el('span', { class: 'admin-inline' }, ['Own %', own, el('button', { class: 'admin-btn', type: 'button', text: 'Set', onclick: function () { api('POST', { action: 'agent_update', id: a.id, rate: own.value }).then(function (x) { flash('Saved'); openId = a.id; draw(x); }).catch(fail); } })]));
      }
      if (isOwner() && a.status === 'active') {
        acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Add bonus', onclick: function () {
          var amt = window.prompt('Bonus for ' + a.name + ' (₦):', '5000'); if (!amt) return;
          var why = window.prompt('What is it for? (they see this)', 'Top agent of the month'); if (why == null) return;
          api('POST', { action: 'agent_bonus', id: a.id, amount: amt, note: why }).then(function (x) { flash('Bonus added'); openId = a.id; draw(x); }).catch(fail);
        } }));
      }
      d.appendChild(acts);
      // Pay
      if (isOwner() && a.status !== 'pending') {
        var bank = a.bank ? a.bank.bank + ' · ' + a.bank.account_no + ' · ' + a.bank.account_name : 'No bank details yet';
        var amt = el('input', { inputmode: 'numeric', value: a.balance > 0 ? a.balance : '', placeholder: 'Amount' });
        var ref = el('input', { placeholder: 'Transfer reference (optional)', maxlength: 80 });
        d.appendChild(el('div', { class: 'admin-golive' }, [el('span', { class: 'admin-label', text: 'Record a payout' }), el('p', { class: 'admin-meta', text: bank }),
          el('div', { class: 'admin-grid2' }, [amt, ref]),
          el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'I’ve paid them', disabled: !a.bank, onclick: function () {
            if (!window.confirm('Record ' + naira(amt.value) + ' paid to ' + a.name + '? They’ll get an email.')) return;
            api('POST', { action: 'agent_payout', id: a.id, amount: amt.value, ref: ref.value }).then(function (x) { flash('Payout recorded'); openId = a.id; draw(x); }).catch(fail);
          } })]));
      }
      if (a.leads.length) d.appendChild(el('ul', { class: 'admin-mini' }, a.leads.map(function (l) {
        return el('li', null, [el('b', { text: l.business || l.name }), ' · ' + l.interest + ' · ' + l.status + (l.self ? ' · their own business (not counted)' : '') + (l.paid != null ? ' · paid ' + naira(l.paid) : '') + ' · earns ' + naira(l.earned) + (l.rate ? ' (' + l.rate + '%)' : '')]);
      })));
      if (a.payouts.length) d.appendChild(el('p', { class: 'admin-meta', text: 'Payouts: ' + a.payouts.map(function (p) { return naira(p.amount) + ' on ' + new Date(p.created_at).toLocaleDateString('en-GB') + (p.ref ? ' (' + p.ref + ')' : ''); }).join(', ') }));
      return d;
    }
    api('POST', { action: 'agents_list' }).then(draw).catch(function (e) { box.textContent = ''; box.appendChild(el('p', { class: 'admin-error', text: e.message })); });
  }

  // Client card → Referrals
  function referralBlock(r) {
    var box = el('div', { class: 'admin-golive' }, [el('span', { class: 'admin-label', text: 'Referrals' })]);
    var body = el('div');
    function draw(j) {
      body.innerHTML = '';
      var msg = 'Hello ' + String(r.name).split(' ')[0] + ', thank you for working with us! 🎁 Know a business that needs a website? Share your link: ' + j.link + '\nFor each business that pays for a website, you get ' + j.reward + '.';
      body.appendChild(el('p', { class: 'admin-meta', text: 'Code ' + j.code + ' · ' + j.list.length + ' came · ' + j.paid + ' paid · rewards given ' + j.used + ' of ' + j.paid }));
      var num = waNumber(r.contact);
      body.appendChild(el('div', { class: 'admin-actions' }, [
        el('button', { class: 'admin-btn', type: 'button', text: 'Copy link', onclick: function (e) { copyText(j.link, 'Link', e.currentTarget); } }),
        num ? el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'Send their link on WhatsApp' }) : null,
        j.paid > j.used ? el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Reward given (1)', onclick: function () { api('POST', { action: 'mk_ref_use', id: r.id, n: 1 }).then(draw).catch(fail); } }) : null
      ]));
      if (j.list.length) body.appendChild(el('ul', { class: 'admin-mini' }, j.list.map(function (x) { return el('li', null, [el('b', { text: x.business || x.name }), ' · ' + x.interest + ' · ' + x.status]); })));
    }
    box.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Show referrals', onclick: function (e) { e.currentTarget.remove(); api('POST', { action: 'mk_ref', id: r.id }).then(draw).catch(fail); } }));
    box.appendChild(body);
    return box;
  }

  // ---------- Ad spend ----------
  function mkSpend(view) {
    var card = el('div', { class: 'admin-card' }, [el('h2', { text: 'What you spent on ads' }),
      el('p', { class: 'admin-hint', text: 'Type each top-up or boost. Use the same campaign name as in your ad link (…?utm_source=facebook&utm_campaign=ibadan-test → "ibadan-test"; for QR flyers use e.g. "flyer-a5"). The table shows what each campaign cost per enquiry and per paying customer.' })]);
    var day = el('input', { type: 'date', value: new Date(Date.now() + 3600000).toISOString().slice(0, 10) });
    var plat = select(['Facebook / Instagram', 'Google', 'TikTok', 'WhatsApp', 'Flyers / print', 'Other'], 'Facebook / Instagram', { 'aria-label': 'Where' });
    var tags = {};
    state.requests.forEach(function (r) { if (r.came_from && / \/ /.test(r.came_from)) tags[r.came_from.split(' / ')[1]] = 1; });
    var dl = el('datalist', { id: 'mk-tags' }, Object.keys(tags).concat(['flyer-a5', 'qr-card', 'banner']).map(function (t) { return el('option', { value: t }); }));
    var tag = el('input', { placeholder: 'Campaign name, e.g. ibadan-test', list: 'mk-tags' });
    var amount = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'Amount in ₦, e.g. 5000' });
    var note = el('input', { placeholder: 'Note (optional)' });
    var table = el('div'), entries = el('div');
    function draw(j) {
      table.innerHTML = ''; entries.innerHTML = '';
      if (!j.report.length) table.appendChild(el('p', { class: 'admin-empty', text: 'Nothing yet.' }));
      else table.appendChild(el('div', { class: 'admin-table-wrap' }, [el('table', { class: 'admin-table' }, [
        el('thead', null, [el('tr', null, ['Campaign', 'Spent', 'Enquiries', 'Paid', 'Cost / enquiry', 'Cost / paying customer', 'They paid you'].map(function (x) { return el('th', { text: x }); }))]),
        el('tbody', null, j.report.map(function (x) {
          return el('tr', null, [x.tag + ' (' + x.platforms + ')', naira(x.spend), String(x.leads), String(x.paid), x.perLead == null ? '-' : naira(x.perLead), x.perPaid == null ? '-' : naira(x.perPaid), naira(x.value)].map(function (v, i) { return el('td', { text: v, class: i === 6 && x.value > x.spend ? 'is-good' : '' }); }));
        }))
      ])]));
      entries.appendChild(el('ul', { class: 'admin-mini' }, j.spend.slice(0, 30).map(function (s) {
        return el('li', null, [niceDay(String(s.day).slice(0, 10)) + ' · ' + s.platform + ' · ', el('b', { text: s.tag }), ' · ' + naira(s.amount) + (s.note ? ' · ' + s.note : '') + ' ',
          el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: 'Delete', onclick: function () { api('POST', { action: 'mk_spend_del', spend_id: s.id }).then(draw).catch(fail); } })]);
      })));
    }
    [field('Date', day), field('Where', plat), field('Campaign', tag), field('Amount (₦)', amount), field('Note', note)].forEach(function (x) { card.appendChild(x); });
    card.appendChild(dl);
    card.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Add', onclick: function () {
      api('POST', { action: 'mk_spend_add', entry: { day: day.value, platform: plat.value, tag: tag.value, amount: amount.value, note: note.value } }).then(function (j) { amount.value = ''; note.value = ''; flash('Added'); draw(j); }).catch(fail);
    } }));
    view.appendChild(card);
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Which ads pay off' })); view.appendChild(table);
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Entries' })); view.appendChild(entries);
    api('POST', { action: 'mk_spend' }).then(draw).catch(fail);
  }

  // ---------- Video maker: AI writes the scenes, this browser animates and records them ----------
  // Recorded with MediaRecorder from the canvas: MP4 where the browser can (newer Chrome, Safari), otherwise WebM.
  function vmMime() {
    if (!window.MediaRecorder) return null;
    var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  }
  var vmEase = function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3); };
  function vmTimeline(sc) {
    var parts = [{ kind: 'hook', d: 3.6, s: sc.hook }];
    sc.scenes.forEach(function (x) { parts.push({ kind: x.type, d: x.type === 'message' ? 4.2 : 5, s: x }); });
    parts.push({ kind: 'end', d: 5, s: sc });
    var t = 0; parts.forEach(function (p) { p.t0 = t; t += p.d; });
    return { parts: parts, total: t };
  }
  function vmTick(c, x, y, s) {
    c.save(); c.strokeStyle = MKC.gold; c.lineWidth = s * 0.16; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x, y - s * 0.35); c.lineTo(x + s * 0.35, y); c.lineTo(x + s, y - s * 0.75); c.stroke(); c.restore();
  }
  // Draws frame t (seconds). W×H is 720×1280 (scaled from the 1080 layouts by k).
  function vmDraw(c, W, H, sc, tl, t, q) {
    var k = W / 1080;
    bgFill(c, W, H);
    var part = tl.parts[tl.parts.length - 1];
    for (var i = 0; i < tl.parts.length; i++) if (t < tl.parts[i].t0 + tl.parts[i].d) { part = tl.parts[i]; break; }
    var lt = t - part.t0;
    var out = part.kind === 'end' ? 1 : 1 - vmEase((lt - (part.d - 0.35)) / 0.35);
    var at = function (t0) { return vmEase((lt - t0) / 0.5) * out; };
    var up = function (a) { return (1 - a) * 60 * k; };
    c.save(); c.scale(k, k);
    var w = 1080, h = 1920, a;
    if (part.kind === 'hook') {
      a = at(0.1); c.globalAlpha = a; mkLogo(c, w / 2, 520 - up(a) / k, 1.6, 'center');
      a = at(0.5); c.globalAlpha = a; var f = fitBox(c, part.s.title, 800, 140, 70, w - 168, 620, 1.04); font(c, 800, f.size); c.fillStyle = '#fff';
      var y = wrapText(c, part.s.title, w / 2, 760 + up(a) / k + f.size, w - 168, f.size * 1.04, f.lines, 'center');
      if (part.s.sub) { a = at(1.1); c.globalAlpha = a; font(c, 700, 56); c.fillStyle = MKC.gold; wrapText(c, part.s.sub, w / 2, y + 60 + up(a) / k, w - 200, 70, 3, 'center'); }
    } else if (part.kind === 'points' || part.kind === 'price') {
      // Centre the block vertically: work out its height first.
      var np = (part.s.points || []).length, blockH;
      if (part.kind === 'price') { var ps0 = fitBox(c, part.s.price, 800, 190, 90, w - 168, 220, 1).size; blockH = 40 + 30 + ps0 + 120 + np * 130; }
      else { var ft0 = fitBox(c, part.s.title, 800, 110, 60, w - 168, 360, 1.04); blockH = ft0.lines * ft0.size * 1.04 + 90 + np * 130; }
      var y0 = Math.max(300, (h - blockH) / 2);
      if (part.kind === 'price') {
        a = at(0.1); c.globalAlpha = a; font(c, 700, 40); c.fillStyle = MKC.gold; c.fillText(String(part.s.label || '').toUpperCase().split('').join(' '), 84, y0);
        a = at(0.35); c.globalAlpha = a; var ps = fitBox(c, part.s.price, 800, 190, 90, w - 168, 220, 1).size; font(c, 800, ps); c.fillStyle = MKC.gold; c.fillText(part.s.price, 84, y0 + 30 + ps + up(a) / k);
        y0 = y0 + 30 + ps + 120;
      } else {
        a = at(0.1); c.globalAlpha = a; var ft = fitBox(c, part.s.title, 800, 110, 60, w - 168, 360, 1.04); font(c, 800, ft.size); c.fillStyle = '#fff';
        y0 = wrapText(c, part.s.title, 84, y0 + ft.size + up(a) / k, w - 168, ft.size * 1.04, ft.lines) + 90;
      }
      (part.s.points || []).forEach(function (p, i) {
        a = at(0.7 + i * 0.4); c.globalAlpha = a;
        var dx = (1 - a) * -100;
        vmTick(c, 84 + dx, y0 + i * 130 - 12, 52);
        font(c, 700, 58); c.fillStyle = '#fff'; wrapText(c, p, 180 + dx, y0 + i * 130 + 6, w - 264, 64, 1);
      });
    } else if (part.kind === 'message') {
      a = at(0.1); c.globalAlpha = a; var fm = fitBox(c, part.s.title, 800, 120, 60, w - 168, 560, 1.04); font(c, 800, fm.size); c.fillStyle = '#fff';
      var ym = wrapText(c, part.s.title, 84, 620 + fm.size + up(a) / k, w - 168, fm.size * 1.04, fm.lines);
      a = at(0.9); c.globalAlpha = a; font(c, 700, 58); c.fillStyle = MKC.gold; wrapText(c, part.s.text, 84, ym + 90 + up(a) / k, w - 168, 72, 4);
    } else {
      a = at(0.1); c.globalAlpha = a; mkLogo(c, w / 2, 300, 2, 'center');
      a = at(0.4); c.globalAlpha = a; var fe = fitBox(c, sc.end, 800, 90, 50, w - 168, 220, 1.05); font(c, 800, fe.size); c.fillStyle = '#fff';
      wrapText(c, sc.end, w / 2, 470 + fe.size + up(a) / k, w - 168, fe.size * 1.05, fe.lines, 'center');
      a = at(0.7); c.globalAlpha = a; var qs = 420; qrTile(c, q, (w - qs) / 2, 760 + up(a) / k, qs);
      a = at(0.9); c.globalAlpha = a; font(c, 700, 36); c.fillStyle = MKC.soft; c.textAlign = 'center'; c.fillText('Scan or visit', w / 2, 1250); c.textAlign = 'left';
      a = at(1.1); c.globalAlpha = a; pill(c, 'sirraddo.com.ng', w / 2, 1290, 72);
      a = at(1.4); c.globalAlpha = a; font(c, 700, 44); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText('WhatsApp 0816 755 0937', w / 2, 1520);
      a = at(1.6); c.globalAlpha = a; font(c, 500, 26); c.fillStyle = MKC.dim; c.fillText('SIRRADDO GLOBAL LIMITED · RC 9939920 · Ibadan', w / 2, 1580); c.textAlign = 'left';
    }
    c.restore(); c.globalAlpha = 1;
  }
  function mkVideoMaker(view) {
    var mime = vmMime();
    view.appendChild(el('p', { class: 'admin-intro', text: 'Describe the video you want. The AI writes it (you can change any line), then this phone or laptop animates it in your brand style and records it (about 20 seconds; keep the screen on). Tracked with its own QR tag.' }));
    if (!mime) view.appendChild(el('p', { class: 'admin-error', text: 'This browser can’t record video. Use Chrome on a laptop or a newer phone.' }));
    else if (/webm/.test(mime)) view.appendChild(el('p', { class: 'admin-hint', text: 'Note: this browser saves WebM videos. Instagram, TikTok and Facebook accept them; WhatsApp Status on some phones may not. For MP4, use Chrome on a laptop or an iPhone.' }));
    var idea = el('textarea', { rows: 3, placeholder: 'e.g. Christmas promo for online stores, mention the demo store', value: state.vmIdea || '' });
    var lang = select(['English', 'Nigerian Pidgin', 'Yoruba', 'Hausa', 'Igbo'], state.mkLang || 'English', { 'aria-label': 'Language' });
    var editor = el('div'), result = el('div');
    var card = el('div', { class: 'admin-card' }, [field('Your idea', idea), field('Language', lang)]);
    var write = el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '✨ Write the video', onclick: function () {
      state.vmIdea = idea.value; state.mkLang = lang.value;
      write.disabled = true; write.textContent = 'Writing…';
      api('POST', { action: 'mk_video_script', idea: idea.value, lang: lang.value }).then(function (j) { state.vmScript = j.script; drawEditor(); })
        .catch(fail).then(function () { write.disabled = false; write.textContent = '✨ Write it again'; });
    } });
    card.appendChild(write);
    view.appendChild(card); view.appendChild(editor); view.appendChild(result);
    function inp(obj, key, label, max) {
      var x = el('input', { value: obj[key] || '', maxlength: max || 90 });
      x.addEventListener('input', function () { obj[key] = x.value; });
      return field(label, x);
    }
    function drawEditor() {
      var sc = state.vmScript; editor.innerHTML = ''; result.innerHTML = '';
      if (!sc) return;
      var box = el('div', { class: 'admin-card' }, [el('h2', { text: 'Your video (change anything)' })]);
      box.appendChild(el('h3', { text: '1. Opening' })); box.appendChild(inp(sc.hook, 'title', 'Big line')); box.appendChild(inp(sc.hook, 'sub', 'Small line'));
      sc.scenes.forEach(function (x, i) {
        box.appendChild(el('h3', { text: (i + 2) + '. ' + (x.type === 'price' ? 'Price' : x.type === 'message' ? 'Message' : 'Points') }));
        if (x.type === 'price') { box.appendChild(inp(x, 'label', 'Package')); box.appendChild(inp(x, 'price', 'Price')); }
        else box.appendChild(inp(x, 'title', 'Title'));
        if (x.type === 'message') box.appendChild(inp(x, 'text', 'Text', 140));
        (x.points || []).forEach(function (p, n) { var o = { v: p }; var f = inp(o, 'v', 'Point ' + (n + 1), 60); f.querySelector('input').addEventListener('input', function () { x.points[n] = o.v; }); box.appendChild(f); });
      });
      box.appendChild(el('h3', { text: (sc.scenes.length + 2) + '. Ending' })); box.appendChild(inp(sc, 'end', 'Call to action', 50));
      box.appendChild(inp(sc, 'caption', 'Caption for your post', 600));
      var make = el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '🎬 Make the video', disabled: !mime, onclick: function () { record(sc, make); } });
      box.appendChild(make);
      editor.appendChild(box);
    }
    function record(sc, btn) {
      var W = 720, H = 1280, tl = vmTimeline(sc);
      var canvas = el('canvas', { class: 'mk-canvas', width: W, height: H });
      var status = el('p', { class: 'admin-hint', text: 'Getting ready…' });
      result.innerHTML = '';
      result.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Recording' }), canvas, status]));
      result.scrollIntoView({ behavior: 'smooth' });
      btn.disabled = true;
      var c = canvas.getContext('2d');
      mkFonts().then(function () { return mkQr('video-' + sc.tag); }).then(function (q) {
        vmDraw(c, W, H, sc, tl, 0, q);
        var stream = canvas.captureStream(30), chunks = [];
        var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        var start = performance.now(), wake = null;
        try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); } catch (e) {}
        rec.onstop = function () {
          if (wake) wake.release().catch(function () {});
          var type = mime.split(';')[0], ext = /mp4/.test(type) ? 'mp4' : 'webm';
          var blob = new Blob(chunks, { type: type }), url = URL.createObjectURL(blob), name = 'sirraddo-video-' + sc.tag + '.' + ext;
          var caption = sc.caption || '';
          result.innerHTML = '';
          var acts = el('div', { class: 'admin-actions' });
          if (navigator.canShare && window.File) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Share', onclick: function () {
            if (navigator.clipboard && caption) navigator.clipboard.writeText(caption).catch(function () {});
            shareFile(new File([blob], name, { type: type }), caption).catch(function (err) { if (err && err.name !== 'AbortError') fail(err); });
          } }));
          acts.appendChild(el('a', { class: 'admin-btn', href: url, download: name, text: 'Download (' + ext.toUpperCase() + ')' }));
          if (caption) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy caption', onclick: function (e) { copyText(caption, 'Caption', e.currentTarget); } }));
          acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Make it again', onclick: function (e) { record(sc, e.currentTarget); } }));
          result.appendChild(el('div', { class: 'admin-card mk-card' }, [el('h2', { text: 'Your video is ready' }),
            el('video', { src: url, controls: true, playsinline: true, class: 'mk-img' }),
            el('p', { class: 'admin-meta', text: Math.round(tl.total) + ' s · ' + ext.toUpperCase() + ' · QR tagged "video-' + sc.tag + '". Add music from the app’s own library when you post.' }),
            caption ? el('p', { class: 'mk-caption', text: caption }) : null, acts]));
          btn.disabled = false;
        };
        rec.start(250);
        (function frame() {
          var t = (performance.now() - start) / 1000;
          vmDraw(c, W, H, sc, tl, Math.min(t, tl.total), q);
          status.textContent = 'Recording… ' + Math.min(100, Math.round(100 * t / tl.total)) + '% (keep this screen on)';
          if (t < tl.total + 0.2) requestAnimationFrame(frame); else rec.stop();
        })();
      }).catch(function (e) { fail(e); btn.disabled = false; });
    }
    drawEditor();
  }

  // ---------- Today: a posting plan ----------
  var PLAN_WHERE = { story: 'WhatsApp Status + Instagram Story', video: 'WhatsApp Status + Reels / TikTok', square: 'Instagram + Facebook post', banner: 'Facebook page and groups' };
  function planFor(dayIndex, extras) {
    var items = ADS.filter(function (a) { return a.group !== 'print'; }).map(function (a) { return { ad: a }; });
    // Every few days: something made in the picture maker (proof beats prices).
    items.splice(2, 0, { make: 'showcase', title: 'A "We built this" post', where: 'WhatsApp Status + Instagram' });
    items.splice(6, 0, { make: 'reviews', title: 'A customer review card', where: 'WhatsApp Status + Facebook' });
    items.splice(9, 0, { make: 'referrals', title: 'Remind 3 happy customers about their referral link', where: 'WhatsApp (to each customer)' });
    if (extras.offer) items.unshift({ make: 'offer', title: 'Your offer: ' + extras.offer.title, where: 'Status, Instagram and Facebook' });
    return items[dayIndex % items.length];
  }
  function mkToday(view) {
    var today = new Date(Date.now() + 3600000), d0 = Math.floor(today.getTime() / 86400000);
    var key = function (i) { return 'sirraddo-posted-' + new Date((d0 + i) * 86400000).toISOString().slice(0, 10); };
    var posted = function (i) { try { return localStorage.getItem(key(i)) === '1'; } catch (e) { return false; } };
    var box = el('div');
    view.appendChild(box);
    api('POST', { action: 'mk_offer_get' }).catch(function () { return {}; }).then(function (j) {
      var o = j && j.offer, live = o && o.on && o.until >= today.toISOString().slice(0, 10);
      var extras = { offer: live ? o : null };
      var it = planFor(d0, extras);
      var head = el('div', { class: 'admin-card' }, [el('h2', { text: 'Post today' }), el('p', { class: 'admin-meta', text: 'Where: ' + (it.ad ? PLAN_WHERE[it.ad.group] : it.where) })]);
      var done = el('input', { type: 'checkbox' }); done.checked = posted(0);
      done.addEventListener('change', function () { try { localStorage.setItem(key(0), done.checked ? '1' : '0'); } catch (e) {} flash(done.checked ? 'Nice one! ✓' : 'Unmarked'); });
      if (it.ad) head.appendChild(el('div', { class: 'mk-grid' }, [adCard(it.ad)]));
      else head.appendChild(el('div', { class: 'admin-actions' }, [el('b', { text: it.title }), el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Open ' + (MK_TABS.filter(function (t) { return t[0] === it.make; })[0] || ['', 'tab'])[1], onclick: function () { state.mkTab = it.make; render(); } })]));
      head.appendChild(el('label', { class: 'admin-hint' }, [done, ' I posted today']));
      box.appendChild(head);
      var next = el('ul', { class: 'admin-mini' });
      for (var i = 1; i <= 13; i++) {
        var n = planFor(d0 + i, extras), day = new Date((d0 + i) * 86400000);
        next.appendChild(el('li', null, [el('b', { text: day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) }), ' · ' + (n.ad ? n.ad.title : n.title) + ' · ' + (n.ad ? PLAN_WHERE[n.ad.group] : n.where)]));
      }
      box.appendChild(el('details', { class: 'admin-card' }, [el('summary', { text: 'Next 2 weeks' }), next]));
      var bio = function (src) { return LINKS_URL + '?utm_source=' + src + '&utm_campaign=bio'; };
      box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Link in bio' }),
        el('p', { class: 'admin-hint', text: 'One page with your packages, demo store, reviews and WhatsApp. Put it in your Instagram, TikTok and Facebook bio; the offer bar shows there too.' }),
        el('div', { class: 'admin-actions' }, [
          el('a', { class: 'admin-btn', href: '/links', target: '_blank', rel: 'noopener', text: 'Open page' }),
          el('button', { class: 'admin-btn', type: 'button', text: 'Copy for Instagram', onclick: function (e) { copyText(bio('instagram'), 'Link', e.currentTarget); } }),
          el('button', { class: 'admin-btn', type: 'button', text: 'Copy for TikTok', onclick: function (e) { copyText(bio('tiktok'), 'Link', e.currentTarget); } }),
          el('button', { class: 'admin-btn', type: 'button', text: 'Copy for Facebook', onclick: function (e) { copyText(bio('facebook'), 'Link', e.currentTarget); } })
        ])]));
    });
  }

  function renderAssistant(view) {
    var job = asst.id ? state.requests.filter(function (r) { return r.id === asst.id; })[0] : null;
    var pick = select([['', 'All jobs (general help)']].concat(state.requests.slice(0, 200).map(function (r) {
      return [String(r.id), r.name + ' · ' + r.interest + ' · ' + r.status];
    })), job ? String(job.id) : '', null);
    pick.addEventListener('change', function () { asst = { id: pick.value ? Number(pick.value) : null, msgs: [], busy: false }; render(); });
    view.appendChild(el('div', { class: 'admin-card asst' }, [
      el('p', { class: 'admin-hint', text: 'Ask anything about running a job: what to do next, what went wrong, or how to set something up in Cloudflare, Whogohost, another domain seller, Paystack or Netlify. It can see the job you pick (never any keys), but it can\'t press buttons for you. Never paste keys or passwords here.' }),
      field('About', pick)
    ]));
    var log = el('div', { class: 'asst-log', 'aria-live': 'polite' });
    if (!asst.msgs.length) {
      var starters = job
        ? (canDo('money') ? ['Suggest a price for this job (my saved prices first)'] : []).concat(['What should I do next for this job?', 'Is anything wrong with this job?', 'Their domain is stuck on waiting for nameservers. What should I check?', 'Write a WhatsApp message asking them for the missing details.'])
        : ['Walk me through a job from lead to handover', 'How do I change nameservers at Whogohost?', 'A customer bought their domain on GoDaddy. What do they need to do?', 'Which jobs need my attention today?'];
      log.appendChild(el('div', { class: 'asst-starters' }, starters.map(function (q) {
        return el('button', { class: 'admin-btn', type: 'button', text: q, onclick: function () { sendAssistant(q); } });
      })));
    }
    asst.msgs.forEach(function (m) {
      var b = el('div', { class: 'asst-msg asst-msg--' + m.role });
      if (m.role === 'assistant') { b.innerHTML = mdToHtml(m.content); b.appendChild(el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: 'Copy', onclick: function (e) { copyText(m.content, 'Answer', e.currentTarget); } })); }
      else b.textContent = m.content;
      log.appendChild(b);
    });
    if (asst.busy) log.appendChild(el('div', { class: 'asst-msg asst-msg--assistant', text: 'Thinking…' }));
    view.appendChild(log);
    var input = el('textarea', { rows: 3, placeholder: 'Ask a question, or describe what went wrong…', 'aria-label': 'Your question' });
    var form = el('form', { class: 'asst-form', onsubmit: function (e) { e.preventDefault(); var t = input.value; input.value = ''; sendAssistant(t); } }, [
      input,
      el('div', { class: 'admin-actions' }, [
        el('button', { class: 'btn btn--navy', type: 'submit', text: asst.busy ? 'Waiting…' : 'Ask', disabled: asst.busy }),
        asst.msgs.length ? el('button', { class: 'admin-btn', type: 'button', text: 'New conversation', onclick: function () { asst.msgs = []; render(); } }) : null
      ])
    ]);
    view.appendChild(form);
    var l = view.querySelector('.asst-log'); if (l) l.scrollTop = l.scrollHeight;
  }

  // ---------- Dashboard ----------
  function tile(label, value, note, onclick) {
    return el(onclick ? 'button' : 'div', { class: 'admin-tile', type: onclick ? 'button' : null, onclick: onclick },
      [el('span', { class: 'admin-tile-label', text: label }), el('strong', { text: String(value) }), note ? el('small', { text: note }) : null]);
  }
  // Which connections are set in Netlify (values are never sent to the browser).
  function setupCard() {
    var items = state.setup || [];
    if (!items.length) return null;
    var problems = items.filter(function (s) { return !s.ok || s.warn; }).length;
    var d = el('details', { class: 'admin-card admin-setup' });
    if (problems) d.open = true;
    d.appendChild(el('summary', null, [el('strong', { text: 'Setup status' }), ' ',
      badge(problems ? problems + ' to check' : 'All set', problems ? 'is-due' : 'is-won')]));
    items = items.filter(function (s) { return !s.ok; }).concat(items.filter(function (s) { return s.ok && s.warn; }), items.filter(function (s) { return s.ok && !s.warn; }));
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

  // Hosting is on Netlify's free plan while sales start. From the 2nd paid website project, suggest moving to a
  // paid home (Nigerian VPS yearly in naira, or Netlify Personal) until "Done" is tapped. TEST records don't count.
  function paidHomeNudge(rs) {
    if (!isOwner()) return null;
    if ((state.settings || {}).vercel_pro_at) return null;
    var paidProjects = rs.filter(function (r) { return r.status === 'won' && paid(r) > 0 && !/test/i.test((r.name || '') + ' ' + (r.business || '')); }).length;
    if (paidProjects < 2) return null;
    return el('div', { class: 'admin-card admin-callout admin-nudge' }, [
      el('strong', { text: 'Time to give the website a paid home' }),
      el('p', { text: 'You now have ' + paidProjects + ' paid website projects. The free Netlify plan pauses the site if its monthly credits run out. Move to a Nigerian VPS paid yearly in naira (ask Claude to set it up), or upgrade to Netlify Personal ($9 a month): Netlify → Team settings → Billing.' }),
      el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: "Done", onclick: function (e) {
        e.currentTarget.disabled = true;
        api('POST', { action: 'settings', settings: { vercel_pro_at: new Date().toISOString().slice(0, 10) } }).then(function (j) {
          state.settings = j.settings; flash('Great, reminder removed'); render();
        }).catch(fail);
      } })])
    ]);
  }

  function renderDashboard(view) {
    var rs = state.requests;
    var aw = awayInfo();
    if (aw) view.appendChild(el('div', { class: 'admin-card admin-callout' }, [el('strong', { text: isOwner() ? 'Away mode is on until ' + niceDay(aw.until) + '.' : 'The owner is away until ' + niceDay(aw.until) + ': you are the first contact.' }),
      el('div', { class: 'admin-actions' }, [isOwner()
        ? el('button', { class: 'admin-btn', type: 'button', text: 'Change or turn off', onclick: function () { state.settingsTab = 'staff'; setTab('settings'); } })
        : el('button', { class: 'admin-btn', type: 'button', text: 'What to do', onclick: function () { setTab('access'); } })])]));
    var sc = setupCard();
    if (sc) view.appendChild(sc);
    var vn = paidHomeNudge(rs);
    if (vn) view.appendChild(vn);
    var eu = emailUsageStrip();
    if (eu) view.appendChild(eu);
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
      tile('Client sites down', rs.filter(function (r) { return r.status === 'won' && r.site_status && r.site_status !== 'up'; }).length, 'checked every morning', function () { setTab('clients'); }),
      tile('Change requests waiting', rs.reduce(function (s, r) { return s + (r.open_changes || 0); }, 0), 'from clients\' change links', function () { setTab('clients'); })
    ].concat(state.totals ? [
      tile('Visitors this month', state.totals.visitorsMonth.toLocaleString('en-NG'), 'across all client websites'),
      tile('Store orders this month', state.totals.ordersMonth, state.totals.ordersMonth ? naira(state.totals.salesMonth) + ' paid online' : 'paid online')
    ] : [])));

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

    // Which ads and places bring customers (last 90 days): requests, and how many became paying customers.
    var since = Date.now() - 90 * 86400000, srcs = {};
    rs.forEach(function (r) {
      if (new Date(r.created_at) < since) return;
      var k = r.came_from || (r.source === 'manual' ? 'not set (added by you)' : 'direct / unknown');
      var o = srcs[k] = srcs[k] || { n: 0, won: 0, value: 0 };
      o.n++; if (r.status === 'won') { o.won++; o.value += Number(r.quote_amount || 0); }
    });
    var keys = Object.keys(srcs).sort(function (a, b) { return srcs[b].won - srcs[a].won || srcs[b].n - srcs[a].n; });
    view.appendChild(el('h2', { class: 'admin-h2', text: 'Where customers come from (90 days)' }));
    view.appendChild(keys.length ? el('ul', { class: 'admin-mini admin-from' }, keys.map(function (k) {
      var o = srcs[k];
      return el('li', null, [el('b', { text: k }), ' · ' + o.n + ' request' + (o.n === 1 ? '' : 's') + ' · ' + o.won + ' paid' + (o.won ? ' (' + naira(o.value) + ')' : '')]);
    })) : el('p', { class: 'admin-empty', text: 'No requests in the last 90 days.' }));
    view.appendChild(el('p', { class: 'admin-hint', text: 'Ads: add ?utm_source=facebook&utm_campaign=ibadan-test to the website link in your ad (any names you like) and it shows here. WhatsApp-only ads: set "Came from" on the customer.' }));
    var dbLine = el('p', { class: 'admin-hint' });
    view.appendChild(dbLine);
    if (isOwner()) api('POST', { action: 'mk_neon' }).then(function (j) {
      if (!j.configured || !j.usage) return;
      var u = j.usage, free = ((state.settings && state.settings.neon_plan) || 'free') === 'free', pct = Math.round(100 * u.cuh / j.free.cuh);
      dbLine.textContent = 'Database this month: ' + u.cuh + (free ? ' of ' + j.free.cuh + ' free hours (' + pct + '%)' + (pct >= 70 ? '. Upgrade soon: Packages → Database.' : '.') : ' hours (Launch plan).');
      if (free && pct >= 70) dbLine.className = 'admin-error';
    }).catch(function () {});

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
      !canDo('customers') ? null : el('button', { class: 'btn btn--navy', type: 'button', text: '+ Add customer', onclick: function () { addForm.hidden = !addForm.hidden; } }),
      isOwner() ? el('button', { class: 'admin-btn', type: 'button', text: 'Export CSV', onclick: exportCsv }) : null
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

  // How a customer found us. Ads add their own label from the ad link (?utm_source=…), e.g. "facebook / ibadan-test".
  var FROM_CHOICES = ['', 'whatsapp ad', 'facebook / instagram ad', 'google ads', 'google (search)', 'google maps', 'referral', 'flyer', 'walk-in', 'other'];
  var FROM_LABELS = { '': 'How did they find us? (optional)' };
  function fromSelect(value) {
    var list = FROM_CHOICES.slice();
    if (value && list.indexOf(value) === -1) list.push(value);
    var s = el('select', { 'aria-label': 'How did they find us?' });
    list.forEach(function (v) { var o = el('option', { value: v, text: FROM_LABELS[v] || v }); if (v === (value || '')) o.selected = true; s.appendChild(o); });
    return s;
  }
  function renderAddForm() {
    var name = el('input', { required: true, placeholder: 'Name' });
    var contact = el('input', { required: true, placeholder: 'Phone (WhatsApp) or email' });
    var email = el('input', { type: 'email', placeholder: 'Email (optional, for receipts)' });
    var business = el('input', { placeholder: 'Business (optional)' });
    var interest = select(PACKAGES, 'Starter website', { 'aria-label': 'Package' });
    var details = el('textarea', { rows: 2, placeholder: 'What they need' });
    var from = fromSelect('');
    var form = el('form', { class: 'admin-card admin-add', hidden: true }, [
      el('h2', { text: 'Add a customer' }), name, contact, email, business, interest, from, details,
      el('button', { class: 'btn btn--navy', type: 'submit', text: 'Save' })
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      api('POST', { action: 'create', name: name.value, contact: contact.value, email: email.value, business: business.value, interest: interest.value, details: details.value, came_from: from.value })
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
    if (r.came_from && r.came_from !== 'direct') badges.appendChild(badge('From: ' + r.came_from, 'is-from'));
    if (r.wants) badges.appendChild(badge(r.wants === 'customer_accounts' ? 'Wants customer accounts' : 'Wants a custom system', 'is-due'));
    if (r.follow_up_on && isOpen(r)) {
      var d = daysUntil(r.follow_up_on);
      badges.appendChild(badge(d < 0 ? 'Follow-up ' + (-d) + 'd overdue' : d === 0 ? 'Follow up today' : 'Follow up ' + niceDate(r.follow_up_on), d <= 0 ? 'is-due' : ''));
    }
    if (r.quote_amount != null) badges.appendChild(badge('Quote ' + naira(r.quote_amount) + ' · paid ' + naira(paid(r, 'project'))));
    card.appendChild(badges);

    var meta = el('p', { class: 'admin-meta' }, [r.contact + (r.email && r.email !== r.contact ? ' · ' + r.email : '') + ' · ' + (r.business || 'No business given') + ' · ' + when(r.created_at)]);
    card.appendChild(meta);
    card.appendChild(el('p', { class: 'admin-details', text: r.details }));
    var ideas = r.chat_ideas || {}, ik = Object.keys(IDEA_LABELS).filter(function (k) { return ideas[k]; });
    if (ik.length) {
      var idd = el('details', { class: 'admin-ideas' }, [el('summary', { text: 'From the chat (' + ik.length + ')' + (ideas.recommended ? ' · suggested: ' + ideas.recommended.split(':')[0] : '') })]);
      idd.appendChild(el('dl', null, ik.reduce(function (a, k) { a.push(el('dt', { text: IDEA_LABELS[k] })); a.push(el('dd', { text: ideas[k] })); return a; }, [])));
      card.appendChild(idd);
      var rec = recommendedPackage(ideas.recommended);
      if (rec && (r.quote_amount == null || r.interest !== rec) && r.status !== 'won' && r.status !== 'lost') {
        card.appendChild(el('div', { class: 'admin-actions admin-rec' }, [el('button', { class: 'admin-btn admin-btn--small', type: 'button',
          text: 'Use suggested ' + rec.replace(' website', '') + ' · ' + naira(DEFAULT_QUOTE[rec]),
          onclick: function () {
            var f = { interest: rec, quote_amount: DEFAULT_QUOTE[rec] };
            if (r.status === 'new' || r.status === 'contacted') f.status = 'quoted';
            update(r, f, 'Package and quote set. Send the invoice from the card.');
          } })]));
      } else if (rec && r.quote_amount != null && r.status === 'quoted' && !(r.payments || []).length && waNumber(r.contact)) {
        card.appendChild(el('div', { class: 'admin-actions admin-rec' }, [el('button', { class: 'admin-btn admin-btn--small admin-btn--wa', type: 'button',
          text: 'Send invoice on WhatsApp (' + naira(r.quote_amount) + ')', onclick: function () { docAction(r, 'invoice', 'whatsapp'); } })]));
      }
    }
    card.appendChild(whatsAppRow(r));
    card.appendChild(el('button', { class: 'admin-btn admin-btn--small admin-ask', type: 'button', text: 'Ask assistant about this job', onclick: function () { askAbout(r, 'What should I do next for this job, and is anything wrong?'); } }));

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
      deposit: quote ? naira(depositAmount(r)) : '-', deposit_pct: depositPct(r) + '%', paid: naira(paid(r, 'project')), balance: naira(balance(r)),
      renewal_amount: naira(r.renewal_amount), renewal_due: r.renewal_due ? niceDate(r.renewal_due) : '-',
      brief_link: r.brief_token ? briefUrl(r) : '(no project form link yet)',
      last_payment: payments(r).length ? naira(payments(r)[payments(r).length - 1].amount) : '-',
      doc_link: r._docType && r.doc_token ? docUrl(r, r._docType) : '',
      preview_link: r.preview_token ? previewUrl(r) : '(no preview link yet)',
      website: r.website_url || '(add their website address)',
      pay_link: r.doc_token ? location.origin + '/pay?t=' + r.doc_token + (r._docType === 'renewal' ? '&for=renewal' : '') : '',
      review_link: r.review_link || '(reload admin to get their review link)'
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
    var keys = Object.keys(TEMPLATES).filter(function (k) { var t = TEMPLATES[k].text + (state.settings[k] || ''); return (canDo('money') || !/\{(amount|deposit|balance|renewal_amount|renewal_due|paid|pay_link|doc_link|last_payment)\}/.test(t)) && (canDo('build') || !/\{preview_link\}/.test(t)); });
    var pick = suggestedTemplate(r); if (keys.indexOf(pick) === -1) pick = keys[0];
    var sel = select(keys.map(function (k) { return [k, TEMPLATES[k].label]; }), pick, { 'aria-label': 'Message for ' + r.name });
    var go = el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: num ? 'WhatsApp' : 'Email' });
    go.addEventListener('click', function () {
      var text = fill(state.settings[sel.value] || TEMPLATES[sel.value].text, r);
      var url = num ? 'https://wa.me/' + num + '?text=' + encodeURIComponent(text)
        : 'mailto:' + email + '?subject=' + encodeURIComponent('SIRRADDO: ' + r.interest) + '&body=' + encodeURIComponent(text);
      window.open(url, '_blank', 'noopener');
      if (r.status === 'new' && canDo('customers')) update(r, { status: 'contacted' }, 'Marked as contacted');
    });
    return el('div', { class: 'admin-wa' }, [sel, go]);
  }

  function manageBody(r) {
    var wrap = el('div', { class: 'admin-manage-body' });

    // Status and follow-up
    var status = select(state.statuses, r.status, null);
    if (!canDo('money') && r.status !== 'won') Array.prototype.forEach.call(status.options, function (o) { if (o.value === 'won') o.disabled = true; });
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

    // Quote and payments (staff without Money don't see them)
    if (canDo('money')) {
    var quote = el('input', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: r.quote_amount == null ? '' : r.quote_amount, placeholder: DEFAULT_QUOTE[r.interest] || '' });
    quote.addEventListener('change', function () { update(r, { quote_amount: quote.value }, 'Quote saved'); });
    var bal = balance(r);
    // Instalments (Playbook): the deposit share to start, and an optional next instalment (e.g. 30% at preview approval).
    var dpct = select([['70', '70% (usual)'], ['50', '50%'], ['60', '60%'], ['100', '100% upfront'], ['30', '30%']], String(depositPct(r)), { 'aria-label': 'Deposit to start' });
    dpct.addEventListener('change', function () { update(r, { deposit_pct: dpct.value }, 'Deposit set to ' + dpct.value + '%'); });
    var nextPay = el('input', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: r.next_payment == null ? '' : r.next_payment, placeholder: 'Optional' });
    nextPay.addEventListener('change', function () { update(r, { next_payment: nextPay.value }, nextPay.value ? 'Next instalment saved: their invoice and pay link ask for ' + naira(Number(nextPay.value)) : 'Next instalment cleared: they pay the whole balance'); });
    wrap.appendChild(el('div', { class: 'admin-grid' }, [
      field('Quote (₦)', quote, r.quote_amount ? depositPct(r) + '% deposit: ' + naira(depositAmount(r)) : 'Package price, e.g. ' + naira(DEFAULT_QUOTE[r.interest] || 50000)),
      el('div', { class: 'admin-field' }, [el('span', { text: 'Balance' }), el('strong', { class: bal ? 'admin-owed' : '', text: naira(bal) })]),
      field('Deposit to start', dpct, 'Instalments: 50% for ₦150,000+ (Playbook)'),
      field('Next instalment (₦)', nextPay, 'e.g. 30% when they approve the preview. Empty = the whole balance.')
    ]));
    wrap.appendChild(paymentsBlock(r));

    // Documents
    wrap.appendChild(docsBlock(r));
    }

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
    var fr = fromSelect(r.came_from || '');
    var saveBtn = el('button', { class: 'admin-btn', type: 'button', text: 'Save details', onclick: function () {
      update(r, { name: n.value, contact: c.value, email: em.value, business: b.value, interest: i.value, details: dt.value, came_from: fr.value }, 'Details saved');
    } });
    [field('Name', n), field('Phone (WhatsApp)', c), field('Email', em), field('Business', b), field('Package', i), field('Came from', fr, 'Set by itself from ad links and Google; choose one for WhatsApp and walk-in customers.'), field('Summary', dt), saveBtn].forEach(function (x) { edit.appendChild(x); });
    wrap.appendChild(edit);

    // Conversation
    if (r.transcript && r.transcript.length) wrap.appendChild(transcript(r.transcript, 'Conversation (' + r.transcript.length + ' messages)'));

    // Delete
    if (isOwner()) wrap.appendChild(el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Delete request', onclick: function () {
      if (!window.confirm('Delete ' + r.name + '? This cannot be undone.')) return;
      api('DELETE', null, '?id=' + r.id).then(function () {
        state.requests = state.requests.filter(function (x) { return x.id !== r.id; });
        flash('Deleted'); render();
      }).catch(fail);
    } }));
    // Without Customers: the details are read-only (the server refuses changes anyway).
    if (!canDo('customers')) {
      Array.prototype.forEach.call(wrap.querySelectorAll('input, select, textarea'), function (x) { x.disabled = true; });
      Array.prototype.forEach.call(wrap.querySelectorAll('.admin-quick button, .admin-sub button'), function (x) { x.disabled = true; });
      wrap.insertBefore(el('p', { class: 'admin-hint', text: 'View only: your account can\u2019t change customer details. Message the owner if something needs updating.' }), wrap.firstChild);
    }
    return wrap;
  }

  // Project brief: the form the customer fills in after paying the deposit.
  function briefBlock(r) {
    var box = el('div', { class: 'admin-brief' }, [el('span', { class: 'admin-label', text: 'Project form' })]);
    if (!r.brief_token) {
      box.appendChild(el('p', { class: 'admin-empty', text: 'Created automatically when the deposit is recorded.' }));
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
    // Big changes after launch (new products, photos, pages): open their form yourself, change it, Save; then
    // Website text → Write missing pages / Edit text if needed, and Go live → Update live site.
    if (r.brief_submitted_at) actions.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Open form to edit', onclick: function () { window.open(briefUrl(r), '_blank', 'noopener'); } }));
    box.appendChild(actions);
    if (r.brief_submitted_at) box.appendChild(draftRow(r));
    return box;
  }

  // AI-written website text from the project form.
  function draftRow(r) {
    if (!canDo('build')) return el('p', { class: 'admin-hint', text: r.has_draft ? 'Website text: ready (the owner handles the text, design and preview).' : 'Website text: not written yet (the owner handles this).' });
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
    // Some pages failed (the AI was busy): write only those, keeping everything else.
    if (r.has_draft && r.draft_missing) {
      var fill = el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Write missing pages' });
      fill.addEventListener('click', function () {
        fill.disabled = true; fill.textContent = 'Writing…';
        api('POST', { action: 'write_draft', id: r.id, missingOnly: true }).then(function (row2) { replaceRequest(row2); flash(row2.draft_missing ? 'Some pages are still missing: try again in a minute' : 'Missing pages written'); render(); })
          .catch(function (e) { fill.disabled = false; fill.textContent = 'Try again'; fail(e); });
      });
      acts.insertBefore(fill, write);
      row.appendChild(el('p', { class: 'admin-hint', text: 'Some pages weren\'t written because the AI was busy. Tap "Write missing pages": the rest of the text stays as it is.' }));
    }
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
    // Websites the customer said they like (project form). The AI can't open links: look at them yourself and
    // write 2–3 things to borrow (e.g. "dark header, big photo at the top, rounded gold buttons").
    var liked = String((r.brief_wants || {}).examples || '').trim();
    var note = el('textarea', { rows: '2', maxlength: '600', placeholder: liked ? 'What to borrow from the sites they like, e.g. dark header, big photo at the top, rounded gold buttons' : 'Optional: describe the look you want, e.g. clean white, big photos, green buttons' });
    if (choices.length < 3) {
      if (liked) {
        var links = el('p', { class: 'admin-meta' }, [el('b', { text: 'Websites they like: ' })]);
        liked.split(/(https?:\/\/[^\s,]+)/).forEach(function (part) {
          if (/^https?:\/\//.test(part)) links.appendChild(el('a', { href: part, target: '_blank', rel: 'noopener noreferrer', text: part }));
          else if (part) links.appendChild(document.createTextNode(part));
        });
        dsg.appendChild(links);
      }
      dsg.appendChild(field('Design notes for the AI', note, liked ? 'Open their links, then note the colours, header, photos and buttons they like. The AI uses this as inspiration, never a copy.' : 'Optional.'));
      // Screenshots of the parts they like: the AI looks at these before designing (up to 3 of yours + 3 from their form).
      var shots = el('div', { class: 'admin-shots' });
      (r.example_shots || []).forEach(function (f) { shots.appendChild(el('a', { href: f.url, target: '_blank', rel: 'noopener', class: 'admin-shot' }, [el('img', { src: f.url, alt: f.name || 'screenshot', loading: 'lazy' }), el('span', { text: 'From their form' })])); });
      (r.design_refs || []).forEach(function (f) {
        shots.appendChild(el('span', { class: 'admin-shot' }, [el('img', { src: f.url, alt: f.name || 'screenshot', loading: 'lazy' }),
          el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: 'Remove', onclick: function (e) { designAct({ action: 'design_ref_remove', url: f.url }, 'Screenshot removed', e.currentTarget); } })]));
      });
      var pick = el('input', { type: 'file', accept: 'image/*', hidden: true });
      pick.addEventListener('change', function () {
        var file = pick.files && pick.files[0]; if (!file) return;
        flash('Uploading screenshot…');
        shrinkImage(file, 1600).then(function (img) {
          return api('POST', { action: 'design_ref_add', id: r.id, name: file.name, type: img.type, data: img.data });
        }).then(function (row) { replaceRequest(row); flash('Screenshot added: the AI design will look at it'); render(); }).catch(fail);
      });
      var nShots = (r.design_refs || []).length;
      dsg.appendChild(el('span', { class: 'admin-label', text: 'Screenshots of what they like' }));
      if ((r.example_shots || []).length || nShots) dsg.appendChild(shots);
      dsg.appendChild(el('div', { class: 'admin-actions' }, [pick, el('button', { class: 'admin-btn', type: 'button', text: '+ Add screenshot', disabled: nShots >= 3, onclick: function () { pick.click(); } })]));
      dsg.appendChild(el('p', { class: 'admin-hint', text: 'Open the site they like, screenshot the part they love (top of the page, a section, the colours) and add it here. The AI looks at it and makes theirs in the same spirit, in their own brand. Up to 3.' }));
    }
    var dz = el('div', { class: 'admin-actions' });
    if (choices.length < 3) {
      var dbtn = el('button', { class: 'admin-btn', type: 'button', text: choices.length ? 'Add another AI design' : 'AI design (custom look)', onclick: function () {
        var label = dbtn.textContent; dbtn.disabled = true; dbtn.textContent = 'Designing… (up to a minute)';
        api('POST', { action: 'design', id: r.id, note: note.value }).then(function (row) { replaceRequest(row); flash('New design ready. Tap "Open preview" to see it.'); render(); })
          .catch(function (e) { dbtn.disabled = false; dbtn.textContent = label; fail(e); });
      } });
      dz.appendChild(dbtn);
      if (!choices.some(function (c) { return c.by === 'Dark'; })) dz.appendChild(el('button', { class: 'admin-btn', type: 'button', text: choices.length ? 'Add dark design' : 'Offer standard + dark designs', onclick: function (e) { designAct({ action: 'design_option', op: 'add_dark' }, choices.length ? 'Dark design added as an option' : 'Standard and dark designs added. The customer can switch between them on the preview.', e.currentTarget); } }));
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
  function downloadSite(r, btn) { downloadFile('/api/requests?view=export&id=' + r.id, 'website.zip', btn); }
  function downloadFile(url, fallback, btn) {
    var was = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
    fetch(url, { headers: { 'Authorization': 'Bearer ' + password } }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { throw Object.assign(new Error(j.error || 'Download failed'), { status: res.status }); });
      var name = ((res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || fallback;
      return res.blob().then(function (b) {
        var a = el('a', { href: URL.createObjectURL(b), download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
        flash('Downloaded ' + name);
      });
    }).catch(fail).then(function () { btn.disabled = false; btn.textContent = was; });
  }

  // Go live on Cloudflare: domain -> publish -> (email forwarding). Pause/restore for renewals.
  function goLiveBlock(r) {
    var h = r.hosting || {};
    var box = el('div', { class: 'admin-golive' }, [el('span', { class: 'admin-label', text: 'Go live' })]);
    // The last thing that went wrong (why the badge says "Problem"), in plain words.
    if ((r.hosting || {}).lastError) box.appendChild(el('p', { class: 'admin-error', text: 'Last problem' + (r.hosting.lastErrorAt ? ' (' + new Date(r.hosting.lastErrorAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) + ')' : '') + ': ' + r.hosting.lastError.replace(/^Cloudflare:\s*/, '') }));
    if (!state.canHost) {
      box.appendChild(el('p', { class: 'admin-hint', text: 'Connect Cloudflare once (Dashboard → Setup status → Customer websites) to publish customer websites in one tap. Until then, use "Download site (.zip)" and upload it by hand.' }));
      return box;
    }
    function act(body, okMsg, btn, busy) {
      var was = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; if (busy) btn.textContent = busy; }
      return api('POST', Object.assign({ id: r.id }, body)).then(function (j) {
        if (j.row) replaceRequest(j.row);
        flash(typeof okMsg === 'function' ? okMsg(j) : okMsg); render(); return j;
      }).catch(function (e) { if (btn) { btn.disabled = false; btn.textContent = was; } fail(e); });
    }
    // 1. Domain
    if (!h.domain) {
      var guess = (r.handover && r.handover.domain) || '';
      var din = el('input', { value: guess, placeholder: 'theirbusiness.com.ng', autocapitalize: 'none', spellcheck: 'false' });
      box.appendChild(field('1. Their domain', din, 'Buy it first (in their business name) if they don\'t have one. You can also publish without a domain and add it later.'));
      box.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Add domain to Cloudflare', onclick: function (e) {
        act({ action: 'host_domain', domain: din.value }, 'Domain added. Now set the nameservers below.', e.currentTarget, 'Adding…');
      } })]));
    } else {
      var active = h.zoneStatus === 'active';
      var meta = [el('b', { text: h.domain }), ' ', active ? badge('Active', 'is-won') : badge('Waiting for nameservers', 'is-due')];
      if (h.attached) meta.push(' ', badge(h.domainStatus === 'active' || !h.domainStatus ? 'Connected' : 'Connecting (' + h.domainStatus + ')', h.domainStatus && h.domainStatus !== 'active' ? 'is-new' : 'is-won'));
      box.appendChild(el('p', { class: 'admin-meta' }, meta));
      if (!active && (h.nameservers || []).length) {
        var ns = h.nameservers.join('\n');
        box.appendChild(el('p', { class: 'admin-hint', text: 'At the domain company (e.g. Whogohost → Domains → Nameservers → custom), replace the nameservers with these 2. It usually takes 1–24 hours; this updates by itself every morning, or tap Check now.' }));
        box.appendChild(el('pre', { class: 'admin-ns', text: ns }));
        var nsActs = el('div', { class: 'admin-actions' }, [
          el('button', { class: 'admin-btn', type: 'button', text: 'Copy nameservers', onclick: function (e) { copyText(ns, 'Nameservers', e.currentTarget); } }),
          el('button', { class: 'admin-btn', type: 'button', text: 'Check now', onclick: function (e) { act({ action: 'host_check' }, function (j) { return j.row && j.row.hosting && j.row.hosting.zoneStatus === 'active' ? 'Domain is active!' : 'Still waiting for the nameservers'; }, e.currentTarget, 'Checking…'); } })]);
        var num = waNumber(r.contact);
        if (num) nsActs.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Ask customer on WhatsApp', onclick: function () {
          window.open('https://wa.me/' + num + '?text=' + encodeURIComponent('Hello ' + String(r.name).split(' ')[0] + ', to connect your website to ' + h.domain + ', please log in where you bought the domain and change its nameservers to:\n' + ns + '\nOr send me the login and I will do it for you.'), '_blank');
        } }));
        box.appendChild(nsActs);
      }
    }
    // 2. Publish / update
    var bal = balance(r), owing = r.quote_amount != null && bal > 0;
    var changed = h.publishedAt && [r.draft_at, r.design_at].some(function (t) { return t && Date.parse(t) > Date.parse(h.publishedAt); });
    if (h.publishedAt) {
      var info = [el('span', { text: (h.pausedAt ? 'Paused ' + when(h.pausedAt) : 'Published ' + when(h.publishedAt)) + ' · ' })];
      info.push(el('a', { href: h.attached ? 'https://' + h.domain : h.pagesUrl, target: '_blank', rel: 'noopener', text: h.attached ? h.domain : String(h.pagesUrl || '').replace('https://', '') }));
      if (changed && !h.pausedAt) info.push(' ', badge('Changes not published', 'is-due'));
      if (owing && !h.pausedAt && h.owingSince) {
        var left = 7 - Math.floor((Date.now() - Date.parse(h.owingSince)) / 86400000);
        info.push(' ', badge('Balance owed: pauses in ' + Math.max(0, left) + ' day' + (left === 1 ? '' : 's'), 'is-due'));
      }
      box.appendChild(el('p', { class: 'admin-meta' }, info));
      // Google Search Console: submitted by itself once the domain works.
      var gsc = h.google || {};
      if (h.domain) box.appendChild(el('p', { class: 'admin-hint', text: 'Google: ' + (gsc.step === 'done' ? 'submitted to Search Console ✓ (sitemap sent' + (gsc.ownersError ? '; owners not added: ' + gsc.ownersError : '') + ')' : gsc.error ? 'trying again by itself (' + gsc.error + ')' : 'will be submitted by itself once the domain works') + '.' }));
      // Website improvements: automatic (default) or the owner chose "Ask me first" in their Manage link.
      box.appendChild(el('p', { class: 'admin-hint', text: 'Improvements: ' + (h.lookMode === 'ask' ? 'the owner asked to approve them first' + (h.lookAsked && h.lookAsked !== h.look ? ' (new version offered, not applied yet)' : '') : 'applied automatically at 7am after our updates; the owner is emailed what changed') + '.' }));
    }
    var pubActs = el('div', { class: 'admin-actions' });
    if (!h.pausedAt) pubActs.appendChild(el('button', { class: 'btn btn--navy admin-golive-btn', type: 'button', text: h.publishedAt ? 'Update live site' : '2. Publish website', onclick: function (e) {
      var force = false;
      if (owing) { if (!window.confirm('The balance (' + naira(bal) + ') isn\'t paid yet.\n\nThe site will go only on the free .pages.dev address, not their domain. Their domain connects by itself once the balance is paid. If it\'s still unpaid after 7 days, the site pauses itself.\n\nPublish on .pages.dev now?')) return; force = true; }
      var btn = e.currentTarget, first = null;
      var msg = function (j) { return (first ? 'Live! Marked Live, renewal date set. ' : 'Updated. ') + (j.owed ? 'On ' + j.url + ' only until the balance is paid.' : j.waitingForDomain ? 'It\'s on ' + j.url + ' until the domain is active, then it connects by itself.' : j.url) + (j.photosLeft ? ' ' + j.photosLeft + ' photos are still uploading: they show from our server until then.' : ''); };
      // Big stores: each publish uploads photos for a few seconds; keep going until all are on the site.
      (function go(n) {
        act({ action: 'host_publish', force: force }, function (j) { if (first === null) first = j.firstTime; return msg(j); }, btn, n ? 'Uploading photos… ' + n : 'Publishing… (up to a minute)').then(function (j) {
          if (j && j.photosLeft > 0 && n < 60) { btn = document.querySelector('.admin-golive-btn') || btn; btn.disabled = true; btn.textContent = 'Uploading photos: ' + (j.photosTotal - j.photosLeft) + ' of ' + j.photosTotal + '…'; go(n + 1); }
        });
      })(0);
    } }));
    // Undo: put the version before the current one back live (e.g. the owner dislikes a new look). Cloudflare keeps them.
    var hist = h.history || [], ci = hist.map(function (v) { return v.id; }).indexOf(h.deploymentId), prevV = hist[ci >= 0 ? ci + 1 : 1];
    if (h.publishedAt && !h.pausedAt && prevV) pubActs.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Restore previous version', onclick: function (e) {
      if (!window.confirm('Put back the version published ' + new Date(prevV.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '?\n\nUse this when the owner dislikes a recent change or new look. Their website will then wait for their OK before our next improvements (Ask me first).\n\nNote: tapping "Update live site" or the owner saving in their Manage link publishes the newest version again.')) return;
      act({ action: 'host_rollback' }, 'Previous version is live again (Ask me first is now on)', e.currentTarget, 'Restoring…');
    } }));
    if (h.project) pubActs.appendChild(el('button', { class: 'admin-btn', type: 'button', text: h.noCredit ? 'Show "Website by SIRRADDO"' : 'Hide "Website by SIRRADDO"', onclick: function (e) {
      if (!h.noCredit && !window.confirm('Remove "Website by SIRRADDO · Get a website like this" from the footer of this site (white label, e.g. sold through an agency)? The live site is updated.')) return;
      act({ action: 'site_credit', on: Boolean(h.noCredit) }, h.noCredit ? 'Credit shown again' : 'Credit hidden', e.currentTarget, 'Updating…');
    } }));
    if (h.publishedAt && !h.pausedAt) pubActs.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Pause site', onclick: function (e) {
      if (!window.confirm('Pause ' + (h.domain || 'this site') + '? Visitors will see "temporarily unavailable" and email forwarding stops until you restore it.')) return;
      act({ action: 'host_pause' }, 'Site paused', e.currentTarget, 'Pausing…');
    } }));
    // Domain still connecting, or email waiting for confirmation: check again now instead of waiting for the morning.
    if (h.zoneStatus === 'active' && ((h.project && !h.attached) || (h.email && h.email.status === 'verifying') || (h.attached && !h.pausedAt && (!h.google || h.google.step !== 'done')))) pubActs.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Check now', onclick: function (e) {
      act({ action: 'host_check' }, function (j) { var hh = (j.row && j.row.hosting) || {}; return (hh.attached ? 'Connected to ' + hh.domain + '. ' : 'Still connecting (the padlock can take up to an hour). ') + (hh.email && hh.email.status === 'active' ? 'Email forwarding is working.' : hh.email && hh.email.status === 'verifying' ? 'Email: still waiting for the confirmation.' : ''); }, e.currentTarget, 'Checking…');
    } }));
    if (h.pausedAt) pubActs.appendChild(el('button', { class: 'btn btn--navy admin-golive-btn', type: 'button', text: 'Restore site', onclick: function (e) { act({ action: 'host_restore' }, 'Site restored', e.currentTarget, 'Restoring…'); } }));
    box.appendChild(pubActs);
    var why = h.pauseReason === 'balance' ? 'Paused because the balance wasn\'t paid within 7 days. It comes back by itself when the balance is paid.'
      : h.pauseReason === 'manual' ? 'Paused by you. Tap Restore to switch it back on.'
      : 'Paused because the renewal is overdue. It restores by itself when the renewal is paid (online or "Renewal paid").';
    box.appendChild(el('p', { class: 'admin-hint', text: h.pausedAt ? why
      : h.publishedAt ? 'After editing the text or design, tap "Update live site". Sites pause automatically 15 days after an unpaid renewal and come back when paid.'
      : 'Publishing uploads the approved design to Cloudflare, connects their domain (once active and the balance is paid), marks the project Live and sets the renewal date.' + (owing ? ' Balance still owed: ' + naira(bal) + ', so it can only go on the free .pages.dev address for now.' : '') }));
    // 3. Email forwarding
    if (h.domain && h.zoneStatus === 'active') {
      var em = h.email;
      if (em && em.status) {
        var lbl = em.status === 'active' ? badge('Working', 'is-won') : em.status === 'paused' ? badge('Paused', 'is-due') : badge('Waiting for them to confirm', 'is-new');
        // Grouped by inbox: "info@x, sales@x → owner@gmail.com · receipts@x → acc@gmail.com"
        var routes = em.routes || {}, groups = {};
        em.locals.forEach(function (l) { var to = routes[l] || em.to; (groups[to] = groups[to] || []).push(l + '@' + h.domain); });
        var inboxes = Object.keys(groups);
        box.appendChild(el('p', { class: 'admin-meta' }, [el('b', { text: 'Email: ' }), inboxes.map(function (to) { return groups[to].join(', ') + ' → ' + to; }).join(' · ') + ' ', lbl]));
        if (em.status === 'verifying') box.appendChild(el('p', { class: 'admin-hint', text: 'Cloudflare emailed ' + inboxes.join(' and ') + ' a link to confirm (sender: Cloudflare, subject like "Verify your email address"; check Spam and Promotions). Inboxes confirmed before need nothing. Once every inbox is confirmed, forwarding starts by itself (or tap Check now). No email after 10 minutes? Tap "Save and check" below to send a new one.' }));
      }
      // Starter includes 1 address, Business and Online Store up to 5. Prefilled with what they asked for on the project form.
      var allow = emailAllowance(r.interest);
      var asked = wantedEmails(r);
      var start = em ? em.locals.concat(asked.filter(function (x) { return em.locals.indexOf(x) < 0; })) : (asked.length ? asked : ['info']);
      var more = em && em.status !== 'verifying';
      var emailForm = function (into) {
        var lin = el('input', { value: start.slice(0, Math.max(allow, em ? em.locals.length : 1) || 1).join(', '), placeholder: 'info, sales' });
        var tin = el('input', { type: 'email', value: em ? em.to : (r.email || ''), placeholder: 'theirname@gmail.com' });
        into.appendChild(el('div', { class: 'admin-grid' }, [field('3. Business email addresses', lin, 'Before the @, e.g. info, sales' + (allow ? ' · package includes ' + allow : '') + (asked.length ? ' · they asked for ' + asked.join(', ') : '')), field('Forward to (their inbox)', tin)]));
        var rts = em && em.routes ? Object.keys(em.routes).map(function (l) { return l + ' ' + em.routes[l]; }).join('\n') : '';
        var rin = el('textarea', { rows: 2, placeholder: 'receipts accountant@gmail.com\norders manager@gmail.com' }); rin.value = rts;
        into.appendChild(field('Different inbox for some addresses (optional)', rin, 'One per line: the address name, then the inbox. Everything else goes to the inbox above. Each new inbox gets one confirmation email from Cloudflare.'));
        if (more) into.appendChild(el('p', { class: 'admin-hint', text: 'Keep the addresses already working in the list and add the new ones. Same inbox: no new confirmation needed.' }));
        return { lin: lin, tin: tin, rin: rin };
      };
      if (more) {
        var fold = el('details', { class: 'admin-fold' }, [el('summary', { text: 'Add or change email addresses (' + em.locals.length + (allow ? ' of ' + allow : '') + ' set up)' })]);
        box.appendChild(fold);
      }
      if (!em || em.status === 'verifying' || more) {
        var holder = more ? fold : box;
        var ef = emailForm(holder);
        var lin = ef.lin, tin = ef.tin, rin = ef.rin;
        var eacts = el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: more ? 'Save addresses' : em ? 'Save and check' : 'Set up email forwarding', onclick: function (e) {
          act({ action: 'host_email', locals: lin.value, to: tin.value, routes: rin.value }, function (j) { var s = j.row && j.row.hosting && j.row.hosting.email; return s && s.status === 'active' ? 'Email forwarding is working' : 'Cloudflare sent a confirmation email to ' + (s ? [s.to].concat(Object.keys(s.routes || {}).map(function (k) { return s.routes[k]; })).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(' and ') : 'their inbox') + ' (from Cloudflare; check Spam and Promotions)'; }, e.currentTarget, 'Setting up…');
        } })]);
        holder.appendChild(eacts);
      }
    }
    return box;
  }

  // "Manage my store" (Online Store) / "Manage my website" (others): a private link where the owner changes urgent things
  // themselves (prices and sold out for stores; hours, numbers, slogan, notice and which reviews show for everyone).
  function manageBlock(r, box) {
    var sh = r.shop || {};
    var store = r.interest === 'Online Store';
    var title = store ? 'Manage my store' : 'Manage my website';
      var out = el('p', { class: 'admin-hint', text: sh.manage ? 'They have a link (made ' + new Date(sh.manage.created).toLocaleDateString('en-NG') + '). It\'s also in the handover pack.' : '' });
      var get = function (renew, then) { api('POST', { action: 'manage_link', id: r.id, renew: renew }).then(function (j) { if (j.row) replaceRequest(j.row); then(j.url); }).catch(fail); };
      var msg = function (url) { return 'Hello ' + String(r.name).split(' ')[0] + ', here is your private link to manage your ' + (store ? 'store: change prices, mark items sold out, ' : 'website: ') + 'update your opening hours and numbers, change your slogan, add a short notice, and choose which customer reviews show. Your website updates within a minute:\n' + url + '\nPlease keep it private. For new products, photos or text, use your "Request a change" link.'; };
      var acts = el('div', { class: 'admin-actions' });
      if (waNumber(r.contact)) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send "' + title + '" link', onclick: function () { var win = window.open('', '_blank'); get(false, function (url) { var u = 'https://wa.me/' + waNumber(r.contact) + '?text=' + encodeURIComponent(msg(url)); if (win) win.location = u; else window.location = u; }); } }));
      acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy link', onclick: function () { get(false, function (url) { if (navigator.clipboard) navigator.clipboard.writeText(msg(url)).then(function () { flash('Message with the link copied'); }); }); } }));
      if (sh.manage) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'New link (old stops)', onclick: function () { if (window.confirm('Make a new link? The old one stops working.')) get(true, function () { flash('New link made: send it to them'); render(); }); } }));
      box.appendChild(el('p', { class: 'admin-meta' }, [el('b', { text: title + ': ' }), 'a private link where they change ' + (store ? 'prices, sold out, ' : '') + 'opening hours, phone/WhatsApp, slogan, a short notice and which customer reviews show, themselves. Their live site updates within a minute and you get an email of what changed.']));
      box.appendChild(acts);
      box.appendChild(out);
      // Their website's customer reviews: show, hide or delete (e.g. someone asked us to remove theirs).
      var rvBox = el('div', { class: 'admin-orders' });
      var drawRv = function (j) {
        rvBox.innerHTML = '';
        if (j.republished && j.republished !== true) rvBox.appendChild(el('p', { class: 'admin-error', text: 'Saved, but the live site didn\'t update: ' + j.republished }));
        if (!j.reviews.length) { rvBox.appendChild(el('p', { class: 'admin-hint', text: 'No reviews yet.' })); return; }
        j.reviews.forEach(function (x) {
          var st = { pending: ['New', 'is-new'], shown: ['On website', 'is-won'], hidden: ['Hidden', ''] }[x.status] || ['', ''];
          var setRv = function (status, btn) {
            if (status === 'delete' && !window.confirm('Delete this review for good?')) return;
            btn.disabled = true;
            api('POST', { action: 'site_review_set', id: r.id, reviewId: x.id, status: status }).then(function (j2) { flash(status === 'delete' ? 'Review deleted' : status === 'shown' ? 'Shown on their website' : 'Hidden'); drawRv(j2); }).catch(function (e) { btn.disabled = false; fail(e); });
          };
          rvBox.appendChild(el('div', { class: 'admin-golive' }, [
            el('p', null, [el('b', { text: new Array(x.stars + 1).join('\u2605') + new Array(6 - x.stars).join('\u2606') + '  ' + x.name }), ' ', badge(st[0], st[1])]),
            x.body ? el('p', { text: x.body }) : null,
            el('div', { class: 'admin-actions' }, [
              x.status !== 'shown' ? el('button', { class: 'admin-btn', type: 'button', text: 'Show on website', onclick: function (e) { setRv('shown', e.currentTarget); } }) : null,
              x.status !== 'hidden' ? el('button', { class: 'admin-btn', type: 'button', text: 'Hide', onclick: function (e) { setRv('hidden', e.currentTarget); } }) : null,
              el('button', { class: 'admin-btn', type: 'button', text: 'Delete', onclick: function (e) { setRv('delete', e.currentTarget); } })
            ])
          ]));
        });
      };
      box.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Customer reviews on their website', onclick: function (e) {
        var b = e.currentTarget; b.disabled = true;
        api('POST', { action: 'site_reviews', id: r.id }).then(function (j) { b.disabled = false; drawRv(j); }).catch(function (er) { b.disabled = false; fail(er); });
      } })]));
      box.appendChild(rvBox);
  }

  // Online Store: "Order on WhatsApp" always works; "Pay online" turns on once their own Paystack secret key is added.
  function storeBlock(r) {
    var sh = r.shop || {};
    var box = el('div', { class: 'admin-golive admin-store' }, [el('span', { class: 'admin-label', text: 'Online store payments' })]);
    box.appendChild(el('p', { class: 'admin-meta' }, sh.online
      ? [badge('Pay online is ON', 'is-won'), ' Their Paystack key …' + (sh.keyEnd || '') + (sh.keyMode === 'test' ? ' (TEST key: no real money)' : '')]
      : [badge('WhatsApp orders only', 'is-new'), ' Add their Paystack secret key to switch on "Pay online".']));
    function save(body, okMsg, btn, busy) {
      var was = btn.textContent; btn.disabled = true; btn.textContent = busy;
      return api('POST', Object.assign({ action: 'shop_settings', id: r.id }, body)).then(function (j) {
        if (j.row) replaceRequest(j.row); flash(okMsg); render();
      }).catch(function (e) { btn.disabled = false; btn.textContent = was; fail(e); });
    }
    var key = el('input', { type: 'password', placeholder: sh.online ? 'Paste a new key to replace it' : 'sk_live_…', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    var fee = el('input', { type: 'number', min: '0', step: '100', value: sh.deliveryFee == null ? '' : sh.deliveryFee, placeholder: 'e.g. 2000 (leave empty to agree it later)' });
    var notify = el('input', { type: 'email', value: sh.notify || '', placeholder: r.email || 'owner@gmail.com' });
    manageBlock(r, box);
    // Best way: send them a private "Connect Paystack" link. They paste their own key, with step-by-step help
    // (Live vs Test keys), so you never see or handle it. Pay online switches on by itself and you get an email.
    if (!sh.online || sh.keyMode === 'test') {
      var linkOut = el('p', { class: 'admin-hint', text: sh.connect && sh.connect.exp > Date.now() ? 'A Connect link was made; it works until ' + new Date(sh.connect.exp).toLocaleDateString('en-NG') + '.' : '' });
      var getLink = function (then) {
        return api('POST', { action: 'paystack_link', id: r.id }).then(function (j) { if (j.row) replaceRequest(j.row); linkOut.textContent = 'Link works until ' + new Date(j.expires).toLocaleDateString('en-NG') + ': ' + j.url; then(j.url); }).catch(fail);
      };
      var msg = function (url) { return 'Hello ' + String(r.name).split(' ')[0] + ', to switch on online payments for your store, open this private link and paste your Paystack Live Secret Key. It shows you exactly where to find it in Paystack:\n' + url + '\nPlease don\'t send the key to anyone by message. The link works once, for 14 days.'; };
      var cacts = el('div', { class: 'admin-actions' });
      if (waNumber(r.contact)) cacts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send "Connect Paystack" link', onclick: function () {
        var win = window.open('', '_blank');
        getLink(function (url) { var u = 'https://wa.me/' + waNumber(r.contact) + '?text=' + encodeURIComponent(msg(url)); if (win) win.location = u; else window.location = u; });
      } }));
      cacts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy link', onclick: function () {
        getLink(function (url) { if (navigator.clipboard) navigator.clipboard.writeText(msg(url)).then(function () { flash('Message with the link copied'); }); });
      } }));
      box.appendChild(el('p', { class: 'admin-meta' }, [el('b', { text: 'Easiest: ' }), 'send them a private link to connect their own Paystack (with instructions to find the Live key). Pay online turns on by itself, you get an email, and they are told to test it themselves with a small amount. Check with them that it worked.']));
      box.appendChild(cacts);
      box.appendChild(linkOut);
    }
    box.appendChild(field('Or paste their Paystack secret key yourself', key, 'From THEIR Paystack (Live mode): Settings → API Keys & Webhooks → Live Secret Key (starts sk_live_; sk_test_ = practice only, no real money; pk_ = public key, not this one). Get it privately, paste it here and delete the message. It\'s checked with Paystack, stored encrypted and never shown again. Money goes straight to their account.'));
    box.appendChild(el('div', { class: 'admin-grid' }, [field('Delivery fee (₦, flat)', fee), field('Email new orders to', notify, 'Empty = the order-alert email from their form, else their email')]));
    box.appendChild(el('p', { class: 'admin-meta' }, [el('b', { text: 'Receipts: ' }), 'buyers save their receipt on the thank-you page as a picture or PDF. Nothing is emailed to buyers (our email is only for our own customers).']))
    var acts = el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Save store settings', onclick: function (e) {
      var body = { deliveryFee: fee.value.trim(), notify: notify.value.trim() };
      if (key.value.trim()) body.secretKey = key.value.trim();
      save(body, key.value.trim() ? 'Key accepted. "Pay online" is now on their website.' : 'Store settings saved', e.currentTarget, 'Checking…');
    } })]);
    if (sh.online) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Turn off Pay online', onclick: function (e) {
      if (!window.confirm('Remove their Paystack key? Their website goes back to WhatsApp orders only.')) return;
      save({ remove: true }, 'Pay online turned off', e.currentTarget, 'Removing…');
    } }));
    var list = el('div', { class: 'admin-orders' });
    acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Show recent orders', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true;
      api('POST', { action: 'shop_orders', id: r.id }).then(function (j) {
        b.disabled = false; list.innerHTML = '';
        if (!j.orders.length) { list.appendChild(el('p', { class: 'admin-hint', text: 'No online orders yet. (WhatsApp orders go straight to their WhatsApp.)' })); return; }
        j.orders.forEach(function (o) {
          var items = o.items.map(function (l) { return l.name + ' ×' + l.qty; }).join(', ');
          if (o.status === 'pending' || o.status === 'abandoned' || o.status === 'failed') list.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Check payment: ' + naira(o.total) + ' · ' + (o.buyer.name || ''), onclick: function (e2) {
            var bb = e2.currentTarget; bb.disabled = true;
            api('POST', { action: 'shop_check', id: r.id, ref: o.ref }).then(function (k) { flash(k.order.status === 'paid' ? 'Paid: order confirmed, the owner was emailed and the receipt is ready' : 'Not paid (' + k.order.status + ') according to the payment company'); bb.textContent = k.order.status === 'paid' ? 'Paid \u2713' : 'Not paid'; })
              .catch(function (er) { bb.disabled = false; fail(er); });
          } }));
          list.appendChild(el('p', { class: 'admin-meta' }, [badge(o.status === 'paid' ? 'Paid' : o.status, o.status === 'paid' ? 'is-won' : ''), ' ' + naira(o.total) + ' · ' + (o.buyer.name || '') + ' · ' + items + ' · ' + when(o.paid_at || o.created_at)]));
        });
      }).catch(function (e2) { b.disabled = false; fail(e2); });
    } }));
    box.appendChild(acts);
    box.appendChild(list);
    // Playbook → "A buyer asks a store to delete their data" (after the store owner agrees).
    var erasePhone = el('input', { placeholder: 'Buyer\u2019s phone number', inputmode: 'tel' });
    box.appendChild(el('details', { class: 'admin-sub' }, [el('summary', { text: 'Delete a buyer\u2019s data' }),
      el('p', { class: 'admin-hint', text: 'Only after the store owner agrees. Deletes the buyer\u2019s account (Standard Store) and removes their name, phone, email and address from every order (amounts stay). The owner can also do it in My store.' }),
      erasePhone, el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Delete their data', onclick: function () {
        if (!erasePhone.value.trim() || !window.confirm('Remove the data of ' + erasePhone.value + ' from this store? It can\u2019t be undone.')) return;
        api('POST', { action: 'shop_erase', id: r.id, phone: erasePhone.value }).then(function (k) { flash((k.account ? 'Account deleted; ' : 'No account; ') + 'details removed from ' + k.orders + ' order(s)'); erasePhone.value = ''; }).catch(fail);
      } })]));
    box.appendChild(el('p', { class: 'admin-hint', text: 'Every product with a plain price (e.g. 4500) gets "Add to cart". Buyers then choose "Pay online" (only when a key is set) or "Order on WhatsApp". Products priced like "from 5k" stay WhatsApp-only. Paid orders are emailed to the store owner; buyers save or share their receipt on the thank-you page (we never email buyers). No need to republish after changing these settings.' }));
    box.appendChild(storeOwnerBlock(r));
    box.appendChild(storeOptionsBlock(r));
    return box;
  }

  // The store owner's own login for My store (sirraddo.com.ng/mystore): username + temporary password sent on
  // WhatsApp; they must choose their own the first time and after every reset. The Manage link stays as a backup.
  function storeOwnerBlock(r) {
    if (!isOwner()) return document.createTextNode(''); // the store section is yours only
    var box = el('div', { class: 'admin-sub' }, [el('h4', { text: 'Store owner login (My store)' })]);
    var out = el('div');
    box.appendChild(el('p', { class: 'admin-hint', text: 'Their own admin at sirraddo.com.ng/mystore: orders (confirm transfers, mark delivered), products and stock, payment switches, customers (Standard Store) and shop details. Nothing about other stores.' }));
    box.appendChild(out);
    function sendBox(j) {
      var num = waNumber(r.contact);
      var msg = 'Hello ' + String(r.name).split(' ')[0] + ', here is the login for your store’s own admin.\nPage: ' + location.origin + '/mystore\nUsername: ' + j.login.username + '\nTemporary password: ' + j.password + '\nIt works for ' + (j.temp_days || 3) + ' days. When you log in you’ll choose your own password. Keep it private.\nThere you can see and confirm orders, change prices and stock, and switch ways to pay on or off.';
      return el('div', { class: 'admin-callout' }, [el('p', null, ['Username: ', el('b', { text: j.login.username })]), el('p', { class: 'admin-label', text: 'Temporary password (shown once)' }), el('p', { class: 'staff-pass', text: j.password }),
        el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Copy password', onclick: function (e) { copyText(j.password, 'Password', e.currentTarget); } }),
          num ? el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'Send login on WhatsApp' }) : null])]);
    }
    function draw(j, shown) {
      out.textContent = '';
      var L = j.login;
      if (!L) {
        var u = el('input', { value: j.suggest || '', autocapitalize: 'none', spellcheck: 'false' });
        out.appendChild(field('Username for them', u, 'What they type to log in. Must be different for every store.'));
        out.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Create their login', onclick: function (e) {
          var b = e.currentTarget; b.disabled = true;
          api('POST', { action: 'store_login', id: r.id, do: 'create', username: u.value }).then(function (k) { draw(k, sendBox(k)); flash('Login created: send it on WhatsApp'); }).catch(function (er) { b.disabled = false; fail(er); });
        } }));
        return;
      }
      var expired = L.must_change && L.temp_expires && Date.parse(L.temp_expires) < Date.now();
      out.appendChild(el('p', { class: 'admin-meta' }, [badge(!L.active ? 'Switched off' : L.must_change ? (expired ? 'Temporary password expired' : 'Waiting to choose their password') : 'Active', !L.active || expired ? 'is-due' : L.must_change ? 'is-new' : 'is-won'),
        ' Username: ' + L.username + ' · last seen ' + (L.last_seen_at ? when(L.last_seen_at) : 'never')]));
      if (shown) out.appendChild(shown);
      out.appendChild(el('div', { class: 'admin-actions' }, [
        el('button', { class: 'admin-btn', type: 'button', text: 'Reset password', onclick: function () {
          if (!window.confirm('Give them a new temporary password? They are logged out everywhere and must choose a new one.')) return;
          api('POST', { action: 'store_login', id: r.id, do: 'reset' }).then(function (k) { draw(k, sendBox(k)); }).catch(fail);
        } }),
        el('button', { class: 'admin-btn', type: 'button', text: 'Change username', onclick: function () {
          var nu = window.prompt('New username (they log in with it at /mystore):', L.username); if (!nu || nu === L.username) return;
          api('POST', { action: 'store_login', id: r.id, do: 'username', username: nu }).then(function (k) { draw(k); flash('Username changed: tell them on WhatsApp'); }).catch(fail);
        } }),
        el('button', { class: 'admin-btn', type: 'button', text: L.active ? 'Switch off' : 'Switch on', onclick: function () {
          api('POST', { action: 'store_login', id: r.id, do: 'active', active: !L.active }).then(function (k) { draw(k); flash(L.active ? 'Switched off: they are logged out' : 'Switched on'); }).catch(fail);
        } }),
        el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Remove login', onclick: function () {
          if (!window.confirm('Remove their My store login? Their Manage link still works (unless it is switched off).')) return;
          api('POST', { action: 'store_login', id: r.id, do: 'delete' }).then(function (k) { k.suggest = j.suggest; draw(k); }).catch(fail);
        } })]));
    }
    api('POST', { action: 'store_login', id: r.id, do: 'get' }).then(function (j) { draw(j); }).catch(fail);
    return box;
  }

  // Ways to pay (each a switch, also in the owner's My store), the Standard Store features and the Manage link.
  function storeOptionsBlock(r) {
    var sh = r.shop || {}, t = sh.transfer || {}, d = sh.delivery || {};
    var box = el('div', { class: 'admin-sub' }, [el('h4', { text: 'Ways to pay and Standard Store features' })]);
    function tg(label, on, hint) { var c = el('input', { type: 'checkbox' }); c.checked = Boolean(on); return { c: c, row: el('label', { class: 'admin-check' }, [c, el('span', null, [el('b', { text: label }), hint ? ' ' + hint : ''])]) }; }
    var ps = tg('Paystack', sh.online && !sh.paystackOff, sh.online ? '(key …' + (sh.keyEnd || '') + ')' : '(not connected: send the Connect link above)');
    if (!sh.online) ps.c.disabled = true;
    var fw = tg('Flutterwave', sh.flwOnline && !sh.flwOff, sh.flwOnline ? '(key …' + (sh.flwKeyEnd || '') + ')' : '(not connected: the owner adds their key in My store → Payments)');
    if (!sh.flwOnline) fw.c.disabled = true;
    var tr = tg('Bank transfer to their account', t.on, '(the owner confirms each payment in My store)');
    var bank = el('input', { value: t.bank || '', placeholder: 'Bank' }), aname = el('input', { value: t.name || '', placeholder: 'Account name' }), anum = el('input', { value: t.number || '', placeholder: '10-digit account number', inputmode: 'numeric', maxlength: 10 });
    var dl = tg('Pay on delivery', d.on);
    var ac = tg('Customer accounts (Standard Store)', sh.accounts, '(buyers sign in, save addresses, see their orders; the owner can still switch it off on their site)');
    var gg = tg('Google sign-in for buyers', sh.google, '(optional extra: phone number + password stays the main sign-in; the store owner can switch Google off in My store)' + (sh.googleOff ? ' · the owner has switched it off' : ''));
    var mg = tg('Manage link works (backup)', !sh.manageOff, '(switch off once they use My store, if you like)');
    [ps.row, fw.row, tr.row, el('div', { class: 'admin-grid' }, [field('Bank', bank), field('Account name', aname), field('Account number', anum)]), dl.row, ac.row, gg.row, mg.row].forEach(function (x) { box.appendChild(x); });
    if (sh.flwOnline) box.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Disconnect Flutterwave', onclick: function () {
      if (!window.confirm('Remove their Flutterwave key? They can add it again in My store \u2192 Payments.')) return;
      api('POST', { action: 'shop_settings', id: r.id, flwRemove: true }).then(function (j) { if (j.row) replaceRequest(j.row); flash('Flutterwave disconnected'); render(); }).catch(fail);
    } }));
    box.appendChild(el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Save switches', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true;
      var body = { action: 'shop_settings', id: r.id, transfer: { on: tr.c.checked, bank: bank.value, name: aname.value, number: anum.value }, delivery: { on: dl.c.checked }, accounts: ac.c.checked, google: gg.c.checked, manageOn: mg.c.checked };
      if (sh.online) body.paystackOn = ps.c.checked;
      if (sh.flwOnline) body.flwOn = fw.c.checked;
      api('POST', body).then(function (j) { if (j.row) replaceRequest(j.row); flash('Saved: their website shows it straight away'); render(); }).catch(function (er) { b.disabled = false; fail(er); });
    } }));
    return box;
  }

  // A tap-to-open section of a client card. The block's own heading moves into the bar, beside its status.
  var FOLD_PERM = { golive: 'build', handover: 'build', store: 'owner', services: 'money', referral: 'marketing', after: 'changes', manage: 'changes', brief: 'customers' };
  function fold(r, key, title, block, status, attention) {
    if (FOLD_PERM[key] && !canDo(FOLD_PERM[key])) return document.createTextNode('');
    state.folds = state.folds || {};
    var id = r.id + ':' + key;
    var d = el('details', { class: 'admin-fold' });
    d.open = state.folds[id] !== undefined ? state.folds[id] : Boolean(attention);
    d.addEventListener('toggle', function () { state.folds[id] = d.open; });
    var label = block.querySelector(':scope > .admin-label');
    if (label) label.remove();
    d.appendChild(el('summary', null, [el('span', { class: 'admin-fold-title', text: title }), status ? badge(status[0], status[1]) : null]));
    d.appendChild(block);
    return d;
  }

  // After launch: the customer's change requests and their visitor numbers.
  function aftercareBlock(r) {
    var box = el('div', { class: 'admin-golive admin-aftercare' }, [el('span', { class: 'admin-label', text: 'After launch: changes & visitors' })]);
    var out = el('div', { class: 'admin-changes' });
    function drawChanges(j) {
      out.innerHTML = '';
      out.appendChild(el('p', { class: 'admin-hint', text: j.free_until ? 'Free changes until ' + j.free_until + '. After that, requests are marked "Quote first".' : 'Free month starts when you set the go-live date.' }));
      if (!j.changes.length) out.appendChild(el('p', { class: 'admin-hint', text: 'No requests yet. Send them their link so they can ask for edits any time.' }));
      out.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Add a request from WhatsApp', onclick: function (e) {
        var text = window.prompt('Paste or type what the customer asked for (text only; for photos, ask them to use their change link):', '');
        if (!text || !text.trim()) return;
        var btn = e.currentTarget; btn.disabled = true;
        api('POST', { action: 'change_add', id: r.id, body: text.trim() }).then(function (k) {
          r.open_changes = k.changes.filter(function (x) { return x.status === 'open'; }).length;
          flash('Request added'); drawChanges(k);
        }).catch(function (er) { btn.disabled = false; fail(er); });
      } })]));
      j.changes.forEach(function (c) {
        var item = el('div', { class: 'admin-change' }, [
          el('p', { class: 'admin-meta' }, [badge(c.status === 'done' ? 'Done' : 'Open', c.status === 'done' ? 'is-won' : 'is-due'), ' ', badge(c.free ? 'Free' : 'Quote first', c.free ? '' : 'is-new'), ' ' + when(c.created_at)]),
          el('p', { class: 'admin-change-text', text: c.body })
        ]);
        if (c.files && c.files.length) item.appendChild(el('p', { class: 'admin-meta' }, c.files.map(function (f, i) { return el('a', { href: f.url, target: '_blank', rel: 'noopener', text: (i ? ' · ' : '') + f.name }); })));
        if (c.note) item.appendChild(el('p', { class: 'admin-hint', text: 'Note to customer: ' + c.note }));
        item.appendChild(aiBox(c));
        item.appendChild(el('div', { class: 'admin-actions' }, [c.status === 'done'
          ? el('button', { class: 'admin-btn', type: 'button', text: 'Reopen', onclick: function (e) { mark(c, false, null, e.currentTarget); } })
          : el('button', { class: 'admin-btn', type: 'button', text: 'Mark done & tell customer', onclick: function (e) {
              var note = window.prompt('Optional note for the customer (e.g. "New photo is on the home page"). Leave empty to skip.', '');
              if (note === null) return;
              mark(c, true, note.trim(), e.currentTarget);
            } })]));
        out.appendChild(item);
      });
    }
    // "Do it with AI": the AI reads the request (and photos) and lists the exact edits; you check, then apply.
    // The site keeps its design and all other text; only what they asked for changes. Undo puts it back.
    function aiBox(c) {
      var p = c.plan;
      var box = el('div', { class: 'admin-ai-change' });
      function act(action, btn, extra, msg) {
        btn.disabled = true;
        var was = btn.textContent;
        if (action === 'change_ai_plan') btn.textContent = 'Reading the request…';
        if (action === 'change_ai_apply') btn.textContent = 'Updating the website…';
        api('POST', Object.assign({ action: action, id: r.id, change_id: c.id }, extra || {})).then(function (j) {
          r.open_changes = j.changes.filter(function (x) { return x.status === 'open'; }).length;
          if (msg) flash(typeof msg === 'function' ? msg(j) : msg);
          drawChanges({ changes: j.changes, free_until: state.changeInfo && state.changeInfo[r.id] });
        }).catch(function (e) { btn.disabled = false; btn.textContent = was; fail(e); });
      }
      if (p && p.applied_at && c.can_undo) {
        box.appendChild(el('p', { class: 'admin-hint', text: (p.applied_by === 'customer' ? 'The customer approved the preview on ' : 'Done with AI on ') + when(p.applied_at) + '. Live site: ' + (p.live || '') + '.' }));
        if (p.results) box.appendChild(el('ul', { class: 'admin-ai-list' }, p.results.map(function (x) { return el('li', { class: x.ok ? '' : 'is-skip', text: (x.ok ? '✓ ' : '✗ ') + x.text }); })));
        box.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Undo', onclick: function (e) {
          if (!window.confirm('Put the website back as it was before this change? (The request goes back to Open; the customer is not emailed.)')) return;
          act('change_ai_undo', e.currentTarget, null, 'Undone. The website is back as it was.');
        } })]));
        return box;
      }
      if (c.status === 'done') return box;
      if (p && p.ops && !p.applied_at) {
        var url = location.origin + '/preview?c=' + encodeURIComponent(p.view_token || '');
        if (p.understood) box.appendChild(el('p', { class: 'admin-meta', text: 'AI understood: ' + p.understood }));
        box.appendChild(p.lines.length ? el('ul', { class: 'admin-ai-list' }, p.lines.map(function (t) { return el('li', { text: t }); }))
          : el('p', { class: 'admin-hint', text: 'No edits found that the AI can make.' }));
        if (p.not_done && p.not_done.length) {
          box.appendChild(el('p', { class: 'admin-hint', text: 'Not done by AI (do these yourself or ask the customer):' }));
          box.appendChild(el('ul', { class: 'admin-ai-list' }, p.not_done.map(function (t) { return el('li', { class: 'is-skip', text: t }); })));
        }
        if (p.customer && p.customer.result === 'changes') box.appendChild(el('p', { class: 'admin-ai-said', text: 'Customer looked at the preview and said: "' + p.customer.text + '". Tap Ask AI again (it reads this), check, then send again.' }));
        else if (p.sent_at) box.appendChild(el('p', { class: 'admin-hint', text: 'Preview sent to the customer ' + when(p.sent_at) + '. When they tap "Put these changes live", the site updates by itself.' }));
        var acts = el('div', { class: 'admin-actions' });
        if (p.lines.length && p.view_token) {
          acts.appendChild(el('a', { class: 'admin-btn', href: url, target: '_blank', rel: 'noopener', text: 'Open preview' }));
          var wnum = waNumber(r.contact);
          if (wnum) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send preview on WhatsApp', onclick: function (e) {
            var w = window.open('', '_blank');
            var text = 'Hello ' + String(r.name).split(' ')[0] + ', the changes you asked for are ready. Please have a look:\n' + url + '\nIf it\'s right, tap "Put these changes live" at the bottom and your website updates straight away. If anything isn\'t right, tell us there.';
            var wurl = 'https://wa.me/' + wnum + '?text=' + encodeURIComponent(text);
            if (w) w.location = wurl; else window.open(wurl, '_blank');
            act('change_ai_sent', e.currentTarget, null, 'Marked as sent');
          } }));
          acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Email preview', onclick: function (e) {
            act('change_ai_send', e.currentTarget, null, function (j) { return 'Preview emailed to ' + j.to; });
          } }));
        }
        acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Ask AI again', onclick: function (e) { act('change_ai_plan', e.currentTarget); } }));
        box.appendChild(acts);
        if (p.lines.length) {
          var tell = el('input', { type: 'checkbox' }); tell.checked = true;
          var own = el('details', { class: 'admin-ai-own' }, [el('summary', { text: 'Or apply it yourself now (without the customer checking)' }),
            el('label', { class: 'admin-hint' }, [tell, ' Mark done & email the customer what changed']),
            el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Apply & update live site', onclick: function (e) {
              act('change_ai_apply', e.currentTarget, { tell: tell.checked }, function (j) { return 'Website ' + (j.live === 'updated' ? 'updated' : 'saved (' + j.live + ')') + (tell.checked ? '. The customer has been emailed.' : '.'); });
            } })])]);
          box.appendChild(own);
        }
        return box;
      }
      box.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Do it with AI', onclick: function (e) { act('change_ai_plan', e.currentTarget); } })]));
      return box;
    }
    function mark(c, done, note, btn) {
      btn.disabled = true;
      api('POST', { action: 'change_mark', id: r.id, change_id: c.id, done: done, note: note || undefined }).then(function (j) {
        r.open_changes = j.changes.filter(function (x) { return x.status === 'open'; }).length;
        flash(done ? 'Marked done. The customer has been emailed.' : 'Reopened');
        drawChanges({ changes: j.changes, free_until: state.changeInfo && state.changeInfo[r.id] });
      }).catch(function (e) { btn.disabled = false; fail(e); });
    }
    function withLink(fn, btn) {
      btn.disabled = true;
      api('POST', { action: 'changes', id: r.id }).then(function (j) {
        btn.disabled = false; state.changeInfo = state.changeInfo || {}; state.changeInfo[r.id] = j.free_until; fn(j);
      }).catch(function (e) { btn.disabled = false; fail(e); });
    }
    var num = waNumber(r.contact);
    var acts = el('div', { class: 'admin-actions' }, [
      el('button', { class: 'admin-btn', type: 'button', text: 'Show change requests', onclick: function (e) { withLink(drawChanges, e.currentTarget); } }),
      el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send change link on WhatsApp', disabled: !num, onclick: function (e) {
        var w = window.open('', '_blank');
        withLink(function (j) {
          var text = 'Hello ' + String(r.name).split(' ')[0] + ', here is your private link to request changes to your website any time (text, photos, prices):\n' + j.link + (j.free_until ? '\nChanges are free until ' + j.free_until + '.' : '') + '\nPlease keep it private.';
          var url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
          if (w) w.location = url; else window.open(url, '_blank');
        }, e.currentTarget);
      } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Copy change link', onclick: function (e) {
        withLink(function (j) {
          (navigator.clipboard ? navigator.clipboard.writeText(j.link) : Promise.reject()).then(function () { flash('Link copied'); }).catch(function () { window.prompt('Copy this link:', j.link); });
        }, e.currentTarget);
      } })
    ]);
    box.appendChild(acts);
    box.appendChild(out);

    var stats = el('div', { class: 'admin-stats' });
    var off = Boolean(r.hosting && r.hosting.reportsOff);
    var toggle = el('input', { type: 'checkbox' });
    toggle.checked = !off;
    toggle.addEventListener('change', function () {
      api('POST', { action: 'report_toggle', id: r.id, off: !toggle.checked }).then(function (j) { if (j.row) replaceRequest(j.row); flash(toggle.checked ? 'Monthly report on' : 'Monthly report off'); }).catch(fail);
    });
    box.appendChild(el('div', { class: 'admin-actions' }, [
      el('button', { class: 'admin-btn', type: 'button', text: 'Visitors (last 30 days)', onclick: function (e) {
        var b = e.currentTarget; b.disabled = true;
        api('POST', { action: 'site_stats', id: r.id }).then(function (j) {
          b.disabled = false; stats.innerHTML = '';
          var s = j.stats;
          if (!j.tracking) { stats.appendChild(el('p', { class: 'admin-hint', text: 'Counting starts after you publish (or tap Update live site) once.' })); return; }
          stats.appendChild(el('p', { class: 'admin-meta', text: s.visitors + ' visitors · ' + s.views + ' page views · ' + s.wa + ' WhatsApp taps' + (s.calls ? ' · ' + s.calls + ' call tap' + (s.calls === 1 ? '' : 's') : '') + (s.orders ? ' · ' + s.orders + ' paid orders (' + naira(s.sales) + ')' : '') }));
          if (s.pages.length) stats.appendChild(el('p', { class: 'admin-hint', text: 'Top pages: ' + s.pages.map(function (p) { return p.path + ' (' + p.n + ')'; }).join(', ') }));
          if (s.sources.length) stats.appendChild(el('p', { class: 'admin-hint', text: 'From: ' + s.sources.map(function (x) { return x.source + ' (' + x.n + ')'; }).join(', ') }));
        }).catch(function (e2) { b.disabled = false; fail(e2); });
      } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Email report now', onclick: function (e) {
        var b = e.currentTarget; b.disabled = true;
        api('POST', { action: 'report_send', id: r.id }).then(function (j) { b.disabled = false; flash('Report sent to ' + j.to); }).catch(function (e2) { b.disabled = false; fail(e2); });
      } })
    ]));
    box.appendChild(stats);
    box.appendChild(el('label', { class: 'admin-check' }, [toggle, ' Email them a visitor report on the 1st of every month']));
    box.appendChild(el('p', { class: 'admin-hint', text: 'Counts are private: no cookies or personal data. Sites published before this update start counting after one Update live site.' }));
    return box;
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
    // What's left before this job is finished once and for all (same list the Assistant uses).
    var check = r.handover_check || [];
    if (check.length) {
      var left = check.filter(function (i) { return !i.done && !i.auto; }).length;
      var list = el('ul', { class: 'admin-checklist' }, check.map(function (i) {
        if (i.done) return el('li', { class: 'is-done' }, [el('b', { text: '✓ ' + i.label })]);
        var kids = [el('b', { text: '✗ ' + i.label }), i.auto ? badge('Automatic', 'is-new') : '', el('span', { class: 'admin-hint', text: i.fix })];
        if (i.steps && i.steps.length) kids.push(el('details', { class: 'admin-howto' }, [el('summary', { text: 'How to do it' }), el('ol', null, i.steps.map(function (t) { return el('li', { text: t }); }))]));
        if (i.tell) {
          var row = el('div', { class: 'admin-actions' });
          if (waNumber(r.contact)) row.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send steps to customer', onclick: function () { window.open('https://wa.me/' + waNumber(r.contact) + '?text=' + encodeURIComponent(i.tell), '_blank', 'noopener'); } }));
          row.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy message', onclick: function () { if (navigator.clipboard) navigator.clipboard.writeText(i.tell).then(function () { flash('Message copied'); }); } }));
          if (i.tell2) {
            if (waNumber(r.contact)) row.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: i.tell2Label || 'Send guide', onclick: function () { window.open('https://wa.me/' + waNumber(r.contact) + '?text=' + encodeURIComponent(i.tell2), '_blank', 'noopener'); } }));
            row.appendChild(el('button', { class: 'admin-btn', type: 'button', text: 'Copy guide', onclick: function () { if (navigator.clipboard) navigator.clipboard.writeText(i.tell2).then(function () { flash('Guide copied'); }); } }));
          }
          kids.push(row);
        }
        return el('li', { class: 'is-todo' }, kids);
      }));
      box.appendChild(el('details', { class: 'admin-fold', open: left > 0 }, [el('summary', { text: left ? 'Before handover: ' + left + ' thing' + (left === 1 ? '' : 's') + ' for you to do' : check.every(function (i) { return i.done; }) ? 'Everything is handed over ✓ (only change requests remain)' : 'Nothing for you to do: the rest happens by itself' }), list]));
    }
    // Empty boxes are filled from Go live, your usual registrar (Settings) and the go-live date; what you type wins.
    var auto = handoverAuto(r);
    var by = el('select', null, [el('option', { value: 'us', text: 'We bought it for them' }), el('option', { value: 'customer', text: 'Their own domain' })]);
    by.value = h.domain_by === 'customer' ? 'customer' : 'us';
    var domain = el('input', { value: auto.domain || '', placeholder: 'theirbusiness.com.ng' });
    var registrar = el('input', { value: auto.registrar || '', placeholder: 'e.g. Whogohost' });
    var expires = el('input', { type: 'date', value: auto.domain_expires || '' });
    var emails = el('textarea', { rows: 2, value: auto.emails || '', placeholder: 'info@theirbusiness.com.ng (addresses only, no passwords)' });
    var inbox = el('input', { value: auto.inbox || '', placeholder: 'Where their business emails arrive, e.g. ada@gmail.com' });
    var webmail = el('input', { value: h.webmail || '', placeholder: 'Only if they log in to a mailbox, e.g. https://mail.zoho.com' });
    var notes = el('textarea', { rows: 2, value: h.notes || '', placeholder: 'Anything else for them (optional)' });
    var logins = el('input', { type: 'checkbox' }); logins.checked = Boolean(h.has_logins);
    var gbpDone = el('input', { type: 'checkbox' }); gbpDone.checked = Boolean(h.gbp_done);
    var gbpOwner = el('input', { type: 'email', value: auto.gbp_owner || '', placeholder: 'Gmail that owns their Google profile' });
    var isStore = r.interest === 'Online Store';
    var payEmail = el('input', { type: 'email', value: h.paystack_email || '', placeholder: 'Email they log in to Paystack with (optional)' });
    var waOnly = el('input', { type: 'checkbox' }); waOnly.checked = Boolean(h.whatsapp_only);
    by.addEventListener('change', function () {
      var t = handoverAuto({ handover: Object.assign({}, h, { domain_by: by.value, registrar: '', domain_expires: '' }), hosting: r.hosting, live_on: r.live_on });
      registrar.value = t.registrar || ''; expires.value = t.domain_expires || '';
    });
    box.appendChild(el('div', { class: 'admin-grid' }, [field('Domain', domain), field('Who bought the domain?', by), field('Registered with', registrar), field('Domain registered until', expires)]));
    box.appendChild(el('div', { class: 'admin-grid' }, [field('Business email addresses', emails), field('Emails arrive in', inbox), field('Webmail', webmail)]));
    if (r.interest !== 'Starter website') box.appendChild(el('div', { class: 'admin-grid' }, [field('Google Business Profile owner', gbpOwner), el('label', { class: 'admin-check' }, [gbpDone, ' Google profile done (verified)'])]));
    if (isStore) box.appendChild(el('div', { class: 'admin-grid' }, [field('Their Paystack login email', payEmail), el('label', { class: 'admin-check' }, [waOnly, ' WhatsApp orders only (they don\'t want Paystack)'])]));
    box.appendChild(field('Note for the customer', notes));
    box.appendChild(el('label', { class: 'admin-check' }, [logins, ' I set up logins for them (e.g. Zoho mailboxes). The pack then says passwords come privately on WhatsApp.']));
    box.appendChild(el('p', { class: 'admin-hint', text: 'Filled in for you from Go live (domain, email set-up), your usual registrar in Settings and the go-live date + 1 year. Check and change anything that is different. The pack also lists their pages, their store settings, their sitemap and the monthly report.' }));
    var save = el('button', { class: 'admin-btn', type: 'button', text: 'Save handover details', onclick: function () {
      update(r, { handover: { domain_by: by.value, domain: domain.value, registrar: registrar.value, domain_expires: expires.value, emails: emails.value, inbox: inbox.value, webmail: webmail.value, notes: notes.value, has_logins: logins.checked, gbp_done: gbpDone.checked, gbp_owner: gbpOwner.value, paystack_email: payEmail.value, whatsapp_only: waOnly.checked } }, 'Handover details saved');
    } });
    var ready = !locked && r.website_url;
    var why = locked ? 'Unlocks when the balance is paid' : !r.website_url ? 'Add their website address above first' : null;
    var acts = el('div', { class: 'admin-actions' }, [save,
      el('button', { class: 'admin-btn', type: 'button', text: 'View', disabled: !ready, title: why, onclick: function () { docAction(r, 'handover', 'view'); } })]);
    if (waNumber(r.contact)) acts.appendChild(el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'WhatsApp', disabled: !ready, title: why, onclick: function () { docAction(r, 'handover', 'whatsapp'); } }));
    if (emailOf(r)) acts.appendChild(el('button', { class: 'admin-btn', type: 'button', text: sent ? 'Email again' : 'Email', disabled: !ready || !state.canEmail, title: why, onclick: function () { docAction(r, 'handover', 'email'); } }));
    box.appendChild(acts);
    box.appendChild(el('p', { class: 'admin-hint', text: 'Save the details before sending. Usually there are no passwords: the website is managed by you and email forwarding goes to their own inbox. If you did set up logins, send them privately on WhatsApp, never by email.' }));
    return box;
  }

  // Resizes a photo in the browser (longest side max px) and returns { type, data (base64) } for upload.
  function shrinkImage(file, max) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var d = c.toDataURL('image/jpeg', 0.85); resolve({ type: 'image/jpeg', data: d.slice(d.indexOf(',') + 1) });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a picture')); };
      img.src = url;
    });
  }
  // Same as emailAllowance() / wantedEmails() in api/_lib/brief-schema.mjs and handover-check.mjs.
  function emailAllowance(interest) { return { 'Starter website': 1, 'Business website': 5, 'Online Store': 5 }[interest] || 0; }
  function wantedEmails(r) {
    var w = r.brief_wants || {}, seen = {};
    return [w.emails, w.emails5].filter(Boolean).join(',').split(/[\s,;]+/).map(function (s) { return s.replace(/@.*$/, '').toLowerCase().replace(/[^a-z0-9._-]/g, ''); })
      .filter(function (s) { if (!s || seen[s]) return false; seen[s] = true; return true; });
  }

  // Same rules as handoverAuto() in api/_lib/docs.mjs.
  function handoverAuto(r) {
    var typed = r.handover || {}, host = r.hosting || {}, mail = host.email || {};
    var ours = typed.domain_by !== 'customer';
    var expires = '';
    if (ours && r.live_on) { var t = new Date(String(r.live_on).slice(0, 10) + 'T12:00:00Z'); t.setUTCFullYear(t.getUTCFullYear() + 1); expires = t.toISOString().slice(0, 10); }
    var a = {
      domain: host.domain || '',
      registrar: ours ? (state.settings || {}).default_registrar || '' : '',
      domain_expires: expires,
      emails: host.domain && mail.locals && mail.locals.length ? mail.locals.map(function (l) { return l + '@' + host.domain; }).join('\n') : '',
      inbox: mail.to || '',
      gbp_owner: (r.brief_wants || {}).gbp_gmail || ''
    };
    var out = Object.assign({}, typed);
    Object.keys(a).forEach(function (k) { if (!String(out[k] == null ? '' : out[k]).trim() && a[k]) out[k] = a[k]; });
    return out;
  }

  // A small Markdown renderer for the draft: headings, bold, lists, rules, paragraphs.
  function mdToHtml(md) {
    var inline = function (t) { return h(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[ADD:([^\]]*)\]/g, '<mark>[ADD:$1]</mark>'); };
    // Lists keep their numbers ("2." stays 2 even after a bullet), and indented bullets under a numbered step
    // are shown inside that step instead of breaking the list.
    var out = [], list = null, sub = false;
    var closeSub = function () { if (sub) { out.push('</ul></li>'); sub = false; } else if (list === 'ol') out.push('</li>'); };
    var closeList = function () { if (!list) return; closeSub(); out.push('</' + list + '>'); list = null; };
    md.split('\n').forEach(function (line) {
      var m;
      if (list === 'ol' && (m = line.match(/^\s{2,}[-*] (.*)/))) {
        if (!sub) { out.push('<ul>'); sub = true; }
        out.push('<li>' + inline(m[1]) + '</li>'); return;
      }
      if ((m = line.match(/^\s*(\d+)\. (.*)/))) {
        if (list === 'ol') closeSub(); else { closeList(); out.push('<ol start="' + m[1] + '">'); list = 'ol'; }
        out.push('<li>' + inline(m[2])); return;
      }
      if ((m = line.match(/^\s*[-*] (.*)/))) {
        if (list === 'ol' && /^\s/.test(line)) return; // handled above
        if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
        out.push('<li>' + inline(m[1]) + '</li>'); return;
      }
      if (!line.trim() && list) return; // a blank line between list items keeps the list going
      closeList();
      if ((m = line.match(/^(#{1,4}) (.*)/))) out.push('<h' + (m[1].length + 1) + '>' + inline(m[2]) + '</h' + (m[1].length + 1) + '>');
      else if (/^---+\s*$/.test(line)) out.push('<hr>');
      else if (line.trim()) out.push('<p>' + inline(line) + '</p>');
    });
    closeList();
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

  function depositPct(r) { return r.deposit_pct >= 10 && r.deposit_pct <= 100 ? r.deposit_pct : 70; }
  function depositAmount(r) { return r.quote_amount ? Math.round(r.quote_amount * depositPct(r) / 100) : 0; }
  function paymentsBlock(r) {
    var box = el('div', { class: 'admin-payments' }, [el('span', { class: 'admin-label', text: 'Payments' })]);
    var list = payments(r);
    if (list.length) {
      box.appendChild(el('ul', null, list.map(function (p, idx) {
        return el('li', null, [
          niceDate(p.date) + ' · ' + (p.amount < 0 ? 'REFUND ' + naira(-p.amount) : naira(p.amount)) + ' · ' + (p.kind === 'renewal' ? 'renewal' : p.kind === 'service' ? 'service' : 'project') + (p.note ? ' · ' + p.note : ''),
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
    var suggested = paid(r, 'project') === 0 && r.quote_amount ? depositAmount(r) : (r.next_payment > 0 && r.next_payment < bal ? r.next_payment : bal) || '';
    var amount = el('input', { type: 'number', min: 1, step: 500, inputmode: 'numeric', placeholder: 'Amount ₦', value: suggested });
    var date = el('input', { type: 'date', value: today() });
    var kind = select([['project', 'Project'], ['renewal', 'Renewal']], 'project', { 'aria-label': 'Payment type' });
    var note = el('input', { placeholder: 'Note (e.g. transfer ref)' });
    var autoEmail = el('input', { type: 'checkbox', id: 'ae' + r.id });
    autoEmail.checked = Boolean(state.canEmail && emailOf(r));
    var autoLabel = state.canEmail && emailOf(r) ? el('label', { class: 'admin-check', for: 'ae' + r.id }, [autoEmail, ' Email the receipt to ' + emailOf(r)]) : null;
    // A refund (money paid back, Playbook → refund): recorded as a negative payment with the reason; no receipt email.
    var isRefund = el('input', { type: 'checkbox' });
    var refundLabel = isOwner() ? el('label', { class: 'admin-check' }, [isRefund, ' This is a refund (money we paid back)']) : null;
    isRefund.addEventListener('change', function () { add.textContent = isRefund.checked ? 'Record refund' : 'Add payment'; note.placeholder = isRefund.checked ? 'Why (required), e.g. cancelled before work started' : 'Note (e.g. transfer ref)'; if (autoLabel) autoLabel.hidden = isRefund.checked; });
    var add = el('button', { class: 'admin-btn', type: 'button', text: 'Add payment', onclick: function () {
      if (!Number(amount.value)) { setError(isRefund.checked ? 'Enter the amount refunded' : 'Enter the amount paid'); return; }
      if (isRefund.checked && !note.value.trim()) { setError('Write why the refund was made'); return; }
      if (isRefund.checked && !window.confirm('Record a refund of ' + naira(Number(amount.value)) + ' to ' + r.name + '? Their paid total goes down by it.')) return;
      var next = list.concat([isRefund.checked ? { date: date.value || today(), amount: -Math.abs(Number(amount.value)), kind: kind.value, note: note.value, refund: true } : { date: date.value || today(), amount: Number(amount.value), kind: kind.value, note: note.value }]);
      var sendMail = autoLabel && autoEmail.checked && !isRefund.checked;
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
    box.appendChild(el('div', { class: 'admin-pay-form' }, [amount, date, kind, note, refundLabel, autoLabel, add]));
    return box;
  }

  function transcript(messages, title) {
    var det = el('details', { class: 'admin-sub' }, [el('summary', { text: title })]);
    messages.forEach(function (m) {
      // "[photo] URL" / "[file] URL" lines are files the customer sent in the chat: show them.
      var parts = [el('strong', { text: (m.role === 'user' ? 'Customer' : 'Assistant') + ': ' })];
      String(m.content).split('\n').forEach(function (line, i) {
        var f = line.match(/^\[(photo|file)\] (https?:\/\/\S+)$/);
        if (f) parts.push(el('a', { href: f[2], target: '_blank', rel: 'noopener', class: 'admin-chat-file' }, [f[1] === 'photo' ? el('img', { src: f[2], alt: 'Photo they sent', loading: 'lazy' }) : '📄 File they sent']));
        else parts.push((i ? '\n' : '') + line);
      });
      det.appendChild(el('p', { class: 'admin-line' }, parts));
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
    card.appendChild(el('button', { class: 'admin-btn admin-btn--small admin-ask', type: 'button', text: 'Ask assistant about this job', onclick: function () { askAbout(r, 'What should I do next for this job, and is anything wrong?'); } }));

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
    if (!canDo('build')) { stage.disabled = true; live.disabled = true; site.disabled = true; }
    card.appendChild(el('div', { class: 'admin-grid' }, [field('Project stage', stage), field('Went live on', live)].concat(canDo('money') ? [field('Renewal (₦/year)', ramount), field('Renewal due', rdue)] : [])));
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
    if (canDo('money')) card.appendChild(el('div', { class: 'admin-actions' }, [
      renewed,
      el('button', { class: 'admin-btn', type: 'button', text: 'Renewal invoice', disabled: !r.renewal_amount, onclick: function () { docAction(r, 'renewal', 'view'); } }),
      el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: 'Send renewal invoice', disabled: !r.renewal_amount || !waNumber(r.contact), onclick: function () { docAction(r, 'renewal', 'whatsapp'); } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Open in Requests', onclick: function () {
        state.filters = { q: r.contact, status: '', interest: '', due: false }; state.open[r.id] = true; setTab('requests');
      } }),
      (r.renewal_due || (r.services || []).some(function (x) { return x.active; })) && isOwner() ? el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Stop renewals & services', onclick: function () {
        var why = window.prompt('Stop renewal reminders, renewal invoices, the overdue auto-pause and their monthly/yearly service fees for ' + r.name + '? (e.g. moved to another developer, business closed)\n\nReason (saved in notes):', 'Moved away');
        if (why === null) return;
        api('POST', { action: 'stop_renewals', id: r.id, reason: why }).then(function (j) { if (j.row) replaceRequest(j.row); flash('Renewals and services stopped. Their site stays as it is (Go live → Pause site to take it down).'); render(); }).catch(fail);
      } }) : null
    ]));
    if (!canDo('money')) card.appendChild(el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Open in Requests', onclick: function () {
      state.filters = { q: r.contact, status: '', interest: '', due: false }; state.open[r.id] = true; setTab('requests');
    } })]));
    // Each part of the job folds away, with its status on the closed bar; parts that need you open by themselves.
    var h = r.hosting || {};
    card.appendChild(fold(r, 'brief', 'Project form', briefBlock(r), r.brief_submitted_at ? ['Received', 'is-won'] : r.brief_saved_at ? ['In progress', 'is-new'] : ['Waiting', ''], false));
    if (r.has_draft || h.project) {
      var changed = h.publishedAt && [r.draft_at, r.design_at].some(function (t) { return t && Date.parse(t) > Date.parse(h.publishedAt); });
      card.appendChild(fold(r, 'golive', 'Go live', goLiveBlock(r),
        h.pausedAt ? ['Paused', 'is-due'] : h.lastError ? ['Problem', 'is-due'] : changed ? ['Changes not published', 'is-new'] : h.publishedAt ? [h.attached ? 'Live on ' + h.domain : 'Published', 'is-won'] : ['Not published', ''],
        Boolean(h.pausedAt || h.lastError || changed)));
    }
    if (r.interest === 'Online Store' && (r.has_draft || r.brief_submitted_at)) {
      card.appendChild(fold(r, 'store', 'Store payments', storeBlock(r), r.shop && r.shop.online ? ['Pay online ON', 'is-won'] : ['WhatsApp orders only', ''], false));
    }
    else if (r.website_url || r.live_on || (r.hosting && r.hosting.publishedAt)) {
      var mb = el('div', { class: 'admin-golive' }, [el('span', { class: 'admin-label', text: 'Manage my website' })]);
      manageBlock(r, mb);
      card.appendChild(fold(r, 'manage', 'Manage my website', mb, r.shop && r.shop.manage ? ['Link made', 'is-won'] : null, false));
    }
    if (r.website_url || r.live_on) {
      var oc = r.open_changes || 0;
      card.appendChild(fold(r, 'after', 'After launch', aftercareBlock(r), oc ? [oc + ' change' + (oc === 1 ? '' : 's') + ' waiting', 'is-due'] : ['Up to date', 'is-won'], oc > 0));
    }
    if (r.status === 'won' && (r.website_url || r.live_on)) card.appendChild(fold(r, 'referral', 'Referrals', referralBlock(r), r.ref_code ? ['Code ' + r.ref_code, ''] : null, false));
    if (r.status === 'won') {
      var svcN = (r.services || []).filter(function (x) { return x.active; }).length;
      card.appendChild(fold(r, 'services', 'Monthly / yearly services', servicesBlock(r), svcN ? [svcN + ' active', 'is-won'] : null, false));
    }
    var hsent = (r.auto_sent || {}).handover, hbal = balance(r), hlocked = r.quote_amount == null || hbal > 0;
    card.appendChild(fold(r, 'handover', 'Handover pack', handoverBlock(r), hsent ? ['Sent', 'is-won'] : hlocked ? ['Locked', ''] : ['Ready to send', 'is-new'], !hsent && !hlocked));
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
      if (!canDo('customers')) box.disabled = true;
      box.addEventListener('change', function () {
        api('POST', { action: 'question', id: q.id, resolved: box.checked }).then(function () { q.resolved = box.checked; flash('Saved'); render(); }).catch(fail);
      });
      return el('div', { class: 'admin-card admin-q' + (q.resolved ? ' is-done' : '') }, [
        el('label', { for: 'q' + q.id, class: 'admin-check' }, [box, ' ' + q.question]),
        el('small', { text: when(q.created_at) }),
        !canDo('customers') ? null : el('button', { class: 'admin-x', type: 'button', 'aria-label': 'Delete question', text: '×', onclick: function () {
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
          transcript(msgs, 'Read conversation'),
          // Data-deletion request (Playbook): delete this conversation and its photos. Chats also go after 90 days.
          isOwner() ? el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Delete chat', onclick: function () {
            if (!window.confirm('Delete this conversation and any photos sent in it? It can\u2019t be undone.')) return;
            api('POST', { action: 'chat_delete', session_id: c.session_id }).then(function () { state.chats = (state.chats || []).filter(function (x) { return x.session_id !== c.session_id; }); flash('Chat deleted'); draw(); }).catch(fail);
          } }) : null
        ]));
      });
    }
    var t;
    search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.chatQuery = search.value; draw(); }, 200); });
    draw();
  }

  // ---------- Settings ----------
  // Settings are split into small sections (chips at the top) so there's no long scrolling.
  var SETTINGS_SECTIONS = [
    ['business', 'Bank & invoices'], ['messages', 'WhatsApp messages'], ['handover', 'Handover'],
    ['notices', 'Service notices'], ['reviews', 'Reviews'], ['email', 'Email usage'], ['ai', 'AI backup'], ['greetings', 'Festive greetings'], ['staff', 'Staff'], ['docs', 'Company documents'], ['backup', 'Backup']
  ];
  function renderSettings(view) {
    var s = state.settings;
    var pick = state.settingsTab || 'business';
    var bar = el('div', { class: 'admin-tabs admin-subtabs', role: 'group', 'aria-label': 'Settings sections' }, SETTINGS_SECTIONS.map(function (x) {
      return el('button', { type: 'button', 'aria-pressed': x[0] === pick ? 'true' : 'false', text: x[1], onclick: function () { state.settingsTab = x[0]; render(); } });
    }));
    view.appendChild(bar);
    // A form that saves only its own settings.
    function settingsForm(title, intro, build, check) {
      var inputs = {};
      function text(key, label, placeholder, area) {
        var inp = area ? el('textarea', { rows: 3, value: s[key] || '', placeholder: placeholder }) : el('input', { value: s[key] || '', placeholder: placeholder });
        inputs[key] = inp;
        return field(label, inp);
      }
      var form = el('form', { class: 'admin-card admin-settings' }, [el('h2', { text: title }), intro ? el('p', { class: 'admin-intro', text: intro }) : null]);
      build(form, text);
      form.appendChild(el('button', { class: 'btn btn--navy', type: 'submit', text: 'Save' }));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var values = {};
        Object.keys(inputs).forEach(function (k) { values[k] = inputs[k].value.trim(); });
        var problem = check && check(values);
        if (problem) { setError(problem); return; }
        api('POST', { action: 'settings', settings: values }).then(function (j) { state.settings = j.settings || {}; setError(''); flash('Saved'); }).catch(fail);
      });
      return form;
    }
    if (pick === 'business') view.appendChild(settingsForm('Bank details for invoices', null, function (f, text) {
      f.appendChild(text('bank_name', 'Bank', 'e.g. GTBank'));
      f.appendChild(text('account_name', 'Account name', 'SIRRADDO GLOBAL LIMITED'));
      f.appendChild(text('account_number', 'Account number', '10 digits'));
      f.appendChild(text('invoice_note', 'Note at the bottom of invoices', 'e.g. Work starts after the 70% deposit is received.', true));
    }, function (v) { return v.account_number && !/^\d{10}$/.test(v.account_number) ? 'Account number should be 10 digits.' : ''; }));
    if (pick === 'messages') view.appendChild(settingsForm('WhatsApp messages', 'Tap a message to change it. Leave it empty to use the standard one. You can use {name}, {package}, {amount}, {deposit}, {paid}, {balance}, {renewal_amount}, {renewal_due}, {preview_link} and {website}.', function (f, text) {
      // One fold per message, so the list stays short.
      Object.keys(TEMPLATES).forEach(function (k) {
        var custom = String(s[k] || '').trim();
        var d = el('details', { class: 'admin-fold' }, [el('summary', null, [el('span', { class: 'admin-fold-title', text: TEMPLATES[k].label }), badge(custom ? 'Your own' : 'Standard', custom ? 'is-new' : '')])]);
        var box = el('div', { class: 'admin-golive' }, [text(k, 'Message', TEMPLATES[k].text, true)]);
        d.appendChild(box);
        f.appendChild(d);
      });
    }));
    if (pick === 'handover') view.appendChild(settingsForm('Handover pack', null, function (f, text) {
      f.appendChild(text('default_registrar', 'Domains I buy for customers are registered with (fills every handover pack)', 'e.g. Whogohost'));
      f.appendChild(text('handover_terms', 'Changes and support policy (shown in every handover pack)', DEFAULT_HANDOVER_TERMS, true));
    }));
    if (pick === 'notices') view.appendChild(noticesCard());
    if (pick === 'reviews') view.appendChild(reviewsCard());
    if (pick === 'email') view.appendChild(emailUsageCard());
    if (pick === 'greetings') view.appendChild(greetingsCard());
    if (pick === 'ai') view.appendChild(aiBackupCard());
    if (pick === 'staff') staffSettings(view);
    if (pick === 'docs') companyDocs(view);
    if (pick === 'backup') view.appendChild(el('div', { class: 'admin-card admin-settings' }, [
      el('h2', { text: 'Backup' }),
      el('p', { class: 'admin-intro', text: 'Every Monday a backup of all your business data (customers, quotes, payments, website text, orders, change requests) is emailed to you as a file. Keep those emails. You can also download one now. It contains customer details, so keep it private.' }),
      el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: 'Download backup now', onclick: function (e) { downloadFile('/api/requests?view=backup', 'sirraddo-backup.json.gz', e.currentTarget); } })])
    ]));
  }


  // ---------- Settings → AI backup: a third AI that answers when Gemini and Claude can't ----------
  function aiBackupCard() {
    var card = el('div', { class: 'admin-card admin-settings admin-aib' }, [el('h2', { text: 'AI backup' }),
      el('p', { class: 'admin-intro', text: 'A third AI that answers by itself whenever Gemini and Claude are busy, out of their limit or not working, so the website chat, "Write it for me" and your admin AI tools keep going. Customers don\'t see any difference.' })]);
    var box = el('div'); card.appendChild(box);
    box.appendChild(el('p', { class: 'admin-hint', text: 'Loading…' }));
    function draw(st) {
      box.textContent = '';
      var svc = el('select', { 'aria-label': 'AI service' });
      Object.keys(st.services).forEach(function (k) { svc.appendChild(el('option', { value: k, text: st.services[k].label })); });
      svc.value = st.service;
      var key = el('input', { type: 'password', autocomplete: 'off', placeholder: st.hasKey ? 'Saved (ends …' + st.keyEnd + '). Paste a new one to change it.' : 'Paste the API key here', spellcheck: 'false' });
      var model = el('input', { value: st.model, placeholder: '', spellcheck: 'false', autocapitalize: 'none' });
      var base = el('input', { value: st.base, placeholder: 'https://…/v1', spellcheck: 'false', autocapitalize: 'none' });
      var baseF = field('Service address (only for "Other")', base);
      var on = el('input', { type: 'checkbox' }); on.checked = st.hasKey ? st.on : true;
      var how = el('div', { class: 'admin-aib-how' });
      function sync() {
        var d = st.services[svc.value];
        model.placeholder = d.model || 'model name';
        if (!st.hasKey || svc.value !== st.service) model.value = d.model || model.value;
        baseF.hidden = svc.value !== 'custom';
        how.textContent = '';
        how.appendChild(el('b', { text: 'How to get the key' }));
        var ol = el('ol');
        if (d.keys) ol.appendChild(el('li', null, ['Open ', el('a', { href: d.keys, target: '_blank', rel: 'noopener', text: d.keys.replace(/^https:\/\//, '') }), ' and sign up or log in.']));
        ol.appendChild(el('li', { text: 'Create a new API key (name it "SIRRADDO website") and copy it.' }));
        ol.appendChild(el('li', { text: 'Paste it below, tap Save, then Test.' }));
        how.appendChild(ol);
        if (d.note) how.appendChild(el('p', { class: 'admin-hint', text: d.note }));
      }
      svc.addEventListener('change', sync);
      box.appendChild(field('AI service', svc));
      box.appendChild(how);
      box.appendChild(field('API key', key, 'Stored encrypted. It is never shown again, not even to you here. Don\'t paste it in WhatsApp or chats.'));
      box.appendChild(field('Model', model, 'Leave the suggested one unless you know you want another.'));
      box.appendChild(baseF);
      box.appendChild(el('label', { class: 'admin-check' }, [on, ' Use the backup when Gemini and Claude can\'t answer']));
      sync();
      var res = el('p', { class: 'admin-aib-res', role: 'status' });
      var save = el('button', { class: 'btn btn--navy', type: 'button', text: 'Save' });
      var test = el('button', { class: 'admin-btn', type: 'button', text: 'Test it', disabled: !st.hasKey });
      save.addEventListener('click', function () {
        save.disabled = true;
        api('POST', { action: 'ai_backup_save', service: svc.value, key: key.value.trim(), model: model.value.trim(), base: base.value.trim(), on: on.checked })
          .then(function (j) { flash('Saved'); draw(j); test2(); }).catch(function (e) { save.disabled = false; fail(e); });
      });
      function test2() {
        var t = box.querySelector('.admin-aib-test'); if (t) t.click();
      }
      test.classList.add('admin-aib-test');
      test.addEventListener('click', function () {
        test.disabled = true; res.className = 'admin-aib-res'; res.textContent = 'Asking the backup AI…';
        api('POST', { action: 'ai_backup_test' }).then(function (j) {
          test.disabled = false;
          res.className = 'admin-aib-res ' + (j.ok ? 'is-ok' : 'is-bad');
          res.textContent = j.ok ? '✓ Working. It answered in ' + (j.ms / 1000).toFixed(1) + ' s: "' + j.reply + '"' : '✗ ' + j.error;
        }).catch(function (e) { test.disabled = false; fail(e); });
      });
      box.appendChild(el('div', { class: 'admin-actions' }, [save, test]));
      box.appendChild(res);
      var u = st.used || {};
      var lines = [];
      if (st.hasKey) lines.push(st.on ? 'Status: on, ready to step in.' : 'Status: switched off.');
      if (u.count) lines.push('Answered ' + u.count + ' time' + (u.count === 1 ? '' : 's') + ' this month' + (u.lastAt ? ' (last: ' + new Date(u.lastAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + ')' : '') + '.');
      else if (st.hasKey) lines.push('It hasn\'t had to answer this month: Gemini and Claude handled everything.');
      if (u.lastError && u.lastErrorAt && (!u.lastAt || u.lastErrorAt > u.lastAt)) lines.push('Last problem (' + new Date(u.lastErrorAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + '): ' + u.lastError);
      lines.forEach(function (l) { box.appendChild(el('p', { class: 'admin-hint', text: l })); });
      if (st.hasKey) box.appendChild(el('button', { class: 'admin-btn admin-btn--danger', type: 'button', text: 'Remove the backup', onclick: function () {
        if (!window.confirm('Remove the backup AI and its key?')) return;
        api('POST', { action: 'ai_backup_save', remove: true }).then(function (j) { flash('Removed'); draw(j); }).catch(fail);
      } }));
    }
    api('POST', { action: 'ai_backup' }).then(draw).catch(function (e) { box.textContent = ''; box.appendChild(el('p', { class: 'admin-error', text: e.message })); });
    return card;
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
    var user = ($('username') && $('username').value || '').trim().toLowerCase();
    var remember = $('remember') && $('remember').checked;
    if (STAFF_PAGE) {
      if (!user) { $('login-error').textContent = 'Type your username.'; return; }
      // Staff: swap username + password for a session token straight away; the password is never stored.
      typedPw = $('password').value;
      password = 'su.' + b64url(user) + '.' + b64url(typedPw);
      $('password').value = '';
      api('POST', { action: 'session' }).then(function (j) {
        password = j.token;
        try {
          if (remember) { localStorage.setItem(LONG, j.token); sessionStorage.removeItem(KEY); }
          else { sessionStorage.setItem(KEY, j.token); localStorage.removeItem(LONG); }
        } catch (err) { /* ignore */ }
        state.remember = remember;
        load();
      }).catch(function (err) { logout(); $('login-error').textContent = err.message; });
      return;
    }
    password = $('password').value;
    $('password').value = '';
    if (!remember) {
      try { sessionStorage.setItem(KEY, password); localStorage.removeItem(LONG); } catch (err) { /* ignore */ }
      load();
      return;
    }
    // Swap the password for a 30-day token and keep only the token on this device.
    api('POST', { action: 'session' }).then(function (j) {
      password = j.token;
      try { localStorage.setItem(LONG, j.token); sessionStorage.removeItem(KEY); } catch (err) { /* ignore */ }
      load();
    }).catch(fail);
  });
  $('logout').addEventListener('click', logout);
  Array.prototype.forEach.call(document.querySelectorAll('.admin-tabs button'), function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });
  if (password) load();
})();
