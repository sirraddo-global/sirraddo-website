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
    // Separate boxes for business name, what they sell, phone, address… shown only where that design needs them.
    var key = (o && o.getAttribute('data-svc')) || '';
    document.querySelectorAll('#ds-info [data-for]').forEach(function (f) { f.hidden = !!key && f.getAttribute('data-for').split(',').indexOf(key) === -1; });
    $('ds-words').required = !(o && o.getAttribute('data-optional'));
    // "Where will you use it?": not asked where the size is fixed; a sensible default and a plain explanation otherwise.
    var sz = $('ds-size'), szField = sz && sz.closest('.field');
    if (sz) {
      var fixed = { card: 'Business card', logo: '', brand: '' };
      if (key in fixed) { szField.hidden = true; if (fixed[key]) sz.value = fixed[key]; }
      else { szField.hidden = false; if (key === 'social' && /Not sure|Business card/.test(sz.value)) sz.value = 'WhatsApp / Instagram post (square)'; if (sz.value === 'Business card') sz.value = 'Not sure: please advise'; }
      sz.dispatchEvent(new Event('change'));
    }
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
    showPortfolio(j.gallery || []); showReviews(j.reviews || [], j.google || {});
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
      }).then(function (j) { into.push({ url: j.url, name: j.name }); say(''); if (window.sirraddoPreview) window.sirraddoPreview(); })
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

  // ---------- Portfolio (before → after, by category) and reviews, from admin ----------
  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function showPortfolio(list) {
    var sec = $('portfolio'), grid = $('pf-grid'), cats = $('pf-cats'); if (!sec || !list.length) return;
    var names = ['All'].concat(list.map(function (g) { return g.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    function draw(cat) {
      grid.innerHTML = ''; cats.innerHTML = '';
      names.forEach(function (n) { var b = mk('button', 'pf-cat' + (n === cat ? ' is-on' : ''), n); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', n === cat); b.onclick = function () { draw(n); }; cats.appendChild(b); });
      list.filter(function (g) { return cat === 'All' || g.cat === cat; }).forEach(function (g) {
        var fig = mk('figure', 'pf-item'), box = mk('div', 'pf-ba');
        var after = mk('img'); after.src = g.after; after.alt = (g.title || g.cat) + ': finished design'; after.loading = 'lazy'; box.appendChild(after);
        if (g.before) {
          var before = mk('img', 'pf-before'), line = mk('span', 'pf-line'); before.src = g.before; before.alt = 'Before: the photo the customer sent'; before.loading = 'lazy';
          box.appendChild(before); box.appendChild(line);
          box.appendChild(mk('span', 'pf-tag pf-tag--b', 'Before')); box.appendChild(mk('span', 'pf-tag pf-tag--a', 'After'));
          var r = mk('input', 'pf-range'); r.type = 'range'; r.min = 0; r.max = 100; r.value = 50; r.setAttribute('aria-label', 'Compare before and after');
          var set = function () { before.style.clipPath = 'inset(0 ' + (100 - r.value) + '% 0 0)'; line.style.left = r.value + '%'; }; r.oninput = set; set(); box.appendChild(r);
        }
        // Show each design where it will be used: tall ones on a phone, square/post ones as an Instagram post, A4/print ones as paper.
        after.addEventListener('load', function () {
          var r = after.naturalHeight / after.naturalWidth;
          if (r > 1.6) fig.classList.add('pf-item--phone');
          else if (r >= 1.38 || r < 0.75) fig.classList.add('pf-item--print');
          else if (!g.before) { fig.classList.add('pf-item--ig'); var hd = mk('div', 'pf-ighead'); hd.appendChild(mk('i')); hd.appendChild(mk('b', '', String(g.title || 'yourbusiness').toLowerCase().replace(/[^a-z0-9]+/g, ''))); box.parentNode.insertBefore(hd, box); box.parentNode.insertBefore(mk('div', 'pf-igbar', '\u2661  \uD83D\uDCAC  \u27A4'), box.nextSibling); }
        });
        fig.appendChild(box); fig.appendChild(mk('figcaption', '', (g.title ? g.title + ' · ' : '') + g.cat));
        var ord = mk('a', 'pf-order', 'Order a design like this');
        ord.href = 'https://wa.me/2348167550937?text=' + encodeURIComponent('Hello SIRRADDO, I\'d like a design like "' + (g.title || g.cat) + '" for my business.'); ord.target = '_blank'; ord.rel = 'noopener';
        fig.appendChild(ord); grid.appendChild(fig);
      });
    }
    draw('All'); sec.hidden = false;
  }
  function showReviews(list, google) {
    var sec = $('reviews'), grid = $('rv-grid'); if (!sec || !(list.length || google.review || google.maps)) return;
    var links = mk('p', 'rv-google');
    if (google.review) { var a1 = mk('a', 'btn btn--gold', '⭐ See our Google reviews'); a1.href = google.review; a1.target = '_blank'; a1.rel = 'noopener'; links.appendChild(a1); }
    if (google.maps) { var a2 = mk('a', 'btn btn--navy', '📍 Find us on Google Maps'); a2.href = google.maps; a2.target = '_blank'; a2.rel = 'noopener'; links.appendChild(a2); }
    if (links.children.length) grid.parentNode.appendChild(links);
    list.forEach(function (r) {
      var c = mk('figure', 'rv-card');
      if (r.photo) { var im = mk('img'); im.src = r.photo; im.alt = 'Photo from ' + r.name; im.loading = 'lazy'; c.appendChild(im); }
      c.appendChild(mk('div', 'rv-stars', '★★★★★'.slice(0, r.stars) + '☆☆☆☆☆'.slice(0, 5 - r.stars)));
      if (r.text) c.appendChild(mk('blockquote', '', '“' + r.text + '”'));
      c.appendChild(mk('figcaption', '', r.name + (r.business ? ', ' + r.business : '') + ' · ' + r.service));
      grid.appendChild(c);
    });
    sec.hidden = false;
  }

  // ---------- "Order in 2 minutes" button that follows on phones until the order form is on screen ----------
  (function () {
    var orderSec = $('order'); if (!orderSec || !('IntersectionObserver' in window)) return;
    var b = mk('a', 'ds-sticky', '🎨 Order your design · 2 minutes'); b.href = '#order-title'; document.body.appendChild(b);
    var heroSeen = true, orderSeen = false;
    var typing = false;
    var upd = function () { b.classList.toggle('is-on', !heroSeen && !orderSeen && !typing); };
    document.addEventListener('focusin', function (e) { typing = !!(e.target.closest && e.target.closest('form')); upd(); });
    document.addEventListener('focusout', function () { typing = false; setTimeout(upd, 50); });
    new IntersectionObserver(function (e) { orderSeen = e[0].isIntersecting; upd(); }).observe(orderSec);
    var hero = document.querySelector('.hero'); if (hero) new IntersectionObserver(function (e) { heroSeen = e[0].isIntersecting; upd(); }).observe(hero); else heroSeen = false;
  })();

  // ---------- Referral link (?ref=SGL-0017) and "Order again" (?again=token) ----------
  var qs = new URLSearchParams(location.search), refCode = (qs.get('ref') || '').toUpperCase();
  if (/^SGL-\d{1,7}$/.test(refCode)) {
    try { sessionStorage.setItem('sirraddo-ref', refCode); } catch (e) {}
  } else { try { refCode = sessionStorage.getItem('sirraddo-ref') || ''; } catch (e) { refCode = ''; } }
  if (refCode && totalLine) { var rb = mk('p', 'ds-ref', '🎁 A friend referred you: ₦1,000 off this order (taken off when we confirm).'); totalLine.parentNode.insertBefore(rb, totalLine); }
  if (qs.get('again')) fetch('/api/order?again=' + encodeURIComponent(qs.get('again'))).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.service) return;
    Array.prototype.forEach.call(sel.options, function (o) { if (o.value === j.service) sel.value = j.service; });
    if (j.business) $('ds-business').value = j.business;
    if (j.colours) $('ds-colours').value = j.colours;
    if (j.style && $('ds-style')) $('ds-style').value = j.style;
    Object.keys(j.info || {}).forEach(function (k) { var x = $('ds-' + k); if (x && j.info[k]) x.value = j.info[k]; });
    if (j.info && j.info.socials && window.sirSocialsFill) window.sirSocialsFill(j.info.socials);
    sel.dispatchEvent(new Event('change')); fit(); say('Your details from last time are filled in. Change anything, then add the new words.');
  }).catch(function () {});

  var SIZE_TIPS = {
    'WhatsApp / Instagram post (square)': 'Square, 1080 × 1080: for posts on WhatsApp, Instagram and Facebook.',
    'WhatsApp / Instagram status (tall)': 'Tall, 1080 × 1920: fills the phone screen on WhatsApp status and Instagram stories.',
    'Facebook post': '1200 × 1500: fits Facebook and Instagram feeds without being cut.',
    'A4 print': 'For printing on A4 paper (300 dpi, print-ready PDF any printer can use).',
    'A5 print (handbill)': 'Half of A4: cheaper to print in bulk for sharing by hand.',
    'Banner / roll-up': 'Tell us the size in feet in the words box (e.g. 6ft × 3ft). We send a print-ready file.',
    'Business card': '3.5 × 2 inches, front and back, print-ready.',
    'Not sure: please advise': 'No problem: you get it as a WhatsApp post AND a status, which covers most uses. Need it printed too? Just say so in the words box.',
  };
  if ($('ds-size')) $('ds-size').addEventListener('change', function () { var tip = $('ds-size-tip'); if (tip) tip.textContent = SIZE_TIPS[$('ds-size').value] || ''; });
  if ($('ds-size')) $('ds-size').dispatchEvent(new Event('change'));


  // Social handles: one box per platform, so a handle never ends up under the wrong one. They travel as
  // "IG @a, TikTok @b, FB name, X @c" (the design studio reads the platform from that).
  (function () {
    var hid = $('ds-socials'); if (!hid) return;
    var P = [['ig', 'IG'], ['tt', 'TikTok'], ['fb', 'FB'], ['x', 'X']];
    function join() { hid.value = P.map(function (p) { var v = ($('ds-soc-' + p[0]).value || '').trim(); if (!v) return ''; if (p[0] !== 'fb' && v.charAt(0) !== '@') v = '@' + v.replace(/^https?:\/\/\S*\//, ''); return p[1] + ' ' + v; }).filter(Boolean).join(', '); }
    P.forEach(function (p) { var x = $('ds-soc-' + p[0]); if (x) x.addEventListener('input', join); });
    // "Order again" fills the hidden box: spread it back over the platform boxes.
    window.sirSocialsFill = function (text) {
      String(text || '').split(/\s*[,;\n]\s*/).forEach(function (bit) {
        var m = bit.match(/^(ig|insta(?:gram)?|tiktok|tt|fb|facebook|x|twitter)\s*[:\-]?\s*(.+)$/i), k = 'ig', v = bit;
        if (m) { k = /^t(t|iktok)/i.test(m[1]) ? 'tt' : /^f/i.test(m[1]) ? 'fb' : /^(x|twitter)$/i.test(m[1]) ? 'x' : 'ig'; v = m[2]; }
        var box = $('ds-soc-' + k); if (box && v && !box.value) box.value = v.trim();
      });
      join();
    };
  })();
  // ---------- Live preview: 3 rough drafts that update as they type ----------
  var pvBox = $('ds-preview'), pvRow = $('ds-preview-row'), pvTimer = null, pickedLook = '';
  function previewNow() {
    if (!pvBox || !window.SirStudio || !window.SirStudio.preview) return;
    var o = sel.options[sel.selectedIndex], key = (o && o.getAttribute('data-svc')) || '';
    if (!key || key === 'logo' || key === 'brand' || key === 'custom') { pvBox.hidden = true; pickedLook = ''; return; }
    var info = {}; ['sell', 'person', 'title', 'phone', 'bizmail', 'web', 'address', 'socials'].forEach(function (k) { var x = $('ds-' + k); if (x && !x.closest('[hidden]') && x.value.trim()) info[k] = x.value.trim(); });
    info.email = info.bizmail;
    var words = $('ds-words').value.trim();
    if (!words && !$('ds-business').value.trim() && !info.person) { pvBox.hidden = true; return; }
    var szv = $('ds-size') ? $('ds-size').value : '';
    window.SirStudio.preview({ size: /status/.test(szv) ? 'status' : /square/.test(szv) ? 'square' : 'post', kind: key === 'card' ? 'card' : '', service: sel.value, words: words, business: $('ds-business').value.trim(), contact: info.phone || $('ds-contact').value,
      colours: $('ds-colours').value, info: info, photos: files }, 260).then(function (cvs) {
      pvRow.innerHTML = '';
      cvs.forEach(function (cv, i) {
        var label = 'Look ' + (i + 1) + ': ' + cv.title;
        var f = document.createElement('button'); f.type = 'button'; f.className = 'ds-pv' + (pickedLook === label ? ' is-on' : ''); f.setAttribute('aria-pressed', pickedLook === label);
        f.appendChild(cv);
        var cap = document.createElement('span'); cap.className = 'ds-pv-cap'; cap.textContent = label; f.appendChild(cap);
        var pick = document.createElement('span'); pick.className = 'ds-pv-pick'; pick.textContent = pickedLook === label ? '✓ Your choice' : 'Choose this look'; f.appendChild(pick);
        f.addEventListener('click', function () { pickedLook = pickedLook === label ? '' : label; previewNow(); });
        pvRow.appendChild(f);
      });
      var note = $('ds-pv-note'); if (note) note.textContent = pickedLook ? '👍 Got it: we\'ll start from ' + pickedLook.replace(/^Look \d+: /, '') + ' and polish it with your photos.' : 'Tap the look you like best (optional).';
      pvBox.hidden = false;
    }).catch(function () { pvBox.hidden = true; });
  }
  function previewSoon() { clearTimeout(pvTimer); pvTimer = setTimeout(previewNow, 700); }
  form.addEventListener('input', previewSoon); form.addEventListener('change', previewSoon);
  window.addEventListener('load', previewSoon);
  window.sirraddoPreview = previewSoon;

  // ---------- "Help me write it": 3 catchy headline ideas from the AI ----------
  var ideasBtn = $('ds-ideas'), ideasList = $('ds-ideas-list');
  if (ideasBtn) ideasBtn.addEventListener('click', function () {
    var words = $('ds-words').value.trim(), what = $('ds-sell') ? $('ds-sell').value.trim() : '';
    if (words.length < 4 && !what) { ideasList.textContent = 'Write a few words first (your offer, or what you sell), then tap again.'; return; }
    ideasBtn.disabled = true; ideasList.textContent = 'Writing 3 ideas…';
    fetch('/api/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'ideas', business: $('ds-business').value, what: what, words: words }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Could not get ideas.'); return j; }); })
      .then(function (j) {
        ideasList.innerHTML = '<p class="ds-tip">Tap one to use it. You can still change the words.</p>';
        (j.ideas || []).forEach(function (x) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'ds-idea';
          b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = x.headline; b.lastChild.textContent = x.line;
          b.addEventListener('click', function () {
            var cur = $('ds-words').value.trim(), lines = cur.split('\n');
            $('ds-words').value = x.headline + '\n' + x.line + (lines.length > 2 ? '\n\n' + cur : '');
            ideasList.innerHTML = ''; previewSoon();
          });
          ideasList.appendChild(b);
        });
      }).catch(function (e) { ideasList.textContent = e.message; }).then(function () { ideasBtn.disabled = false; });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (uploading) return say('Please wait: your files are still uploading.', true);
    var body = {
      service: sel.value, words: $('ds-words').value, size: $('ds-size') ? $('ds-size').value : '',
      colours: $('ds-colours') ? $('ds-colours').value : '', style: $('ds-style') ? $('ds-style').value : '', deadline: $('ds-deadline').value,
      name: $('ds-name').value, business: $('ds-business').value, contact: $('ds-contact').value,
      email: $('ds-email').value, files: files, samples: samples, website: $('ds-hp').value, extras: chosenExtras(),
      info: (function () { var i = {}; ['sell', 'person', 'title', 'phone', 'bizmail', 'web', 'address', 'socials'].forEach(function (k) { var x = $('ds-' + k); if (x && !x.closest('[hidden]') && x.value.trim()) i[k] = x.value.trim(); }); return i; })(),
      from: window.sirraddoFrom ? window.sirraddoFrom() : '', ref: refCode, look: pvBox && !pvBox.hidden ? pickedLook : '',
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
        if (j.quote) { form.innerHTML = '<div class="ds-done"><h3>Request received 🎉</h3><p>' + (j.ref ? 'Your reference is <b>' + j.ref + '</b>. ' : '') + 'We\'ll send your price on WhatsApp within a few hours, before you pay anything.</p>' + (j.track ? '<p><a href="' + j.track + '">Track your request</a> (bookmark it)</p>' : '') + '</div>'; return; }
        var wa = 'https://wa.me/2348167550937?text=' + encodeURIComponent('Hi, I just ordered: ' + body.service + (j.ref ? ' (ref ' + j.ref + ')' : '') + ' on your website.');
        form.innerHTML = '<div class="ds-done"><h3>Order received 🎉</h3><p>' + (j.ref ? 'Your reference is <b>' + j.ref + '</b>. ' : '') +
          'We will message you on WhatsApp to confirm and send your payment link.</p><a class="btn btn--gold" target="_blank" rel="noopener" href="' + wa + '">Message us on WhatsApp now</a>' +
          (j.track ? '<p><a href="' + j.track + '">Track your order</a> (bookmark it)</p>' : '') + '</div>';
      })
      .catch(function (err) { btn.disabled = false; say(err.message, true); });
  });
})();
