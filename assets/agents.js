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

  // ----- Promo kit: personalised flyers, status images and QR card (drawn on the phone), and the videos -----
  var NAVY = '#13254F', DEEP = '#0B1733', GOLD = '#D9A21B';
  var FONT = 'Arial, Helvetica, sans-serif';
  function xml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
  function wordmark(x, y, size, anchor, light) {
    var w = light ? '#FFFFFF' : NAVY;
    return '<text x="' + x + '" y="' + y + '" font-family="' + FONT + '" font-weight="900" font-size="' + size + '" text-anchor="' + (anchor || 'start') + '" fill="' + w + '">SI<tspan fill="' + GOLD + '">RR</tspan>A<tspan fill="' + GOLD + '">DD</tspan>O</text>' +
      '<text x="' + x + '" y="' + (y + size * 0.42) + '" font-family="' + FONT + '" font-weight="700" font-size="' + (size * 0.2) + '" letter-spacing="' + (size * 0.12) + '" text-anchor="' + (anchor || 'start') + '" fill="' + w + '" opacity=".85">GLOBAL LIMITED</text>';
  }
  function qrAt(svg, x, y, size) { return svg.replace(/<\?xml[^>]*>/, '').replace('<svg ', '<svg x="' + x + '" y="' + y + '" width="' + size + '" height="' + size + '" '); }
  function ticks(list, x, y, size, gap, color) {
    return list.map(function (t, i) { var yy = y + i * gap; return '<circle cx="' + (x + size * 0.45) + '" cy="' + (yy - size * 0.35) + '" r="' + size * 0.45 + '" fill="' + GOLD + '"/><path d="M' + (x + size * 0.22) + ' ' + (yy - size * 0.36) + ' l' + size * 0.16 + ' ' + size * 0.16 + ' l' + size * 0.3 + ' -' + size * 0.32 + '" stroke="' + NAVY + '" stroke-width="' + size * 0.12 + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="' + (x + size * 1.3) + '" y="' + yy + '" font-family="' + FONT + '" font-size="' + size + '" font-weight="600" fill="' + color + '">' + xml(t) + '</text>'; }).join('');
  }
  function shortLink(d) { return d.link.replace(/^https:\/\/(www\.)?/, ''); }
  function phoneOf(d) { var p = String(d.agent.phone || ''); return p.length === 11 ? p.slice(0, 4) + ' ' + p.slice(4, 7) + ' ' + p.slice(7) : p; }
  // A soft gold glow (a plain see-through circle looks muddy on navy).
  function glow(id, cx, cy, r, op) { return '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="' + GOLD + '" stop-opacity="' + op + '"/><stop offset="1" stop-color="' + GOLD + '" stop-opacity="0"/></radialGradient></defs><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#' + id + ')"/>'; }
  // Each design: [name, width, height, svg(d, qr)]
  var DESIGNS = [
    ['Status: websites', 1080, 1920, function (d, qr) {
      return '<rect width="1080" height="1920" fill="' + NAVY + '"/>' + glow('g1', 980, 140, 620, 0.35) + '<circle cx="60" cy="1820" r="380" fill="#1E3A78" opacity=".7"/>' +
        wordmark(90, 200, 92, 'start', true) +
        '<text font-family="' + FONT + '" font-weight="900" fill="#FFFFFF" font-size="104"><tspan x="90" y="430">Get your</tspan><tspan x="90" y="550">business</tspan><tspan x="90" y="670" fill="' + GOLD + '">online</tspan></text>' +
        '<text x="90" y="770" font-family="' + FONT + '" font-size="46" fill="#DCE3F1">Professional websites from <tspan font-weight="900" fill="' + GOLD + '">₦50,000</tspan></text>' +
        ticks(['Your own .com.ng name', 'WhatsApp button & Google Maps', 'Online store & payments', 'Ready in about 7 days'], 90, 900, 46, 84, '#FFFFFF') +
        '<rect x="300" y="1250" width="480" height="480" rx="36" fill="#FFFFFF"/>' + qrAt(qr, 330, 1280, 420) +
        '<text x="540" y="1800" text-anchor="middle" font-family="' + FONT + '" font-size="44" font-weight="800" fill="' + GOLD + '">Scan to start</text>' +
        '<text x="540" y="1862" text-anchor="middle" font-family="' + FONT + '" font-size="34" fill="#DCE3F1">' + xml(shortLink(d)) + '</text>';
    }],
    ['Status: online store', 1080, 1920, function (d, qr) {
      return '<rect width="1080" height="1920" fill="' + DEEP + '"/>' + glow('g2', 1000, 1600, 640, 0.3) + '<rect x="0" y="0" width="1080" height="14" fill="' + GOLD + '"/>' +
        wordmark(90, 200, 92, 'start', true) +
        '<text font-family="' + FONT + '" font-weight="900" fill="#FFFFFF" font-size="112"><tspan x="90" y="440">Sell online</tspan><tspan x="90" y="565" fill="' + GOLD + '">24/7</tspan></text>' +
        '<text font-family="' + FONT + '" font-size="46" fill="#DCE3F1"><tspan x="90" y="670">Your own online store: customers</tspan><tspan x="90" y="730">order and pay, you get it on WhatsApp.</tspan></text>' +
        ticks(['Card, transfer or pay on delivery', 'Products with photos & prices', 'Delivery areas & discount codes', 'From ₦150,000'], 90, 860, 46, 84, '#FFFFFF') +
        '<rect x="300" y="1250" width="480" height="480" rx="36" fill="#FFFFFF"/>' + qrAt(qr, 330, 1280, 420) +
        '<text x="540" y="1800" text-anchor="middle" font-family="' + FONT + '" font-size="44" font-weight="800" fill="' + GOLD + '">Scan to start your store</text>' +
        '<text x="540" y="1862" text-anchor="middle" font-family="' + FONT + '" font-size="34" fill="#DCE3F1">' + xml(shortLink(d)) + '</text>';
    }],
    ['Flyer to print (A5)', 1240, 1754, function (d, qr) {
      var a = d.agent, row = function (y, name, price, note) { return '<rect x="80" y="' + y + '" width="1080" height="132" rx="20" fill="#F4F6FA" stroke="#E2E7F0"/><text x="120" y="' + (y + 62) + '" font-family="' + FONT + '" font-size="44" font-weight="800" fill="' + NAVY + '">' + name + '</text><text x="120" y="' + (y + 106) + '" font-family="' + FONT + '" font-size="30" fill="#4A5568">' + note + '</text><text x="1120" y="' + (y + 82) + '" text-anchor="end" font-family="' + FONT + '" font-size="54" font-weight="900" fill="#B07D0E">' + price + '</text>'; };
      return '<rect width="1240" height="1754" fill="#FFFFFF"/><rect width="1240" height="420" fill="' + NAVY + '"/><rect y="420" width="1240" height="12" fill="' + GOLD + '"/>' +
        wordmark(80, 150, 84, 'start', true) +
        '<text font-family="' + FONT + '" font-weight="900" fill="#FFFFFF" font-size="76"><tspan x="80" y="290">Your business deserves</tspan><tspan x="80" y="380" fill="' + GOLD + '">a real website</tspan></text>' +
        row(500, 'Starter website', '₦50,000', 'Up to 5 pages · .com.ng domain · 1 business email') +
        row(656, 'Business website', '₦100,000', 'Up to 10 pages + blog · 5 emails · Google Maps setup') +
        row(812, 'Online Store', 'from ₦150,000', 'Cart, online payments, your own store admin') +
        '<text font-family="' + FONT + '" font-size="34" fill="#1B2433"><tspan x="80" y="1010">✓ See your website before you pay the balance</tspan><tspan x="80" y="1058">✓ Ready in about 7 working days</tspan></text>' +
        '<rect x="80" y="1090" width="560" height="560" rx="28" fill="#FFFFFF" stroke="' + NAVY + '" stroke-width="6"/>' + qrAt(qr, 110, 1120, 500) +
        '<text font-family="' + FONT + '" fill="' + NAVY + '"><tspan x="690" y="1170" font-size="48" font-weight="900">Scan to start</tspan><tspan x="690" y="1230" font-size="32">or visit</tspan><tspan x="690" y="1280" font-size="30" font-weight="700">' + xml(shortLink(d)) + '</tspan></text>' +
        '<rect x="690" y="1340" width="470" height="300" rx="24" fill="#FFF8E6" stroke="#F0D58A"/>' +
        '<text font-family="' + FONT + '" fill="' + NAVY + '"><tspan x="720" y="1400" font-size="30" font-weight="700" fill="#8A6410">ASK ME</tspan><tspan x="720" y="1460" font-size="44" font-weight="900">' + xml(a.name.split(/\s+/).slice(0, 2).join(' ')) + '</tspan><tspan x="720" y="1520" font-size="40" font-weight="700">' + xml(phoneOf(d)) + '</tspan><tspan x="720" y="1590" font-size="28">Agent code: ' + xml(a.code) + '</tspan></text>' +
        '<text x="620" y="1715" text-anchor="middle" font-family="' + FONT + '" font-size="26" fill="#6B7280">SIRRADDO GLOBAL LIMITED · RC 9939920 · www.sirraddo.com.ng</text>';
    }],
    ['QR card', 1050, 600, function (d, qr) {
      return '<defs><clipPath id="cc"><rect width="1050" height="600" rx="36"/></clipPath></defs><g clip-path="url(#cc)"><rect width="1050" height="600" fill="' + NAVY + '"/><rect x="600" y="0" width="450" height="600" fill="#FFFFFF"/><rect x="590" y="0" width="12" height="600" fill="' + GOLD + '"/></g>' +
        wordmark(60, 150, 76, 'start', true) +
        '<text font-family="' + FONT + '" fill="#FFFFFF"><tspan x="60" y="290" font-size="40" font-weight="800">Websites · Online stores</tspan><tspan x="60" y="345" font-size="40" font-weight="800">Business apps</tspan><tspan x="60" y="440" font-size="30" fill="' + GOLD + '" font-weight="700">' + xml(d.agent.name.split(/\s+/).slice(0, 2).join(' ')) + ' · ' + xml(d.agent.code) + '</tspan><tspan x="60" y="490" font-size="28" fill="#DCE3F1">' + xml(phoneOf(d)) + '</tspan></text>' +
        qrAt(qr, 650, 70, 350) + '<text x="825" y="490" text-anchor="middle" font-family="' + FONT + '" font-size="38" font-weight="900" fill="' + NAVY + '">Scan me</text><text x="825" y="535" text-anchor="middle" font-family="' + FONT + '" font-size="22" fill="#4A5568">' + xml(shortLink(d)) + '</text>';
    }],
  ];
  var VIDEOS = [
    ['video-websites', 'Websites', 'Is your business on Google yet? 📍 Get a professional website from ₦50,000, ready in about 7 working days.'],
    ['video-store', 'Online Store', 'Sell online and get paid straight to your account 🛒 Your own online store from ₦150,000.'],
    ['video-why', 'Tired of "How much?"', 'Tired of answering the same questions on WhatsApp all day? 😅 A website shows your prices, photos and location 24/7. From ₦50,000.'],
    ['video-see-first', 'See it first', 'See your website before you pay the balance, and pick your favourite design.'],
    ['video-maps', 'Google Maps', 'When people search "near me", can they find your business? 📍 Business website with Google Maps setup.'],
    ['video-manage', 'Update from your phone', 'Change prices, stock and opening hours from your phone in seconds 📱'],
    ['video-pidgin', 'Pidgin', 'Your business dey Google? 👀 Make we build your website from ₦50,000, e go ready inside 7 working days.'],
  ];
  var qrSvg = null;
  function getQr(d) {
    if (qrSvg) return Promise.resolve(qrSvg);
    return fetch('/api/agent?qr=' + encodeURIComponent(d.agent.code)).then(function (r) { if (!r.ok) throw new Error('qr'); return r.text(); }).then(function (t) { qrSvg = t; return t; });
  }
  function svgDoc(w, h, inner) { return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + inner + '</svg>'; }
  function svgUrl(svg) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }
  function toPng(svg, w, h) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { var c = document.createElement('canvas'); c.width = w; c.height = h; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); c.toBlob(function (b) { b ? resolve(b) : reject(new Error('png')); }, 'image/png'); };
      img.onerror = function () { reject(new Error('Could not draw the picture')); };
      img.src = svgUrl(svg);
    });
  }
  function saveBlob(blob, name) { var u = URL.createObjectURL(blob), a = el('a', { href: u, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  // Share sheet (WhatsApp, Status, Facebook…) where the phone supports sharing files; otherwise save it.
  function shareFile(blob, name, text, btn) {
    var file = new File([blob], name, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], text: text }).catch(function () {});
    saveBlob(blob, name);
    if (text) { copy(text, btn); }
  }
  function kit(d) {
    var box = el('div', { class: 'ag-box ag-kit' }, [el('h3', { text: 'Promo kit' }), el('p', { class: 'ag-small', text: 'Flyers, status pictures and a QR card with YOUR link and code, plus short videos. Share them on WhatsApp Status, Facebook and Instagram, or print the flyer.' })]);
    var tabs = el('div', { class: 'ag-kit-tabs', role: 'tablist' }), panes = {};
    [['pics', 'Flyers & QR'], ['vids', 'Videos']].forEach(function (t, i) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': i ? 'false' : 'true', text: t[1] });
      b.addEventListener('click', function () { Array.prototype.forEach.call(tabs.children, function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); }); Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== t[0]; }); });
      tabs.appendChild(b);
    });
    box.appendChild(tabs);
    // Flyers & QR
    var pics = el('div', { class: 'ag-kit-grid' }); panes.pics = pics; box.appendChild(pics);
    pics.appendChild(el('p', { class: 'ag-small', text: 'Making your pictures…' }));
    getQr(d).then(function (qr) {
      pics.textContent = '';
      var caption = 'Get your business online with SIRRADDO 👉 ' + d.link;
      DESIGNS.forEach(function (ds) {
        var svg = svgDoc(ds[1], ds[2], ds[3](d, qr)), file = 'sirraddo-' + ds[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '') + '-' + d.agent.code + '.png';
        var dl = el('button', { type: 'button', class: 'btn btn--navy', text: 'Save' }), sh = el('button', { type: 'button', class: 'btn btn--gold', text: 'Share' });
        dl.addEventListener('click', function () { dl.disabled = true; toPng(svg, ds[1], ds[2]).then(function (b) { saveBlob(b, file); }).catch(function (e) { alert(e.message); }).then(function () { dl.disabled = false; }); });
        sh.addEventListener('click', function () { sh.disabled = true; toPng(svg, ds[1], ds[2]).then(function (b) { return shareFile(b, file, caption, sh); }).catch(function (e) { alert(e.message); }).then(function () { sh.disabled = false; }); });
        pics.appendChild(el('figure', { class: 'ag-kit-item' }, [el('img', { src: svgUrl(svg), alt: ds[0] + ' with your QR code', loading: 'lazy', style: 'aspect-ratio:' + ds[1] + '/' + ds[2] }), el('figcaption', { text: ds[0] }), el('div', { class: 'ag-acts' }, [sh, dl])]));
      });
      // The QR code on its own
      var q = svgDoc(600, 600, '<rect width="600" height="600" fill="#fff"/>' + qrAt(qr, 30, 30, 540));
      var qd = el('button', { type: 'button', class: 'btn btn--navy', text: 'Save QR code' });
      qd.addEventListener('click', function () { toPng(q, 1200, 1200).then(function (b) { saveBlob(b, 'sirraddo-qr-' + d.agent.code + '.png'); }); });
      pics.appendChild(el('figure', { class: 'ag-kit-item' }, [el('img', { src: svgUrl(q), alt: 'Your QR code', style: 'aspect-ratio:1/1' }), el('figcaption', { text: 'Just the QR code' }), el('div', { class: 'ag-acts' }, [qd])]));
    }).catch(function () { pics.textContent = ''; pics.appendChild(el('p', { class: 'ag-msg', text: 'Couldn\'t make your pictures just now. Please refresh the page.' })); });
    // Videos
    var vids = el('div', { class: 'ag-kit-grid', hidden: true }); panes.vids = vids; box.appendChild(vids);
    vids.appendChild(el('p', { class: 'ag-small ag-kit-full', text: 'Post a video, and paste the ready caption with it: the caption carries your link, so clients who tap it are counted as yours.' }));
    VIDEOS.forEach(function (v) {
      var cap = v[2] + ' 👉 ' + d.link + (d.agent.code ? '\n(Agent code: ' + d.agent.code + ')' : '');
      var src = '/assets/marketing/' + v[0] + '.mp4';
      var sh = el('button', { type: 'button', class: 'btn btn--gold', text: 'Share' }), cp = el('button', { type: 'button', class: 'btn btn--outline', text: 'Copy caption' });
      sh.addEventListener('click', function () {
        sh.disabled = true; sh.textContent = 'Getting video…';
        fetch(src).then(function (r) { return r.blob(); }).then(function (b) { return shareFile(new Blob([b], { type: 'video/mp4' }), 'sirraddo-' + v[0] + '.mp4', cap, cp); })
          .catch(function () { window.open(src, '_blank'); }).then(function () { sh.disabled = false; sh.textContent = 'Share'; });
      });
      cp.addEventListener('click', function () { copy(cap, cp); });
      vids.appendChild(el('figure', { class: 'ag-kit-item' }, [el('video', { src: src, poster: '/assets/marketing/' + v[0] + '.jpg', controls: true, preload: 'none', playsinline: true, style: 'aspect-ratio:9/16' }),
        el('figcaption', { text: v[1] }), el('p', { class: 'ag-small ag-cap', text: cap }), el('div', { class: 'ag-acts' }, [sh, cp, el('a', { class: 'btn btn--outline', href: src, download: 'sirraddo-' + v[0] + '.mp4', text: 'Save' })])]));
    });
    return box;
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
    dash.appendChild(kit(d));
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
