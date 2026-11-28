// Branded dropdowns for the public site. Phones show their own plain picker for <select>, which can't be styled, so
// each <select> gets a SIRRADDO button and a bottom sheet (a pop-up list on wide screens). The real <select> stays in
// the page, hidden, and is kept in step both ways: forms, validation and existing scripts keep working unchanged.
// "Flyer design (₦5,000)" shows as the name with the price in a gold label. Add data-native to a <select> to skip it.
(function () {
  'use strict';
  if (window.SirPicker) return;
  var current = null;
  var VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  var INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  function parse(text) {
    var m = String(text || '').match(/^(.*?)\s*\((₦[^)]*)\)\s*$/);
    return m ? { name: m[1], price: m[2] } : { name: String(text || ''), price: '' };
  }
  function labelOf(sel) {
    if (sel.__label) return sel.__label;
    var l = sel.id && document.querySelector('label[for="' + sel.id + '"]');
    return l ? l.textContent.replace(/\s*\(optional\)\s*$/i, '').trim() : 'Choose an option';
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  var CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var CHEVRON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function enhance(sel) {
    if (sel.__picker || sel.multiple || sel.hasAttribute('data-native') || sel.closest('[data-native]')) return;
    sel.__picker = true;
    sel.__label = labelOf(sel);
    var btn = el('button', 'picker-btn');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (sel.id) { btn.id = sel.id + '-picker'; var lab = document.querySelector('label[for="' + sel.id + '"]'); if (lab) { lab.setAttribute('for', btn.id); sel.setAttribute('aria-hidden', 'true'); } }
    sel.classList.add('picker-native');
    sel.tabIndex = -1;
    sel.parentNode.insertBefore(btn, sel.nextSibling);

    function sync() {
      var o = sel.options[INDEX.get.call(sel)];
      var p = parse(o ? o.text : '');
      btn.innerHTML = '';
      var name = el('span', 'picker-btn__name', p.name || 'Choose…');
      btn.appendChild(name);
      if (p.price) btn.appendChild(el('span', 'picker-price', p.price));
      var chev = el('span', 'picker-btn__chev'); chev.innerHTML = CHEVRON; btn.appendChild(chev);
      btn.classList.toggle('is-empty', !o || !o.value);
      btn.disabled = sel.disabled;
    }
    sync();
    sel.addEventListener('change', sync);
    sel.addEventListener('invalid', function () { btn.classList.add('is-invalid'); });
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
    // Scripts that set .value or .selectedIndex directly also update the button.
    Object.defineProperty(sel, 'value', { configurable: true, get: function () { return VALUE.get.call(sel); }, set: function (v) { VALUE.set.call(sel, v); sync(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get: function () { return INDEX.get.call(sel); }, set: function (v) { INDEX.set.call(sel, v); sync(); } });

    btn.addEventListener('click', function () { show(sel, btn); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(sel, btn); } });
  }

  function close(back) {
    if (!current) return;
    var c = current; current = null;
    c.btn.setAttribute('aria-expanded', 'false');
    c.wrap.classList.remove('is-open');
    document.documentElement.classList.remove('picker-lock');
    document.removeEventListener('keydown', c.keys, true);
    setTimeout(function () { c.wrap.remove(); }, 220);
    if (back) c.btn.focus();
  }

  function show(sel, btn) {
    close();
    var wide = window.matchMedia('(min-width: 700px)').matches;
    var wrap = el('div', 'picker' + (wide ? ' picker--pop' : ''));
    var shade = el('div', 'picker__shade');
    var sheet = el('div', 'picker__sheet');
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', labelOf(sel));
    var head = el('div', 'picker__head');
    head.appendChild(el('span', 'picker__grip'));
    head.appendChild(el('strong', 'picker__title', labelOf(sel)));
    var x = el('button', 'picker__close'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
    x.addEventListener('click', function () { close(true); });
    head.appendChild(x);
    var list = el('ul', 'picker__list'); list.setAttribute('role', 'listbox');
    var items = [];
    Array.prototype.forEach.call(sel.options, function (o, i) {
      if (!o.value && /^choose/i.test(o.text.trim())) return; // the "Choose…" placeholder
      if (o.hidden) return;
      var p = parse(o.text), on = i === INDEX.get.call(sel);
      var li = el('li', 'picker__opt' + (on ? ' is-on' : '') + (o.disabled ? ' is-off' : ''));
      li.setAttribute('role', 'option'); li.setAttribute('aria-selected', on ? 'true' : 'false'); li.tabIndex = -1;
      var txt = el('span', 'picker__name', p.name); li.appendChild(txt);
      if (p.price) li.appendChild(el('span', 'picker-price', p.price));
      var tick = el('span', 'picker__tick'); tick.innerHTML = CHECK; li.appendChild(tick);
      if (!o.disabled) li.addEventListener('click', function () {
        sel.value = o.value;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        btn.classList.remove('is-invalid');
        close(true);
      });
      items.push(li); list.appendChild(li);
    });
    sheet.appendChild(head); sheet.appendChild(list);
    wrap.appendChild(shade); wrap.appendChild(sheet);
    shade.addEventListener('click', function () { close(true); });
    // Inside a pop-up form (an open <dialog>), the list must open inside it too: a dialog sits above everything else on the page.
    (sel.closest('dialog[open]') || document.body).appendChild(wrap);
    if (wide) {
      var r = btn.getBoundingClientRect(), below = window.innerHeight - r.bottom;
      sheet.style.left = Math.max(12, r.left) + 'px';
      sheet.style.width = Math.max(r.width, 280) + 'px';
      if (below < 320 && r.top > below) { sheet.style.bottom = (window.innerHeight - r.top + 6) + 'px'; sheet.style.maxHeight = (r.top - 24) + 'px'; }
      else { sheet.style.top = (r.bottom + 6) + 'px'; sheet.style.maxHeight = Math.max(200, below - 24) + 'px'; }
    } else {
      document.documentElement.classList.add('picker-lock');
    }
    var keys = function (e) {
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      else if ((e.key === 'Enter' || e.key === ' ') && i >= 0) { e.preventDefault(); items[i].click(); }
      else if (e.key === 'Tab') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', keys, true);
    current = { wrap: wrap, btn: btn, keys: keys };
    btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () {
      wrap.classList.add('is-open');
      var on = list.querySelector('.is-on') || items[0];
      if (on) { on.focus({ preventScroll: true }); on.scrollIntoView({ block: 'nearest' }); }
    });
  }
  window.addEventListener('resize', function () { if (current && window.matchMedia('(min-width: 700px)').matches) close(); });

  function scan(root) { (root.querySelectorAll ? root.querySelectorAll('select') : []).forEach(enhance); if (root.tagName === 'SELECT') enhance(root); }
  scan(document);
  new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); }); }); })
    .observe(document.body, { childList: true, subtree: true });
  window.SirPicker = { enhance: enhance };
})();
