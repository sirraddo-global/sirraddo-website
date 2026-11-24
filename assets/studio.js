// Design studio (admin): turns a customer's photos, words and colours into 3 finished flyer drafts — no Canva needed.
// Auto-enhances the photos (brighter, richer colour, sharper), lets you edit every text, pick colours, the main photo
// and the logo, and downloads PNGs for WhatsApp post, status or print.
// Use: SirStudio.open({ photos: [{ url, name }], words, business, contact, colours, title })
(function () {
  'use strict';
  var FONT = 'Inter, "Segoe UI", Arial, sans-serif';
  var SIZES = {
    post: { w: 1080, h: 1350, label: 'WhatsApp / Instagram post' },
    square: { w: 1080, h: 1080, label: 'Square post' },
    status: { w: 1080, h: 1920, label: 'WhatsApp status' },
    a4: { w: 2480, h: 3508, label: 'A4 print (300 dpi)' },
  };
  var THEMES = [
    { name: 'Navy & gold', bg: '#13254F', accent: '#E8B230', light: '#F4F1E8' },
    { name: 'Sunset', bg: '#9A2A0C', accent: '#FDCB3C', light: '#FFF4E6' },
    { name: 'Emerald', bg: '#0E5A3A', accent: '#F4C430', light: '#EEF7F0' },
    { name: 'Royal purple', bg: '#3F1D6B', accent: '#F5B841', light: '#F4EFFA' },
    { name: 'Rose', bg: '#8E1F4E', accent: '#FFC2D1', light: '#FFF1F5' },
    { name: 'Charcoal & lime', bg: '#1E2229', accent: '#B8E04A', light: '#F2F4F0' },
    { name: 'Ocean', bg: '#0B4F6C', accent: '#FF9F1C', light: '#EEF6FA' },
    { name: 'Wine & cream', bg: '#5B1A2A', accent: '#F1D3A1', light: '#FBF5EC' },
  ];
  var COLOUR_WORDS = { red: '#B91C1C', maroon: '#7F1D1D', wine: '#5B1A2A', orange: '#C2410C', yellow: '#FACC15', gold: '#E8B230', green: '#15803D', lime: '#84CC16', teal: '#0F766E', blue: '#1D4ED8', 'sky': '#0EA5E9', navy: '#13254F', purple: '#6D28D9', violet: '#7C3AED', pink: '#DB2777', rose: '#E11D48', black: '#111111', brown: '#7C4A21', cream: '#F7EFDC', white: '#FFFFFF', grey: '#4B5563', gray: '#4B5563', silver: '#9CA3AF' };

  // ---------- helpers ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null) return;
      if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else if (k === 'value') n.value = v; else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function lum(hex) { var h = hex.replace('#', ''); var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  function onColour(hex) { return lum(hex) > 0.6 ? '#111827' : '#FFFFFF'; }
  function rr(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function cover(c, img, x, y, w, h, fy) {
    if (!img) { c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(x, y, w, h); return; }
    var s = Math.max(w / img.width, h / img.height), iw = img.width * s, ih = img.height * s;
    c.drawImage(img, x + (w - iw) / 2, y + (h - ih) * (fy == null ? 0.4 : fy), iw, ih);
  }
  // Wrap text into at most maxLines, shrinking the font until it fits.
  function fit(c, text, maxW, maxLines, big, small, weight) {
    text = String(text || '').trim();
    for (var size = big; size >= small; size -= Math.max(1, Math.round(big / 40))) {
      c.font = weight + ' ' + size + 'px ' + FONT;
      var words = text.split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + ' ' + words[i] : words[i];
        if (c.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = words[i]; }
      }
      if (cur) lines.push(cur);
      var widest = Math.max.apply(null, lines.map(function (l) { return c.measureText(l).width; }).concat([0]));
      if (lines.length <= maxLines && widest <= maxW) return { lines: lines, size: size };
    }
    c.font = weight + ' ' + small + 'px ' + FONT;
    return { lines: [text], size: small };
  }
  function drawLines(c, f, x, y, lh, color, weight, align) {
    c.font = weight + ' ' + f.size + 'px ' + FONT; c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
    f.lines.forEach(function (l, i) { c.fillText(l, x, y + f.size + i * f.size * lh); });
    c.textAlign = 'left';
    return y + f.size + (f.lines.length - 1) * f.size * lh;
  }

  // ---------- photo enhancement (works on every phone browser: plain pixel maths) ----------
  function enhance(img) {
    var max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
    var cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    var c = cv.getContext('2d'); c.drawImage(img, 0, 0, cv.width, cv.height);
    var d; try { d = c.getImageData(0, 0, cv.width, cv.height); } catch (e) { return cv; }
    var p = d.data, n = p.length, hist = new Uint32Array(256), i;
    for (i = 0; i < n; i += 16) hist[(p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0]++;
    var total = 0; for (i = 0; i < 256; i++) total += hist[i];
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.01) { lo = i; break; } }
    acc = 0; for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.01) { hi = i; break; } }
    if (hi - lo < 40) { lo = Math.max(0, lo - 20); hi = Math.min(255, hi + 20); }
    var scale = 255 / Math.max(1, hi - lo), lut = new Uint8ClampedArray(256);
    for (i = 0; i < 256; i++) { var v = (i - lo) * scale; v = 255 * Math.pow(Math.max(0, v) / 255, 0.92); lut[i] = v; }
    for (i = 0; i < n; i += 4) {
      var r = lut[p[i]], g = lut[p[i + 1]], b = lut[p[i + 2]], m = (r + g + b) / 3;
      p[i] = m + (r - m) * 1.18; p[i + 1] = m + (g - m) * 1.18; p[i + 2] = m + (b - m) * 1.18;
    }
    // light sharpen (unsharp: centre 1.6, neighbours -0.15)
    var w = cv.width, h = cv.height, src = new Uint8ClampedArray(p), y, x, k;
    for (y = 1; y < h - 1; y++) for (x = 1; x < w - 1; x++) {
      i = (y * w + x) * 4;
      for (k = 0; k < 3; k++) {
        p[i + k] = src[i + k] * 1.6 - 0.15 * (src[i + k - 4] + src[i + k + 4] + src[i + k - w * 4] + src[i + k + w * 4]);
      }
    }
    c.putImageData(d, 0, 0);
    return cv;
  }

  function load(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var go = function (u) { var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = function () { resolve(null); }; img.src = u; };
      if (/^(blob:|data:)/.test(src)) return go(src);
      // Same-site path, so the browser lets us edit the pixels (files are stored on the site under /files/…).
      var path; try { var u = new URL(src, location.href); path = u.origin === location.origin ? u.href : u.pathname; } catch (e) { path = src; }
      fetch(path).then(function (r) { if (!r.ok) throw new Error(); return r.blob(); })
        .then(function (b) { go(URL.createObjectURL(b)); }).catch(function () { resolve(null); });
    });
  }

  // ---------- guessing the text from the order ----------
  function guess(o) {
    var words = String(o.words || '').replace(/\r/g, '');
    var phone = (words.match(/(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}/) || [])[0] || o.contact || '';
    var offer = (words.match(/\d{1,2}\s?%\s?off\b|buy \d+ get \d+( free)?|free delivery|from \u20A6\s?[\d,]+|\u20A6\s?[\d,]+/i) || [])[0] || '';
    var lines = words.split(/\n|[.!?]\s+/).map(function (l) { return l.replace(/^[\s•\-*]+/, '').trim(); }).filter(Boolean);
    var biz = o.business || '';
    if (!biz && lines[0] && lines[0].indexOf(':') > 0 && lines[0].indexOf(':') < 40) biz = lines[0].split(':')[0];
    var clean = function (l) { return l.replace(phone, '').replace(biz ? new RegExp('^' + biz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:\\-–]?\\s*', 'i') : /$^/, '').replace(/\b(call|whatsapp|phone)\b[:\s]*$/i, '').trim(); };
    var rest = lines.map(clean).filter(function (l) { return l.length > 1; });
    var headline = rest.shift() || 'Your headline here';
    if (headline.length > 48) { var cut = headline.slice(0, 48).lastIndexOf(' '); rest.unshift(headline.slice(cut + 1)); headline = headline.slice(0, cut); }
    return { business: biz, headline: headline, details: rest.slice(0, 3).join('\n'), offer: offer.replace(/\s+/g, ' ').toUpperCase(), contact: phone ? 'Call / WhatsApp: ' + phone : '' };
  }
  function themeFrom(colours) {
    var found = [];
    String(colours || '').toLowerCase().replace(/[a-z]+/g, function (w) { if (COLOUR_WORDS[w] && found.indexOf(COLOUR_WORDS[w]) === -1) found.push(COLOUR_WORDS[w]); return w; });
    if (!found.length) return null;
    var dark = found.filter(function (h) { return lum(h) < 0.55; }), bright = found.filter(function (h) { return lum(h) >= 0.55; });
    var bg = dark[0] || '#13254F', accent = bright[0] || dark[1] || '#E8B230';
    return { name: 'Their colours', bg: bg, accent: accent, light: '#F7F5F0' };
  }

  // ---------- the 3 layouts ----------
  function logoBadge(c, logo, x, y, r, alignLeft) {
    if (!logo) return;
    var ar = logo.width / logo.height;
    if (ar > 1.3) { // wide logo (name beside the icon): a rounded white plate, right edge where the circle's was
      var w = r * 3.6, h = Math.max(r * 1.3, w / ar + r * 0.3), left = alignLeft ? x - r : x + r - w, top = y - h / 2;
      c.save(); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = r * 0.3; c.fillStyle = '#fff'; rr(c, left, top, w, h, r * 0.3); c.fill(); c.restore();
      var sw = Math.min((w - r * 0.3) / logo.width, (h - r * 0.2) / logo.height);
      c.drawImage(logo, left + (w - logo.width * sw) / 2, top + (h - logo.height * sw) / 2, logo.width * sw, logo.height * sw);
      return;
    }
    c.save(); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = r * 0.3; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
    var s = Math.min((r * 1.5) / logo.width, (r * 1.5) / logo.height);
    c.drawImage(logo, x - logo.width * s / 2, y - logo.height * s / 2, logo.width * s, logo.height * s);
  }
  function offerBadge(c, t, text, x, y, r) {
    if (!text) return;
    c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = r * 0.25; c.fillStyle = t.accent; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
    c.strokeStyle = onColour(t.accent); c.globalAlpha = 0.35; c.lineWidth = r * 0.04; c.setLineDash([r * 0.08, r * 0.08]); c.beginPath(); c.arc(x, y, r * 0.86, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    var f = fit(c, text, r * 1.5, 3, r * 0.5, r * 0.18, 900);
    var lh = 1.05, hh = f.size + (f.lines.length - 1) * f.size * lh;
    drawLines(c, f, x, y - hh / 2 - f.size * 0.12, lh, onColour(t.accent), 900, 'center');
  }
  function pill(c, t, text, cx, y, maxW, size) {
    if (!text) return;
    var f = fit(c, text, maxW - size * 2, 1, size, size * 0.6, 800);
    c.font = '800 ' + f.size + 'px ' + FONT; var w = c.measureText(f.lines[0]).width + f.size * 2.2, h = f.size * 2.3;
    c.fillStyle = t.accent; rr(c, cx - w / 2, y, w, h, h / 2); c.fill();
    c.fillStyle = onColour(t.accent); c.textAlign = 'center'; c.fillText(f.lines[0], cx, y + h / 2 + f.size * 0.36); c.textAlign = 'left';
  }

  var LAYOUTS = [
    { name: 'Bold photo', draw: function (c, W, H, d, t) {
      var u = W / 1080, tall = H / W > 1.5, photoH = H * (tall ? 0.6 : 0.56), pad = 60 * u;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      c.save(); c.beginPath(); c.rect(0, 0, W, photoH); c.clip(); cover(c, d.photo, 0, 0, W, photoH, 0.4); c.restore();
      var g = c.createLinearGradient(0, photoH - 300 * u, 0, photoH); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, t.bg);
      c.fillStyle = g; c.fillRect(0, photoH - 300 * u, W, 302 * u);
      var tg = c.createLinearGradient(0, 0, 0, 220 * u); tg.addColorStop(0, 'rgba(0,0,0,.55)'); tg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = tg; c.fillRect(0, 0, W, 220 * u);
      if (d.business && !d.logoWide) { c.font = '800 ' + 30 * u + 'px ' + FONT; c.fillStyle = '#fff'; c.fillText(d.business.toUpperCase(), pad, 92 * u, W - (d.logo ? 260 : 120) * u); }
      logoBadge(c, d.logo, W - 110 * u, 110 * u, 66 * u);
      var pillTop = H - (d.contact ? 150 : 60) * u, textW = W - pad * 2 - (d.offer && !tall ? 200 * u : 0);
      var top = photoH + 20 * u, room = pillTop - 30 * u - top, hf, df, block, k = 1;
      do { // shrink until the words fit above the contact button
        hf = fit(c, d.headline, textW, tall ? 4 : 3, (tall ? 124 : 104) * u * k, 40 * u * k, 900);
        df = d.details ? fit(c, d.details.replace(/\n/g, ' \u00B7 '), W - pad * 2, 3, (tall ? 42 : 38) * u * k, 22 * u, 500) : null;
        block = 36 * u + hf.size * (1 + (hf.lines.length - 1) * 1.04) + (df ? 26 * u + df.size * (1 + (df.lines.length - 1) * 1.3) : 0);
        k -= 0.06;
      } while (block > room && k > 0.5);
      var y = top + Math.max(0, (room - block) / 2);
      c.fillStyle = t.accent; c.fillRect(pad, y, 90 * u, 10 * u);
      y = drawLines(c, hf, pad, y + 26 * u, 1.04, onColour(t.bg), 900);
      if (df) drawLines(c, df, pad, y + 26 * u, 1.3, onColour(t.bg) === '#FFFFFF' ? 'rgba(255,255,255,.85)' : '#374151', 500);
      offerBadge(c, t, d.offer, W - 170 * u, photoH - 40 * u, 120 * u);
      pill(c, t, d.contact, W / 2, pillTop, W - 120 * u, 38 * u);
    } },
    { name: 'Split', draw: function (c, W, H, d, t) {
      var u = W / 1080, tall = H / W > 1.5, pad = 64 * u;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      c.fillStyle = t.accent; c.globalAlpha = 0.12; c.beginPath(); c.arc(W * 0.92, H * 0.08, 300 * u, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(0, H, 260 * u, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      var px, py, pw, ph;
      if (tall) { pw = W - pad * 2.4; ph = H * 0.42; px = (W - pw) / 2; py = 260 * u; }
      else { pw = W * 0.46; ph = H * 0.62; px = W - pw - pad * 0.7; py = H * 0.16; }
      c.save(); c.translate(18 * u, 18 * u); c.fillStyle = t.accent; rr(c, px, py, pw, ph, pw / 2 > 0 ? Math.min(pw / 2, 280 * u) : 0); c.fill(); c.restore();
      c.save(); rr(c, px, py, pw, ph, Math.min(pw / 2, 280 * u)); c.clip(); cover(c, d.photo, px, py, pw, ph, 0.4); c.restore();
      if (d.business && !d.logoWide) { c.font = '800 ' + 28 * u + 'px ' + FONT; c.fillStyle = t.accent; c.fillText(d.business.toUpperCase(), pad, 110 * u, W - pad * 2 - (d.logo ? 140 * u : 0)); }
      logoBadge(c, d.logo, W - 100 * u, 100 * u, 56 * u);
      var x = pad, tw = tall ? W - pad * 2 : W - pw - pad * 2.2, y = tall ? py + ph + 50 * u : 190 * u;
      var hf = fit(c, d.headline, tw, tall ? 3 : 5, tall ? 110 * u : 96 * u, 44 * u, 900);
      y = drawLines(c, hf, x, y, 1.02, onColour(t.bg), 900);
      if (d.details) { var df = fit(c, d.details.replace(/\n/g, ' \u00B7 '), tw, tall ? 3 : 5, 36 * u, 24 * u, 500); y = drawLines(c, df, x, y + 30 * u, 1.35, onColour(t.bg) === '#FFFFFF' ? 'rgba(255,255,255,.82)' : '#374151', 500); }
      if (d.offer) {
        c.font = '900 ' + 44 * u + 'px ' + FONT; var ow = Math.min(tw, c.measureText(d.offer).width + 60 * u);
        var of = fit(c, d.offer, ow - 40 * u, 1, 44 * u, 24 * u, 900);
        c.fillStyle = t.accent; rr(c, x, y + 40 * u, ow, 90 * u, 14 * u); c.fill();
        drawLines(c, of, x + 24 * u, y + 40 * u + (90 * u - of.size) / 2 - of.size * 0.1, 1, onColour(t.accent), 900);
      }
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, H - 130 * u, W, 130 * u);
      var cf = fit(c, d.contact, W - pad * 2, 1, 40 * u, 24 * u, 800);
      drawLines(c, cf, W / 2, H - 130 * u + (130 * u - cf.size) / 2 - cf.size * 0.12, 1, '#fff', 800, 'center');
    } },
    { name: 'Clean frame', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 60 * u, photos = d.photos.filter(Boolean);
      c.fillStyle = t.light; c.fillRect(0, 0, W, H);
      c.fillStyle = t.bg; c.fillRect(0, 0, W, 16 * u);
      var hx = pad; if (d.logo) { logoBadge(c, d.logo, pad + 44 * u, 100 * u, d.logoWide ? 60 * u : 44 * u, true); hx = pad + 110 * u; }
      if (d.business && !d.logoWide) { c.font = '900 ' + 34 * u + 'px ' + FONT; c.fillStyle = t.bg; c.fillText(d.business.toUpperCase(), hx, 120 * u, W - hx - pad); }
      var top = 180 * u, bottomBar = 140 * u, avail = H - top - bottomBar;
      var tallC = H / W > 1.5, ph = avail * (tallC ? 0.58 : 0.5);
      if (photos.length >= 2 && W / H > 0.6) {
        var n = Math.min(3, photos.length), gap = 18 * u, bigW = (W - pad * 2) * (n === 3 ? 0.6 : 0.5) - gap / 2;
        c.save(); rr(c, pad, top, bigW, ph, 28 * u); c.clip(); cover(c, photos[0], pad, top, bigW, ph); c.restore();
        var sw = W - pad * 2 - bigW - gap, sh = n === 3 ? (ph - gap) / 2 : ph;
        for (var i = 1; i < n; i++) { var sy = top + (i - 1) * (sh + gap); c.save(); rr(c, pad + bigW + gap, sy, sw, sh, 28 * u); c.clip(); cover(c, photos[i], pad + bigW + gap, sy, sw, sh); c.restore(); }
      } else {
        c.save(); c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 40 * u; c.shadowOffsetY = 16 * u; c.fillStyle = '#fff'; rr(c, pad, top, W - pad * 2, ph, 32 * u); c.fill(); c.restore();
        c.save(); rr(c, pad, top, W - pad * 2, ph, 32 * u); c.clip(); cover(c, d.photo, pad, top, W - pad * 2, ph); c.restore();
      }
      if (d.offer && d.offer.length > 9) offerBadge(c, t, d.offer, W - pad - 80 * u, top + 60 * u, 100 * u);
      else if (d.offer) {
        c.save(); c.translate(W - pad - 10 * u, top + 10 * u); c.rotate(Math.PI / 4);
        c.font = '900 ' + 34 * u + 'px ' + FONT; var rw = Math.max(320 * u, c.measureText(d.offer).width + 160 * u);
        c.fillStyle = t.accent; c.fillRect(-rw / 2, -10 * u, rw, 70 * u);
        var of = fit(c, d.offer, rw - 140 * u, 1, 34 * u, 18 * u, 900);
        drawLines(c, of, 0, -10 * u + (70 * u - of.size) / 2 - of.size * 0.12, 1, onColour(t.accent), 900, 'center'); c.restore();
      }
      var region = top + ph + 30 * u, room = H - bottomBar - 30 * u - region, hf, df, block, k = 1;
      do {
        hf = fit(c, d.headline, W - pad * 2, tallC ? 4 : 3, (tallC ? 112 : 96) * u * k, 36 * u * k, 900);
        df = d.details ? fit(c, d.details.replace(/\n/g, ' \u00B7 '), W - pad * 2, 3, (tallC ? 40 : 36) * u * k, 22 * u, 500) : null;
        block = hf.size * (1 + (hf.lines.length - 1) * 1.04) + 32 * u + (df ? 26 * u + df.size * (1 + (df.lines.length - 1) * 1.35) : 0);
        k -= 0.06;
      } while (block > room && k > 0.5);
      var y = region + Math.max(0, (room - block) / 2);
      y = drawLines(c, hf, W / 2, y, 1.04, t.bg, 900, 'center');
      c.fillStyle = t.accent; c.fillRect(W / 2 - 50 * u, y + 24 * u, 100 * u, 8 * u);
      if (df) drawLines(c, df, W / 2, y + 50 * u, 1.35, '#374151', 500, 'center');
      c.fillStyle = t.bg; c.fillRect(0, H - bottomBar, W, bottomBar);
      var cf = fit(c, d.contact, W - pad * 2, 1, 40 * u, 24 * u, 800);
      drawLines(c, cf, W / 2, H - bottomBar + (bottomBar - cf.size) / 2 - cf.size * 0.12, 1, onColour(t.bg), 800, 'center');
    } },
  ];

  // ---------- the editor ----------
  function open(o) {
    o = o || {};
    var g = guess(o);
    var state = { size: 'post', layout: 0, theme: themeFrom(o.colours) || THEMES[0], enhance: true, photoIdx: 0, logoIdx: -1, photos: [], raw: [] };
    var srcs = (o.photos || []).filter(function (p) { return !/\.pdf(\?|$)/i.test((p.name || '') + ' ' + (p.url || '')) && /\.(jpe?g|png|webp)(\?|$)/i.test(p.name || p.url || '') || /^blob:/.test(p.url); });
    // A file called "logo…" is the logo; the rest are photos.
    var logoGuess = srcs.findIndex(function (p) { return /logo/i.test(p.name || ''); });

    var wrap = el('div', { class: 'st-wrap', role: 'dialog', 'aria-label': 'Design studio' });
    var close = el('button', { class: 'admin-btn', type: 'button', text: '✕ Close', onclick: function () { document.body.removeChild(wrap); document.body.style.overflow = ''; } });
    var preview = el('canvas', { class: 'st-canvas' });
    var thumbs = el('div', { class: 'st-thumbs' });
    var f = {
      business: el('input', { value: g.business, maxlength: '60' }),
      headline: el('textarea', { rows: '2', maxlength: '120' }),
      details: el('textarea', { rows: '3', maxlength: '240' }),
      offer: el('input', { value: g.offer, maxlength: '30', placeholder: 'e.g. 20% OFF (leave empty for none)' }),
      contact: el('input', { value: g.contact, maxlength: '70' }),
    };
    f.headline.value = g.headline; f.details.value = g.details;
    var sizeSel = el('select', null, Object.keys(SIZES).map(function (k) { return el('option', { value: k, text: SIZES[k].label }); }));
    var themeRow = el('div', { class: 'st-themes' });
    var photoSel = el('select'), logoSel = el('select');
    var enh = el('input', { type: 'checkbox' }); enh.checked = true;
    var addPhotos = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', multiple: '' });
    var c1 = el('input', { type: 'color', value: state.theme.bg, title: 'Main colour' }), c2 = el('input', { type: 'color', value: state.theme.accent, title: 'Accent colour' });
    var status = el('p', { class: 'admin-hint', text: 'Loading photos…' });

    // ---------- Logo ideas (AI draws 3 original SVG logos; you edit name, tagline and colours) ----------
    var lg = {
      tagline: el('input', { maxlength: '50', placeholder: 'Optional, e.g. Fresh from the oven' }),
      what: el('textarea', { rows: '2', maxlength: '300', placeholder: 'What they sell / do, e.g. cakes and small chops for parties' }),
      style: el('input', { maxlength: '200', placeholder: 'e.g. elegant, playful, bold, traditional' }),
    };
    lg.what.value = (o.words || '').replace(/\s+/g, ' ').slice(0, 300);
    lg.style.value = o.style || '';
    var logoOut = el('div', { class: 'st-logos' }), logoMsg = el('p', { class: 'admin-hint' });
    var logos = [];
    var logoBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '✨ Make 3 logo ideas', onclick: function () { makeLogos(); } });
    var logoBox = el('details', { class: 'st-logobox' }, [
      el('summary', { text: '✨ Logo ideas (AI)' }),
      el('p', { class: 'admin-hint', text: 'Uses the business name above and the colours you picked. You get 3 original logos to choose from; change the name, tagline or colours and they update. Download as SVG (sharp at any size) or PNG.' }),
      lab('Tagline', lg.tagline), lab('What they do', lg.what), lab('Style', lg.style), logoBtn, logoMsg,
    ]);
    // onDark: the reversed version for dark backgrounds (main colour becomes white, accent stays).
    function logoSvg(l, onDark) {
      var svg = l.svg.split(l.primary).join(onDark ? '#ffffff' : state.theme.bg.toLowerCase()).split(l.accent).join(state.theme.accent.toLowerCase());
      var doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
      if (root.nodeName.toLowerCase() !== 'svg') return '';
      var n = doc.getElementById('name'); if (n) n.textContent = f.business.value.trim() || n.textContent;
      var t = doc.getElementById('tagline'); if (t) { if (lg.tagline.value.trim()) t.textContent = lg.tagline.value.trim(); else t.parentNode.removeChild(t); }
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      return new XMLSerializer().serializeToString(root);
    }
    function svgToPng(svg, W, cb) {
      var img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = function () { var cv = document.createElement('canvas'); cv.width = W; cv.height = Math.round(W * 2 / 3); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); cb(cv); };
      img.src = url;
    }
    // Cut away the empty space around a logo so it fills its spot on the flyer.
    function trim(cv) {
      var c = cv.getContext('2d'), d = c.getImageData(0, 0, cv.width, cv.height).data, x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
      for (var y = 0; y < cv.height; y += 2) for (var x = 0; x < cv.width; x += 2) {
        if (d[(y * cv.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 <= x0 || y1 <= y0) return cv;
      var pad = 12, out = document.createElement('canvas'); out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
      out.getContext('2d').drawImage(cv, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
      return out;
    }
    function save(blob, name) { var a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
    function drawLogos() {
      logoOut.innerHTML = '';
      logos.forEach(function (l, i) {
        var svg = logoSvg(l); if (!svg) return;
        var light = el('div', { class: 'st-logo st-logo--light' }), dark = el('div', { class: 'st-logo', style: 'background:' + state.theme.bg });
        light.innerHTML = svg; dark.innerHTML = logoSvg(l, true);
        var slug = (f.business.value || 'logo').replace(/\W+/g, '-').toLowerCase() + '-logo-option-' + (i + 1);
        logoOut.appendChild(el('figure', { class: 'st-logocard' }, [el('div', { class: 'st-logopair' }, [light, dark]),
          el('figcaption', { text: 'Option ' + (i + 1) + ': ' + l.name }),
          el('div', { class: 'admin-actions' }, [
            el('button', { class: 'admin-btn', type: 'button', text: 'SVG', onclick: function () { save(new Blob([logoSvg(l)], { type: 'image/svg+xml' }), slug + '.svg'); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'PNG', onclick: function () { svgToPng(logoSvg(l), 1800, function (cv) { trim(cv).toBlob(function (b) { save(b, slug + '.png'); }, 'image/png'); }); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'White PNG', title: 'For dark backgrounds', onclick: function () { svgToPng(logoSvg(l, true), 1800, function (cv) { trim(cv).toBlob(function (b) { save(b, slug + '-white.png'); }, 'image/png'); }); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'Use on flyer', onclick: function () {
              svgToPng(logoSvg(l), 900, function (cv) { trim(cv).toBlob(function (b) { srcs.push({ url: URL.createObjectURL(b), name: 'logo-option-' + (i + 1) + '.png' }); logoGuess = srcs.length - 1; status.textContent = 'Loading photos…'; loadAll(); }, 'image/png'); });
            } }),
          ])]));
      });
    }
    function makeLogos() {
      if (!o.logoApi) { logoMsg.textContent = 'Logo ideas work from the admin page.'; return; }
      if (f.business.value.trim().length < 2) { logoMsg.textContent = 'Type the business name first (above).'; f.business.focus(); return; }
      logoBtn.disabled = true; logoMsg.textContent = 'Drawing 3 logos… (about 15 seconds)';
      o.logoApi({ business: f.business.value.trim(), tagline: lg.tagline.value, what: lg.what.value, style: lg.style.value, primary: state.theme.bg, accent: state.theme.accent })
        .then(function (j) {
          logos = (j.logos || []).map(function (l) { return { name: l.name, svg: l.svg, primary: j.primary, accent: j.accent }; });
          logoMsg.textContent = logos.length + ' logo idea(s). Shown on white and on your main colour. Not happy? Change the style words and try again.';
          drawLogos();
          logoOut.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(function (e) { logoMsg.textContent = (e && e.message) || 'Could not make logos. Try again.'; })
        .then(function () { logoBtn.disabled = false; });
    }
    lg.tagline.addEventListener('input', drawLogos);
    if (o.openLogos) { logoBox.open = true; setTimeout(function () { logoBox.scrollIntoView({ block: 'start' }); }, 300); }

    function lab(text, input) { return el('label', { class: 'st-field' }, [el('span', { text: text }), input]); }
    var panel = el('div', { class: 'st-panel' }, [
      el('h2', { text: '🎨 Design studio' }),
      el('p', { class: 'admin-hint', text: 'Three ready designs from the customer’s photos, words and colours. Change anything below; the designs update as you type. Download, then put them through the Mockup maker and send as Option 1, 2, 3.' }),
      status,
      lab('Size', sizeSel),
      lab('Business name', f.business), lab('Headline (the big words)', f.headline), lab('Details (smaller text)', f.details),
      lab('Offer badge', f.offer), lab('Contact line', f.contact),
      el('div', { class: 'st-field' }, [el('span', { text: 'Colours' }), themeRow, el('div', { class: 'st-custom' }, [c1, c2, el('small', { text: 'or pick your own: main and accent' })])]),
      lab('Main photo', photoSel), lab('Logo', logoSel),
      el('label', { class: 'st-check' }, [enh, ' Auto-enhance photos (brighter, richer colour, sharper)']),
      lab('Add more photos from this phone', addPhotos),
      el('p', { class: 'admin-hint', text: 'Tip: if a photo has a messy background, choose another photo or ask the customer for one taken against a plain wall in daylight.' }),
      logoBox,
    ]);
    var dl = el('div', { class: 'admin-actions' }, [
      el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Download this design', onclick: function () { download(state.layout); } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Download all 3', onclick: function () { [0, 1, 2].forEach(function (i, n) { setTimeout(function () { download(i); }, n * 400); }); } }),
    ]);
    wrap.appendChild(el('div', { class: 'st-box' }, [el('div', { class: 'st-top' }, [el('b', { text: o.title || 'Design studio' }), close]),
      el('div', { class: 'st-body' }, [el('div', { class: 'st-left' }, [preview, thumbs, dl, logoOut]), panel])]));
    document.body.appendChild(wrap); document.body.style.overflow = 'hidden';

    THEMES.forEach(function (t) { themeRow.appendChild(el('button', { type: 'button', class: 'st-swatch', title: t.name, style: 'background:linear-gradient(135deg,' + t.bg + ' 60%,' + t.accent + ' 60%)', onclick: function () { state.theme = t; c1.value = t.bg; c2.value = t.accent; draw(); } })); });
    if (o.colours && themeFrom(o.colours)) themeRow.insertBefore(el('button', { type: 'button', class: 'st-swatch', title: 'Their colours: ' + o.colours, style: 'background:linear-gradient(135deg,' + state.theme.bg + ' 60%,' + state.theme.accent + ' 60%);outline:2px solid #D9A21B', onclick: function () { state.theme = themeFrom(o.colours); c1.value = state.theme.bg; c2.value = state.theme.accent; draw(); } }), themeRow.firstChild);
    function customTheme() { state.theme = { name: 'Custom', bg: c1.value, accent: c2.value, light: lum(c1.value) < 0.5 ? '#F7F5F0' : '#FFFFFF' }; draw(); }
    c1.addEventListener('input', customTheme); c2.addEventListener('input', customTheme);

    function data() {
      var photos = state.photos.filter(function (p, i) { return i !== state.logoIdx && p; });
      var main = state.photos[state.photoIdx] && state.photoIdx !== state.logoIdx ? state.photos[state.photoIdx] : photos[0] || null;
      return { business: f.business.value.trim(), headline: f.headline.value.trim(), details: f.details.value.trim(), offer: f.offer.value.trim().toUpperCase(), contact: f.contact.value.trim(),
        photo: main, photos: [main].concat(photos.filter(function (p) { return p !== main; })), logo: state.logoIdx >= 0 ? state.raw[state.logoIdx] : null,
        logoWide: state.logoIdx >= 0 && state.raw[state.logoIdx] ? state.raw[state.logoIdx].width / state.raw[state.logoIdx].height > 1.3 : false };
    }
    function render(i, W, H) {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var c = cv.getContext('2d'); c.textBaseline = 'alphabetic';
      LAYOUTS[i].draw(c, W, H, data(), state.theme);
      return cv;
    }
    function draw() {
      if (logos.length) drawLogos();
      var s = SIZES[state.size], scale = 540 / s.w;
      var big = render(state.layout, Math.round(s.w * scale * 2), Math.round(s.h * scale * 2));
      preview.width = big.width; preview.height = big.height; preview.getContext('2d').drawImage(big, 0, 0);
      thumbs.innerHTML = '';
      LAYOUTS.forEach(function (L, i) {
        var t = render(i, Math.round(s.w * 0.24), Math.round(s.h * 0.24));
        var b = el('button', { type: 'button', class: 'st-thumb' + (i === state.layout ? ' is-on' : ''), title: L.name, onclick: function () { state.layout = i; draw(); } }, [t, el('span', { text: 'Option ' + (i + 1) + ': ' + L.name })]);
        thumbs.appendChild(b);
      });
    }
    function download(i) {
      var s = SIZES[state.size], cv = render(i, s.w, s.h);
      cv.toBlob(function (b) {
        var a = el('a', { href: URL.createObjectURL(b), download: (f.business.value || 'design').replace(/\W+/g, '-').toLowerCase() + '-option-' + (i + 1) + '-' + state.size + '.png' });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }, 'image/png');
    }
    function refreshSelects() {
      photoSel.innerHTML = ''; logoSel.innerHTML = '';
      logoSel.appendChild(el('option', { value: '-1', text: 'No logo' }));
      srcs.forEach(function (p, i) {
        photoSel.appendChild(el('option', { value: String(i), text: (i + 1) + '. ' + (p.name || 'photo') }));
        logoSel.appendChild(el('option', { value: String(i), text: (i + 1) + '. ' + (p.name || 'photo') }));
      });
      photoSel.value = String(state.photoIdx); logoSel.value = String(state.logoIdx);
    }
    function process() { state.photos = state.raw.map(function (img) { return img ? (state.enhance ? enhance(img) : img) : null; }); }
    function loadAll() {
      return Promise.all(srcs.map(function (p) { return load(p.url); })).then(function (imgs) {
        state.raw = imgs;
        if (logoGuess >= 0 && imgs[logoGuess]) state.logoIdx = logoGuess;
        state.photoIdx = imgs.findIndex(function (im, i) { return im && i !== state.logoIdx; });
        if (state.photoIdx < 0) state.photoIdx = 0;
        process(); refreshSelects();
        var missing = imgs.filter(function (x) { return !x; }).length;
        status.textContent = !srcs.length ? 'No photos on this order: add some below, or the designs use colour blocks.' : missing ? missing + ' file(s) could not be opened (PDFs or old links). Add them below if needed.' : srcs.length + ' photo(s) loaded' + (state.enhance ? ' and enhanced.' : '.');
        draw();
      });
    }
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', draw); });
    sizeSel.addEventListener('change', function () { state.size = sizeSel.value; draw(); });
    photoSel.addEventListener('change', function () { state.photoIdx = Number(photoSel.value); draw(); });
    logoSel.addEventListener('change', function () { state.logoIdx = Number(logoSel.value); draw(); });
    enh.addEventListener('change', function () { state.enhance = enh.checked; process(); draw(); });
    addPhotos.addEventListener('change', function () {
      Array.prototype.forEach.call(addPhotos.files, function (file) { srcs.push({ url: URL.createObjectURL(file), name: file.name }); });
      addPhotos.value = ''; status.textContent = 'Loading photos…'; loadAll();
    });
    var fontsReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 40px Inter'), document.fonts.load('500 40px Inter'), document.fonts.load('800 40px Inter')]).catch(function () {}) : Promise.resolve();
    fontsReady.then(loadAll);
    return { draw: draw, render: render, state: state };
  }

  window.SirStudio = { open: open, guess: guess, themeFrom: themeFrom };
})();
