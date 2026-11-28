// Design studio (admin): turns a customer's photos, words and colours into 3 finished flyer drafts — no Canva needed.
// Auto-enhances the photos (brighter, richer colour, sharper), lets you edit every text, pick colours, the main photo
// and the logo, and downloads PNGs for WhatsApp post, status or print.
// Use: SirStudio.open({ photos: [{ url, name }], words, business, contact, colours, title })
(function () {
  'use strict';
  var FONT = 'Inter, "Segoe UI", Arial, sans-serif';
  var SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
  var HEAD = null; // a look's headline font (big, bold words); null = same as FONT
  function fam(weight) { return Number(weight) >= 800 && HEAD ? HEAD : FONT; }
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
  // No photo yet: a soft panel in the design's colours with an icon that suits the business, instead of an empty box.
  var PHT = null; // { t: theme, icon: 'cake', label: true }
  function photoSpot(c, x, y, w, h) {
    if (!PHT || !window.Path2D) { c.fillStyle = 'rgba(255,255,255,.15)'; c.fillRect(x, y, w, h); return; }
    var t = PHT.t, g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, mixHex(t.light || '#ffffff', '#ffffff', 0.3)); g.addColorStop(1, mixHex(t.light || '#ffffff', t.accent, 0.28));
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = g; c.fillRect(x, y, w, h);
    var step = Math.max(14, Math.min(w, h) / 9); c.fillStyle = mixHex(t.accent, '#ffffff', 0.35); c.globalAlpha = 0.35;
    for (var yy = y + step / 2; yy < y + h; yy += step) for (var xx = x + ((yy - y) / step % 2 ? step : step / 2); xx < x + w; xx += step * 2) { c.beginPath(); c.arc(xx, yy, Math.max(1.2, step * 0.07), 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    var ic = LOGO_ICONS[PHT.icon] || LOGO_ICONS.sparkle, sz = Math.min(w, h) * 0.42, k = sz / 100, cx = x + w / 2, cy = y + h / 2 - (PHT.label ? sz * 0.12 : 0);
    c.translate(cx - sz / 2, cy - sz / 2); c.scale(k, k); c.lineCap = 'round'; c.lineJoin = 'round';
    var path = new Path2D(ic.d); c.strokeStyle = t.bg; c.fillStyle = t.bg; c.globalAlpha = 0.55;
    if (ic.s) c.fill(path, 'evenodd'); else { c.lineWidth = 5; c.stroke(path); }
    c.restore();
    if (PHT.label && w > 90) { c.save(); c.font = '600 ' + Math.max(10, Math.min(w, h) * 0.06) + 'px ' + FONT; c.fillStyle = t.bg; c.globalAlpha = 0.6; c.textAlign = 'center'; c.fillText('Your photo here', cx, cy + sz * 0.72); c.restore(); }
  }
  function cover(c, img, x, y, w, h, fy) {
    if (!img) { photoSpot(c, x, y, w, h); return; }
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
      c.font = weight + ' ' + size + 'px ' + fam(weight);
      var words = text.split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + ' ' + words[i] : words[i];
        if (c.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = words[i]; }
      }
      if (cur) lines.push(cur);
      var widest = Math.max.apply(null, lines.map(function (l) { return c.measureText(l).width; }).concat([0]));
      if (lines.length <= maxLines && widest <= maxW) {
        // No lonely last word ("31." on its own line): pull one word down from the line above.
        var n = lines.length;
        if (n >= 2 && lines[n - 1].indexOf(' ') === -1) {
          var prev = lines[n - 2].split(' ');
          if (prev.length >= 3) { var moved = prev.pop() + ' ' + lines[n - 1]; if (c.measureText(moved).width <= maxW) { lines[n - 2] = prev.join(' '); lines[n - 1] = moved; } }
        }
        return { lines: lines, size: size };
      }
    }
    c.font = weight + ' ' + small + 'px ' + fam(weight);
    return { lines: [text], size: small };
  }
  function drawLines(c, f, x, y, lh, color, weight, align) {
    c.font = weight + ' ' + f.size + 'px ' + fam(weight); c.fillStyle = color; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
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
    if (!cv.__cut && decheck(cv)) cv.__cut = true;
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
  // "including, Spaghetti" → "including Spaghetti"; "10 percent" → "10%"; stray spaces before commas.
  function tidy(x) {
    return String(x || '').replace(/\b(including|such as|like|e\.g\.|plus|also)\s*,\s*/gi, '$1 ').replace(/\s+([,.;:!?])/g, '$1').replace(/,\s*,+/g, ',')
      .replace(/\bbetween\s+([^,.;\n]{2,30}?)\s+and\s+(\d{1,2}(?:st|nd|rd|th)?|[A-Z][a-z]+\s+\d{1,2})\b/g, 'from $1 to $2').replace(/(\d{1,2})\s*(?:per\s*cent|percent)\b/gi, '$1%').replace(/(\d)\s+%/g, '$1%').replace(/[ \t]{2,}/g, ' ');
  }
  function guess(o) {
    var words = tidy(String(o.words || '').replace(/\r/g, ''));
    var info = o.info || {};
    var phone = (info.phone || '').split(/[,;\/]/)[0].trim() || (words.match(/(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}/) || [])[0] || o.contact || '';
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
    return { business: biz, headline: headline, details: rest.slice(0, 3).join('\n'), offer: offer.replace(/\s+/g, ' ').toUpperCase(), contact: phone ? (/invit|wedding|birthday party|burial|naming/i.test(String(o.service || o.interest || '')) ? 'RSVP: ' : 'Call / WhatsApp: ') + phone : '' };
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
      var w = r * 3.6, h = Math.max(r * 1.3, w / ar + r * 0.3);
      // never taller than the circle it replaces, so it can't spill over photos or lines below
      if (h > r * 2) { h = r * 2; w = Math.min(w, (h - r * 0.3) * ar + r * 0.3); }
      var left = alignLeft ? x - r : x + r - w, top = y - h / 2;
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
    var fs = size; c.font = '800 ' + fs + 'px ' + FONT; // measured in the font it is drawn in
    while (c.measureText(text).width > maxW - fs * 2.2 && fs > size * 0.5) { fs -= 1; c.font = '800 ' + fs + 'px ' + FONT; }
    var f = { size: fs, lines: [text] }, w = Math.min(maxW, c.measureText(text).width + fs * 2.2), h = fs * 2.3;
    c.fillStyle = t.accent; rr(c, cx - w / 2, y, w, h, h / 2); c.fill();
    c.fillStyle = onColour(t.accent); c.textAlign = 'center'; c.fillText(f.lines[0], cx, y + h / 2 + f.size * 0.36); c.textAlign = 'left';
  }

  function sticker(c, t, text, x, y, r) {
    c.save(); c.translate(x, y); c.rotate(-0.18);
    c.fillStyle = t.accent; c.beginPath();
    for (var k = 0; k < 24; k++) { var a = k * Math.PI / 12, rr2 = k % 2 ? r * 0.9 : r; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    c.closePath(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = r * 0.2; c.fill(); c.shadowColor = 'transparent';
    var words = String(text).split(' '), lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [text];
    var Hd0 = HEAD; HEAD = null; var f = fit(c, lines.reduce(function (a, b) { return a.length > b.length ? a : b; }), r * 1.5, 1, r * 0.42, r * 0.16, 900); HEAD = Hd0;
    c.font = '900 ' + f.size + 'px ' + FONT; c.fillStyle = onColour(t.accent); c.textAlign = 'center';
    lines.forEach(function (l, n) { c.fillText(l, 0, f.size * 0.35 + (n - (lines.length - 1) / 2) * f.size * 1.1); });
    c.restore(); c.textAlign = 'left';
  }
  // Photos saved from the internet often have a grey-and-white check pattern printed in (a fake "transparent"
  // background). Find it from the edges and clear it, so the product shows on the design's own background.
  function decheck(cv) {
    var w = cv.width, h = cv.height, c = cv.getContext('2d'), d, p;
    try { d = c.getImageData(0, 0, w, h); } catch (e) { return false; }
    p = d.data;
    function light(i) { var r = p[i], g = p[i + 1], b = p[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx - mn < 22 && mn > 175; }
    var white = 0, grey = 0, n = 0, step = Math.max(1, Math.floor((w + h) / 400));
    function edge(x, y) { var i = (y * w + x) * 4; n++; if (light(i)) { if (p[i] > 238) white++; else grey++; } }
    for (var x = 0; x < w; x += step) { edge(x, 0); edge(x, h - 1); }
    for (var y = 0; y < h; y += step) { edge(0, y); edge(w - 1, y); }
    if (n < 20 || (white + grey) / n < 0.6 || white / n < 0.15 || grey / n < 0.15) return false;
    var seen = new Uint8Array(w * h), stack = [], k;
    for (x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
    for (y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
    var cleared = 0;
    while (stack.length) {
      k = stack.pop(); if (seen[k]) continue; seen[k] = 1;
      if (!light(k * 4)) continue;
      p[k * 4 + 3] = 0; cleared++;
      var px = k % w, py = (k - px) / w;
      if (px > 0) stack.push(k - 1); if (px < w - 1) stack.push(k + 1); if (py > 0) stack.push(k - w); if (py < h - 1) stack.push(k + w);
    }
    if (cleared < w * h * 0.08) return false;
    // soften the cut edge: half-clear light pixels touching the cleared area
    for (k = w; k < w * h - w; k++) if (p[k * 4 + 3] && light(k * 4) && (!p[(k - 1) * 4 + 3] || !p[(k + 1) * 4 + 3] || !p[(k - w) * 4 + 3] || !p[(k + w) * 4 + 3])) p[k * 4 + 3] = 90;
    c.putImageData(d, 0, 0);
    return true;
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
    { name: 'Full-bleed overlay', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 64 * u, tall = H / W > 1.5;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      if (d.photo && d.photo.__cut) { var gb = c.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.8); gb.addColorStop(0, t.accent); gb.addColorStop(1, t.bg); c.globalAlpha = 0.35; c.fillStyle = gb; c.fillRect(0, 0, W, H); c.globalAlpha = 1; cover(c, d.photo, 0, 60 * u, W, H * 0.62); }
      else cover(c, d.photo, 0, 0, W, H, 0.35);
      var g = c.createLinearGradient(0, H, 0, H * 0.3); g.addColorStop(0, 'rgba(0,0,0,.92)'); g.addColorStop(0.45, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, H * 0.3, W, H * 0.7);
      if (d.business && !d.logoWide) { c.font = '800 ' + 28 * u + 'px ' + FONT; c.fillStyle = '#fff'; c.fillText(d.business.toUpperCase(), pad, 90 * u, W - pad * 2 - (d.logo ? 130 * u : 0)); }
      logoBadge(c, d.logo, W - 100 * u, 100 * u, 56 * u);
      if (d.offer) sticker(c, t, d.offer, W - 190 * u, H * 0.42, 130 * u);
      // words sit just above the WhatsApp button, however many lines they take
      var hf = fit(c, d.headline, W - pad * 2, 3, (tall ? 120 : 100) * u, 44 * u, 900);
      var df = d.details ? fit(c, d.details.replace(/\n/g, ' \u00B7 '), W - pad * 2, 2, 36 * u, 22 * u, 500) : null;
      var block = 34 * u + hf.size * (1 + (hf.lines.length - 1) * 1.04) + (df ? 22 * u + df.size * (1 + (df.lines.length - 1) * 1.3) : 0);
      var y = H - 130 * u - 50 * u - block;
      c.fillStyle = t.accent; c.fillRect(pad, y, 120 * u, 6 * u);
      y = drawLines(c, hf, pad, y + 28 * u, 1.04, '#FFFFFF', 900);
      if (df) drawLines(c, df, pad, y + 22 * u, 1.3, 'rgba(255,255,255,.85)', 500);
      pill(c, t, d.contact, W / 2, H - 130 * u, W - 120 * u, 34 * u);
    } },
    { name: 'Centered hero', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 60 * u, tall = H / W > 1.5;
      c.fillStyle = t.light; c.fillRect(0, 0, W, H);
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H * (tall ? 0.42 : 0.47));
      if (d.business) { var bf = fit(c, d.business, W - pad * 2, 1, 40 * u, 22 * u, 800); drawLines(c, bf, W / 2, 70 * u, 1, t.accent, 800, 'center'); }
      var r = Math.min(W * (tall ? 0.34 : 0.27), H * 0.2), cx = W / 2, cy = H * (tall ? 0.36 : 0.4);
      c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 40 * u; c.shadowOffsetY = 16 * u; c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r + 14 * u, 0, Math.PI * 2); c.fill(); c.restore();
      c.strokeStyle = t.accent; c.lineWidth = 6 * u; c.beginPath(); c.arc(cx, cy, r + 14 * u, 0, Math.PI * 2); c.stroke();
      c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip(); if (d.photo && d.photo.__cut) { c.fillStyle = t.light; c.fillRect(cx - r, cy - r, r * 2, r * 2); } cover(c, d.photo, cx - r, cy - r, r * 2, r * 2, 0.45); c.restore();
      if (d.offer) sticker(c, t, d.offer, cx + r * 0.82, cy - r * 0.72, 92 * u);
      var y = cy + r + 70 * u, hf = fit(c, d.headline, W - pad * 2, 2, (tall ? 104 : 86) * u, 40 * u, 900);
      y = drawLines(c, hf, W / 2, y, 1.04, t.bg, 900, 'center');
      if (d.details) { var df = fit(c, d.details.replace(/\n/g, ' · '), W - pad * 3, 2, 34 * u, 22 * u, 500); drawLines(c, df, W / 2, y + 20 * u, 1.3, '#4B5563', 500, 'center'); }
      pill(c, t, d.contact, W / 2, H - 120 * u, W - 120 * u, 34 * u);
    } },
    { name: 'Editorial', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 70 * u, tall = H / W > 1.5;
      c.fillStyle = t.light; c.fillRect(0, 0, W, H);
      c.strokeStyle = t.bg; c.lineWidth = 2 * u; c.strokeRect(34 * u, 34 * u, W - 68 * u, H - 68 * u);
      c.font = '600 ' + 22 * u + 'px ' + FONT; c.fillStyle = t.bg; c.fillText((d.business || '').toUpperCase().split('').join(String.fromCharCode(8202)), pad, 100 * u, W - pad * 2);
      c.fillRect(pad, 120 * u, W - pad * 2, 1.5 * u); c.save(); c.globalAlpha = 0.22; c.fillStyle = t.accent; c.fillRect(36 * u, 36 * u, W - 72 * u, 100 * u); c.restore();
      var hf = fit(c, d.headline, W - pad * 2, 3, (tall ? 108 : 88) * u, 36 * u, 900), y = drawLines(c, hf, pad, 160 * u, 1.02, t.bg, 900);
      if (d.details) { var df = fit(c, d.details.replace(/\n/g, ' · '), W - pad * 2, 2, 32 * u, 20 * u, 500); y = drawLines(c, df, pad, y + (HEAD && /Vibes|Script/.test(HEAD) ? 40 : 26) * u, 1.35, '#4B4038', 500); }
      var py = y + 48 * u, ph = H - py - 200 * u;
      c.save(); rr(c, pad, py, W - pad * 2, ph, 4 * u); c.clip(); if (d.photo && d.photo.__cut) { c.fillStyle = '#EFE7DA'; c.fillRect(pad, py, W - pad * 2, ph); } cover(c, d.photo, pad, py, W - pad * 2, ph, 0.45); c.restore();
      c.strokeStyle = t.bg; c.lineWidth = 2 * u; c.strokeRect(pad, py, W - pad * 2, ph);
      if (d.offer) sticker(c, t, d.offer, W - pad - 70 * u, py + 70 * u, 86 * u);
      c.fillStyle = t.bg; c.fillRect(pad, H - 150 * u, W - pad * 2, 1.5 * u);
      var cf = fit(c, d.contact, W - pad * 2, 1, 32 * u, 18 * u, 700); drawLines(c, cf, W / 2, H - 125 * u, 1, t.bg, 700, 'center');
    } },
    { name: 'Diagonal sticker', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 64 * u, tall = H / W > 1.5;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      c.save(); c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, H * 0.5); c.lineTo(0, H * 0.62); c.closePath(); c.clip(); cover(c, d.photo, 0, 0, W, H * 0.62, 0.4); c.restore();
      c.fillStyle = t.accent; c.beginPath(); c.moveTo(0, H * 0.62); c.lineTo(W, H * 0.5); c.lineTo(W, H * 0.5 + 22 * u); c.lineTo(0, H * 0.62 + 22 * u); c.closePath(); c.fill();
      if (d.business && !d.logoWide) { c.fillStyle = t.bg; c.font = '800 ' + 26 * u + 'px ' + FONT; var bw = c.measureText(d.business.toUpperCase()).width + 40 * u; rr(c, pad, 60 * u, Math.min(bw, W - pad * 2), 54 * u, 27 * u); c.fill(); c.fillStyle = onColour(t.bg); c.fillText(d.business.toUpperCase(), pad + 20 * u, 96 * u, W - pad * 2 - 40 * u); }
      logoBadge(c, d.logo, W - 100 * u, 100 * u, 56 * u);
      if (d.offer) { c.save(); c.translate(W - 230 * u, H * 0.5 - 40 * u); c.rotate(-0.12); c.fillStyle = t.accent; rr(c, -150 * u, -46 * u, 300 * u, 92 * u, 14 * u); c.fill(); var of = fit(c, d.offer, 260 * u, 1, 40 * u, 18 * u, 900); drawLines(c, of, 0, -of.size * 0.42, 1, onColour(t.accent), 900, 'center'); c.restore(); }
      var y = H * 0.62 + 70 * u, hf = fit(c, d.headline, W - pad * 2, 3, (tall ? 110 : 92) * u, 40 * u, 900);
      y = drawLines(c, hf, pad, y, 1.02, onColour(t.bg), 900);
      if (d.details) { var df = fit(c, d.details.replace(/\n/g, ' · '), W - pad * 2, 2, 34 * u, 20 * u, 500); drawLines(c, df, pad, y + 18 * u, 1.3, onColour(t.bg) === '#FFFFFF' ? 'rgba(255,255,255,.85)' : '#374151', 500); }
      pill(c, t, d.contact, W / 2, H - 120 * u, W - 120 * u, 32 * u);
    } },
    { name: 'Poster type', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 60 * u, tall = H / W > 1.5;
      c.fillStyle = t.accent; c.fillRect(0, 0, W, H);
      var ph = H * (tall ? 0.42 : 0.4), py = H - ph - 130 * u;
      if (d.business) { c.font = '800 ' + 26 * u + 'px ' + FONT; c.fillStyle = onColour(t.accent); c.fillText(d.business.toUpperCase(), pad, 80 * u, W - pad * 2); }
      var room = py - 30 * u - 110 * u, k = 1, hf, df, block;
      do { // shrink until the words fit above the photo
        hf = fit(c, String(d.headline).toUpperCase(), W - pad * 2, 3, (tall ? 160 : 130) * u * k, 36 * u * k, 900);
        df = d.details ? fit(c, d.details.replace(/\n/g, ' \u00B7 '), W - pad * 2, 2, 34 * u * k, 18 * u, 600) : null;
        block = hf.size * (1 + (hf.lines.length - 1) * 0.95) + (df ? 16 * u + df.size * (1 + (df.lines.length - 1) * 1.3) : 0); k -= 0.06;
      } while (block > room && k > 0.4);
      var y = drawLines(c, hf, pad, 110 * u, 0.95, t.bg, 900);
      if (df) drawLines(c, df, pad, y + 16 * u, 1.3, onColour(t.accent) === '#FFFFFF' ? 'rgba(255,255,255,.9)' : '#1F2937', 600);
      c.save(); c.beginPath(); c.rect(0, py, W, ph); c.clip(); c.fillStyle = t.bg; c.fillRect(0, py, W, ph); cover(c, d.photo, 0, py, W, ph, 0.45); c.restore();
      if (d.offer) sticker(c, t, d.offer, W - 150 * u, py, 110 * u);
      c.fillStyle = t.bg; c.fillRect(0, H - 130 * u, W, 130 * u);
      var cf = fit(c, d.contact, W - pad * 2, 1, 34 * u, 18 * u, 800); drawLines(c, cf, W / 2, H - 130 * u + (130 * u - cf.size) / 2 - cf.size * 0.12, 1, onColour(t.bg), 800, 'center');
    } },
    { name: 'Magazine cover', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 56 * u;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      if (d.photo && d.photo.__cut) { var gb = c.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W * 0.75); gb.addColorStop(0, t.accent); gb.addColorStop(1, t.bg); c.globalAlpha = 0.45; c.fillStyle = gb; c.fillRect(0, 0, W, H); c.globalAlpha = 1; cover(c, d.photo, 0, H * 0.13, W, H * 0.56); }
      else cover(c, d.photo, 0, 0, W, H, 0.4);
      var g = c.createLinearGradient(0, 0, 0, H * 0.3); g.addColorStop(0, 'rgba(0,0,0,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H * 0.3);
      var mf = fit(c, (d.business || '').toUpperCase(), W - pad * 2, 1, 150 * u, 50 * u, 900); drawLines(c, mf, W / 2, 40 * u, 1, t.accent, 900, 'center');
      var g2 = c.createLinearGradient(0, H * 0.55, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.85)'); c.fillStyle = g2; c.fillRect(0, H * 0.55, W, H * 0.45);
      var hf = fit(c, d.headline, W * 0.62, 3, 76 * u, 30 * u, 900), dfh = d.details ? fit(c, d.details.replace(/\n/g, ' · '), W * 0.62, 3, 30 * u, 18 * u, 500) : null;
      var block = hf.size * (1 + (hf.lines.length - 1) * 1.05) + (dfh ? 18 * u + dfh.size * (1 + (dfh.lines.length - 1) * 1.3) : 0), y = H - 150 * u - block;
      c.fillStyle = t.accent; c.fillRect(pad, y - 22 * u, 60 * u, 6 * u);
      y = drawLines(c, hf, pad, y, 1.05, '#FFFFFF', 900); if (dfh) drawLines(c, dfh, pad, y + 18 * u, 1.3, 'rgba(255,255,255,.85)', 500);
      if (d.offer) sticker(c, t, d.offer, W - 160 * u, H - 330 * u, 110 * u);
      pill(c, t, d.contact, W / 2, H - 112 * u, W - 112 * u, 30 * u);
    } },
    { name: 'Polaroid', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 60 * u, tall = H / W > 1.5;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      c.fillStyle = t.accent; c.globalAlpha = 0.18; for (var k = 0; k < 9; k++) { c.beginPath(); c.arc((k * 173 % 1000) * u + 40 * u, (k * 311 % 1300) * u * H / 1350 / u * u, (30 + k * 7) * u, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1;
      var pw = W * 0.62, phh = pw * 1.05, cx = W / 2, cy = (tall ? H * 0.32 : H * 0.36);
      c.save(); c.translate(cx, cy); c.rotate(-0.06); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 36 * u; c.shadowOffsetY = 18 * u; c.fillStyle = '#FFFFFF'; c.fillRect(-pw / 2 - 22 * u, -phh / 2 - 22 * u, pw + 44 * u, phh + 120 * u); c.shadowColor = 'transparent';
      c.save(); c.beginPath(); c.rect(-pw / 2, -phh / 2, pw, phh); c.clip(); c.fillStyle = '#F3EEE6'; c.fillRect(-pw / 2, -phh / 2, pw, phh); cover(c, d.photo, -pw / 2, -phh / 2, pw, phh, 0.45); c.restore();
      if (d.business) { var bf = fit(c, d.business, pw, 1, 46 * u, 22 * u, 700); c.font = '700 ' + bf.size + 'px ' + SERIF; c.fillStyle = '#333'; c.textAlign = 'center'; c.fillText(d.business, 0, phh / 2 + 70 * u, pw); c.textAlign = 'left'; }
      c.restore();
      if (d.offer) sticker(c, t, d.offer, cx + pw / 2, cy - phh / 2, 100 * u);
      var hf = fit(c, d.headline, W - pad * 2, 2, (tall ? 100 : 80) * u, 36 * u, 900), df = d.details ? fit(c, d.details.replace(/\n/g, ' \u00B7 '), W - pad * 2, 2, 30 * u, 18 * u, 500) : null;
      var block = hf.size * (1 + (hf.lines.length - 1) * 1.04) + (df ? 14 * u + df.size * (1 + (df.lines.length - 1) * 1.3) : 0);
      var y = Math.min(cy + phh / 2 + 160 * u, H - 110 * u - 36 * u - block);
      y = drawLines(c, hf, W / 2, y, 1.04, onColour(t.bg), 900, 'center');
      if (df) drawLines(c, df, W / 2, y + 14 * u, 1.3, onColour(t.bg) === '#FFFFFF' ? 'rgba(255,255,255,.85)' : '#374151', 500, 'center');
      pill(c, t, d.contact, W / 2, H - 110 * u, W - 120 * u, 30 * u);
    } },
    { name: 'Side band', draw: function (c, W, H, d, t) {
      var u = W / 1080, band = 150 * u, pad = 56 * u;
      c.fillStyle = t.light; c.fillRect(0, 0, W, H);
      c.fillStyle = t.bg; c.fillRect(0, 0, band, H);
      c.save(); c.translate(band / 2 + 16 * u, H - 60 * u); c.rotate(-Math.PI / 2); var bf = fit(c, (d.business || '').toUpperCase(), H - 120 * u, 1, 70 * u, 30 * u, 900); c.font = '900 ' + bf.size + 'px ' + fam(900); c.fillStyle = t.accent; c.fillText((d.business || '').toUpperCase(), 0, 0, H - 120 * u); c.restore();
      var x = band + pad, w = W - x - pad, ph = H * 0.46;
      c.save(); rr(c, x, pad, w, ph, 18 * u); c.clip(); c.fillStyle = '#EFE7DA'; c.fillRect(x, pad, w, ph); cover(c, d.photo, x, pad, w, ph, 0.45); c.restore();
      if (d.offer) sticker(c, t, d.offer, x + w - 60 * u, pad + ph - 40 * u, 90 * u);
      var y = pad + ph + 60 * u, hf = fit(c, d.headline, w, 3, 86 * u, 34 * u, 900);
      y = drawLines(c, hf, x, y, 1.04, t.bg, 900);
      if (d.details) { var df = fit(c, d.details.replace(/\n/g, ' · '), w, 3, 30 * u, 20 * u, 500); drawLines(c, df, x, y + 16 * u, 1.35, '#4B5563', 500); }
      var cf = fit(c, d.contact, w, 2, 30 * u, 18 * u, 800); c.fillStyle = t.bg; c.fillRect(x, H - 150 * u, w, 2 * u); drawLines(c, cf, x, H - 120 * u, 1.2, t.bg, 800);
    } },
    { name: 'Ticket', draw: function (c, W, H, d, t) {
      var u = W / 1080, pad = 70 * u, m = 46 * u;
      c.fillStyle = t.bg; c.fillRect(0, 0, W, H);
      var tx = m, ty = m, tw = W - m * 2, th = H - m * 2, cut = H * 0.6;
      c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 30 * u; c.fillStyle = t.light; rr(c, tx, ty, tw, th, 26 * u); c.fill(); c.restore();
      c.fillStyle = t.bg; [tx, tx + tw].forEach(function (x) { c.beginPath(); c.arc(x, ty + cut, 34 * u, 0, Math.PI * 2); c.fill(); });
      c.strokeStyle = t.bg; c.setLineDash([14 * u, 12 * u]); c.lineWidth = 3 * u; c.beginPath(); c.moveTo(tx + 50 * u, ty + cut); c.lineTo(tx + tw - 50 * u, ty + cut); c.stroke(); c.setLineDash([]);
      var px = tx + 30 * u, py = ty + 30 * u, pw = tw - 60 * u, ph = cut * 0.52;
      c.save(); rr(c, px, py, pw, ph, 18 * u); c.clip(); c.fillStyle = '#EFE7DA'; c.fillRect(px, py, pw, ph); cover(c, d.photo, px, py, pw, ph, 0.45); c.restore();
      if (d.offer) sticker(c, t, d.offer, px + pw - 50 * u, py + 50 * u, 84 * u);
      var y = py + ph + 50 * u, hf = fit(c, d.headline, tw - pad * 2, 2, 78 * u, 34 * u, 900); y = drawLines(c, hf, W / 2, y, 1.04, t.bg, 900, 'center');
      if (d.details) { var df = fit(c, d.details.replace(/\n/g, ' · '), tw - pad * 2, 2, 28 * u, 18 * u, 500); drawLines(c, df, W / 2, y + 12 * u, 1.3, '#4B5563', 500, 'center'); }
      if (d.business) { var bf = fit(c, (d.business || '').toUpperCase(), tw - pad * 2, 1, 40 * u, 20 * u, 900); drawLines(c, bf, W / 2, ty + cut + 60 * u, 1, darkAccent(t), 900, 'center'); }
      var cf = fit(c, d.contact, tw - pad * 2, 2, 30 * u, 18 * u, 700); drawLines(c, cf, W / 2, ty + th - 150 * u, 1.3, t.bg, 700, 'center');
    } },
    { name: 'Sweet boutique', draw: function (c, W, H, d, t) { boutique(c, W, H, d, t, false); } },
    { name: 'Product showcase', draw: function (c, W, H, d, t) { showcase(c, W, H, d, t, false); } }
  ];

  // ---------- the editor ----------

  // ---------- menu / price-list flyers (a business with a list of products) ----------
  var PHONE_RE = /(\+?234|0)[789][01]\d[\s-]?\d{3}[\s-]?\d{4}/g;
  // Social handles with their platform: "IG @a, TikTok @b, FB Kassy Treats" → ["IG @a", "TikTok @b", "FB Kassy Treats"],
  // so a handle is always shown with the platform it belongs to. Plain "@a" stays as it is.
  var SOC = { ig: 'IG', insta: 'IG', instagram: 'IG', tiktok: 'TikTok', tt: 'TikTok', fb: 'FB', facebook: 'FB', x: 'X', twitter: 'X', youtube: 'YouTube', yt: 'YouTube', snap: 'Snapchat', snapchat: 'Snapchat' };
  function socialList(text) {
    var out = [];
    String(text || '').split(/\s*[,;\n]\s*/).forEach(function (bit) {
      bit = bit.trim(); if (!bit) return;
      var m = bit.match(/^(ig|insta(?:gram)?|tiktok|tt|fb|facebook|x|twitter|youtube|yt|snap(?:chat)?)(?:\s*[:\-]\s*|\s+)(.+)$/i);
      if (m) { var v = m[2].trim().replace(/^https?:\/\/\S*\//, ''); var lab = SOC[m[1].toLowerCase()]; if (lab !== 'FB' && v.charAt(0) !== '@' && !/\s/.test(v)) v = '@' + v; v = lab + ' ' + v; if (out.indexOf(v) === -1) out.push(v); return; }
      bit.split(/\s+/).forEach(function (h) { if (!h) return; h = h.charAt(0) === '@' ? h : '@' + h; if (out.indexOf(h) === -1) out.push(h); });
    });
    return out;
  }
  // "IG @kassy" → { k: 'ig', t: '@kassy' }: the design shows the platform's little logo, then the handle only.
  var SOC_KEY = { IG: 'ig', TikTok: 'tt', FB: 'fb', X: 'x', YouTube: 'yt', Snapchat: 'snap' };
  function socialSplit(h) { var m = String(h).match(/^(IG|TikTok|FB|X|YouTube|Snapchat) (.+)$/); return m ? { k: SOC_KEY[m[1]], t: m[2] } : { k: 'social', t: String(h) }; }
  // One centred line of handles (each with its logo) and the place, for footer bars.
  function socialLine(c, socials, place, cx, y, fs, color, maxW, weight) {
    var items = (socials || []).map(socialSplit); if (place) items.push({ k: 'place', t: place });
    if (!items.length) return;
    var gap = fs * 1.1, ic = fs * 1.4, total;
    for (var tries = 0; tries < 12; tries++) {
      c.font = (weight || 700) + ' ' + fs + 'px ' + FONT;
      total = items.reduce(function (a, it) { return a + ic + fs * 0.3 + c.measureText(it.t).width; }, 0) + gap * (items.length - 1);
      if (total <= maxW) break; fs *= 0.92; gap = fs * 1.1; ic = fs * 1.4;
    }
    var x = cx - Math.min(total, maxW) / 2;
    items.forEach(function (it) {
      icon(c, it.k, x + ic / 2, y - fs * 0.34, ic / 2, 'rgba(0,0,0,0)', color);
      c.font = (weight || 700) + ' ' + fs + 'px ' + FONT;
      x += ic + fs * 0.3; c.fillStyle = color; c.textAlign = 'left'; c.fillText(it.t, x, y); x += c.measureText(it.t).width + gap;
    });
  }
  // Reads the customer's words as a menu: name, list title, items, a note ("We also offer…"), phones, handles, place.
  function parseMenu(o) {
    var lines = tidy(String(o.words || '').replace(/\r/g, '')).split('\n').map(function (l) { return l.replace(/^[\s•\-*◆♦▪·]+/, '').trim(); });
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
      if (inline && inline[2].split(/,(?!\d{3}\b)/).length >= 3) {
        if (!m.listTitle) m.listTitle = inline[1].trim();
        inline[2].replace(/\band\b/gi, ',').split(/,(?!\d{3}\b)/).forEach(function (x) { x = x.trim().replace(/[.]$/, ''); if (x) m.items.push(x.charAt(0).toUpperCase() + x.slice(1)); });
        return;
      }
      var nd = rest.match(/^(.{2,32}?)\s*(?::|\s[-–—]\s|[–—])\s*(.{6,})$/);
      if (nd && mode !== 'contact' && !/^(open|opening|hours?|address|location|tel|phone|email|e-mail|website|web|call|whatsapp|contact|note|ps|delivery|deliver|we|our|follow|price|prices)\b/i.test(nd[1]) && !/^we\s/i.test(rest) && nd[1].split(/\s+/).length <= 4) { m.items.push(nd[1].charAt(0).toUpperCase() + nd[1].slice(1) + ' - ' + nd[2].replace(/[.]+$/, '')); return; }
      if (rest.length > 40 || /[.!]\s*$/.test(rest) || /^we\s/i.test(rest)) { m.note = m.note ? m.note + ' ' + rest : rest; return; }
      if (mode === 'contact') return;
      // commas inside prices (₦3,500) don't split an item
      (rest.split(/,(?!\d{3}\b)(?![^(]*\))/).length >= 3 ? rest.split(/,(?!\d{3}\b)/) : [rest]).forEach(function (x) { x = x.trim(); if (x) m.items.push(x.charAt(0).toUpperCase() + x.slice(1)); });
    });
    if (!m.listTitle) m.listTitle = m.items.length ? 'Contact us for' : '';
    var inf = o.info || {};
    (inf.phone || '').split(/[,;\/]+/).forEach(function (p) { p = p.replace(/[^\d+]/g, ''); if (p.length >= 10 && m.phones.indexOf(p) === -1) m.phones.unshift(p); });
    socialList(inf.socials).forEach(function (h) { var bare = h.replace(/^\S+ (?=@)/, ''); m.socials = m.socials.filter(function (x) { return x !== bare; }); if (m.socials.indexOf(h) === -1) m.socials.push(h); });
    if (inf.address) m.place = inf.address;
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
      var pm = it.match(/^(.*?)\s*[-–—:]\s*((?:from\s+)?\u20A6\s?[\d,]+(?:\s*\/\s*\w+)?|\d[\d,]*\s*naira)\s*$/i);
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
    else if (kind === 'mail') { rr(c, x - r * 0.5, y - r * 0.34, r, r * 0.68, r * 0.1); c.stroke(); c.beginPath(); c.moveTo(x - r * 0.46, y - r * 0.28); c.lineTo(x, y + r * 0.06); c.lineTo(x + r * 0.46, y - r * 0.28); c.stroke(); }
    else if (kind === 'web') { c.beginPath(); c.arc(x, y, r * 0.5, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(x, y, r * 0.2, r * 0.5, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(x - r * 0.5, y); c.lineTo(x + r * 0.5, y); c.stroke(); }
    else if (kind === 'ig') { rr(c, x - r * 0.48, y - r * 0.48, r * 0.96, r * 0.96, r * 0.28); c.stroke(); c.beginPath(); c.arc(x, y, r * 0.22, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x + r * 0.27, y - r * 0.27, r * 0.07, 0, Math.PI * 2); c.fill(); }
    else if (kind === 'tt') { c.lineWidth = r * 0.17; c.beginPath(); c.moveTo(x + r * 0.05, y + r * 0.22); c.lineTo(x + r * 0.05, y - r * 0.52); c.quadraticCurveTo(x + r * 0.12, y - r * 0.22, x + r * 0.46, y - r * 0.2); c.stroke(); c.beginPath(); c.arc(x - r * 0.17, y + r * 0.24, r * 0.22, 0, Math.PI * 2); c.stroke(); }
    else if (kind === 'fb') { c.font = '900 ' + r * 1.25 + 'px Arial, sans-serif'; c.textAlign = 'center'; c.fillText('f', x + r * 0.04, y + r * 0.45); c.textAlign = 'left'; }
    else if (kind === 'x') { c.lineWidth = r * 0.17; c.beginPath(); c.moveTo(x - r * 0.4, y - r * 0.42); c.lineTo(x + r * 0.4, y + r * 0.42); c.moveTo(x + r * 0.4, y - r * 0.42); c.lineTo(x - r * 0.4, y + r * 0.42); c.stroke(); }
    else if (kind === 'yt') { rr(c, x - r * 0.55, y - r * 0.38, r * 1.1, r * 0.76, r * 0.2); c.fill(); c.fillStyle = bg === 'rgba(0,0,0,0)' ? '#fff' : bg; c.beginPath(); c.moveTo(x - r * 0.14, y - r * 0.2); c.lineTo(x + r * 0.22, y); c.lineTo(x - r * 0.14, y + r * 0.2); c.closePath(); c.fill(); }
    else if (kind === 'snap') { c.beginPath(); c.arc(x, y - r * 0.08, r * 0.34, Math.PI, 0); c.lineTo(x + r * 0.4, y + r * 0.42); c.lineTo(x - r * 0.4, y + r * 0.42); c.closePath(); c.stroke(); }
    else { c.font = '800 ' + r * 1.15 + 'px ' + FONT; c.textAlign = 'center'; c.fillText('@', x, y + r * 0.4); c.textAlign = 'left'; }
  }
  // Contact lines: phones, handles, place. Returns the height used (or needed when draw is false).
  function contactBlock(c, d, x, y, w, size, color, iconBg, iconFg, draw) {
    var rows = [];
    // Phones share a line when it fits, otherwise one per line.
    c.font = '700 ' + size + 'px ' + FONT;
    if (d.phones.length && c.measureText(d.phones.join(', ')).width <= w - size * 2.2) rows.push(['phone', d.phones.join(', ')]);
    else d.phones.forEach(function (p) { rows.push(['phone', p]); });
    d.socials.forEach(function (h) { var sp = socialSplit(h); rows.push([sp.k, sp.t]); });
    if (d.place) rows.push(['place', d.place]);
    var lh = size * 1.75;
    if (draw) rows.forEach(function (r, i) {
      var cy = y + i * lh + lh / 2;
      icon(c, r[0], x + size * 0.75, cy, size * 0.72, iconBg, iconFg);
      c.font = '700 ' + size + 'px ' + FONT;
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


  // ---------- "Sweet boutique": sparkle background, script name, tagline ribbon, arched photos, icon contacts,
  // delivery / occasions strip. For cakes, fashion, beauty and events. Menu mode shows the list; promo the headline.
  function boutique(c, W, H, d, t, menu) {
    var u = W / 1080, pad = 54 * u, tall = H / W > 1.5, sq = H / W < 1.1;
    var own = t && t.name === 'Their colours';
    var plum = own ? t.bg : '#5B1E4F', gold = own ? t.accent : '#C9A227', blush = own ? (t.light || '#FBF1F4') : '#FCEAF1';
    var SCRIPT = '"Great Vibes", "Playfair Display", Georgia, serif', SERIFF = '"Playfair Display", Georgia, serif', BODY = '"Poppins", Inter, Arial, sans-serif';
    // sparkle background
    var g = c.createRadialGradient(W * 0.75, H * 0.25, 0, W * 0.6, H * 0.4, Math.max(W, H)); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.45, blush); g.addColorStop(1, own ? blush : '#F3C9DA'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var seed = 7; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 70; i++) { var bx = rnd() * W, by = rnd() * H, br = (8 + rnd() * 46) * u; c.globalAlpha = 0.08 + rnd() * 0.22; c.fillStyle = i % 3 ? '#FFFFFF' : gold; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill(); }
    c.globalAlpha = 1;
    for (i = 0; i < 26; i++) { var sx = rnd() * W, sy = rnd() * H, ss = (4 + rnd() * 9) * u; c.fillStyle = '#FFFFFF'; c.globalAlpha = 0.5 + rnd() * 0.5; c.beginPath(); c.moveTo(sx, sy - ss); c.lineTo(sx + ss * 0.25, sy); c.lineTo(sx, sy + ss); c.lineTo(sx - ss * 0.25, sy); c.closePath(); c.fill(); }
    c.globalAlpha = 1;
    var stripH = (tall ? 150 : sq ? 104 : 124) * u;
    // right: photos (one big arched, two small rounded)
    var pics = (menu ? (d.menuPhotos || []).map(function (x) { return x.img; }) : (d.photos || [])).filter(Boolean);
    var hasPics = pics.length > 0, colW = hasPics ? W * 0.52 - pad : W - pad * 2, px = W * 0.54, pw = W - px - pad * 0.8;
    var top = pad * 0.9, bottom = H - stripH - 30 * u;
    if (hasPics) {
      var bigH = pics.length > 1 ? (bottom - top) * 0.6 : bottom - top - 10 * u, arch = pw / 2;
      c.save(); c.shadowColor = 'rgba(91,30,79,.28)'; c.shadowBlur = 30 * u; c.shadowOffsetY = 10 * u; c.fillStyle = '#FFFFFF';
      c.beginPath(); c.moveTo(px - 8 * u, top + bigH + 8 * u); c.lineTo(px - 8 * u, top + arch); c.arc(px + pw / 2, top + arch, arch + 8 * u, Math.PI, 0); c.lineTo(px + pw + 8 * u, top + bigH + 8 * u); c.closePath(); c.fill(); c.restore();
      c.save(); c.beginPath(); c.moveTo(px, top + bigH); c.lineTo(px, top + arch); c.arc(px + pw / 2, top + arch, arch, Math.PI, 0); c.lineTo(px + pw, top + bigH); c.closePath(); c.clip();
      var ag = c.createLinearGradient(0, top, 0, top + bigH); ag.addColorStop(0, '#FFFFFF'); ag.addColorStop(1, own ? blush : '#F7D3E2'); c.fillStyle = ag; c.fillRect(px, top, pw, bigH);
      cover(c, pics[0], px, top, pw, bigH, 0.45); c.restore();
      c.strokeStyle = gold; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(px - 18 * u, top + bigH + 18 * u); c.lineTo(px - 18 * u, top + arch); c.arc(px + pw / 2, top + arch, arch + 18 * u, Math.PI, 0); c.lineTo(px + pw + 18 * u, top + bigH * 0.55); c.stroke();
      var small = pics.slice(1, 3);
      if (small.length) {
        var sy0 = top + bigH + 30 * u, sh = bottom - sy0, sw = small.length > 1 ? (pw - 20 * u) / 2 : pw;
        small.forEach(function (im, k) {
          var x0 = px + k * (sw + 20 * u);
          c.save(); c.shadowColor = 'rgba(91,30,79,.25)'; c.shadowBlur = 18 * u; c.shadowOffsetY = 6 * u; c.fillStyle = '#FFFFFF'; rr(c, x0 - 6 * u, sy0 - 6 * u, sw + 12 * u, sh + 12 * u, 26 * u); c.fill(); c.restore();
          c.save(); rr(c, x0, sy0, sw, sh, 22 * u); c.clip(); cover(c, im, x0, sy0, sw, sh, 0.45); c.restore();
        });
      }
    }
    // left: logo, script name, small line with flourishes, ribbon
    var y = top;
    if (d.logo) { logoBadge(c, d.logo, pad + 60 * u, y + 60 * u, 60 * u, true); y += 130 * u; }
    var bp = brandParts(d.business || 'Your business'), nameS = (tall ? 150 : 132) * u;
    c.font = '400 ' + nameS + 'px ' + SCRIPT; while (c.measureText(bp.big).width > colW && nameS > 60 * u) { nameS -= 4 * u; c.font = '400 ' + nameS + 'px ' + SCRIPT; }
    if (c.measureText(bp.big).width > colW) { var nf = fit(c, bp.big, colW, 2, 90 * u, 50 * u, 400); nameS = nf.size; c.font = '400 ' + nameS + 'px ' + SCRIPT; nf.lines.forEach(function (l, k) { c.fillStyle = plum; c.fillText(l, pad, y + nameS * (0.95 + k * 0.95)); }); y += nameS * (0.95 * nf.lines.length) + 6 * u; }
    else { c.fillStyle = plum; c.fillText(bp.big, pad, y + nameS * 0.95); y += nameS * 1.02 + (bp.small ? nameS * 0.22 : 0); }
    if (bp.small) {
      var ss2 = 46 * u; c.font = 'italic 700 ' + ss2 + 'px ' + SERIFF; while (c.measureText(bp.small).width > colW * 0.7 && ss2 > 22 * u) { ss2 -= 2 * u; c.font = 'italic 700 ' + ss2 + 'px ' + SERIFF; }
      var sw2 = c.measureText(bp.small).width; c.font = '400 ' + nameS + 'px ' + SCRIPT; var nw = Math.min(colW, c.measureText(bp.big).width || colW); c.font = 'italic 700 ' + ss2 + 'px ' + SERIFF;
      var cx2 = Math.max(pad + sw2 / 2 + 100 * u, Math.min(pad + colW - sw2 / 2 - 100 * u, pad + nw * 0.6)); if (sw2 + 200 * u > colW) cx2 = pad + colW / 2;
      c.fillStyle = gold; c.textAlign = 'center'; c.fillText(bp.small, cx2, y + ss2 * 0.8); c.textAlign = 'left';
      c.strokeStyle = gold; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(cx2 - sw2 / 2 - 90 * u, y + ss2 * 0.5); c.lineTo(cx2 - sw2 / 2 - 16 * u, y + ss2 * 0.5); c.moveTo(cx2 + sw2 / 2 + 16 * u, y + ss2 * 0.5); c.lineTo(cx2 + sw2 / 2 + 90 * u, y + ss2 * 0.5); c.stroke();
      y += ss2 * 1.3;
    }
    var ribbon = menu ? (d.listTitle && !/^contact us for$/i.test(d.listTitle) ? d.listTitle : 'Freshly made, just for you') : (d.headline || '');
    if (ribbon) {
      var rf = fit(c, ribbon, colW - 70 * u, 2, 40 * u, 22 * u, 700), rh = rf.lines.length * rf.size * 1.25 + 34 * u;
      c.fillStyle = plum; c.beginPath(); c.moveTo(pad, y + 14 * u); c.lineTo(pad + colW - 16 * u, y); c.lineTo(pad + colW, y + rh / 2); c.lineTo(pad + colW - 16 * u, y + rh); c.lineTo(pad + 6 * u, y + rh - 8 * u); c.lineTo(pad + 24 * u, y + rh / 2); c.closePath(); c.fill();
      c.font = 'italic 700 ' + rf.size + 'px ' + SERIFF; c.fillStyle = '#FFFFFF'; c.textAlign = 'center';
      rf.lines.forEach(function (l, k) { c.fillText(l, pad + colW / 2 + 6 * u, y + 17 * u + rf.size * (0.95 + k * 1.25)); }); c.textAlign = 'left';
      y += rh + 24 * u;
    }
    var FB = FONT; FONT = BODY;
    try {
      // contacts (at the bottom of the column), list/details above them
      var cSize = (tall ? 34 : sq ? 24 : 28) * u, contactH = contactBlock(c, d, 0, 0, colW, cSize, '', '', '', false);
      var cTop = bottom - contactH;
      if (menu && d.items && d.items.length) {
        var room = cTop - y - 20 * u, fl = listFit(c, d.items, colW, room, (tall ? 40 : 32) * u, 16 * u, 700, 2); fl.weight = 700; fl.lh = Math.max(1.4, Math.min(tall ? 2.4 : 1.9, room / (fl.rows * fl.size)));
        y = drawList(c, d.items, pad + 4 * u, y, fl, plum, gold) + 10 * u;
      } else if (!menu && d.details) {
        var df = fit(c, d.details, colW, 4, (tall ? 38 : 32) * u, 20 * u, 600); y = drawLines(c, df, pad, y, 1.3, '#4A2340', 600) + 20 * u;
      }
      if (menu && d.note && cTop - y > 70 * u) { var nf2 = fit(c, d.note, colW, 2, 24 * u, 16 * u, 500); c.globalAlpha = 0.85; drawLines(c, nf2, pad, y, 1.3, '#4A2340', 500); c.globalAlpha = 1; }
      if (contactH) {
        c.strokeStyle = gold; c.globalAlpha = 0.6; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(pad, cTop - 12 * u); c.lineTo(pad + colW * 0.9, cTop - 12 * u); c.stroke(); c.globalAlpha = 1;
        contactBlock(c, d, pad, cTop, colW, cSize, plum, plum, '#FFFFFF', true);
      }
      // bottom strip: delivery or place on the left, occasions / order line on the right
      var sy = H - stripH; c.fillStyle = plum; c.fillRect(0, sy, W, stripH); c.fillStyle = gold; c.fillRect(0, sy, W, 5 * u);
      var deliv = /nationwide|deliver|dispatch|ship/i.test((d.place || '') + ' ' + (d.note || '') + ' ' + (d.details || '') + ' ' + (d.offer || ''));
      var leftT = deliv ? 'Delivery available' : (d.offer || 'Order today'), half = W / 2;
      c.font = '400 ' + (tall ? 62 : 52) * u + 'px ' + SCRIPT; c.fillStyle = gold; c.textAlign = 'center';
      var ls = (tall ? 62 : 52) * u; while (c.measureText(leftT).width > half - 60 * u && ls > 26 * u) { ls -= 2 * u; c.font = '400 ' + ls + 'px ' + SCRIPT; }
      c.fillText(leftT, half / 2, sy + stripH / 2 + ls * 0.32);
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(half, sy + 24 * u); c.lineTo(half, sy + stripH - 20 * u); c.stroke();
      var rt1 = d.phones && d.phones.length ? 'Order on WhatsApp' : 'Perfect for every occasion', rt2 = d.phones && d.phones.length ? d.phones[0] : 'Birthdays · Weddings · Events';
      c.font = '700 ' + 28 * u + 'px ' + BODY; c.fillStyle = '#FFFFFF'; c.fillText(rt1, half * 1.5, sy + stripH / 2 - 6 * u, half - 50 * u);
      c.font = '600 ' + 24 * u + 'px ' + BODY; c.fillStyle = gold; c.fillText(rt2, half * 1.5, sy + stripH / 2 + 30 * u, half - 50 * u); c.textAlign = 'left';
    } finally { FONT = FB; }
    if (!menu && d.offer && hasPics) offerBadge(c, t, d.offer, px + pw - 30 * u, top + 60 * u, 90 * u);
  }
  // ---------- "Product showcase": logo + name top left, "OUR Products" top right, category cards with icons down
  // the left (name + a short line each), product photos on shelves on the right, a round badge, and a footer bar
  // with WhatsApp, the main social handle and a thank-you. For perfumes, beauty, shops and any product range.
  // "Perfumes - Luxury scents that last" → { name: 'Perfumes', desc: 'Luxury scents that last' }; prices stay with the name.
  function splitItem(it) {
    it = String(it || '').trim();
    if (/[-–—:]\s*(?:from\s+)?₦\s?[\d,]+(?:\s*\/\s*\w+)?\s*$/i.test(it)) return { name: it, desc: '' };
    var m = it.match(/^(.{2,32}?)\s*(?::|\s[-–—]\s|[–—])\s*(.{6,})$/);
    return m ? { name: m[1].trim(), desc: m[2].trim() } : { name: it, desc: '' };
  }
  function itemKind(s) {
    s = String(s || '').toLowerCase();
    var map = [['spray', /spray|mist/], ['rollon', /roll-?ons?\b|deodor|stick/], ['bottle', /perfume|fragrance|scent|cologne|oud|attar|oil perfume/], ['gift', /gift|hamper|set|package|bundle|box|souvenir/],
      ['cake', /cake|cupcake|pastr|bread|doughnut|pie|cookie|chin/], ['cup', /drink|juice|zobo|smoothie|water|coffee|tea|parfait|yoghurt|wine/], ['shoe', /shoe|sneaker|slipper|heel|sandal|boot/],
      ['bag', /bag|purse|wallet|luggage/], ['shirt', /dress|cloth|shirt|wear|gown|ankara|fabric|kaftan|jean|top|skirt|abaya|hijab/], ['jar', /cream|lotion|skin|soap|serum|butter|scrub|body|oil|cosmetic|makeup/],
      ['plate', /food|rice|meal|chops|grill|soup|stew|small chops|catering|kitchen|snack/], ['phone', /phone|gadget|laptop|charger|accessor/]];
    for (var i = 0; i < map.length; i++) if (map[i][1].test(s)) return map[i][0];
    return 'star';
  }
  function itemIcon(c, k, x, y, r, col) {
    c.save(); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = r * 0.09; c.lineJoin = 'round';
    if (k === 'bottle') { rr(c, x - r * 0.42, y - r * 0.12, r * 0.84, r * 0.78, r * 0.18); c.fill(); c.fillRect(x - r * 0.12, y - r * 0.34, r * 0.24, r * 0.22); rr(c, x - r * 0.24, y - r * 0.6, r * 0.48, r * 0.26, r * 0.06); c.fill(); }
    else if (k === 'spray') { rr(c, x - r * 0.3, y - r * 0.1, r * 0.6, r * 0.78, r * 0.12); c.fill(); c.fillRect(x - r * 0.1, y - r * 0.3, r * 0.2, r * 0.2); rr(c, x - r * 0.2, y - r * 0.5, r * 0.4, r * 0.2, r * 0.05); c.fill(); c.lineWidth = r * 0.06; for (var s = -1; s <= 1; s++) { c.beginPath(); c.moveTo(x + r * 0.32, y - r * 0.42 + s * r * 0.1); c.lineTo(x + r * 0.62, y - r * 0.42 + s * r * 0.2); c.stroke(); } }
    else if (k === 'rollon') { rr(c, x - r * 0.28, y - r * 0.2, r * 0.56, r * 0.86, r * 0.12); c.fill(); c.beginPath(); c.arc(x, y - r * 0.2, r * 0.28, Math.PI, 0); c.fill(); }
    else if (k === 'gift') { c.fillRect(x - r * 0.5, y - r * 0.12, r, r * 0.74); c.fillRect(x - r * 0.58, y - r * 0.34, r * 1.16, r * 0.24); c.lineWidth = r * 0.1; c.beginPath(); c.ellipse(x - r * 0.2, y - r * 0.48, r * 0.2, r * 0.12, -0.4, 0, Math.PI * 2); c.ellipse(x + r * 0.2, y - r * 0.48, r * 0.2, r * 0.12, 0.4, 0, Math.PI * 2); c.stroke(); c.globalCompositeOperation = 'destination-out'; c.fillRect(x - r * 0.06, y - r * 0.34, r * 0.12, r * 0.96); c.restore(); return; }
    else if (k === 'cake') { rr(c, x - r * 0.55, y - r * 0.05, r * 1.1, r * 0.6, r * 0.08); c.fill(); rr(c, x - r * 0.38, y - r * 0.4, r * 0.76, r * 0.32, r * 0.08); c.fill(); c.fillRect(x - r * 0.04, y - r * 0.66, r * 0.08, r * 0.22); }
    else if (k === 'cup') { c.beginPath(); c.moveTo(x - r * 0.4, y - r * 0.45); c.lineTo(x + r * 0.4, y - r * 0.45); c.lineTo(x + r * 0.28, y + r * 0.6); c.lineTo(x - r * 0.28, y + r * 0.6); c.closePath(); c.fill(); c.fillRect(x + r * 0.05, y - r * 0.75, r * 0.08, r * 0.32); }
    else if (k === 'shoe') { c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.35); c.lineTo(x - r * 0.6, y - r * 0.35); c.lineTo(x - r * 0.2, y - r * 0.35); c.quadraticCurveTo(x - r * 0.05, y, x + r * 0.4, y + r * 0.02); c.quadraticCurveTo(x + r * 0.65, y + r * 0.1, x + r * 0.62, y + r * 0.35); c.closePath(); c.fill(); }
    else if (k === 'bag') { rr(c, x - r * 0.5, y - r * 0.2, r, r * 0.8, r * 0.1); c.fill(); c.beginPath(); c.arc(x, y - r * 0.2, r * 0.26, Math.PI, 0); c.stroke(); }
    else if (k === 'shirt') { c.beginPath(); c.moveTo(x - r * 0.2, y - r * 0.55); c.lineTo(x - r * 0.62, y - r * 0.32); c.lineTo(x - r * 0.46, y); c.lineTo(x - r * 0.32, y - r * 0.08); c.lineTo(x - r * 0.32, y + r * 0.6); c.lineTo(x + r * 0.32, y + r * 0.6); c.lineTo(x + r * 0.32, y - r * 0.08); c.lineTo(x + r * 0.46, y); c.lineTo(x + r * 0.62, y - r * 0.32); c.lineTo(x + r * 0.2, y - r * 0.55); c.quadraticCurveTo(x, y - r * 0.3, x - r * 0.2, y - r * 0.55); c.fill(); }
    else if (k === 'jar') { rr(c, x - r * 0.48, y - r * 0.15, r * 0.96, r * 0.7, r * 0.14); c.fill(); rr(c, x - r * 0.52, y - r * 0.42, r * 1.04, r * 0.22, r * 0.06); c.fill(); }
    else if (k === 'plate') { c.beginPath(); c.arc(x, y + r * 0.15, r * 0.55, Math.PI, 0); c.closePath(); c.fill(); c.fillRect(x - r * 0.68, y + r * 0.2, r * 1.36, r * 0.1); c.fillRect(x - r * 0.05, y - r * 0.55, r * 0.1, r * 0.18); }
    else if (k === 'phone') { rr(c, x - r * 0.3, y - r * 0.55, r * 0.6, r * 1.1, r * 0.1); c.fill(); }
    else { c.beginPath(); for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 2, rad = i % 2 ? r * 0.2 : r * 0.62; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); c.fill(); }
    c.restore();
  }
  function waIcon(c, x, y, r, bg, fg) {
    c.save(); c.fillStyle = bg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = fg; c.fillStyle = fg; c.lineWidth = r * 0.12;
    c.beginPath(); c.arc(x, y, r * 0.52, Math.PI * 0.75, Math.PI * 2.6); c.lineTo(x - r * 0.55, y + r * 0.58); c.closePath(); c.stroke();
    c.beginPath(); c.arc(x - r * 0.08, y - r * 0.02, r * 0.17, Math.PI * 0.6, Math.PI * 1.4); c.stroke(); c.restore();
  }
  function showcase(c, W, H, d, t, menu) {
    var u = W / 1080, pad = 46 * u, tall = H / W > 1.5, sq = H / W < 1.1;
    var own = t && t.name === 'Their colours';
    var navy = own ? t.bg : '#13234B', gold = own ? t.accent : '#C9A24B', cream = own ? (t.light || '#FBF8F2') : '#FBF8F2';
    var deep = lum(navy) > 0.45 ? '#1F2937' : navy, onNavy = onColour(navy);
    var SCRIPT = '"Great Vibes", "Playfair Display", Georgia, serif', SERIFF = '"Playfair Display", Georgia, serif', BODY = '"Montserrat", "Poppins", Inter, Arial, sans-serif';
    // soft light background with a glow and a few gold curves
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.55, cream); g.addColorStop(1, '#EFE8DC'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rg = c.createRadialGradient(W * 0.72, H * 0.45, 0, W * 0.72, H * 0.45, W * 0.6); rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.fillStyle = navy; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.2, 0); c.quadraticCurveTo(W * 0.06, H * 0.03, 0, H * 0.09); c.closePath(); c.fill();
    c.strokeStyle = gold; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(W * 0.24, 0); c.quadraticCurveTo(W * 0.08, H * 0.04, 0, H * 0.12); c.stroke();
    c.fillStyle = navy; c.beginPath(); c.moveTo(W, H * 0.62); c.quadraticCurveTo(W * 0.9, H * 0.72, W * 0.93, H); c.lineTo(W, H); c.closePath(); c.globalAlpha = 0.9; c.fill(); c.globalAlpha = 1;
    var FB = FONT; FONT = BODY;
    try {
      var footH = (tall ? 150 : sq ? 104 : 124) * u, hdrH = (tall ? 360 : sq ? 230 : 290) * u, bodyBottom = H - footH - 24 * u;
      var raw = menu ? (d.items || []) : (d.services || []), descs = menu ? (d.descs || []) : [];
      var allItems = raw.map(function (it, i) { var s = splitItem(it); return { name: s.name, desc: descs[i] || s.desc }; }), cap = tall ? 8 : sq ? 5 : 6;
      var compact = allItems.length > cap, items = compact ? allItems.slice(0, 24) : allItems;
      var pics = (menu ? (d.menuPhotos || []).map(function (x) { return x.img; }) : (d.photos || [])).filter(Boolean).slice(0, 9);
      var leftW = pics.length ? W * 0.45 - pad : W - pad * 2, rx = W * 0.48, rw = W - rx - pad * 0.7;
      // --- top left: logo, name, small line, tagline
      var y = (tall ? 70 : 54) * u, cx = pad + leftW / 2;
      if (d.logo) {
        var lh = (tall ? 150 : sq ? 92 : 120) * u, lw = Math.min(leftW * 0.6, lh * d.logo.width / d.logo.height), lhh = lw * d.logo.height / d.logo.width;
        c.drawImage(d.logo, cx - lw / 2, y, lw, lhh); y += lhh + 10 * u;
      }
      var words = String(d.business || 'Your business').trim().split(/\s+/), bp = brandParts(d.business || 'Your business');
      var big = bp.small ? bp.big : words.length > 1 ? words.slice(0, -1).join(' ') : words[0], small = bp.small || (words.length > 1 ? words[words.length - 1] : '');
      var bf = fit(c, big.toUpperCase(), leftW, 1, (tall ? 76 : 62) * u, 30 * u, 700); c.font = '700 ' + bf.size + 'px ' + SERIFF; c.fillStyle = deep; c.textAlign = 'center'; c.fillText(bf.lines[0], cx, y + bf.size * 0.85);
      while (c.measureText(bf.lines[0]).width > leftW && bf.size > 24 * u) { bf.size -= 2 * u; c.font = '700 ' + bf.size + 'px ' + SERIFF; }
      y += bf.size * 1.05;
      if (small) {
        var st = small.toUpperCase().split('').join(String.fromCharCode(8202, 8202)), ss = 24 * u; c.font = '600 ' + ss + 'px ' + BODY;
        while (c.measureText(st).width > leftW * 0.6 && ss > 12 * u) { ss -= 1 * u; c.font = '600 ' + ss + 'px ' + BODY; }
        var sw = c.measureText(st).width; c.fillStyle = deep; c.fillText(st, cx, y + ss);
        c.strokeStyle = gold; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(cx - sw / 2 - 70 * u, y + ss * 0.65); c.lineTo(cx - sw / 2 - 14 * u, y + ss * 0.65); c.moveTo(cx + sw / 2 + 14 * u, y + ss * 0.65); c.lineTo(cx + sw / 2 + 70 * u, y + ss * 0.65); c.stroke();
        y += ss * 1.6;
      }
      var tag = d.note && d.note.length <= 48 ? d.note.replace(/[.…]+$/, '') : (menu ? '' : (d.tagline || ''));
      if (tag) { var ts = (tall ? 44 : 36) * u; c.font = '400 ' + ts + 'px ' + SCRIPT; while (c.measureText(tag).width > leftW && ts > 20 * u) { ts -= 2 * u; c.font = '400 ' + ts + 'px ' + SCRIPT; } c.fillStyle = deep; c.fillText(tag, cx, y + ts * 0.85); y += ts * 1.1; }
      c.textAlign = 'left';
      var bodyTop = Math.max(y + 24 * u, hdrH);
      // --- top right: "OUR" + script word
      var lt = menu ? (d.listTitle && !/^contact us for$/i.test(d.listTitle) ? d.listTitle : 'Our Products') : 'Our Products';
      var om = lt.match(/^(our|the|my)\s+(.+)$/i), w1 = om ? om[1].toUpperCase() : '', w2 = om ? om[2] : lt;
      w2 = w2.charAt(0).toUpperCase() + w2.slice(1);
      var hx = pics.length ? rx + rw / 2 : W / 2;
      if (pics.length || !menu) {
        var o1 = (tall ? 150 : sq ? 96 : 124) * u; c.font = '700 ' + o1 + 'px ' + SERIFF; c.fillStyle = deep; c.textAlign = 'center';
        var hy = 40 * u + o1 * 0.85;
        if (w1) c.fillText(w1, hx, hy);
        var s2 = (tall ? 120 : sq ? 80 : 100) * u; c.font = '400 ' + s2 + 'px ' + SCRIPT; while (c.measureText(w2).width > rw && s2 > 40 * u) { s2 -= 3 * u; c.font = '400 ' + s2 + 'px ' + SCRIPT; }
        c.fillStyle = gold; c.fillText(w2, hx + (w1 ? 20 * u : 0), w1 ? hy + s2 * 0.9 : hy);
        c.strokeStyle = gold; c.lineWidth = 2 * u; var lw2 = c.measureText(w2).width; c.beginPath(); c.moveTo(hx - lw2 * 0.4, hy + s2 * 1.12); c.quadraticCurveTo(hx, hy + s2 * 1.2, hx + lw2 * 0.55, hy + s2 * 1.08); c.stroke();
        c.textAlign = 'left';
        if (!menu && d.headline && pics.length) bodyTop = Math.max(bodyTop, hy + s2);
        bodyTop = Math.max(bodyTop, (w1 ? hy + s2 * 0.9 : hy) + 56 * u);
      }
      // --- right: product photos standing on shelves
      if (pics.length) {
        var rows = pics.length <= 2 ? 1 : pics.length <= 4 ? 2 : 3, per = Math.ceil(pics.length / rows), shelfGap = 26 * u;
        var areaH = bodyBottom - bodyTop, rowH = (areaH - shelfGap * (rows - 1)) / rows;
        c.save(); c.fillStyle = 'rgba(255,255,255,.7)'; c.shadowColor = 'rgba(19,35,75,.12)'; c.shadowBlur = 30 * u; rr(c, rx - 10 * u, bodyTop - 16 * u, rw + 20 * u, areaH + 32 * u, 40 * u); c.fill(); c.restore();
        for (var r = 0; r < rows; r++) {
          var rowPics = pics.slice(r * per, r * per + per); if (!rowPics.length) break;
          var ry = bodyTop + r * (rowH + shelfGap), n = rowPics.length, gap = 16 * u, pw = (rw - gap * (n - 1) - 20 * u) / n, ph = rowH - 26 * u;
          // the shelf: a soft gold-edged ellipse
          c.save(); c.fillStyle = '#FFFFFF'; c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 6 * u; c.beginPath(); c.ellipse(rx + rw / 2, ry + ph + 8 * u, rw / 2, 18 * u, 0, 0, Math.PI * 2); c.fill(); c.restore();
          c.strokeStyle = gold; c.lineWidth = 2.5 * u; c.beginPath(); c.ellipse(rx + rw / 2, ry + ph + 8 * u, rw / 2, 18 * u, 0, 0, Math.PI); c.stroke();
          rowPics.forEach(function (im, k) {
            var px = rx + 10 * u + k * (pw + gap);
            c.save(); c.shadowColor = 'rgba(0,0,0,.22)'; c.shadowBlur = 14 * u; c.shadowOffsetY = 6 * u; c.fillStyle = '#FFFFFF'; rr(c, px, ry, pw, ph, 18 * u); c.fill(); c.restore();
            c.save(); rr(c, px + 4 * u, ry + 4 * u, pw - 8 * u, ph - 8 * u, 15 * u); c.clip(); cover(c, im, px + 4 * u, ry + 4 * u, pw - 8 * u, ph - 8 * u, 0.45); c.restore();
          });
        }
      }
      // --- left: category cards (or the headline and details when there is no list)
      var deliv = /nationwide|deliver|dispatch|ship/i.test([d.place, d.note, d.details, d.offer].join(' '));
      var place = String(d.place || '').replace(/[·,]?\s*(we\s+)?deliver[^·,]*|[·,]?\s*(available\s+)?nationwide/ig, '').replace(/^available\s+in\s+/i, '').replace(/^[\s·,]+|[\s·,]+$/g, '');
      var featH = (place || deliv) ? (place && deliv ? 150 : 80) * u : 0;
      var listTop = bodyTop, listBottom = bodyBottom - featH - (featH ? 20 * u : 0) - (menu && d.note && d.note.length > 48 ? 70 * u : 0);
      if (items.length && compact) {
        // A long menu: every item in a neat 2-column list on a navy panel (cards would cut it short).
        c.save(); c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = 14 * u; c.fillStyle = navy; rr(c, pad, listTop, leftW, listBottom - listTop, 26 * u); c.fill(); c.restore();
        c.strokeStyle = gold; c.globalAlpha = 0.55; c.lineWidth = 1.5 * u; rr(c, pad + 8 * u, listTop + 8 * u, leftW - 16 * u, listBottom - listTop - 16 * u, 20 * u); c.stroke(); c.globalAlpha = 1;
        var panelH = listBottom - listTop - 50 * u, cols = items.length * 46 * u <= panelH ? 1 : 2, rowsN = Math.ceil(items.length / cols), colW2 = (leftW - 60 * u) / cols, rowH = panelH / rowsN;
        var fsz = Math.min((cols === 1 ? 32 : 26) * u, rowH * 0.55), names = items.map(function (it) { return it.name; });
        c.font = '600 ' + fsz + 'px ' + BODY; while (fsz > 18 * u && names.filter(function (n) { return c.measureText(n).width > colW2 - 34 * u; }).length > names.length / 3) { fsz -= 1 * u; c.font = '600 ' + fsz + 'px ' + BODY; }
        names.forEach(function (n, k) {
          var cx3 = pad + 30 * u + Math.floor(k / rowsN) * colW2, cy3 = listTop + 25 * u + (k % rowsN) * rowH + rowH / 2;
          c.fillStyle = gold; c.beginPath(); c.moveTo(cx3 + 7 * u, cy3 - 7 * u); c.lineTo(cx3 + 14 * u, cy3); c.lineTo(cx3 + 7 * u, cy3 + 7 * u); c.lineTo(cx3, cy3); c.closePath(); c.fill();
          c.fillStyle = onNavy; c.fillText(n, cx3 + 26 * u, cy3 + fsz * 0.35, colW2 - 34 * u);
        });
      } else if (items.length) {
        var gapC = 16 * u, cardH = Math.min((tall ? 215 : 140) * u, (listBottom - listTop - gapC * (items.length - 1)) / items.length), ir = cardH * 0.46;
        items.forEach(function (it, i) {
          var cy = listTop + i * (cardH + gapC), x0 = pad + ir * 0.9, cw = leftW - ir * 0.9;
          c.save(); c.shadowColor = 'rgba(0,0,0,.22)'; c.shadowBlur = 12 * u; c.shadowOffsetY = 5 * u; c.fillStyle = navy; rr(c, x0, cy, cw, cardH, cardH * 0.22); c.fill(); c.restore();
          c.strokeStyle = gold; c.globalAlpha = 0.55; c.lineWidth = 1.5 * u; rr(c, x0 + 5 * u, cy + 5 * u, cw - 10 * u, cardH - 10 * u, cardH * 0.18); c.stroke(); c.globalAlpha = 1;
          var icx = pad + ir, icy = cy + cardH / 2;
          c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 10 * u; c.fillStyle = navy; c.beginPath(); c.arc(icx, icy, ir, 0, Math.PI * 2); c.fill(); c.restore();
          var ringG = c.createLinearGradient(icx - ir, icy - ir, icx + ir, icy + ir); ringG.addColorStop(0, '#F3DDA0'); ringG.addColorStop(0.5, gold); ringG.addColorStop(1, '#8C6A22');
          c.strokeStyle = ringG; c.lineWidth = ir * 0.12; c.beginPath(); c.arc(icx, icy, ir * 0.9, 0, Math.PI * 2); c.stroke();
          itemIcon(c, itemKind(it.name + ' ' + it.desc), icx, icy, ir * 0.62, gold);
          var tx = icx + ir + 18 * u, tw = x0 + cw - tx - 16 * u;
          c.font = '700 10px ' + SERIFF; var nmax = Math.min(40 * u, cardH * 0.3), nf = fit(c, it.name.toUpperCase(), tw, 1, nmax, nmax * 0.72, 700); c.font = '700 ' + nf.size + 'px ' + SERIFF; if (c.measureText(nf.lines[0]).width > tw) nf = fit(c, it.name.toUpperCase(), tw, 2, nmax * 0.85, 14 * u, 700);
          var df = it.desc ? fit(c, it.desc, tw, 3, Math.min(25 * u, cardH * 0.19), 13 * u, 500) : null;
          var blockH = nf.size * (1 + (nf.lines.length - 1) * 1.05) + (df ? 8 * u + df.size * (1 + (df.lines.length - 1) * 1.25) : 0);
          while (df && blockH > cardH - 20 * u && df.size > 12 * u) { df = fit(c, it.desc, tw, 3, df.size - 1 * u, 11 * u, 500); blockH = nf.size * (1 + (nf.lines.length - 1) * 1.05) + 8 * u + df.size * (1 + (df.lines.length - 1) * 1.25); }
          var ty = cy + (cardH - blockH) / 2;
          c.font = '700 ' + nf.size + 'px ' + SERIFF; c.fillStyle = onNavy;
          nf.lines.forEach(function (l, k) { c.fillText(l, tx, ty + nf.size * (0.85 + k * 1.05), tw); });
          if (df) { var dy = ty + nf.size * (1 + (nf.lines.length - 1) * 1.05) + 8 * u; c.font = '500 ' + df.size + 'px ' + BODY; c.fillStyle = onNavy; c.globalAlpha = 0.85; df.lines.forEach(function (l, k) { c.fillText(l, tx, dy + df.size * (0.9 + k * 1.25)); }); c.globalAlpha = 1; }
        });
      } else {
        // no list: the headline and details, centred in the space, with a gold rule between
        var hf = fit(c, d.headline || 'Your offer', leftW, 4, (tall ? 110 : 92) * u, 30 * u, 700);
        var ddf = d.details ? fit(c, d.details.replace(/\n/g, ' · '), leftW, 5, (tall ? 42 : 36) * u, 18 * u, 500) : null;
        var hh = hf.size * (1 + (hf.lines.length - 1) * 1.08), dh = ddf ? 50 * u + ddf.size * (1 + (ddf.lines.length - 1) * 1.35) : 0;
        var y0 = listTop + Math.max(0, (listBottom - listTop - hh - dh) / 2);
        c.font = '700 ' + hf.size + 'px ' + SERIFF; c.fillStyle = deep;
        hf.lines.forEach(function (l, k) { c.fillText(l, pad, y0 + hf.size * (0.9 + k * 1.08), leftW); });
        if (ddf) { var yy = y0 + hh + 22 * u; c.fillStyle = gold; c.fillRect(pad, yy, 90 * u, 5 * u); drawLines(c, ddf, pad, yy + 14 * u, 1.35, '#374151', 500); }
      }
      // --- place and delivery lines
      var fy = bodyBottom - featH + 6 * u;
      function feat(kind, a, b) {
        var r0 = 30 * u, ix = pad + r0;
        c.save(); c.fillStyle = deep; c.strokeStyle = deep; c.lineWidth = 4 * u;
        if (kind === 'place') { c.beginPath(); c.arc(ix, fy + r0 * 0.75, r0 * 0.55, Math.PI, 0); c.lineTo(ix, fy + r0 * 1.9); c.closePath(); c.stroke(); c.beginPath(); c.arc(ix, fy + r0 * 0.75, r0 * 0.2, 0, Math.PI * 2); c.fill(); }
        else { c.strokeRect(ix - r0 * 0.9, fy + r0 * 0.5, r0 * 1.1, r0 * 0.9); c.beginPath(); c.moveTo(ix + r0 * 0.2, fy + r0 * 0.8); c.lineTo(ix + r0 * 0.7, fy + r0 * 0.8); c.lineTo(ix + r0 * 0.95, fy + r0 * 1.1); c.lineTo(ix + r0 * 0.95, fy + r0 * 1.4); c.lineTo(ix + r0 * 0.2, fy + r0 * 1.4); c.stroke(); c.beginPath(); c.arc(ix - r0 * 0.5, fy + r0 * 1.55, r0 * 0.18, 0, Math.PI * 2); c.arc(ix + r0 * 0.6, fy + r0 * 1.55, r0 * 0.18, 0, Math.PI * 2); c.fill(); }
        c.restore();
        var fw = leftW - r0 * 2.6; c.fillStyle = deep;
        var af = fit(c, a, fw, 1, 24 * u, 14 * u, 600); c.font = '600 ' + af.size + 'px ' + BODY; c.fillText(af.lines[0], pad + r0 * 2.4, fy + af.size + 4 * u);
        var bf2 = fit(c, b.toUpperCase(), fw, 1, 28 * u, 14 * u, 800); c.font = '800 ' + bf2.size + 'px ' + BODY; c.fillText(bf2.lines[0], pad + r0 * 2.4, fy + af.size + bf2.size + 12 * u);
        fy += 72 * u;
      }
      if (menu && d.note && !(d.note.length <= 48) && items.length) {
        var ntop = listTop + items.length * (cardH + gapC), nroom = bodyBottom - featH - ntop - 10 * u;
        if (nroom > 40 * u) { var nf3 = fit(c, d.note, leftW, 2, 24 * u, 15 * u, 500); c.font = 'italic 500 ' + nf3.size + 'px ' + SERIFF; c.fillStyle = deep; nf3.lines.forEach(function (l, k) { c.fillText(l, pad, ntop + 6 * u + nf3.size * (0.9 + k * 1.25), leftW); }); }
      }
      if (place) feat('place', 'AVAILABLE IN', place);
      if (deliv) feat('truck', 'WE DELIVER', /nationwide/i.test([d.place, d.note, d.details].join(' ')) ? 'Nationwide' : 'To your door');
      // --- round badge over the photos
      var badge = d.offer || 'Perfect for every occasion', br = (tall ? 120 : sq ? 84 : 104) * u, bx = W - pad * 0.7 - br, by = bodyBottom - br * 0.75;
      if (pics.length || d.offer) {
        c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 20 * u; c.fillStyle = navy; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill(); c.restore();
        c.strokeStyle = gold; c.lineWidth = 4 * u; c.beginPath(); c.arc(bx, by, br * 0.9, 0, Math.PI * 2); c.stroke();
        var bfit = fit(c, badge.toUpperCase(), br * 1.4, 4, br * (badge.length <= 12 ? 0.36 : 0.24), br * 0.12, 700); c.font = '700 ' + bfit.size + 'px ' + SERIFF; c.fillStyle = onNavy; c.textAlign = 'center';
        var bh = bfit.size * 1.15 * bfit.lines.length; bfit.lines.forEach(function (l, k) { c.fillText(l, bx, by - bh / 2 + bfit.size * (0.9 + k * 1.15) - br * 0.06); });
        c.strokeStyle = gold; c.lineWidth = 2.5 * u; c.beginPath(); var hy2 = by + bh / 2 + br * 0.1, hs = br * 0.1; c.moveTo(bx, hy2 + hs); c.bezierCurveTo(bx - hs * 2, hy2 - hs * 0.4, bx - hs * 0.6, hy2 - hs * 1.6, bx, hy2 - hs * 0.4); c.bezierCurveTo(bx + hs * 0.6, hy2 - hs * 1.6, bx + hs * 2, hy2 - hs * 0.4, bx, hy2 + hs); c.stroke();
        c.textAlign = 'left';
      }
      // --- footer: WhatsApp | main social | thank you
      var fyb = H - footH; c.fillStyle = navy; c.fillRect(0, fyb, W, footH); c.fillStyle = gold; c.fillRect(0, fyb, W, 4 * u);
      var cells = [];
      if (d.phones && d.phones.length) cells.push({ k: 'wa', a: 'WHATSAPP', b: d.phones.slice(0, 2).join(' · ') });
      var soc = (d.socials || [])[0];
      if (soc) { var sp = socialSplit(soc), nm = { ig: 'INSTAGRAM', tt: 'TIKTOK', fb: 'FACEBOOK', x: 'X', yt: 'YOUTUBE', snap: 'SNAPCHAT' }[sp.k] || 'FOLLOW US'; cells.push({ k: sp.k, a: nm, b: sp.t }); }
      var soc2 = (d.socials || [])[1];
      if (soc2) { var sp2 = socialSplit(soc2), nm2 = { ig: 'INSTAGRAM', tt: 'TIKTOK', fb: 'FACEBOOK', x: 'X', yt: 'YOUTUBE', snap: 'SNAPCHAT' }[sp2.k] || 'FOLLOW US'; cells.push({ k: sp2.k, a: nm2, b: sp2.t }); }
      else cells.push({ k: 'thanks' });
      var cw2 = W / cells.length, mid = fyb + footH / 2 + 2 * u;
      cells.forEach(function (cl, i) {
        var x0 = i * cw2;
        if (i) { c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(x0, fyb + 22 * u); c.lineTo(x0, fyb + footH - 18 * u); c.stroke(); }
        if (cl.k === 'thanks') {
          var tt = 'Thank you for choosing us', ts2 = (tall ? 50 : 40) * u; c.font = '400 ' + ts2 + 'px ' + SCRIPT; c.fillStyle = gold; c.textAlign = 'center';
          var lines2 = c.measureText(tt).width > cw2 - 40 * u ? ['Thank you for', 'choosing us'] : [tt];
          lines2.forEach(function (l, k) { c.fillText(l, x0 + cw2 / 2, mid + ts2 * 0.3 + (k - (lines2.length - 1) / 2) * ts2 * 0.95); }); c.textAlign = 'left'; return;
        }
        var ir2 = (tall ? 34 : 28) * u, ix2 = x0 + 34 * u + ir2;
        if (cl.k === 'wa') waIcon(c, ix2, mid, ir2, 'rgba(0,0,0,0)', onNavy); else { c.save(); c.lineWidth = 3 * u; icon(c, cl.k, ix2, mid, ir2, 'rgba(0,0,0,0)', onNavy); c.restore(); }
        var tx2 = ix2 + ir2 + 16 * u, tw2 = x0 + cw2 - tx2 - 14 * u;
        var a = fit(c, cl.a, tw2, 1, 20 * u, 12 * u, 600), b = fit(c, cl.b, tw2, 1, (tall ? 38 : 32) * u, 14 * u, 700);
        c.fillStyle = onNavy; c.font = '600 ' + a.size + 'px ' + BODY; c.globalAlpha = 0.85; c.fillText(a.lines[0], tx2, mid - 4 * u); c.globalAlpha = 1;
        c.font = '700 ' + b.size + 'px ' + BODY; c.fillText(b.lines[0], tx2, mid + b.size + 2 * u, tw2);
      });
    } finally { FONT = FB; c.textAlign = 'left'; }
  }
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
        var cols = tall ? Math.min(3, tiles.length) : tiles.length === 4 ? 2 : Math.min(3, tiles.length), rows = Math.ceil(tiles.length / cols);
        var gh = tall ? H * 0.40 : rows > 1 ? H * 0.34 : H * 0.25;
        // leave the price list room for readable rows (and the note/footer below it), shrinking the photos if needed
        var barH0 = (d.phones.length || d.socials.length || d.place ? 64 * u + (d.socials.length || d.place ? 54 * u : 0) : 0);
        c.font = '500 ' + 26 * u + 'px ' + FONT;
        var noteH0 = d.note ? wrapText(c, d.note, W - pad * 2 - 40 * u).length * 26 * u * 1.4 + 30 * u : 0;
        var listNeed = d.items.length ? Math.ceil(d.items.length / (tall ? 2 : 3)) * 24 * u * 1.55 + 60 * u : 0;
        gh = Math.max(H * 0.18, Math.min(gh, H - y - 40 * u - barH0 - noteH0 - listNeed - 50 * u - 20 * u));
        photoGrid(c, tiles, pad, y, W - pad * 2, gh, cols, 22 * u, t.accent, t, u);
        y += gh + 40 * u;
      }
      var barH = (d.phones.length || d.socials.length || d.place ? 64 * u + (d.socials.length || d.place ? 54 * u : 0) : 0);
      c.font = '500 ' + 26 * u + 'px ' + FONT;
      var noteLines = d.note ? wrapText(c, d.note, W - pad * 2 - 40 * u) : [], noteH = noteLines.length ? noteLines.length * 26 * u * 1.4 + 30 * u : 0;
      if (d.listTitle) { c.font = '800 ' + 26 * u + 'px ' + FONT; c.fillStyle = t.accent; c.textAlign = 'center'; c.fillText(d.listTitle.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, y + 26 * u); c.textAlign = 'left'; y += 50 * u; }
      if (d.items.length) { var avl = H - y - barH - noteH - 50 * u, fl = listFit(c, d.items, W - pad * 2, avl, (tall ? 52 : 40) * u, 18 * u, 700, tall ? 2 : 3); fl.weight = 700; fl.lh = Math.max(1.3, Math.min(2.1, avl / (fl.rows * fl.size))); y = drawList(c, d.items, pad + 10 * u, y, fl, onColour(t.bg), t.accent) + 10 * u; }
      if (noteLines.length) { c.font = 'italic 500 ' + 26 * u + 'px ' + FONT; c.fillStyle = onColour(t.bg); c.globalAlpha = 0.85; c.textAlign = 'center'; noteLines.forEach(function (l, i) { c.fillText(l, W / 2, y + 26 * u + i * 26 * u * 1.4); }); c.globalAlpha = 1; c.textAlign = 'left'; }
      if (barH) {
        c.fillStyle = t.accent; c.fillRect(0, H - barH, W, barH);
        c.fillStyle = onColour(t.accent); c.textAlign = 'center';
        c.font = '800 ' + 32 * u + 'px ' + FONT; c.fillText(d.phones.length ? 'Call / WhatsApp: ' + d.phones.join(' · ') : '', W / 2, H - barH + 44 * u);
        socialLine(c, d.socials, d.place, W / 2, H - barH + 96 * u, 30 * u, onColour(t.accent), W - pad * 2);
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
        socialLine(c, d.socials, d.place, W / 2, H - barH + 94 * u, 28 * u, t.accent, W - pad * 2);
        c.textAlign = 'left';
      }
    } },
    { name: 'Sweet boutique', draw: function (c, W, H, d, t) { boutique(c, W, H, d, t, true); } },
    { name: 'Product showcase', draw: function (c, W, H, d, t) { showcase(c, W, H, d, t, true); } }
  ];



  // ---------- Look library: fonts, textures and finishing touches, picked to suit the business ----------
  var LOOK_FONTS = [
    ['Playfair Display', 700, 'playfair-display-latin-700-normal'], ['Playfair Display', 900, 'playfair-display-latin-900-normal'],
    ['Poppins', 500, 'poppins-latin-500-normal'], ['Poppins', 700, 'poppins-latin-700-normal'], ['Poppins', 800, 'poppins-latin-800-normal'],
    ['Montserrat', 500, 'montserrat-latin-500-normal'], ['Montserrat', 800, 'montserrat-latin-800-normal'], ['Montserrat', 900, 'montserrat-latin-900-normal'],
    ['Bebas Neue', 400, 'bebas-neue-latin-400-normal'], ['Great Vibes', 400, 'great-vibes-latin-400-normal'], ['DM Serif Display', 400, 'dm-serif-display-latin-400-normal'],
    ['Oswald', 500, 'oswald-latin-500-normal'], ['Oswald', 700, 'oswald-latin-700-normal'], ['Lora', 500, 'lora-latin-500-normal'], ['Lora', 700, 'lora-latin-700-normal'], ['Fredoka', 600, 'fredoka-latin-600-normal'], ['Fredoka', 700, 'fredoka-latin-700-normal'],
    ['Cinzel', 600, 'cinzel-latin-600-normal'], ['Cormorant Garamond', 500, 'cormorant-garamond-latin-500-normal'], ['Cormorant Garamond', 600, 'cormorant-garamond-latin-600-normal'],
  ];
  var looksFontsReady = null;
  function loadLookFonts() {
    if (looksFontsReady) return looksFontsReady;
    if (!window.FontFace || !document.fonts) return (looksFontsReady = Promise.resolve());
    looksFontsReady = Promise.all(LOOK_FONTS.map(function (f) {
      var ff = new FontFace(f[0], 'url(/assets/fonts/looks/' + f[2] + '.woff2) format("woff2")', { weight: String(f[1]) });
      return ff.load().then(function (x) { document.fonts.add(x); }).catch(function () {});
    }));
    return looksFontsReady;
  }
  var SANS = function (n) { return '"' + n + '", Inter, Arial, sans-serif'; }, SER = function (n) { return '"' + n + '", Georgia, serif'; };
  // tags: words in the order that suggest this look. theme: its own colours (used when the customer gave none).
  var LOOKS = [
    { name: 'Classic', layout: 0, font: FONT, serif: SERIF, tex: '', deco: '', tags: [] },
    { name: 'Luxury gold', layout: 3, head: SER('Playfair Display'), font: SANS('Montserrat'), serif: SER('Playfair Display'), tex: 'grain', deco: 'goldframe', theme: { bg: '#111111', accent: '#D4AF37', light: '#F8F4EA' }, tags: ['cake', 'perfume', 'jewel', 'hair', 'wig', 'beauty', 'luxury', 'fashion', 'boutique', 'event', 'real estate', 'property', 'spa', 'lash', 'nail'] },
    { name: 'Elegant script', layout: 5, head: SER('Great Vibes'), font: SANS('Poppins'), serif: SER('Great Vibes'), tex: 'paper', deco: 'flourish', theme: { bg: '#5B1A2A', accent: '#E9C46A', light: '#FBF5EC' }, tags: ['wedding', 'bridal', 'cake', 'makeup', 'beauty', 'bakery', 'event', 'decor', 'flower', 'bouquet'] },
    { name: 'Bold street', layout: 6, head: SANS('Bebas Neue'), font: SANS('Oswald'), serif: SANS('Bebas Neue'), tex: 'grain', deco: 'slashes', theme: { bg: '#141414', accent: '#FF5A1F', light: '#F2F2F2' }, tags: ['barber', 'shoe', 'sneaker', 'clothing', 'wear', 'gym', 'music', 'phone', 'gadget', 'shawarma', 'burger', 'grill', 'thrift', 'okrika'] },
    { name: 'Clean corporate', layout: 1, head: SANS('Montserrat'), font: SANS('Montserrat'), serif: SER('Lora'), tex: '', deco: 'lines', theme: { bg: '#0B3C5D', accent: '#3FC1C9', light: '#F3F7FA' }, tags: ['consult', 'finance', 'account', 'school', 'limited', 'ltd', 'law', 'legal', 'logistics', 'property', 'agency', 'tech', 'software', 'training', 'clinic', 'pharmacy', 'hospital'] },
    { name: 'Warm bakery', layout: 4, head: SER('DM Serif Display'), font: SANS('Poppins'), serif: SER('DM Serif Display'), tex: 'paper', deco: 'dots', theme: { bg: '#6B3E26', accent: '#F4A261', light: '#FFF6EC' }, tags: ['cake', 'bread', 'snack', 'chops', 'pastry', 'kitchen', 'food', 'meat pie', 'doughnut', 'chin chin', 'treat', 'bakery', 'pizza', 'cookies'] },
    { name: 'Afro print', layout: 10, head: SER('DM Serif Display'), font: SANS('Poppins'), serif: SER('DM Serif Display'), tex: 'paper', deco: 'ankara', theme: { bg: '#1B4332', accent: '#F4A300', light: '#FFF8E7' }, tags: ['ankara', 'tailor', 'fashion', 'adire', 'aso', 'native', 'african', 'culture', 'amala', 'buka', 'canteen', 'restaurant', 'event'] },
    { name: 'Fresh & natural', layout: 2, font: SANS('Poppins'), serif: SER('Lora'), tex: 'paper', deco: 'leaves', theme: { bg: '#2D6A4F', accent: '#B7E4C7', light: '#F1FAF3' }, tags: ['juice', 'zobo', 'smoothie', 'farm', 'organic', 'salad', 'skin', 'herbal', 'natural', 'soap', 'fruit', 'vegetable', 'tigernut', 'parfait', 'water'] },
    { name: 'Party pop', layout: 9, font: SANS('Poppins'), serif: SER('DM Serif Display'), tex: '', deco: 'confetti', theme: { bg: '#3A0CA3', accent: '#FFD60A', light: '#FFF9E6' }, tags: ['party', 'birthday', 'celebration', 'kids', 'balloon', 'event', 'surprise', 'money bouquet', 'gift', 'small chops'] },
    { name: 'Night glow', layout: 8, head: SANS('Montserrat'), font: SANS('Montserrat'), serif: SER('Playfair Display'), tex: 'grain', deco: 'glow', theme: { bg: '#0D0221', accent: '#FF2E88', light: '#F6F1FF' }, tags: ['club', 'lounge', 'bar', 'music', 'concert', 'show', 'night', 'drinks', 'cocktail', 'hookah', 'shawarma', 'grill', 'suya'] },
    { name: 'Royal', layout: 11, head: SER('Playfair Display'), font: SANS('Montserrat'), serif: SER('Playfair Display'), tex: 'grain', deco: 'ornate', theme: { bg: '#2B124C', accent: '#E0B354', light: '#F7F2FB' }, tags: ['church', 'wedding', 'royal', 'king', 'queen', 'gala', 'award', 'luxury', 'hotel', 'anniversary', 'coronation'] },
    { name: 'Faith & calm', layout: 5, head: SER('Playfair Display'), font: SER('Lora'), serif: SER('Playfair Display'), tex: 'paper', deco: 'rays', theme: { bg: '#2F4A3A', accent: '#9DBF9E', light: '#F4F8F3' }, tags: ['church', 'mosque', 'ministry', 'crusade', 'revival', 'prayer', 'ramadan', 'jumat', 'service', 'worship', 'fellowship', 'thanksgiving', 'easter'] },
    { name: 'Festive', layout: 7, head: SER('Playfair Display'), font: SANS('Poppins'), serif: SER('Playfair Display'), tex: '', deco: 'sparkle', theme: { bg: '#8B0000', accent: '#FFD166', light: '#FFF7EB' }, tags: ['christmas', 'xmas', 'december', 'new year', 'sallah', 'eid', 'easter', 'independence', 'valentine', 'festive', 'season', 'holiday', 'black friday', 'sale'] },
    { name: 'Sporty', layout: 6, head: SANS('Oswald'), font: SANS('Oswald'), serif: SANS('Oswald'), tex: 'grain', deco: 'speed', theme: { bg: '#0A1931', accent: '#00D1FF', light: '#EEF6FF' }, tags: ['gym', 'fitness', 'sport', 'football', 'delivery', 'logistics', 'dispatch', 'car', 'auto', 'mechanic', 'wash'] },
    { name: 'Kids fun', layout: 9, head: SANS('Fredoka'), font: SANS('Fredoka'), serif: SANS('Fredoka'), tex: '', deco: 'bubbles', theme: { bg: '#FF6B6B', accent: '#FFD23F', light: '#E3F6FF' }, tags: ['school', 'kids', 'children', 'toy', 'creche', 'lesson', 'tutor', 'baby', 'nursery', 'summer'] },
    { name: 'Minimal', layout: 5, head: SER('Playfair Display'), font: SANS('Montserrat'), serif: SER('Playfair Display'), tex: 'paper', deco: '', theme: { bg: '#3B2416', accent: '#B08D57', light: '#F7F3EC' }, tags: ['studio', 'photography', 'architect', 'interior', 'design', 'tech', 'consult', 'portfolio'] },
    { name: 'Sweet boutique', layout: 12, head: SER('Great Vibes'), font: SANS('Poppins'), serif: SER('Playfair Display'), tex: '', deco: '', theme: { bg: '#5B1E4F', accent: '#C9A227', light: '#FCEAF1' }, tags: ['cake', 'cupcake', 'bakery', 'pastr', 'clothing', 'fashion', 'boutique', 'aso ebi', 'ankara', 'beauty', 'makeup', 'lash', 'nail', 'event', 'decor', 'bouquet', 'gift'] },
    { name: 'Luxury showcase', layout: 13, head: SER('Playfair Display'), font: SANS('Montserrat'), serif: SER('Playfair Display'), tex: '', deco: '', theme: { bg: '#13234B', accent: '#C9A24B', light: '#FBF8F2' }, tags: ['perfume', 'scent', 'fragrance', 'cologne', 'oud', 'body spray', 'body mist', 'roll-on', 'cosmetic', 'skincare', 'skin care', 'cream', 'lotion', 'products', 'store', 'mart', 'collection', 'gift set'] }
  ];
  function lookByName(n) { for (var i = 0; i < LOOKS.length; i++) if (LOOKS[i].name === n) return LOOKS[i]; return LOOKS[0]; }
  // The 3 looks that suit this business best (by words in the order), different from each other.
  function suggestLooks(text) {
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    var scored = LOOKS.slice(1).map(function (L, i) { var sc = 0; L.tags.forEach(function (g) { if (t.indexOf(g) !== -1) sc += g.length > 5 ? 2 : 1; }); return { L: L, sc: sc, i: i }; })
      .sort(function (a, b) { return b.sc - a.sc || a.i - b.i; });
    var out = scored.filter(function (x) { return x.sc > 0; }).slice(0, 3).map(function (x) { return x.L.name; });
    ['Luxury gold', 'Bold street', 'Clean corporate', 'Warm bakery'].forEach(function (n) { if (out.length < 3 && out.indexOf(n) === -1) out.push(n); });
    return out;
  }
  var NOISE = null;
  function noise() {
    if (NOISE) return NOISE;
    NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 160;
    var c = NOISE.getContext('2d'), d = c.createImageData(160, 160);
    for (var i = 0; i < d.data.length; i += 4) { var v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    c.putImageData(d, 0, 0); return NOISE;
  }
  function texture(c, W, H, kind) {
    if (!kind) return;
    c.save();
    if (kind === 'grain' || kind === 'paper') {
      c.globalAlpha = kind === 'grain' ? 0.07 : 0.05; c.globalCompositeOperation = 'overlay';
      c.fillStyle = c.createPattern(noise(), 'repeat'); c.fillRect(0, 0, W, H);
    }
    if (kind === 'paper') { // soft warm edges
      c.globalCompositeOperation = 'multiply'; c.globalAlpha = 1;
      var g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,90,60,.16)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    c.restore();
  }
  // Finishing touches kept to the edges and corners, so they never sit on the words.
  function deco(c, W, H, kind, t) {
    if (!kind) return;
    var u = Math.min(W, H) / 1080, a = t.accent;
    c.save(); c.strokeStyle = a; c.fillStyle = a;
    if (kind === 'goldframe') {
      c.lineWidth = 3 * u; c.globalAlpha = 0.9; c.strokeRect(22 * u, 22 * u, W - 44 * u, H - 44 * u);
      c.lineWidth = 1.2 * u; c.globalAlpha = 0.6; c.strokeRect(32 * u, 32 * u, W - 64 * u, H - 64 * u);
    } else if (kind === 'ornate') {
      c.lineWidth = 3 * u; c.globalAlpha = 0.85;
      [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(function (p) {
        var x = p[0] + p[2] * 26 * u, y = p[1] + p[3] * 26 * u;
        c.beginPath(); c.moveTo(x, y + p[3] * 90 * u); c.lineTo(x, y); c.lineTo(x + p[2] * 90 * u, y); c.stroke();
        c.beginPath(); c.arc(x + p[2] * 14 * u, y + p[3] * 14 * u, 6 * u, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.moveTo(x + p[2] * 30 * u, y + p[3] * 12 * u); c.quadraticCurveTo(x + p[2] * 50 * u, y + p[3] * 40 * u, x + p[2] * 12 * u, y + p[3] * 30 * u); c.stroke();
      });
    } else if (kind === 'flourish') {
      c.lineWidth = 2.5 * u; c.globalAlpha = 0.7;
      [[W - 40 * u, 40 * u, -1], [40 * u, H - 40 * u, 1]].forEach(function (p) {
        c.beginPath(); c.moveTo(p[0], p[1]); c.bezierCurveTo(p[0] + p[2] * 60 * u, p[1] - p[2] * 10 * u, p[0] + p[2] * 90 * u, p[1] + p[2] * 50 * u, p[0] + p[2] * 150 * u, p[1] + p[2] * 20 * u); c.stroke();
        c.beginPath(); c.arc(p[0] + p[2] * 150 * u, p[1] + p[2] * 20 * u, 5 * u, 0, Math.PI * 2); c.fill();
      });
    } else if (kind === 'slashes') {
      c.globalAlpha = 0.9;
      for (var i = 0; i < 4; i++) { var x0 = W - (200 - i * 34) * u; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + 18 * u, 0); c.lineTo(x0 - 40 * u, 70 * u); c.lineTo(x0 - 58 * u, 70 * u); c.closePath(); c.fill(); }
    } else if (kind === 'lines') {
      c.lineWidth = 4 * u; c.globalAlpha = 0.9;
      c.beginPath(); c.moveTo(W - 34 * u, 34 * u + 120 * u); c.lineTo(W - 34 * u, 34 * u); c.lineTo(W - 34 * u - 120 * u, 34 * u); c.stroke();
      c.beginPath(); c.moveTo(34 * u, H - 34 * u - 120 * u); c.lineTo(34 * u, H - 34 * u); c.lineTo(34 * u + 120 * u, H - 34 * u); c.stroke();
    } else if (kind === 'corner') {
      c.globalAlpha = 0.95; c.fillRect(W - 70 * u, 30 * u, 40 * u, 6 * u); c.fillRect(W - 36 * u, 30 * u, 6 * u, 40 * u);
    } else if (kind === 'dots') {
      c.globalAlpha = 0.35;
      for (var r = 0; r < 4; r++) for (var q = 0; q < 6 - r; q++) { c.beginPath(); c.arc(W - 24 * u - q * 26 * u, 24 * u + r * 26 * u, 5 * u, 0, Math.PI * 2); c.fill(); }
    } else if (kind === 'ankara') { // a band of African-print diamonds and triangles along the top edge
      var h = 26 * u, s = 52 * u; c.globalAlpha = 1; c.fillStyle = t.bg; c.fillRect(0, 0, W, h);
      for (var x = 0; x < W + s; x += s) {
        c.fillStyle = a; c.beginPath(); c.moveTo(x, h / 2); c.lineTo(x + s / 4, 2 * u); c.lineTo(x + s / 2, h / 2); c.lineTo(x + s / 4, h - 2 * u); c.closePath(); c.fill();
        c.fillStyle = '#FFFFFF'; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(x + s / 2, h); c.lineTo(x + s * 0.75, h * 0.35); c.lineTo(x + s, h); c.closePath(); c.fill(); c.globalAlpha = 1;
        c.fillStyle = t.bg; c.beginPath(); c.arc(x + s / 4, h / 2, 3 * u, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = a; c.fillRect(0, h, W, 4 * u);
    } else if (kind === 'leaves') {
      c.globalAlpha = 0.55;
      [[W - 30 * u, 30 * u, 2.4], [W - 90 * u, 20 * u, 2.9], [36 * u, H - 40 * u, -0.7]].forEach(function (p) {
        c.save(); c.translate(p[0], p[1]); c.rotate(p[2]); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(26 * u, -30 * u, 0, -80 * u); c.quadraticCurveTo(-26 * u, -30 * u, 0, 0); c.fill(); c.restore();
      });
    } else if (kind === 'confetti') {
      var cols = [a, '#FF6B6B', '#4ECDC4', '#FFFFFF'], seed = 7;
      var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (var k = 0; k < 26; k++) {
        var corner = k % 2, cx = corner ? W - rnd() * 220 * u : rnd() * 220 * u, cy = corner ? rnd() * 140 * u : H - rnd() * 120 * u;
        c.fillStyle = cols[k % cols.length]; c.globalAlpha = 0.85; c.save(); c.translate(cx, cy); c.rotate(rnd() * 3); c.fillRect(-6 * u, -2.5 * u, 12 * u, 5 * u); c.restore();
      }
    } else if (kind === 'glow') {
      c.globalCompositeOperation = 'screen';
      [[W, 0], [0, H]].forEach(function (p) { var g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 420 * u); g.addColorStop(0, a); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.35; c.fillStyle = g; c.fillRect(0, 0, W, H); });
    } else if (kind === 'rays') {
      c.globalCompositeOperation = 'screen'; c.globalAlpha = 0.1; c.fillStyle = '#FFFFFF';
      for (var n = 0; n < 7; n++) { var dx = (n - 3) * W * 0.2; c.beginPath(); c.moveTo(W / 2, -40 * u); c.lineTo(W / 2 + dx - 40 * u, H * 0.75); c.lineTo(W / 2 + dx + 40 * u, H * 0.75); c.closePath(); c.fill(); }
    } else if (kind === 'sparkle') {
      c.globalAlpha = 0.9;
      [[W - 60 * u, 60 * u, 22], [W - 120 * u, 110 * u, 12], [W - 40 * u, 140 * u, 9], [60 * u, H - 70 * u, 14], [W - 60 * u, H - 70 * u, 14]].forEach(function (p) {
        var r = p[2] * u; c.beginPath(); c.moveTo(p[0], p[1] - r * 2); c.quadraticCurveTo(p[0], p[1], p[0] + r * 2, p[1]); c.quadraticCurveTo(p[0], p[1], p[0], p[1] + r * 2); c.quadraticCurveTo(p[0], p[1], p[0] - r * 2, p[1]); c.quadraticCurveTo(p[0], p[1], p[0], p[1] - r * 2); c.fill();
      });
    } else if (kind === 'speed') {
      c.globalAlpha = 0.6; c.lineWidth = 5 * u; c.lineCap = 'round';
      [0, 1, 2, 3].forEach(function (i) { var y = 40 * u + i * 18 * u; c.beginPath(); c.moveTo(W - 40 * u, y); c.lineTo(W - (160 + i * 40) * u, y); c.stroke(); });
    } else if (kind === 'bubbles') {
      c.globalAlpha = 0.3;
      [[W - 50 * u, 50 * u, 34], [W - 120 * u, 34 * u, 16], [W - 30 * u, 120 * u, 12], [46 * u, H - 50 * u, 26], [100 * u, H - 30 * u, 12]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], p[2] * u, 0, Math.PI * 2); c.fill(); });
    }
    c.restore();
  }
  // Colours taken from their own photo: the deepest rich colour as the main, the brightest as the accent.
  function photoTheme(img) {
    if (!img) return null;
    var cv = document.createElement('canvas'); cv.width = 48; cv.height = 48;
    var c = cv.getContext('2d'); c.drawImage(img, 0, 0, 48, 48);
    var d; try { d = c.getImageData(0, 0, 48, 48).data; } catch (e) { return null; }
    var best = null, bestS = 0, acc = null, accS = 0;
    for (var i = 0; i < d.length; i += 16) {
      var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0, L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (sat > 0.3 && L > 0.15 && L < 0.6 && sat * (1 - Math.abs(L - 0.35)) > bestS) { bestS = sat * (1 - Math.abs(L - 0.35)); best = [r, g, b]; }
      if (sat > 0.45 && L > 0.5 && sat * L > accS) { accS = sat * L; acc = [r, g, b]; }
    }
    if (!best) return null;
    var dark = best.map(function (v) { return Math.round(v * 0.42); });
    var hx = function (a) { return '#' + a.map(function (v) { return ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2); }).join(''); };
    var accent = acc ? hx(acc) : '#E8B230';
    if (Math.abs(lum(accent) - lum(hx(dark))) < 0.35) accent = '#F4C430';
    return { name: 'From their photos', bg: hx(dark), accent: accent, light: '#FBF7F0' };
  }

  // ---------- Business cards (3.5 × 2 in at 300 dpi, front and back) ----------
  var CARD = { w: 1050, h: 600 };
  var TITLE_RE = /\b(director|manager|ceo|c\.e\.o|founder|co-founder|owner|officer|secretary|designer|developer|engineer|consultant|chairman|chairperson|president|md|coo|cfo|cto|head|lead|agent|realtor|stylist|chef|baker|caterer|photographer|lawyer|barrister|solicitor|doctor|nurse|pharmacist|accountant|architect|surveyor|tailor|fashion|coordinator|executive|partner|proprietor|proprietress|principal|pastor|teacher|tutor|vendor|sales|marketer|specialist|analyst|administrator|assistant|representative|artist|makeup|planner)\b/i;
  var ADDR_RE = /\b(no\.?\s*\d+|plot|block|flat|suite|street|st\.|road|rd\.?|avenue|ave|close|crescent|quarters|estate|layout|junction|off|opposite|beside|behind|along|ibadan|lagos|abuja|oyo|ogun|osun|kwara|ondo|ekiti|rivers|port harcourt|kano|kaduna|enugu|anambra|delta|edo|state|nigeria)\b/i;
  function titleCase(x) { return String(x || '').toLowerCase().replace(/(^|[\s\-\/(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\b(Ceo|Md|Coo|Cfo|Cto)\b/g, function (w) { return w.toUpperCase(); }); }
  function parseCard(o) {
    var words = String(o.words || '').replace(/\r/g, '');
    var d = { name: '', title: '', phones: [], email: '', web: '', socials: [], address: '', tagline: '', business: o.business || '' };
    (words.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).slice(0, 1).forEach(function (e) { d.email = e.toLowerCase(); });
    (words.match(PHONE_RE) || []).forEach(function (p) { p = p.replace(/[\s-]/g, ''); if (d.phones.indexOf(p) === -1 && d.phones.length < 3) d.phones.push(p); });
    var rest = words.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, ' ').replace(PHONE_RE, ' ');
    (rest.match(/(?:^|\s)@[A-Za-z0-9_.]{2,}/g) || []).forEach(function (h) { d.socials.push(h.trim()); });
    var web = rest.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com\.ng|com|ng|org|net|co|io|africa)\b(?:\/\S*)?/i); if (web) d.web = web[0].replace(/^https?:\/\//i, '');
    rest = rest.replace(/(?:^|\s)@[A-Za-z0-9_.]{2,}/g, ' ').replace(web ? web[0] : /$^/, ' ');
    var bits = rest.split(/\n|,|·|\||;|\s-\s/).map(function (x) { return x.replace(/^\s*(name|full name|title|position|role|phone|tel|mobile|whatsapp|email|e-mail|address|office|website|web|ig|instagram)\s*[:\-]\s*/i, '').trim(); }).filter(function (x) { return x && /[a-z]/i.test(x); });
    var addr = [];
    bits.forEach(function (b) {
      if (d.business && b.toLowerCase().replace(/\W/g, '') === d.business.toLowerCase().replace(/\W/g, '')) return;
      if (!d.title && TITLE_RE.test(b) && b.split(/\s+/).length <= 5) { d.title = titleCase(b); return; }
      if (ADDR_RE.test(b) || addr.length) { if (addr.join(', ').length < 90) addr.push(b); return; }
      if (!d.business && /\b(limited|ltd|enterprises?|ventures?|global|services|nig\.?|company|stores?|concepts?|& sons)\b/i.test(b)) { d.business = b; return; }
      if (!d.name && /^[A-Za-z.'\- ]{3,40}$/.test(b) && b.split(/\s+/).length <= 4) { d.name = b; return; }
      if (!d.tagline && b.length > 8 && b.length < 60) d.tagline = b;
    });
    d.address = titleCase(addr.join(', ')).replace(/\bNo\b\.?\s*/g, 'No. ');
    if (d.name && d.name === d.name.toLowerCase()) d.name = titleCase(d.name);
    var inf = o.info || {};
    if (inf.person) d.name = inf.person;
    if (inf.title) d.title = inf.title;
    if (inf.email) d.email = inf.email;
    if (inf.web) d.web = inf.web.replace(/^https?:\/\//i, '');
    if (inf.address) d.address = inf.address;
    if (inf.phone) d.phones = inf.phone.split(/[,;\/]+/).map(function (p) { return p.trim(); }).filter(Boolean).concat(d.phones).filter(function (p, i, a) { return a.indexOf(p) === i; }).slice(0, 3);
    if (inf.socials) socialList(inf.socials).forEach(function (h) { var bare = h.replace(/^\S+ (?=@)/, ''); d.socials = d.socials.filter(function (x) { return x !== bare; }); if (d.socials.indexOf(h) === -1) d.socials.push(h); });
    if (!d.phones.length && o.contact) d.phones.push(String(o.contact).replace(/[^\d+]/g, ''));
    return d;
  }
  function fitFam(c, text, maxW, big, small, weight, fam) {
    var size = big; c.font = weight + ' ' + size + 'px ' + fam;
    while (c.measureText(text).width > maxW && size > small) { size -= 1; c.font = weight + ' ' + size + 'px ' + fam; }
    return size;
  }
  // Contact rows with icons; returns the y after the last row.
  function cardRows(c, d, x, y, w, size, color, iconBg, iconFg, measure) {
    var rows = [];
    if (d.phones.length) rows.push(['phone', d.phones.join('  ·  ')]);
    if (d.email) rows.push(['mail', d.email]);
    if (d.web) rows.push(['web', d.web]);
    (d.socials || []).forEach(function (h) { var sp = socialSplit(h); rows.push([sp.k, sp.t]); });
    if (d.address) rows.push(['place', d.address]);
    var lh = size * 1.85;
    rows.forEach(function (r) {
      var fs = size, room = w - size * 2; c.font = '600 ' + fs + 'px ' + FONT;
      while (c.measureText(r[1]).width > room && fs > size * 0.8) { fs -= 1; c.font = '600 ' + fs + 'px ' + FONT; }
      var lines = c.measureText(r[1]).width > room ? wrapText(c, r[1], room).slice(0, 2) : [r[1]];
      var h = lines.length > 1 ? lh + fs * 1.15 : lh, cy = y + h / 2;
      if (measure) { y += h; return; }
      icon(c, r[0], x + size * 0.6, cy, size * 0.62, iconBg, iconFg);
      c.font = '600 ' + fs + 'px ' + FONT; c.fillStyle = color; c.textAlign = 'left';
      lines.forEach(function (l, k) { c.fillText(l, x + size * 1.6, cy + fs * 0.36 + (k - (lines.length - 1) / 2) * fs * 1.15); });
      y += h;
    });
    return y;
  }
  function cardBrand(c, d, cx, cy, maxW, color, sub, big) {
    if (d.logo) {
      var lw = d.logo.width, lh2 = d.logo.height, k = Math.min(maxW * 0.7 / lw, big * 2.4 / lh2);
      c.drawImage(d.logo, cx - lw * k / 2, cy - lh2 * k / 2 - (d.tagline ? big * 0.3 : 0), lw * k, lh2 * k);
      if (d.tagline) { c.font = 'italic 500 ' + big * 0.36 + 'px ' + SERIF; c.fillStyle = sub; c.textAlign = 'center'; c.fillText(d.tagline, cx, cy + lh2 * k / 2 + big * 0.35, maxW); c.textAlign = 'left'; }
      return;
    }
    var name = d.business || 'Your business', fs = fitFam(c, name, maxW, big, big * 0.4, '800', SERIF), lines = [name];
    var w = name.split(/\s+/);
    if (fs < big * 0.78 && w.length > 1) { // long name: two lines read better than tiny letters
      var half = Math.ceil(w.length / 2); if (w.length === 3 && w[2].length > 6) half = 2;
      lines = [w.slice(0, half).join(' '), w.slice(half).join(' ')];
      fs = Math.min(fitFam(c, lines[0], maxW, big, big * 0.4, '800', SERIF), fitFam(c, lines[1], maxW, big, big * 0.4, '800', SERIF));
    }
    c.font = '800 ' + fs + 'px ' + SERIF; c.textAlign = 'center'; c.fillStyle = color;
    var lh = fs * 1.08, y0 = cy + fs * 0.35 - (lines.length - 1) * lh / 2 - (d.tagline ? big * 0.25 : 0);
    lines.forEach(function (l, i) { c.fillText(l, cx, y0 + i * lh); });
    var ly = y0 + (lines.length - 1) * lh + fs * 0.42;
    c.fillStyle = sub; c.fillRect(cx - big * 0.6, ly, big * 1.2, Math.max(3, big * 0.05));
    if (d.tagline) { c.font = 'italic 500 ' + Math.max(14, big * 0.36) + 'px ' + SERIF; c.fillText(d.tagline, cx, ly + big * 0.6, maxW); }
    c.textAlign = 'left';
  }
  function cardName(c, d, x, y, w, big, color, accent, align, measure) {
    var fs = fitFam(c, d.name || 'Your Name', w, big, big * 0.5, '800', FONT);
    if (measure) return y + fs + (d.title ? big * 0.6 : 0) + (d.special ? big * 0.55 : 0);
    c.textAlign = align || 'left'; c.fillStyle = color; c.fillText(d.name || 'Your Name', x, y + fs);
    var ty = y + fs;
    if (d.title) { c.font = '600 ' + big * 0.42 + 'px ' + FONT; c.fillStyle = accent; c.fillText(d.title, x, ty + big * 0.6, w); ty += big * 0.6; }
    if (d.special) { c.font = '500 ' + big * 0.34 + 'px ' + FONT; c.fillStyle = '#6B7280'; c.fillText(d.special, x, ty + big * 0.55, w); ty += big * 0.55; }
    c.textAlign = 'left';
    return ty;
  }
  // Top y that centres name + gap + contact rows between top and bottom.
  function cardTop(c, d, nameArgs, gap, rowArgs, top, bottom) {
    var nh = cardName.apply(null, [c, d, 0, 0].concat(nameArgs, [true]));
    var rh = cardRows.apply(null, [c, d, 0, 0].concat(rowArgs, [null, null, null, true]));
    return top + Math.max(0, (bottom - top - (nh + gap + rh)) / 2);
  }
  var CARD_LAYOUTS = [
    { name: 'Classic card',
      front: function (c, W, H, d, t) {
        var u = W / 1050; c.fillStyle = t.light; c.fillRect(0, 0, W, H);
        c.fillStyle = t.bg; c.fillRect(0, 0, 22 * u, H); c.fillStyle = t.accent; c.fillRect(22 * u, 0, 8 * u, H);
        if (d.logo) logoBadge(c, d.logo, W - 95 * u, 95 * u, 55 * u);
        else if (d.business) { c.font = '800 ' + 22 * u + 'px ' + FONT; c.fillStyle = t.bg; c.textAlign = 'right'; c.fillText(d.business.toUpperCase(), W - 60 * u, 80 * u, W * 0.5); c.textAlign = 'left'; }
        var nw = W - (d.logo ? 330 : 150) * u, y0 = cardTop(c, d, [nw, 64 * u, t.bg, t.bg, 'left'], 50 * u, [W - 150 * u, 25 * u], 110 * u, H - 50 * u);
        var y = cardName(c, d, 90 * u, y0, nw, 64 * u, t.bg, darkAccent(t), 'left');
        c.fillStyle = t.accent; c.fillRect(90 * u, y + 26 * u, 80 * u, 5 * u);
        cardRows(c, d, 90 * u, y + 50 * u, W - 150 * u, 25 * u, '#1F2937', t.bg, '#FFFFFF');
      },
      back: function (c, W, H, d, t) { cardBack(c, W, H, d, t, 'border'); } },
    { name: 'Split card',
      front: function (c, W, H, d, t) {
        var u = W / 1050, pw = W * 0.36; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
        c.fillStyle = t.bg; c.beginPath(); c.moveTo(0, 0); c.lineTo(pw + 40 * u, 0); c.lineTo(pw - 40 * u, H); c.lineTo(0, H); c.closePath(); c.fill();
        c.strokeStyle = t.accent; c.lineWidth = 8 * u; c.beginPath(); c.moveTo(pw + 52 * u, 0); c.lineTo(pw - 28 * u, H); c.stroke();
        cardBrand(c, d, pw / 2 - 10 * u, H / 2, pw - 90 * u, onColour(t.bg), t.accent, 52 * u);
        var x = pw + 70 * u, y0 = cardTop(c, d, [W - x - 50 * u, 54 * u, t.bg, t.bg, 'left'], 34 * u, [W - x - 40 * u, 22 * u], 40 * u, H - 40 * u);
        var y = cardName(c, d, x, y0, W - x - 50 * u, 54 * u, t.bg, darkAccent(t), 'left');
        cardRows(c, d, x, y + 34 * u, W - x - 40 * u, 22 * u, '#1F2937', t.accent, onColour(t.accent));
      },
      back: function (c, W, H, d, t) { cardBack(c, W, H, d, t, 'light'); } },
    { name: 'Minimal card',
      front: function (c, W, H, d, t) {
        var u = W / 1050; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
        c.fillStyle = t.bg; c.fillRect(0, H - 18 * u, W, 18 * u); c.fillStyle = t.accent; c.fillRect(0, H - 26 * u, W, 8 * u);
        var y0 = cardTop(c, d, [W - 160 * u, 60 * u, t.bg, t.bg, 'center'], 52 * u, [W - 300 * u, 22 * u], 40 * u, H - 60 * u);
        var y = cardName(c, d, W / 2, y0, W - 160 * u, 60 * u, t.bg, darkAccent(t), 'center');
        c.fillStyle = t.accent; c.beginPath(); c.arc(W / 2, y + 30 * u, 5 * u, 0, Math.PI * 2); c.fill();
        c.fillRect(W / 2 - 70 * u, y + 29 * u, 50 * u, 2 * u); c.fillRect(W / 2 + 20 * u, y + 29 * u, 50 * u, 2 * u);
        c.font = '600 ' + 22 * u + 'px ' + FONT;
        var widest = Math.max.apply(null, [d.phones.join('  ·  '), d.email, [d.web].concat(d.socials).filter(Boolean).join('  ·  '), d.address].map(function (x) { return x ? c.measureText(x).width : 0; }));
        var rw = Math.min(W - 160 * u, widest + 22 * u * 2.2);
        cardRows(c, d, (W - rw) / 2, y + 52 * u, rw, 22 * u, '#374151', t.light, t.bg);
      },
      back: function (c, W, H, d, t) { cardBack(c, W, H, d, t, 'stripe'); } },
    { name: 'Luxury foil card',
      front: function (c, W, H, d, t) {
        var u = W / 1050, bg = mixHex(t.bg, '#000000', 0.35), gold = foilGrad(c, t.accent, W, H); c.fillStyle = bg; c.fillRect(0, 0, W, H);
        foilFrame(c, W, H, u, gold);
        var mx = 205 * u; cardMark(c, d, mx, H / 2, 112 * u, gold, bg);
        c.fillStyle = gold; c.fillRect(352 * u, 110 * u, 2 * u, H - 220 * u);
        var x = 400 * u, w = W - x - 70 * u;
        var nm = (d.name || 'Your Name').toUpperCase(), fs = fitFam(c, nm, w, 50 * u, 26 * u, '600', '"Cinzel", Georgia, serif');
        var rowsH = cardRows(c, d, 0, 0, w, 21 * u, '#fff', bg, '#fff', true), top = Math.max(70 * u, (H - (fs + 70 * u + rowsH)) / 2);
        c.fillStyle = gold; c.font = '600 ' + fs + 'px "Cinzel", Georgia, serif'; c.fillText(nm, x, top + fs);
        if (d.title) { c.font = '500 ' + 19 * u + 'px ' + FONT; c.fillStyle = '#E8E1D0'; c.fillText(spaced(d.title.toUpperCase()), x, top + fs + 34 * u, w); }
        cardRows(c, d, x, top + fs + 62 * u, w, 21 * u, '#F3EEE2', bg, t.accent);
      },
      back: function (c, W, H, d, t) {
        var u = W / 1050, bg = mixHex(t.bg, '#000000', 0.35), gold = foilGrad(c, t.accent, W, H); c.fillStyle = bg; c.fillRect(0, 0, W, H);
        foilFrame(c, W, H, u, gold);
        var link = waLink(d), cx = link ? W * 0.4 : W / 2;
        cardMark(c, d, cx, H * 0.4, 100 * u, gold, bg);
        var bn = (d.business || 'Your business').toUpperCase(), fs = fitFam(c, bn, (link ? W * 0.62 : W - 200 * u), 36 * u, 18 * u, '600', '"Cinzel", Georgia, serif');
        c.textAlign = 'center'; c.fillStyle = gold; c.fillText(bn, cx, H * 0.4 + 150 * u);
        if (d.tagline) { c.font = 'italic 500 ' + 22 * u + 'px "Cormorant Garamond", ' + SERIF; c.fillStyle = '#E8E1D0'; c.fillText(d.tagline, cx, H * 0.4 + 190 * u, W * 0.6); }
        c.textAlign = 'left';
        if (link) { var qs = 150 * u, qx = W - qs - 80 * u, qy = H - qs - 110 * u; c.fillStyle = '#FFFFFF'; rr(c, qx - 12 * u, qy - 12 * u, qs + 24 * u, qs + 24 * u, 10 * u); c.fill(); drawQR(c, link, qx, qy, qs, '#111111');
          c.font = '600 ' + 15 * u + 'px ' + FONT; c.fillStyle = '#E8E1D0'; c.textAlign = 'center'; c.fillText(qrLabel(d).replace(/ on WhatsApp$/, ''), qx + qs / 2, qy + qs + 40 * u); c.textAlign = 'left'; }
      } },
    { name: 'Monogram card',
      front: function (c, W, H, d, t) {
        var u = W / 1050; c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
        var pw = 330 * u; c.fillStyle = t.light; c.fillRect(0, 0, pw, H); c.fillStyle = t.accent; c.fillRect(pw, 0, 6 * u, H);
        cardMark(c, d, pw / 2, H / 2 - 20 * u, 100 * u, t.accent, t.light, t.bg);
        if (!d.logo) { var bn = (d.business || '').toUpperCase(); if (bn) { var bfs = fitFam(c, spaced(bn), pw - 60 * u, 18 * u, 11 * u, '700', FONT); c.textAlign = 'center'; c.fillStyle = t.bg; c.fillText(spaced(bn), pw / 2, H / 2 + 120 * u); c.textAlign = 'left'; } }
        var x = pw + 70 * u, w = W - x - 60 * u, y0 = cardTop(c, d, [w, 56 * u, t.bg, t.bg, 'left'], 36 * u, [w, 22 * u], 50 * u, H - 50 * u);
        var y = cardName(c, d, x, y0, w, 56 * u, t.bg, darkAccent(t), 'left');
        c.fillStyle = t.accent; c.fillRect(x, y + 16 * u, 60 * u, 4 * u);
        cardRows(c, d, x, y + 36 * u, w, 22 * u, '#1F2937', t.bg, '#FFFFFF');
      },
      back: function (c, W, H, d, t) { cardBack(c, W, H, d, t, 'mono'); } },
  ];
  // Letter-spaced capitals for small labels.
  function spaced(x) { return String(x).split('').join(String.fromCharCode(8202)); }
  function foilGrad(c, acc, W, H) {
    var g = c.createLinearGradient(0, 0, W, H); acc = acc.toLowerCase();
    g.addColorStop(0, mixHex(acc, '#ffffff', 0.45)); g.addColorStop(0.35, acc); g.addColorStop(0.6, mixHex(acc, '#000000', 0.3)); g.addColorStop(0.8, mixHex(acc, '#ffffff', 0.3)); g.addColorStop(1, acc);
    return g;
  }
  function foilFrame(c, W, H, u, gold) {
    c.strokeStyle = gold; c.lineWidth = 3 * u; c.strokeRect(28 * u, 28 * u, W - 56 * u, H - 56 * u); c.lineWidth = 1 * u; c.strokeRect(38 * u, 38 * u, W - 76 * u, H - 76 * u);
    c.lineWidth = 3 * u; [[28, 28, 1, 1], [W / u - 28, 28, -1, 1], [28, H / u - 28, 1, -1], [W / u - 28, H / u - 28, -1, -1]].forEach(function (k) {
      var x = k[0] * u, y = k[1] * u; c.beginPath(); c.moveTo(x + k[2] * 40 * u, y + k[3] * 22 * u); c.lineTo(x + k[2] * 22 * u, y + k[3] * 22 * u); c.lineTo(x + k[2] * 22 * u, y + k[3] * 40 * u); c.stroke();
    });
  }
  // The brand mark: their logo, or their initials in a fine double ring.
  function cardMark(c, d, cx, cy, r, col, bg, letterCol) {
    if (d.logo) { var k = Math.min(r * 1.7 / d.logo.width, r * 1.7 / d.logo.height); if (bg && lum(bg) < 0.3) { c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill(); k = Math.min(r * 1.35 / d.logo.width, r * 1.35 / d.logo.height); } c.drawImage(d.logo, cx - d.logo.width * k / 2, cy - d.logo.height * k / 2, d.logo.width * k, d.logo.height * k); return; }
    var u = r / 100; c.strokeStyle = col; c.lineWidth = 4 * u; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1.5 * u; c.beginPath(); c.arc(cx, cy, r - 10 * u, 0, Math.PI * 2); c.stroke();
    var ini = initialsOf(d.business || d.name || 'A'), fs = ini.length > 1 ? 74 * u : 96 * u;
    c.font = '600 ' + fs + 'px "Cinzel", Georgia, serif'; c.fillStyle = letterCol || col; c.textAlign = 'center'; var mm = c.measureText(ini), asc = mm.actualBoundingBoxAscent || fs * 0.7, dsc = mm.actualBoundingBoxDescent || 0; c.fillText(ini, cx, cy + (asc - dsc) / 2); c.textAlign = 'left';
  }
  // Accent text on light card backgrounds: use the accent only if it's dark enough to read, else the main colour.
  function darkAccent(t) { return lum(t.accent) < 0.55 ? t.accent : t.bg; }
  function cardData(d) { return { name: d.name, title: d.title, special: d.special || '', services: d.services || [], email: d.email, address: d.address, tagline: d.tagline, web: d.web, socials: d.cardSocials || [], phones: d.cardPhones || [], logo: d.logo, business: d.business }; }
  function drawQR(c, text, x, y, size, dark) {
    if (typeof window.qrcode !== 'function') return false;
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), m = size / n; c.fillStyle = dark;
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(x + k * m, y + r * m, Math.ceil(m), Math.ceil(m));
    return true;
  }
  function qrLabel(d) { var p = String((d.phones || [])[0] || '').replace(/\D/g, ''); return p ? (/order|shop|sell|food|cake|chops|store|boutique/i.test([d.business, d.special].join(' ')) ? 'Scan to order on WhatsApp' : 'Scan to chat on WhatsApp') : d.web ? 'Scan to visit our website' : ''; }
  function waLink(d) { var p = String((d.phones || [])[0] || '').replace(/\D/g, ''); if (!p) return d.web ? (/^https?:/i.test(d.web) ? d.web : 'https://' + d.web) : ''; if (p.charAt(0) === '0') p = '234' + p.slice(1); return 'https://wa.me/' + p + '?text=' + encodeURIComponent('Hello ' + (d.business || '') + ', I would like to order'); }
  // Back of every card: brand, up to 4 services, social handle, and a "Scan to order on WhatsApp" code.
  function cardBack(c, W, H, d, t, style) {
    var u = W / 1050, dark = style === 'light' ? t.bg : onColour(t.bg), bgc = style === 'light' ? t.light : t.bg, acc = style === 'light' ? darkAccent(t) : t.accent;
    c.fillStyle = bgc; c.fillRect(0, 0, W, H);
    if (style === 'border') { c.strokeStyle = t.accent; c.lineWidth = 3 * u; c.strokeRect(26 * u, 26 * u, W - 52 * u, H - 52 * u); }
    if (style === 'light') { c.fillStyle = t.bg; c.fillRect(0, H - 18 * u, W, 18 * u); c.fillStyle = t.accent; c.fillRect(0, H - 26 * u, W, 8 * u); }
    if (style === 'mono') { c.strokeStyle = t.accent; c.lineWidth = 2 * u; c.strokeRect(30 * u, 30 * u, W - 60 * u, H - 60 * u); }
    if (style === 'stripe') { c.globalAlpha = 0.07; c.fillStyle = t.accent; for (var i = -H; i < W; i += 46 * u) { c.beginPath(); c.moveTo(i, H); c.lineTo(i + H, 0); c.lineTo(i + H + 14 * u, 0); c.lineTo(i + 14 * u, H); c.closePath(); c.fill(); } c.globalAlpha = 1; }
    var link = waLink(d), qs = 250 * u, qx = W - qs - 90 * u, qy = (H - qs) / 2 - 22 * u, left = 80 * u, lw = (link ? qx - 50 * u : W - 160 * u) - left;
    var y = 120 * u;
    if (d.logo) { var k = Math.min(lw * 0.5 / d.logo.width, 90 * u / d.logo.height); c.drawImage(d.logo, left, y - 60 * u, d.logo.width * k, d.logo.height * k); y += 50 * u; }
    else { var fs = fitFam(c, d.business || 'Your business', lw, 60 * u, 30 * u, '800', SERIF); c.fillStyle = dark; c.fillText(d.business || 'Your business', left, y); y += 14 * u; }
    c.fillStyle = acc; c.fillRect(left, y, 70 * u, 5 * u); y += 46 * u;
    var sv = (d.services || []).slice(0, 4);
    if (sv.length) {
      c.font = '600 ' + 24 * u + 'px ' + FONT; var colW = lw / 2;
      sv.forEach(function (x, n) { var cx = left + (n % 2) * colW, cy = y + Math.floor(n / 2) * 44 * u; c.fillStyle = acc; c.beginPath(); c.arc(cx + 7 * u, cy - 8 * u, 6 * u, 0, Math.PI * 2); c.fill(); c.fillStyle = dark; c.fillText(x.charAt(0).toUpperCase() + x.slice(1), cx + 24 * u, cy, colW - 30 * u); });
      y += Math.ceil(sv.length / 2) * 44 * u + 18 * u;
    }
    // Fill the lower left: tagline, then what they sell (when no services were listed), then every handle / website.
    if (d.tagline && y < H - 150 * u) { var tf = fit(c, d.tagline, lw, 2, 26 * u, 16 * u, '500'); c.font = 'italic 500 ' + tf.size + 'px ' + SERIF; c.fillStyle = dark; c.globalAlpha = 0.85; tf.lines.forEach(function (l, k) { c.fillText(l, left, y + tf.size * k * 1.3); }); c.globalAlpha = 1; y += tf.lines.length * tf.size * 1.3 + 20 * u; }
    if (!sv.length && d.special && y < H - 150 * u) { var spf = fit(c, d.special, lw, 2, 24 * u, 16 * u, '600'); c.font = '600 ' + spf.size + 'px ' + FONT; c.fillStyle = dark; spf.lines.forEach(function (l, k) { c.fillText(l, left, y + spf.size * k * 1.35); }); y += spf.lines.length * spf.size * 1.35 + 18 * u; }
    var handles = (d.socials || []).map(function (x) { return socialSplit(x).t; }).concat(d.web ? [d.web] : []).filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 3);
    c.font = '700 ' + 24 * u + 'px ' + FONT; c.fillStyle = acc;
    handles.forEach(function (h, k) { var hy = Math.min(y + 10 * u + k * 36 * u, H - 70 * u - (handles.length - 1 - k) * 36 * u); c.fillText(h, left, hy, lw); });
    if (link) {
      c.save(); c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 18 * u; c.fillStyle = '#FFFFFF'; rr(c, qx - 18 * u, qy - 18 * u, qs + 36 * u, qs + 80 * u, 16 * u); c.fill(); c.restore();
      if (!drawQR(c, link, qx, qy, qs, '#111111')) { c.fillStyle = '#EEE'; c.fillRect(qx, qy, qs, qs); }
      c.font = '800 ' + 19 * u + 'px ' + FONT; c.fillStyle = '#111111'; c.textAlign = 'center'; c.fillText(qrLabel(d), qx + qs / 2, qy + qs + 42 * u, qs + 20 * u); c.textAlign = 'left';
    }
  }
  // Both sides on one preview: front above, back below.
  var CARD_PREVIEW = CARD_LAYOUTS.map(function (L) {
    return { name: L.name, side: function (which, c, W, H, d, t) { L[which](c, W, H, cardData(d), t); }, draw: function (c, W, H, d, t) {
      d = cardData(d);
      var cw = W, ch = Math.round(W * CARD.h / CARD.w), gap = H - ch * 2;
      c.fillStyle = '#E5E7EB'; c.fillRect(0, 0, W, H);
      [[L.front, 0], [L.back, ch + gap]].forEach(function (p) {
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; p[0](cv.getContext('2d'), cw, ch, d, t);
        c.save(); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = W * 0.02; c.shadowOffsetY = W * 0.008; c.drawImage(cv, 0, p[1]); c.restore();
      });
    } };
  });


  function promoList(looks) {
    var used = [];
    return looks.map(function (n, i) {
      var L = lookByName(n), k = L.layout != null ? L.layout : i;
      if (used.indexOf(k) !== -1) for (var j = 0; j < LAYOUTS.length; j++) if (used.indexOf(j) === -1) { k = j; break; }
      used.push(k); return LAYOUTS[k];
    });
  }
  function withPlace(contact, place) { return contact && place ? contact + '  \u00B7  ' + place : contact || place || ''; }

  // Instagram profile preview: the set as it would sit on their profile grid (4:5 tiles, newest first).
  function igGrid(posts, d, t) {
    var W = 1080, head = 330, tile = (W - 8) / 3, th = tile * 1.25, rows = Math.ceil(posts.length / 3), H = head + rows * (th + 4);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
    var cx = 130, cy = 140, r = 90;
    c.save(); c.beginPath(); c.arc(cx, cy, r + 8, 0, Math.PI * 2); var ring = c.createLinearGradient(cx - r, cy + r, cx + r, cy - r); ring.addColorStop(0, '#F9CE34'); ring.addColorStop(0.5, '#EE2A7B'); ring.addColorStop(1, '#6228D7'); c.fillStyle = ring; c.fill(); c.restore();
    c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip(); c.fillStyle = t.bg; c.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (d.logo) { var k = Math.min(r * 1.4 / d.logo.width, r * 1.4 / d.logo.height); c.drawImage(d.logo, cx - d.logo.width * k / 2, cy - d.logo.height * k / 2, d.logo.width * k, d.logo.height * k); }
    else { c.font = '800 70px ' + FONT; c.fillStyle = t.accent; c.textAlign = 'center'; c.fillText(String(d.business || '?').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(), cx, cy + 25); c.textAlign = 'left'; }
    c.restore();
    var handle = (d.socials && d.socials[0] && socialSplit(d.socials[0]).t) || ('@' + (String(d.business || '').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'business'));
    c.fillStyle = '#111'; c.font = '700 40px ' + FONT; c.fillText(handle.replace(/^@/, ''), 260, 110, W - 300);
    c.font = '600 32px ' + FONT; c.fillText(d.business || '', 260, 160, W - 300);
    c.font = '400 28px ' + FONT; c.fillStyle = '#444'; c.fillText(String(d.place || d.special || '').slice(0, 60), 260, 205, W - 300);
    c.fillStyle = '#EFEFEF'; c.fillRect(40, 250, W - 80, 56); c.fillStyle = '#111'; c.font = '700 26px ' + FONT; c.textAlign = 'center'; c.fillText('Follow', W / 2, 287); c.textAlign = 'left';
    posts.forEach(function (p, i) {
      var x = (i % 3) * (tile + 4), y = head + Math.floor(i / 3) * (th + 4);
      var k = Math.max(tile / p.width, th / p.height), w = p.width * k, h = p.height * k;
      c.save(); c.beginPath(); c.rect(x, y, tile, th); c.clip(); c.drawImage(p, x + (tile - w) / 2, y + (th - h) / 2, w, h); c.restore();
    });
    return cv;
  }
  // Business cards printed and lying on a table: back card tilted behind, front card on top, soft shadows.
  function cardMockup(front, back, t) {
    var W = 1600, H = 1100, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#E9E1D6'); g.addColorStop(1, '#CFC3B3'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.06; c.globalCompositeOperation = 'multiply'; c.fillStyle = c.createPattern(noise(), 'repeat'); c.fillRect(0, 0, W, H); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    function place(img, x, y, a, s) {
      c.save(); c.translate(x, y); c.rotate(a); var w = img.width * s, h = img.height * s;
      c.shadowColor = 'rgba(40,25,10,.35)'; c.shadowBlur = 40; c.shadowOffsetX = 14; c.shadowOffsetY = 24; c.fillStyle = '#fff'; c.fillRect(-w / 2, -h / 2, w, h);
      c.shadowColor = 'transparent'; c.drawImage(img, -w / 2, -h / 2, w, h);
      var sh = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); sh.addColorStop(0, 'rgba(255,255,255,.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.06)'); c.fillStyle = sh; c.fillRect(-w / 2, -h / 2, w, h);
      c.restore();
    }
    place(back, W * 0.6, H * 0.4, 0.12, 0.85);
    place(front, W * 0.42, H * 0.6, -0.08, 0.9);
    return cv;
  }
  // Seasonal packs: their own colours on one draft, the season's colours on the others, and a small seasonal mark.
  var SEASONS = {
    xmas: { re: /christmas|xmas|new year/i, themes: [{ name: 'Christmas red', bg: '#8B0000', accent: '#FFD166', light: '#FFF7EB' }, { name: 'Christmas green', bg: '#0F4D2E', accent: '#E9C46A', light: '#F4FAF6' }] },
    sallah: { re: /ramadan|sallah|eid/i, themes: [{ name: 'Eid green', bg: '#0B5D3B', accent: '#E9C46A', light: '#F3FAF6' }, { name: 'Ramadan night', bg: '#1B2A4A', accent: '#D4AF37', light: '#F7F5EE' }] },
    easter: { re: /easter/i, themes: [{ name: 'Easter purple', bg: '#5B3F8F', accent: '#F7C948', light: '#FBF7FF' }, { name: 'Easter spring', bg: '#2F6B4F', accent: '#F4A7B9', light: '#F6FBF8' }] },
    independence: { re: /independence|october 1|1st october/i, themes: [{ name: 'Naija green', bg: '#008751', accent: '#E9C46A', light: '#F2FAF6' }, { name: 'Green & white', bg: '#0B3D2A', accent: '#7FD1A8', light: '#F2FAF6' }] },
  };
  function seasonOf(text) { for (var k in SEASONS) if (SEASONS[k].re.test(String(text || ''))) return k; return ''; }
  function seasonMark(c, W, H, k, t) {
    if (!k) return; var u = Math.min(W, H) / 1080; c.save();
    if (k === 'xmas') {
      c.strokeStyle = '#FFFFFF'; c.globalAlpha = 0.55; c.lineWidth = 3 * u; c.lineCap = 'round';
      [[0.08, 0.1, 26], [0.9, 0.16, 20], [0.85, 0.05, 14], [0.15, 0.24, 12], [0.93, 0.32, 10]].forEach(function (f) { var x = W * f[0], y = H * f[1], r = f[2] * u; for (var a = 0; a < 3; a++) { var an = a * Math.PI / 3; c.beginPath(); c.moveTo(x - Math.cos(an) * r, y - Math.sin(an) * r); c.lineTo(x + Math.cos(an) * r, y + Math.sin(an) * r); c.stroke(); } });
      c.globalAlpha = 1; var bx = W - 120 * u, by = 0; c.strokeStyle = t.accent; c.lineWidth = 2 * u; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, 70 * u); c.stroke();
      c.fillStyle = t.accent; c.beginPath(); c.arc(bx, 96 * u, 26 * u, 0, Math.PI * 2); c.fill(); c.fillRect(bx - 9 * u, 64 * u, 18 * u, 10 * u);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(bx - 9 * u, 88 * u, 7 * u, 0, Math.PI * 2); c.fill();
    } else if (k === 'sallah') {
      var mx = W - 120 * u, my = 120 * u, r = 54 * u; c.fillStyle = t.accent;
      c.save(); c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.clip(); c.beginPath(); c.arc(mx, my, r, 0, Math.PI * 2); c.arc(mx + r * 0.42, my - r * 0.2, r * 0.86, 0, Math.PI * 2, true); c.fill('evenodd'); c.restore();
      [[mx - r * 1.5, my + r * 0.9, 12], [mx + r * 0.6, my + r * 1.4, 9], [mx - r * 2.2, my - r * 0.4, 7]].forEach(function (s) { c.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = (i % 2 ? 0.42 : 1) * s[2] * u; c.lineTo(s[0] + rr * Math.cos(a), s[1] + rr * Math.sin(a)); } c.closePath(); c.fill(); });
    } else if (k === 'easter') {
      [[W - 110 * u, 110 * u, '#F4A7B9'], [W - 175 * u, 140 * u, t.accent], [W - 60 * u, 165 * u, '#9ED9C4']].forEach(function (e) { c.fillStyle = e[2]; c.beginPath(); c.ellipse(e[0], e[1], 26 * u, 34 * u, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(e[0] - 22 * u, e[1]); c.quadraticCurveTo(e[0], e[1] - 8 * u, e[0] + 22 * u, e[1]); c.stroke(); });
    } else if (k === 'independence') {
      var bw = 26 * u; c.fillStyle = '#008751'; c.fillRect(0, 0, bw, H); c.fillRect(W - bw, 0, bw, H); c.fillStyle = '#FFFFFF'; c.fillRect(bw, 0, 6 * u, H); c.fillRect(W - bw - 6 * u, 0, 6 * u, H);
    }
    c.restore();
  }
  // ---------- Quick preview for the public order form: 3 small drafts from what the customer typed ----------
  var prevCache = {};
  function previewDesigns(o, width) {
    o = o || {}; width = width || 300;
    var mode = o.kind === 'card' ? 'card' : parseMenu(o).items.length >= 4 ? 'menu' : 'promo';
    var urls = (o.photos || []).filter(function (p) { return /\.(jpe?g|png|webp)(\?|$)/i.test(p.name || p.url || '') || /^blob:/.test(p.url || ''); }).slice(0, 6);
    return Promise.all([loadLookFonts()].concat(urls.map(function (p) {
      if (prevCache[p.url]) return prevCache[p.url];
      return (prevCache[p.url] = load(p.url).then(function (img) { return img ? enhance(img) : null; }));
    }))).then(function (res) {
      var imgs = res.slice(1), logoI = urls.findIndex(function (p) { return /logo/i.test(p.name || ''); });
      var logo = logoI >= 0 ? imgs[logoI] : null, photos = imgs.filter(function (x, i) { return x && i !== logoI; });
      var g = guess(o), mp = parseMenu(o), cd = parseCard(o), inf = o.info || {};
      var d = { business: o.business || g.business, headline: g.headline, details: g.details, offer: g.offer, contact: g.contact,
        photo: photos[0] || null, photos: photos, logo: logo, logoWide: logo ? logo.width / logo.height > 1.3 : false,
        listTitle: mp.listTitle, items: mp.items.map(function (x) { return splitItem(x).name; }), descs: mp.items.map(function (x) { return splitItem(x).desc; }), note: mp.note, phones: mp.phones, socials: mp.socials, place: mp.place,
        menuPhotos: photos.map(function (img) { return { img: img, caption: '' }; }),
        name: cd.name, title: cd.title, email: cd.email, address: cd.address, tagline: cd.tagline, web: cd.web, cardSocials: cd.socials, cardPhones: cd.phones };
      var list = mode === 'menu' ? MENU_LAYOUTS : mode === 'card' ? CARD_PREVIEW : null;
      var looks = o.looks || suggestLooks([o.business, o.words, inf.sell, o.service].join(' ')), custom = themeFrom(o.colours), pt = custom ? null : photoTheme(photos[0]);
      list = list || promoList(looks); d.contact = withPlace(d.contact, d.place); d.special = inf.sell || ''; d.services = (inf.sell || '').split(/,|\band\b/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4);
      var season = seasonOf(o.service), icon = /invit/i.test(o.service || '') ? 'heart' : iconsFor([o.business, o.words, inf.sell].join(' '))[0];
      // Social media pack: each draft shows a different post from their list, so they see the set, not one post three times.
      var posts = /social/i.test(o.service || '') ? String(o.words || '').split(/\s*(?:post\s*\d+\s*[:\-–.]|\n)\s*/i).map(function (x) { return x.replace(/[.\s]+$/, '').trim(); }).filter(function (x) { return x.length > 2; }) : [];
      return list.map(function (L, i) {
        var look = lookByName(looks[i]), t = custom || (i === 0 && pt) || (look.theme ? Object.assign({ name: look.name }, look.theme) : THEMES[0]);
        if (season && i > 0 && mode !== 'card') t = SEASONS[season].themes[(i - 1) % 2];
        var dd = d;
        if (posts.length > 1 && mode === 'promo') { var pg = guess({ words: posts[i % posts.length], business: d.business, info: inf }); dd = Object.assign({}, d, { headline: pg.headline, details: pg.details, offer: pg.offer || '', photo: photos[i % Math.max(1, photos.length)] || null }); }
        var sz = SIZES[o.size] || SIZES.post, W = width, H = mode === 'card' ? Math.round(width * (CARD.h * 2 + 90) / CARD.w) : Math.round(width * sz.h / sz.w);
        var big = 2, cv = document.createElement('canvas'); cv.width = W * big; cv.height = H * big;
        var c = cv.getContext('2d'), F = FONT, S = SERIF, Hd = HEAD;
        FONT = look.font; SERIF = look.serif; HEAD = look.head || null;
        PHT = { t: t, icon: icon, label: true };
        // Note each font family the design draws with (cards draw on their own canvases too), so its details can name them.
        var used = [], fd = window.CanvasRenderingContext2D && Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
        if (fd) Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', { configurable: true, enumerable: fd.enumerable, get: function () { return fd.get.call(this); }, set: function (v) { fd.set.call(this, v); var f = String(v).replace(/^.*?[\d.]+px\s+/, '').split(',')[0].replace(/["']/g, '').trim(); if (f && used.indexOf(f) < 0) used.push(f); } });
        try {
          L.draw(c, cv.width, cv.height, dd, t);
          if (mode !== 'card') { texture(c, cv.width, cv.height, look.tex); deco(c, cv.width, cv.height, look.deco, t); seasonMark(c, cv.width, cv.height, season, t); }
        } finally { FONT = F; SERIF = S; HEAD = Hd; PHT = null; if (fd) Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', fd); }
        // "Preview" mark, so it isn't used as the finished design (left off only for our own sample book)
        if (!o.noMark) { c.save(); c.translate(cv.width / 2, cv.height / 2); c.rotate(-0.5); c.globalAlpha = 0.16; c.fillStyle = '#FFFFFF'; c.strokeStyle = '#000000'; c.lineWidth = 2;
        c.font = '900 ' + Math.round(cv.width * 0.12) + 'px Inter, Arial, sans-serif'; c.textAlign = 'center'; c.strokeText('PREVIEW', 0, 0); c.fillText('PREVIEW', 0, 0); c.restore(); }
        // What was drawn, in words (for the sample book and anyone checking a design without seeing it)
        var fam = function (f) { return String(f || '').split(',')[0].replace(/["']/g, '').trim(); };
        cv.meta = { layout: L.name, look: mode === 'card' ? '' : (season && i > 0 ? t.name : look.name), colours: { main: t.bg, accent: t.accent, light: t.light || '' },
          fonts: mode === 'card' ? used.slice(0, 4) : [fam(look.head || look.serif), fam(look.font)].filter(function (x, k, a) { return x && a.indexOf(x) === k; }),
          text: mode === 'menu' ? [dd.business, dd.listTitle].concat(dd.items.map(function (x, k) { return x + (dd.descs[k] ? ' – ' + dd.descs[k] : ''); }), [dd.note, (dd.phones || []).join(', '), (dd.socials || []).join(', '), dd.place]).filter(Boolean)
            : mode === 'card' ? [dd.name, dd.title, dd.business, (dd.cardPhones || dd.phones || []).join(', '), dd.email, dd.web, (dd.cardSocials || []).join(', '), dd.address, dd.special].filter(Boolean)
            : [dd.business, dd.headline, dd.details, dd.offer, dd.contact].filter(Boolean) };
        cv.title = (mode === 'card' ? L.name : L.name + ' · ' + (season && i > 0 ? t.name : look.name)) + (posts.length > 1 && mode === 'promo' ? ' (post ' + (i % posts.length + 1) + ')' : '');
        return cv;
      });
    });
  }

  // ---------- Monogram logos (instant, no AI): the business initials in 6 classic styles ----------
  // Fonts are put inside each SVG, so the PNG download and any phone show them the same.
  var MONO_FONTS = { 'Playfair Display|900': 'playfair-display-latin-900-normal', 'Playfair Display|700': 'playfair-display-latin-700-normal', 'Great Vibes|400': 'great-vibes-latin-400-normal',
    'Bebas Neue|400': 'bebas-neue-latin-400-normal', 'DM Serif Display|400': 'dm-serif-display-latin-400-normal', 'Montserrat|500': 'montserrat-latin-500-normal', 'Montserrat|800': 'montserrat-latin-800-normal',
    'Cinzel|600': 'cinzel-latin-600-normal', 'Cormorant Garamond|600': 'cormorant-garamond-latin-600-normal', 'Cormorant Garamond|500': 'cormorant-garamond-latin-500-normal' };
  var fontData = {};
  function fontB64(key) {
    if (fontData[key]) return fontData[key];
    return (fontData[key] = fetch('/assets/fonts/looks/' + MONO_FONTS[key] + '.woff2').then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var b = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) b += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(b);
    }));
  }
  var GENERIC = /^(the|and|&|of|global|limited|ltd|ltd\.|ventures?|enterprises?|nig|nigeria|co|company|int'?l|international|more)$/i;
  function initialsOf(name) {
    var words = String(name || '').replace(/[^A-Za-z0-9&' ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    var key = words.filter(function (w) { return !GENERIC.test(w); });
    if (!key.length) key = words;
    var s = key.slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
    return s || 'A';
  }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var mctx = document.createElement('canvas').getContext('2d');
  function measure(text, fam, wt, size, ls) { mctx.font = wt + ' ' + size + 'px "' + fam + '"'; return mctx.measureText(text).width + (ls || 0) * Math.max(0, text.length - 1); }
  function fitSize(text, fam, wt, size, maxW, ls) { while (size > 10 && measure(text, fam, wt, size, ls * size) > maxW) size -= 1; return size; }
  // A <text> that keeps fitting its width when the name is edited later (see logoSvg).
  function txt(id, text, x, y, fam, wt, size, maxW, fill, opts) {
    opts = opts || {}; var ls = opts.ls || 0, up = opts.upper ? String(text).toUpperCase() : String(text);
    var s = fitSize(up, fam, wt, size, maxW, ls);
    return '<text' + (id ? ' id="' + id + '"' : '') + ' x="' + x + '" y="' + y + '" text-anchor="' + (opts.anchor || 'middle') + '" font-family="\'' + fam + '\', serif" font-weight="' + wt + '" font-size="' + s + '"' +
      (ls ? ' letter-spacing="' + (ls * s).toFixed(1) + '"' : '') + ' fill="' + fill + '" data-maxw="' + maxW + '" data-size="' + size + '" data-ls="' + ls + '"' + (opts.upper ? ' data-case="upper"' : '') + '>' + esc(up) + '</text>';
  }
  // ---- More styles: luxury crest, circle stamp, elegant overlap, swoosh initial, script signature, arc seal, star badge ----
  function n1(v) { return Math.round(v * 10) / 10; }
  function laurel(cx, cy, R, a0, a1, count, size, fill) {
    var out = '';
    for (var i = 0; i < count; i++) {
      var a = (a0 + (a1 - a0) * i / (count - 1)) * Math.PI / 180, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      var tang = a * 180 / Math.PI + (a1 > a0 ? 90 : -90), s = size * (0.7 + 0.3 * Math.sin(Math.PI * i / (count - 1)));
      out += '<ellipse cx="' + n1(x) + '" cy="' + n1(y) + '" rx="' + n1(s) + '" ry="' + n1(s * 0.38) + '" fill="' + fill + '" transform="rotate(' + n1(tang - 35) + ' ' + n1(x) + ' ' + n1(y) + ') translate(' + n1(s * 0.8) + ' 0)"/>';
      out += '<ellipse cx="' + n1(x) + '" cy="' + n1(y) + '" rx="' + n1(s) + '" ry="' + n1(s * 0.38) + '" fill="' + fill + '" transform="rotate(' + n1(tang + 35) + ' ' + n1(x) + ' ' + n1(y) + ') translate(' + n1(s * 0.8) + ' 0)"/>';
    }
    return out + '<path d="M' + n1(cx + R * Math.cos(a0 * Math.PI / 180)) + ' ' + n1(cy + R * Math.sin(a0 * Math.PI / 180)) + ' A' + R + ' ' + R + ' 0 0 ' + (a1 > a0 ? 1 : 0) + ' ' + n1(cx + R * Math.cos(a1 * Math.PI / 180)) + ' ' + n1(cy + R * Math.sin(a1 * Math.PI / 180)) + '" fill="none" stroke="' + fill + '" stroke-width="2.5"/>';
  }
  function crown(cx, y, w, fill) {
    var h = w * 0.55;
    return '<path d="M' + (cx - w / 2) + ' ' + (y + h) + ' L' + (cx - w / 2) + ' ' + (y + h * 0.3) + ' L' + (cx - w / 4) + ' ' + (y + h * 0.62) + ' L' + cx + ' ' + y + ' L' + (cx + w / 4) + ' ' + (y + h * 0.62) + ' L' + (cx + w / 2) + ' ' + (y + h * 0.3) + ' L' + (cx + w / 2) + ' ' + (y + h) + ' Z" fill="' + fill + '"/>' +
      '<rect x="' + (cx - w / 2) + '" y="' + (y + h + 3) + '" width="' + w + '" height="' + (h * 0.22) + '" fill="' + fill + '"/>' +
      [-w / 2, 0, w / 2].map(function (dx, k) { return '<circle cx="' + (cx + dx) + '" cy="' + (k === 1 ? y - 4 : y + h * 0.3 - 4) + '" r="' + (w * 0.07) + '" fill="' + fill + '"/>'; }).join('');
  }
  // A scroll flourish: drawn for the right side, mirrored for the left.
  function flourish(cx, y, len, fill, mirror) {
    var d = 'M0 0 C' + len * 0.3 + ' ' + (-len * 0.22) + ' ' + len * 0.55 + ' ' + len * 0.2 + ' ' + len * 0.8 + ' 0 C' + len * 0.95 + ' ' + (-len * 0.12) + ' ' + len * 0.86 + ' ' + (-len * 0.3) + ' ' + len * 0.74 + ' ' + (-len * 0.2) +
      ' C' + len * 0.66 + ' ' + (-len * 0.12) + ' ' + len * 0.74 + ' ' + (-len * 0.02) + ' ' + len * 0.82 + ' ' + (-len * 0.08);
    return '<path d="' + d + '" fill="none" stroke="' + fill + '" stroke-width="3" stroke-linecap="round" transform="translate(' + cx + ' ' + y + ')' + (mirror ? ' scale(-1 1)' : '') + '"/>' +
      '<circle cx="0" cy="0" r="3.5" fill="' + fill + '" transform="translate(' + cx + ' ' + y + ')"/>';
  }
  // Text around a circle: top (reads left to right over the top) or bottom (reads left to right under).
  function arcText(id, text, cx, cy, r, top, fam, wt, size, fill, ls, upper) {
    var up = upper ? String(text).toUpperCase() : String(text), pathId = 'arc-' + Math.random().toString(36).slice(2, 8);
    var len = Math.PI * r * 0.92, s = fitSize(up, fam, wt, size, len, ls);
    var d = top ? 'M' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 1 ' + (cx + r) + ' ' + cy : 'M' + (cx - r) + ' ' + cy + ' A' + r + ' ' + r + ' 0 0 0 ' + (cx + r) + ' ' + cy;
    return '<path id="' + pathId + '" d="' + d + '" fill="none"/><text text-anchor="middle"><textPath' + (id ? ' id="' + id + '"' : '') + ' href="#' + pathId + '" startOffset="50%" font-family="\'' + fam + '\', serif" font-weight="' + wt + '" font-size="' + s + '" letter-spacing="' + (ls * s).toFixed(1) + '" fill="' + fill + '" data-maxw="' + n1(len) + '" data-size="' + size + '" data-ls="' + ls + '"' + (upper ? ' data-case="upper"' : '') + '>' + esc(up) + '</textPath></text>';
  }
  function star(x, y, r, fill) { var p = ''; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; p += (i ? 'L' : 'M') + n1(x + rr * Math.cos(a)) + ' ' + n1(y + rr * Math.sin(a)); } return '<path d="' + p + 'Z" fill="' + fill + '"/>'; }
  // ---------- Line icons for icon logos (100×100 box). s: drawn solid (filled) rather than as a line. ----------
  var LOGO_ICONS = {
    cake: { d: 'M20 88 H80 M24 88 V62 H76 V88 M30 62 V44 H70 V62 M24 72 C34 78 42 66 50 72 C58 78 66 66 76 72 M50 44 V32 M50 20 C45 26 46 31 50 32 C54 31 55 26 50 20' },
    bottle: { d: 'M38 10 H62 V24 H38 Z M44 24 V34 M56 24 V34 M30 34 H70 Q78 34 78 42 V82 Q78 90 70 90 H30 Q22 90 22 82 V42 Q22 34 30 34 Z M36 58 H64' },
    leaf: { d: 'M20 80 C20 40 45 18 82 18 C82 55 60 80 20 80 Z M20 80 C40 60 55 45 70 32' },
    house: { d: 'M12 50 L50 16 L88 50 M24 40 V86 H76 V40 M42 86 V62 H58 V86' },
    food: { d: 'M30 12 V40 M22 12 V34 C22 42 38 42 38 34 V12 M30 40 V88 M68 88 V12 C56 20 54 40 58 52 H68' },
    scissors: { d: 'M22 70 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M54 70 a12 12 0 1 0 24 0 a12 12 0 1 0 -24 0 M42 60 L70 14 M58 60 L30 14' },
    crown: { d: 'M14 74 L20 30 L38 52 L50 20 L62 52 L80 30 L86 74 Z M18 86 H82', s: 1 },
    drop: { d: 'M50 10 C50 10 20 46 20 64 A30 30 0 0 0 80 64 C80 46 50 10 50 10 Z M36 64 A14 14 0 0 0 50 78' },
    flame: { d: 'M50 8 C58 28 76 40 76 62 A26 26 0 0 1 24 62 C24 48 34 40 36 28 C42 38 44 44 50 46 C54 36 52 22 50 8 Z', s: 1 },
    book: { d: 'M50 26 C40 18 24 16 12 20 V82 C24 78 40 80 50 88 C60 80 76 78 88 82 V20 C76 16 60 18 50 26 Z M50 26 V88' },
    health: { d: 'M40 14 H60 V40 H86 V60 H60 V86 H40 V60 H14 V40 H40 Z', s: 1 },
    cart: { d: 'M8 18 H22 L32 66 H78 L88 32 H26 M32 84 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M66 84 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0' },
    hanger: { d: 'M50 36 V30 A9 9 0 1 1 59 21 M50 36 L10 66 Q5 73 14 73 H86 Q95 73 90 66 Z' },
    camera: { d: 'M14 32 H32 L38 22 H62 L68 32 H86 V80 H14 Z M36 56 a14 14 0 1 0 28 0 a14 14 0 1 0 -28 0' },
    lotus: { d: 'M50 18 C63 33 63 58 50 74 C37 58 37 33 50 18 Z M50 74 C34 72 20 60 16 42 C30 42 42 52 50 74 M50 74 C66 72 80 60 84 42 C70 42 58 52 50 74 M22 86 H78' },
    hotel: { d: 'M22 88 V16 H78 V88 M14 88 H86 M34 30 H44 M56 30 H66 M34 46 H44 M56 46 H66 M34 62 H44 M56 62 H66 M44 88 V76 H56 V88' },
    cross: { d: 'M50 8 V92 M26 32 H74' },
    bolt: { d: 'M56 6 L22 56 H48 L42 94 L78 40 H52 Z', s: 1 },
    heart: { d: 'M50 84 C20 62 10 46 18 30 C26 16 44 18 50 32 C56 18 74 16 82 30 C90 46 80 62 50 84 Z', s: 1 },
    sparkle: { d: 'M50 8 C54 38 62 46 92 50 C62 54 54 62 50 92 C46 62 38 54 8 50 C38 46 46 38 50 8 Z', s: 1 },
    cup: { d: 'M20 30 H70 V58 A22 22 0 0 1 48 80 H42 A22 22 0 0 1 20 58 Z M70 38 H78 A10 10 0 0 1 78 58 H70 M16 90 H74 M36 10 C32 16 40 18 36 24 M50 10 C46 16 54 18 50 24' },
    car: { d: 'M10 64 V52 L22 48 L34 28 H66 L80 48 L90 52 V64 Z M22 64 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M60 64 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0 M36 30 L30 48 H72 L64 30' },
  };
  var ICON_WORDS = [
    ['bottle', /perfume|scent|fragrance|oud|cologne|body spray|mist/], ['cake', /cake|bak(e|ery)|pastr|cupcake|dessert|treat|confection|doughnut|chin/],
    ['food', /food|kitchen|restaurant|eatery|catering|chop|grill|suya|rice|cuisine|chef|buka|meal|snack|bistro/], ['cup', /coffee|cafe|tea|drink|juice|smoothie|zobo|parfait|lounge|bar\b/],
    ['house', /estate|property|properties|realty|real estate|homes?\b|housing|rent|apartment|construction|builder/], ['hotel', /hotel|suites|short.?let|lodge|inn\b|resort|guest/],
    ['scissors', /salon|barb|hair|tailor|stitch|sew|fashion design/], ['hanger', /boutique|fashion|cloth|wear|apparel|outfit|fabric|ankara|thrift/],
    ['lotus', /spa|beauty|makeup|skin|cosmetic|wellness|nail|lash|glow/], ['health', /clinic|hospital|pharma|medic|health|care\b|diagnos|laborator|dental/],
    ['cross', /church|ministr|chapel|gospel|cathedral|assembly/], ['book', /school|academy|college|tutor|education|learning|lesson|books?\b|institute/],
    ['drop', /water|oil|lubricant|laundry|clean|wash|plumb/], ['flame', /gas|lpg|fuel|petrol|energy|grill/], ['bolt', /electric|power|solar|inverter|tech|digital|gadget|phone|computer|network/],
    ['cart', /store|shop|mart|supermarket|mall|market|retail|wholesale|provision/], ['camera', /photo|studio|media|film|video|print/], ['car', /auto|car\b|cars|motor|garage|mechanic|logistics|haulage|transport|ride/],
    ['leaf', /farm|agro|organic|natural|herbal|garden|green|plant|fresh/], ['crown', /royal|luxury|king|queen|empire|regal|prestige|premium/], ['heart', /love|gift|charity|foundation|wedding|event|care/],
  ];
  function iconsFor(text) {
    text = String(text || '').toLowerCase(); var out = [];
    ICON_WORDS.forEach(function (w) { if (w[1].test(text) && out.indexOf(w[0]) === -1) out.push(w[0]); });
    ['sparkle', 'crown', 'leaf'].forEach(function (k) { if (out.length < 2 && out.indexOf(k) === -1) out.push(k); });
    return out;
  }
  // The icon at (x, y) (top-left), size px, in colour col. solid: filled; otherwise a clean line icon.
  function iconSvg(k, x, y, size, col, forceSolid) {
    var ic = LOGO_ICONS[k] || LOGO_ICONS.sparkle, s = size / 100, solid = forceSolid || ic.s;
    return '<g transform="translate(' + n1(x) + ' ' + n1(y) + ') scale(' + n1(s * 1000) / 1000 + ')"><path d="' + ic.d + '" fill="' + (solid ? col : 'none') + '" stroke="' + col + '" stroke-width="' + (solid ? 2 : 6) + '" stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd"/></g>';
  }
  function mixHex(a, b, k) {
    var p = function (h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); };
    var x = p(a), y = p(b); return '#' + x.map(function (v, i) { return ('0' + Math.round(v + (y[i] - v) * k).toString(16)).slice(-2); }).join('');
  }
  function monoLogos(name, tag, what, P, A) {
    name = String(name || '').trim(); tag = String(tag || '').trim(); what = (String(what || '') + ' ' + name).toLowerCase(); P = P.toLowerCase(); A = A.toLowerCase(); var K = '#fefefd'; // K = "paper": white on light, the main colour on dark
    var ini = initialsOf(name), one = ini.charAt(0), two = ini.charAt(1) || '';
    var shape = /perfume|scent|fragrance|oud|cologne|spray|mist/.test(what) ? 'bottle' : /school|church|ministry|law|legal|academy|college|security|insurance|estate|property/.test(what) ? 'shield' : 'circle';
    var tagT = function (y, maxW, x, anchor) { return tag ? txt('tagline', tag, x || 300, y, 'Montserrat', 500, 20, maxW || 420, P, { ls: 0.18, upper: true, anchor: anchor }) : ''; };
    var out = [];
    // 1. Emblem: the initials inside a shape that suits the business (a perfume bottle, a crest, or a round seal)
    var em = '', cy = 135;
    if (shape === 'bottle') em = '<rect x="262" y="14" width="76" height="34" rx="6" fill="' + A + '"/><rect x="284" y="48" width="32" height="22" fill="' + A + '"/><rect x="214" y="70" width="172" height="160" rx="26" fill="' + P + '"/><rect x="224" y="80" width="152" height="140" rx="20" fill="none" stroke="' + A + '" stroke-width="3"/>';
    else if (shape === 'shield') em = '<path d="M300 18 L392 46 L392 132 C392 190 352 222 300 244 C248 222 208 190 208 132 L208 46 Z" fill="' + P + '"/><path d="M300 32 L378 56 L378 132 C378 182 344 210 300 229 C256 210 222 182 222 132 L222 56 Z" fill="none" stroke="' + A + '" stroke-width="3"/>';
    else em = '<circle cx="300" cy="128" r="108" fill="' + P + '"/><circle cx="300" cy="128" r="96" fill="none" stroke="' + A + '" stroke-width="3"/>';
    if (shape === 'bottle') cy = 150;
    out.push({ name: shape === 'bottle' ? 'Bottle monogram' : shape === 'shield' ? 'Crest monogram' : 'Round seal', fonts: ['Playfair Display|900', 'Montserrat|500'],
      body: em + txt('', ini, 300, cy + 38, 'Playfair Display', 900, 104, shape === 'bottle' ? 140 : 132, A, { ls: 0.02 }) + txt('name', name, 300, 300, 'Playfair Display', 900, 50, 540, P, { upper: true, ls: 0.04 }) + tagT(340) });
    // 2. Interlocked letters: the two initials overlapping, the second in the accent colour, cut out with a thin gap
    out.push({ name: 'Interlocked letters', fonts: ['Playfair Display|900', 'Montserrat|500'],
      body: (two ? '<text x="252" y="214" text-anchor="middle" font-family="\'Playfair Display\', serif" font-weight="900" font-size="220" fill="' + P + '">' + esc(one) + '</text>' +
        '<text x="352" y="214" text-anchor="middle" font-family="\'Playfair Display\', serif" font-weight="900" font-size="220" fill="' + A + '" opacity="0.95">' + esc(two) + '</text>'
        : '<text x="300" y="214" text-anchor="middle" font-family="\'Playfair Display\', serif" font-weight="900" font-size="230" fill="' + P + '">' + esc(one) + '</text><rect x="240" y="226" width="120" height="6" fill="' + A + '"/>') +
        txt('name', name, 300, 298, 'Montserrat', 800, 40, 540, P, { upper: true, ls: 0.12 }) + tagT(338) });
    // 3. Seal beside the name
    out.push({ name: 'Seal and name', fonts: ['DM Serif Display|400', 'Montserrat|500'],
      body: '<circle cx="122" cy="200" r="104" fill="none" stroke="' + A + '" stroke-width="6"/><circle cx="122" cy="200" r="90" fill="' + P + '"/>' + txt('', ini, 122, 232, 'DM Serif Display', 400, 96, 136, A) +
        '<rect x="252" y="200" width="70" height="5" fill="' + A + '"/>' + txt('name', name, 252, 184, 'DM Serif Display', 400, 72, 330, P, { anchor: 'start' }) + (tag ? txt('tagline', tag, 252, 246, 'Montserrat', 500, 20, 330, P, { ls: 0.16, upper: true, anchor: 'start' }) : '') });
    // 4. Script initial with the name across it
    out.push({ name: 'Script initial', fonts: ['Great Vibes|400', 'Playfair Display|700', 'Montserrat|500'],
      body: '<text x="292" y="200" text-anchor="middle" font-family="\'Great Vibes\', cursive" font-size="200" fill="' + A + '">' + esc(one) + '</text>' +
        txt('name', name, 300, 300, 'Playfair Display', 700, 50, 500, P, { upper: true, ls: 0.06 }) + tagT(342) });
    // 5. Bold block beside the name
    out.push({ name: 'Bold block', fonts: ['Bebas Neue|400', 'Montserrat|500'],
      body: '<rect x="36" y="110" width="180" height="180" rx="22" fill="' + P + '"/><rect x="36" y="262" width="180" height="28" rx="0" fill="' + A + '"/>' + txt('', ini, 126, 250, 'Bebas Neue', 400, 150, 150, A, { ls: 0.02 }) +
        txt('name', name, 240, 222, 'Bebas Neue', 400, 92, 330, P, { anchor: 'start', ls: 0.03 }) + (tag ? txt('tagline', tag, 242, 262, 'Montserrat', 500, 18, 330, P, { ls: 0.16, upper: true, anchor: 'start' }) : '') });
    // 6. Diamond frame
    out.push({ name: 'Diamond frame', fonts: ['DM Serif Display|400', 'Montserrat|500'],
      body: '<rect x="225" y="38" width="150" height="150" fill="none" stroke="' + A + '" stroke-width="5" transform="rotate(45 300 113)"/><rect x="243" y="56" width="114" height="114" fill="' + P + '" transform="rotate(45 300 113)"/>' +
        txt('', ini, 300, 140, 'DM Serif Display', 400, 74, 110, A) + '<line x1="120" y1="262" x2="200" y2="262" stroke="' + A + '" stroke-width="3"/><line x1="400" y1="262" x2="480" y2="262" stroke="' + A + '" stroke-width="3"/>' +
        txt('name', name, 300, 312, 'DM Serif Display', 400, 54, 520, P, { upper: true, ls: 0.08 }) + tagT(352) });
    var two2 = ini.length > 1 ? ini : one;
    // 7. Luxury crest: crown, laurel wreath round the initials, scroll flourishes, rules, name in spaced capitals
    out.push({ name: 'Luxury crest', fonts: ['Cinzel|600', 'Cormorant Garamond|600', 'Montserrat|500'],
      body: crown(300, 22, 34, A) + laurel(300, 124, 70, 110, 250, 9, 14, A) + laurel(300, 124, 70, 70, -70, 9, 14, A) +
        txt('', two2, 300, 146, 'Cormorant Garamond', 600, 70, 104, A) +
        flourish(386, 176, 110, A) + flourish(214, 176, 110, A, true) +
        '<rect x="110" y="210" width="380" height="2.5" fill="' + A + '"/><rect x="110" y="216" width="380" height="1" fill="' + A + '"/>' +
        txt('name', name, 300, 264, 'Cinzel', 600, 46, 520, A, { upper: true, ls: 0.16 }) +
        (tag ? txt('tagline', tag, 300, 296, 'Montserrat', 500, 19, 400, A, { upper: true, ls: 0.22 }) : '') +
        '<rect x="200" y="' + (tag ? 312 : 284) + '" width="200" height="1.5" fill="' + A + '"/>' + flourish(300, tag ? 340 : 312, 90, A) + flourish(300, tag ? 340 : 312, 90, A, true) });
    // 8. Circle stamp: the name round a double ring, the initials in the middle
    out.push({ name: 'Circle stamp', fonts: ['Cormorant Garamond|500', 'Montserrat|500'],
      body: '<circle cx="300" cy="200" r="178" fill="none" stroke="' + P + '" stroke-width="2.5"/><circle cx="300" cy="200" r="118" fill="none" stroke="' + P + '" stroke-width="1.5"/>' +
        arcText('name', name, 300, 200, 148, true, 'Montserrat', 500, 30, P, 0.3, true) + arcText('', tag || name, 300, 200, 160, false, 'Montserrat', 500, 30, P, 0.3, true) +
        '<circle cx="152" cy="200" r="4" fill="' + A + '"/><circle cx="448" cy="200" r="4" fill="' + A + '"/>' +
        '<text x="' + (two ? 282 : 300) + '" y="218" text-anchor="middle" font-family="\'Cormorant Garamond\', serif" font-weight="500" font-size="120" fill="' + P + '">' + esc(one) + '</text>' +
        (two ? '<text x="322" y="262" text-anchor="middle" font-family="\'Cormorant Garamond\', serif" font-weight="500" font-size="120" fill="' + A + '">' + esc(two) + '</text>' : '') });
    // 9. Elegant overlap: two tall thin letters overlapping, name in small spaced capitals
    out.push({ name: 'Elegant overlap', fonts: ['Cormorant Garamond|500', 'Montserrat|500'],
      body: '<text x="' + (two ? 270 : 300) + '" y="220" text-anchor="middle" font-family="\'Cormorant Garamond\', serif" font-weight="500" font-size="240" fill="' + P + '">' + esc(one) + '</text>' +
        (two ? '<text x="330" y="220" text-anchor="middle" font-family="\'Cormorant Garamond\', serif" font-weight="500" font-size="240" fill="' + A + '" opacity="0.95">' + esc(two) + '</text>' : '') +
        txt('name', name, 300, 300, 'Montserrat', 500, 30, 500, P, { upper: true, ls: 0.3 }) + (tag ? txt('tagline', tag, 300, 336, 'Montserrat', 500, 16, 360, A, { upper: true, ls: 0.3 }) : '') });
    // 10. Swoosh initial: a ring with a gap, a big serif initial and two swooshes through it
    out.push({ name: 'Swoosh initial', fonts: ['Playfair Display|700', 'Montserrat|500'],
      body: '<path d="M366 52 A100 100 0 1 0 392 150" fill="none" stroke="' + A + '" stroke-width="7" stroke-linecap="round"/>' +
        '<text x="300" y="186" text-anchor="middle" font-family="\'Playfair Display\', serif" font-weight="700" font-size="150" fill="' + P + '" stroke="' + K + '" stroke-width="8" paint-order="stroke" stroke-linejoin="round">' + esc(one) + '</text>' +
        '<path d="M160 196 C240 148 330 156 450 132 C360 168 260 178 160 196 Z" fill="' + A + '"/><path d="M190 214 C260 188 340 188 430 164 C350 198 270 204 190 214 Z" fill="' + A + '" opacity="0.7"/>' +
        txt('name', name, 300, 292, 'Montserrat', 800, 40, 520, P, { upper: true, ls: 0.14 }) + tagT(330) });
    // 11. Script signature: the name in flowing script with a small sparkle, tagline in spaced capitals
    out.push({ name: 'Script signature', fonts: ['Great Vibes|400', 'Montserrat|500'],
      body: star(300, 92, 16, A) + star(272, 108, 7, A) + star(328, 108, 7, A) +
        txt('name', name, 300, 222, 'Great Vibes', 400, 104, 540, P) +
        '<rect x="230" y="252" width="140" height="2" fill="' + A + '"/>' + (tag ? txt('tagline', tag, 300, 292, 'Montserrat', 500, 20, 460, P, { upper: true, ls: 0.3 }) : '') });
    // 12. Arc seal: initials in a thin ring with the name round the top and fine waves at the bottom
    var waves = ''; for (var wv = 0; wv < 6; wv++) waves += '<path d="M200 ' + (296 + wv * 6) + ' C250 ' + (276 + wv * 6) + ' 300 ' + (316 + wv * 6) + ' 400 ' + (290 + wv * 6) + '" fill="none" stroke="' + A + '" stroke-width="1.6" opacity="' + (1 - wv * 0.12) + '"/>';
    out.push({ name: 'Arc seal', fonts: ['Cormorant Garamond|600', 'Montserrat|500'],
      body: '<defs><clipPath id="arcseal-clip"><circle cx="300" cy="200" r="146"/></clipPath></defs><circle cx="300" cy="200" r="150" fill="none" stroke="' + A + '" stroke-width="3"/>' + arcText('name', name, 300, 200, 124, true, 'Montserrat', 500, 26, P, 0.3, true) +
        txt('', ini, 300, 238, 'Cormorant Garamond', 600, 120, 200, A, { ls: -0.02 }) + '<g clip-path="url(#arcseal-clip)">' + waves + '</g>' });
    // 13. Star badge: a thick ring with the name on top, tagline below, stars at the sides, initial in the middle
    out.push({ name: 'Star badge', fonts: ['Cinzel|600', 'Montserrat|800'],
      body: '<circle cx="300" cy="200" r="186" fill="' + P + '"/><circle cx="300" cy="200" r="178" fill="none" stroke="' + A + '" stroke-width="3"/><circle cx="300" cy="200" r="126" fill="' + K + '"/><circle cx="300" cy="200" r="120" fill="none" stroke="' + A + '" stroke-width="2"/>' +
        arcText('name', name, 300, 200, 146, true, 'Cinzel', 600, 34, A, 0.12, true) + (tag ? arcText('tagline', tag, 300, 200, 162, false, 'Cinzel', 600, 24, A, 0.2, true) : star(300, 356, 9, A) + star(270, 350, 6, A) + star(330, 350, 6, A)) +
        star(140, 200, 11, A) + star(460, 200, 11, A) + txt('', one, 300, 248, 'Cinzel', 600, 140, 180, A) });
    // 14–18. Icon logos: a clean icon that suits what they do, with the name (like the big logo makers)
    var ics = iconsFor(what), i1 = ics[0], i2 = ics[1] || ics[0];
    var nameWords = name.split(/\s+/), w1 = nameWords[0] || name, wRest = nameWords.slice(1).join(' ');
    function twoTone(x, y, size, maxW, anchor, fam, wt, ls) {
      var full = name.toUpperCase(), sz = fitSize(full, fam, wt, size, maxW, ls || 0);
      return '<text id="name" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '" font-family="\'' + fam + '\', sans-serif" font-weight="' + wt + '" font-size="' + sz + '" letter-spacing="' + ((ls || 0) * sz).toFixed(1) + '" fill="' + P + '" data-maxw="' + maxW + '" data-size="' + size + '" data-ls="' + (ls || 0) + '" data-case="upper">' + esc(w1.toUpperCase()) + (wRest ? ' <tspan fill="' + A + '">' + esc(wRest.toUpperCase()) + '</tspan>' : '') + '</text>';
    }
    out.push({ name: 'Icon stacked', fonts: ['Montserrat|800', 'Montserrat|500'],
      body: iconSvg(i1, 240, 22, 120, A) + twoTone(300, 236, 54, 540, 'middle', 'Montserrat', 800, 0.04) + (tag ? txt('tagline', tag, 300, 278, 'Montserrat', 500, 20, 440, P, { upper: true, ls: 0.28 }) : '') });
    out.push({ name: 'Icon beside', fonts: ['Montserrat|800', 'Montserrat|500'],
      body: '<circle cx="128" cy="200" r="86" fill="' + P + '"/><circle cx="128" cy="200" r="76" fill="none" stroke="' + A + '" stroke-width="3"/>' + iconSvg(i1, 88, 160, 80, A) +
        (wRest ? txt('name', w1, 236, 186, 'Montserrat', 800, 66, 340, P, { anchor: 'start', upper: true }) + txt('', wRest, 238, 228, 'Montserrat', 800, 36, 340, A, { anchor: 'start', upper: true, ls: 0.12 })
          : txt('name', name, 236, 210, 'Montserrat', 800, 66, 340, P, { anchor: 'start', upper: true })) + '<rect x="238" y="246" width="80" height="5" fill="' + A + '"/>' +
        (tag ? txt('tagline', tag, 238, 284, 'Montserrat', 500, 18, 330, P, { anchor: 'start', upper: true, ls: 0.2 }) : '') });
    out.push({ name: 'Icon badge', fonts: ['Cinzel|600', 'Montserrat|500'],
      body: '<path d="M300 20 L378 65 V155 L300 200 L222 155 V65 Z" fill="none" stroke="' + A + '" stroke-width="5" stroke-linejoin="round"/><path d="M300 34 L366 72 V148 L300 186 L234 148 V72 Z" fill="' + P + '"/>' + iconSvg(i2, 260, 70, 80, A) +
        txt('name', name, 300, 268, 'Cinzel', 600, 48, 540, P, { upper: true, ls: 0.12 }) + (tag ? txt('tagline', tag, 300, 304, 'Montserrat', 500, 18, 420, A, { upper: true, ls: 0.3 }) : '') });
    out.push({ name: 'Line icon & serif', fonts: ['Cormorant Garamond|600', 'Montserrat|500'],
      body: iconSvg(i2, 255, 30, 90, A) + '<rect x="150" y="146" width="110" height="1.5" fill="' + A + '"/><rect x="340" y="146" width="110" height="1.5" fill="' + A + '"/>' + star(300, 147, 7, A) +
        txt('name', name, 300, 236, 'Cormorant Garamond', 600, 72, 540, P) + (tag ? txt('tagline', tag, 300, 280, 'Montserrat', 500, 18, 420, P, { upper: true, ls: 0.34 }) : '') });
    out.push({ name: 'App icon', fonts: ['Montserrat|800', 'Montserrat|500'],
      body: '<rect x="40" y="110" width="180" height="180" rx="44" fill="' + P + '"/><rect x="58" y="128" width="144" height="144" rx="32" fill="none" stroke="' + A + '" stroke-width="3"/>' + iconSvg(i1, 85, 155, 90, A) +
        (wRest ? txt('name', w1, 246, 196, 'Montserrat', 800, 64, 330, P, { anchor: 'start' }) + txt('', wRest, 248, 240, 'Montserrat', 500, 40, 330, A, { anchor: 'start' })
          : txt('name', name, 246, 214, 'Montserrat', 800, 64, 330, P, { anchor: 'start' })) + (tag ? txt('tagline', tag, 248, 280, 'Montserrat', 500, 18, 330, P, { anchor: 'start', upper: true, ls: 0.2 }) : '') });
    var keys = []; out.forEach(function (l) { l.fonts.forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); }); });
    return Promise.all(keys.map(fontB64)).then(function (b64) {
      var face = {}; keys.forEach(function (k, i) { var p = k.split('|'); face[k] = '@font-face{font-family:\'' + p[0] + '\';font-weight:' + p[1] + ';src:url(data:font/woff2;base64,' + b64[i] + ') format(\'woff2\');}'; });
      return out.map(function (l) {
        return { name: l.name, primary: P, accent: A, paper: K, mono: true,
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><defs><style>' + l.fonts.map(function (k) { return face[k]; }).join('') + '</style></defs>' + l.body + '</svg>' };
      });
    });
  }
  function open(o) {
    o = o || {};
    var g = guess(o), mp = parseMenu(o);
    var menuMode = mp.items.length >= 4;
    var state = { size: 'post', layout: 0, mode: o.kind === 'card' ? 'card' : menuMode ? 'menu' : 'promo', captions: [], theme: themeFrom(o.colours) || (menuMode ? THEMES[1] : THEMES[0]), enhance: true, photoIdx: 0, logoIdx: -1, photos: [], raw: [] };
    var layouts = function () { return state.mode === 'menu' ? MENU_LAYOUTS : state.mode === 'card' ? CARD_PREVIEW : promoList(state.looks); };
    var cd = parseCard(o);
    state.looks = suggestLooks([o.title, o.business, o.words, (o.info || {}).sell, o.style].join(' '));
    state.themePicked = !!themeFrom(o.colours); state.photoTheme = null;
    if (o.prefer) { // "Look 2: Split · Festive" from the order form preview
      var pm = String(o.prefer).match(/^Look (\d): [^·]+(?:· (.+))?$/);
      if (pm) { state.layout = Math.min(layouts().length - 1, Number(pm[1]) - 1); if (pm[2] && lookByName(pm[2].trim()).name === pm[2].trim()) state.looks[state.layout] = pm[2].trim(); }
    }
    // Each option = a layout + a look; colours come from the customer, else option 1 from their photos, else the look's own.
    function themeFor(i) {
      if (state.themePicked) return state.theme;
      if (state.mode === 'card') i = 0; // one brand colour for all three cards
      if (i === 0 && state.photoTheme && !(state.lookTouched || {})[0]) return state.photoTheme;
      var L = lookByName(state.looks[i]); return L.theme ? Object.assign({ name: L.name }, L.theme) : state.theme;
    }
    function withLook(i, fn) {
      var L = lookByName(state.looks[i]), F = FONT, S = SERIF, Hd = HEAD;
      FONT = L.font; SERIF = L.serif; HEAD = L.head || null;
      try { return fn(L, themeFor(i)); } finally { FONT = F; SERIF = S; HEAD = Hd; }
    }
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
      place: el('input', { value: parseMenu(o).place, maxlength: '70', placeholder: 'e.g. Ibadan · Available nationwide' }),
      offer: el('input', { value: menuMode ? '' : g.offer, maxlength: '30', placeholder: 'e.g. 20% OFF or Nationwide delivery (empty for none)' }),
      contact: el('input', { value: g.contact, maxlength: '70' }),
    };
    f.headline.value = g.headline; f.details.value = g.details;
    var showPrices = el('input', { type: 'checkbox' }); showPrices.checked = true;
    var mf = {
      listTitle: el('input', { value: mp.listTitle, maxlength: '40', placeholder: 'e.g. Contact us for / Our menu' }),
      items: el('textarea', { rows: '7', maxlength: '900' }),
      note: el('textarea', { rows: '3', maxlength: '300', placeholder: 'e.g. We also offer spaghetti, rice dishes and soups' }),
      phones: el('input', { value: mp.phones.join(', '), maxlength: '80' }),
      socials: el('input', { value: mp.socials.join(', '), maxlength: '120', placeholder: 'IG @kassytreats, TikTok @kassy_tt, FB Kassy Treats' }),
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
    lg.what.value = (((o.info || {}).sell ? o.info.sell + '. ' : '') + (o.words || '')).replace(/\s+/g, ' ').trim().slice(0, 300);
    lg.style.value = o.style || '';
    var logoOut = el('div', { class: 'st-logos' }), logoMsg = el('p', { class: 'admin-hint' });
    var foil = el('input', { type: 'checkbox' }); foil.addEventListener('change', function () { drawLogos(); });
    var logos = [];
    var logoBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '✨ Make 3 logo ideas', onclick: function () { makeLogos(); } });
    var monoBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '🔤 18 instant logos', onclick: function () { makeMono(); } });
    var logoBox = el('details', { class: 'st-logobox' }, [
      el('summary', { text: '✨ Logo ideas' }),
      el('p', { class: 'admin-hint', text: 'Uses the business name above and the colours you picked. 🔤 Monogram logos are instant: their initials (e.g. GS for Glameenah Scents) in 6 styles, with a perfume bottle, crest or seal to suit the business. ✨ AI makes 3 original logos with a small icon. Change the name, tagline or colours and they update. Download as SVG (sharp at any size) or PNG.' }),
      lab('Tagline', lg.tagline), lab('What they do', lg.what), lab('Style', lg.style), el('label', { class: 'st-check' }, [foil, ' ✨ Gold foil finish (metallic shine on the accent colour)']), el('div', { class: 'admin-actions' }, [monoBtn, logoBtn]), logoMsg,
    ]);
    // onDark: the reversed version for dark backgrounds (main colour becomes white, accent stays).
    function logoSvg(l, onDark) {
      var svg = l.svg.split(l.primary).join(onDark ? '#ffffff' : state.theme.bg.toLowerCase()).split(l.accent).join(state.theme.accent.toLowerCase());
      if (l.paper) svg = svg.split(l.paper).join(onDark ? state.theme.bg.toLowerCase() : '#ffffff');
      var doc = new DOMParser().parseFromString(svg, 'image/svg+xml'), root = doc.documentElement;
      if (root.nodeName.toLowerCase() !== 'svg') return '';
      // Instant logos are rebuilt whenever the name or tagline changes, so their text is already right (and keeps its two colours).
      var n = l.mono ? null : doc.getElementById('name'); if (n) n.textContent = f.business.value.trim() || n.textContent;
      var t = l.mono ? null : doc.getElementById('tagline'); if (t) { if (lg.tagline.value.trim()) t.textContent = lg.tagline.value.trim(); else t.parentNode.removeChild(t); }
      // Gold foil finish: the accent colour becomes a metallic gradient (light → accent → deep → light).
      if (foil.checked) {
        var acc = state.theme.accent.toLowerCase(), uses = root.querySelectorAll('[fill="' + acc + '"],[stroke="' + acc + '"]');
        if (uses.length) {
          var ns = 'http://www.w3.org/2000/svg', defs = root.querySelector('defs') || root.insertBefore(doc.createElementNS(ns, 'defs'), root.firstChild);
          var gr = doc.createElementNS(ns, 'linearGradient'); gr.setAttribute('id', 'sir-foil'); gr.setAttribute('x1', '0'); gr.setAttribute('y1', '0'); gr.setAttribute('x2', '1'); gr.setAttribute('y2', '1');
          [[0, mixHex(acc, '#ffffff', 0.45)], [0.35, acc], [0.6, mixHex(acc, '#000000', 0.3)], [0.8, mixHex(acc, '#ffffff', 0.3)], [1, acc]].forEach(function (st) { var e = doc.createElementNS(ns, 'stop'); e.setAttribute('offset', st[0]); e.setAttribute('stop-color', st[1]); gr.appendChild(e); });
          gr.setAttribute('gradientUnits', 'userSpaceOnUse'); gr.setAttribute('x1', '0'); gr.setAttribute('y1', '0'); gr.setAttribute('x2', '600'); gr.setAttribute('y2', '400');
          defs.appendChild(gr);
          [].forEach.call(uses, function (e) { if (e.getAttribute('fill') === acc) e.setAttribute('fill', 'url(#sir-foil)'); if (e.getAttribute('stroke') === acc) e.setAttribute('stroke', 'url(#sir-foil)'); });
        }
      }
      // Monogram logos: keep the edited name and tagline inside their width.
      [n, t].forEach(function (x) {
        if (!x || !x.parentNode || !x.getAttribute('data-maxw')) return;
        if (x.getAttribute('data-case') === 'upper') x.textContent = x.textContent.toUpperCase();
        var fam = (x.getAttribute('font-family') || '').split(',')[0].replace(/'/g, ''), wt = x.getAttribute('font-weight'), ls = Number(x.getAttribute('data-ls')) || 0;
        var sz = fitSize(x.textContent, fam, wt, Number(x.getAttribute('data-size')), Number(x.getAttribute('data-maxw')), ls);
        x.setAttribute('font-size', sz); if (ls) x.setAttribute('letter-spacing', (ls * sz).toFixed(1));
      });
      // Every bit of text gets a colour of its own (never left to default), so exports always show the words.
      [].forEach.call(root.querySelectorAll('text, textPath, tspan'), function (x) { if (!x.getAttribute('fill') && !(x.parentNode && x.parentNode.getAttribute && x.parentNode.getAttribute('fill'))) x.setAttribute('fill', onDark ? '#ffffff' : state.theme.bg.toLowerCase()); });
      root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      return new XMLSerializer().serializeToString(root);
    }
    // bg: '#ffffff' for a white background (safe in WhatsApp/galleries), null for a see-through PNG.
    function svgToPng(svg, W, cb, bg) {
      var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.then(function () { svgToPng2(svg, W, cb, bg); });
    }
    function svgToPng2(svg, W, cb, bg) {
      var img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = function () { var cv = document.createElement('canvas'); cv.width = W; cv.height = Math.round(W * 2 / 3); var x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); if (bg) { var w = document.createElement('canvas'); w.width = cv.width; w.height = cv.height; var wx = w.getContext('2d'); wx.fillStyle = bg; wx.fillRect(0, 0, w.width, w.height); wx.drawImage(cv, 0, 0); w.__trimFrom = cv; cv = w; } cb(cv); };
      img.src = url;
    }
    function padWhite(cv) { var p = Math.round(cv.width * 0.08), w = document.createElement('canvas'); w.width = cv.width + p * 2; w.height = cv.height + p * 2; var x = w.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(cv, p, p); return w; }
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
    // Logo orders: what the send box can send (the ticked ones, all, or one).
    function sendChoices() {
      if (!o.logoOnly || typeof sendWhich === 'undefined') return;
      var keep = sendWhich.value; sendWhich.innerHTML = '';
      var nTick = logos.filter(function (l) { return l.pick; }).length;
      sendWhich.appendChild(el('option', { value: 'ticked', text: nTick ? 'The ' + nTick + ' I ticked' : 'The ones I tick (tick "Send this" on each)' }));
      sendWhich.appendChild(el('option', { value: 'all', text: 'All ' + logos.length + ' logo options' }));
      logos.forEach(function (l, i) { sendWhich.appendChild(el('option', { value: String(i), text: 'Logo option ' + (i + 1) + ': ' + l.name })); });
      if ([].some.call(sendWhich.options, function (op) { return op.value === keep; })) sendWhich.value = keep;
    }
    function drawLogos() {
      logoOut.innerHTML = '';
      sendChoices();
      logos.forEach(function (l, i) {
        var svg = logoSvg(l); if (!svg) return;
        var light = el('div', { class: 'st-logo st-logo--light' }), dark = el('div', { class: 'st-logo', style: 'background:' + state.theme.bg });
        light.innerHTML = svg; dark.innerHTML = logoSvg(l, true);
        var slug = (f.business.value || 'logo').replace(/\W+/g, '-').toLowerCase() + '-logo-option-' + (i + 1);
        logoOut.appendChild(el('figure', { class: 'st-logocard' }, [el('div', { class: 'st-logopair' }, [light, dark]),
          el('figcaption', { text: 'Option ' + (i + 1) + ': ' + l.name }),
          o.logoOnly ? el('label', { class: 'st-check st-pick' }, [el('input', { type: 'checkbox', checked: l.pick ? '' : null, onchange: function (e) { l.pick = e.target.checked; sendChoices(); if (l.pick) sendWhich.value = 'ticked'; } }), ' Send this']) : null,
          el('div', { class: 'admin-actions' }, [
            el('button', { class: 'admin-btn', type: 'button', text: 'SVG', onclick: function () { save(new Blob([logoSvg(l)], { type: 'image/svg+xml' }), slug + '.svg'); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'PNG', title: 'On a white background: opens the same everywhere (WhatsApp, gallery, print)', onclick: function () { svgToPng(logoSvg(l), 1800, function (cv) { padWhite(trim(cv.__trimFrom || cv)).toBlob(function (b) { save(b, slug + '.png'); }, 'image/png'); }, '#ffffff'); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'See-through PNG', title: 'No background, for putting on other designs', onclick: function () { svgToPng(logoSvg(l), 1800, function (cv) { trim(cv).toBlob(function (b) { save(b, slug + '-transparent.png'); }, 'image/png'); }); } }),
            el('button', { class: 'admin-btn', type: 'button', text: 'White PNG', title: 'White logo with no background, for dark designs (looks empty on a white screen)', onclick: function () { svgToPng(logoSvg(l, true), 1800, function (cv) { trim(cv).toBlob(function (b) { save(b, slug + '-white.png'); }, 'image/png'); }); } }),
            o.logoOnly ? null : el('button', { class: 'admin-btn', type: 'button', text: 'Use on flyer', onclick: function () {
              svgToPng(logoSvg(l), 900, function (cv) { trim(cv).toBlob(function (b) { srcs.push({ url: URL.createObjectURL(b), name: 'logo-option-' + (i + 1) + '.png' }); logoGuess = srcs.length - 1; status.textContent = 'Loading photos…'; loadAll(); }, 'image/png'); });
            } }),
          ])]));
      });
    }
    function makeMono(liked) {
      if (f.business.value.trim().length < 2) { logoMsg.textContent = 'Type the business name first (above).'; f.business.focus(); return; }
      monoBtn.disabled = true; logoMsg.textContent = 'Making monogram logos…';
      loadLookFonts().then(function () { return monoLogos(f.business.value, lg.tagline.value, lg.what.value, state.theme.bg, state.theme.accent); }).then(function (list) {
        var picked = logos.filter(function (l) { return l.pick; }).map(function (l) { return l.name; });
        list.forEach(function (l) { if (picked.indexOf(l.name) > -1) l.pick = true; });
        logos = list.concat(logos.filter(function (l) { return !l.mono; }));
        logoMsg.textContent = liked === true ? logoMsg.textContent : (typeof liked === 'string' ? '⭐ The customer liked “' + liked + '” on the order form. ' : '') + 'Initials used: ' + initialsOf(f.business.value) + '. Shown on white and on your main colour. Change the colours ' + (o.logoOnly ? 'further down' : 'above') + ' to try other looks.';
        drawLogos(); if (liked !== true) logoOut.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function () { logoMsg.textContent = 'Could not make the monograms. Try again.'; }).then(function () { monoBtn.disabled = false; });
    }
    function makeLogos() {
      if (!o.logoApi) { logoMsg.textContent = 'Logo ideas work from the admin page.'; return; }
      if (f.business.value.trim().length < 2) { logoMsg.textContent = 'Type the business name first (above).'; f.business.focus(); return; }
      logoBtn.disabled = true; logoMsg.textContent = 'Drawing 3 logos… (about 15 seconds)';
      o.logoApi({ business: f.business.value.trim(), tagline: lg.tagline.value, what: lg.what.value, style: lg.style.value, primary: state.theme.bg, accent: state.theme.accent })
        .then(function (j) {
          logos = (j.logos || []).map(function (l) { return { name: l.name, svg: l.svg, primary: j.primary, accent: j.accent }; }).concat(logos.filter(function (l) { return l.mono; }));
          logoMsg.textContent = logos.length + ' logo idea(s). Shown on white and on your main colour. Not happy? Change the style words and try again.';
          drawLogos();
          logoOut.scrollIntoView({ behavior: 'smooth', block: 'start' });
        })
        .catch(function (e) { logoMsg.textContent = (e && e.message) || 'Could not make logos. Try again.'; })
        .then(function () { logoBtn.disabled = false; });
    }
    // The instant logos are rebuilt from the new name/tagline/what they do (they fit the words to the space); AI ones just update.
    var monoTimer;
    function refreshMono() { clearTimeout(monoTimer); monoTimer = setTimeout(function () { if (logos.some(function (l) { return l.mono; })) makeMono(true); else drawLogos(); }, 500); }
    lg.tagline.addEventListener('input', refreshMono); f.business.addEventListener('input', refreshMono); lg.what.addEventListener('input', refreshMono);
    if (o.openLogos && !o.logoOnly) { logoBox.open = true; setTimeout(function () { logoBox.scrollIntoView({ block: 'start' }); }, 300); }
    // The customer liked a monogram on the order form: make them straight away and say which one.
    var likedMono = String(o.prefer || '').match(/^Logo idea (\d+): (.+)$/);
    if (likedMono && o.openLogos) setTimeout(function () { makeMono(likedMono[2]); }, 400);

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
    var autoCut = el('input', { type: 'checkbox' }); try { autoCut.checked = localStorage.getItem('sir-autocut') !== '0'; } catch (e) { autoCut.checked = true; }
    autoCut.addEventListener('change', function () { try { localStorage.setItem('sir-autocut', autoCut.checked ? '1' : '0'); } catch (e) {} });
    var bgRow = el('div', { class: 'st-bgrow' }, [bgBtn, bgUndo, bgMsg, el('label', { class: 'st-check' }, [autoCut, ' Cut out the main product automatically'])]);
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
    var cf = {
      name: el('input', { value: cd.name, maxlength: '40', placeholder: 'e.g. Adeyemo Ridwan' }),
      title: el('input', { value: cd.title, maxlength: '50', placeholder: 'e.g. Managing Director' }),
      phones: el('input', { value: cd.phones.join(', '), maxlength: '60', placeholder: 'e.g. 08112999073, 08167550937' }),
      email: el('input', { value: cd.email, maxlength: '60', placeholder: 'e.g. info@business.com' }),
      web: el('input', { value: [cd.web].concat(cd.socials).filter(Boolean).join(', '), maxlength: '120', placeholder: 'e.g. www.business.com, IG @business, TikTok @business' }),
      address: el('textarea', { rows: '2', maxlength: '120', placeholder: 'e.g. No. 12 Atofarati Quarters, Olode, Ibadan' }),
      special: el('input', { value: (o.info || {}).sell || '', maxlength: '70', placeholder: 'Under the name, e.g. Cakes · Small chops · Parfait · Zobo' }),
      services: el('textarea', { rows: '3', placeholder: 'Back of the card, up to 4 lines, e.g. Birthday cakes' }),
      tagline: el('input', { value: cd.tagline, maxlength: '50', placeholder: 'Optional line on the back, e.g. Quality you can trust' }),
    };
    cf.address.value = cd.address;
    cf.services.value = ((o.info || {}).sell || '').split(/,|\band\b/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4).join('\n');
    if (o.kind === 'card' && cd.business && !o.business) f.business.value = cd.business;
    var modeBtns = {};
    var modeRow = el('div', { class: 'st-mode' }, [['menu', '\uD83D\uDCCB Menu / price list'], ['promo', '\uD83D\uDCE3 Promo / offer'], ['card', '\uD83D\uDCB3 Business card']].map(function (m) {
      modeBtns[m[0]] = el('button', { type: 'button', class: 'admin-btn', text: m[1], onclick: function () { setMode(m[0]); } });
      return modeBtns[m[0]];
    }));
    // AI labels for each photo (e.g. "Cakes", "Zobo"), picked from the item list where one fits. Runs once by itself.
    var named = false;
    function nameStuff(force) {
      if ((named && !force) || !o.captionApi) return Promise.resolve();
      var idx = []; var imgs = [];
      state.raw.forEach(function (img, i) {
        if (!img || i === state.logoIdx) return;
        var k = Math.min(1, 512 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        idx.push(i); imgs.push(cv.toDataURL('image/jpeg', 0.8));
      });
      if (!imgs.length) return Promise.resolve();
      named = true; capBtn.disabled = true; capMsg.textContent = 'Naming the photos…';
      return o.captionApi(imgs.slice(0, 6), data().items).then(function (j) {
        (j.labels || []).forEach(function (l, n) { if (idx[n] != null && l && (force || !state.captions[idx[n]])) state.captions[idx[n]] = String(l).slice(0, 24); });
        capMsg.textContent = 'Labels added. Change any of them below.'; refreshSelects(); draw();
      }).catch(function (e) { capMsg.textContent = (e && e.message) || 'Could not name the photos.'; })
        .then(function () { capBtn.disabled = false; });
    }
    function setMode(m) {
      if (state.mode !== m || !o.prefer) state.layout = 0; state.mode = m;
      Object.keys(modeBtns).forEach(function (k) { modeBtns[k].classList.toggle('admin-btn--primary', k === m); });
      promoBox.hidden = m !== 'promo'; menuBox.hidden = m !== 'menu'; cardBox.hidden = m !== 'card';
      notCard.forEach(function (n) { n.hidden = m === 'card'; });
      setBox.hidden = m === 'card' || !setN;
      if (m === 'menu') nameStuff(false);
      draw();
    }
    function lab(text, input) { return el('label', { class: 'st-field' }, [el('span', { text: text }), input]); }
    var ideaMsg = el('small', { class: 'st-bgmsg' }), ideaRow = el('div', { class: 'st-chips' });
    var ideaBtn = el('button', { class: 'admin-btn', type: 'button', text: '\u2728 Headline ideas (AI)', onclick: function () {
      if (!o.ideasApi) { ideaMsg.textContent = 'Works from the admin page.'; return; }
      ideaBtn.disabled = true; ideaMsg.textContent = 'Writing 3 ideas…'; ideaRow.innerHTML = '';
      o.ideasApi({ business: f.business.value, what: (o.info || {}).sell || '', words: o.words || (f.headline.value + '. ' + f.details.value) }).then(function (j) {
        ideaMsg.textContent = 'Tap one to use it (you can still edit).';
        (j.ideas || []).forEach(function (x) { ideaRow.appendChild(el('button', { type: 'button', class: 'st-chip st-idea', onclick: function () { f.headline.value = x.headline; f.details.value = x.line; draw(); } }, [el('b', { text: x.headline }), el('span', { text: x.line })])); });
      }).catch(function (e) { ideaMsg.textContent = (e && e.message) || 'Could not get ideas.'; }).then(function () { ideaBtn.disabled = false; });
    } });
    var promoBox = el('div', { class: 'st-group' }, [el('div', { class: 'st-bgrow' }, [ideaBtn, ideaMsg]), ideaRow, lab('Headline (the big words)', f.headline), lab('Details (smaller text)', f.details), lab('Contact line', f.contact)]);
    var cardBox = el('div', { class: 'st-group' }, [
      lab('Name', cf.name), lab('Job title', cf.title), lab('Phone number(s)', cf.phones), lab('Email', cf.email),
      lab('Website / social handles (e.g. www.kassy.com.ng IG @kassy)', cf.web), lab('Address', cf.address), lab('Line under the name (what you do)', cf.special), lab('Services on the back (up to 4, one per line)', cf.services), lab('Line on the back (optional)', cf.tagline),
      el('p', { class: 'admin-hint', text: 'Print size 3.5 × 2 inches (300 dpi). Downloads give a front and a back for each option. Tap a logo below to put it on the card.' }),
    ]);
    var menuBox = el('div', { class: 'st-group' }, [
      lab('List title', mf.listTitle), lab('Items (one per line)', mf.items), el('label', { class: 'st-check' }, [showPrices, ' Show prices (write them like “Cake - from ₦18,000”)']), lab('Extra note (box)', mf.note),
      lab('Phone numbers', mf.phones), lab('Social handles (write the platform before each: IG, TikTok, FB, X)', mf.socials), lab('Location line', mf.place),
      el('div', { class: 'st-field' }, [el('span', { text: 'Photo labels' }), captionBox, el('div', { class: 'st-bgrow' }, [capBtn, capMsg])]),
    ]);
    // Save what you corrected here back to the order, so the next time the studio opens it starts with it.
    var saveMsg = el('span', { class: 'admin-hint', role: 'status' });
    var saveRow = o.saveApi ? el('div', { class: 'st-bgrow' }, [el('button', { class: 'admin-btn', type: 'button', text: '💾 Save these details to the order', onclick: function (e) {
      var b = e.currentTarget, nums = function (t) { return (String(t).match(PHONE_RE) || []).map(function (p) { return p.replace(/[\s-]/g, ''); }).join(', '); }; PHONE_RE.lastIndex = 0;
      var info = { 'Business name': f.business.value.trim() };
      if (state.mode === 'menu') { info['Phone on design'] = mf.phones.value.trim(); info['Social handles'] = socialList(mf.socials.value).join(', '); info['Address / area'] = mf.place.value.trim(); }
      else if (state.mode === 'card') { info['Name on card'] = cf.name.value.trim(); info['Job title'] = cf.title.value.trim(); info['Phone on design'] = cf.phones.value.trim(); info['Email on design'] = cf.email.value.trim(); info['Address / area'] = cf.address.value.trim();
        var dd = data(); if (dd.cardSocials.length) info['Social handles'] = dd.cardSocials.join(', '); info['Website'] = dd.web || ''; }
      else { var ph = nums(f.contact.value); if (ph) info['Phone on design'] = ph; info['Address / area'] = f.place.value.trim(); }
      b.disabled = true; saveMsg.textContent = 'Saving…';
      o.saveApi(info).then(function () {
        o.info = o.info || {}; if (info['Social handles'] != null) o.info.socials = info['Social handles']; if (info['Address / area'] != null) o.info.address = info['Address / area']; if (info['Phone on design'] != null) o.info.phone = info['Phone on design'];
        saveMsg.textContent = 'Saved ✓ Next time you open the studio for this order, these are filled in.';
      }).catch(function (er) { saveMsg.textContent = (er && er.message) || 'Could not save.'; }).then(function () { b.disabled = false; });
    } }), saveMsg]) : el('span');
    var lookRow = el('div', { class: 'st-chips' }), lookLab = el('div', { class: 'st-field' }, [el('span', { text: 'Look' }), lookRow]);
    var sizeLab = lab('Size', sizeSel), badgeLab = lab('Badge (optional)', f.offer), placeLab = lab('Location line (optional)', f.place);
    var mainPhotoLab = el('div', { class: 'st-field' }, [el('span', { text: 'Main photo (tap one)' }), photoTiles]);
    promoBox.appendChild(placeLab);
    var notCard = [sizeLab, badgeLab, mainPhotoLab, bgRow];
    var panel = el('div', { class: 'st-panel' }, [
      el('h2', { text: '🎨 Design studio' }),
      el('p', { class: 'admin-hint', text: 'Ready designs from the customer’s photos, words and colours (3 for flyers, 4 for menus and price lists). Change anything below; the designs update as you type. Download the best 2–3, put them through the Mockup maker and send as Option 1, 2, 3.' }),
      status,
      sizeLab,
      modeRow,
      lookLab,
      lab('Business name', f.business),
      promoBox, menuBox, cardBox,
      saveRow,
      badgeLab,
      el('div', { class: 'st-field' }, [el('span', { text: 'Colours' }), themeRow, el('div', { class: 'st-custom' }, [c1, c2, el('small', { text: 'or pick your own: main and accent' })])]),
      mainPhotoLab, bgRow, el('div', { class: 'st-field' }, [el('span', { text: 'Logo (tap one)' }), logoTiles]),
      el('label', { class: 'st-check' }, [enh, ' Auto-enhance photos (brighter, richer colour, sharper)']),
      lab('Add more photos from this phone', addPhotos),
      el('p', { class: 'admin-hint', text: 'Tip: if a photo has a messy background, choose another photo or ask the customer for one taken against a plain wall in daylight.' }),
      logoBox,
    ]);
    // Send to the customer straight from here: WhatsApp (the phone's share sheet attaches the pictures) or email.
    var sendWhich = el('select', { 'aria-label': 'What to send' }, [el('option', { value: 'this', text: 'This design' }), el('option', { value: 'all', text: 'All options' })]);
    var sendNote = el('textarea', { rows: '2', maxlength: '600', placeholder: 'Message (optional), e.g. Here are your options. Which one do you like?' });
    var sendMsg = el('span', { class: 'admin-hint', role: 'status' });
    function logoFiles() {
      var slug = (f.business.value || 'logo').replace(/\W+/g, '-').toLowerCase();
      var pick = sendWhich.value === 'all' ? logos.map(function (l, i) { return i; }) : sendWhich.value === 'ticked' ? logos.map(function (l, i) { return l.pick ? i : -1; }).filter(function (i) { return i > -1; }) : [Number(sendWhich.value)];
      if (!pick.length) return Promise.reject(new Error('Tick "Send this" on the logos you want to send first.'));
      return Promise.all(pick.filter(function (i) { return logos[i]; }).map(function (i) {
        return new Promise(function (ok) {
          svgToPng(logoSvg(logos[i]), 1500, function (cv) {
            var w = document.createElement('canvas'); w.width = cv.width; w.height = cv.height; var x = w.getContext('2d');
            x.fillStyle = '#ffffff'; x.fillRect(0, 0, w.width, w.height); x.drawImage(cv, 0, 0);
            w.toBlob(function (b) { ok(new File([b], slug + '-logo-option-' + (i + 1) + '.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
          });
        });
      }));
    }
    function designFiles() {
      if (o.logoOnly) return logos.length ? logoFiles() : Promise.reject(new Error('Make the logos first.'));
      var idx = sendWhich.value === 'all' ? layouts().map(function (L, i) { return i; }) : [state.layout];
      var slug = (f.business.value || 'design').replace(/\W+/g, '-').toLowerCase(), jobs = [];
      idx.forEach(function (i) {
        if (state.mode === 'card') ['front', 'back'].forEach(function (side) { jobs.push({ name: slug + '-card-option-' + (i + 1) + '-' + side + '.jpg', make: function () { var cv = document.createElement('canvas'); cv.width = CARD.w; cv.height = CARD.h; withLook(i, function (L, t) { CARD_PREVIEW[i].side(side, cv.getContext('2d'), CARD.w, CARD.h, data(), t); }); return cv; } }); });
        else jobs.push({ name: slug + '-option-' + (i + 1) + '.jpg', make: function () { var sz = SIZES[state.size]; return render(i, sz.w, sz.h); } });
      });
      return Promise.all(jobs.map(function (j) { return new Promise(function (ok) { j.make().toBlob(function (b) { ok(new File([b], j.name, { type: 'image/jpeg' })); }, 'image/jpeg', 0.9); }); }));
    }
    var defaultText = function (n) { return (sendNote.value.trim() || ('Hello' + (o.customer ? ' ' + o.customer : '') + ', here ' + (n > 1 ? 'are your design options. Which one do you like (Option 1, 2, 3…)?' : 'is your design. Let us know if you\'d like any changes.'))) + '\n\nSIRRADDO GLOBAL LIMITED'; };
    var waBtn = el('button', { class: 'admin-btn admin-btn--wa', type: 'button', text: '📲 Send on WhatsApp', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true; sendMsg.textContent = 'Preparing…';
      designFiles().then(function (files) {
        var text = defaultText(files.length);
        if (navigator.canShare && navigator.canShare({ files: files })) {
          return navigator.share({ files: files, text: text }).then(function () { sendMsg.textContent = 'Shared ✓ Then set the stage to “Options sent”.'; }, function (er) { sendMsg.textContent = er && er.name === 'AbortError' ? '' : 'Couldn\'t open sharing: downloading instead.'; });
        }
        // No file sharing here (e.g. a laptop): download the pictures and open their chat with the message.
        files.forEach(function (fl, n) { setTimeout(function () { var a = el('a', { href: URL.createObjectURL(fl), download: fl.name }); document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000); }, n * 400); });
        if (o.phone) window.open('https://wa.me/' + o.phone + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
        sendMsg.textContent = 'Downloaded. Attach the picture' + (files.length > 1 ? 's' : '') + ' in the WhatsApp chat (📎).';
      }).catch(function (er) { sendMsg.textContent = (er && er.message) || 'Couldn\'t prepare the design.'; }).then(function () { b.disabled = false; });
    } });
    var mailBtn = o.emailApi ? el('button', { class: 'admin-btn', type: 'button', text: '✉️ Email to customer', disabled: o.email ? null : '', title: o.email ? 'Send to ' + o.email : 'No email address on this order', onclick: function (e) {
      var b = e.currentTarget; b.disabled = true; sendMsg.textContent = 'Sending…';
      designFiles().then(function (files) {
        return Promise.all(files.map(function (fl) { return new Promise(function (ok) { var rd = new FileReader(); rd.onload = function () { ok({ name: fl.name, data: rd.result }); }; rd.readAsDataURL(fl); }); }))
          .then(function (imgs) { return o.emailApi(imgs, sendNote.value.trim()); });
      }).then(function (j) { sendMsg.textContent = 'Emailed to ' + ((j && j.to) || o.email) + ' ✓'; })
        .catch(function (er) { sendMsg.textContent = (er && er.message) || 'Couldn\'t send the email.'; }).then(function () { b.disabled = !o.email; });
    } }) : null;
    var sendBox = el('div', { class: 'st-send' }, [el('b', { text: 'Send to the customer' }), el('div', { class: 'st-bgrow' }, [sendWhich, waBtn, mailBtn]), sendNote, sendMsg,
      o.email ? null : (o.emailApi ? el('p', { class: 'admin-hint', text: 'No email on this order: WhatsApp only.' }) : null)]);
    var dl = el('div', { class: 'admin-actions' }, [
      el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Download this design', onclick: function () { download(state.layout); } }),
      el('button', { class: 'admin-btn', type: 'button', text: 'Download all', onclick: function () { layouts().forEach(function (L, i) { setTimeout(function () { download(i); }, i * 900); }); } }),
    ]);
    wrap.appendChild(el('div', { class: 'st-box' }, [el('div', { class: 'st-top' }, [el('b', { text: o.title || 'Design studio' }), close]),
      el('div', { class: 'st-body' }, [el('div', { class: 'st-left' }, [sampleBox, preview, thumbs, dl, sendBox, logoOut]), panel])]));
    document.body.appendChild(wrap); document.body.style.overflow = 'hidden';
    // Logo orders: the flyer drafts aren't needed. Show the logo tools first and make the monograms straight away.
    if (o.logoOnly) {
      [preview, thumbs, dl].forEach(function (x) { if (x) x.hidden = true; });
      [].forEach.call(panel.children, function (ch) { if (!(ch.tagName === 'H2' || ch === logoBox || ch === status || ch.contains(f.business) || ch.contains(themeRow))) ch.hidden = true; });
      var left = logoOut.parentNode;
      left.insertBefore(el('p', { class: 'admin-hint st-logohint', text: '🔤 Logo order: 18 instant logos from their name, initials and what they do are below (tick ✨ Gold foil for a metallic finish) (✨ AI further down makes 3 more with an icon; the colours are there too). Pick the best, download PNG/SVG, or send them straight to the customer.' }), left.firstChild);
      left.insertBefore(logoMsg, left.children[1]); left.insertBefore(logoOut, left.children[2]);
      logoBox.open = true;
      if (!likedMono) setTimeout(function () { makeMono(); }, 400);
    }

    THEMES.forEach(function (t) { themeRow.appendChild(el('button', { type: 'button', class: 'st-swatch', title: t.name, style: 'background:linear-gradient(135deg,' + t.bg + ' 60%,' + t.accent + ' 60%)', onclick: function () { state.theme = t; state.themePicked = true; c1.value = t.bg; c2.value = t.accent; draw(); } })); });
    if (o.colours && themeFrom(o.colours)) themeRow.insertBefore(el('button', { type: 'button', class: 'st-swatch', title: 'Their colours: ' + o.colours, style: 'background:linear-gradient(135deg,' + state.theme.bg + ' 60%,' + state.theme.accent + ' 60%);outline:2px solid #D9A21B', onclick: function () { state.theme = themeFrom(o.colours); state.themePicked = true; c1.value = state.theme.bg; c2.value = state.theme.accent; draw(); } }), themeRow.firstChild);
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
      themeRow.insertBefore(el('button', { type: 'button', class: 'st-swatch', title: 'From their sample', style: 'background:linear-gradient(135deg,' + t.bg + ' 60%,' + t.accent + ' 60%);outline:2px dashed #D9A21B', onclick: function () { state.theme = t; state.themePicked = true; c1.value = t.bg; c2.value = t.accent; draw(); } }), themeRow.firstChild);
      if (!themeFrom(o.colours)) { state.theme = t; state.themePicked = true; c1.value = t.bg; c2.value = t.accent; draw(); }
    });
    function customTheme() { state.themePicked = true; state.theme = { name: 'Custom', bg: c1.value, accent: c2.value, light: lum(c1.value) < 0.5 ? '#F7F5F0' : '#FFFFFF' }; draw(); }
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
      var rawItems = mf.items.value.split('\n').map(function (x) { x = x.replace(/^[\s•\-*◆♦]+/, '').trim(); return showPrices.checked ? x : x.replace(/\s*[-–—:]\s*(?:from\s+)?\u20A6\s?[\d,]+.*$/i, ''); }).filter(Boolean).filter(notBrand);
      return { business: f.business.value.trim(), headline: f.headline.value.trim(), details: f.details.value.trim(), offer: f.offer.value.trim().toUpperCase(), contact: withPlace(f.contact.value.trim(), f.place.value.trim()),
        photo: main, photos: [main].concat(photos.filter(function (p) { return p !== main; })), logo: state.logoIdx >= 0 ? state.raw[state.logoIdx] : null,
        logoWide: state.logoIdx >= 0 && state.raw[state.logoIdx] ? state.raw[state.logoIdx].width / state.raw[state.logoIdx].height > 1.3 : false,
        listTitle: mf.listTitle.value.trim(), items: rawItems.map(function (x) { return splitItem(x).name; }), descs: rawItems.map(function (x) { return splitItem(x).desc; }),
        note: mf.note.value.trim(), phones: mf.phones.value.split(/[,;\/]+/).map(function (x) { return x.trim(); }).filter(Boolean),
        socials: socialList(mf.socials.value),
        place: mf.place.value.trim(),
        special: cf.special.value.trim(), services: cf.services.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 4),
        name: cf.name.value.trim(), title: cf.title.value.trim(), email: cf.email.value.trim(), address: cf.address.value.trim().replace(/\s*\n\s*/g, ', '), tagline: cf.tagline.value.trim(),
        web: (cf.web.value.match(/(?:^|[\s,])((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}[^\s,]*)/i) || ['', ''])[1], cardSocials: socialList(cf.web.value.replace(/(?:^|[\s,])(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}[^\s,]*/ig, ',').replace(/^[\s,]+/, '')), cardPhones: cf.phones.value.split(/[,;\/]+/).map(function (x) { return x.trim(); }).filter(Boolean),
        menuPhotos: state.photos.map(function (img, i) { return { img: img, caption: state.captions[i] || '', i: i }; }).filter(function (x) { return x.img && x.i !== state.logoIdx; }) };
    }
    function render(i, W, H, photoIdx, over) {
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var c = cv.getContext('2d'); c.textBaseline = 'alphabetic';
      var keep = state.photoIdx; if (photoIdx != null) state.photoIdx = photoIdx;
      try {
        withLook(i, function (L, t) {
          PHT = { t: t, icon: /invit/i.test(o.interest || o.service || '') ? 'heart' : iconsFor([f.business.value, o.words, (o.info || {}).sell].join(' '))[0], label: false };
          try {
            layouts()[i].draw(c, W, H, over ? Object.assign(data(), over) : data(), t);
            if (state.mode !== 'card') { texture(c, W, H, L.tex); deco(c, W, H, L.deco, t); seasonMark(c, W, H, seasonOf(o.interest || o.service), t); }
          } finally { PHT = null; }
        });
      } finally { state.photoIdx = keep; }
      return cv;
    }
    // ---------- Set of N (e.g. 5 social media posts): same look, a different photo on each ----------
    var setN = Math.max(0, Math.min(10, Number(o.set) || 0));
    // Each post can have its own words (empty = the main headline); the AI can write them from the photo labels.
    var igOut = el('div', { class: 'st-vid' }), setMsg = el('small', { class: 'st-bgmsg' }), setText = [], setWords = el('div', { class: 'st-setwords' });
    for (var sn = 0; sn < setN; sn++) (function (n) {
      var h = el('input', { maxlength: '60', placeholder: 'Post ' + (n + 1) + ' headline (empty = main headline)' }), l = el('input', { maxlength: '110', placeholder: 'Post ' + (n + 1) + ' line' });
      h.addEventListener('input', function () { drawSet(); }); l.addEventListener('input', function () { drawSet(); });
      setText.push({ h: h, l: l }); setWords.appendChild(el('div', { class: 'st-bgrow' }, [h, l]));
    })(sn);
    // Each post's words: what you typed for it, else the customer's own post list ("Post 1: …"), else that photo's caption.
    var orderPosts = String(o.words || '').split(/\s*(?:post\s*\d+\s*[:\-–.]|\n)\s*/i).map(function (x) { return tidy(x).replace(/[.\s]+$/, '').trim(); }).filter(function (x) { return x.length > 2; });
    function setOver(n) {
      var x = setText[n]; if (x && x.h.value.trim()) return { headline: x.h.value.trim(), details: x.l.value.trim() };
      if (orderPosts.length > 1 && orderPosts[n]) { var g = guess({ words: orderPosts[n], business: f.business.value }); return { headline: g.headline, details: g.details, offer: g.offer || f.offer.value.trim().toUpperCase() }; }
      var pi = setOrder()[n], cap = pi != null && state.captions[pi];
      return cap ? { headline: cap.charAt(0).toUpperCase() + cap.slice(1) } : null;
    }
    function writeSet() {
      if (!o.ideasApi) { setMsg.textContent = 'Works from the admin page.'; return; }
      // First make sure every photo in the set has a name (the AI looks at each photo), so each headline matches its own picture.
      var missing = setOrder().some(function (pi) { return pi != null && !state.captions[pi]; });
      setMsg.textContent = missing ? 'Looking at the photos…' : 'Writing ' + setN + ' posts…';
      (missing ? nameStuff(true) : Promise.resolve()).then(function () {
      var topics = setOrder().map(function (pi) { return (pi != null && state.captions[pi]) || ''; });
      setMsg.textContent = 'Writing ' + setN + ' posts…';
      return o.ideasApi({ business: f.business.value, what: (o.info || {}).sell || '', words: o.words || f.headline.value, topics: topics }).then(function (j) {
        (j.ideas || []).forEach(function (x, n) { if (setText[n]) { setText[n].h.value = x.headline; setText[n].l.value = x.line; } });
        setMsg.textContent = 'Done. Each headline names the item in its photo. Edit any of them.'; drawSet();
      });
      }).catch(function (e) { setMsg.textContent = (e && e.message) || 'Could not write them.'; });
    }
    var setRow = el('div', { class: 'st-thumbs' }), setBox = el('div', { class: 'st-set', hidden: setN ? null : '' }, [
      el('b', { text: 'The set of ' + setN + ' (same look as the chosen option, a different photo on each)' }), setRow,
      el('div', { class: 'st-bgrow' }, [el('button', { class: 'admin-btn', type: 'button', text: '\u2728 Write different words for each post (AI)', onclick: writeSet }), setMsg]), setWords,
      el('button', { class: 'admin-btn', type: 'button', text: '\uD83D\uDCF1 Instagram grid preview', onclick: function () {
        var posts = setOrder().map(function (pi, n) { return render(state.layout, 540, 675, pi, setOver(n)); }).reverse();
        var dd = data(), cv = igGrid(posts, { logo: dd.logo, business: dd.business, socials: (dd.socials || []).concat(dd.cardSocials || []), place: dd.place || f.place.value, special: (o.info || {}).sell }, themeFor(state.layout));
        var url = cv.toDataURL('image/jpeg', 0.9); igOut.innerHTML = '';
        igOut.appendChild(el('img', { src: url, alt: 'Instagram grid preview', style: 'max-width:320px;width:100%;border-radius:12px;border:1px solid #ddd' }));
        igOut.appendChild(el('a', { class: 'admin-btn', href: url, download: 'instagram-grid-preview.jpg', text: 'Download preview' }));
      } }), igOut,
      el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: 'Download the set of ' + setN, onclick: function () { setOrder().forEach(function (pi, n) { setTimeout(function () { download(state.layout, pi, n + 1, setOver(n)); }, n * 450); }); } }),
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
      setOrder().forEach(function (pi, n) { setRow.appendChild(el('div', { class: 'st-thumb' }, [render(state.layout, Math.round(s.w * 0.16), Math.round(s.h * 0.16), pi, setOver(n)), el('span', { text: 'Post ' + (n + 1) })])); });
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
    // Mockups of the chosen option, and "Add to portfolio" (before = their photo, after = this design).
    function shot(i, maxSide) {
      var s0 = state.mode === 'card' ? { w: CARD.w, h: CARD.h } : SIZES[state.size === 'a4' ? 'post' : state.size], cv;
      if (state.mode === 'card') { cv = document.createElement('canvas'); cv.width = CARD.w; cv.height = CARD.h; withLook(i, function (L, t) { CARD_PREVIEW[i].side('front', cv.getContext('2d'), CARD.w, CARD.h, data(), t); }); }
      else cv = render(i, s0.w, s0.h);
      var k = Math.min(1, (maxSide || 1400) / Math.max(cv.width, cv.height)); if (k === 1) return cv;
      var out = document.createElement('canvas'); out.width = Math.round(cv.width * k); out.height = Math.round(cv.height * k); out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height); return out;
    }
    var mkOut = el('div', { class: 'mk-out' }), pfMsg = el('small', { class: 'st-bgmsg' });
    var pfCat = el('select', null, ['Food & drinks', 'Fashion & beauty', 'Events & invitations', 'Church & mosque', 'Business & services', 'Sales & offers'].map(function (c) { return el('option', { value: c, text: c }); }));
    var pfTitle = el('input', { maxlength: '60', placeholder: 'Title, e.g. Kassy Treats menu' });
    var extraBox = el('div', { class: 'st-set' }, [
      el('b', { text: 'Show it off' }),
      el('div', { class: 'admin-actions' }, [
        el('button', { class: 'admin-btn', type: 'button', text: '🖼️ Mockups of this option', onclick: function () {
          mkOut.innerHTML = '';
          if (state.mode === 'card') { // print mockup of the chosen card: front and back on a table
            var sides = ['front', 'back'].map(function (side) { var cv = document.createElement('canvas'); cv.width = CARD.w; cv.height = CARD.h; withLook(state.layout, function (L, t) { CARD_PREVIEW[state.layout].side(side, cv.getContext('2d'), CARD.w, CARD.h, data(), t); }); return cv; });
            var mk = cardMockup(sides[0], sides[1], themeFor(state.layout)).toDataURL('image/jpeg', 0.9);
            mkOut.appendChild(el('figure', { class: 'mk-fig' }, [el('img', { src: mk, alt: 'Printed business cards' }), el('a', { class: 'admin-btn', href: mk, download: 'business-card-mockup.jpg', text: 'Download mockup' })]));
            return;
          }
          if (!o.mockupApi) { pfMsg.textContent = 'Works from the admin page.'; return; }
          o.mockupApi(shot(state.layout, 1600), 'Option ' + (state.layout + 1)).forEach(function (m) {
            var data = m[1].toDataURL('image/jpeg', 0.9), name = (f.business.value || 'design').replace(/\W+/g, '-').toLowerCase() + '-option-' + (state.layout + 1) + '-' + m[0].toLowerCase().replace(/\W+/g, '-') + '.jpg';
            mkOut.appendChild(el('figure', { class: 'mk-fig' }, [el('img', { src: data, alt: m[0] }), el('a', { class: 'admin-btn', href: data, download: name, text: 'Download ' + m[0].toLowerCase() })]));
          });
        } }),
      ]),
      mkOut,
      el('div', { class: 'st-bgrow' }, [pfCat, pfTitle]),
      el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: '⭐ Add to portfolio (website)', onclick: function () {
        if (!o.galleryApi) { pfMsg.textContent = 'Works from the admin page.'; return; }
        if (!confirm('Only add work the customer is happy for you to show. Add it to the website portfolio?')) return;
        var i = state.photoIdx, src = (state.orig && state.orig[i]) || state.raw[i], before = '';
        if (src && state.mode !== 'card') { var k = Math.min(1, 1400 / Math.max(src.width, src.height)), bc = document.createElement('canvas'); bc.width = Math.round(src.width * k); bc.height = Math.round(src.height * k); bc.getContext('2d').drawImage(src, 0, 0, bc.width, bc.height); try { before = bc.toDataURL('image/jpeg', 0.85); } catch (e) { before = ''; } }
        pfMsg.textContent = 'Saving…';
        o.galleryApi({ cat: pfCat.value, title: pfTitle.value || f.business.value, before: before, after: shot(state.layout, 1400).toDataURL('image/jpeg', 0.88) })
          .then(function () { pfMsg.textContent = 'Added. It shows on sirraddo.com.ng/design under “Before and after”.'; }).catch(function (e) { pfMsg.textContent = (e && e.message) || 'Could not save.'; });
      } }), pfMsg]),
    ]);
    vidBox.parentNode.insertBefore(extraBox, vidBox.nextSibling);
    function pickMime() {
      var list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
      for (var i = 0; i < list.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(list[i])) return list[i];
      return '';
    }
    function makeVideo() {
      if (state.mode === 'card') { vidMsg.textContent = 'Videos are for posts and flyers, not business cards.'; return; }
      var mime = pickMime();
      if (!mime || !HTMLCanvasElement.prototype.captureStream) { vidMsg.textContent = 'This browser can\'t record video. Open admin in Chrome and try again.'; return; }
      var W = 720, H = 1280, DUR = 12, FPS = 30;
      var art = render(state.layout, W, H);
      var cv = el('canvas', { style: 'position:fixed;left:-9999px;top:0' }); cv.width = W; cv.height = H; document.body.appendChild(cv);
      var c = cv.getContext('2d'), bg = themeFor(state.layout).bg;
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
      var s = curSize(), scale = 540 / s.w;
      var big = render(state.layout, Math.round(s.w * scale * 2), Math.round(s.h * scale * 2));
      preview.width = big.width; preview.height = big.height; preview.getContext('2d').drawImage(big, 0, 0);
      drawSet(); drawLookChips();
      thumbs.innerHTML = '';
      layouts().forEach(function (L, i) {
        var t = render(i, Math.round(s.w * 0.24), Math.round(s.h * 0.24));
        var b = el('button', { type: 'button', class: 'st-thumb' + (i === state.layout ? ' is-on' : ''), title: L.name, onclick: function () { state.layout = i; draw(); } }, [t, el('span', { text: 'Option ' + (i + 1) + ': ' + L.name }), el('small', { class: 'st-lookname', text: state.looks[i] })]);
        thumbs.appendChild(b);
      });
    }
    function drawLookChips() {
      lookRow.innerHTML = '';
      LOOKS.forEach(function (L) {
        lookRow.appendChild(el('button', { type: 'button', class: 'st-chip' + (state.looks[state.layout] === L.name ? ' is-on' : ''), text: L.name, onclick: function () { state.looks[state.layout] = L.name; (state.lookTouched = state.lookTouched || {})[state.layout] = true; draw(); } }));
      });
      lookLab.firstChild.textContent = 'Look for Option ' + (state.layout + 1) + ' (fonts, texture, finishing touches)';
    }
    function curSize() { return state.mode === 'card' ? { w: CARD.w, h: CARD.h * 2 + 90 } : SIZES[state.size]; }
    function saveCanvas(cv, name) {
      cv.toBlob(function (b) {
        var a = el('a', { href: URL.createObjectURL(b), download: name });
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }, 'image/png');
    }
    function download(i, photoIdx, postNo, over) {
      if (state.mode === 'card') { // a front and a back, print size
        var slug = (cf.name.value || f.business.value || 'card').replace(/\W+/g, '-').toLowerCase();
        ['front', 'back'].forEach(function (side, n) {
          setTimeout(function () {
            var cv = document.createElement('canvas'); cv.width = CARD.w; cv.height = CARD.h;
            withLook(i, function (L, t) { CARD_PREVIEW[i].side(side, cv.getContext('2d'), CARD.w, CARD.h, data(), t); });
            saveCanvas(cv, slug + '-card-option-' + (i + 1) + '-' + side + '.png');
          }, n * 350);
        });
        return;
      }
      var s = SIZES[state.size], cv = render(i, s.w, s.h, photoIdx, over);
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
    showPrices.addEventListener('change', draw);
    Object.keys(mf).forEach(function (k) { mf[k].addEventListener('input', draw); });
    Object.keys(cf).forEach(function (k) { cf[k].addEventListener('input', draw); });
    sizeSel.addEventListener('change', function () { state.size = sizeSel.value; draw(); });
    photoSel.addEventListener('change', function () { state.photoIdx = Number(photoSel.value); bgUndo.hidden = !(state.orig && state.orig[state.photoIdx]); bgMsg.textContent = ''; draw(); });
    logoSel.addEventListener('change', function () { state.logoIdx = Number(logoSel.value); refreshSelects(); draw(); });
    enh.addEventListener('change', function () { state.enhance = enh.checked; process(); draw(); });
    addPhotos.addEventListener('change', function () {
      Array.prototype.forEach.call(addPhotos.files, function (file) { srcs.push({ url: URL.createObjectURL(file), name: file.name }); });
      addPhotos.value = ''; status.textContent = 'Loading photos…'; loadAll();
    });
    var fontsReady = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('900 40px Inter'), document.fonts.load('500 40px Inter'), document.fonts.load('800 40px Inter')]).catch(function () {}) : Promise.resolve();
    fontsReady = Promise.all([fontsReady, loadLookFonts()]);
    fontsReady.then(loadAll).then(function () {
      state.photoTheme = state.themePicked ? null : photoTheme(state.raw[state.photoIdx]);
      if (state.photoTheme) themeRow.insertBefore(el('button', { type: 'button', class: 'st-swatch', title: 'From their photos', style: 'background:linear-gradient(135deg,' + state.photoTheme.bg + ' 60%,' + state.photoTheme.accent + ' 60%);outline:2px dotted #D9A21B', onclick: function () { state.theme = state.photoTheme; state.themePicked = true; c1.value = state.theme.bg; c2.value = state.theme.accent; draw(); } }), themeRow.firstChild);
      setMode(state.mode);
      // Products look premium cut out with a soft glow: done once for the main photo when the box is ticked.
      if (autoCut.checked && o.bgApi && state.mode === 'promo' && state.raw[state.photoIdx] && !state.raw[state.photoIdx].__cut) cutMain();
    });
    return { draw: draw, render: render, state: state };
  }

  window.SirStudio = { open: open, preview: previewDesigns, monograms: function (name, what, colours) { var t = themeFrom(colours) || { bg: '#13234B', accent: '#C9A24B' }; return loadLookFonts().then(function () { return monoLogos(name, '', what, t.bg, t.accent); }); }, guess: guess, themeFrom: themeFrom, parseMenu: parseMenu };
})();
