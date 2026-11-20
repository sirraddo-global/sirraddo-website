// My store: the store owner's own admin (orders, products, payments, customers). Logs in with the username and
// password from SIRRADDO; the server (/api/mystore) checks everything and only ever shows this one store.
(function () {
  'use strict';
  var KEY = 'sirraddo-mystore', LONG = 'sirraddo-mystore-session';
  var token = null, typedPw = null, remember = false;
  var state = { tab: 'orders', me: null, store: null, filter: 'todo', search: '' };
  try { token = localStorage.getItem(LONG) || sessionStorage.getItem(KEY); remember = Boolean(localStorage.getItem(LONG)); } catch (e) { /* private mode */ }

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'value') n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children || []).forEach(function (c) { if (c === null || c === undefined || c === false) return; n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function naira(n) { return '₦' + Number(n || 0).toLocaleString('en-NG'); }
  function when(t) { return t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : ''; }
  function b64url(t) { return btoa(unescape(encodeURIComponent(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function wa(num) { var d = String(num || '').replace(/\D/g, ''); if (d.charAt(0) === '0') d = '234' + d.slice(1); return d.length >= 10 ? d : ''; }
  function flash(t) { var s = $('app-status'); s.textContent = t; clearTimeout(flash.t); flash.t = setTimeout(function () { s.textContent = ''; }, 4000); }
  function field(label, input, hint) { return el('label', { class: 'admin-field' }, [el('span', { class: 'admin-label', text: label }), input, hint ? el('small', { class: 'admin-hint', text: hint }) : null]); }
  // "Show password": one tick box that reveals every password box it's given.
  function showToggle(inputs) {
    var box = el('input', { type: 'checkbox', onchange: function () { inputs.forEach(function (i) { i.type = box.checked ? 'text' : 'password'; }); } });
    return el('label', { class: 'admin-check' }, [box, ' Show password']);
  }
  function badge(t, c) { return el('span', { class: 'admin-badge ' + (c || ''), text: t }); }
  function btn(text, onclick, cls) { return el('button', { class: 'admin-btn ' + (cls || ''), type: 'button', text: text, onclick: onclick }); }
  function api(action, body) {
    return fetch('/api/mystore', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { logout(); $('login-error').textContent = j.error || 'Please log in again.'; throw new Error(j.error || 'Logged out'); }
        if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; }); });
  }
  function fail(e) { flash(''); var s = $('app-status'); s.textContent = '⚠ ' + e.message; }
  function save(t) { token = t; try { if (remember) { localStorage.setItem(LONG, t); sessionStorage.removeItem(KEY); } else { sessionStorage.setItem(KEY, t); localStorage.removeItem(LONG); } } catch (e) { /* ignore */ } }
  function logout() {
    token = null; typedPw = null;
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(LONG); } catch (e) { /* ignore */ }
    $('app').hidden = true; $('logout').hidden = true; $('login').hidden = false; $('store-name').textContent = 'My store';
  }

  $('show-pw').addEventListener('change', function () { $('password').type = this.checked ? 'text' : 'password'; });
  $('login').addEventListener('submit', function (e) {
    e.preventDefault(); $('login-error').textContent = '';
    var u = $('username').value.trim().toLowerCase();
    remember = $('remember').checked; typedPw = $('password').value;
    token = 'ou.' + b64url(u) + '.' + b64url(typedPw);
    $('password').value = '';
    api('session').then(function (j) { save(j.token); load(); }).catch(function (err) { logout(); $('login-error').textContent = err.message; });
  });
  $('logout').addEventListener('click', logout);
  Array.prototype.forEach.call(document.querySelectorAll('.admin-tabs button'), function (b) {
    b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
  });
  function setTab(t) {
    state.tab = t;
    Array.prototype.forEach.call(document.querySelectorAll('.admin-tabs button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tab') === t)); });
    render();
  }

  function load() {
    return api('me').then(function (j) {
      state.me = j.me; state.store = j.store; state.summary = j.summary || null;
      $('login').hidden = true; $('app').hidden = false; $('logout').hidden = false;
      $('store-name').textContent = (j.store && j.store.name) || 'My store';
      document.querySelector('.admin-tabs').style.display = j.me.must_change ? 'none' : '';
      var cb = document.querySelector('[data-tab="customers"]'); if (cb) cb.hidden = !(j.store && j.store.accountsFeature);
      var ob = document.querySelector('[data-tab="orders"]'); if (ob) ob.textContent = 'Orders' + (j.todo ? ' (' + j.todo + ')' : '');
      render();
    });
  }
  function render() {
    var v = $('view'); v.textContent = '';
    if (state.me && state.me.must_change) return renderChange(v);
    ({ orders: renderOrders, products: renderProducts, customers: renderCustomers, payments: renderPayments, shop: renderShop, account: renderAccount })[state.tab](v);
  }

  // ---------- Password ----------
  function passwordForm(forced, done) {
    var cur = el('input', { type: 'password', autocomplete: 'current-password' });
    var p1 = el('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '8' }), p2 = el('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: '8' });
    if (!(forced && typedPw)) cur.required = true;
    if (forced && typedPw) cur.value = typedPw;
    var err = el('p', { class: 'admin-error', role: 'alert' });
    var b = el('button', { class: 'btn btn--navy', type: 'submit', text: 'Save my new password' });
    var f = el('form', { class: 'admin-card admin-settings' }, [(forced && typedPw) ? null : field(forced ? 'Temporary password (from SIRRADDO)' : 'Current password', cur),
      field('New password', p1, 'At least 8 characters, with letters and a number.'), field('Type it again', p2), showToggle([cur, p1, p2]), b, err]);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); err.textContent = '';
      if (p1.value !== p2.value) { err.textContent = 'The two new passwords are not the same.'; return; }
      b.disabled = true;
      api('my_password', { current: cur.value, password: p1.value, remember: remember }).then(function (j) { save(j.token); typedPw = null; flash('Password changed'); done(); })
        .catch(function (e2) { b.disabled = false; err.textContent = e2.message; });
    });
    return f;
  }
  function renderChange(v) {
    v.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Welcome! Choose your own password' }),
      el('p', { class: 'admin-hint', text: 'You logged in with a temporary password from SIRRADDO. Choose one only you know. Your username stays: ' + state.me.username + '.' })]));
    v.appendChild(passwordForm(true, function () { load(); }));
  }

  // ---------- Orders ----------
  var STATUS = { pending: ['Payment not finished', 'is-due'], paid: ['Paid', 'is-won'], awaiting: ['Waiting for transfer', 'is-due'], cod: ['Pay on delivery', 'is-new'], cancelled: ['Cancelled', 'is-lost'], failed: ['Payment failed', 'is-lost'], abandoned: ['Not paid', 'is-lost'] };
  var FILTERS = [['todo', 'To do'], ['', 'All'], ['awaiting', 'Waiting for transfer'], ['cod', 'Pay on delivery'], ['paid', 'Paid'], ['pending', 'Online payment not finished'], ['cancelled', 'Cancelled']];
  function renderOrders(v) {
    var s = state.store || {};
    var none = !s.methods || !(s.methods.paystack || s.methods.flutterwave || s.methods.transfer || s.methods.delivery);
    if (none) v.appendChild(el('p', { class: 'admin-hint admin-callout', text: 'Only WhatsApp orders are on right now. Switch on a way to pay in Payments.' }));
    var search = el('input', { type: 'search', placeholder: 'Find: name, phone or order number', value: state.search });
    var chips = el('div', { class: 'admin-tabs admin-subtabs' }, FILTERS.map(function (f) {
      return el('button', { type: 'button', 'aria-pressed': String(state.filter === f[0]), text: f[1], onclick: function () { state.filter = f[0]; render(); } });
    }));
    var list = el('div');
    var sm = state.summary;
    if (sm) {
      var tile = function (label, big, small, onclick) { return el(onclick ? 'button' : 'div', { class: 'admin-tile', type: onclick ? 'button' : null, onclick: onclick }, [el('span', { class: 'admin-tile-label', text: label }), el('strong', { text: big }), small ? el('small', { text: small }) : null]); };
      var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
      v.appendChild(el('div', { class: 'admin-tiles', style: 'margin-bottom:12px' }, [
        tile('Paid today', naira(sm.today), plural(sm.todayOrders, 'order')),
        tile('Paid this month', naira(sm.month), plural(sm.monthOrders, 'order')),
        tile('To deliver', String(sm.toDeliver), 'Tap to see them', function () { state.filter = 'todo'; render(); }),
        sm.low && sm.low.length ? tile('Running low', String(sm.low.length), sm.low.slice(0, 3).map(function (p) { return p.name + ' (' + p.stock + ')'; }).join(', '), function () { setTab('products'); }) : null
      ]));
    }
    v.appendChild(chips); v.appendChild(el('div', { class: 'admin-card' }, [search]));
    v.appendChild(list);
    function draw() {
      api('orders', { status: state.filter, search: state.search }).then(function (j) {
        list.textContent = '';
        if (!j.orders.length) { list.appendChild(el('p', { class: 'admin-empty', text: state.filter === 'todo' ? 'Nothing to do. New orders appear here.' : 'No orders here.' })); return; }
        j.orders.forEach(function (o) { list.appendChild(orderCard(o, draw)); });
      }).catch(fail);
    }
    var t; search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { state.search = search.value.trim(); draw(); }, 300); });
    draw();
    v.appendChild(el('div', { class: 'admin-actions' }, [btn('Download orders (spreadsheet)', function () { download('orders'); })]));
  }
  function orderCard(o, redraw) {
    var b = o.buyer || {}, st = STATUS[o.status] || [o.status, ''];
    var c = el('div', { class: 'admin-card' }, [
      el('div', { class: 'admin-meta' }, [badge(st[0], st[1]), ' ', o.delivered_at ? badge('Delivered', 'is-won') : null, ' ' + naira(o.total) + ' · ' + o.how + ' · ' + when(o.created_at)]),
      el('h3', { text: b.name || 'Customer' }),
      el('p', { class: 'admin-meta', text: [b.phone, b.email].filter(Boolean).join(' · ') }),
      b.address ? el('p', { class: 'admin-meta' }, [el('b', { text: 'Deliver to: ' }), b.address]) : null,
      b.note ? el('p', { class: 'admin-meta' }, [el('b', { text: 'Note: ' }), b.note]) : null,
      el('ul', { class: 'admin-mini' }, o.items.map(function (l) { return el('li', { text: l.name + ' × ' + l.qty + ': ' + naira(l.total) }); }).concat(o.delivery ? [el('li', { text: 'Delivery: ' + naira(o.delivery) })] : [])),
      o.claim && o.status === 'awaiting' ? el('p', { class: 'admin-callout' }, [el('b', { text: 'They say they have paid' }), (o.claim.from ? ' from the account of ' + o.claim.from : '') + (o.claim.note ? ': “' + o.claim.note + '”' : '') + ' (' + when(o.claim.at) + '). Check your bank app before you confirm.']) : null,
      el('p', { class: 'admin-hint', text: 'Order ' + o.ref })
    ]);
    function act(what, ask, ok) {
      return function (e) {
        if (ask && !window.confirm(ask)) return;
        var bt = e.currentTarget; bt.disabled = true;
        (what === 'erase' ? api('order_erase', { ref: o.ref }) : api('order', { ref: o.ref, do: what })).then(function () { flash(ok); load().then(redraw); }).catch(function (er) { bt.disabled = false; fail(er); });
      };
    }
    var acts = el('div', { class: 'admin-actions' });
    var num = wa(b.phone);
    if (num) acts.appendChild(el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hello ' + String(b.name || '').split(' ')[0] + ', this is ' + (state.store.name || 'the store') + ' about your order ' + o.ref + '. '), target: '_blank', rel: 'noopener', text: 'WhatsApp customer' }));
    if (o.status === 'awaiting') acts.appendChild(btn('Confirm paid', act('paid', 'Have you SEEN ' + naira(o.total) + ' in your bank app from this customer? Screenshots can be fake. Confirm only if the money is there.', 'Payment confirmed. The customer’s receipt is ready.'), 'admin-btn--primary'));
    if (o.status === 'cod') acts.appendChild(btn('Paid & delivered', act('paid', 'Did you deliver it and receive ' + naira(o.total) + '?', 'Marked paid and delivered'), 'admin-btn--primary'));
    if (o.status === 'paid' && !o.delivered_at) acts.appendChild(btn('Mark delivered', act('delivered', null, 'Marked delivered'), 'admin-btn--primary'));
    if (o.status === 'paid' && o.delivered_at) acts.appendChild(btn('Not delivered (undo)', act('undelivered', null, 'Changed back to not delivered')));
    if (o.status === 'awaiting' || o.status === 'cod') acts.appendChild(btn('Cancel order', act('cancel', 'Cancel this order? Its items go back into stock. Tell the customer on WhatsApp.', 'Order cancelled'), 'admin-btn--danger'));
    if (o.status === 'pending' || o.status === 'abandoned' || o.status === 'failed') acts.appendChild(btn('Check payment', function (e) {
      var bt = e.currentTarget; bt.disabled = true;
      api('check', { ref: o.ref }).then(function (j) { flash(j.order.status === 'paid' ? 'Paid \u2713 The order is confirmed and the customer\u2019s receipt is ready.' : 'Not paid yet (' + j.order.status + '). If the customer says they paid, ask for the payment reference and check it in your payment dashboard.'); load().then(redraw); })
        .catch(function (er) { bt.disabled = false; fail(er); });
    }, 'admin-btn--primary'));
    acts.appendChild(el('a', { class: 'admin-btn', href: o.link, target: '_blank', rel: 'noopener', text: o.status === 'paid' ? 'Receipt' : 'Order page' }));
    if (b.phone) acts.appendChild(btn('Remove customer\u2019s details', act('erase', 'Remove this customer\u2019s name, phone, email and address from ALL their orders (and delete their account, if they have one)? Only do this if they asked you to delete their data. It can\u2019t be undone.', 'Their details are removed')));
    c.appendChild(acts);
    return c;
  }
  function download(which) {
    api('export').then(function (j) {
      var text = j[which]; if (!text) { flash('Nothing to download'); return; }
      var a = el('a', { href: URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' })), download: (state.store.name || 'store').replace(/\W+/g, '-').toLowerCase() + '-' + which + '.csv' });
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(fail);
  }

  // ---------- Products ----------
  function renderProducts(v) {
    v.appendChild(el('p', { class: 'admin-hint', text: 'Change prices and stock, or mark items sold out. Tick “Show at the top” for the products to slide across the top of your home page (if none are ticked, your newest products show there). Online, transfer and pay-on-delivery orders take the stock down by themselves; WhatsApp and shop sales don’t, so adjust the number here. New products or photos: ask SIRRADDO (Request a change).' }));
    var box = el('div'); v.appendChild(box);
    api('products').then(function (j) {
      var rows = {};
      if (!j.products.length) { box.appendChild(el('p', { class: 'admin-empty', text: 'No products yet.' })); return; }
      var find = el('input', { type: 'search', placeholder: 'Find a product' });
      if (j.products.length > 8) box.appendChild(el('div', { class: 'admin-card' }, [find]));
      j.products.forEach(function (p) {
        var price = el('input', { value: p.price, inputmode: 'decimal', 'aria-label': 'Price of ' + p.name });
        var stock = el('input', { value: String(p.stock), inputmode: 'numeric', placeholder: 'not counted', 'aria-label': 'Stock of ' + p.name });
        var sold = el('input', { type: 'checkbox', checked: p.soldout });
        var top = el('input', { type: 'checkbox', checked: p.top });
        rows[p.i] = { price: price, stock: stock, sold: sold, top: top };
        var card = el('div', { class: 'admin-card', 'data-s': (p.name + ' ' + p.category).toLowerCase() }, [el('h3', { text: p.name }), p.category ? el('p', { class: 'admin-meta', text: p.category }) : null,
          el('div', { class: 'admin-grid' }, [field('Price', price), field('In stock', stock)]), el('label', { class: 'admin-check' }, [sold, ' Sold out']), el('label', { class: 'admin-check' }, [top, ' Show at the top of my home page'])]);
        box.appendChild(card);
      });
      find.addEventListener('input', function () { var w = find.value.toLowerCase(); Array.prototype.forEach.call(box.querySelectorAll('[data-s]'), function (c) { c.hidden = w && c.getAttribute('data-s').indexOf(w) < 0; }); });
      box.appendChild(el('div', { class: 'admin-actions' }, [btn('Save products', function (e) {
        var products = {}; Object.keys(rows).forEach(function (i) { products[i] = { price: rows[i].price.value, stock: rows[i].stock.value, soldout: rows[i].sold.checked, top: rows[i].top.checked }; });
        saveShop({ products: products }, e.currentTarget);
      }, 'admin-btn--primary')]));
    }).catch(fail);
  }
  function saveShop(body, b) {
    b.disabled = true;
    api('save', body).then(function (j) {
      b.disabled = false;
      flash(!j.changes.length ? 'Nothing changed' : j.live === 'updated' ? 'Saved ✓ Your website is updated.' : j.live === 'not published yet' ? 'Saved ✓ It shows when your website goes live.' : 'Saved ✓ but the website didn’t update yet. SIRRADDO has been told.');
    }).catch(function (e) { b.disabled = false; fail(e); });
  }

  // ---------- Shop details and reviews ----------
  function renderShop(v) {
    api('products').then(function (j) {
      var d = j.details, inputs = {};
      var card = el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Shop details' })]);
      [['tagline', 'Slogan', 100], ['hours', 'Opening hours', 120], ['phone', 'Phone number', 30], ['whatsapp', 'WhatsApp number', 30], ['site_notice', 'Notice at the top of your website (optional)', 200]].forEach(function (f) {
        inputs[f[0]] = el(f[0] === 'site_notice' ? 'textarea' : 'input', { maxlength: f[2], value: d[f[0]] || '' });
        card.appendChild(field(f[1], inputs[f[0]]));
      });
      card.appendChild(btn('Save shop details', function (e) { var details = {}; Object.keys(inputs).forEach(function (k) { details[k] = inputs[k].value; }); saveShop({ details: details }, e.currentTarget); }, 'admin-btn--primary'));
      v.appendChild(card);
      var rv = el('div', { class: 'admin-card' }, [el('h2', { text: 'Customer reviews' })]);
      var sel = {};
      if (!j.reviews.length) rv.appendChild(el('p', { class: 'admin-hint', text: 'No reviews yet. Reviews left on your website appear here; they only show on your website after you choose Show on website.' }));
      j.reviews.forEach(function (x) {
        sel[x.id] = el('select', { 'aria-label': 'Review from ' + x.name }, [x.status === 'pending' ? el('option', { value: 'pending', text: 'New: choose' }) : null, el('option', { value: 'shown', text: 'Show on website' }), el('option', { value: 'hidden', text: 'Hide' })]);
        sel[x.id].value = x.status;
        rv.appendChild(el('div', { class: 'admin-meta' }, [el('b', { text: '★'.repeat(x.stars) + ' ' + x.name }), x.body ? el('p', { text: x.body }) : null, sel[x.id]]));
      });
      if (j.reviews.length) rv.appendChild(btn('Save reviews', function (e) { var reviews = {}; Object.keys(sel).forEach(function (k) { reviews[k] = sel[k].value; }); saveShop({ reviews: reviews }, e.currentTarget); }, 'admin-btn--primary'));
      v.appendChild(rv);
    }).catch(fail);
  }

  // ---------- Payments ----------
  function toggle(label, on, hint) { var c = el('input', { type: 'checkbox', checked: on }); return { box: c, row: el('label', { class: 'admin-check' }, [c, el('span', null, [el('b', { text: label }), hint ? el('small', { class: 'admin-hint', text: ' ' + hint }) : null])]) }; }
  function renderPayments(v) {
    var s = state.store;
    v.appendChild(el('p', { class: 'admin-hint', text: 'Switch each way to pay on or off at any time. Your customers can always order on WhatsApp too. Money from online payments goes straight into your own account.' }));
    // Paystack
    var ps = toggle('Paystack', s.paystack.on, '(card, bank transfer, USSD)');
    var psKey = el('input', { type: 'password', autocomplete: 'off', placeholder: s.paystack.connected ? 'Connected (key …' + s.paystack.end + '). Paste a new one to replace it' : 'sk_live_…' });
    v.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Pay online: Paystack' }), s.paystack.connected ? ps.row : el('p', { class: 'admin-hint', text: 'Not connected yet.' }),
      field('Your Paystack Live Secret Key', psKey, 'Paystack → Settings → API Keys & Webhooks → Live Secret Key (starts sk_live_). Keep it private: only paste it here.')]));
    // Flutterwave
    var fw = toggle('Flutterwave', s.flutterwave.on, '(card, bank transfer, USSD)');
    var fwKey = el('input', { type: 'password', autocomplete: 'off', placeholder: s.flutterwave.connected ? 'Connected (key …' + s.flutterwave.end + '). Paste a new one to replace it' : 'FLWSECK-…' });
    var fwCard = el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Pay online: Flutterwave (optional)' }), s.flutterwave.connected ? fw.row : el('p', { class: 'admin-hint', text: 'Not connected. Only needed if you want a second online option.' }),
      field('Your Flutterwave Live Secret Key', fwKey, 'Flutterwave → Settings → API Keys (Live mode) → Secret Key (starts FLWSECK-). Keep it private: only paste it here.')]);
    if (s.flutterwave.connected) fwCard.appendChild(btn('Disconnect Flutterwave', function (e) { if (window.confirm('Remove your Flutterwave key? You can add it again later.')) savePayments({ flwRemove: true }, e.currentTarget); }));
    v.appendChild(fwCard);
    // Bank transfer
    var t = s.transfer || {};
    var tr = toggle('Bank transfer to my account', Boolean(t.on), '(no fees)');
    var bank = el('input', { value: t.bank || '', placeholder: 'e.g. GTBank' }), aname = el('input', { value: t.name || '', placeholder: 'Name on the account' }), anum = el('input', { value: t.number || '', inputmode: 'numeric', maxlength: 10, placeholder: '10 digits' });
    var tnote = el('input', { value: t.note || '', maxlength: 200, placeholder: 'Optional, e.g. We confirm transfers 8am–8pm' });
    v.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Bank transfer' }), tr.row,
      el('p', { class: 'admin-hint', text: 'The customer sees your account details and the order number to use as the narration. You get an email; when you SEE the money in your bank app, tap Confirm paid in Orders. Never trust a screenshot alone.' }),
      el('div', { class: 'admin-grid' }, [field('Bank', bank), field('Account name', aname), field('Account number', anum)]), field('Note for customers', tnote)]));
    // Pay on delivery
    var d = s.delivery || {};
    var dl = toggle('Pay on delivery', Boolean(d.on));
    var dnote = el('input', { value: d.note || '', maxlength: 200, placeholder: 'Optional, e.g. Ibadan only. Cash or transfer to the rider.' });
    v.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Pay on delivery' }), dl.row, el('p', { class: 'admin-hint', text: 'Some buyers don’t pay or don’t pick up: call them to confirm before you send.' }), field('Note for customers', dnote)]));
    // Delivery fee, alerts, accounts
    var fee = el('input', { type: 'number', min: '0', step: '100', value: s.deliveryFee == null ? '' : s.deliveryFee, placeholder: 'Leave empty to agree it with each customer' });
    var notify = el('input', { type: 'email', value: s.notify || '', placeholder: 'Where new orders are emailed' });
    var other = el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Delivery fee and alerts' }), el('div', { class: 'admin-grid' }, [field('Delivery fee (₦, flat)', fee), field('Email new orders to', notify)])]);
    var ac = null;
    if (s.accountsFeature) { ac = toggle('Customer accounts on my website', s.accountsOn, '(sign in, saved addresses, order history; guests can still buy)'); other.appendChild(ac.row); }
    var gg = null;
    if (s.googleFeature) { gg = toggle('Also allow “Continue with Google”', s.googleOn, '(an extra way in; customers always sign in with phone number and password)'); other.appendChild(gg.row); }
    v.appendChild(other);
    var bsave = btn('Save payment settings', function (e) {
      var p = { paystackOn: ps.box.checked, flwOn: fw.box.checked, transfer: { on: tr.box.checked, bank: bank.value, name: aname.value, number: anum.value, note: tnote.value },
        delivery: { on: dl.box.checked, note: dnote.value }, deliveryFee: fee.value.trim(), notify: notify.value.trim() };
      if (!s.paystack.connected) delete p.paystackOn;
      if (!s.flutterwave.connected) delete p.flwOn;
      if (psKey.value.trim()) p.paystackKey = psKey.value.trim();
      if (fwKey.value.trim()) p.flwKey = fwKey.value.trim();
      if (ac) p.accountsOn = ac.box.checked;
      if (gg) p.googleOn = gg.box.checked;
      savePayments(p, e.currentTarget);
    }, 'admin-btn--primary');
    v.appendChild(el('div', { class: 'admin-actions' }, [bsave]));
  }
  function savePayments(p, b) {
    b.disabled = true;
    api('payments', { payments: p }).then(function (j) { state.store = j.store; b.disabled = false; flash('Saved ✓ Your website shows the new options straight away.'); render(); })
      .catch(function (e) { b.disabled = false; fail(e); });
  }

  // ---------- Customers (Standard Store) ----------
  function renderCustomers(v) {
    var search = el('input', { type: 'search', placeholder: 'Find: name or phone' });
    var list = el('div');
    v.appendChild(el('div', { class: 'admin-card' }, [search]));
    v.appendChild(list);
    function draw() {
      api('customers', { search: search.value.trim() }).then(function (j) {
        list.textContent = '';
        list.appendChild(el('p', { class: 'admin-hint', text: j.customers.length + ' customer account' + (j.customers.length === 1 ? '' : 's') }));
        j.customers.forEach(function (cu) {
          var num = wa(cu.phone), more = el('div');
          var c = el('div', { class: 'admin-card' }, [el('h3', { text: cu.name + (cu.active ? '' : ' (blocked)') }),
            el('p', { class: 'admin-meta', text: cu.phone + (cu.email ? ' · ' + cu.email : '') + (cu.google ? ' · Google sign-in' : '') }),
            el('p', { class: 'admin-meta', text: cu.orders + ' paid order' + (cu.orders === 1 ? '' : 's') + ' · ' + naira(cu.spent) + ' spent' + (cu.last_order ? ' · last order ' + when(cu.last_order) : '') }),
            (cu.addresses || []).length ? el('ul', { class: 'admin-mini' }, cu.addresses.map(function (a) { return el('li', { text: a.label + ': ' + a.text }); })) : null]);
          var acts = el('div', { class: 'admin-actions' });
          if (num) acts.appendChild(el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num, target: '_blank', rel: 'noopener', text: 'WhatsApp' }));
          acts.appendChild(btn('Orders', function () {
            more.textContent = '';
            api('customer_orders', { buyer_id: cu.id }).then(function (k) { if (!k.orders.length) more.appendChild(el('p', { class: 'admin-hint', text: 'No orders yet.' })); k.orders.forEach(function (o) { more.appendChild(el('p', { class: 'admin-meta', text: when(o.created_at) + ' · ' + naira(o.total) + ' · ' + ((STATUS[o.status] || [o.status])[0]) + ' · ' + o.items.map(function (l) { return l.name + ' ×' + l.qty; }).join(', ') })); }); }).catch(fail);
          }));
          acts.appendChild(btn('Reset password', function () {
            if (!window.confirm('Make a one-time code for ' + cu.name + ' to choose a new password? It works for 24 hours. Send it to them on WhatsApp.')) return;
            api('customer_reset', { buyer_id: cu.id }).then(function (k) {
              var msg = 'Hello ' + cu.name.split(' ')[0] + ', your code to reset your ' + state.store.name + ' password is ' + k.code + '. On our website tap Account → Forgot password, enter your phone number, this code and a new password. It works for 24 hours.';
              more.textContent = '';
              more.appendChild(el('div', { class: 'admin-callout' }, [el('p', null, ['Code: ', el('b', { text: k.code }), ' (works 24 hours)']), num ? el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg), target: '_blank', rel: 'noopener', text: 'Send code on WhatsApp' }) : null]));
            }).catch(fail);
          }));
          acts.appendChild(btn('Delete account & data', function () {
            if (!window.confirm('Delete ' + cu.name + '\u2019s account and remove their name, phone, email and address from their orders? Only do this if they asked. It can\u2019t be undone. (The amounts stay in your records.)')) return;
            api('customer_delete', { buyer_id: cu.id }).then(function (k) { flash('Deleted. Their details were removed from ' + k.orders + ' order' + (k.orders === 1 ? '' : 's') + '.'); draw(); }).catch(fail);
          }, 'admin-btn--danger'));
          acts.appendChild(btn(cu.active ? 'Block' : 'Unblock', function () {
            if (cu.active && !window.confirm('Block ' + cu.name + '? They can’t sign in (they can still buy as a guest).')) return;
            api('customer_active', { buyer_id: cu.id, active: !cu.active }).then(function () { flash(cu.active ? 'Blocked' : 'Unblocked'); draw(); }).catch(fail);
          }));
          c.appendChild(acts); c.appendChild(more);
          list.appendChild(c);
        });
      }).catch(fail);
    }
    var t; search.addEventListener('input', function () { clearTimeout(t); t = setTimeout(draw, 300); });
    draw();
    v.appendChild(el('div', { class: 'admin-actions' }, [btn('Download customers (spreadsheet)', function () { download('customers'); })]));
  }

  // ---------- Account ----------
  function renderAccount(v) {
    v.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Your login' }), el('p', { class: 'admin-meta', text: 'Username: ' + state.me.username }),
      el('p', { class: 'admin-hint', text: 'Forgot your password? Message SIRRADDO on WhatsApp: you get a temporary one and choose a new one when you log in.' })]));
    v.appendChild(el('details', { class: 'admin-card' }, [el('summary', { text: 'Change my password' }), passwordForm(false, function () { render(); })]));
    if (state.store.manageOn) v.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Your Manage link (backup)' }),
      el('p', { class: 'admin-hint', text: 'Your old private link still works as a backup for prices, stock and shop details. Keep it private.' }),
      btn('Open my Manage link', function () { api('manage_link').then(function (j) { window.open(j.url, '_blank'); }).catch(fail); })]));
    v.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Help' }),
      el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/2348112999073?text=' + encodeURIComponent('Hello SIRRADDO, this is ' + state.store.name + '. I need help with my store: '), target: '_blank', rel: 'noopener', text: 'Message SIRRADDO' })]));
  }

  if (token) load().catch(function () { /* the login form shows */ });
})();
