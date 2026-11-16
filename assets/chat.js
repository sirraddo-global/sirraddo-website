// SIRRADDO GLOBAL LIMITED — website assistant chat widget. Talks to /api/chat.
(function () {
  var WHATSAPP = 'https://wa.me/2348167550937';
  var STORE_KEY = 'sirraddo-chat-v1';
  var GREETING =
    "Hi! I'm the SIRRADDO assistant. I can help you choose a website package, tell you about ZAPPI PAY, or pass a request to our team. What do you need?";
  var CHIPS = ['Website packages & prices', 'I need an app for my business', 'Tell me about ZAPPI PAY'];

  var state = load() || { sessionId: newId(), messages: [] };
  var busy = false;

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 's-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }
  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // Text with safe links: URLs become <a>, everything else stays plain text.
  function richText(node, text) {
    var re = /(https?:\/\/[^\s)]+[^\s).,!?])/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = el('a', null, m[1].replace(/^https?:\/\//, ''));
      a.href = m[1];
      a.target = '_blank';
      a.rel = 'noopener';
      node.appendChild(a);
      last = re.lastIndex;
    }
    node.appendChild(document.createTextNode(text.slice(last)));
  }

  // ----- Build the widget -----
  var launcher = el('button', 'chat-launcher');
  // Fade the button while the page scrolls, so it doesn't sit on top of the text being read.
  var scrollTimer;
  window.addEventListener('scroll', function () {
    launcher.classList.add('is-scrolling');
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () { launcher.classList.remove('is-scrolling'); }, 700);
  }, { passive: true });
  launcher.type = 'button';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'chat-panel');
  launcher.setAttribute('aria-label', 'Chat with the SIRRADDO assistant');
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span>Ask us</span>';

  var panel = el('div', 'chat-panel');
  panel.id = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with the SIRRADDO assistant');
  panel.hidden = true;

  var head = el('div', 'chat-head');
  var title = el('div', 'chat-title');
  title.appendChild(el('strong', null, 'SIRRADDO Assistant'));
  title.appendChild(el('span', null, 'AI · replies in seconds'));
  var close = el('button', 'chat-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close chat');
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  head.appendChild(title);
  head.appendChild(close);

  var log = el('div', 'chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  var chips = el('div', 'chat-chips');
  CHIPS.forEach(function (c) {
    var b = el('button', 'chat-chip', c);
    b.type = 'button';
    b.addEventListener('click', function () { send(c); });
    chips.appendChild(b);
  });

  var form = el('form', 'chat-form');
  var input = el('textarea', 'chat-input');
  input.rows = 1;
  input.maxLength = 1500;
  input.placeholder = 'Type your message…';
  input.setAttribute('aria-label', 'Your message');
  var sendBtn = el('button', 'chat-send');
  sendBtn.type = 'submit';
  sendBtn.setAttribute('aria-label', 'Send');
  sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  // 📎 Send a photo or PDF (e.g. a logo, a design they like, a price list). Photos are shrunk before upload.
  var attachBtn = el('button', 'chat-attach-btn', '📎');
  attachBtn.type = 'button';
  attachBtn.setAttribute('aria-label', 'Send a photo or PDF');
  var picker = el('input'); picker.type = 'file'; picker.accept = 'image/*,application/pdf'; picker.hidden = true;
  var pending = []; // [{ kind, url }]
  var tray = el('div', 'chat-tray'); tray.hidden = true;
  // Full-screen photo viewer (tap a photo in the tray or in the chat; tap anywhere or × to close).
  function viewPhoto(src) {
    var box = el('div', 'chat-viewer'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Photo');
    var img = el('img'); img.src = src; img.alt = 'Photo';
    var x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close photo');
    box.appendChild(img); box.appendChild(x);
    function close() { box.remove(); document.removeEventListener('keydown', esc); }
    function esc(e) { if (e.key === 'Escape') close(); }
    box.addEventListener('click', close); document.addEventListener('keydown', esc);
    document.body.appendChild(box); x.focus();
  }
  function drawTray() {
    tray.textContent = '';
    tray.hidden = !pending.length;
    pending.forEach(function (p, i) {
      var chip = el('span', 'chat-tray-item' + (p.thumb ? ' has-thumb' : ''));
      if (p.thumb) {
        var t = el('img'); t.src = p.thumb; t.alt = 'Photo to send (tap to view)';
        t.addEventListener('click', function () { viewPhoto(p.thumb); });
        chip.appendChild(t);
      } else chip.appendChild(document.createTextNode('📄 ' + p.name));
      var x = el('button', null, '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove');
      x.addEventListener('click', function () { if (p.thumb) URL.revokeObjectURL(p.thumb); pending.splice(i, 1); drawTray(); });
      chip.appendChild(x); tray.appendChild(chip);
    });
  }
  function shrink(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type)) return resolve(file);
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        c.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(u); resolve(file); };
      img.src = u;
    });
  }
  attachBtn.addEventListener('click', function () { if (pending.length >= 2) { addBubble('assistant', 'You can send 2 files with each message.'); return; } picker.click(); });
  picker.addEventListener('change', function () {
    var file = picker.files && picker.files[0]; picker.value = '';
    if (!file) return;
    var isPdf = file.type === 'application/pdf';
    if (!isPdf && !/^image\//.test(file.type)) { addBubble('assistant', 'Please send a photo or a PDF.'); return; }
    attachBtn.disabled = true; attachBtn.textContent = '…';
    shrink(file).then(function (blob) {
      var type = isPdf ? 'application/pdf' : 'image/jpeg';
      var name = isPdf ? file.name : file.name.replace(/\.\w+$/, '') + '.jpg';
      return fetch('/api/chat-upload?s=' + encodeURIComponent(state.sessionId) + '&type=' + encodeURIComponent(type) + '&name=' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Upload failed'); return j; }); })
        .then(function (j) { pending.push({ kind: isPdf ? 'file' : 'photo', url: j.url, name: j.name, thumb: isPdf ? '' : URL.createObjectURL(blob) }); drawTray(); input.focus(); });
    }).catch(function (e) { addBubble('assistant', e.message || 'Sending failed. Please try again or send it on WhatsApp: ' + WHATSAPP); })
      .then(function () { attachBtn.disabled = false; attachBtn.textContent = '📎'; });
  });
  form.appendChild(picker);
  form.appendChild(attachBtn);
  form.appendChild(input);
  form.appendChild(sendBtn);

  var foot = el('p', 'chat-foot');
  foot.appendChild(document.createTextNode('AI assistant, it can make mistakes. Prices and payment are confirmed by our team. '));
  var waLink = el('a', null, 'WhatsApp us');
  waLink.href = WHATSAPP; waLink.target = '_blank'; waLink.rel = 'noopener';
  foot.appendChild(waLink);
  foot.appendChild(document.createTextNode(' · '));
  var pLink = el('a', null, 'Privacy');
  pLink.href = '/privacy#assistant';
  foot.appendChild(pLink);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(chips);
  panel.appendChild(tray);
  panel.appendChild(form);
  panel.appendChild(foot);
  document.body.appendChild(panel);
  document.body.appendChild(launcher);

  function addBubble(role, text) {
    var b = el('div', 'chat-msg chat-msg--' + (role === 'user' ? 'user' : 'bot'));
    // "[photo] URL" / "[file] URL" lines are pictures and files the visitor sent with 📎.
    var lines = String(text).split('\n'), words = [];
    lines.forEach(function (line) {
      var m = line.match(/^\[(photo|file)\] (https?:\/\/\S+)$/);
      if (!m) { words.push(line); return; }
      var a = el('a', 'chat-attach'); a.href = m[2]; a.target = '_blank'; a.rel = 'noopener';
      if (m[1] === 'photo') a.addEventListener('click', function (e) { e.preventDefault(); viewPhoto(m[2]); });
      if (m[1] === 'photo') { var img = el('img'); img.src = m[2]; img.alt = 'Photo you sent'; img.loading = 'lazy'; a.appendChild(img); }
      else a.textContent = '📄 ' + decodeURIComponent(m[2].split('/').pop()).replace(/-[0-9a-f]{16}(?=\.)/, '');
      b.appendChild(a);
    });
    var rest = el('div'); richText(rest, words.join('\n').trim());
    if (rest.textContent) b.appendChild(rest);
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  }
  function render() {
    log.textContent = '';
    addBubble('assistant', GREETING);
    state.messages.forEach(function (m) { addBubble(m.role, m.content); });
    chips.hidden = state.messages.length > 0;
  }

  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    launcher.classList.toggle('is-open', open);
    document.documentElement.classList.toggle('chat-open', open);
    if (open) {
      render();
      setTimeout(function () { input.focus(); }, 50);
    } else {
      launcher.focus();
    }
  }

  function send(text) {
    text = (text || '').trim();
    if (busy) return;
    if (pending.length) {
      text = pending.map(function (p) { return '[' + p.kind + '] ' + p.url; }).join('\n') + (text ? '\n' + text : '');
      pending = []; drawTray();
    }
    if (!text) return;
    if (state.messages.length >= 28) {
      addBubble('assistant', 'This chat is getting long. Please continue with our team on WhatsApp: ' + WHATSAPP);
      return;
    }
    busy = true;
    sendBtn.disabled = true;
    chips.hidden = true;
    state.messages.push({ role: 'user', content: text });
    save();
    addBubble('user', text);
    input.value = '';
    autosize();
    var typing = addBubble('assistant', 'Typing…');
    typing.classList.add('chat-msg--typing');

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId, page: location.pathname, messages: state.messages })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        var reply = (data && data.reply) || ('Sorry, something went wrong. Please chat with us on WhatsApp: ' + WHATSAPP);
        state.messages.push({ role: 'assistant', content: reply });
        save();
        typing.remove();
        addBubble('assistant', reply);
        if (!data || data.error || !data.reply) offerDetailsForm();
      })
      .catch(function () {
        typing.remove();
        state.messages.pop(); // let them retry the same message
        save();
        addBubble('assistant', "I couldn't connect. Check your internet and try again, or WhatsApp us: " + WHATSAPP);
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  // When the AI can't reply, let the visitor leave their details so the team can follow up.
  function offerDetailsForm() {
    if (state.detailsSent || log.querySelector('.chat-lead')) return;
    var box = el('form', 'chat-msg chat-msg--bot chat-lead');
    box.appendChild(el('p', null, 'Or leave your name and WhatsApp number and we will contact you:'));
    var name = el('input'); name.placeholder = 'Your name'; name.autocomplete = 'name'; name.maxLength = 120;
    name.setAttribute('aria-label', 'Your name');
    var phone = el('input'); phone.placeholder = 'WhatsApp number'; phone.type = 'tel'; phone.inputMode = 'tel'; phone.maxLength = 40;
    phone.setAttribute('aria-label', 'WhatsApp number');
    var err = el('p', 'chat-lead-error'); err.setAttribute('role', 'alert');
    var btn = el('button', 'chat-chip', 'Send my details'); btn.type = 'submit';
    [name, phone, err, btn].forEach(function (n) { box.appendChild(n); });
    box.addEventListener('submit', function (e) {
      e.preventDefault();
      if (name.value.trim().length < 2) { err.textContent = 'Please enter your name.'; name.focus(); return; }
      if (phone.value.replace(/\D/g, '').length < 10) { err.textContent = 'Please enter a valid number.'; phone.focus(); return; }
      btn.disabled = true; err.textContent = '';
      var asked = state.messages.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.content; }).join(' / ');
      fetch('/api/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'chat-form', name: name.value.trim(), contact: phone.value.trim(), details: 'Asked in chat: ' + asked, page: location.pathname })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error || 'failed');
        state.detailsSent = true; save();
        box.remove();
        var msg = 'Thank you, ' + name.value.trim().split(' ')[0] + '. Our team will contact you on WhatsApp soon.' + (j.ref ? ' Your reference: ' + j.ref : '');
        state.messages.push({ role: 'assistant', content: msg }); save();
        addBubble('assistant', msg);
      }).catch(function (e2) {
        btn.disabled = false;
        err.textContent = /valid|name/i.test(e2.message) ? e2.message : 'Could not send. Please message us on WhatsApp.';
      });
    });
    log.appendChild(box);
    log.scrollTop = log.scrollHeight;
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  launcher.addEventListener('click', function () { setOpen(panel.hidden); });
  close.addEventListener('click', function () { setOpen(false); });
  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener('input', autosize);
  // Phones and tablets: the Enter key starts a new line and the arrow button sends, so a long message
  // can be written in one go. Computers: Enter sends, Shift+Enter makes a new line.
  var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  input.setAttribute('enterkeyhint', touch ? 'enter' : 'send');
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });
})();
