/* 🔍 AI check before sending: shared by the CV maker, the design studio and the QR poster maker.
   SirReview.button(label, getPayload, call) → a button plus a results box. getPayload() returns (or promises)
   { kind, cv?, images?, link? }; call(payload) posts it to the server ({ action: 'review_work', id, ... }). */
(function () {
  'use strict';
  var ICON = { fix: '🔴 Fix', check: '🟡 Check', tip: '💡 Tip' };
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] == null) continue; if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  // A picture (canvas, blob or file) as a JPEG data URL, at most `max` px on its long side.
  function shrink(src, max) {
    return new Promise(function (ok, bad) {
      function draw(img) {
        var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight, k = Math.min(1, (max || 1400) / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        ok(c.toDataURL('image/jpeg', 0.85));
      }
      if (src instanceof HTMLCanvasElement) return draw(src);
      var i = new Image(); i.onload = function () { draw(i); URL.revokeObjectURL(i.src); }; i.onerror = bad; i.src = URL.createObjectURL(src);
    });
  }
  function show(box, j) {
    box.innerHTML = '';
    box.appendChild(el('p', null, [el('b', { text: j.verdict === 'ready' ? '✅ Ready to send' : '⚠️ Fix first' }), ' ' + (j.summary || '')]));
    if (j.issues.length) box.appendChild(el('ul', { class: 'admin-mini' }, j.issues.map(function (x) {
      return el('li', null, [el('b', { text: ICON[x.level] + (x.where ? ' · ' + x.where : '') + ': ' }), x.problem, x.fix ? el('span', { class: 'admin-hint', text: ' → ' + x.fix }) : null]);
    })));
    if ((j.good || []).length) box.appendChild(el('p', { class: 'admin-hint', text: '👍 ' + j.good.join(' · ') }));
    box.appendChild(el('p', { class: 'admin-hint', text: 'The AI can miss things or be wrong: you decide. It never changes the work.' }));
  }
  function button(label, getPayload, call) {
    var box = el('div', { class: 'admin-card', style: 'display:none;margin-top:8px' });
    var btn = el('button', { class: 'admin-btn', type: 'button', text: label || '🔍 AI check before sending', onclick: function () {
      btn.disabled = true; box.style.display = ''; box.textContent = '🔍 Checking against the order… (up to a minute)';
      Promise.resolve().then(getPayload).then(call).then(function (j) { show(box, j); })
        .catch(function (e) { box.textContent = e.message || String(e); }).then(function () { btn.disabled = false; });
    } });
    return el('div', null, [btn, box]);
  }
  window.SirReview = { button: button, shrink: shrink, show: show };
})();
