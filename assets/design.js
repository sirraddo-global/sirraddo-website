// Order form for quick services (/design and /services): hides services switched off in admin, changes the
// question for the chosen service, uploads files, sends the order to /api/order, then goes to the payment page
// (with an email) or shows the reference and a WhatsApp link.
(function () {
  'use strict';
  var form = document.getElementById('ds-form');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var msg = $('ds-msg'), btn = $('ds-submit'), list = $('ds-files-list'), input = $('ds-files');
  var session = 'design-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  var files = []; // [{ url, name }]
  var uploading = 0;
  var MAX = 6;

  // "Order …" buttons on the price cards pick that design in the form.
  document.querySelectorAll('[data-design]').forEach(function (a) {
    a.addEventListener('click', function () { $('ds-service').value = a.getAttribute('data-design'); });
  });
  try { var sv = JSON.parse(localStorage.getItem('sirraddo-lead') || '{}'); ['name', 'business', 'contact', 'email'].forEach(function (k) { if (sv[k] && !$('ds-' + k).value) $('ds-' + k).value = sv[k]; }); } catch (_) { /* ignore */ }
  var sel = $('ds-service');
  var pre = new URLSearchParams(location.search).get('d');
  if (pre) Array.prototype.forEach.call(sel.options, function (o) { if (o.value === pre) sel.value = pre; });

  // The question and file hint follow the chosen service.
  var wordsLabel = $('ds-words-label'), filesLabel = $('ds-files-label');
  var firstAsk = wordsLabel ? wordsLabel.textContent : '', firstPh = $('ds-words').placeholder;
  function fit() {
    var o = sel.options[sel.selectedIndex];
    var ask = o && o.getAttribute('data-ask'), ph = o && o.getAttribute('data-ph'), fl = o && o.getAttribute('data-files');
    if (wordsLabel) wordsLabel.textContent = ask || firstAsk;
    $('ds-words').placeholder = ph || firstPh;
    if (filesLabel && fl) filesLabel.textContent = /up to 6/.test(fl) ? fl : /\)$/.test(fl) ? fl.replace(/\)$/, ', up to 6)') : fl + ' (up to 6)';
    drawExtras();
  }

  // Paid extras (same-day delivery, animated status) for the chosen service, and the running total.
  var EXTRAS = {
    express: ['Same-day delivery', 2000, 'Order and pay by 12 noon, get your options the same day'],
    animated: ['Animated WhatsApp status version', 3000, 'A 10–15 second moving version for your status'],
  };
  var naira = function (n) { return '₦' + Number(n).toLocaleString('en-NG'); };
  var extrasBox = $('ds-extras'), totalLine = $('ds-total');
  function chosenExtras() {
    return extrasBox ? Array.prototype.map.call(extrasBox.querySelectorAll('input:checked'), function (i) { return i.value; }) : [];
  }
  function drawTotal() {
    var o = sel.options[sel.selectedIndex];
    var price = o ? Number(o.getAttribute('data-price') || 0) : 0;
    if (!totalLine) return;
    if (!price) { totalLine.textContent = ''; return; }
    var total = price + chosenExtras().reduce(function (n, k) { return n + EXTRAS[k][1]; }, 0);
    totalLine.innerHTML = 'Total: <b>' + naira(total) + '</b>';
  }
  function drawExtras() {
    if (!extrasBox) return;
    var o = sel.options[sel.selectedIndex];
    var keep = chosenExtras();
    var list = ((o && o.getAttribute('data-extras')) || '').split(',').filter(function (k) { return EXTRAS[k]; });
    Array.prototype.slice.call(extrasBox.querySelectorAll('label')).forEach(function (l) { l.remove(); });
    list.forEach(function (k) {
      var l = document.createElement('label'); l.className = 'ds-check';
      var i = document.createElement('input'); i.type = 'checkbox'; i.value = k; i.checked = keep.indexOf(k) !== -1;
      i.addEventListener('change', drawTotal);
      var t = document.createElement('span');
      t.innerHTML = '<b>' + EXTRAS[k][0] + ' (+' + naira(EXTRAS[k][1]) + ')</b><small>' + EXTRAS[k][2] + '</small>';
      l.appendChild(i); l.appendChild(t); extrasBox.appendChild(l);
    });
    extrasBox.hidden = !list.length;
    drawTotal();
  }

  // "Brand on file": the logo, colours and style from this customer's last order on this phone.
  var brand = null;
  try { brand = JSON.parse(localStorage.getItem('sirraddo-brand') || 'null'); } catch (_) { brand = null; }
  if (brand && $('ds-brand') && ((brand.files || []).length || brand.colours)) {
    $('ds-brand').hidden = false;
    $('ds-use-brand').addEventListener('change', function () {
      var on = this.checked;
      if ($('ds-colours') && on && !$('ds-colours').value) $('ds-colours').value = brand.colours || '';
      if ($('ds-style') && on && !$('ds-style').value) $('ds-style').value = brand.style || '';
      (brand.files || []).forEach(function (f) {
        var has = files.some(function (x) { return x.url === f.url; });
        if (on && !has && files.length < MAX) files.push(f);
        if (!on && has) files = files.filter(function (x) { return x.url !== f.url; });
      });
      showFiles();
    });
  }
  sel.addEventListener('change', fit);
  document.querySelectorAll('[data-design]').forEach(function (a) { a.addEventListener('click', function () { setTimeout(fit, 0); }); });
  fit();

  // Hide services switched off in admin (Packages → Side services).
  fetch('/api/order').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (!j || !Array.isArray(j.visible)) return;
    var on = {}; j.visible.forEach(function (k) { on[k] = 1; });
    var shown = 0;
    document.querySelectorAll('article[data-svc]').forEach(function (c) { var v = !!on[c.getAttribute('data-svc')]; c.hidden = !v; if (v) shown++; });
    document.querySelectorAll('[data-svc-block]').forEach(function (b) { b.hidden = !on[b.getAttribute('data-svc-block')]; });
    document.querySelectorAll('[data-svc-any]').forEach(function (b) { b.hidden = !b.getAttribute('data-svc-any').split(',').some(function (k) { return on[k]; }); });
    Array.prototype.slice.call(sel.options).forEach(function (o) {
      var k = o.getAttribute('data-svc'); if (!k) return;
      if (!on[k]) { if (sel.value === o.value) sel.value = ''; o.remove(); }
    });
    fit();
    if (!shown) {
      if ($('ds-none')) $('ds-none').hidden = false;
      var order = $('order'); if (order) order.hidden = true;
      document.querySelectorAll('a[href="#order"]').forEach(function (a) { a.hidden = true; });
    }
  }).catch(function () { /* keep everything showing */ });

  function say(text, bad) { msg.textContent = text; msg.style.color = bad ? '#B42318' : ''; }
  function showFiles() {
    list.textContent = files.length ? '📎 ' + files.map(function (f) { return f.name; }).join(', ') + (uploading ? ' · uploading…' : '') : (uploading ? 'Uploading…' : '');
  }

  // Big photos are shrunk before upload (logos in PNG keep their see-through background).
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\/(jpeg|webp)$/.test(file.type) && !(file.type === 'image/png' && file.size > 3.5e6)) return resolve(file);
      if (file.size < 1.2e6) return resolve(file);
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, 2400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', 0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  // Uploads picked files into `into` (their own photos, or samples of a design they like).
  function upload(picked, into, max, draw) {
    if (into.length + picked.length > max) { say('You can add up to ' + max + ' here. Send more on WhatsApp after ordering.', true); picked = picked.slice(0, max - into.length); }
    picked.forEach(function (file) {
      uploading++; draw();
      shrink(file).then(function (blob) {
        var type = blob.type || file.type;
        var name = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 60);
        if (type === 'image/jpeg' && !/\.jpe?g$/i.test(name)) name = name.replace(/\.\w+$/, '') + '.jpg';
        return fetch('/api/chat-upload?s=' + encodeURIComponent(session) + '&name=' + encodeURIComponent(name) + '&type=' + encodeURIComponent(type), { method: 'POST', body: blob })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Upload failed'); return j; }); });
      }).then(function (j) { into.push({ url: j.url, name: j.name }); say(''); })
        .catch(function (e) { say(e.message || 'Upload failed. You can send it on WhatsApp instead.', true); })
        .then(function () { uploading--; draw(); });
    });
  }
  input.addEventListener('change', function () {
    var picked = Array.prototype.slice.call(input.files || []); input.value = '';
    upload(picked, files, MAX, showFiles);
  });

  // A design they like (screenshot, photo of a flyer): we copy the look, not the content.
  var samples = [], sInput = $('ds-samples'), sList = $('ds-samples-list');
  function showSamples() {
    if (!sList) return;
    sList.textContent = samples.length ? '🖼️ ' + samples.map(function (f) { return f.name; }).join(', ') + (uploading ? ' · uploading…' : '') : '';
  }
  if (sInput) sInput.addEventListener('change', function () {
    var picked = Array.prototype.slice.call(sInput.files || []); sInput.value = '';
    upload(picked, samples, 2, showSamples);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (uploading) return say('Please wait: your files are still uploading.', true);
    var body = {
      service: sel.value, words: $('ds-words').value, size: $('ds-size') ? $('ds-size').value : '',
      colours: $('ds-colours') ? $('ds-colours').value : '', style: $('ds-style') ? $('ds-style').value : '', deadline: $('ds-deadline').value,
      name: $('ds-name').value, business: $('ds-business').value, contact: $('ds-contact').value,
      email: $('ds-email').value, files: files, samples: samples, website: $('ds-hp').value, extras: chosenExtras(),
      from: window.sirraddoFrom ? window.sirraddoFrom() : '',
    };
    if (!body.service) { $('ds-service').focus(); return say('Please choose a service.', true); }
    btn.disabled = true; say('Sending your order…');
    fetch('/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j; }); })
      .then(function (j) {
        // Remember the brand for next time, and this order for the tracker.
        try {
          if (files.length || body.colours) localStorage.setItem('sirraddo-brand', JSON.stringify({ colours: body.colours, style: body.style, files: files.slice(0, 6), at: Date.now() }));
          if (j.track) { var past = JSON.parse(localStorage.getItem('sirraddo-orders') || '[]'); past.unshift({ ref: j.ref, service: body.service, track: j.track }); localStorage.setItem('sirraddo-orders', JSON.stringify(past.slice(0, 10))); }
        } catch (_) { /* ignore */ }
        if (j.pay) { say('Order saved (' + (j.ref || '') + '). Taking you to payment…'); location.href = j.pay; return; }
        var wa = 'https://wa.me/2348167550937?text=' + encodeURIComponent('Hi, I just ordered: ' + body.service + (j.ref ? ' (ref ' + j.ref + ')' : '') + ' on your website.');
        form.innerHTML = '<div class="ds-done"><h3>Order received 🎉</h3><p>' + (j.ref ? 'Your reference is <b>' + j.ref + '</b>. ' : '') +
          'We will message you on WhatsApp to confirm and send your payment link.</p><a class="btn btn--gold" target="_blank" rel="noopener" href="' + wa + '">Message us on WhatsApp now</a>' +
          (j.track ? '<p><a href="' + j.track + '">Track your order</a> (bookmark it)</p>' : '') + '</div>';
      })
      .catch(function (err) { btn.disabled = false; say(err.message, true); });
  });
})();
