/* QR poster maker (Admin → a WhatsApp Business, QR menu or Mini website order → 📱 QR poster).
   2 designs in the customer's colours with their logo and a large QR code: "Scan to chat on WhatsApp",
   "Scan to see our menu"… Download as a print-ready PDF (A5 or A4) or a picture for WhatsApp. */
(function () {
  'use strict';
  var SIZES = { a5: { label: 'A5 print (148 × 210 mm)', w: 1748, h: 2480, mm: [148, 210] }, a4: { label: 'A4 print (210 × 297 mm)', w: 2480, h: 3508, mm: [210, 297] }, status: { label: 'WhatsApp status (1080 × 1920)', w: 1080, h: 1920 } };
  var FONTS = [['Poppins', 700, 'poppins-latin-700-normal'], ['Poppins', 800, 'poppins-latin-800-normal'], ['Playfair Display', 900, 'playfair-display-latin-900-normal'], ['Montserrat', 500, 'montserrat-latin-500-normal']];
  var fontsReady = null;
  function loadFonts() {
    if (fontsReady) return fontsReady;
    if (!window.FontFace || !document.fonts) return (fontsReady = Promise.resolve());
    return (fontsReady = Promise.all(FONTS.map(function (f) { var ff = new FontFace(f[0], 'url(/assets/fonts/looks/' + f[2] + '.woff2) format("woff2")', { weight: String(f[1]) }); return ff.load().then(function (x) { document.fonts.add(x); }).catch(function () {}); })));
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] == null) continue; if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function lum(h) { var n = parseInt(String(h).slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255; return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function mix(a, b, t) { var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); var c = [16, 8, 0].map(function (s) { return Math.round((x >> s & 255) * (1 - t) + (y >> s & 255) * t); }); return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // Text that fits: shrinks to fit the width, wraps to at most `max` lines. Returns the height used.
  function fitText(c, text, x, y, w, size, min, weight, family, color, max, align) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines, s = size;
    for (; s >= min; s -= 2) {
      c.font = weight + ' ' + s + 'px "' + family + '", Arial, sans-serif'; lines = []; var cur = '';
      words.forEach(function (wd) { var t = cur ? cur + ' ' + wd : wd; if (c.measureText(t).width > w && cur) { lines.push(cur); cur = wd; } else cur = t; });
      if (cur) lines.push(cur);
      if (lines.length <= max && lines.every(function (l) { return c.measureText(l).width <= w; })) break;
    }
    c.fillStyle = color; c.textAlign = align || 'center'; c.textBaseline = 'alphabetic';
    var lh = s * 1.15; lines.slice(0, max).forEach(function (l, i) { c.fillText(l, align === 'left' ? x : x + w / 2, y + s + i * lh); });
    return lines.slice(0, max).length * lh;
  }
  function qr(c, text, x, y, size, dark) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = size / n; c.fillStyle = dark;
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(Math.floor(x + k * m), Math.floor(y + r * m), Math.ceil(m), Math.ceil(m));
  }
  function logoOrInitials(c, d, cx, cy, r, bg, fg) {
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fillStyle = bg; c.fill();
    if (d.logo) { c.clip(); var k = Math.min(r * 1.6 / d.logo.width, r * 1.6 / d.logo.height); c.drawImage(d.logo, cx - d.logo.width * k / 2, cy - d.logo.height * k / 2, d.logo.width * k, d.logo.height * k); }
    else { var ini = String(d.business || '').split(/\s+/).filter(function (w) { return /^[A-Za-z0-9]/.test(w) && !/^(and|of|the|&)$/i.test(w); }).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
      c.fillStyle = fg; c.font = '900 ' + r * 0.95 + 'px "Playfair Display", Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ini || '★', cx, cy + r * 0.04); }
    c.restore();
  }

  // Design 1: bold colour background, white card with the code.
  function bold(c, W, H, d) {
    var u = W / 1000, main = d.main, acc = d.accent, onMain = lum(main) < 0.5 ? '#FFFFFF' : '#111827';
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, mix(main, '#000000', 0.1)); g.addColorStop(1, mix(main, '#ffffff', 0.08)); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.08; c.fillStyle = acc; c.beginPath(); c.arc(W * 0.95, H * 0.05, W * 0.45, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(W * 0.02, H * 0.98, W * 0.35, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    var tall = H / W > 1.6, y = (tall ? 150 : 90) * u;
    logoOrInitials(c, d, W / 2, y + 70 * u, 70 * u, '#FFFFFF', main); y += 170 * u;
    y += fitText(c, d.business, 80 * u, y, W - 160 * u, 64 * u, 34 * u, '900', 'Playfair Display', onMain, 2) + 20 * u;
    y += fitText(c, d.headline, 70 * u, y, W - 140 * u, 92 * u, 48 * u, '800', 'Poppins', acc, 3) + 34 * u;
    var foot = 150 * u, cardW = Math.min(W - 200 * u, H - y - foot - 130 * u), cx = (W - cardW) / 2;
    c.save(); c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 40 * u; c.shadowOffsetY = 14 * u; rr(c, cx, y, cardW, cardW, 36 * u); c.fillStyle = '#FFFFFF'; c.fill(); c.restore();
    var pad = cardW * 0.09; qr(c, d.link, cx + pad, y + pad, cardW - 2 * pad, lum(main) < 0.6 ? main : '#111827');
    y += cardW + 30 * u;
    if (d.sub) fitText(c, d.sub, 80 * u, y, W - 160 * u, 34 * u, 22 * u, '700', 'Poppins', onMain, 2);
    c.fillStyle = acc; c.fillRect(0, H - foot, W, foot);
    fitText(c, d.footer, 60 * u, H - foot + (foot - 40 * u) / 2 - 6 * u, W - 120 * u, 40 * u, 22 * u, '700', 'Poppins', lum(acc) < 0.5 ? '#FFFFFF' : '#111827', 1);
  }
  // Design 2: light paper, colour band, the code framed with corner marks.
  function clean(c, W, H, d) {
    var u = W / 1000, main = d.main, acc = d.accent, light = d.light || mix(main, '#ffffff', 0.94), ink = lum(main) < 0.6 ? main : '#111827';
    c.fillStyle = light; c.fillRect(0, 0, W, H);
    var band = (H / W > 1.6 ? 300 : 230) * u; c.fillStyle = main; c.fillRect(0, 0, W, band); c.fillStyle = acc; c.fillRect(0, band, W, 10 * u);
    logoOrInitials(c, d, W / 2, band, 78 * u, '#FFFFFF', main);
    c.save(); c.beginPath(); c.arc(W / 2, band, 78 * u, 0, Math.PI * 2); c.lineWidth = 8 * u; c.strokeStyle = acc; c.stroke(); c.restore();
    fitText(c, d.business, 80 * u, band * 0.18, W - 160 * u, 56 * u, 30 * u, '900', 'Playfair Display', lum(main) < 0.5 ? '#FFFFFF' : '#111827', 1);
    var y = band + 110 * u;
    y += fitText(c, d.headline, 70 * u, y, W - 140 * u, 84 * u, 44 * u, '800', 'Poppins', ink, 3) + 100 * u;
    var foot = 130 * u, size = Math.min(W - 260 * u, H - y - foot - 170 * u), x = (W - size) / 2;
    c.fillStyle = '#FFFFFF'; rr(c, x - 30 * u, y - 30 * u, size + 60 * u, size + 60 * u, 24 * u); c.fill();
    qr(c, d.link, x, y, size, ink);
    // corner marks
    c.strokeStyle = acc; c.lineWidth = 12 * u; c.lineCap = 'round'; var L = 70 * u, e = 52 * u;
    [[x - e, y - e, 1, 1], [x + size + e, y - e, -1, 1], [x - e, y + size + e, 1, -1], [x + size + e, y + size + e, -1, -1]].forEach(function (p) { c.beginPath(); c.moveTo(p[0], p[1] + L * p[3]); c.lineTo(p[0], p[1]); c.lineTo(p[0] + L * p[2], p[1]); c.stroke(); });
    y += size + 90 * u;
    if (d.sub) fitText(c, d.sub, 80 * u, y, W - 160 * u, 34 * u, 22 * u, '600', 'Poppins', '#4B5563', 2);
    c.fillStyle = main; c.fillRect(0, H - foot, W, foot);
    fitText(c, d.footer, 60 * u, H - foot + (foot - 38 * u) / 2 - 6 * u, W - 120 * u, 38 * u, 22 * u, '700', 'Poppins', lum(main) < 0.5 ? '#FFFFFF' : '#111827', 1);
  }
  var DESIGNS = [['Bold', bold], ['Clean', clean]];

  function render(d, size) {
    var S = SIZES[size] || SIZES.a5;
    return DESIGNS.map(function (D) { var cv = document.createElement('canvas'); cv.width = S.w; cv.height = S.h; D[1](cv.getContext('2d'), S.w, S.h, d); cv.title = D[0]; return cv; });
  }

  function open(o) {
    var r = o.request || {}, kind = /whatsapp/i.test(r.interest || '') ? 'wa' : /menu/i.test(r.interest || '') ? 'menu' : 'site';
    var h = r.hosting || {}, siteUrl = h.attached && h.domain ? 'https://' + h.domain : h.pagesUrl || r.website_url || '';
    var wa = o.phone ? 'https://wa.me/' + o.phone : '';
    var f = {
      link: el('input', { value: kind === 'wa' ? wa : siteUrl, placeholder: kind === 'wa' ? 'https://wa.me/2348012345678' : 'https://theirname.sirraddo.com.ng' }),
      business: el('input', { value: o.business || r.business || r.name || '', maxlength: '60' }),
      headline: el('input', { value: kind === 'wa' ? 'Scan to chat with us on WhatsApp' : kind === 'menu' ? 'Scan to see our menu' : 'Scan to visit our website', maxlength: '60' }),
      sub: el('input', { value: kind === 'wa' ? 'Ask questions, order and get updates' : kind === 'menu' ? 'Prices, photos and how to order' : 'Prices, photos, directions and WhatsApp', maxlength: '80' }),
      footer: el('input', { maxlength: '80' }),
      main: el('input', { type: 'color', value: o.main || '#13254F' }), accent: el('input', { type: 'color', value: o.accent || '#E8B230' }),
      size: el('select', null, Object.keys(SIZES).map(function (k) { return el('option', { value: k, text: SIZES[k].label }); })),
      logo: el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }),
    };
    function shortLink() { return f.link.value.replace(/^https?:\/\//, '').replace(/\/$/, ''); }
    f.footer.value = kind === 'wa' && o.phone ? 'WhatsApp: 0' + o.phone.slice(3) : shortLink();
    var logoImg = null, msg = el('p', { class: 'admin-hint' }), out = el('div', { class: 'st-thumbs' });
    var logoPick = el('div', { class: 'admin-actions' });
    (o.files || []).filter(function (x) { return /\.(png|jpe?g|webp)(\?|$)/i.test(x.url); }).slice(0, 6).forEach(function (x) {
      logoPick.appendChild(el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: x.name.slice(0, 24), onclick: function () { load(x.url); } }));
    });
    function load(src) { var i = new Image(); i.crossOrigin = 'anonymous'; i.onload = function () { logoImg = i; draw(); }; i.onerror = function () { msg.textContent = 'That picture could not be loaded.'; }; i.src = src; }
    f.logo.addEventListener('change', function () { if (f.logo.files[0]) load(URL.createObjectURL(f.logo.files[0])); });
    var canv = [];
    function data() { return { link: f.link.value.trim(), business: f.business.value.trim(), headline: f.headline.value.trim(), sub: f.sub.value.trim(), footer: f.footer.value.trim(), main: f.main.value, accent: f.accent.value, logo: logoImg }; }
    var t;
    function draw() {
      clearTimeout(t); t = setTimeout(function () {
        var d = data(); out.innerHTML = '';
        if (!/^https?:\/\/\S+\.\S+/.test(d.link)) { msg.textContent = 'Type the link the code should open (their WhatsApp link or website address).'; return; }
        msg.textContent = 'Test the code with 2 phones before you send it.';
        loadFonts().then(function () {
          canv = render(d, f.size.value);
          canv.forEach(function (cv, i) {
            var prev = document.createElement('canvas'); prev.width = 360; prev.height = Math.round(360 * cv.height / cv.width); prev.getContext('2d').drawImage(cv, 0, 0, prev.width, prev.height);
            prev.style.width = '220px'; prev.style.borderRadius = '8px'; prev.style.boxShadow = '0 6px 18px rgba(0,0,0,.2)';
            out.appendChild(el('div', { class: 'st-thumb' }, [prev, el('span', { text: 'Option ' + (i + 1) + ' · ' + cv.title }),
              el('div', { class: 'admin-actions' }, [
                el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: '⬇️ Picture', onclick: function () { cv.toBlob(function (b) { give(b, name(i, 'png')); }, 'image/png'); } }),
                SIZES[f.size.value].mm ? el('button', { class: 'admin-btn admin-btn--small', type: 'button', text: '⬇️ Print PDF', onclick: function () { pdf(cv, i); } }) : null,
              ])]));
          });
        });
      }, 200);
    }
    function name(i, ext) { return (f.business.value || 'QR').replace(/[^\w]+/g, '-') + '-QR-poster-option-' + (i + 1) + '-' + f.size.value + '.' + ext; }
    function give(blob, nm) {
      var file = new File([blob], nm, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) return navigator.share({ files: [file], title: nm }).catch(function () {});
      var a = el('a', { href: URL.createObjectURL(blob), download: nm }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
    function pdf(cv, i) {
      var S = SIZES[f.size.value];
      (window.jspdf ? Promise.resolve() : new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = '/assets/vendor/jspdf.umd.min.js'; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }))
        .then(function () { var doc = new window.jspdf.jsPDF({ unit: 'mm', format: [S.mm[0], S.mm[1]] }); doc.addImage(cv.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, S.mm[0], S.mm[1]); give(doc.output('blob'), name(i, 'pdf')); })
        .catch(function () { msg.textContent = 'Could not make the PDF. Download the picture instead.'; });
    }
    Object.keys(f).forEach(function (k) { if (k !== 'logo') { f[k].addEventListener('input', draw); f[k].addEventListener('change', draw); } });
    function lab(t, i) { return el('label', { class: 'st-field' }, [el('span', { text: t }), i]); }
    var wrap = el('div', { class: 'st-wrap', role: 'dialog', 'aria-label': 'QR poster' });
    wrap.appendChild(el('div', { class: 'st-box' }, [
      el('div', { class: 'st-top' }, [el('strong', { text: '📱 QR poster · ' + (r.name || '') }), el('button', { class: 'admin-btn', type: 'button', text: '✕ Close', onclick: function () { wrap.remove(); document.body.style.overflow = ''; } })]),
      el('div', { class: 'st-body' }, [
        el('div', { class: 'st-left' }, [out, msg]),
        el('div', { class: 'st-panel' }, [
          lab('Link the code opens', f.link), lab('Business name', f.business), lab('Headline', f.headline), lab('Small line under the code', f.sub), lab('Bottom line', f.footer),
          el('div', { class: 'st-field' }, [el('span', { text: 'Colours: main and accent' }), el('div', { class: 'st-custom' }, [f.main, f.accent])]),
          lab('Size', f.size), el('div', { class: 'st-field' }, [el('span', { text: 'Logo (tap one of their files, or upload)' }), logoPick, f.logo]),
          window.SirReview && o.api ? window.SirReview.button('🔍 AI check the posters', function () {
            if (!canv.length) throw new Error('Make the posters first (type the link).');
            return Promise.all(canv.map(function (c) { return window.SirReview.shrink(c, 1300); })).then(function (images) { return { kind: 'poster', images: images, link: f.link.value }; });
          }, function (p) { return o.api(Object.assign({ action: 'review_work', id: r.id }, p)); }) : null,
          el('p', { class: 'admin-hint', text: 'Send both options; they pick one. Print it at A5 for tables and counters, A4 for walls and doors.' }),
        ]),
      ]),
    ]));
    document.body.appendChild(wrap); document.body.style.overflow = 'hidden';
    var logoFile = (o.files || []).filter(function (x) { return /logo/i.test(x.name) && /\.(png|jpe?g|webp)(\?|$)/i.test(x.url); })[0];
    if (logoFile) load(logoFile.url); else draw();
  }
  window.SirQR = { open: open, render: render, fonts: loadFonts };
})();
