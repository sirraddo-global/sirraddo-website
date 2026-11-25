// Design studio (admin): turns a customer's photos, words and colours into 3 finished flyer drafts — no Canva needed.
// Auto-enhances the photos (brighter, richer colour, sharper), lets you edit every text, pick colours, the main photo
// and the logo, and downloads PNGs for WhatsApp post, status or print.
// Use: SirStudio.open({ photos: [{ url, name }], words, business, contact, colours, title })
(function () {
  'use strict';
  var FONT = 'Inter, "Segoe UI", Arial, sans-serif';
  var SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
  var SIZES = {
    post: { w: 1080, h: 1350, label: 'WhatsApp / Instagram post' },
    square: { w: 1080, h: 1080, label: 'Square post' },
    status: { w: 1080, h: 1920, label: 'WhatsApp status' },
    a4: { w: 2480, h: 3508, label: 'A4 print (300 dpi)' },
  };
  var THEMES = [
    { name: 'Navy & gold', bg: '#13254F', accent: '#E8B230', light: '#F4F1E8' },
    { name: 'Chocolate & gold', bg: '#4A2417', accent: '#D9A85B', light: '#FBF5EC' },
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
    if (img.__cut) { // background removed: show the whole product, centred, with a soft glow and shadow
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      var gl = c.createRadialGradient(x + w / 2, y + h * 0.55, 0, x + w / 2, y + h * 0.55, Math.max(w, h) * 0.6);
      gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(x, y, w, h);
      var k = Math.min((w * 0.86) / img.width, (h * 0.8) / img.height), iw = img.width * k, ih = img.height * k;
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = Math.max(w, h) * 0.04; c.shadowOffsetY = Math.max(w, h) * 0.02;
      c.drawImage(img, x + (w - iw) / 2, y + (h - ih) * 0.55, iw, ih);
      c.restore(); return;
    }
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
    cv.__cut = !!img.__cut;
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
    // "10 percent discount of every order…" / "10% discount on…" → "10% OFF every order…"
    var pct = headline.match(/^(?:get\s+)?(\d{1,2})\s*(?:%|per\s*cent|percent)\s*(?:off|discount)?\s*(?:of|on|for)?\s*/i);
    if (pct) { headline = pct[1] + '% OFF ' + headline.slice(pct[0].length); offer = ''; }
    // Dates go under the headline: "from December 1 to 31", "till Sunday", "this weekend only"…
    var MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
    var dateRe = new RegExp('\\s*,?\\s*\\b((?:from|between|starting|valid|on|till|until|ends?|this)\\b.*(?:' + MONTH + '|\\d{1,2}(?:st|nd|rd|th)?|weekend|week|month|sunday|saturday|friday|today|only)\\.?)$', 'i');
    var dm = headline.match(dateRe);
    if (dm && dm.index > 8) { var when = dm[1].replace(/^from\s+/i, ''); rest.unshift(when.charAt(0).toUpperCase() + when.slice(1)); headline = headline.slice(0, dm.index); }
    if (headline.length > 48) {
      // Break at a natural word ("from", "at", "for"…) rather than mid-phrase.
      var brk = headline.slice(0, 48).search(/\s(?:from|at|for|with|in|till|until|on)\s(?!.*\s(?:from|at|for|with|in|till|until|on)\s)/i);
      var cut = brk > 12 ? brk : headline.slice(0, 48).lastIndexOf(' ');
      rest.unshift(headline.slice(cut + 1)); headline = headline.slice(0, cut);
    }
    // A discount mentioned lower down becomes the badge ("15 percent discount" → 15% OFF).
    rest = rest.map(function (l) { return l.replace(/(\d{1,2})\s*(?:%|per\s*cent|percent)\s*(?:off|discount)/i, '$1% off'); });
    if (!pct && !offer) { var pm = rest.join(' ').match(/(\d{1,2})% off/i); if (pm) offer = pm[1] + '% OFF'; }
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

  // ---------- menu / price-list flyers (a business with a list of products) ----------
  var PHONE_RE = /(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}/g;
  // Reads the customer's words as a menu: name, list title, items, a note ("We also offer…"), phones, handles, place.
  function parseMenu(o) {
    var lines = String(o.words || '').replace(/\r/g, '').split('\n').map(function (l) { return l.replace(/^[\s•\-*◆♦▪·]+/, '').trim(); });
    var m = { brand: o.business || '', listTitle: '', items: [], note: '', phones: [], socials: [], place: '' };
    var mode = 'items';
    lines.forEach(function (l, i) {
      if (!l) return;
      if (!m.brand && i === lines.findIndex(function (x) { return x; }) && l.length <= 40 && !PHONE_RE.test(l)) { PHONE_RE.lastIndex = 0; m.brand = l; return; }
      PHONE_RE.lastIndex = 0;
      if (/^(contact|call|reach)\s*(us)?\s*(for|on)?\s*:?$/i.test(l) && /for/i.test(l)) { m.listTitle = l.replace(/:$/, ''); mode = 'items'; return; }
      if (/^(our\s+)?(menu|services|products|price ?list|we (sell|offer|make))\s*:?$/i.test(l)) { m.listTitle = l.replace(/:$/, ''); mode = 'items'; return; }
      if (/^contact\s*(info|information|us|details)?\s*:?$/i.test(l)) { mode = 'contact'; return; }
      var phones = l.match(PHONE_RE) || [];
      phones.forEach(function (p) { var n = p.replace(/[\s-]/g, ''); if (m.phones.indexOf(n) === -1) m.phones.push(n); });
      var handles = l.match(/@[A-Za-z0-9_.]{2,}/g) || [];
      handles.forEach(function (h) { if (m.socials.indexOf(h) === -1) m.socials.push(h); });
      var rest = l.replace(PHONE_RE, '').replace(/@[A-Za-z0-9_.]{2,}/g, '').replace(/^(tel|phone|call|whatsapp|ig|instagram|tiktok|facebook)\s*[:\-]?/i, '').replace(/^[\s,;:/|]+|[\s,;:/|]+$/g, '');
      if (!rest) return;
      if (/\b(ibadan|lagos|abuja|nationwide|located|address|street|road|avenue|state)\b/i.test(rest) && rest.length < 70 && (mode === 'contact' || !/^we /i.test(rest))) { m.place = m.place ? m.place + ' · ' + rest : rest; return; }
      // "We wash: shirts, trousers, duvets…" → list title + items.
      var inline = rest.match(/^([^:]{2,30}):\s*(.+)$/);
      if (inline && inline[2].split(',').length >= 3) {
        if (!m.listTitle) m.listTitle = inline[1].trim();
        inline[2].replace(/\band\b/gi, ',').split(',').forEach(function (x) { x = x.trim().replace(/[.]$/, ''); if (x) m.items.push(x.charAt(0).toUpperCase() + x.slice(1)); });
        return;
      }
      if (rest.length > 40 || /[.!]\s*$/.test(rest) || /^we\s/i.test(rest)) { m.note = m.note ? m.note + ' ' + rest : rest; return; }
      if (mode === 'contact') return;
      (rest.split(/,(?![^(]*\))/).length >= 3 ? rest.split(',') : [rest]).forEach(function (x) { x = x.trim(); if (x) m.items.push(x.charAt(0).toUpperCase() + x.slice(1)); });
    });
    if (!m.listTitle) m.listTitle = m.items.length ? 'Contact us for' : '';
    if (!m.phones.length && o.contact) m.phones.push(String(o.contact).replace(/[^\d+]/g, ''));
    return m;
  }
  // "KASSYtreats&more" → big "KASSY", small "treats & more".
  function brandParts(b) {
    b = String(b || '').trim();
    var m = b.match(/^([A-Z0-9][A-Z0-9'’]{2,})\s*([a-z&].*)$/);
    if (m) return { big: m[1], small: m[2].replace(/\s*&\s*/g, ' & ').trim() };
    // "Bola's Kitchen & more" → small line "& more"; any other name stays whole.
    var amp = b.match(/^(.{3,}?)\s+(&\s*more|and\s+more|treats.*|enterprises?|ventures?|limited|ltd\.?|global.*)$/i);
    if (amp) return { big: amp[1], small: amp[2] };
    return { big: b, small: '' };
  }
  function wrapText(c, text, maxW) {
    var words = String(text || '').split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } });
    if (cur) lines.push(cur);
    return lines;
  }
  // Fits a list into a box: tries 1–3 columns and shrinking sizes. Returns { cols, size, rows }.
  function listFit(c, items, w, h, maxS, minS, weight, maxCols) {
    for (var size = maxS; size >= minS; size -= Math.max(1, maxS / 30)) {
      c.font = weight + ' ' + size + 'px ' + FONT;
      for (var cols = 1; cols <= (maxCols || 3); cols++) {
        var gap = size * 1.2, colW = (w - gap * (cols - 1)) / cols, rows = Math.ceil(items.length / cols);
        if (rows * size * 1.55 > h) continue;
        if (items.every(function (it) { return c.measureText(it).width + size * 1.4 <= colW; })) return { cols: cols, size: size, rows: rows, colW: colW, gap: gap };
      }
    }
    c.font = weight + ' ' + minS + 'px ' + FONT;
    var cs = Math.min(maxCols || 3, 2), r = Math.ceil(items.length / cs);
    return { cols: cs, size: minS, rows: r, colW: (w - minS * 1.2) / cs, gap: minS * 1.2 };
  }
  function drawList(c, items, x, y, fitd, color, bullet) {
    c.font = fitd.weight + ' ' + fitd.size + 'px ' + FONT;
    items.forEach(function (it, i) {
      var col = Math.floor(i / fitd.rows), row = i % fitd.rows;
      var lh = fitd.lh || 1.55, ix = x + col * (fitd.colW + fitd.gap), iy = y + row * fitd.size * lh;
      var bs = fitd.size * 0.32;
      c.save(); c.translate(ix + bs, iy + fitd.size * 0.62); c.rotate(Math.PI / 4); c.fillStyle = bullet; c.fillRect(-bs / 2, -bs / 2, bs, bs); c.restore();
      c.fillStyle = color; c.textBaseline = 'alphabetic';
      var pm = it.match(/^(.*?)\s*[-–:]\s*(\u20A6\s?[\d,]+(?:\s*\/\s*\w+)?|\d[\d,]*\s*naira)\s*$/i);
      var label = pm ? pm[1] : it, price = pm ? pm[2] : '', maxW = fitd.colW - fitd.size * 1.3;
      var pw = price ? c.measureText(price).width + fitd.size * 0.6 : 0;
      while (c.measureText(label).width > maxW - pw && label.length > 3) label = label.slice(0, -2) + '…';
      c.fillText(label, ix + fitd.size * 1.15, iy + fitd.size * 0.98);
      if (price) { c.fillStyle = bullet; c.textAlign = 'right'; c.fillText(price, ix + fitd.colW - fitd.size * 0.2, iy + fitd.size * 0.98); c.textAlign = 'left'; }
    });
    return y + fitd.rows * fitd.size * (fitd.lh || 1.55);
  }
  function photoGrid(c, tiles, x, y, w, h, cols, gap, frame, t, u) {
    if (!tiles.length) return;
    var rows = Math.ceil(tiles.length / cols), tw = (w - gap * (cols - 1)) / cols, th = (h - gap * (rows - 1)) / rows;
    tiles.forEach(function (tile, i) {
      var r = Math.floor(i / cols), col = i % cols, inRow = Math.min(cols, tiles.length - r * cols);
      var off = inRow < cols ? (cols - inRow) * (tw + gap) / 2 : 0; // centre a short last row
      var tx = x + off + col * (tw + gap), ty = y + r * (th + gap), rad = Math.min(tw, th) * 0.09;
      c.save(); c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 18 * u; c.shadowOffsetY = 6 * u; c.fillStyle = frame; rr(c, tx - 5 * u, ty - 5 * u, tw + 10 * u, th + 10 * u, rad + 5 * u); c.fill(); c.restore();
      c.save(); rr(c, tx, ty, tw, th, rad); c.clip(); cover(c, tile.img, tx, ty, tw, th, 0.45); c.restore();
      if (tile.caption) {
        var fs = Math.max(18 * u, Math.min(30 * u, tw * 0.085));
        c.font = '700 ' + fs + 'px ' + FONT;
        var cw = Math.min(tw * 0.86, c.measureText(tile.caption).width + fs * 1.6), chh = fs * 1.75;
        c.fillStyle = 'rgba(255,255,255,.94)'; rr(c, tx + (tw - cw) / 2, ty + th - chh - fs * 0.55, cw, chh, chh / 2); c.fill();
        c.fillStyle = '#2B2118'; c.textAlign = 'center';
        var cap = tile.caption; while (c.measureText(cap).width > cw - fs && cap.length > 3) cap = cap.slice(0, -2) + '…';
        c.fillText(cap, tx + tw / 2, ty + th - fs * 0.55 - chh / 2 + fs * 0.36); c.textAlign = 'left';
      }
    });
  }
  function icon(c, kind, x, y, r, bg, fg) {
    c.fillStyle = bg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = fg; c.fillStyle = fg; c.lineWidth = r * 0.16;
    if (kind === 'phone') { rr(c, x - r * 0.32, y - r * 0.52, r * 0.64, r * 1.04, r * 0.14); c.stroke(); c.fillRect(x - r * 0.1, y + r * 0.3, r * 0.2, r * 0.08); }
    else if (kind === 'place') { c.beginPath(); c.arc(x, y - r * 0.15, r * 0.3, Math.PI, 0); c.lineTo(x, y + r * 0.55); c.closePath(); c.fill(); c.fillStyle = bg; c.beginPath(); c.arc(x, y - r * 0.15, r * 0.12, 0, Math.PI * 2); c.fill(); }
    else { c.font = '800 ' + r * 1.15 + 'px ' + FONT; c.textAlign = 'center'; c.fillText('@', x, y + r * 0.4); c.textAlign = 'left'; }
  }
  // Contact lines: phones, handles, place. Returns the height used (or needed when draw is false).
  function contactBlock(c, d, x, y, w, size, color, iconBg, iconFg, draw) {
    var rows = [];
    // Phones share a line when it fits, otherwise one per line.
    c.font = '700 ' + size + 'px ' + FONT;
    if (d.phones.length && c.measureText(d.phones.join(', ')).width <= w - size * 2.2) rows.push(['phone', d.phones.join(', ')]);
    else d.phones.forEach(function (p) { rows.push(['phone', p]); });
    d.socials.forEach(function (h) { rows.push(['social', h]); });
    if (d.place) rows.push(['place', d.place]);
    var lh = size * 1.75;
    if (draw) rows.forEach(function (r, i) {
      var cy = y + i * lh + lh / 2;
      icon(c, r[0], x + size * 0.75, cy, size * 0.72, iconBg, iconFg);
      // Too long? Shrink the text a little first, then wrap to a second line, so nothing gets cut.
      var fs = size, room = w - size * 2.2, t = r[1];
      c.font = '700 ' + fs + 'px ' + FONT;
      while (c.measureText(t).width > room && fs > size * 0.78) { fs -= 1; c.font = '700 ' + fs + 'px ' + FONT; }
      c.fillStyle = color;
      var parts = c.measureText(t).width > room ? wrapText(c, t, room).slice(0, 2) : [t];
      parts.forEach(function (line, k) { c.fillText(line, x + size * 1.9, cy + size * 0.36 + (k - (parts.length - 1) / 2) * fs * 1.15); });
    });
    return rows.length * lh;
  }
  function brandBlock(c, d, x, y, w, t, color, sub, align, maxBig) {
    var bp = brandParts(d.business), u = w / 500;
    var big = fit(c, bp.big || 'Your business', w, 1, maxBig, maxBig * 0.35, 800);
    c.font = '800 ' + big.size + 'px ' + SERIF; c.fillStyle = color; c.textAlign = align || 'left';
    var bx = align === 'center' ? x + w / 2 : x;
    while (c.measureText(bp.big).width > w && big.size > 20) { big.size -= 2; c.font = '800 ' + big.size + 'px ' + SERIF; }
    c.fillText(bp.big || 'Your business', bx, y + big.size * 0.9);
    var yy = y + big.size * 1.02;
    if (bp.small) {
      var ss = big.size * 0.46;
      c.font = 'italic 400 ' + ss + 'px ' + SERIF; c.fillStyle = sub;
      while (c.measureText(bp.small).width > w && ss > 14) { ss -= 1; c.font = 'italic 400 ' + ss + 'px ' + SERIF; }
      c.fillText(bp.small, bx, yy + ss * 0.95); yy += ss * 1.25;
    }
    c.textAlign = 'left';
    return yy;
  }
  function tilesOf(d, max) { return d.menuPhotos.slice(0, max); }

  var MENU_LAYOUTS = [
    { name: 'Classic menu', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 56 * u, tall = H / W > 1.5;
      c.fillStyle = t.light; c.fillRect(0, 0, W, H);
      c.fillStyle = t.bg; c.globalAlpha = 0.06; for (var gx = 18 * u; gx < W; gx += 34 * u) for (var gy = 18 * u; gy < H; gy += 34 * u) { c.beginPath(); c.arc(gx, gy, 1.6 * u, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1;
      var tiles = tilesOf(d, 6), hasPics = tiles.length > 0;
      var colW = (hasPics ? W * 0.47 : W - pad * 2) - pad, px = W * 0.49, pTop = H * (tall ? 0.17 : 0.2);
      if (hasPics) {
        c.fillStyle = t.bg; c.beginPath(); var R = 90 * u; c.moveTo(px + R, pTop); c.lineTo(W, pTop); c.lineTo(W, H); c.lineTo(px, H); c.lineTo(px, pTop + R); c.arcTo(px, pTop, px + R, pTop, R); c.fill();
        c.strokeStyle = t.accent; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(px - 14 * u, H); c.lineTo(px - 14 * u, pTop + R + 14 * u); c.arcTo(px - 14 * u, pTop - 14 * u, px + R, pTop - 14 * u, R + 14 * u); c.lineTo(W, pTop - 14 * u); c.stroke();
        var cols = tiles.length >= 3 ? 2 : 1, gx0 = px + 40 * u, gw = W - gx0 - 36 * u;
        photoGrid(c, tiles, gx0, pTop + 44 * u, gw, H - pTop - 84 * u, cols, 34 * u, t.accent, t, u);
      }
      // top right: logo and/or badge
      if (d.logo) logoBadge(c, d.logo, W - 150 * u, pTop / 2, Math.min(105 * u, pTop * 0.42));
      if (d.offer) offerBadge(c, t, d.offer, d.logo ? W - 400 * u : W - 160 * u, pTop / 2, Math.min(98 * u, pTop * 0.42));
      // left column
      var y = brandBlock(c, d, pad, pad * 0.9, colW + (hasPics && !d.logo && !d.offer ? 40 * u : 0), t, t.bg, t.accent, 'left', 150 * u);
      c.strokeStyle = t.bg; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(pad, y + 18 * u); c.lineTo(pad + colW * 0.82, y + 18 * u); c.stroke();
      c.fillStyle = t.accent; c.beginPath(); c.arc(pad + colW * 0.82 + 12 * u, y + 18 * u, 6 * u, 0, Math.PI * 2); c.fill();
      y += 46 * u;
      var cSize = (tall ? 38 : 30) * u, contactH = contactBlock(c, d, 0, 0, colW, cSize, '', '', '', false) + (contactBlock(c, d, 0, 0, 0, cSize, '', '', '', false) ? 70 * u : 0);
      var noteFont = (tall ? 34 : 27) * u; c.font = '600 ' + noteFont + 'px ' + FONT;
      var noteLines = d.note ? wrapText(c, d.note, colW - 56 * u) : [], noteH = noteLines.length ? noteLines.length * noteFont * 1.4 + 52 * u : 0;
      var titleH = d.listTitle ? 70 * u : 0;
      var listH = H - pad - y - titleH - noteH - contactH - 50 * u;
      if (d.listTitle) {
        c.fillStyle = t.bg; rr(c, pad, y, colW * 0.88, 60 * u, 8 * u); c.fill();
        c.fillStyle = t.accent; c.fillRect(pad, y + 64 * u, colW * 0.88, 4 * u);
        var lf = fit(c, d.listTitle, colW * 0.8, 1, 32 * u, 18 * u, 700); drawLines(c, lf, pad + 22 * u, y + (60 * u - lf.size) / 2 - lf.size * 0.12, 1, onColour(t.bg), 700);
        y += titleH + 16 * u;
      }
      if (d.items.length) { var fl = listFit(c, d.items, colW, listH, (tall ? 54 : 42) * u, 18 * u, 800, 2); fl.weight = 800; fl.lh = Math.max(1.55, Math.min(2.2, listH / (fl.rows * fl.size))); y = drawList(c, d.items, pad + 6 * u, y, fl, t.bg, t.accent) + 18 * u; }
      if (noteLines.length) {
        c.fillStyle = t.bg; rr(c, pad, y, colW, noteH - 18 * u, 18 * u); c.fill();
        c.strokeStyle = t.accent; c.globalAlpha = 0.6; c.lineWidth = 2 * u; rr(c, pad + 10 * u, y + 10 * u, colW - 20 * u, noteH - 38 * u, 12 * u); c.stroke(); c.globalAlpha = 1;
        c.font = '600 ' + noteFont + 'px ' + FONT; c.fillStyle = onColour(t.bg);
        noteLines.forEach(function (l, i) { c.fillText(l, pad + 28 * u, y + 26 * u + noteFont + i * noteFont * 1.4); });
        y += noteH;
      }
      if (contactH) {
        var g = c.createLinearGradient(pad, 0, pad + colW * 0.6, 0); g.addColorStop(0, t.accent); g.addColorStop(1, lum(t.accent) > 0.5 ? '#F3DDA8' : t.accent);
        c.fillStyle = g; rr(c, pad, y, colW * 0.62, 52 * u, 26 * u); c.fill();
        c.font = '800 ' + 26 * u + 'px ' + FONT; c.fillStyle = onColour(t.accent); c.textAlign = 'center'; c.fillText('Contact info', pad + colW * 0.31, y + 35 * u); c.textAlign = 'left';
        contactBlock(c, d, pad, y + 62 * u, colW + (hasPics ? 0 : 0), cSize, t.bg, t.bg, t.light, true);
      }
    } },
    { name: 'Dark menu', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 60 * u, tall = H / W > 1.5;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      var g = c.createRadialGradient(W * 0.5, 0, 0, W * 0.5, 0, W); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      if (d.logo) logoBadge(c, d.logo, W / 2, pad + 60 * u, 60 * u);
      var y = brandBlock(c, d, pad, pad + (d.logo ? 140 * u : 10 * u), W - pad * 2, t, onColour(t.bg), t.accent, 'center', 140 * u);
      if (d.offer) { c.font = '800 ' + 24 * u + 'px ' + FONT; var ow = c.measureText(d.offer).width + 60 * u; c.fillStyle = t.accent; rr(c, (W - ow) / 2, y + 12 * u, ow, 46 * u, 23 * u); c.fill(); c.fillStyle = onColour(t.accent); c.textAlign = 'center'; c.fillText(d.offer, W / 2, y + 43 * u); c.textAlign = 'left'; y += 64 * u; }
      y += 26 * u;
      var tiles = tilesOf(d, tall ? 6 : 4);
      if (tiles.length) {
        var cols = tall ? Math.min(3, tiles.length) : Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols);
        var gh = (tall ? H * 0.40 : H * 0.25) * (rows > 1 && !tall ? 1.6 : 1);
        photoGrid(c, tiles, pad, y, W - pad * 2, gh, cols, 22 * u, t.accent, t, u);
        y += gh + 40 * u;
      }
      var barH = (d.phones.length || d.socials.length || d.place ? 64 * u + (d.socials.length || d.place ? 54 * u : 0) : 0);
      c.font = '500 ' + 26 * u + 'px ' + FONT;
      var noteLines = d.note ? wrapText(c, d.note, W - pad * 2 - 40 * u) : [], noteH = noteLines.length ? noteLines.length * 26 * u * 1.4 + 30 * u : 0;
      if (d.listTitle) { c.font = '800 ' + 26 * u + 'px ' + FONT; c.fillStyle = t.accent; c.textAlign = 'center'; c.fillText(d.listTitle.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, y + 26 * u); c.textAlign = 'left'; y += 50 * u; }
      if (d.items.length) { var avl = H - y - barH - noteH - 50 * u, fl = listFit(c, d.items, W - pad * 2, avl, (tall ? 52 : 40) * u, 18 * u, 700, tall ? 2 : 3); fl.weight = 700; fl.lh = Math.max(1.55, Math.min(2.1, avl / (fl.rows * fl.size))); y = drawList(c, d.items, pad + 10 * u, y, fl, onColour(t.bg), t.accent) + 10 * u; }
      if (noteLines.length) { c.font = 'italic 500 ' + 26 * u + 'px ' + FONT; c.fillStyle = onColour(t.bg); c.globalAlpha = 0.85; c.textAlign = 'center'; noteLines.forEach(function (l, i) { c.fillText(l, W / 2, y + 26 * u + i * 26 * u * 1.4); }); c.globalAlpha = 1; c.textAlign = 'left'; }
      if (barH) {
        c.fillStyle = t.accent; c.fillRect(0, H - barH, W, barH);
        c.fillStyle = onColour(t.accent); c.textAlign = 'center';
        c.font = '800 ' + 32 * u + 'px ' + FONT; c.fillText(d.phones.length ? 'Call / WhatsApp: ' + d.phones.join(' · ') : '', W / 2, H - barH + 44 * u);
        var sub = d.socials.concat(d.place ? [d.place] : []).join('   ·   ');
        if (sub) { c.font = '700 ' + 30 * u + 'px ' + FONT; c.fillText(sub, W / 2, H - barH + 96 * u, W - pad * 2); }
        c.textAlign = 'left';
      }
    } },
    { name: 'Photo grid', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 54 * u, tall = H / W > 1.5;
      c.fillStyle = t.light; c.fillRect(0, 0, W, H);
      var headH = (tall ? 250 : 210) * u;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, headH);
      c.fillStyle = t.accent; c.fillRect(0, headH, W, 8 * u);
      brandBlock(c, d, pad, (headH - 150 * u) / 2, W - pad * 2 - (d.logo ? 170 * u : 0), t, onColour(t.bg), t.accent, 'left', 110 * u);
      if (d.logo) logoBadge(c, d.logo, W - pad - 70 * u, headH / 2, 70 * u);
      var y = headH + 40 * u, tiles = tilesOf(d, 6);
      if (tiles.length) {
        var cols = tiles.length >= 5 ? 3 : tiles.length >= 2 ? 2 : 1, rows = Math.ceil(tiles.length / cols);
        var gh = Math.min(H * (tall ? 0.46 : 0.4), rows * (W - pad * 2) / cols * (tall ? 1.15 : 0.8));
        photoGrid(c, tiles, pad, y, W - pad * 2, gh, cols, 22 * u, '#FFFFFF', t, u);
        y += gh + 36 * u;
      }
      var barH = d.phones.length || d.socials.length || d.place ? 110 * u : 0;
      if (d.offer) offerBadge(c, t, d.offer, W - pad - 70 * u, headH + 10 * u, 70 * u);
      if (d.listTitle) { c.font = '800 ' + 30 * u + 'px ' + SERIF; c.fillStyle = t.bg; c.textAlign = 'center'; c.fillText(d.listTitle, W / 2, y + 28 * u); c.textAlign = 'left'; y += 48 * u; }
      // items as chips
      var avail = H - y - barH - 30 * u - (d.note ? 80 * u : 0), fs = (tall ? 42 : 30) * u, chips;
      for (; fs >= 16 * u; fs -= 1 * u) {
        c.font = '700 ' + fs + 'px ' + FONT; chips = []; var line = [], lw = 0, maxW = W - pad * 2;
        d.items.forEach(function (it) { var w = c.measureText(it).width + fs * 1.6; if (lw + w > maxW && line.length) { chips.push(line); line = []; lw = 0; } line.push([it, w]); lw += w + fs * 0.5; });
        if (line.length) chips.push(line);
        if (chips.length * fs * 2.3 <= avail) break;
      }
      var used = (chips || []).length * fs * 2.3 + (d.note ? 80 * u : 0);
      y += Math.max(0, (H - barH - 30 * u - y - used) / 2);
      (chips || []).forEach(function (row) {
        var total = row.reduce(function (a, r) { return a + r[1]; }, 0) + fs * 0.5 * (row.length - 1), x = (W - total) / 2;
        row.forEach(function (r) { c.fillStyle = t.bg; rr(c, x, y, r[1], fs * 1.8, fs * 0.9); c.fill(); c.fillStyle = onColour(t.bg); c.fillText(r[0], x + fs * 0.8, y + fs * 1.22); x += r[1] + fs * 0.5; });
        y += fs * 2.3;
      });
      if (d.note) { var nf = (tall ? 30 : 24) * u; c.font = 'italic 500 ' + nf + 'px ' + FONT; c.fillStyle = t.bg; c.textAlign = 'center'; wrapText(c, d.note, W - pad * 2).slice(0, 3).forEach(function (l, i) { c.fillText(l, W / 2, y + nf + i * nf * 1.35); }); c.textAlign = 'left'; }
      if (barH) {
        c.fillStyle = t.bg; c.fillRect(0, H - barH, W, barH); c.fillStyle = t.accent; c.fillRect(0, H - barH, W, 6 * u);
        c.textAlign = 'center'; c.fillStyle = onColour(t.bg);
        c.font = '800 ' + 32 * u + 'px ' + FONT; c.fillText(d.phones.join('  ·  '), W / 2, H - barH + 50 * u, W - pad * 2);
        var sub = d.socials.concat(d.place ? [d.place] : []).join('   ·   ');
        if (sub) { c.font = '700 ' + 28 * u + 'px ' + FONT; c.fillStyle = t.accent; c.fillText(sub, W / 2, H - barH + 94 * u, W - pad * 2); }
        c.textAlign = 'left';
      }
    } },
  ];

  function open(o) {
    o = o || {};
    var g = guess(o), mp = parseMenu(o);
    var menuMode = mp.items.length >= 4;
    var state = { size: 'post', layout: 0, mode: menuMode ? 'menu' : 'promo', captions: [], theme: themeFrom(o.colours) || (menuMode ? THEMES[1] : THEMES[0]), enhance: true, photoIdx: 0, logoIdx: -1, photos: [], raw: [] };
    var layouts = function () { return state.mode === 'menu' ? MENU_LAYOUTS : LAYOUTS; };
    var srcs = (o.photos || []).filter(function (p) { return !/\.pdf(\?|$)/i.test((p.name || '') + ' ' + (p.url || '')) && /\.(jpe?g|png|webp)(\?|$)/i.test(p.name || p.url || '') || /^blob:/.test(p.url); });
    // A file called "logo…" is the logo; the rest are photos.
    var logoGuess = srcs.findIndex(function (p) { return /logo/i.test(p.name || ''); });

    var wrap = el('div', { class: 'st-wrap', role: 'dialog', 'aria-label': 'Design studio' });
    var close = el('button', { class: 'admin-btn', type: 'button', text: '✕ Close', onclick: function () { document.body.removeChild(wrap); document.body.style.overflow = ''; } });
    var preview = el('canvas', { class: 'st-canvas' });
    var thumbs = el('div', { class: 'st-thumbs' });
    var f = {
      business: el('input', { value: g.business || mp.brand, maxlength: '60' }),
      headline: el('textarea', { rows: '2', maxlength: '120' }),
      details: el('textarea', { rows: '3', maxlength: '240' }),
      offer: el('input', { value: menuMode ? '' : g.offer, maxlength: '30', placeholder: 'e.g. 20% OFF or Nationwide delivery (empty for none)' }),
      contact: el('input', { value: g.contact, maxlength: '70' }),
    };
    f.headline.value = g.headline; f.details.value = g.details;
    var mf = {
      listTitle: el('input', { value: mp.listTitle, maxlength: '40', placeholder: 'e.g. Contact us for / Our menu' }),
      items: el('textarea', { rows: '7', maxlength: '900' }),
      note: el('textarea', { rows: '3', maxlength: '300', placeholder: 'e.g. We also offer spaghetti, rice dishes and soups' }),
      phones: el('input', { value: mp.phones.join(', '), maxlength: '80' }),
      socials: el('input', { value: mp.socials.join(', '), maxlength: '120', placeholder: '@instagram, @tiktok' }),
      place: el('input', { value: mp.place, maxlength: '70', placeholder: 'e.g. Ibadan · Available nationwide' }),
    };
    mf.items.value = mp.items.join('\n'); mf.note.value = mp.note;
    var captionBox = el('div', { class: 'st-captions' });
    var capMsg = el('small', { class: 'st-bgmsg' });
    var capBtn = el('button', { class: 'admin-btn', type: 'button', text: '\u2728 Name the photos with AI', onclick: function () { nameStuff(true); } });
    var sizeSel = el('select', null, Object.keys(SIZES).map(function (k) { return el('option', { value: k, text: SIZES[k].label }); }));
    var themeRow = el('div', { class: 'st-themes' });
    var photoSel = el('select'), logoSel = el('select');
    // Picture tiles instead of a plain list of file names, so you can see which photo you're choosing.
    var photoTiles = el('div', { class: 'st-tiles' }), logoTiles = el('div', { class: 'st-tiles' });
    function fillTiles(box, sel, withNone) {
      box.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function (op) {
        var i = Number(op.value), src = i >= 0 && srcs[i] ? srcs[i].url : '';
        var kids = src && state.raw && state.raw[i] ? [el('img', { src: src, alt: '', loading: 'lazy' })] : [el('span', { class: 'st-tile-none', text: i < 0 ? 'None' : '?' })];
        kids.push(el('small', { text: i < 0 ? 'No logo' : String(i + 1) }));
        var b = el('button', { type: 'button', class: 'st-tile' + (sel.value === op.value ? ' is-on' : ''), title: op.textContent, onclick: function () {
          sel.value = op.value; sel.dispatchEvent(new Event('change'));
          Array.prototype.forEach.call(box.children, function (x) { x.classList.toggle('is-on', x === b); });
        } }, kids);
        box.appendChild(b);
      });
    }
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

    // The customer's style sample(s): shown for reference only, never put on the design.
    var sampleBox = (o.samples || []).length ? el('div', { class: 'st-samples' }, [
      el('b', { text: '✨ Style they like (match the look, don\u2019t copy it)' }),
      el('div', { class: 'st-samplerow' }, o.samples.map(function (smp) {
        return el('a', { href: smp.url, target: '_blank', rel: 'noopener' }, [el('img', { src: smp.url, alt: 'Customer sample: ' + smp.name, loading: 'lazy' })]);
      })),
      el('small', { text: 'Its colours are the dashed swatch (used automatically if they gave no colours). Pick the layout closest to it below. Use only the customer\u2019s own words, logo and photos.' }),
    ]) : null;
    // Remove the main photo's background (runs on our VPS). The original is kept so it can be put back.
    var bgMsg = el('small', { class: 'st-bgmsg' });
    var bgBtn = el('button', { class: 'admin-btn', type: 'button', text: '\u2702\uFE0F Remove background', onclick: function () { cutMain(); } });
    var bgUndo = el('button', { class: 'admin-btn', type: 'button', text: 'Put background back', hidden: '', onclick: function () {
      var i = state.photoIdx; if (state.orig && state.orig[i]) { state.raw[i] = state.orig[i]; state.orig[i] = null; process(); draw(); } bgUndo.hidden = true; bgMsg.textContent = '';
    } });
    var bgRow = el('div', { class: 'st-bgrow' }, [bgBtn, bgUndo, bgMsg]);
    function cutMain() {
      var i = state.photoIdx, img = state.raw[i];
      if (!img) { bgMsg.textContent = 'Choose a photo first.'; return; }
      if (!o.bgApi) { bgMsg.textContent = 'Works from the admin page.'; return; }
      var k = Math.min(1, 2000 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      bgBtn.disabled = true; bgMsg.textContent = 'Removing the background… (about 5–10 seconds)';
      o.bgApi(cv.toDataURL('image/jpeg', 0.92)).then(function (j) {
        return new Promise(function (ok, bad) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = bad; im.src = j.image; });
      }).then(function (im) {
        // Trim the empty space where the background was, so the product fills its spot.
        var full = document.createElement('canvas'); full.width = im.width; full.height = im.height; full.getContext('2d').drawImage(im, 0, 0);
        var cut = trim(full);
        cut.__cut = true;
        state.orig = state.orig || []; state.orig[i] = state.orig[i] || state.raw[i];
        state.raw[i] = cut; process(); draw();
        bgUndo.hidden = false; bgMsg.textContent = 'Done. The product now sits on your colours.';
      }).catch(function (e) { bgMsg.textContent = (e && e.message) || 'Could not remove the background.'; })
        .then(function () { bgBtn.disabled = false; });
    }
    var modeBtns = {};
    var modeRow = el('div', { class: 'st-mode' }, [['menu', '\uD83D\uDCCB Menu / price list'], ['promo', '\uD83D\uDCE3 Promo / offer']].map(function (m) {
      modeBtns[m[0]] = el('button', { type: 'button', class: 'admin-btn', text: m[1], onclick: function () { setMode(m[0]); } });
      return modeBtns[m[0]];
    }));
    // AI labels for each photo (e.g. "Cakes", "Zobo"), picked from the item list where one fits. Runs once by itself.
    var named = false;
    function nameStuff(force) {
      if ((named && !force) || !o.captionApi) return;
      var idx = []; var imgs = [];
      state.raw.forEach(function (img, i) {
        if (!img || i === state.logoIdx) return;
        var k = Math.min(1, 512 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        idx.push(i); imgs.push(cv.toDataURL('image/jpeg', 0.8));
      });
      if (!imgs.length) return;
      named = true; capBtn.disabled = true; capMsg.textContent = 'Naming the photos…';
      o.captionApi(imgs.slice(0, 6), data().items).then(function (j) {
        (j.labels || []).forEach(function (l, n) { if (idx[n] != null && l && (force || !state.captions[idx[n]])) state.captions[idx[n]] = String(l).slice(0, 24); });
        capMsg.textContent = 'Labels added. Change any of them below.'; refreshSelects(); draw();
      }).catch(function (e) { capMsg.textContent = (e && e.message) || 'Could not name the photos.'; })
        .then(function () { capBtn.disabled = false; });
    }
    function setMode(m) {
      state.mode = m; state.layout = 0;
      Object.keys(modeBtns).forEach(function (k) { modeBtns[k].classList.toggle('admin-btn--primary', k === m); });
      promoBox.hidden = m !== 'promo'; menuBox.hidden = m !== 'menu';
      if (m === 'menu') nameStuff(false);
      draw();
    }
    function lab(text, input) { return el('label', { class: 'st-field' }, [el('span', { text: text }), input]); }
    var promoBox = el('div', { class: 'st-group' }, [lab('Headline (the big words)', f.headline), lab('Details (smaller text)', f.details), lab('Contact line', f.contact)]);
    var menuBox = el('div', { class: 'st-group' }, [
      lab('List title', mf.listTitle), lab('Items (one per line)', mf.items), lab('Extra note (box)', mf.note),
      lab('Phone numbers', mf.phones), lab('Social handles', mf.socials), lab('Location line', mf.place),
      el('div', { class: 'st-field' }, [el('span', { text: 'Photo labels' }), captionBox, el('div', { class: 'st-bgrow' }, [capBtn, capMsg])]),
    ]);
    var panel = el('div', { class: 'st-panel' }, [
      el('h2', { text: '🎨 Design studio' }),
      el('p', { class: 'admin-hint', text: 'Three ready designs from the customer’s photos, words and colours. Change anything below; the designs update as you type. Download, then put them through the Mockup maker and send as Option 1, 2, 3.' }),
      status,
      lab('Size', sizeSel),
      modeRow,
      lab('Business name', f.business),
      promoBox, menuBox,
      lab('Badge (optional)', f.offer),
      el('div', { class: 'st-field' }, [el('span', { text: 'Colours' }), themeRow, el('div', { class: 'st-custom' }, [c1, c2, el('small', { text: 'or pick your own: main and accent' })])]),
      el('div', { class: 'st-field' }, [el('span', { text: 'Main photo (tap one)' }), photoTiles]), bgRow, el('div', { class: 'st-field' }, [el('span', { text: 'Logo (tap one)' }), logoTiles]),
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
      el('div', { class: 'st-body' }, [el('div', { class: 'st-left' }, [sampleBox, preview, thumbs, dl, logoOut]), panel])]));
    document.body.appendChild(wrap); document.body.style.overflow = 'hidden';

    THEMES.forEach(function (t) { themeRow.appendChild(el('button', { type: 'button', class: 'st-swatch', title: t.name, style: 'background:linear-gradient(135deg,' + t.bg + ' 60%,' + t.accent + ' 60%)', onclick: function () { state.theme = t; c1.value = t.bg; c2.value = t.accent; draw(); } })); });
    if (o.colours && themeFrom(o.colours)) themeRow.insertBefore(el('button', { type: 'button', class: 'st-swatch', title: 'Their colours: ' + o.colours, style: 'background:linear-gradient(135deg,' + state.theme.bg + ' 60%,' + state.theme.accent + ' 60%);outline:2px solid #D9A21B', onclick: function () { state.theme = themeFrom(o.colours); c1.value = state.theme.bg; c2.value = state.theme.accent; draw(); } }), themeRow.firstChild);
    // Colours from their style sample: the most common dark colour (main) and bright colour (accent).
    function sampleTheme(img) {
      var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      var c = cv.getContext('2d'); c.drawImage(img, 0, 0, 64, 64);
      var d; try { d = c.getImageData(0, 0, 64, 64).data; } catch (e) { return null; }
      var dark = {}, bright = {};
      for (var i = 0; i < d.length; i += 4) {
        var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
        var key = '#' + [r, g, b].map(function (v) { return ('0' + (Math.min(255, Math.round(v / 24) * 24)).toString(16)).slice(-2); }).join('');
        var L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (L < 0.45 && (sat > 0.25 || L < 0.15)) dark[key] = (dark[key] || 0) + 1;
        else if (L >= 0.45 && sat > 0.45) bright[key] = (bright[key] || 0) + 1;
      }
      var top = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; })[0]; };
      var bg = top(dark), accent = top(bright);
      if (!bg || !accent) return null;
      return { name: 'From their sample', bg: bg, accent: accent, light: '#F7F5F0' };
    }
    if ((o.samples || []).length) load(o.samples[0].url).then(function (img) {
      var t = img && sampleTheme(img); if (!t) return;
      themeRow.insertBefore(el('button', { type: 'button', class: 'st-swatch', title: 'From their sample', style: 'background:linear-gradient(135deg,' + t.bg + ' 60%,' + t.accent + ' 60%);outline:2px dashed #D9A21B', onclick: function () { state.theme = t; c1.value = t.bg; c2.value = t.accent; draw(); } }), themeRow.firstChild);
      if (!themeFrom(o.colours)) { state.theme = t; c1.value = t.bg; c2.value = t.accent; draw(); }
    });
    function customTheme() { state.theme = { name: 'Custom', bg: c1.value, accent: c2.value, light: lum(c1.value) < 0.5 ? '#F7F5F0' : '#FFFFFF' }; draw(); }
    c1.addEventListener('input', customTheme); c2.addEventListener('input', customTheme);

    // The business name sometimes sits in the customer's list ("KASSYtreats&more"); it's already the title, so leave it out.
    function squash(x) { return String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
    // Loose match: "KASSYtreats&more" vs "Kassy treat & more" — ignores spaces, symbols, "and"/"more" and plural s.
    function brandKey(x) { return squash(String(x || '').replace(/&|\band\b|\bmore\b|\b(ltd|limited|enterprises?|ventures?)\b/gi, ' ')).replace(/s/g, ''); }
    function notBrand(item) {
      var b = brandKey(f.business.value), it = brandKey(item);
      if (b.length < 4 || it.length < 4) return true;
      var n = 0; while (n < b.length && n < it.length && b[n] === it[n]) n++;
      return !(n >= 5 && n >= Math.max(b.length, it.length) * 0.8);
    }
    function data() {
      var photos = state.photos.filter(function (p, i) { return i !== state.logoIdx && p; });
      var main = state.photos[state.photoIdx] && state.photoIdx !== state.logoIdx ? state.photos[state.photoIdx] : photos[0] || null;
      return { business: f.business.value.trim(), headline: f.headline.value.trim(), details: f.details.value.trim(), offer: f.offer.value.trim().toUpperCase(), contact: f.contact.value.trim(),
        photo: main, photos: [main].concat(photos.filter(function (p) { return p !== main; })), logo: state.logoIdx >= 0 ? state.raw[state.logoIdx] : null,
        logoWide: state.logoIdx >= 0 && state.raw[state.logoIdx] ? state.raw[state.logoIdx].width / state.raw[state.logoIdx].height > 1.3 : false,
        listTitle: mf.listTitle.value.trim(), items: mf.items.value.split('\n').map(function (x) { return x.replace(/^[\s•\-*◆♦]+/, '').trim(); }).filter(Boolean).filter(notBrand),
        note: mf.note.value.trim(), phones: mf.phones.value.split(/[,;\/]+/).map(function (x) { return x.trim(); }).filter(Boolean),
        socials: mf.socials.value.split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return x.charAt(0) === '@' ? x : '@' + x; }),
        place: mf.place.value.trim(),
        menuPhotos: state.photos.map(function (img, i) { return { img: img, caption: state.captions[i] || '', i: i }; }).filter(function (x) { return x.img && x.i !== state.logoIdx; }) };
    }
    function render(i, W, H, photoIdx) {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var c = cv.getContext('2d'); c.textBaseline = 'alphabetic';
      var keep = state.photoIdx; if (photoIdx != null) state.photoIdx = photoIdx;
      try { layouts()[i].draw(c, W, H, data(), state.theme); } finally { state.photoIdx = keep; }
      return cv;
    }
    // ---------- Set of N (e.g. 5 social media posts): same look, a different photo on each ----------
    var setN = Math.max(0, Math.min(10, Number(o.set) || 0));
    var setRow = el('div', { class: 'st-thumbs' }), setBox = el('div', { class: 'st-set', hidden: setN ? null : '' }, [
      el('b', { text: 'The set of ' + setN + ' (same look as the chosen option, a different photo on each)' }), setRow,
      el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Download the set of ' + setN, onclick: function () { setOrder().forEach(function (pi, n) { setTimeout(function () { download(state.layout, pi, n + 1); }, n * 450); }); } }),
      el('small', { class: 'admin-hint', text: 'Change the words between downloads if each post needs its own message.' }),
    ]);
    function setOrder() {
      var pool = state.photos.map(function (p, i) { return p && i !== state.logoIdx ? i : -1; }).filter(function (i) { return i >= 0; });
      if (!pool.length) pool = [null];
      var start = Math.max(0, pool.indexOf(state.photoIdx)), out = [];
      for (var n = 0; n < setN; n++) out.push(pool[(start + n) % pool.length]);
      return out;
    }
    function drawSet() {
      if (!setN) return;
      var s = SIZES[state.size]; setRow.innerHTML = '';
      setOrder().forEach(function (pi, n) { setRow.appendChild(el('div', { class: 'st-thumb' }, [render(state.layout, Math.round(s.w * 0.16), Math.round(s.h * 0.16), pi), el('span', { text: 'Post ' + (n + 1) })])); });
    }

    // ---------- Animated WhatsApp status (video made right here; no Canva needed) ----------
    var vidMsg = el('small', { class: 'st-bgmsg' }), vidOut = el('div', { class: 'st-vid' });
    var vidBtn = el('button', { class: 'admin-btn' + (o.animated ? ' admin-btn--primary' : ''), type: 'button', text: '\uD83C\uDFAC Make animated status video', onclick: makeVideo });
    var vidBox = el('div', { class: 'st-set' }, [
      el('b', { text: o.animated ? 'This order includes an animated status video' : 'Animated status video (extra)' }),
      el('small', { class: 'admin-hint', text: 'Uses the chosen option in WhatsApp status size: parts slide in, slow zoom, shine. 12 seconds. Keep this screen open while it records.' }),
      vidBtn, vidMsg, vidOut,
    ]);
    dl.parentNode.insertBefore(vidBox, dl.nextSibling); dl.parentNode.insertBefore(setBox, dl.nextSibling);
    function pickMime() {
      var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (var i = 0; i < list.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(list[i])) return list[i];
      return '';
    }
    function makeVideo() {
      var mime = pickMime();
      if (!mime || !HTMLCanvasElement.prototype.captureStream) { vidMsg.textContent = 'This browser can\'t record video. Open admin in Chrome and try again.'; return; }
      var W = 720, H = 1280, DUR = 12, FPS = 30;
      var art = render(state.layout, W, H);
      var cv = el('canvas', { style: 'position:fixed;left:-9999px;top:0' }); cv.width = W; cv.height = H; document.body.appendChild(cv);
      var c = cv.getContext('2d'), bg = state.theme.bg;
      var rec = new MediaRecorder(cv.captureStream(FPS), { mimeType: mime, videoBitsPerSecond: 6000000 }), chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        cv.remove(); vidBtn.disabled = false;
        var mp4 = /mp4/.test(mime), blob = new Blob(chunks, { type: mp4 ? 'video/mp4' : 'video/webm' }), url = URL.createObjectURL(blob);
        var name = (f.business.value || 'design').replace(/\W+/g, '-').toLowerCase() + '-status-video.' + (mp4 ? 'mp4' : 'webm');
        vidOut.innerHTML = '';
        vidOut.appendChild(el('video', { src: url, controls: '', playsinline: '', loop: '', muted: '', autoplay: '' }));
        vidOut.appendChild(el('a', { class: 'admin-btn admin-btn--primary', href: url, download: name, text: 'Download video (' + (mp4 ? 'MP4' : 'WebM') + ', ' + Math.round(blob.size / 1024) + ' KB)' }));
        vidMsg.textContent = mp4 ? 'Done. Send the MP4 on WhatsApp; it plays as a status.' : 'Done, but this browser saved WebM. WhatsApp needs MP4: use Chrome on Android (it records MP4), or convert the file before sending.';
      };
      var bands = 4, bh = H / bands;
      function ease(x) { x = Math.max(0, Math.min(1, x)); var c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
      function frame(t) {
        c.globalAlpha = 1; c.fillStyle = bg; c.fillRect(0, 0, W, H);
        if (t < 2.2) { // parts slide in, one after another, from alternating sides
          for (var b = 0; b < bands; b++) {
            var p = ease((t - b * 0.28) / 0.8); if (p <= 0) continue;
            var dx = (b % 2 ? 1 : -1) * W * (1 - p);
            c.globalAlpha = Math.min(1, p * 1.3); c.drawImage(art, 0, b * bh, W, bh, dx, b * bh, W, bh);
          }
          c.globalAlpha = 1;
        } else { // slow zoom
          var z = 1 + 0.045 * Math.min(1, (t - 2.2) / (DUR - 2.2));
          c.drawImage(art, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z);
        }
        [3.2, 7.6].forEach(function (s0) { // shine sweeps across
          var k = (t - s0) / 1.1; if (k < 0 || k > 1) return;
          var x = -W * 0.6 + k * W * 2.2, g = c.createLinearGradient(x, 0, x + W * 0.45, H * 0.35);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        });
        if (t > DUR - 0.6) { c.fillStyle = 'rgba(0,0,0,' + ((t - (DUR - 0.6)) / 0.6 * 0.15) + ')'; c.fillRect(0, 0, W, H); }
      }
      vidBtn.disabled = true; vidOut.innerHTML = ''; vidMsg.textContent = 'Recording… 0 / ' + DUR + ' s';
      frame(0); rec.start(500);
      var t0 = performance.now();
      (function tick() {
        var t = (performance.now() - t0) / 1000;
        if (t >= DUR) { frame(DUR); setTimeout(function () { rec.stop(); }, 120); return; }
        frame(t); vidMsg.textContent = 'Recording… ' + Math.floor(t) + ' / ' + DUR + ' s';
        requestAnimationFrame(tick);
      })();
    }
    function draw() {
      if (logos.length) drawLogos();
      var s = SIZES[state.size], scale = 540 / s.w;
      var big = render(state.layout, Math.round(s.w * scale * 2), Math.round(s.h * scale * 2));
      preview.width = big.width; preview.height = big.height; preview.getContext('2d').drawImage(big, 0, 0);
      drawSet();
      thumbs.innerHTML = '';
      layouts().forEach(function (L, i) {
        var t = render(i, Math.round(s.w * 0.24), Math.round(s.h * 0.24));
        var b = el('button', { type: 'button', class: 'st-thumb' + (i === state.layout ? ' is-on' : ''), title: L.name, onclick: function () { state.layout = i; draw(); } }, [t, el('span', { text: 'Option ' + (i + 1) + ': ' + L.name })]);
        thumbs.appendChild(b);
      });
    }
    function download(i, photoIdx, postNo) {
      var s = SIZES[state.size], cv = render(i, s.w, s.h, photoIdx);
      cv.toBlob(function (b) {
        var a = el('a', { href: URL.createObjectURL(b), download: (f.business.value || 'design').replace(/\W+/g, '-').toLowerCase() + (postNo ? '-post-' + postNo : '-option-' + (i + 1)) + '-' + state.size + '.png' });
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
      fillTiles(photoTiles, photoSel); fillTiles(logoTiles, logoSel);
      captionBox.innerHTML = '';
      srcs.forEach(function (p, i) {
        if (i === state.logoIdx) return;
        var inp = el('input', { value: state.captions[i] || '', maxlength: '24', placeholder: 'Label for photo ' + (i + 1) + ' (e.g. Cakes)' });
        inp.addEventListener('input', function () { state.captions[i] = inp.value.trim(); draw(); });
        captionBox.appendChild(el('label', { class: 'st-cap' }, [state.raw && state.raw[i] ? el('img', { src: p.url, alt: '' }) : el('span'), inp]));
      });
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
    Object.keys(mf).forEach(function (k) { mf[k].addEventListener('input', draw); });
    sizeSel.addEventListener('change', function () { state.size = sizeSel.value; draw(); });
    photoSel.addEventListener('change', function () { state.photoIdx = Number(photoSel.value); bgUndo.hidden = !(state.orig && state.orig[state.photoIdx]); bgMsg.textContent = ''; draw(); });
    logoSel.addEventListener('change', function () { state.logoIdx = Number(logoSel.value); refreshSelects(); draw(); });
    enh.addEventListener('change', function () { state.enhance = enh.checked; process(); draw(); });
    addPhotos.addEventListener('change', function () {
      Array.prototype.forEach.call(addPhotos.files, function (file) { srcs.push({ url: URL.createObjectURL(file), name: file.name }); });
      addPhotos.value = ''; status.textContent = 'Loading photos…'; loadAll();
    });
    var fontsReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 40px Inter'), document.fonts.load('500 40px Inter'), document.fonts.load('800 40px Inter')]).catch(function () {}) : Promise.resolve();
    fontsReady.then(loadAll).then(function () { setMode(state.mode); });
    return { draw: draw, render: render, state: state };
  }

  window.SirStudio = { open: open, guess: guess, themeFrom: themeFrom, parseMenu: parseMenu };
})();
