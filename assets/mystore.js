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
    ({ orders: renderOrders, products: renderProducts, customers: renderCustomers, payments: renderPayments, shop: renderShop, account: renderAccount, reports: renderReports })[state.tab](v);
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
  var STATUS = { pending: ['Payment not finished', 'is-due'], paid: ['Paid', 'is-won'], awaiting: ['Waiting for transfer', 'is-due'], cod: ['Pay on delivery', 'is-new'], cancelled: ['Cancelled', 'is-lost'], failed: ['Payment failed', 'is-lost'], abandoned: ['Not paid', 'is-lost'], part: ['Paying small-small', 'is-due'] };
  var FILTERS = [['todo', 'To do'], ['', 'All'], ['awaiting', 'Waiting for transfer'], ['cod', 'Pay on delivery'], ['part', 'Paying small-small'], ['paid', 'Paid'], ['pending', 'Online payment not finished'], ['cancelled', 'Cancelled']];
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
      el('ul', { class: 'admin-mini' }, o.items.map(function (l) { return el('li', { text: l.name + ' × ' + l.qty + ': ' + naira(l.total) }); })
        .concat(o.discount ? [el('li', { text: 'Discount' + (o.code ? ' (code ' + o.code + ')' : '') + ': −' + naira(o.discount) })] : [])
        .concat(o.delivery || o.zone ? [el('li', { text: 'Delivery' + (o.zone ? ' to ' + o.zone : '') + ': ' + (o.delivery ? naira(o.delivery) : 'free') })] : [])),
      o.status === 'part' ? el('p', { class: 'admin-callout' }, [el('b', { text: 'Paying small-small: ' }), naira(o.paid_amount || 0) + ' paid, ' + naira(o.total - (o.paid_amount || 0)) + ' left. ' + ((o.payments || []).length ? 'Payments: ' + o.payments.map(function (x) { return naira(x.amount) + ' (' + when(x.at) + ')'; }).join(', ') + '. ' : '') + 'Send the items when it’s fully paid.']) : null,
      (o.status === 'paid' || o.status === 'cod') && !o.delivered_at && (o.packed_at || o.shipped_at) ? el('p', { class: 'admin-meta' }, [badge(o.shipped_at ? 'Out for delivery' : 'Packed', 'is-new'), ' ' + when(o.shipped_at || o.packed_at)]) : null,
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
    if (num) acts.appendChild(el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + num + '?text=' + encodeURIComponent('Hello ' + String(b.name || '').split(' ')[0] + ', this is ' + (state.store.name || 'the store') + ' about your order ' + o.ref + '. You can follow it here: ' + String(o.link || '').replace('&receipt=1', '') + ' '), target: '_blank', rel: 'noopener', text: 'WhatsApp customer' }));
    if (o.status === 'awaiting') acts.appendChild(btn('Confirm paid', act('paid', 'Have you SEEN ' + naira(o.total) + ' in your bank app from this customer? Screenshots can be fake. Confirm only if the money is there.', 'Payment confirmed. The customer’s receipt is ready.'), 'admin-btn--primary'));
    if (o.status === 'cod') acts.appendChild(btn('Paid & delivered', act('paid', 'Did you deliver it and receive ' + naira(o.total) + '?', 'Marked paid and delivered'), 'admin-btn--primary'));
    // Order tracking: each tap shows on the customer's order page.
    if ((o.status === 'paid' || o.status === 'cod') && !o.delivered_at) {
      if (!o.packed_at) acts.appendChild(btn('Packed', act('packed', null, 'Marked packed. The customer sees it on their order page.')));
      if (!o.shipped_at) acts.appendChild(btn('Out for delivery', act('shipped', null, 'Marked out for delivery. The customer sees it on their order page.')));
    }
    if (o.status === 'part') {
      var amt = el('input', { type: 'number', min: '1', step: '100', placeholder: 'Amount received (₦)', 'aria-label': 'Amount received' });
      acts.appendChild(amt);
      acts.appendChild(btn('Record payment', function (e) {
        var n = amt.value.trim(); if (!n) { amt.focus(); return; }
        if (!window.confirm('Have you SEEN ' + naira(n) + ' in your bank app from this customer? Record it only if the money is there.')) return;
        var bt = e.currentTarget; bt.disabled = true;
        api('order', { ref: o.ref, do: 'payment', amount: n }).then(function (j) { flash(j.order.status === 'paid' ? 'Fully paid ✓ Send the items now. The customer’s receipt is ready.' : 'Recorded ✓ ' + naira(j.order.total - j.order.paid_amount) + ' left to pay.'); load().then(redraw); }).catch(function (er) { bt.disabled = false; fail(er); });
      }, 'admin-btn--primary'));
      if (!o.paid_amount) acts.appendChild(btn('Cancel order', act('cancel', 'Cancel this order? Its items go back into stock. Tell the customer on WhatsApp.', 'Order cancelled'), 'admin-btn--danger'));
    }
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
      // Stock on the website: hide the numbers (e.g. stores that source items when customers order).
      var s0 = state.store || {}, hs = el('input', { type: 'checkbox', checked: !s0.hideStock });
      box.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Stock on your website' }),
        el('p', { class: 'admin-hint', text: 'Don’t keep stock and buy items when customers order? Leave “In stock” empty for those products: nothing shows and they never sell out. Or untick below to hide stock numbers for every product.' }),
        el('label', { class: 'admin-check' }, [hs, ' Show stock numbers to customers (e.g. “Only 2 left”)']),
        btn('Save', function (e) { savePayments({ hideStock: !hs.checked }, e.currentTarget); }, 'admin-btn--primary')]));
      // "Tell me when it's back": message them from your WhatsApp when it's in stock, then tick them off.
      if ((j.alerts || []).length) {
        var ab = el('div', { class: 'admin-card admin-callout' }, [el('h2', { text: 'Waiting for stock (' + j.alerts.length + ')' }), el('p', { class: 'admin-hint', text: 'These customers asked to be told when an item is back. When it is, message them, then tap Done.' })]);
        j.alerts.forEach(function (a) {
          var n = wa(a.phone), item = a.product + (a.variant ? ' (' + a.variant + ')' : '');
          ab.appendChild(el('div', { class: 'admin-meta' }, [el('b', { text: item + ': ' }), a.name + ' · ' + a.phone + ' · ' + when(a.created_at) + ' ',
            n ? el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + n + '?text=' + encodeURIComponent('Hello ' + a.name.split(' ')[0] + ', good news from ' + (state.store.name || 'us') + ': ' + item + ' is back in stock. ' + (state.store.website || '')), target: '_blank', rel: 'noopener', text: 'WhatsApp' }) : null,
            btn('Done', function (e) { var bt = e.currentTarget; bt.disabled = true; api('alerts_done', { ids: [a.id] }).then(function () { flash('Done'); render(); }).catch(fail); })]));
        });
        box.appendChild(ab);
      }
      var find = el('input', { type: 'search', placeholder: 'Find a product' });
      if (j.products.length > 8) box.appendChild(el('div', { class: 'admin-card' }, [find]));
      j.products.forEach(function (p) {
        var price = el('input', { value: p.price, inputmode: 'decimal', 'aria-label': 'Price of ' + p.name });
        var stock = el('input', { value: String(p.stock), inputmode: 'numeric', placeholder: 'not counted', 'aria-label': 'Stock of ' + p.name });
        var sold = el('input', { type: 'checkbox', checked: p.soldout });
        var top = el('input', { type: 'checkbox', checked: p.top });
        var was = el('input', { value: p.was || '', inputmode: 'decimal', placeholder: 'Empty = no sale', 'aria-label': 'Old price of ' + p.name });
        var ends = el('input', { type: 'datetime-local', value: String(p.saleEnds || '').slice(0, 16), 'aria-label': 'Sale ends for ' + p.name });
        var opts = el('input', { value: p.options || '', placeholder: 'e.g. Size: 40, 41, 42 | Colour: Black, Brown', 'aria-label': 'Sizes or colours of ' + p.name });
        var vst = el('textarea', { rows: '3', placeholder: 'e.g.\n41 / Black = 3\n42 / Brown = 0', 'aria-label': 'Stock per choice of ' + p.name }); vst.value = p.vstock || '';
        rows[p.i] = { price: price, stock: stock, sold: sold, top: top, was: was, ends: ends, opts: opts, vst: vst };
        var card = el('div', { class: 'admin-card', 'data-s': (p.name + ' ' + p.category).toLowerCase() }, [el('h3', { text: p.name }), p.category ? el('p', { class: 'admin-meta', text: p.category }) : null,
          el('div', { class: 'admin-grid' }, [field('Price', price), field('In stock', stock)]), el('label', { class: 'admin-check' }, [sold, ' Sold out']), el('label', { class: 'admin-check' }, [top, ' Show at the top of my home page']),
          el('details', { class: 'admin-more' }, [el('summary', { text: 'Sale, sizes & colours' + (p.was ? ' · ON SALE' : '') + (p.options ? ' · has choices' : '') }),
            el('div', { class: 'admin-grid' }, [field('Old price (₦), crossed out', was, 'The price above is the sale price.'), field('Sale ends (optional)', ends, 'After this, the old price comes back by itself.')]),
            field('Sizes / colours (optional)', opts, 'Customers must choose one of each. Separate groups with |'),
            p.options ? field('Stock for each choice (optional)', vst, 'One per line: choice = number. Leave out choices you don’t count.') : el('p', { class: 'admin-hint', text: 'Save the sizes/colours first, then you can add stock for each choice here.' })])]);
        box.appendChild(card);
      });
      find.addEventListener('input', function () { var w = find.value.toLowerCase(); Array.prototype.forEach.call(box.querySelectorAll('[data-s]'), function (c) { c.hidden = w && c.getAttribute('data-s').indexOf(w) < 0; }); });
      box.appendChild(el('div', { class: 'admin-actions' }, [btn('Save products', function (e) {
        var products = {}; Object.keys(rows).forEach(function (i) { var R = rows[i]; products[i] = { price: R.price.value, stock: R.stock.value, soldout: R.sold.checked, top: R.top.checked, was: R.was.value, saleEnds: R.ends.value, options: R.opts.value };
          if (R.opts.value.trim()) products[i].vstock = R.vst.value; });
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
        rv.appendChild(el('div', { class: 'admin-meta' }, [el('b', { text: '★'.repeat(x.stars) + ' ' + x.name }), x.product ? ' on ' + x.product : '', x.verified ? ' ' : null, x.verified ? badge('✓ Verified buyer', 'is-won') : null, x.body ? el('p', { text: x.body }) : null, sel[x.id]]));
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
    // Delivery fee by area (the customer picks their area at checkout) and free delivery above an amount.
    var zl = el('div'), zones = (s.zones || []).map(function (z) { return { name: z.name, fee: z.fee }; });
    function zdraw() { zl.textContent = ''; zones.forEach(function (z, k) {
      var nm = el('input', { value: z.name, placeholder: 'Area, e.g. Bodija', 'aria-label': 'Area name', oninput: function () { z.name = nm.value; } });
      var fe = el('input', { type: 'number', min: '0', step: '100', value: z.fee, placeholder: '₦', 'aria-label': 'Fee for this area', oninput: function () { z.fee = fe.value; } });
      zl.appendChild(el('div', { class: 'admin-grid' }, [field('Area', nm), field('Fee (₦, 0 = free)', fe), btn('Remove', function () { zones.splice(k, 1); zdraw(); }, 'admin-btn--danger')])); }); }
    zdraw();
    var free = el('input', { type: 'number', min: '0', step: '1000', value: s.freeOver || '', placeholder: 'e.g. 50000 (empty = never free)' });
    v.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Delivery fee by area' }), el('p', { class: 'admin-hint', text: 'Add your areas and what delivery costs to each. Customers pick their area at checkout and the fee is added by itself. Add “Pick up from our shop” with fee 0 if you have a shop. With no areas, the flat fee above is used.' }),
      zl, btn('+ Add an area', function () { zones.push({ name: '', fee: '' }); zdraw(); }), field('Free delivery on orders above (₦)', free, 'Customers see “Add ₦X more for free delivery” in their cart.')]));
    // Discount codes.
    var cl = el('div'), codes = (s.codes || []).map(function (c) { return { code: c.code, kind: c.pct ? 'pct' : 'amount', val: c.pct || c.amount, min: c.min || '', ends: c.ends || '', max: c.max || '', used: c.used || 0, off: !!c.off }; });
    function cdraw() { cl.textContent = ''; codes.forEach(function (c, k) {
      var cc = el('input', { value: c.code, placeholder: 'e.g. SALE10', 'aria-label': 'Code', oninput: function () { c.code = cc.value.toUpperCase(); } });
      var kd = el('select', { 'aria-label': 'Type of discount', onchange: function () { c.kind = kd.value; } }, [el('option', { value: 'pct', text: '% off' }), el('option', { value: 'amount', text: '₦ off' })]); kd.value = c.kind;
      var vv = el('input', { type: 'number', min: '1', value: c.val, 'aria-label': 'How much off', oninput: function () { c.val = vv.value; } });
      var mn = el('input', { type: 'number', min: '0', step: '1000', value: c.min, placeholder: 'No minimum', 'aria-label': 'Minimum order', oninput: function () { c.min = mn.value; } });
      var en = el('input', { type: 'date', value: String(c.ends).slice(0, 10), 'aria-label': 'Ends', oninput: function () { c.ends = en.value; } });
      var mx = el('input', { type: 'number', min: '0', value: c.max, placeholder: 'No limit', 'aria-label': 'Most uses', oninput: function () { c.max = mx.value; } });
      var on = el('input', { type: 'checkbox', checked: !c.off, onchange: function () { c.off = !on.checked; } });
      cl.appendChild(el('div', { class: 'admin-card' }, [el('div', { class: 'admin-grid' }, [field('Code', cc), field('Discount', el('span', { class: 'admin-row' }, [kd, vv])), field('Minimum order (₦)', mn), field('Ends (optional)', en), field('Most uses (optional)', mx)]),
        el('p', { class: 'admin-meta', text: 'Used ' + c.used + ' time' + (c.used === 1 ? '' : 's') }), el('label', { class: 'admin-check' }, [on, ' Switched on']), btn('Remove', function () { codes.splice(k, 1); cdraw(); }, 'admin-btn--danger')])); }); }
    cdraw();
    v.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Discount codes' }), el('p', { class: 'admin-hint', text: 'Share a code on your WhatsApp Status or flyers. Customers type it in their cart. It only works on orders paid through your website.' }), cl, btn('+ Add a code', function () { codes.push({ code: '', kind: 'pct', val: 10, min: '', ends: '', max: '', used: 0, off: false }); cdraw(); })]));
    // Pay small-small.
    var ins = s.instalments || {}, pss = toggle('Let customers pay small-small', ins.on, '(by bank transfer, in parts; the items are kept for them and sent when fully paid)');
    var fp = el('input', { type: 'number', min: '10', max: '90', value: ins.firstPct || 30 });
    v.appendChild(el('div', { class: 'admin-card admin-settings' }, [el('h2', { text: 'Pay small-small' }), pss.row, field('First payment (% of the total)', fp, 'You record each payment in Orders when you see it in your bank app. Uses your bank transfer details above.')]));
    var bsave = btn('Save payment settings', function (e) {
      var p = { paystackOn: ps.box.checked, flwOn: fw.box.checked, transfer: { on: tr.box.checked, bank: bank.value, name: aname.value, number: anum.value, note: tnote.value },
        delivery: { on: dl.box.checked, note: dnote.value }, deliveryFee: fee.value.trim(), notify: notify.value.trim() };
      if (!s.paystack.connected) delete p.paystackOn;
      if (!s.flutterwave.connected) delete p.flwOn;
      if (psKey.value.trim()) p.paystackKey = psKey.value.trim();
      if (fwKey.value.trim()) p.flwKey = fwKey.value.trim();
      if (ac) p.accountsOn = ac.box.checked;
      if (gg) p.googleOn = gg.box.checked;
      p.zones = zones.filter(function (z) { return String(z.name).trim(); }).map(function (z) { return { name: z.name, fee: Number(z.fee) || 0 }; });
      p.freeOver = free.value.trim();
      p.codes = codes.filter(function (c) { return String(c.code).trim(); }).map(function (c) { return { code: c.code, pct: c.kind === 'pct' ? Number(c.val) : 0, amount: c.kind === 'amount' ? Number(c.val) : 0, min: Number(c.min) || 0, ends: c.ends, max: Number(c.max) || 0, off: c.off }; });
      p.instalments = { on: pss.box.checked, firstPct: Number(fp.value) || 30 };
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
    // Signed-in customers who left items in their cart (an hour or more ago).
    var carts = el('div', { class: 'admin-card' }, [el('h2', { text: 'Unfinished carts' })]);
    v.insertBefore(carts, v.firstChild);
    api('carts').then(function (j) {
      if (!j.carts.length) { carts.appendChild(el('p', { class: 'admin-hint', text: 'None right now. When a signed-in customer leaves items in their cart, they appear here so you can follow up.' })); return; }
      carts.appendChild(el('p', { class: 'admin-hint', text: 'Signed-in customers who left items in their cart. A friendly message often brings them back.' }));
      j.carts.forEach(function (c) {
        var n = wa(c.phone), tot = c.items.reduce(function (a, l) { return a + (l.p || 0) * l.q; }, 0), names = c.items.map(function (l) { return l.n + (l.v ? ' (' + l.v + ')' : '') + ' ×' + l.q; }).join(', ');
        carts.appendChild(el('div', { class: 'admin-meta' }, [el('b', { text: c.name + ': ' }), names + (tot ? ' · ' + naira(tot) : '') + ' · ' + when(c.updated_at) + (c.nudged_at ? ' · messaged' : '') + ' ',
          n ? el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + n + '?text=' + encodeURIComponent('Hello ' + c.name.split(' ')[0] + ', this is ' + state.store.name + '. You left ' + names + ' in your cart. Can we help you complete your order? ' + (state.store.website || '')), target: '_blank', rel: 'noopener', text: 'WhatsApp',
            onclick: function () { api('cart_nudged', { buyer_id: c.buyer_id }).catch(function () {}); } }) : null]));
      });
    }).catch(function () {});
  }

  // ---------- Reports ----------
  function renderReports(v) {
    v.appendChild(el('p', { class: 'admin-hint', text: 'Last 90 days. Paid orders, and pay-on-delivery orders once delivered.' }));
    var box = el('div'); v.appendChild(box);
    api('reports').then(function (j) {
      var t = j.last90 || {};
      box.appendChild(el('div', { class: 'admin-tiles' }, [el('div', { class: 'admin-tile' }, [el('span', { class: 'admin-tile-label', text: 'Sales' }), el('strong', { text: naira(t.total) }), el('small', { text: t.orders + ' order' + (t.orders === 1 ? '' : 's') })]),
        el('div', { class: 'admin-tile' }, [el('span', { class: 'admin-tile-label', text: 'Average order' }), el('strong', { text: naira(t.avg) })])]));
      var max = Math.max.apply(null, (j.weeks || []).map(function (w) { return w.total; }).concat([1]));
      box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Sales by week' })].concat((j.weeks || []).length ? j.weeks.map(function (w) {
        return el('div', { class: 'admin-bar-row wide' }, [el('span', { text: 'Week of ' + w.week }), el('span', { class: 'admin-bar-track' }, [el('i', { class: 'admin-bar-fill', style: 'width:' + Math.max(4, Math.round(w.total / max * 100)) + '%' })]), el('b', { text: naira(w.total) + ' · ' + w.orders })]); }) : [el('p', { class: 'admin-hint', text: 'No sales yet.' })])));
      box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Best sellers' })].concat((j.best || []).length ? [el('ol', { class: 'admin-mini' }, j.best.map(function (b) { return el('li', { text: b.name + ': ' + b.qty + ' sold · ' + naira(b.total) }); }))] : [el('p', { class: 'admin-hint', text: 'No sales yet.' })])));
      var dmax = Math.max.apply(null, (j.days || []).map(function (d) { return d.orders; }).concat([1]));
      box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Busiest days' })].concat((j.days || []).length ? j.days.map(function (d) {
        return el('div', { class: 'admin-bar-row wide' }, [el('span', { text: d.day }), el('span', { class: 'admin-bar-track' }, [el('i', { class: 'admin-bar-fill', style: 'width:' + Math.max(4, Math.round(d.orders / dmax * 100)) + '%' })]), el('b', { text: d.orders + ' order' + (d.orders === 1 ? '' : 's') })]); }) : [el('p', { class: 'admin-hint', text: 'No sales yet.' })])));
      if ((j.codes || []).length) box.appendChild(el('div', { class: 'admin-card' }, [el('h2', { text: 'Discount codes used' }), el('ul', { class: 'admin-mini' }, j.codes.map(function (c) { return el('li', { text: c.code + ': ' + c.orders + ' order' + (c.orders === 1 ? '' : 's') + ' · ' + naira(c.discount) + ' off in total' }); }))]));
    }).catch(fail);
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
      el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/2348167550937?text=' + encodeURIComponent('Hello SIRRADDO, this is ' + state.store.name + '. I need help with my store: '), target: '_blank', rel: 'noopener', text: 'Message SIRRADDO' })]));
  }

  if (token) load().catch(function () { /* the login form shows */ });
})();
