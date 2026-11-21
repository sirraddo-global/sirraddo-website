// Project brief form (brief.html). Questions come from /api/brief for the customer's package.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var token = new URLSearchParams(location.search).get('t') || '';
  var data = null;        // from the server
  var answers = {};       // current answers
  var files = {};         // uploaded files by field
  var saveTimer = null;
  var dirty = false;
  var saving = false;

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else if (k === 'value') n.value = v;
      else n.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c != null && c !== false) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function message(text, kind) { var m = $('brief-message'); m.textContent = text || ''; m.className = 'brief-message' + (kind ? ' is-' + kind : ''); }
  function showError(text) {
    $('brief-loading').hidden = true; $('brief-app').hidden = true;
    var e = $('brief-error'); e.hidden = false; e.textContent = '';
    e.appendChild(el('h1', { text: 'We could not open your form' }));
    e.appendChild(el('p', { text: text }));
    e.appendChild(el('p', null, [el('a', { class: 'btn btn--gold', href: 'https://wa.me/2348167550937', target: '_blank', rel: 'noopener', text: 'WhatsApp us' })]));
  }
  function api(method, body, path) {
    return fetch((path || '/api/brief') + (method === 'GET' ? '?t=' + encodeURIComponent(token) : ''), {
      method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong'), j); return j; });
    });
  }

  // ---------- Rendering ----------
  function isEmpty(f) {
    var v = f.type === 'files' ? (files[f.key] || []) : answers[f.key];
    if (f.type === 'confirm') return v !== true;
    if (Array.isArray(v)) return v.length === 0;
    return !v;
  }
  function progress() {
    var all = [], req = [];
    data.sections.forEach(function (s) { s.fields.forEach(function (f) { all.push(f); if (f.required) req.push(f); }); });
    var done = all.filter(function (f) { return !isEmpty(f); }).length;
    var reqLeft = req.filter(isEmpty).length;
    $('brief-bar').style.width = Math.round(100 * done / all.length) + '%';
    $('brief-progress-text').textContent = done + ' of ' + all.length + ' answered' + (reqLeft ? ' · ' + reqLeft + ' required still empty' : ' · all required answers done');
    if (typeof drawDots === 'function' && $('brief-steps') && $('brief-steps').children.length) drawDots();
  }
  function changed() {
    dirty = true;
    progress();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { save(false, true); }, 2500);
  }

  function fieldId(f) { return 'f-' + f.key; }
  function label(f) {
    return el('label', { for: fieldId(f) }, [f.label, f.required ? el('span', { class: 'brief-req', text: ' *' }) : null]);
  }
  function hint(f) { return f.hint ? el('p', { class: 'brief-hint', id: fieldId(f) + '-hint', text: f.hint }) : null; }

  function renderField(f) {
    var v = answers[f.key];
    var describedBy = f.hint ? fieldId(f) + '-hint' : null;
    if (f.type === 'text' || f.type === 'email' || f.type === 'tel') {
      var inp = el('input', { id: fieldId(f), type: f.type, value: v || '', 'aria-describedby': describedBy, 'aria-required': f.required ? 'true' : null,
        autocomplete: f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'off', inputmode: f.type === 'tel' ? 'tel' : null });
      inp.addEventListener('input', function () { answers[f.key] = inp.value; changed(); });
      return el('div', { class: 'brief-field' }, [label(f), hint(f), inp]);
    }
    if (f.type === 'textarea') {
      var ta = el('textarea', { id: fieldId(f), rows: 3, value: v || '', 'aria-describedby': describedBy, 'aria-required': f.required ? 'true' : null });
      ta.addEventListener('input', function () { answers[f.key] = ta.value; changed(); });
      return el('div', { class: 'brief-field' }, [label(f), hint(f), ta]);
    }
    if (f.type === 'select') {
      var sel = el('select', { id: fieldId(f), 'aria-describedby': describedBy, 'aria-required': f.required ? 'true' : null });
      sel.appendChild(new Option('Choose…', '', false, !v));
      f.options.forEach(function (o) { sel.appendChild(new Option(o, o, false, o === v)); });
      sel.addEventListener('change', function () { answers[f.key] = sel.value; changed(); });
      return el('div', { class: 'brief-field' }, [label(f), hint(f), sel]);
    }
    if (f.type === 'multi') {
      var chosen = Array.isArray(v) ? v.slice() : [];
      var fs = el('fieldset', { class: 'brief-field', id: fieldId(f) }, [el('legend', null, [f.label, f.required ? el('span', { class: 'brief-req', text: ' *' }) : null]), hint(f)]);
      var box = el('div', { class: 'brief-options' });
      var inputs = [];
      function limit() {
        inputs.forEach(function (i) { i.disabled = !i.checked && f.max && chosen.length >= f.max; });
      }
      f.options.forEach(function (o, idx) {
        var cb = el('input', { type: 'checkbox', id: fieldId(f) + '-' + idx });
        cb.checked = chosen.indexOf(o) !== -1;
        cb.addEventListener('change', function () {
          chosen = f.options.filter(function (x, j) { return inputs[j].checked; });
          answers[f.key] = chosen; limit(); changed();
        });
        inputs.push(cb);
        box.appendChild(el('label', { class: 'brief-option', for: cb.id }, [cb, o]));
      });
      limit();
      fs.appendChild(box);
      return fs;
    }
    if (f.type === 'confirm') {
      var c = el('input', { type: 'checkbox', id: fieldId(f) });
      c.checked = v === true;
      c.addEventListener('change', function () { answers[f.key] = c.checked; changed(); });
      return el('div', { class: 'brief-field' }, [el('label', { class: 'brief-confirm', for: fieldId(f) }, [c, el('span', null, [f.label, f.required ? el('span', { class: 'brief-req', text: ' *' }) : null])])]);
    }
    if (f.type === 'rows') return renderRows(f);
    if (f.type === 'files') return renderFiles(f);
    return el('div');
  }

  // ---------- Product photos (shared by the product cards and the "other photos" box) ----------
  var redraws = [];
  function redrawAll() { redraws.forEach(function (fn) { fn(); }); }
  function slug(s) { return String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function keyOf(file) { return slug(String(file.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/-[0-9a-f]{16}$/, '')); }
  // Same rules as the website: chosen → named after it → in order.
  function autoFor(prods, list) {
    var out = {}, taken = {};
    prods.forEach(function (r) { if (r.photo && list.some(function (x) { return x.url === r.photo; })) { out[r.photo] = r; taken[r.photo] = 1; } });
    var extra = {}; prods.forEach(function (r) { (Array.isArray(r.photos) ? r.photos : []).forEach(function (u) { extra[u] = 1; }); });
    var free = list.filter(function (x) { return !taken[x.url] && !extra[x.url]; });
    var restP = prods.filter(function (r) { return !(r.photo && taken[r.photo]); });
    // "Ankara Gown 2.jpg" is another photo of "Ankara Gown" (unless a product is called exactly that).
    var all = {}; prods.forEach(function (r) { all[slug(r.name)] = r; });
    var owner = function (x) { var k = keyOf(x); if (all[k]) return all[k]; var b = k.replace(/-?\d{1,2}$/, ''); return b !== k && all[b] ? all[b] : null; };
    free.forEach(function (x) { var o = owner(x); if (o && restP.indexOf(o) >= 0 && keyOf(x) === slug(o.name)) out[x.url] = o; });
    var leftPh = free.filter(function (x) { return !owner(x); });
    var leftP = restP.filter(function (r) { return !free.some(function (x) { return keyOf(x) === slug(r.name); }); });
    leftPh.forEach(function (x, i) { if (leftP[i]) out[x.url] = leftP[i]; });
    return out;
  }
  // What each product card shows: its main photo and its extra photos (chosen, or numbered after its name).
  function photoMap(prods, list) {
    var main = autoFor(prods, list), byUrl = {}, shown = {};
    list.forEach(function (x) { byUrl[x.url] = x; });
    var res = prods.map(function (r) {
      var m = null; Object.keys(main).forEach(function (u) { if (main[u] === r && !m) m = byUrl[u]; });
      var all = {}; prods.forEach(function (x) { all[slug(x.name)] = 1; });
      var ex = (Array.isArray(r.photos) ? r.photos : []).map(function (u) { return byUrl[u]; }).filter(Boolean);
      if (String(r.name || '').trim()) list.forEach(function (x) {
        var mm = keyOf(x).match(/^(.*?)-?(\d{1,2})$/);
        if (mm && mm[1] === slug(r.name) && !all[keyOf(x)] && x !== m && ex.indexOf(x) < 0) ex.push(x);
      });
      if (m) shown[m.url] = 1; ex.forEach(function (x) { shown[x.url] = 1; });
      return { main: m, extra: ex };
    });
    return { of: res, shown: shown };
  }
  // A product name from the photo's file name, unless it is a phone's own name (IMG_1234, WhatsApp Image…).
  function nameFromFile(n) {
    var b = String(n || '').replace(/\.[a-z0-9]+$/i, '').replace(/-[0-9a-f]{16}$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!b || /^(img|dsc|dcim|pxl|photo|image|images|pic|picture|whatsapp|screenshot|snapchat|camera|mvimg|received|fb img|imagen|foto)\b/i.test(b) || (b.replace(/\D/g, '').length >= b.replace(/\s/g, '').length * 0.5)) return '';
    return b.charAt(0).toUpperCase() + b.slice(1);
  }

  function renderRows(f) {
    if (f.photoField) return renderProductCards(f);
    var rows = Array.isArray(answers[f.key]) && answers[f.key].length ? answers[f.key] : [{}];
    answers[f.key] = rows;
    var wrap = el('fieldset', { class: 'brief-field', id: fieldId(f) }, [el('legend', null, [f.label]), hint(f)]);
    var list = el('div', { class: 'brief-rows' });
    var add = el('button', { type: 'button', class: 'brief-add', text: '+ Add another' });
    function draw() {
      list.textContent = '';
      rows.forEach(function (row, i) {
        var box = el('div', { class: 'brief-row' }, [el('span', { class: 'brief-row-num', text: String(i + 1) })]);
        f.columns.forEach(function (c) {
          var inp = el('input', { type: 'text', value: row[c.key] || '', placeholder: c.label, 'aria-label': c.label + ' ' + (i + 1) });
          inp.addEventListener('input', function () { row[c.key] = inp.value; changed(); });
          box.appendChild(inp);
        });
        // Stock, old price and sizes/colours from the spreadsheet (no boxes for them): shown so nothing is hidden.
        var ex = (f.extra || []).filter(function (c) { return String(row[c.key] || '').trim(); }).map(function (c) { return c.label + ': ' + row[c.key]; });
        if (ex.length) box.appendChild(el('p', { class: 'brief-hint', text: ex.join(' · ') }));
        if (rows.length > 1) box.appendChild(el('button', { type: 'button', class: 'brief-row-remove', 'aria-label': 'Remove row ' + (i + 1), text: '×', onclick: function () {
          rows.splice(i, 1); draw(); changed();
        } }));
        list.appendChild(box);
      });
      add.hidden = rows.length >= (f.max || 50);
    }
    add.addEventListener('click', function () {
      rows.push({}); draw();
      var inputs = list.querySelectorAll('.brief-row:last-child input');
      if (inputs[0]) inputs[0].focus();
    });
    draw();
    wrap.appendChild(list);
    wrap.appendChild(add);
    if (f.paste) wrap.appendChild(pasteBox(f, rows, draw));
    return wrap;
  }

  // Products as cards: a photo, then the name, price, category and description right under it.
  // "Add products from photos" makes one card per photo, so customers only type next to each picture.
  function renderProductCards(f) {
    var rows = Array.isArray(answers[f.key]) ? answers[f.key].filter(function (r) { return r && Object.keys(r).some(function (k) { return String(r[k] || '').trim(); }); }) : [];
    answers[f.key] = rows;
    var pf = { key: f.photoField };
    var maxPh = 3000;
    (data.sections || []).forEach(function (s) { s.fields.forEach(function (x) { if (x.key === f.photoField) maxPh = x.max || 3000; }); });
    var wrap = el('fieldset', { class: 'brief-field brief-products', id: fieldId(f) }, [el('legend', null, [f.label]), hint(f)]);
    var status = el('p', { class: 'brief-file-status', role: 'status' });
    var list = el('div', { class: 'brief-cards' });
    var count = el('p', { class: 'brief-pcard-count' });
    var cats = el('datalist', { id: fieldId(f) + '-cats' });
    var busy = false;
    function roomPh() { return maxPh - (files[pf.key] || []).length; }
    function setStatus(t, bad) { status.textContent = t || ''; status.className = 'brief-file-status' + (bad ? ' is-error' : ''); }
    function uploadNew(file) {
      var before = (files[pf.key] || []).map(function (x) { return x.url; });
      return upload(pf, file).then(function (j) {
        files = j.files || files;
        var nu = (files[pf.key] || []).filter(function (x) { return before.indexOf(x.url) < 0; })[0];
        if (!nu) throw new Error('upload failed');
        return nu;
      });
    }
    function removeFile(url) {
      return api('POST', { t: token, remove_file: { field: pf.key, url: url } }).then(function (j) { files = j.files || files; });
    }
    // Upload one after another and report progress; each() gets (uploaded file, original file).
    function uploadAll(chosen, each, done) {
      if (busy) return;
      var room = roomPh();
      if (chosen.length > room) { chosen = chosen.slice(0, Math.max(0, room)); if (!chosen.length) return setStatus('You have reached ' + maxPh + ' photos. Remove some to add more.', true); }
      busy = true; var i = 0, bad = 0;
      (function next() {
        if (i >= chosen.length) { busy = false; if (!bad) setStatus(''); if (done) done(); changed(); redrawAll(); progress(); return; }
        var file = chosen[i++];
        setStatus('Uploading photo ' + i + ' of ' + chosen.length + '… please keep this page open.');
        uploadNew(file).then(function (nu) { each(nu, file); next(); })
          .catch(function (e) { bad++; setStatus(file.name + ': ' + e.message, true); next(); });
      })();
    }
    function picker(multiple, cb) {
      var inp = el('input', { type: 'file', accept: 'image/*', multiple: multiple || null, class: 'brief-hidden-input' });
      inp.addEventListener('change', function () { var c = Array.prototype.slice.call(inp.files || []); inp.value = ''; if (c.length) cb(c); });
      return inp;
    }
    function isBlank(r) { return !f.columns.some(function (c) { return String(r[c.key] || '').trim(); }) && !r.photo; }

    // Big button: many photos → one product card each.
    var bulkIn = picker(true, function (chosen) {
      var room = (f.max || 1000) - rows.length;
      if (chosen.length > room) { setStatus('Your list holds up to ' + (f.max || 1000) + ' products; adding the first ' + room + '.', true); chosen = chosen.slice(0, room); }
      var first = rows.length;
      uploadAll(chosen, function (nu, orig) {
        var r = { photo: nu.url };
        f.columns.forEach(function (c) { r[c.key] = ''; });
        r.name = nameFromFile(orig.name) || nameFromFile(nu.name);
        rows.push(r);
        // Add just this card (redrawing hundreds of cards after every photo would make phones slow).
        list.appendChild(card(r, rows.length - 1, { main: nu, extra: [] }));
        count.textContent = rows.length + ' products so far…';
        if (rows.length % 10 === 0) changed(); // saved as it goes, so nothing is lost if the page closes
      }, function () {
        var card = list.children[first];
        if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); var n = card.querySelector('.brief-pcard-body input'); if (n) n.focus({ preventScroll: true }); }
      });
    });
    var bulk = el('label', { class: 'brief-upload brief-upload-big' }, [el('span', { class: 'brief-big-ico', 'aria-hidden': 'true', text: '📷' }),
      el('span', null, [el('b', { text: 'Add products from photos' }), el('small', { text: 'Pick all your product photos at once. Each photo becomes a product: just type its name and price under it.' })]), bulkIn]);
    var blank = el('button', { type: 'button', class: 'brief-add', text: '+ Add a product without a photo', onclick: function () {
      var r = {}; f.columns.forEach(function (c) { r[c.key] = ''; }); rows.push(r); draw(); changed();
      var card = list.lastChild; if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.querySelector('.brief-pcard-body input').focus({ preventScroll: true }); }
    } });

    function card(row, i, pm) {
      var c = el('div', { class: 'brief-pcard' + (!String(row.name || '').trim() && (row.photo || pm.main) ? ' needs-name' : '') });
      // Photo
      var ph = el('div', { class: 'brief-pcard-photo' });
      var oneIn = picker(false, function (chosen) {
        var old = row.photo;
        uploadAll(chosen, function (nu) {
          row.photo = nu.url;
          if (!String(row.name || '').trim()) row.name = nameFromFile(chosen[0].name);
          if (old && old !== nu.url) removeFile(old).then(redrawAll);
        });
      });
      if (pm.main) {
        ph.appendChild(el('img', { src: pm.main.url, alt: row.name || 'Product photo', loading: 'lazy' }));
        ph.appendChild(el('label', { class: 'brief-pcard-change' }, ['Change', oneIn]));
        ph.appendChild(el('button', { type: 'button', class: 'brief-pcard-x', 'aria-label': 'Remove this photo', text: '×', onclick: function () {
          var u = pm.main.url; if (row.photo === u) delete row.photo;
          removeFile(u).then(function () { changed(); redrawAll(); progress(); }).catch(function (e) { setStatus(e.message, true); });
        } }));
      } else ph.appendChild(el('label', { class: 'brief-pcard-add' }, [el('span', { 'aria-hidden': 'true', text: '📷' }), el('span', { text: 'Add photo' }), oneIn]));
      c.appendChild(ph);
      // Words
      var body = el('div', { class: 'brief-pcard-body' });
      f.columns.forEach(function (col) {
        var ph2 = { name: 'Product name', price: 'Price (₦)', category: 'Category', details: 'Description, sizes, colours' }[col.key] || col.label;
        var inp = col.key === 'details' ? el('textarea', { rows: 2, placeholder: ph2, 'aria-label': col.label + ' ' + (i + 1) })
          : el('input', { type: 'text', placeholder: ph2, 'aria-label': col.label + ' ' + (i + 1), inputmode: col.key === 'price' ? 'decimal' : null, list: col.key === 'category' ? cats.id : null, enterkeyhint: 'next' });
        inp.value = row[col.key] || '';
        inp.addEventListener('input', function () {
          row[col.key] = inp.value; changed();
          if (col.key === 'name') c.classList.toggle('needs-name', !inp.value.trim() && !!(row.photo || pm.main));
        });
        if (col.key === 'category') inp.addEventListener('change', fillCats);
        if (col.key !== 'details') inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var all = c.querySelectorAll('input,textarea'); var k = Array.prototype.indexOf.call(all, inp); if (all[k + 1]) all[k + 1].focus(); } });
        var lab = col.key === 'name' ? el('span', { class: 'brief-pcard-need', text: 'Type the product name' }) : null;
        body.appendChild(inp); if (lab) body.appendChild(lab);
      });
      var ex = (f.extra || []).filter(function (x) { return String(row[x.key] || '').trim(); }).map(function (x) { return x.label + ': ' + row[x.key]; });
      if (ex.length) body.appendChild(el('p', { class: 'brief-hint', text: ex.join(' · ') }));
      // ✨ Write it for me: the AI looks at the photo and fills in the name, category and description.
      if (pm.main && data.ai_writer !== false) {
        var aiBtn = el('button', { type: 'button', class: 'brief-ai', text: '✨ Write it for me' });
        aiBtn.addEventListener('click', function () {
          var filled = String(row.details || '').trim();
          if (filled && !window.confirm('Replace the description you typed with a new one?')) return;
          aiBtn.disabled = true; aiBtn.textContent = '✨ Looking at your photo…';
          aiWrite(row, pm.main.url).then(function () { draw(); }).catch(function (e) { aiBtn.disabled = false; aiBtn.textContent = '✨ Write it for me'; setStatus(e.message, true); });
        });
        body.appendChild(aiBtn);
      }
      // More photos of the same product
      var strip = el('div', { class: 'brief-pcard-more' });
      pm.extra.forEach(function (x) {
        strip.appendChild(el('span', { class: 'brief-pcard-thumb' }, [el('img', { src: x.url, alt: '', loading: 'lazy' }),
          el('button', { type: 'button', 'aria-label': 'Remove this extra photo', text: '×', onclick: function () {
            row.photos = (row.photos || []).filter(function (u) { return u !== x.url; }); if (!row.photos.length) delete row.photos;
            removeFile(x.url).then(function () { changed(); redrawAll(); }).catch(function (e) { setStatus(e.message, true); });
          } })]));
      });
      if (pm.main && pm.extra.length < 7) {
        var moreIn = picker(true, function (chosen) {
          chosen = chosen.slice(0, 7 - pm.extra.length);
          uploadAll(chosen, function (nu) { row.photos = (Array.isArray(row.photos) ? row.photos : []).concat(nu.url); });
        });
        strip.appendChild(el('label', { class: 'brief-pcard-plus', title: 'More photos of this product' }, ['+ More photos', moreIn]));
      }
      if (strip.children.length) body.appendChild(strip);
      c.appendChild(body);
      c.appendChild(el('span', { class: 'brief-pcard-num', text: String(i + 1) }));
      c.appendChild(el('button', { type: 'button', class: 'brief-row-remove', 'aria-label': 'Remove product ' + (i + 1), text: '×', onclick: function () {
        if ((row.name || row.photo) && !window.confirm('Remove ' + (row.name ? '“' + row.name + '”' : 'this product') + '?')) return;
        var gone = [row.photo].concat(row.photos || []).filter(Boolean);
        rows.splice(i, 1); changed(); draw();
        gone.forEach(function (u) { removeFile(u).then(redrawAll).catch(function () {}); });
      } }));
      return c;
    }
    function cats0() { var seen = {}, out = []; rows.forEach(function (r) { var k = String(r.category || '').trim(); if (k && !seen[k.toLowerCase()]) { seen[k.toLowerCase()] = 1; out.push(k); } }); return out; }
    function aiWrite(row, url) {
      return api('POST', { t: token, ai_product: { photo: url, name: row.name || '', categories: cats0() } }).then(function (j) {
        if (j.name && (!String(row.name || '').trim() || row.name.trim().toLowerCase() === j.name.trim().toLowerCase())) row.name = j.name;
        if (j.category && !String(row.category || '').trim()) row.category = j.category;
        if (j.details) row.details = j.details;
        changed();
      });
    }
    // ✨ for every product with a photo but no name or description yet, one after another.
    var aiAll = el('button', { type: 'button', class: 'brief-ai brief-ai-all' });
    function needAi() { return rows.filter(function (r) { return r.photo && (!String(r.name || '').trim() || !String(r.details || '').trim()); }); }
    aiAll.addEventListener('click', function () {
      var todo = needAi(); if (!todo.length || busy) return;
      busy = true; var i = 0, bad = 0;
      (function next() {
        if (i >= todo.length) { busy = false; setStatus(bad ? bad + ' could not be written: type those yourself.' : 'Done! Check each one and add the prices.', !!bad); draw(); return; }
        var r = todo[i++];
        setStatus('✨ Writing product ' + i + ' of ' + todo.length + '…');
        aiWrite(r, r.photo).catch(function () { bad++; }).then(function () { if (i % 5 === 0) draw(); next(); });
      })();
    });
    function fillCats() {
      var seen = {}; cats.textContent = '';
      rows.forEach(function (r) { var k = String(r.category || '').trim(); if (k && !seen[k.toLowerCase()]) { seen[k.toLowerCase()] = 1; cats.appendChild(el('option', { value: k })); } });
    }
    function draw() {
      var pm = photoMap(rows.filter(function (r) { return String(r.name || '').trim() || r.photo; }), files[pf.key] || []);
      var named = rows.filter(function (r) { return String(r.name || '').trim() || r.photo; });
      list.textContent = '';
      rows.forEach(function (r, i) { var k = named.indexOf(r); list.appendChild(card(r, i, k >= 0 ? pm.of[k] : { main: null, extra: [] })); });
      fillCats();
      var n = rows.filter(function (r) { return String(r.name || '').trim(); }).length, noName = rows.filter(function (r) { return !String(r.name || '').trim() && !isBlank(r); }).length;
      count.textContent = rows.length ? n + ' product' + (n === 1 ? '' : 's') + (noName ? ' · ' + noName + (noName === 1 ? ' still needs a name' : ' still need a name') : '') : 'No products yet. Start with the big button above.';
      count.className = 'brief-pcard-count' + (noName ? ' is-warn' : '');
      blank.hidden = bulk.hidden = rows.length >= (f.max || 1000);
      var na = data.ai_writer === false ? 0 : needAi().length;
      aiAll.hidden = !na; aiAll.textContent = '✨ Write names & descriptions for me (' + na + ')';
    }
    redraws.push(draw);
    draw();
    wrap.appendChild(cats);
    if (data.uploads_enabled) { wrap.appendChild(bulk); wrap.appendChild(status); }
    var tu = el('input', { type: 'checkbox', id: fieldId(f) + '-touch' }); tu.checked = touchUpOn();
    tu.addEventListener('change', function () { try { localStorage.setItem('brief-touchup', tu.checked ? 'on' : 'off'); } catch (e) {} });
    if (data.uploads_enabled) wrap.appendChild(el('label', { class: 'brief-touch', for: tu.id }, [tu, el('span', null, [el('b', { text: '✨ Make my photos neat' }), ' square, a little brighter and quicker to load'])]));
    wrap.appendChild(count);
    wrap.appendChild(aiAll);
    wrap.appendChild(list);
    wrap.appendChild(blank);
    if (f.paste) wrap.appendChild(pasteBox(f, rows, function () { draw(); redrawAll(); }));
    return wrap;
  }

  // "Add from a spreadsheet": pick a CSV file or paste rows copied from Excel / Google Sheets / WhatsApp.
  // Columns in the same order as the boxes (e.g. Product, Price, Category, Description). A header row is skipped.
  function parseTable(text) {
    return String(text || '').split(/\r?\n/).map(function (line) {
      if (!line.trim()) return null;
      if (line.indexOf('\t') >= 0) return line.split('\t');
      var out = [], cur = '', q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
        else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
      return out;
    }).filter(Boolean);
  }
  function pasteBox(f, rows, draw) {
    var box = el('details', { class: 'brief-paste' }, [el('summary', { text: 'Add from a spreadsheet' })]);
    var cols = f.columns.map(function (c) { return c.label; }).join(', ');
    var area = el('textarea', { rows: 5, placeholder: 'One product per line: ' + cols + '\ne.g. Ofada Rice 5kg, 9500, Groceries, Stone-free' });
    var file = el('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
    var msg = el('p', { class: 'brief-hint', text: '' });
    // With a header row, the columns can be in any order (and Stock, Old price, Sizes/colours can be added).
    var SYN = { name: /^(product|products|product name|name|item|items)$/, price: /^(price|price \(₦\)|amount|cost|₦)$/, category: /^(category|categories|section|type|group)$/,
      details: /^(description|details|description, sizes, colours|desc|about)$/, stock: /^(stock|in stock|quantity|qty|available)$/, was: /^(old price|was|normal price|before)$/, options: /^(sizes\/colours|sizes|colours|colors|options|variants|sizes and colours|size|colour|color)$/ };
    function headerMap(cells) {
      var map = {}, hits = 0;
      cells.forEach(function (c, i) { var h = String(c || '').trim().toLowerCase(); Object.keys(SYN).forEach(function (k) { if (map[k] === undefined && SYN[k].test(h)) { map[k] = i; hits++; } }); });
      return map.name !== undefined && hits >= 2 ? map : null;
    }
    function add(text, replace) {
      var lines = parseTable(text), hm = lines.length ? headerMap(lines[0]) : null;
      if (hm) lines.shift();
      else if (lines.length && /product|name/i.test(lines[0][0] || '') && !/\d/.test(lines[0][1] || '')) lines.shift(); // header row
      var room = (f.max || 50) - (replace ? 0 : rows.filter(function (r) { return Object.keys(r).some(function (k) { return String(r[k] || '').trim(); }); }).length);
      var fresh = lines.slice(0, room).map(function (cells) {
        var row = {};
        if (hm) { f.columns.concat(f.extra || []).forEach(function (c) { if (hm[c.key] !== undefined) row[c.key] = String(cells[hm[c.key]] || '').trim(); }); f.columns.forEach(function (c) { if (row[c.key] === undefined) row[c.key] = ''; }); }
        else f.columns.forEach(function (c, i) { row[c.key] = String(cells[i] || '').trim(); });
        return row;
      }).filter(function (r) { return r[f.columns[0].key]; });
      if (!fresh.length) { msg.textContent = 'No products found. Put one per line, with commas between the columns.'; return; }
      var kept = replace ? [] : rows.filter(function (r) { return Object.keys(r).some(function (k) { return String(r[k] || '').trim(); }); });
      rows.length = 0;
      kept.concat(fresh).forEach(function (r) { rows.push(r); });
      draw(); changed();
      msg.textContent = 'Added ' + fresh.length + ' product' + (fresh.length === 1 ? '' : 's') + (lines.length > fresh.length ? ' (the list holds up to ' + f.max + ')' : '') + '. Check them above.';
    }
    file.addEventListener('change', function () {
      var fl = file.files && file.files[0]; if (!fl) return;
      var r = new FileReader();
      r.onload = function () { add(r.result, window.confirm('Replace the products already in the list? (Cancel = add to them)')); file.value = ''; };
      r.readAsText(fl);
    });
    box.appendChild(el('p', { class: 'brief-hint', text: 'Columns: ' + cols + (f.extra ? ' (and if you like: ' + f.extra.map(function (c) { return c.label; }).join(', ') + ')' : '') + '. Keep the first row as the column names. Fill it in Excel or Google Sheets, save or download it as CSV, then choose it here. Or paste rows below.' }));
    // A ready-made file to fill in.
    var head = f.columns.map(function (c) { return c.label; }).concat((f.extra || []).map(function (c) { return c.label; }));
    var sample = [head, ['Ofada Rice 5kg', '9500', 'Groceries', 'Stone-free, locally grown', '20', '', ''], ['Ankara Gown', '15000', 'Fashion', 'Made with 100% cotton', '', '18000', 'Size: S, M, L | Colour: Blue, Red']];
    var csv = sample.map(function (r) { return r.map(function (x) { return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(','); }).join('\r\n');
    var dl = el('a', { class: 'brief-add', text: 'Download a sample file', download: 'products.csv', href: 'data:text/csv;charset=utf-8,' + encodeURIComponent('\ufeff' + csv) });
    box.appendChild(dl);
    box.appendChild(el('label', { class: 'brief-upload' }, ['Choose a CSV file', file]));
    box.appendChild(area);
    box.appendChild(el('button', { type: 'button', class: 'brief-add', text: 'Add these', onclick: function () { add(area.value, false); area.value = ''; } }));
    box.appendChild(msg);
    return box;
  }


  // ---------- "I don't have a logo": a simple text logo from their name and colours ----------
  var PALETTES = [['Navy & gold', '#13254F', '#D9A21B'], ['Black & gold', '#111111', '#C9A227'], ['Wine & gold', '#6B1730', '#D9A21B'], ['Green & lime', '#0F5132', '#8BC34A'],
    ['Blue & orange', '#1D4ED8', '#F97316'], ['Purple & pink', '#5B21B6', '#EC4899'], ['Teal & coral', '#0F766E', '#FB7185'], ['Brown & cream', '#5C3A21', '#E9C46A']];
  var FONTS = [['Bold', '900', 'Inter, "Arial Black", Arial, sans-serif'], ['Elegant', '700', 'Georgia, "Times New Roman", serif'], ['Friendly', '800', '"Trebuchet MS", Verdana, sans-serif']];
  function guessPalette() {
    var c = String(answers.colours || '').toLowerCase(), best = 0;
    [['navy', 0], ['black', 1], ['wine', 2], ['maroon', 2], ['burgundy', 2], ['green', 3], ['blue', 4], ['orange', 4], ['purple', 5], ['pink', 5], ['teal', 6], ['brown', 7], ['cream', 7]].some(function (x) { if (c.indexOf(x[0]) >= 0) { best = x[1]; return true; } return false; });
    return best;
  }
  function fitFont(ctx, text, weight, family, maxW, maxSize) {
    var size = maxSize; ctx.font = weight + ' ' + size + 'px ' + family;
    while (size > 10 && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = weight + ' ' + size + 'px ' + family; }
    return size;
  }
  function drawLogo(cv, v, name, tag, pal, font) {
    var W = cv.width, H = cv.height, ctx = cv.getContext('2d'), main = pal[1], acc = pal[2];
    ctx.clearRect(0, 0, W, H); ctx.textBaseline = 'alphabetic';
    var words = name.trim().split(/\s+/), initials = (words[0] ? words[0][0] : '') + (words[1] ? words[1][0] : '');
    if (v === 0) { // wordmark with a gold bar
      ctx.textAlign = 'center';
      var sz = fitFont(ctx, name, font[1], font[2], W * 0.9, H * 0.42);
      ctx.fillStyle = main; ctx.fillText(name, W / 2, H * (tag ? 0.5 : 0.6));
      var tw = ctx.measureText(name).width;
      ctx.fillStyle = acc; ctx.fillRect(W / 2 - tw / 2, H * (tag ? 0.5 : 0.6) + sz * 0.18, tw, Math.max(4, sz * 0.08));
      if (tag) { fitFont(ctx, tag.toUpperCase(), '600', font[2], W * 0.8, H * 0.12); ctx.fillStyle = main; ctx.fillText(tag.toUpperCase(), W / 2, H * 0.8); }
    } else if (v === 1) { // initials badge + name
      var r = H * 0.36, cx = r + H * 0.08, cy = H / 2;
      ctx.fillStyle = main; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = acc; ctx.lineWidth = Math.max(3, r * 0.08); ctx.beginPath(); ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center'; fitFont(ctx, initials.toUpperCase(), font[1], font[2], r * 1.3, r * 0.95); ctx.fillStyle = acc; ctx.fillText(initials.toUpperCase(), cx, cy + r * 0.33);
      ctx.textAlign = 'left'; var x = cx + r + H * 0.1, mw = W - x - H * 0.06;
      fitFont(ctx, name, font[1], font[2], mw, H * 0.3); ctx.fillStyle = main; ctx.fillText(name, x, H * (tag ? 0.52 : 0.6));
      if (tag) { fitFont(ctx, tag, '600', font[2], mw, H * 0.12); ctx.fillStyle = acc; ctx.fillText(tag, x, H * 0.74); }
    } else { // name on a coloured block
      var pad = H * 0.08, rr = H * 0.16;
      ctx.fillStyle = main; ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(pad, pad, W - 2 * pad, H - 2 * pad, rr); else ctx.rect(pad, pad, W - 2 * pad, H - 2 * pad);
      ctx.fill();
      ctx.textAlign = 'center'; fitFont(ctx, name, font[1], font[2], W * 0.8, H * 0.36); ctx.fillStyle = '#FFFFFF'; ctx.fillText(name, W / 2, H * (tag ? 0.52 : 0.62));
      ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(W / 2, H * (tag ? 0.64 : 0.76), H * 0.025, 0, Math.PI * 2); ctx.fill();
      if (tag) { fitFont(ctx, tag.toUpperCase(), '600', font[2], W * 0.7, H * 0.1); ctx.fillStyle = acc; ctx.fillText(tag.toUpperCase(), W / 2, H * 0.8); }
    }
  }
  function logoMaker(f, onDone) {
    var box = el('div', { class: 'brief-logo-maker' });
    var nameIn = el('input', { type: 'text', value: answers.business_name || data.business || '', placeholder: 'Business name', 'aria-label': 'Business name for the logo', maxlength: 40 });
    var tagIn = el('input', { type: 'text', value: answers.tagline || '', placeholder: 'Slogan (optional)', 'aria-label': 'Slogan for the logo', maxlength: 50 });
    var pi = guessPalette(), fi = 0, vi = 0;
    var pals = el('div', { class: 'brief-logo-pals', role: 'radiogroup', 'aria-label': 'Colours' });
    var fonts = el('div', { class: 'brief-logo-fonts', role: 'radiogroup', 'aria-label': 'Letter style' });
    var opts = el('div', { class: 'brief-logo-opts' });
    var cvs = [0, 1, 2].map(function (v) { var c = el('canvas', { width: 600, height: 200 }); var b = el('button', { type: 'button', class: 'brief-logo-opt', 'aria-label': 'Logo design ' + (v + 1) }, [c]); b.addEventListener('click', function () { vi = v; paint(); }); opts.appendChild(b); return c; });
    PALETTES.forEach(function (p, i) { var b = el('button', { type: 'button', class: 'brief-logo-pal', role: 'radio', title: p[0], 'aria-label': p[0], style: 'background:linear-gradient(135deg,' + p[1] + ' 55%,' + p[2] + ' 55%)' }); b.addEventListener('click', function () { pi = i; paint(); }); pals.appendChild(b); });
    FONTS.forEach(function (ft, i) { var b = el('button', { type: 'button', class: 'brief-logo-font', role: 'radio', style: 'font-family:' + ft[2] + ';font-weight:' + ft[1], text: ft[0] }); b.addEventListener('click', function () { fi = i; paint(); }); fonts.appendChild(b); });
    function paint() {
      var name = nameIn.value.trim() || 'Your Business', tag = tagIn.value.trim();
      cvs.forEach(function (c, v) { drawLogo(c, v, name, tag, PALETTES[pi], FONTS[fi]); c.parentNode.setAttribute('aria-pressed', v === vi ? 'true' : 'false'); });
      Array.prototype.forEach.call(pals.children, function (b, i) { b.setAttribute('aria-checked', i === pi ? 'true' : 'false'); });
      Array.prototype.forEach.call(fonts.children, function (b, i) { b.setAttribute('aria-checked', i === fi ? 'true' : 'false'); });
    }
    nameIn.addEventListener('input', paint); tagIn.addEventListener('input', paint);
    var use = el('button', { type: 'button', class: 'btn btn--gold brief-logo-use', text: 'Use this logo' });
    var note = el('p', { class: 'brief-hint', text: 'A simple starter logo you can change any time. Want a designed logo? Ask us on WhatsApp.' });
    use.addEventListener('click', function () {
      var big = el('canvas', { width: 1200, height: 400 });
      drawLogo(big, vi, nameIn.value.trim() || 'Your Business', tagIn.value.trim(), PALETTES[pi], FONTS[fi]);
      use.disabled = true; use.textContent = 'Saving your logo…';
      big.toBlob(function (blob) {
        var file = new File([blob], 'logo-' + slug(nameIn.value || 'business') + '.png', { type: 'image/png' });
        if (!String(answers.colours || '').trim()) { answers.colours = PALETTES[pi][0] + ' (' + PALETTES[pi][1] + ', ' + PALETTES[pi][2] + ')'; changed(); }
        onDone(file, function () { use.disabled = false; use.textContent = 'Use this logo'; });
      }, 'image/png');
    });
    box.appendChild(el('p', { class: 'brief-logo-title', text: 'Make a simple logo' }));
    box.appendChild(nameIn); box.appendChild(tagIn);
    box.appendChild(el('span', { class: 'brief-logo-label', text: 'Colours' })); box.appendChild(pals);
    box.appendChild(el('span', { class: 'brief-logo-label', text: 'Letters' })); box.appendChild(fonts);
    box.appendChild(el('span', { class: 'brief-logo-label', text: 'Pick a design' })); box.appendChild(opts);
    box.appendChild(use); box.appendChild(note);
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);
    return box;
  }

  // ---------- Files ----------
  function renderFiles(f) {
    var wrap = el('div', { class: 'brief-field', id: fieldId(f) }, [el('span', { class: 'brief-field-title' }, [f.label, f.required ? el('span', { class: 'brief-req', text: ' *' }) : null]), hint(f)]);
    var grid = el('div', { class: 'brief-files' + (f.forRows ? ' is-products' : '') });
    var status = el('p', { class: 'brief-file-status', role: 'status' });
    var input = el('input', { type: 'file', accept: f.accept || 'image/*', multiple: f.max > 1 });
    var pick = el('label', { class: 'brief-upload' }, ['+ Add ' + (f.max > 1 ? 'files' : 'file'), input]);
    // Product photos: "Which product?" under each photo, so photos with phone names (IMG_1234) still go to the right product.
    var rowsOf = function () { return (answers[f.forRows] || []).filter(function (r) { return String(r.name || '').trim() || r.photo; }); };
    function draw() {
      var all = files[f.key] || [], list = all;
      grid.textContent = '';
      var match = f.forRows ? autoFor(rowsOf(), all) : {};
      // Photos already showing on a product card are not repeated here.
      if (f.forRows) { var shown = photoMap(rowsOf(), all).shown; list = all.filter(function (x) { return !shown[x.url]; }); }
      list.forEach(function (file) {
        var tile = el('div', { class: 'brief-file' }, [
          /^image\//.test(file.type || '') ? el('img', { src: file.url, alt: file.name, loading: 'lazy' }) : el('span', { text: file.name }),
          el('button', { type: 'button', 'aria-label': 'Remove ' + file.name, text: '×', onclick: function () {
            api('POST', { t: token, remove_file: { field: f.key, url: file.url } }).then(function (j) {
              files = j.files || files;
              if (f.forRows) rowsOf().forEach(function (r) { if (r.photo === file.url) { delete r.photo; changed(); } });
              (f.forRows ? redrawAll : draw)(); progress();
            })
              .catch(function (e) { status.textContent = e.message; status.className = 'brief-file-status is-error'; });
          } })
        ]);
        if (f.forRows && rowsOf().length) {
          var sel = el('select', { class: 'brief-file-for', 'aria-label': 'Which product is this photo?' }, [el('option', { value: '', text: 'Which product?' })].concat(rowsOf().map(function (r, i) {
            return el('option', { value: String(i), text: r.name });
          })));
          var cur = match[file.url];
          if (cur) sel.value = String(rowsOf().indexOf(cur));
          sel.addEventListener('change', function () {
            var prods = rowsOf();
            prods.forEach(function (r) { if (r.photo === file.url) delete r.photo; });
            var r = prods[Number(sel.value)];
            if (sel.value !== '' && r) r.photo = file.url;
            // Pin every photo to what it shows now, so changing one doesn't move the others.
            var now = autoFor(rowsOf(), all);
            Object.keys(now).forEach(function (u) { if (u !== file.url && !now[u].photo) now[u].photo = u; });
            changed(); redrawAll();
          });
          tile.appendChild(sel);
        }
        grid.appendChild(tile);
      });
      if (list.length > 1) {
        var allBtn = el('button', { type: 'button', class: 'brief-remove-all', text: 'Remove all ' + list.length, onclick: function () {
          if (!window.confirm('Remove all ' + list.length + ' photos here?')) return;
          // Product photos: only the ones shown here (photos on product cards stay).
          var gone = f.forRows && list.length < all.length ? list.map(function (x) { return x.url; }) : ['*'];
          var chain = Promise.resolve();
          gone.forEach(function (u) { chain = chain.then(function () { return api('POST', { t: token, remove_file: { field: f.key, url: u } }).then(function (j) { files = j.files || files; }); }); });
          chain.then(function () {
            if (f.forRows) rowsOf().forEach(function (r) { if (gone[0] === '*' || gone.indexOf(r.photo) >= 0) delete r.photo; if (gone[0] === '*') delete r.photos; });
            changed(); (f.forRows ? redrawAll : draw)(); progress();
          }).catch(function (e) { status.textContent = e.message; status.className = 'brief-file-status is-error'; });
        } });
        grid.appendChild(allBtn);
      }
      pick.hidden = all.length >= f.max;
      if (!status.classList.contains('is-error')) status.textContent = all.length ? all.length + ' of ' + f.max + ' uploaded' + (list.length < all.length ? (list.length ? ' · ' + list.length + ' not on a product yet' : ' · all are on your products above') : '') : '';
    }
    if (f.forRows) redraws.push(draw);
    input.addEventListener('change', function () {
      var chosen = Array.prototype.slice.call(input.files || []);
      input.value = '';
      var room = f.max - (files[f.key] || []).length;
      if (chosen.length > room) {
        status.textContent = 'Only ' + room + ' more can be added here; uploading the first ' + room + '.';
        status.className = 'brief-file-status is-error';
        chosen = chosen.slice(0, room);
      } else status.className = 'brief-file-status';
      var i = 0;
      (function next() {
        if (i >= chosen.length) { (f.forRows ? redrawAll : draw)(); progress(); return; }
        var file = chosen[i++];
        status.textContent = 'Uploading ' + i + ' of ' + chosen.length + '…';
        upload(f, file).then(function (j) { files = j.files || files; draw(); next(); })
          .catch(function (e) { status.textContent = file.name + ': ' + e.message; status.className = 'brief-file-status is-error'; draw(); progress(); });
      })();
    });
    wrap.appendChild(grid);
    if (data.uploads_enabled) { wrap.appendChild(pick); wrap.appendChild(status); }
    // No logo yet? Make a simple one here.
    if (f.key === 'logo' && data.uploads_enabled && window.HTMLCanvasElement) {
      var mk = el('details', { class: 'brief-logo-details' }, [el('summary', { text: '✏️ I don\'t have a logo: make a simple one' })]);
      var built = false;
      mk.addEventListener('toggle', function () {
        if (!mk.open || built) return; built = true;
        mk.appendChild(logoMaker(f, function (file, reset) {
          status.className = 'brief-file-status'; status.textContent = 'Saving your logo…';
          var old = (files[f.key] || []).slice();
          upload(f, file).then(function (j) {
            files = j.files || files;
            // One logo: the new one replaces the old.
            return old.reduce(function (p, x) { return p.then(function () { return api('POST', { t: token, remove_file: { field: f.key, url: x.url } }).then(function (k) { files = k.files || files; }); }); }, Promise.resolve());
          }).then(function () { draw(); progress(); mk.open = false; status.textContent = 'Your new logo is saved ✓'; reset(); })
            .catch(function (e) { status.textContent = e.message; status.className = 'brief-file-status is-error'; reset(); });
        }));
      });
      wrap.appendChild(mk);
    }
    else wrap.appendChild(el('p', { class: 'brief-hint' }, ['Please send these on ', el('a', { href: 'https://wa.me/2348167550937', target: '_blank', rel: 'noopener', text: 'WhatsApp' }), ' instead.']));
    draw();
    return wrap;
  }

  // Shrink photos in the browser (max 1600 px) so uploads are quick on mobile data.
  // Product photos are also touched up (unless switched off): made square on a background matching the photo's
  // edges, brightened a little when dark, and saved as WebP (smaller) when the phone can.
  var canWebp = (function () { try { var c = document.createElement('canvas'); c.width = c.height = 1; return c.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { return false; } })();
  function touchUpOn() { try { return localStorage.getItem('brief-touchup') !== 'off'; } catch (e) { return true; } }
  function shrink(file, keepPng, touch) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (img) {
      var canvas = document.createElement('canvas'), ctx;
      var type = keepPng && file.type === 'image/png' ? 'image/png' : canWebp && touch ? 'image/webp' : 'image/jpeg';
      if (touch) {
        // Look at a tiny copy: average brightness and the colour around the edges.
        var t = document.createElement('canvas'); t.width = t.height = 32; var tc = t.getContext('2d');
        tc.drawImage(img, 0, 0, 32, 32);
        var px = tc.getImageData(0, 0, 32, 32).data, lum = 0, er = 0, eg = 0, eb = 0, en = 0;
        for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
          var k = (y * 32 + x) * 4, r = px[k], g = px[k + 1], b = px[k + 2];
          lum += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          if (x === 0 || y === 0 || x === 31 || y === 31) { er += r; eg += g; eb += b; en++; }
        }
        lum /= 1024;
        var side = Math.min(1200, Math.max(img.width, img.height));
        canvas.width = canvas.height = side; ctx = canvas.getContext('2d');
        // Background: the edge colour, a touch lighter, so the square looks like part of the photo.
        var mix = function (v) { return Math.round(v / en + (255 - v / en) * 0.12); };
        ctx.fillStyle = 'rgb(' + mix(er) + ',' + mix(eg) + ',' + mix(eb) + ')';
        ctx.fillRect(0, 0, side, side);
        var sc = side / Math.max(img.width, img.height), w = Math.round(img.width * sc), h = Math.round(img.height * sc);
        if (lum < 0.45) ctx.filter = 'brightness(' + Math.min(1.35, 0.5 / Math.max(lum, 0.2)).toFixed(2) + ') contrast(1.04) saturate(1.06)';
        else ctx.filter = 'contrast(1.03) saturate(1.04)';
        ctx.drawImage(img, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
        ctx.filter = 'none';
      } else {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob || (!touch && blob.size >= file.size)) return resolve(file);
          var name = file.name.replace(/\.\w+$/, '') + (type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg');
          resolve(new File([blob], name, { type: type }));
        }, type, 0.85);
      });
    }).catch(function () { return file; });
  }
  // A photo can carry its product's name inside the file (a JPEG comment "product:Ofada Rice 5kg"), so it's
  // matched even when the phone renames the file (e.g. 1000517007.jpg).
  function productTag(file) {
    if (!/jpe?g/i.test(file.type || '') || !file.slice || !window.FileReader) return Promise.resolve('');
    return new Promise(function (resolve) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var b = new Uint8Array(r.result), i = 2;
          while (i + 4 < b.length && b[i] === 0xFF) {
            var m = b[i + 1], len = (b[i + 2] << 8) + b[i + 3];
            if (m === 0xFE) { var t = ''; for (var k = i + 4; k < i + 2 + len; k++) t += String.fromCharCode(b[k]); var mt = t.match(/^product:(.+)$/); return resolve(mt ? decodeURIComponent(escape(mt[1])).trim() : ''); }
            if (m === 0xDA) break;
            i += 2 + len;
          }
        } catch (e) {}
        resolve('');
      };
      r.onerror = function () { resolve(''); };
      r.readAsArrayBuffer(file.slice(0, 65536));
    });
  }
  function upload(f, file) {
    return productTag(file).then(function (tag) {
      if (tag) file = new File([file], tag.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.jpg', { type: file.type });
      return shrink(file, f.key === 'logo', f.key === 'product_photos' && touchUpOn());
    }).then(function (small) {
      if (small.size > 4 * 1024 * 1024) throw new Error('too big (max 4 MB). Please send it on WhatsApp.');
      var q = '?t=' + encodeURIComponent(token) + '&field=' + encodeURIComponent(f.key) + '&name=' + encodeURIComponent(small.name) + '&type=' + encodeURIComponent(small.type || 'application/octet-stream');
      return fetch('/api/brief-upload' + q, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: small })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || 'upload failed'); return j; }); });
    });
  }

  // ---------- Saving ----------
  function save(submit, quiet) {
    if (saving) { if (!quiet) setTimeout(function () { save(submit, quiet); }, 600); return Promise.resolve(); }
    clearTimeout(saveTimer);
    saving = true;
    if (!quiet) message(submit ? 'Sending…' : 'Saving…');
    return api('POST', { t: token, answers: answers, submit: submit }).then(function (j) {
      dirty = false;
      if (submit) {
        data.submitted_at = j.submitted_at;
        showSubmitted();
        message('Thank you! We have your details and will start building. We will update you on WhatsApp.', 'ok');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else message(quiet ? 'Saved' : 'Saved. You can close this page and finish later using the same link.', 'ok');
    }).catch(function (e) {
      message(e.message, 'error');
      if (e.missing) highlightMissing();
    }).then(function () { saving = false; });
  }
  function highlightMissing() {
    var first = null;
    data.sections.forEach(function (s) { s.fields.forEach(function (f) {
      var node = $(fieldId(f));
      if (!node) return;
      var bad = f.required && isEmpty(f);
      var target = node.matches('input, textarea, select') ? node : null;
      if (target) target.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && !first) first = node;
    }); });
    if (first) {
      var sec = first.closest ? first.closest('.brief-step') : null;
      if (sec && sec.hidden) show(Number(sec.getAttribute('data-step')), true);
      first.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.focus) first.focus({ preventScroll: true });
    }
  }
  function showSubmitted() {
    var s = $('brief-status');
    s.hidden = false;
    s.textContent = 'Sent on ' + new Date(data.submitted_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) + '. You can still update your answers and send again.';
    $('brief-submit').textContent = 'Send my updated details';
  }



  // ---------- Live preview: see the website take shape while filling ----------
  function themeOf() {
    var c = String(answers.colours || ''), hex = c.match(/#[0-9a-f]{6}/gi);
    if (hex && hex.length) return [hex[0], hex[1] || '#D9A21B'];
    return PALETTES[guessPalette()].slice(1);
  }
  function naira(v) { var n = Number(String(v || '').replace(/[^\d.]/g, '')); return n ? '₦' + n.toLocaleString('en-NG') : String(v || ''); }
  function openPreview() {
    var th = themeOf(), main = th[0], acc = th[1], isStore = data.kind === 'store';
    var name = String(answers.business_name || data.business || 'Your business').trim();
    var logo = (files.logo || []).filter(function (x) { return /^image\//.test(x.type || '') || /\.(png|jpe?g|webp|svg)$/i.test(x.name || ''); })[0];
    var sheet = el('div', { class: 'brief-pv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Preview of your website' });
    var phone = el('div', { class: 'brief-pv-phone', style: '--pm:' + main + ';--pa:' + acc });
    var top = el('div', { class: 'brief-pv-top' }, [logo ? el('img', { src: logo.url, alt: name }) : el('b', { text: name }), el('span', { class: 'brief-pv-menu', text: '☰' })]);
    phone.appendChild(top);
    var hero = el('div', { class: 'brief-pv-hero' }, [el('h3', { text: name }), answers.tagline ? el('p', { class: 'brief-pv-tag', text: answers.tagline }) : null,
      answers.description ? el('p', { text: String(answers.description).slice(0, 140) + (String(answers.description).length > 140 ? '…' : '') }) : null,
      el('span', { class: 'brief-pv-btn', text: isStore ? 'Shop now' : 'Contact us' })]);
    phone.appendChild(hero);
    if (isStore) {
      var prods = (answers.products || []).filter(function (r) { return String(r.name || '').trim(); });
      var pm = photoMap(prods, files.product_photos || []);
      if (prods.length) phone.appendChild(el('div', { class: 'brief-pv-search', text: '🔍  Search ' + prods.length + ' products' }));
      var cats = []; prods.forEach(function (r) { var k = String(r.category || '').trim(); if (k && cats.indexOf(k) < 0) cats.push(k); });
      if (cats.length) phone.appendChild(el('div', { class: 'brief-pv-cats' }, cats.slice(0, 8).map(function (c, i) { return el('span', { class: i ? '' : 'on', text: c }); })));
      var grid = el('div', { class: 'brief-pv-grid' });
      prods.slice(0, 12).forEach(function (r, i) {
        var ph = pm.of[i] && pm.of[i].main;
        grid.appendChild(el('div', { class: 'brief-pv-card' }, [ph ? el('img', { src: ph.url, alt: '', loading: 'lazy' }) : el('div', { class: 'brief-pv-noimg', text: '📷' }),
          el('b', { text: r.name }), r.price ? el('span', { class: 'brief-pv-price', text: naira(r.price) }) : null, el('span', { class: 'brief-pv-add', text: 'Add to cart' })]));
      });
      if (!prods.length) grid.appendChild(el('p', { class: 'brief-pv-empty', text: 'Your products will show here. Add them in the Products step.' }));
      phone.appendChild(grid);
      if (prods.length > 12) phone.appendChild(el('p', { class: 'brief-pv-more', text: '+ ' + (prods.length - 12) + ' more products' }));
    } else {
      var sv = (answers.services || []).filter(function (r) { return String(r.name || '').trim(); });
      phone.appendChild(el('h4', { class: 'brief-pv-h', text: 'What we do' }));
      var list = el('div', { class: 'brief-pv-svcs' });
      sv.slice(0, 6).forEach(function (r) { list.appendChild(el('div', { class: 'brief-pv-svc' }, [el('b', { text: r.name }), r.details ? el('span', { text: r.details }) : null, r.price ? el('em', { text: naira(r.price) }) : null])); });
      if (!sv.length) list.appendChild(el('p', { class: 'brief-pv-empty', text: 'Your services will show here.' }));
      phone.appendChild(list);
    }
    var foot = [answers.phone ? '📞 ' + answers.phone : '', answers.hours ? '🕘 ' + answers.hours : '', answers.address ? '📍 ' + String(answers.address).split('\n')[0] : ''].filter(Boolean);
    phone.appendChild(el('div', { class: 'brief-pv-foot' }, [el('b', { text: name })].concat(foot.map(function (x) { return el('span', { text: x }); }))));
    phone.appendChild(el('span', { class: 'brief-pv-wa', text: 'WhatsApp' }));
    var close = el('button', { type: 'button', class: 'brief-pv-close', 'aria-label': 'Close preview', text: 'Back to my form' });
    function shut() { sheet.remove(); document.documentElement.classList.remove('brief-pv-open'); document.removeEventListener('keydown', esc); pvBtn.focus(); }
    function esc(e) { if (e.key === 'Escape') shut(); }
    close.addEventListener('click', shut); sheet.addEventListener('click', function (e) { if (e.target === sheet) shut(); });
    document.addEventListener('keydown', esc);
    sheet.appendChild(el('div', { class: 'brief-pv-inner' }, [el('p', { class: 'brief-pv-note', text: '👀 A quick look from your answers so far. Our team designs the real website, with more pages and polish.' }), phone, close]));
    document.body.appendChild(sheet); document.documentElement.classList.add('brief-pv-open'); close.focus();
  }
  var pvBtn = el('button', { type: 'button', class: 'brief-pv-fab', 'aria-label': 'Preview my website' }, [el('span', { 'aria-hidden': 'true', text: '👀' }), ' Preview']);
  pvBtn.addEventListener('click', openPreview);

  // ---------- One step per screen ----------
  var cur = 0;
  function stepKey() { return 'brief-step-' + token.slice(0, 12); }
  function sectionsEls() { return Array.prototype.slice.call(document.querySelectorAll('.brief-step')); }
  function stepMissing(i) {
    return (data.sections[i] ? data.sections[i].fields : []).filter(function (f) { return f.required && isEmpty(f); });
  }
  function drawDots() {
    var nav = $('brief-steps'); if (!nav) return;
    nav.textContent = '';
    data.sections.forEach(function (s, i) {
      var done = !data.sections[i].fields.some(function (f) { return f.required && isEmpty(f); }) && data.sections[i].fields.some(function (f) { return !isEmpty(f); });
      var b = el('button', { type: 'button', class: 'brief-dot' + (i === cur ? ' is-on' : '') + (done ? ' is-done' : ''), 'aria-label': 'Step ' + (i + 1) + ': ' + s.title + (done ? ' (done)' : ''), 'aria-current': i === cur ? 'step' : null, 'data-step': String(i), title: s.title }, [el('span', { text: done && i !== cur ? '✓' : String(i + 1) })]);
      b.addEventListener('click', function () { show(i); });
      nav.appendChild(b);
    });
  }
  function show(i, noScroll) {
    var secs = sectionsEls(); if (!secs.length) return;
    cur = Math.max(0, Math.min(secs.length - 1, i));
    secs.forEach(function (sec, k) { sec.hidden = k !== cur; });
    try { localStorage.setItem(stepKey(), String(cur)); } catch (e) {}
    var last = cur === secs.length - 1;
    $('brief-back').hidden = cur === 0;
    $('brief-next').hidden = last;
    $('brief-submit').hidden = !last;
    if (!last) { var nt = data.sections[cur + 1].title.split(/ \(| and /)[0]; $('brief-next').textContent = nt.length <= 18 ? 'Next: ' + nt + ' →' : 'Next →'; $('brief-next').title = 'Next: ' + data.sections[cur + 1].title; }
    $('brief-step-title').textContent = data.sections[cur].title;
    drawDots();
    if (!noScroll) window.scrollTo({ top: Math.max(0, $('brief-app').offsetTop - 70), behavior: 'smooth' });
    redrawAll();
  }
  function steps() {
    var start = 0;
    try { start = Number(localStorage.getItem(stepKey())) || 0; } catch (e) {}
    $('brief-next').addEventListener('click', function () {
      var miss = stepMissing(cur);
      if (miss.length) {
        message('Please answer the questions marked * first.', 'error');
        miss.forEach(function (f) { var n = $(fieldId(f)); if (n && n.matches('input, textarea, select')) n.setAttribute('aria-invalid', 'true'); });
        var n0 = $(fieldId(miss[0])); if (n0) { n0.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (n0.focus) n0.focus({ preventScroll: true }); }
        return;
      }
      message(''); save(false, true); show(cur + 1);
    });
    $('brief-back').addEventListener('click', function () { message(''); show(cur - 1); });
    show(start, true);
  }

  // ---------- Start ----------
  if (!token) { showError('This page needs the link we sent you on WhatsApp.'); return; }
  api('GET').then(function (d) {
    data = d;
    answers = d.answers || {};
    files = d.files || {};
    $('brief-title').textContent = 'Let\'s build your ' + (d.kind === 'project' ? 'project' : 'website') + ', ' + String(d.name || '').split(' ')[0];
    $('brief-lead').textContent = 'Thank you for your deposit. Please tell us about ' + (d.business || 'your business') +
      ' so we can build your ' + d.kind_label + '. It takes about 10–15 minutes, and you can save and come back later with the same link. Questions marked * are required.';
    var form = $('brief-form');
    var chatBox = null;
    if ((d.chat_ideas || []).length) {
      chatBox = (el('div', { class: 'brief-chat' }, [
        el('h2', { text: 'What you told our assistant' }),
        el('p', { text: 'We\'ve kept these from your chat and will use them too, so you only need to add what\'s missing or changed.' }),
        el('ul', null, d.chat_ideas.map(function (x) { return el('li', null, [el('b', { text: x.label + ': ' }), x.value]); }))
      ]));
    }
    var pre = d.prefilled || [];
    d.sections.forEach(function (s, si) {
      var sec = el('section', { class: 'brief-section brief-step', 'data-step': String(si) }, [
        el('p', { class: 'brief-step-of', text: 'Step ' + (si + 1) + ' of ' + d.sections.length }), el('h2', { text: s.title })]);
      if (si === 0 && chatBox) sec.appendChild(chatBox);
      s.fields.forEach(function (f) {
        var node = renderField(f);
        // Typed in from their chat or first form: marked so they check it.
        if (pre.indexOf(f.key) >= 0) { node.classList.add('is-prefilled'); node.insertBefore(el('span', { class: 'brief-pre', text: '✨ From your chat: please check' }), node.children[1] || null); }
        sec.appendChild(node);
      });
      form.appendChild(sec);
    });
    if (pre.length) changed();
    $('brief-loading').hidden = true;
    $('brief-app').hidden = false;
    if (d.submitted_at) showSubmitted();
    progress();
    steps();
    if (d.kind !== 'project') document.body.appendChild(pvBtn);
  }).catch(function (e) { showError(e.message); });

  $('brief-save').addEventListener('click', function () { save(false); });
  $('brief-submit').addEventListener('click', function () { save(true); });
  window.addEventListener('beforeunload', function (e) { if (dirty) { save(false, true); e.preventDefault(); e.returnValue = ''; } });
})();
