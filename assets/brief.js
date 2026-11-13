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

  function renderRows(f) {
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
    return wrap;
  }

  // ---------- Files ----------
  function renderFiles(f) {
    var wrap = el('div', { class: 'brief-field', id: fieldId(f) }, [el('span', { class: 'brief-field-title' }, [f.label, f.required ? el('span', { class: 'brief-req', text: ' *' }) : null]), hint(f)]);
    var grid = el('div', { class: 'brief-files' });
    var status = el('p', { class: 'brief-file-status', role: 'status' });
    var input = el('input', { type: 'file', accept: f.accept || 'image/*', multiple: f.max > 1 });
    var pick = el('label', { class: 'brief-upload' }, ['+ Add ' + (f.max > 1 ? 'files' : 'file'), input]);
    function draw() {
      var list = files[f.key] || [];
      grid.textContent = '';
      list.forEach(function (file) {
        var tile = el('div', { class: 'brief-file' }, [
          /^image\//.test(file.type || '') ? el('img', { src: file.url, alt: file.name, loading: 'lazy' }) : el('span', { text: file.name }),
          el('button', { type: 'button', 'aria-label': 'Remove ' + file.name, text: '×', onclick: function () {
            api('POST', { t: token, remove_file: { field: f.key, url: file.url } }).then(function (j) { files = j.files || files; draw(); progress(); })
              .catch(function (e) { status.textContent = e.message; status.className = 'brief-file-status is-error'; });
          } })
        ]);
        grid.appendChild(tile);
      });
      pick.hidden = list.length >= f.max;
      if (!status.classList.contains('is-error')) status.textContent = list.length ? list.length + ' of ' + f.max + ' uploaded' : '';
    }
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
        if (i >= chosen.length) { draw(); progress(); return; }
        var file = chosen[i++];
        status.textContent = 'Uploading ' + i + ' of ' + chosen.length + '…';
        upload(f, file).then(function (j) { files = j.files || files; draw(); next(); })
          .catch(function (e) { status.textContent = file.name + ': ' + e.message; status.className = 'brief-file-status is-error'; draw(); progress(); });
      })();
    });
    wrap.appendChild(grid);
    if (data.uploads_enabled) { wrap.appendChild(pick); wrap.appendChild(status); }
    else wrap.appendChild(el('p', { class: 'brief-hint' }, ['Please send these on ', el('a', { href: 'https://wa.me/2348167550937', target: '_blank', rel: 'noopener', text: 'WhatsApp' }), ' instead.']));
    draw();
    return wrap;
  }

  // Shrink photos in the browser (max 1600 px) so uploads are quick on mobile data.
  function shrink(file, keepPng) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (img) {
      var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      var type = keepPng && file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          var name = file.name.replace(/\.\w+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
          resolve(new File([blob], name, { type: type }));
        }, type, 0.85);
      });
    }).catch(function () { return file; });
  }
  function upload(f, file) {
    return shrink(file, f.key === 'logo').then(function (small) {
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
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first.focus) first.focus({ preventScroll: true }); }
  }
  function showSubmitted() {
    var s = $('brief-status');
    s.hidden = false;
    s.textContent = 'Sent on ' + new Date(data.submitted_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) + '. You can still update your answers and send again.';
    $('brief-submit').textContent = 'Send my updated details';
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
    if ((d.chat_ideas || []).length) {
      form.appendChild(el('section', { class: 'brief-section brief-chat' }, [
        el('h2', { text: 'What you told our assistant' }),
        el('p', { text: 'We\'ve kept these from your chat and will use them too, so you only need to add what\'s missing or changed.' }),
        el('ul', null, d.chat_ideas.map(function (x) { return el('li', null, [el('b', { text: x.label + ': ' }), x.value]); }))
      ]));
    }
    d.sections.forEach(function (s) {
      var sec = el('section', { class: 'brief-section' }, [el('h2', { text: s.title })]);
      s.fields.forEach(function (f) { sec.appendChild(renderField(f)); });
      form.appendChild(sec);
    });
    $('brief-loading').hidden = true;
    $('brief-app').hidden = false;
    if (d.submitted_at) showSubmitted();
    progress();
  }).catch(function (e) { showError(e.message); });

  $('brief-save').addEventListener('click', function () { save(false); });
  $('brief-submit').addEventListener('click', function () { save(true); });
  window.addEventListener('beforeunload', function (e) { if (dirty) { save(false, true); e.preventDefault(); e.returnValue = ''; } });
})();
