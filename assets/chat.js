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
  panel.appendChild(form);
  panel.appendChild(foot);
  document.body.appendChild(panel);
  document.body.appendChild(launcher);

  function addBubble(role, text) {
    var b = el('div', 'chat-msg chat-msg--' + (role === 'user' ? 'user' : 'bot'));
    richText(b, text);
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
    if (!text || busy) return;
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
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });
})();
