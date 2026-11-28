// "Try it with your business name" bar (/websites, /design) and the quote calculator (/websites).
(function () {
  var WA = '2348167550937';
  var $ = function (id) { return document.getElementById(id); };
  var naira = function (n) { return '₦' + Math.round(n).toLocaleString('en-NG'); };
  var store = { get: function (k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  // ---------------- 1. Live brand preview ----------------
  var bar = $('bp');
  if (bar) {
    var fName = $('bp-name'), fPhone = $('bp-phone'), fCity = $('bp-city');
    [['bpName', fName], ['bpPhone', fPhone], ['bpCity', fCity]].forEach(function (x) { x[1].value = store.get(x[0]); });
    var val = function () { return { name: fName.value.trim().slice(0, 40), phone: fPhone.value.trim().slice(0, 20), city: fCity.value.trim().slice(0, 32) }; };
    var timer = null;
    var onInput = function () {
      var v = val(); store.set('bpName', v.name); store.set('bpPhone', v.phone); store.set('bpCity', v.city);
      clearTimeout(timer); timer = setTimeout(apply, 120);
    };
    [fName, fPhone, fCity].forEach(function (f) { f.addEventListener('input', onInput); });
    bar.querySelector('.bp-reset').addEventListener('click', function () { fName.value = fPhone.value = fCity.value = ''; onInput(); fName.focus(); });

    // Sample websites (same site, so their text can be swapped in place; the original is kept to put back).
    var NAMES = {
      kassy: ['Kassy Treats & More', 'Kassy Treats'],
      crestline: ['Crestline Homes & Properties', 'Crestline Homes', 'Crestline'],
      zainab: ['Zainab Luxe Atelier', 'Zainab Luxe'],
      olivecare: ['OliveCare Specialist Clinic', 'OliveCare Clinic', 'OliveCare'],
      brightpath: ['BrightPath International Schools', 'BrightPath'],
      'royalgate-hotel': ['RoyalGate Hotel & Suites', 'RoyalGate'],
      'primefuel-station': ['PrimeFuel Energy & Gas Plant', 'PrimeFuel'],
    };
    var CITY_RE = /Ibadan & Lagos|Ibadan|Lagos/gi;
    var sc = $('showcase');
    function slug(s) { return s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 24); }
    function applyFrame(ifr) {
      var doc; try { doc = ifr.contentDocument; } catch (e) { return; }
      if (!doc || !doc.body) return;
      var k = (sc && sc.querySelector('.sc-stage').dataset.k) || 'kassy', names = NAMES[k] || [], v = val();
      // the logo in each sample's header is styled in parts, so it's swapped as a whole
      var logo = doc.querySelector('header .logo');
      if (logo) {
        if (v.name) {
          if (logo.dataset.o == null) logo.dataset.o = logo.innerHTML;
          logo.textContent = v.name;
          if (v.city && logo.dataset.o.indexOf('<small') >= 0) { var sm = doc.createElement('small'); sm.textContent = v.city; logo.appendChild(sm); }
          logo.querySelectorAll('*').forEach(function (x) { x.__bp = 1; }); logo.__bp = 1;
        } else if (logo.dataset.o != null) { logo.innerHTML = logo.dataset.o; delete logo.dataset.o; }
      }
      var w = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null), n;
      while ((n = w.nextNode())) {
        var p = n.parentNode && n.parentNode.nodeName; if (p === 'SCRIPT' || p === 'STYLE' || (n.parentNode && n.parentNode.__bp && v.name)) continue;
        if (n.__orig == null) n.__orig = n.nodeValue;
        var t = n.__orig;
        if (v.name) names.forEach(function (nm) { t = t.split(nm).join('\u0000'); }), t = t.split('\u0000').join(v.name);
        if (v.city) t = t.replace(CITY_RE, v.city);
        if (t !== n.nodeValue) n.nodeValue = t;
      }
      var strip = doc.getElementById('bp-strip');
      if (v.phone) {
        if (!strip) { strip = doc.createElement('div'); strip.id = 'bp-strip'; strip.setAttribute('style', 'position:sticky;top:0;z-index:99;background:#0F172A;color:#fff;font:600 13px/1.2 system-ui,sans-serif;text-align:center;padding:8px 10px'); doc.body.insertBefore(strip, doc.body.firstChild); }
        strip.textContent = '📞 Call / WhatsApp: ' + v.phone;
      } else if (strip) strip.remove();
    }
    // Their business name says what they do: open the sample website for that trade (until they pick one themselves).
    var SC_TRADES = [[/cake|chip|snack|chops|bak|pastr|bread|treat|kitchen|food|grill|suya|cater|restaurant|eatery|zobo|juice/i, /food/i], [/home|propert|realt|estate|land|apartment/i, /real estate/i],
      [/salon|hair|beauty|spa|nail|fashion|cloth|wears?\b|boutique|tailor|stitch|fabric|atelier|couture/i, /fashion/i], [/pharm|clinic|hospital|health|medic|lab\b|dental/i, /clinic/i],
      [/school|academy|college|nursery|montessori/i, /school/i], [/hotel|suites|lodge|resort|guest ?house|shortlet/i, /hotel/i], [/gas|fuel|petrol|filling|energy/i, /filling/i]];
    function autoTab(name) {
      if (!sc || !name || sc.dataset.picked) return;
      var hit = SC_TRADES.filter(function (x) { return x[0].test(name); })[0]; if (!hit) return;
      var btn = [].slice.call(sc.querySelectorAll('.sc-tabs button')).filter(function (b) { return hit[1].test(b.textContent); })[0];
      if (btn && btn.getAttribute('aria-selected') !== 'true') btn.click();
    }
    function applyShowcase() {
      if (!sc) return;
      autoTab(val().name);
      sc.querySelectorAll('.sc-stage iframe').forEach(applyFrame);
      var v = val(), url = sc.querySelector('.sc-url'), nameEl = sc.querySelector('.sc-name');
      [[url, v.name ? slug(v.name) + '.com.ng' : ''], [nameEl, v.name ? v.name + ': your website, built like this sample' : '']].forEach(function (x) {
        var el = x[0]; if (!el) return;
        if (x[1]) { if (el.dataset.orig == null) el.dataset.orig = el.textContent; el.textContent = x[1]; }
        else if (el.dataset.orig != null) { el.textContent = el.dataset.orig; delete el.dataset.orig; }
      });
    }
    if (sc) {
      sc.querySelectorAll('.sc-stage iframe').forEach(function (f) { f.addEventListener('load', function () { applyFrame(f); }); });
      sc.querySelector('.sc-tabs').addEventListener('click', function (e) { if (e.isTrusted) sc.dataset.picked = '1'; ['.sc-url', '.sc-name'].forEach(function (c) { var el = sc.querySelector(c); if (el) delete el.dataset.orig; }); setTimeout(applyShowcase, 30); });
      sc.querySelector('.sc-view').addEventListener('click', function () { setTimeout(applyShowcase, 30); });
    }

    // /design: flyers and a business card drawn with their details, in a look that suits what their name says
    // they do (cakes → a warm bakery look with a cake picture; salon → boutique…), with wording for their trade.
    var pv = $('bp-designs'), drawn = '';
    var TRADES = [
      [/cake|chip|snack|chops|bak(e|ery)|pastr|bread|pie|treat|kitchen|food|grill|suya|cater|restaurant|eatery|buka|shawarma|pizza|zobo|juice|smoothie|parfait/i, { looks: ['Warm bakery', 'Afro print', 'Party pop'], icon: 'cake', svc: 'Cakes, Small chops, Snacks, Drinks', head: function (it) { return it ? 'Fresh ' + it + ', made to order' : 'Delicious food, made fresh daily'; }, sub: 'Order on WhatsApp today', sell: 'Made fresh to order' }],
      [/salon|hair|beauty|spa|nail|lash|brow|make ?up|glam|barb|cosmetic|skin/i, { looks: ['Elegant script', 'Luxury gold', 'Fresh & natural'], icon: 'scissors', svc: 'Braids, Wigs, Nails, Makeup', head: function () { return 'Look your best'; }, sub: 'Book your appointment today', sell: 'Hair · Beauty · Nails' }],
      [/fashion|cloth|wears?\b|boutique|tailor|stitch|fabric|couture|apparel|shoe|bag/i, { looks: ['Elegant script', 'Bold street', 'Luxury gold'], icon: 'hanger', svc: 'Ready-to-wear, Custom fits, Accessories', head: function () { return 'New styles just arrived'; }, sub: 'Order today · We deliver', sell: 'Quality styles for every occasion' }],
      [/church|ministr|assembly|chapel|parish|gospel|mosque|islamic|faith/i, { looks: ['Royal', 'Faith & calm', 'Classic'], icon: 'cross', svc: 'Sunday service, Bible study, Prayer meetings', head: function () { return 'Join us this Sunday'; }, sub: 'Everyone is welcome', sell: 'Everyone is welcome' }],
      [/school|academy|college|tutor|lesson|learning|nursery|montessori/i, { looks: ['Kids fun', 'Classic', 'Clean corporate'], icon: 'book', svc: 'Crèche, Nursery, Primary', head: function () { return 'Admission in progress'; }, sub: 'Book a school visit today', sell: 'Learning with care' }],
      [/home|propert|realt|estate|land|apartment|shortlet/i, { looks: ['Clean corporate', 'Luxury gold', 'Classic'], icon: 'house', svc: 'Sales, Rentals, Shortlets, Land', head: function () { return 'Find your next home'; }, sub: 'Book an inspection today', sell: 'Sales · Rentals · Shortlets' }],
      [/gas|fuel|petrol|energy|oil/i, { looks: ['Clean corporate', 'Bold street', 'Classic'], icon: 'flame', svc: 'Gas refill, Home delivery, Cylinders', head: function () { return 'Cooking gas refill, delivered'; }, sub: 'Order on WhatsApp today', sell: 'Fast and safe refills' }],
      [/pharm|clinic|hospital|health|medic|care|lab\b|dental/i, { looks: ['Fresh & natural', 'Clean corporate', 'Minimal'], icon: 'health', svc: 'Consultation, Pharmacy, Lab tests', head: function () { return 'Your health, our care'; }, sub: 'We are here for you', sell: 'Caring for you and your family' }],
      [/hotel|suites|lodge|resort|guest ?house|inn\b/i, { looks: ['Luxury gold', 'Luxury showcase', 'Night glow'], icon: 'hotel', svc: 'Rooms, Event hall, Restaurant', head: function () { return 'Book your stay with us'; }, sub: 'Reserve your room today', sell: 'Comfort you can trust' }],
      [/event|party|decor|rental|wedding/i, { looks: ['Party pop', 'Elegant script', 'Festive'], icon: 'sparkle', svc: 'Decor, Rentals, Planning', head: function () { return 'Make your event unforgettable'; }, sub: 'Book your date today', sell: 'Events made beautiful' }],
      [/law|legal|barr|solicitor|chamber|consult|advis|account|audit|tax|associates|& ?co\b/i, { looks: ['Luxury gold', 'Clean corporate', 'Minimal'], icon: 'crown', svc: 'Advice, Registration, Contracts', head: function () { return 'Trusted advice for your business'; }, sub: 'Book a consultation today', sell: 'Trusted, professional advice' }],
      [/tech|digital|solution|computer|phone|gadget|print|media|studio|photo/i, { looks: ['Clean corporate', 'Night glow', 'Minimal'], icon: 'bolt', svc: '', head: function () { return 'Fast, reliable service'; }, sub: 'Talk to us today', sell: 'Fast and reliable service' }],
    ];
    var DEFAULT_TRADE = { looks: ['Classic', 'Clean corporate', 'Afro print'], icon: 'sparkle', svc: '', head: function () { return 'Now taking orders'; }, sub: 'Order on WhatsApp today', sell: 'Quality you can trust' };
    // "Funmight cakes and chips" → what they sell: "cakes & chips" (the words after the first, when they name a trade).
    function tradeOf(name) {
      var t = DEFAULT_TRADE;
      for (var i = 0; i < TRADES.length; i++) if (TRADES[i][0].test(name)) { t = TRADES[i][1]; break; }
      var words = name.replace(/\b(ltd|limited|enterprises?|ventures?|global|nig(eria)?|services?|and more|& more|the)\b\.?/gi, ' ').trim().split(/\s+/);
      var rest = words.slice(1).join(' ').replace(/\band\b/gi, '&').replace(/\s+/g, ' ').trim().toLowerCase();
      var items = t !== DEFAULT_TRADE && t.icon === 'cake' && rest && rest.length <= 30 && TRADES[0][0].test(rest) ? rest : '';
      return { looks: t.looks, icon: t.icon, head: t.head(items), sub: t.sub, sell: t.sell, svc: items ? items.split(/\s*&\s*/).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join(', ') : t.svc };
    }
    function applyDesigns() {
      if (!pv || !window.SirStudio || !window.SirStudio.preview) return;
      var v = val(), name = v.name || 'Kassy Treats & More', phone = v.phone || '0810 838 3146', city = v.city || 'Ibadan · Available nationwide';
      var key = [name, phone, city].join('|'); if (key === drawn) return; drawn = key;
      var tr = tradeOf(name);
      // Their own name: the picture space shows a picture for their trade (no photos yet). Our sample: Kassy's photos.
      var photos = v.name ? [] : ['cake.png', 'meat-pie.jpg', 'parfait.jpg', 'zobo.jpg'].map(function (f) { return { url: '/assets/showcase/' + f, name: f }; });
      var info = { phone: phone, address: city, sell: tr.sell };
      var flyer = window.SirStudio.preview({ size: 'post', business: name, words: tr.head + '\n' + tr.sub, contact: phone, info: info, photos: photos, looks: v.name ? tr.looks : null, icon: v.name ? tr.icon : null, mark: 'corner' }, 300);
      var card = window.SirStudio.preview({ kind: 'card', business: name, words: tr.sell + '\n' + city, contact: phone, info: { phone: phone, address: city, person: 'Your name here', title: tr.sell, sell: tr.svc }, photos: [], mark: 'corner', layout: 'Classic card' }, 300);
      Promise.all([flyer, card]).then(function (r) {
        if (key !== drawn) return;
        var slots = pv.querySelectorAll('.bp-slot');
        var fbox = slots[0] && slots[0].querySelector('.bp-canvas');
        if (fbox) { fbox.innerHTML = ''; fbox.classList.add('bp-row'); r[0].slice(0, 3).forEach(function (cv) { fbox.appendChild(cv); }); }
        var cbox = slots[1] && slots[1].querySelector('.bp-canvas');
        if (cbox && r[1][0]) { cbox.innerHTML = ''; cbox.appendChild(r[1][0]); }
        pv.hidden = false;
      }).catch(function () { drawn = ''; });
    }
    function apply() { applyShowcase(); applyDesigns(); }
    if (pv) {
      var start = function () { if (window.SirStudio) apply(); else setTimeout(start, 300); };
      if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { io.disconnect(); start(); } }, { rootMargin: '300px' }); io.observe(pv); } else start();
    }
    if (sc) applyShowcase();
  }

  // ---------------- 2. Quote & bundle calculator ----------------
  var q = $('quote');
  if (q) {
    var out = q.querySelector('.qc-summary');
    function pick() {
      var pkg = q.querySelector('input[name=qc-pkg]:checked'), dom = q.querySelector('input[name=qc-dom]:checked');
      var pack = q.querySelector('input[value=pack]');
      var cardOnly = q.querySelector('input[value=card]');
      // the brand pack already has a business card in it
      cardOnly.disabled = pack.checked; if (pack.checked) cardOnly.checked = false;
      cardOnly.closest('label').classList.toggle('is-off', pack.checked);
      var items = [{ label: pkg.dataset.label, price: +pkg.value }];
      if (+dom.value) items.push({ label: dom.dataset.label, price: +dom.value });
      q.querySelectorAll('input[name=qc-x]:checked').forEach(function (x) { items.push({ label: x.dataset.label, price: +x.dataset.price }); });
      return { items: items, from: pkg.dataset.from === '1', store: pkg.dataset.from === '1', domFree: !+dom.value };
    }
    function render() {
      var p = pick(), total = p.items.reduce(function (n, x) { return n + x.price; }, 0), pre = p.from ? 'from ' : '';
      out.querySelector('.qc-lines').innerHTML = p.items.map(function (x) { return '<li><span>' + x.label + '</span><b>' + naira(x.price) + '</b></li>'; }).join('') + (p.domFree ? '<li><span>.com.ng Nigerian domain (1st year)</span><b>Included</b></li>' : '');
      out.querySelector('.qc-total').textContent = pre + naira(total);
      out.querySelector('.qc-dep').textContent = pre + naira(total * 0.7);
      out.querySelector('.qc-bal').textContent = pre + naira(total * 0.3);
      out.querySelector('.qc-upfront').textContent = pre + naira(Math.round(total * 0.95));
      out.querySelector('.qc-store').hidden = !p.store;
      out.querySelector('.qc-com').hidden = p.domFree;
      var msg = 'Hello SIRRADDO, I would like this quote from your website:\n\n' + p.items.map(function (x) { return '• ' + x.label + ': ' + naira(x.price); }).join('\n') + (p.domFree ? '\n• .com.ng domain: included' : '') +
        '\n\nTotal: ' + pre + naira(total) + '\n70% to start: ' + pre + naira(total * 0.7) + '\n30% before launch: ' + pre + naira(total * 0.3) + '\nOr 100% upfront (5% off): ' + pre + naira(Math.round(total * 0.95)) + '\nDelivery: about 7 working days' + (p.store ? '\n(Online Store price depends on my catalogue)' : '') + (p.domFree ? '' : '\n(.com renewal: +₦18,000/year from year 2)') + '\n\nMy business name: ';
      out.querySelector('.qc-send').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
    }
    q.addEventListener('change', render);
    render();
  }
})();
