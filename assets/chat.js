// SIRRADDO GLOBAL LIMITED — website assistant chat widget. Talks to /api/chat.
(function () {
  var WHATSAPP = 'https://wa.me/2348167550937';
  var STORE_KEY = 'sirraddo-chat-v1';
  var GREETING =
    "Hi! I'm the SIRRADDO assistant. I can help you choose a website package, tell you about ZAPPI PAY, or pass a request to our team. What do you need?";
  var CHIPS = ['I need an app for my business', 'How long does a website take?', 'What do I need to get started?'];
  // "Chat in": the assistant replies in the language picked (the server tells the AI).
  var LANGS = [['en', 'English', 'Okay! Ask me anything.'], ['pcm', 'Pidgin', 'Oya, make we yarn for Pidgin. Wetin you need?'], ['yo', 'Yorùbá', 'Ẹ káàbọ̀! Ẹ lè kọ ọ̀rọ̀ yín ní Yorùbá. Kí ni ẹ nílò?'], ['ha', 'Hausa', 'Barka da zuwa! Ku rubuta da Hausa. Me kuke bukata?'], ['ig', 'Igbo', 'Nnọọ! Dee n\'Igbo. Gịnị ka ị chọrọ?']];
  // Package picker: 2–3 taps → the right package, its price and "Start now".
  var PKG = {
    'Starter website': { price: 50000, renew: '₦25,000/year from year 2', inc: ['Up to 5 pages', 'Free .com.ng domain & hosting (1 year)', '1 business email', 'WhatsApp button & contact form'] },
    'Business website': { price: 100000, renew: '₦40,000/year from year 2', inc: ['Up to 10 pages + blog', '.com.ng domain & hosting (1 year)', '5 business emails', 'Google Business Profile & Search Console setup'] },
    'Online Store': { from: 150000, renew: 'Renewal quoted for your store', inc: ['Products with a shopping cart', 'Customers pay online, by transfer or on delivery', 'Your own store admin: orders, stock, payments', 'Everything in Business'] }
  };
  function naira(n) { return '₦' + Number(n).toLocaleString('en-NG'); }

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
  launcher.setAttribute('aria-label', 'Ask SIRRADDO: chat with our assistant, any time');
  launcher.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg><span class="chat-launcher-text">Ask <b>SIRRADDO</b></span><i class="chat-launcher-dot" aria-hidden="true"></i>';

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
  var priceBtn = el('button', 'chat-price-btn', '₦ Prices');
  priceBtn.type = 'button';
  priceBtn.setAttribute('aria-label', 'Find my package and price');
  head.appendChild(title);
  head.appendChild(priceBtn);
  head.appendChild(close);

  var log = el('div', 'chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');

  var chips = el('div', 'chat-chips');
  var pickChip = el('button', 'chat-chip chat-chip--gold', '💰 Find my package & price');
  pickChip.type = 'button';
  pickChip.addEventListener('click', function () { openPicker(); });
  chips.appendChild(pickChip);
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

  var langRow = el('div', 'chat-langs');
  langRow.appendChild(el('span', null, 'Chat in:'));
  LANGS.forEach(function (l) {
    var b = el('button', 'chat-lang', l[1]); b.type = 'button'; b.setAttribute('data-lang', l[0]);
    b.addEventListener('click', function () {
      state.lang = l[0] === 'en' ? '' : l[0]; save(); markLang();
      addBubble('assistant', l[2]); input.focus();
    });
    langRow.appendChild(b);
  });
  function markLang() { langRow.querySelectorAll('.chat-lang').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === (state.lang || 'en') ? 'true' : 'false'); }); }
  markLang();

  panel.appendChild(head);
  panel.appendChild(langRow);
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
    langRow.hidden = state.messages.length > 2;
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
      body: JSON.stringify({ sessionId: state.sessionId, page: location.pathname, from: window.sirraddoFrom ? window.sirraddoFrom() : '', messages: state.messages, lang: state.lang || '' })
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
        body: JSON.stringify({ source: 'chat-form', from: window.sirraddoFrom ? window.sirraddoFrom() : '', name: name.value.trim(), contact: phone.value.trim(), details: 'Asked in chat: ' + asked, page: location.pathname })
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


  // ----- Package picker -----
  function openPicker() {
    var old = log.querySelector('.chat-pick'); if (old) old.remove();
    chips.hidden = true;
    var card = el('div', 'chat-msg chat-msg--bot chat-pick');
    var answers = {};
    function step(q, opts) {
      card.textContent = '';
      card.appendChild(el('p', 'chat-pick-q', q));
      var box = el('div', 'chat-pick-opts');
      opts.forEach(function (o) {
        var b = el('button', 'chat-pick-opt'); b.type = 'button';
        b.appendChild(el('span', 'chat-pick-ico', o[0])); b.appendChild(el('span', null, o[1]));
        b.addEventListener('click', o[2]);
        box.appendChild(b);
      });
      card.appendChild(box);
      log.scrollTop = log.scrollHeight;
    }
    function q1() {
      step('What should your website do for you?', [
        ['📞', 'Show my business so customers call or WhatsApp me', function () { answers.kind = 'site'; q2site(); }],
        ['🔎', 'Bring me customers from Google (blog, Google profile)', function () { answers.kind = 'grow'; result('Business website'); }],
        ['🛒', 'Sell my products online', function () { answers.kind = 'store'; q2store(); }],
        ['🧩', 'Something else: an app, bookings or a business system', function () { custom(); }]
      ]);
    }
    function q2site() {
      step('How many pages do you need? (Home, About, Services, Contact… each is a page)', [
        ['5', 'Up to 5 pages', function () { q3emails(); }],
        ['10', '6 to 10 pages', function () { result('Business website'); }],
        ['?', 'Not sure', function () { q3emails(); }]
      ]);
    }
    function q3emails() {
      step('How many business email addresses (like info@yourbusiness.com.ng)?', [
        ['1', 'Just one', function () { result('Starter website'); }],
        ['5', '2 to 5', function () { result('Business website'); }]
      ]);
    }
    function q2store() {
      step('About how many products?', [
        ['📦', 'Up to 100', function () { answers.products = 'Up to 100'; result('Online Store'); }],
        ['📦', '101 to 500', function () { answers.products = '101–500'; result('Online Store'); }],
        ['📦', 'More than 500', function () { answers.products = 'More than 500'; result('Online Store'); }]
      ]);
    }
    function custom() {
      card.textContent = '';
      card.appendChild(el('p', 'chat-pick-q', 'We build those too, priced for what you need.'));
      card.appendChild(el('p', null, 'Tell me in a few words what it should do, and I\'ll help you plan it.'));
      card.appendChild(backBtn());
      input.value = 'I need '; input.focus(); autosize();
    }
    function backBtn() {
      var b = el('button', 'chat-pick-back', '← Change my answers'); b.type = 'button';
      b.addEventListener('click', function () { answers = {}; q1(); });
      return b;
    }
    function result(name) {
      var p = PKG[name];
      card.textContent = '';
      var top = el('div', 'chat-pick-top');
      top.appendChild(el('span', 'chat-pick-tag', 'Best for you'));
      top.appendChild(el('strong', null, name.replace(' website', '')));
      top.appendChild(el('span', 'chat-pick-price', (p.from ? 'from ' : '') + naira(p.price || p.from)));
      top.appendChild(el('small', null, p.from ? 'Final price depends on your products' : 'One-off price, first year included'));
      card.appendChild(top);
      var ul = el('ul', 'chat-pick-inc');
      p.inc.forEach(function (x) { ul.appendChild(el('li', null, x)); });
      card.appendChild(ul);
      card.appendChild(el('p', 'chat-pick-meta', (p.price ? 'Start with ' + naira(Math.round(p.price * 0.7)) + ' (70%), balance when your site is ready. ' : '') + 'Ready in about 7 working days. ' + p.renew + '.'));
      var acts = el('div', 'chat-pick-acts');
      var go = el('button', 'chat-pick-go', p.price ? 'Start now · pay ' + naira(Math.round(p.price * 0.7)) : 'Get my exact price'); go.type = 'button';
      go.addEventListener('click', function () { startForm(name, p, acts); });
      var ask = el('button', 'chat-pick-ask', 'Ask a question'); ask.type = 'button';
      ask.addEventListener('click', function () { input.value = 'About the ' + name + ' (' + (p.from ? 'from ' : '') + naira(p.price || p.from) + '): '; input.focus(); autosize(); });
      acts.appendChild(go); acts.appendChild(ask);
      card.appendChild(acts);
      card.appendChild(backBtn());
      log.scrollTop = log.scrollHeight;
    }
    function startForm(name, p, acts) {
      var f = el('form', 'chat-lead chat-pick-form');
      f.appendChild(el('p', null, p.price ? 'Your details for the invoice. Next you pay the deposit securely with Paystack.' : 'Your details, and we\'ll send your exact price on WhatsApp.'));
      var nm = el('input'); nm.placeholder = 'Your name'; nm.autocomplete = 'name'; nm.maxLength = 120; nm.setAttribute('aria-label', 'Your name');
      var ph = el('input'); ph.placeholder = 'WhatsApp number'; ph.type = 'tel'; ph.inputMode = 'tel'; ph.maxLength = 40; ph.setAttribute('aria-label', 'WhatsApp number');
      var em = el('input'); em.placeholder = p.price ? 'Email (for your receipt)' : 'Email (optional)'; em.type = 'email'; em.inputMode = 'email'; em.maxLength = 200; em.setAttribute('aria-label', 'Email');
      var bz = el('input'); bz.placeholder = 'Business name (optional)'; bz.maxLength = 200; bz.setAttribute('aria-label', 'Business name');
      var err = el('p', 'chat-lead-error'); err.setAttribute('role', 'alert');
      var btn = el('button', 'chat-pick-go', p.price ? 'Continue to payment' : 'Send'); btn.type = 'submit';
      [nm, ph, em, bz, err, btn].forEach(function (n) { f.appendChild(n); });
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (nm.value.trim().length < 2) { err.textContent = 'Please enter your name.'; nm.focus(); return; }
        if (ph.value.replace(/\D/g, '').length < 10) { err.textContent = 'Please enter a valid WhatsApp number.'; ph.focus(); return; }
        if (p.price && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value.trim())) { err.textContent = 'Please enter your email: Paystack sends the receipt there.'; em.focus(); return; }
        btn.disabled = true; btn.textContent = 'Please wait…'; err.textContent = '';
        var details = 'Package picker: ' + name + (answers.products ? ' · Products: ' + answers.products : '');
        fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'picker', start: !!p.price, from: window.sirraddoFrom ? window.sirraddoFrom() : '', name: nm.value.trim(), contact: ph.value.trim(), email: em.value.trim(), business: bz.value.trim(), interest: name, details: details, page: location.pathname }) })
          .then(function (r) { return r.json(); }).then(function (j) {
            if (!j.ok) throw new Error(j.error || 'failed');
            state.detailsSent = true; save();
            if (j.pay) { btn.textContent = 'Opening payment…'; location.href = j.pay; return; }
            var msg = 'Thank you, ' + nm.value.trim().split(' ')[0] + '! We\'ll send your ' + (p.price ? 'invoice' : 'exact price') + ' on WhatsApp soon.' + (j.ref ? ' Your reference: ' + j.ref : '');
            card.remove(); state.messages.push({ role: 'assistant', content: msg }); save(); addBubble('assistant', msg);
          }).catch(function (e2) { btn.disabled = false; btn.textContent = p.price ? 'Continue to payment' : 'Send'; err.textContent = /valid|name|email/i.test(e2.message) ? e2.message : 'Could not send. Please message us on WhatsApp.'; });
      });
      acts.replaceWith(f); nm.focus();
    }
    q1();
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }
  priceBtn.addEventListener('click', function () { if (panel.hidden) setOpen(true); openPicker(); });

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
