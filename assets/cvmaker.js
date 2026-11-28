/* CV maker (Admin → a CV order → 📄 CV maker).
   The AI drafts the CV (and cover letter) from the order; you check the facts with the customer, pick one of
   2 clean layouts and download PDF previews, then the final PDF and Word files. Both layouts are one column
   with real text, so company screening software (ATS) can read them. Drafts are saved on the order. */
(function () {
  'use strict';
  var A4W = 595.28, A4H = 841.89, M = 50; // A4 in points, margin
  var LAYOUTS = { classic: 'Option 1 · Classic', modern: 'Option 2 · Modern' };

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] == null) continue; if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function loadScript(src) {
    return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { bad(new Error('Could not load ' + src)); }; document.head.appendChild(s); });
  }
  // The PDF's built-in fonts only have Western letters: naira and fancy punctuation become plain ones.
  function plain(s) {
    return String(s == null ? '' : s).replace(/₦/g, 'N').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...').replace(/•/g, '-')
      .replace(/[^\n\x20-\x7E -ÿ]/g, '');
  }

  // ---------- text <-> CV ----------
  // Jobs: "Role | Company | Place | Dates" then "- bullet" lines; a blank line between jobs.
  function jobsToText(list) { return (list || []).map(function (j) { return [j.role, j.company, j.place, j.dates].join(' | ').replace(/( \| )+$/, '') + (j.bullets || []).map(function (b) { return '\n- ' + b; }).join(''); }).join('\n\n'); }
  function textToJobs(t) {
    return String(t || '').split(/\n\s*\n/).map(function (blk) {
      var lines = blk.split('\n').map(function (l) { return l.trim(); }).filter(Boolean); if (!lines.length) return null;
      var h = lines[0].replace(/^[-•]\s*/, '').split('|').map(function (x) { return x.trim(); });
      return { role: h[0] || '', company: h[1] || '', place: h[2] || '', dates: h[3] || '', bullets: lines.slice(1).map(function (l) { return l.replace(/^[-•*]\s*/, ''); }).filter(Boolean) };
    }).filter(Boolean);
  }
  function eduToText(list) { return (list || []).map(function (e) { return [e.qualification, e.school, e.dates, e.note].join(' | ').replace(/( \| )+$/, ''); }).join('\n'); }
  function textToEdu(t) { return String(t || '').split('\n').map(function (l) { var p = l.split('|').map(function (x) { return x.trim(); }); return p[0] || p[1] ? { qualification: p[0] || '', school: p[1] || '', dates: p[2] || '', note: p[3] || '' } : null; }).filter(Boolean); }
  function lines(t) { return String(t || '').split('\n').map(function (l) { return l.replace(/^[-•*]\s*/, '').trim(); }).filter(Boolean); }

  // ---------- layout: a list of pages, each a list of drawing steps (shared by the PDF, the preview and Word) ----------
  function layout(cv, style, kind, measure) {
    var accent = cv.accent || '#13254F', ink = '#1F2937', grey = '#5B6472';
    var W = A4W - 2 * M, pages = [[]], y = M, page = pages[0];
    var modern = style === 'modern';
    function add(op) { page.push(op); }
    function newPage() { page = []; pages.push(page); y = M; }
    function need(h) { if (y + h > A4H - M) newPage(); }
    function wrap(text, size, bold, width) {
      var words = plain(text).split(/\s+/).filter(Boolean), out = [], cur = '';
      words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (measure(t, size, bold) > width && cur) { out.push(cur); cur = w; } else cur = t; });
      if (cur) out.push(cur); return out;
    }
    function para(text, o) {
      o = o || {}; var size = o.size || 10, lh = size * 1.38, x = M + (o.indent || 0), width = W - (o.indent || 0);
      wrap(text, size, o.bold, width).forEach(function (l, i) {
        need(lh); add({ t: 'text', x: x, y: y + size, s: size, b: o.bold, i: o.italic, c: o.color || ink, text: l, align: o.align });
        if (o.bullet && i === 0) add({ t: 'dot', x: M + (o.indent || 0) - 8, y: y + size * 0.62, r: 1.5, c: o.color || ink });
        y += lh;
      });
    }
    function center(text, size, bold, color) { wrap(text, size, bold, W).forEach(function (l) { need(size * 1.3); add({ t: 'text', x: A4W / 2, y: y + size, s: size, b: bold, c: color, text: l, align: 'center' }); y += size * 1.3; }); }
    function heading(title) {
      need(40); y += 12;
      add({ t: 'text', x: M, y: y + 11, s: 11, b: true, c: accent, text: plain(title.toUpperCase()) });
      if (modern) add({ t: 'rect', x: M, y: y + 15, w: 28, h: 2.2, c: accent });
      else add({ t: 'line', x1: M, y1: y + 16, x2: A4W - M, y2: y + 16, c: '#C9CED6', w: 0.8 });
      y += 24;
    }
    function rowWithDate(left, right, size, bold) {
      need(size * 1.4);
      var rw = right ? measure(plain(right), size - 1, false) + 10 : 0, l = wrap(left, size, bold, W - rw);
      l.forEach(function (t, i) { add({ t: 'text', x: M, y: y + size, s: size, b: bold, c: ink, text: t }); if (i === 0 && right) add({ t: 'text', x: A4W - M, y: y + size, s: size - 1, c: grey, text: plain(right), align: 'right' }); y += size * 1.35; });
    }
    var contact = [cv.contact.phone, cv.contact.email, cv.contact.location, cv.contact.link].filter(Boolean).join('  |  ');
    // Header
    if (modern) {
      add({ t: 'rect', x: 0, y: 0, w: A4W, h: 10, c: accent });
      y = M - 6;
      wrap(cv.name || 'Full name', 24, true, W).forEach(function (l) { add({ t: 'text', x: M, y: y + 24, s: 24, b: true, c: accent, text: l }); y += 28; });
      if (cv.headline) { add({ t: 'text', x: M, y: y + 12, s: 12, b: true, c: ink, text: plain(cv.headline) }); y += 18; }
      if (contact) wrap(contact, 9.5, false, W).forEach(function (l) { add({ t: 'text', x: M, y: y + 9.5, s: 9.5, c: grey, text: l }); y += 13; });
      y += 4;
    } else {
      center(cv.name || 'Full name', 22, true, '#111827');
      if (cv.headline) center(cv.headline, 11.5, false, accent);
      if (contact) center(contact, 9.5, false, grey);
      y += 2; add({ t: 'line', x1: M, y1: y + 4, x2: A4W - M, y2: y + 4, c: accent, w: 1.4 }); y += 8;
    }
    if (kind === 'letter') {
      var L = cv.letter || {};
      y += 16; para(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), { color: grey });
      y += 8; lines(L.to).forEach(function (l) { para(l); });
      y += 10; if (L.subject) para(L.subject.toUpperCase(), { bold: true });
      y += 8; para(L.greeting || 'Dear Hiring Manager,');
      (L.paragraphs || []).forEach(function (p) { y += 7; para(p, { size: 10.5 }); });
      y += 12; para(L.closing || 'Yours faithfully,'); y += 26; para(cv.name, { bold: true });
      return pages;
    }
    if (cv.summary) { heading('Profile'); para(cv.summary, { size: 10.2 }); }
    if ((cv.experience || []).length) {
      heading('Work experience');
      cv.experience.forEach(function (j, k) {
        if (k) y += 6; need(46);
        rowWithDate(modern ? [j.role, j.company].filter(Boolean).join(' - ') : j.role || j.company, j.dates, 10.6, true);
        var sub = modern ? j.place : [j.company, j.place].filter(Boolean).join(', ');
        if (sub && !(modern ? false : !j.role)) para(sub, { size: 9.8, italic: true, color: grey });
        (j.bullets || []).forEach(function (b) { para(b, { indent: 14, bullet: true }); });
      });
    }
    if ((cv.education || []).length) {
      heading('Education');
      cv.education.forEach(function (e, k) { if (k) y += 4; need(30); rowWithDate(e.qualification || e.school, e.dates, 10.4, true); if (e.qualification && e.school) para(e.school, { size: 9.8, italic: true, color: grey }); if (e.note) para(e.note, { size: 9.8 }); });
    }
    if ((cv.skills || []).length) { heading('Skills'); para(cv.skills.join('  |  ')); }
    if ((cv.certifications || []).length) { heading('Certifications'); cv.certifications.forEach(function (c) { para(c, { indent: 14, bullet: true }); }); }
    if ((cv.extras || []).length) { heading('Additional information'); cv.extras.forEach(function (c) { para(c, { indent: 14, bullet: true }); }); }
    if (cv.referees) { heading('Referees'); para(cv.referees); }
    return pages;
  }

  // ---------- drawing ----------
  function hexRgb(h) { var n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function pdfMeasure(doc) { return function (t, s, b) { doc.setFont('helvetica', b ? 'bold' : 'normal'); return doc.getStringUnitWidth(t) * s; }; }
  function toPdf(cv, style, kinds, mark) {
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' }), first = true;
    doc.setProperties({ title: plain((cv.name || 'CV') + (kinds.length > 1 || kinds[0] === 'cv' ? ' - CV' : ' - Cover letter')), creator: 'SIRRADDO' });
    kinds.forEach(function (kind) {
      layout(cv, style, kind, pdfMeasure(doc)).forEach(function (ops) {
        if (!first) doc.addPage(); first = false;
        ops.forEach(function (o) {
          var c = hexRgb(o.c || '#000000');
          if (o.t === 'text') { doc.setFont('helvetica', o.b ? (o.i ? 'bolditalic' : 'bold') : o.i ? 'italic' : 'normal'); doc.setFontSize(o.s); doc.setTextColor(c[0], c[1], c[2]); doc.text(o.text, o.x, o.y, o.align ? { align: o.align } : undefined); }
          else if (o.t === 'line') { doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(o.w); doc.line(o.x1, o.y1, o.x2, o.y2); }
          else if (o.t === 'rect') { doc.setFillColor(c[0], c[1], c[2]); doc.rect(o.x, o.y, o.w, o.h, 'F'); }
          else if (o.t === 'dot') { doc.setFillColor(c[0], c[1], c[2]); doc.circle(o.x, o.y, o.r, 'F'); }
        });
        if (mark) { doc.setFont('helvetica', 'bold'); doc.setFontSize(80); doc.setTextColor(232, 232, 236); doc.text('PREVIEW', A4W / 2 - 170, A4H / 2 + 120, { angle: 35 }); }
      });
    });
    return doc;
  }
  function canvasMeasure() { var c = document.createElement('canvas').getContext('2d'); return function (t, s, b) { c.font = (b ? 'bold ' : '') + s + 'px Helvetica, Arial, sans-serif'; return c.measureText(t).width; }; }
  function toCanvas(ops, width, mark) {
    var k = width / A4W, cv = document.createElement('canvas'); cv.width = Math.round(width); cv.height = Math.round(A4H * k);
    var c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.scale(k, k);
    ops.forEach(function (o) {
      c.fillStyle = c.strokeStyle = o.c || '#000';
      if (o.t === 'text') { c.font = (o.i ? 'italic ' : '') + (o.b ? 'bold ' : '') + o.s + 'px Helvetica, Arial, sans-serif'; c.textAlign = o.align || 'left'; c.fillText(o.text, o.x, o.y); }
      else if (o.t === 'line') { c.lineWidth = o.w; c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2, o.y2); c.stroke(); }
      else if (o.t === 'rect') c.fillRect(o.x, o.y, o.w, o.h);
      else if (o.t === 'dot') { c.beginPath(); c.arc(o.x, o.y, o.r, 0, Math.PI * 2); c.fill(); }
    });
    if (mark) { c.save(); c.translate(A4W / 2, A4H / 2); c.rotate(-0.6); c.font = 'bold 80px Helvetica, Arial, sans-serif'; c.fillStyle = 'rgba(200,200,210,.45)'; c.textAlign = 'center'; c.fillText('PREVIEW', 0, 0); c.restore(); }
    return cv;
  }

  // ---------- Word (.docx): built here, no library ----------
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) { // [{ name, data: Uint8Array }] → Blob (no compression)
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    function u16(v) { return [v & 255, v >> 8 & 255]; } function u32(v) { return [v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255]; }
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      var head = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(33), u32(crc), u32(sz), u32(sz), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, f.data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(33), u32(crc), u32(sz), u32(sz), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += head.length + name.length + sz;
    });
    var cs = central.reduce(function (a, b) { return a + b.length; }, 0);
    return new Blob(parts.concat(central, [new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cs), u32(off), u16(0)))]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  function x(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function toDocx(cv, style, kind) {
    var accent = (cv.accent || '#13254F').slice(1), modern = style === 'modern', body = [];
    function run(t, o) { o = o || {}; return '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>' + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') + '<w:color w:val="' + (o.c || '1F2937') + '"/><w:sz w:val="' + Math.round((o.s || 10) * 2) + '"/></w:rPr><w:t xml:space="preserve">' + x(t) + '</w:t></w:r>'; }
    function p(runs, o) { o = o || {}; return '<w:p><w:pPr>' + (o.keep ? '<w:keepNext/>' : '') + (o.border ? '<w:pBdr><w:bottom w:val="single" w:sz="' + (o.border === 'accent' ? 10 : 4) + '" w:space="1" w:color="' + (o.border === 'accent' ? accent : 'C9CED6') + '"/></w:pBdr>' : '') + (o.tab ? '<w:tabs><w:tab w:val="right" w:pos="9900"/></w:tabs>' : '') + '<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 60 : o.after) + '"/>' + (o.ind ? '<w:ind w:left="360" w:hanging="220"/>' : '') + (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + runs + '</w:p>'; }
    var contact = [cv.contact.phone, cv.contact.email, cv.contact.location, cv.contact.link].filter(Boolean).join('  |  ');
    var jc = modern ? null : 'center';
    body.push(p(run(cv.name || '', { b: true, s: modern ? 24 : 22, c: modern ? accent : '111827' }), { jc: jc, after: 40 }));
    if (cv.headline) body.push(p(run(cv.headline, { s: modern ? 12 : 11.5, b: modern, c: modern ? '1F2937' : accent }), { jc: jc, after: 40 }));
    if (contact) body.push(p(run(contact, { s: 9.5, c: '5B6472' }), { jc: jc, after: 120, border: modern ? null : 'accent' }));
    function head(t) { body.push(p(run(t.toUpperCase(), { b: true, s: 11, c: accent }), { before: 200, after: 80, keep: true, border: modern ? null : 'grey' })); }
    function bullet(t) { body.push(p(run('•\t', {}) + run(t, {}), { ind: true, after: 30 })); }
    function dated(l, r) { body.push(p(run(l, { b: true, s: 10.6 }) + (r ? run('\t' + r, { s: 9.6, c: '5B6472' }) : ''), { tab: true, before: 100, after: 20, keep: true })); }
    if (kind === 'letter') {
      var L = cv.letter || {};
      body.push(p(run(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), { c: '5B6472' }), { before: 240, after: 160 }));
      lines(L.to).forEach(function (l) { body.push(p(run(l), { after: 0 })); });
      if (L.subject) body.push(p(run(L.subject.toUpperCase(), { b: true }), { before: 200, after: 160 }));
      body.push(p(run(L.greeting || 'Dear Hiring Manager,'), { after: 140 }));
      (L.paragraphs || []).forEach(function (t) { body.push(p(run(t, { s: 10.5 }), { after: 140 })); });
      body.push(p(run(L.closing || 'Yours faithfully,'), { before: 120, after: 480 }));
      body.push(p(run(cv.name || '', { b: true })));
    } else {
      if (cv.summary) { head('Profile'); body.push(p(run(cv.summary))); }
      if ((cv.experience || []).length) { head('Work experience'); cv.experience.forEach(function (j) { dated(modern ? [j.role, j.company].filter(Boolean).join(' - ') : j.role || j.company, j.dates); var sub = modern ? j.place : [j.company, j.place].filter(Boolean).join(', '); if (sub && (modern || j.role)) body.push(p(run(sub, { i: true, s: 9.8, c: '5B6472' }), { after: 40 })); (j.bullets || []).forEach(bullet); }); }
      if ((cv.education || []).length) { head('Education'); cv.education.forEach(function (e) { dated(e.qualification || e.school, e.dates); if (e.qualification && e.school) body.push(p(run(e.school, { i: true, s: 9.8, c: '5B6472' }), { after: 30 })); if (e.note) body.push(p(run(e.note, { s: 9.8 }))); }); }
      if ((cv.skills || []).length) { head('Skills'); body.push(p(run(cv.skills.join('  |  ')))); }
      if ((cv.certifications || []).length) { head('Certifications'); cv.certifications.forEach(bullet); }
      if ((cv.extras || []).length) { head('Additional information'); cv.extras.forEach(bullet); }
      if (cv.referees) { head('Referees'); body.push(p(run(cv.referees))); }
    }
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var enc = new TextEncoder();
    return zipStore([
      { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
      { name: '_rels/.rels', data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
      { name: 'word/document.xml', data: enc.encode(doc) },
    ]);
  }

  // ---------- the CV maker window ----------
  function open(o) {
    var r = o.request, api = o.api, cv = null, kind = 'cv';
    var wantsLetter = /cover letter/i.test(r.interest || '');
    var wrap = el('div', { class: 'st-wrap', role: 'dialog', 'aria-label': 'CV maker' });
    var msg = el('p', { class: 'admin-hint', text: 'Loading…' });
    var f = {
      name: el('input', { maxlength: '80' }), headline: el('input', { maxlength: '120', placeholder: 'e.g. Accountant / Customer service officer' }),
      phone: el('input', { maxlength: '60' }), email: el('input', { maxlength: '100' }), location: el('input', { maxlength: '80', placeholder: 'e.g. Ibadan, Oyo State' }), link: el('input', { maxlength: '120', placeholder: 'LinkedIn or portfolio (optional)' }),
      summary: el('textarea', { rows: '4', maxlength: '900' }),
      experience: el('textarea', { rows: '10', maxlength: '6000', placeholder: 'Role | Company | Place | Dates\n- What they did, starting with a verb\n- Another result\n\n(blank line between jobs)' }),
      education: el('textarea', { rows: '4', maxlength: '1500', placeholder: 'Qualification | School | Dates | Grade or note (one per line)' }),
      skills: el('textarea', { rows: '3', maxlength: '1500', placeholder: 'One per line or separated by commas' }),
      certifications: el('textarea', { rows: '2', maxlength: '1500', placeholder: 'One per line' }),
      extras: el('textarea', { rows: '2', maxlength: '1500', placeholder: 'NYSC, languages, volunteering, awards (one per line)' }),
      referees: el('input', { maxlength: '400' }),
      lTo: el('textarea', { rows: '3', maxlength: '200', placeholder: 'The Hiring Manager\nCompany name\nCity' }), lSubject: el('input', { maxlength: '140' }), lGreeting: el('input', { maxlength: '80' }),
      lBody: el('textarea', { rows: '9', maxlength: '6000', placeholder: 'Paragraphs, with a blank line between them' }), lClosing: el('input', { maxlength: '60' }),
      layout: el('select', null, Object.keys(LAYOUTS).map(function (k) { return el('option', { value: k, text: LAYOUTS[k] }); })), accent: el('input', { type: 'color', value: '#13254F' }),
    };
    var questions = el('div', { class: 'admin-card', style: 'display:none' });
    var letterBox = el('details', { class: 'st-logobox' }, [el('summary', { text: '✉️ Cover letter' }), lab('To (one line each)', f.lTo), lab('Subject', f.lSubject), lab('Greeting', f.lGreeting), lab('Letter', f.lBody), lab('Closing', f.lClosing)]);
    var tabs = el('div', { class: 'st-thumbs' }), previews = el('div', { class: 'st-thumbs' });
    function lab(t, i) { return el('label', { class: 'st-field' }, [el('span', { text: t }), i]); }

    function fill(c) {
      cv = c; f.name.value = c.name || ''; f.headline.value = c.headline || ''; f.phone.value = c.contact.phone || ''; f.email.value = c.contact.email || ''; f.location.value = c.contact.location || ''; f.link.value = c.contact.link || '';
      f.summary.value = c.summary || ''; f.experience.value = jobsToText(c.experience); f.education.value = eduToText(c.education); f.skills.value = (c.skills || []).join('\n');
      f.certifications.value = (c.certifications || []).join('\n'); f.extras.value = (c.extras || []).join('\n'); f.referees.value = c.referees || '';
      var L = c.letter || {}; f.lTo.value = L.to || ''; f.lSubject.value = L.subject || ''; f.lGreeting.value = L.greeting || 'Dear Hiring Manager,'; f.lBody.value = (L.paragraphs || []).join('\n\n'); f.lClosing.value = L.closing || 'Yours faithfully,';
      if (c.letter || wantsLetter) letterBox.open = true;
      f.layout.value = c.layout || 'classic'; f.accent.value = c.accent || '#13254F';
      showQuestions(c.questions || []); draw();
    }
    function read() {
      var hasLetter = wantsLetter || f.lBody.value.trim();
      cv = { name: f.name.value.trim(), headline: f.headline.value.trim(), contact: { phone: f.phone.value.trim(), email: f.email.value.trim(), location: f.location.value.trim(), link: f.link.value.trim() },
        summary: f.summary.value.trim(), experience: textToJobs(f.experience.value), education: textToEdu(f.education.value),
        skills: f.skills.value.split(/\n|,(?![^(]*\))/).map(function (s) { return s.trim(); }).filter(Boolean), certifications: lines(f.certifications.value), extras: lines(f.extras.value), referees: f.referees.value.trim(),
        letter: hasLetter ? { to: f.lTo.value.trim(), subject: f.lSubject.value.trim(), greeting: f.lGreeting.value.trim(), paragraphs: f.lBody.value.split(/\n\s*\n/).map(function (s) { return s.replace(/\s*\n\s*/g, ' ').trim(); }).filter(Boolean), closing: f.lClosing.value.trim() } : null,
        questions: (cv && cv.questions) || [], layout: f.layout.value, accent: f.accent.value };
      return cv;
    }
    function showQuestions(qs) {
      questions.innerHTML = ''; questions.style.display = qs.length ? '' : 'none'; if (!qs.length) return;
      var text = 'Hello ' + String(r.name || '').split(' ')[0] + ', thank you for your CV order. A few quick questions so your CV is accurate:\n' + qs.map(function (q, i) { return (i + 1) + '. ' + q; }).join('\n');
      questions.appendChild(el('strong', { text: '❓ Ask the customer before sending' }));
      questions.appendChild(el('ol', null, qs.map(function (q) { return el('li', { text: q }); })));
      questions.appendChild(el('p', { class: 'admin-hint', text: 'Anything marked [ask] in the CV is waiting for their answer. Never send a CV with facts they haven\'t confirmed.' }));
      if (o.phone) questions.appendChild(el('a', { class: 'admin-btn admin-btn--wa', href: 'https://wa.me/' + o.phone + '?text=' + encodeURIComponent(text), target: '_blank', rel: 'noopener', text: 'Ask on WhatsApp' }));
    }
    var timer;
    function draw() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        read(); var m = canvasMeasure();
        tabs.innerHTML = ''; ['cv'].concat(cv.letter ? ['letter'] : []).forEach(function (k) {
          tabs.appendChild(el('button', { type: 'button', class: 'admin-btn' + (kind === k ? ' admin-btn--primary' : ''), text: k === 'cv' ? 'CV' : 'Cover letter', onclick: function () { kind = k; draw(); } }));
        });
        if (!cv.letter) kind = 'cv';
        previews.innerHTML = '';
        Object.keys(LAYOUTS).forEach(function (style) {
          var pages = layout(cv, style, kind, m), box = el('button', { type: 'button', class: 'st-thumb' + (f.layout.value === style ? ' is-on' : ''), onclick: function () { f.layout.value = style; draw(); } });
          pages.forEach(function (ops, i) { var c = toCanvas(ops, 520); c.style.width = '260px'; c.style.boxShadow = '0 4px 14px rgba(0,0,0,.15)'; c.style.marginBottom = '6px'; box.appendChild(c); });
          box.appendChild(el('span', { text: LAYOUTS[style] + ' · ' + pages.length + ' page' + (pages.length > 1 ? 's' : '') }));
          previews.appendChild(box);
        });
      }, 250);
    }
    function fileName(style, k, ext) { return (String(cv.name || r.name || 'CV').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'CV') + '-' + (k === 'letter' ? 'Cover-letter' : 'CV') + (style ? '-' + (style === 'classic' ? 'Option-1' : 'Option-2') : '') + '.' + ext; }
    function deliver(blob, name) {
      var file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) return navigator.share({ files: [file], title: name }).catch(function () {});
      var a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }
    function kinds() { return ['cv'].concat(read().letter ? ['letter'] : []); }
    function pdfReady() { return window.jspdf ? Promise.resolve() : loadScript('/assets/vendor/jspdf.umd.min.js'); }
    function previewsPdf() {
      if (/\[ask\]/i.test(JSON.stringify(read()))) msg.textContent = 'Note: some lines still say [ask]. Fine for a preview, but ask the customer before the final.';
      pdfReady().then(function () { Object.keys(LAYOUTS).forEach(function (style) { var d = toPdf(cv, style, kinds(), true); deliver(d.output('blob'), fileName(style, 'cv', 'pdf').replace('-CV-', '-CV-preview-')); }); save(true); })
        .catch(function (e) { msg.textContent = e.message; });
    }
    function finalPdf() {
      if (/\[ask\]/i.test(JSON.stringify(read()))) { msg.textContent = 'Some lines still say [ask]. Get the answers from the customer and fill them in first.'; return; }
      pdfReady().then(function () { kinds().forEach(function (k) { deliver(toPdf(cv, f.layout.value, [k], false).output('blob'), fileName('', k, 'pdf')); }); save(true); }).catch(function (e) { msg.textContent = e.message; });
    }
    function finalWord() {
      if (/\[ask\]/i.test(JSON.stringify(read()))) { msg.textContent = 'Some lines still say [ask]. Get the answers from the customer and fill them in first.'; return; }
      kinds().forEach(function (k) { deliver(toDocx(cv, f.layout.value, k), fileName('', k, 'docx')); }); save(true);
    }
    function save(quiet) {
      return api({ action: 'cv_save', id: r.id, cv: read() }).then(function () { if (!quiet) msg.textContent = '💾 Saved on this order.'; }).catch(function (e) { msg.textContent = 'Not saved: ' + e.message; });
    }
    function draft() {
      if (cv && cv.name && !confirm('Replace what is here with a new AI draft?')) return;
      msg.textContent = '✨ Reading their order and old CV… (up to a minute)'; aiBtn.disabled = true;
      api({ action: 'cv_draft', id: r.id }).then(function (j) { fill(j.cv); msg.textContent = '✨ Draft ready. Check every fact with the customer, then download the previews.'; })
        .catch(function (e) { msg.textContent = e.message; }).then(function () { aiBtn.disabled = false; });
    }
    var aiBtn = el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '✨ Draft with AI', onclick: draft });
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', draw); f[k].addEventListener('change', draw); });

    var box = el('div', { class: 'st-box' }, [
      el('div', { class: 'st-top' }, [el('strong', { text: '📄 CV maker · ' + (r.name || '') + ' · ' + (r.interest || '') }), el('button', { class: 'admin-btn', type: 'button', text: '✕ Close', onclick: function () { save(true); wrap.remove(); document.body.style.overflow = ''; } })]),
      el('div', { class: 'st-body' }, [
        el('div', { class: 'st-left' }, [tabs, previews, el('p', { class: 'admin-hint', text: 'Tap a layout to choose it. Both are one column with real text, so company screening software can read them.' })]),
        el('div', { class: 'st-panel' }, [
          el('div', { class: 'admin-actions' }, [aiBtn, el('button', { class: 'admin-btn', type: 'button', text: '💾 Save', onclick: function () { save(false); } })]), msg, questions,
          el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn admin-btn--primary', type: 'button', text: '1️⃣ PDF previews (both options)', onclick: previewsPdf })]),
          el('div', { class: 'admin-actions' }, [el('button', { class: 'admin-btn', type: 'button', text: '2️⃣ Final PDF', onclick: finalPdf }), el('button', { class: 'admin-btn', type: 'button', text: '2️⃣ Final Word', onclick: finalWord })]),
          window.SirReview ? window.SirReview.button('🔍 AI check before sending', function () { return { kind: 'cv', cv: read() }; }, function (p) { return api(Object.assign({ action: 'review_work', id: r.id }, p)); }) : null,
          el('p', { class: 'admin-hint', text: 'Send both previews (watermarked) on WhatsApp; they pick one. Up to 2 rounds of changes, then send the final PDF and Word (so they can update it later).' }),
          el('div', { class: 'st-field' }, [el('span', { text: 'Layout and colour' }), el('div', { class: 'st-custom' }, [f.layout, f.accent])]),
          lab('Full name', f.name), lab('Job title they want', f.headline),
          el('div', { class: 'st-custom', style: 'flex-wrap:wrap' }, [lab('Phone', f.phone), lab('Email', f.email)]), el('div', { class: 'st-custom', style: 'flex-wrap:wrap' }, [lab('Location', f.location), lab('Link', f.link)]),
          lab('Profile (3–4 lines)', f.summary), lab('Work experience', f.experience), lab('Education', f.education), lab('Skills', f.skills),
          lab('Certifications', f.certifications), lab('Additional information', f.extras), lab('Referees', f.referees), letterBox,
        ]),
      ]),
    ]);
    wrap.appendChild(box); document.body.appendChild(wrap); document.body.style.overflow = 'hidden';
    api({ action: 'cv_get', id: r.id }).then(function (j) {
      if (j.cv) { fill(j.cv); msg.textContent = 'Saved draft loaded.'; }
      else { fill({ name: r.name || '', contact: { phone: r.contact || '', email: r.email || '' }, referees: 'Available on request', questions: [] }); msg.textContent = 'No draft yet. Tap ✨ Draft with AI to start from their order and old CV.'; }
    }).catch(function (e) { msg.textContent = e.message; });
  }

  window.SirCV = { open: open, _layout: layout, _toDocx: toDocx, _toPdf: toPdf, _textToJobs: textToJobs, _jobsToText: jobsToText };
})();
