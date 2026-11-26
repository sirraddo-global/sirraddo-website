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
    function applyShowcase() {
      if (!sc) return;
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
      sc.querySelector('.sc-tabs').addEventListener('click', function () { ['.sc-url', '.sc-name'].forEach(function (c) { var el = sc.querySelector(c); if (el) delete el.dataset.orig; }); setTimeout(applyShowcase, 30); });
      sc.querySelector('.sc-view').addEventListener('click', function () { setTimeout(applyShowcase, 30); });
    }

    // /design: a flyer and a business card drawn with their details.
    var pv = $('bp-designs'), drawn = '';
    function applyDesigns() {
      if (!pv || !window.SirStudio || !window.SirStudio.preview) return;
      var v = val(), name = v.name || 'Kassy Treats & More', phone = v.phone || '0810 838 3146', city = v.city || 'Ibadan · Available nationwide';
      var key = [name, phone, city].join('|'); if (key === drawn) return; drawn = key;
      var photos = v.name ? [{ url: monogram(v.name), name: 'brand.png' }] : ['cake.png', 'meat-pie.jpg', 'parfait.jpg', 'zobo.jpg'].map(function (f) { return { url: '/assets/showcase/' + f, name: f }; });
      var info = { phone: phone, address: city };
      var flyer = window.SirStudio.preview({ size: 'post', business: name, words: name + '\nNow taking orders\nOrder on WhatsApp today', contact: phone, info: info, photos: photos }, 300);
      var card = window.SirStudio.preview({ kind: 'card', business: name, words: name + '\n' + city, contact: phone, info: info, photos: [] }, 300);
      Promise.all([flyer, card]).then(function (r) {
        if (key !== drawn) return;
        var slots = pv.querySelectorAll('.bp-slot');
        [r[0][0], r[1][0]].forEach(function (cv, i) { if (!cv || !slots[i]) return; var box = slots[i].querySelector('.bp-canvas'); box.innerHTML = ''; box.appendChild(cv); });
        pv.hidden = false;
      }).catch(function () { drawn = ''; });
    }
    // Without their photos, a clean brand graphic (their initials) stands in for the picture.
    var monoCache = {};
    function monogram(name) {
      var ini = name.replace(/&/g, ' ').split(/\s+/).filter(function (w) { return /^[A-Za-z0-9]/.test(w); }).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join('') || 'S';
      if (monoCache[ini]) return monoCache[ini];
      var cv = document.createElement('canvas'); cv.width = cv.height = 800; var c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 800, 800); g.addColorStop(0, '#13254F'); g.addColorStop(1, '#0B1733'); c.fillStyle = g; c.fillRect(0, 0, 800, 800);
      c.strokeStyle = 'rgba(217,162,27,.35)'; c.lineWidth = 3; for (var i = -800; i < 800; i += 46) { c.beginPath(); c.moveTo(i, 800); c.lineTo(i + 800, 0); c.stroke(); }
      c.fillStyle = '#B8862F'; c.beginPath(); c.arc(400, 400, 230, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#13254F'; c.font = '800 200px Inter, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ini, 400, 410);
      return (monoCache[ini] = cv.toDataURL('image/png'));
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
      out.querySelector('.qc-store').hidden = !p.store;
      out.querySelector('.qc-com').hidden = p.domFree;
      var msg = 'Hello SIRRADDO, I would like this quote from your website:\n\n' + p.items.map(function (x) { return '• ' + x.label + ': ' + naira(x.price); }).join('\n') + (p.domFree ? '\n• .com.ng domain: included' : '') +
        '\n\nTotal: ' + pre + naira(total) + '\n70% to start: ' + pre + naira(total * 0.7) + '\n30% before launch: ' + pre + naira(total * 0.3) + '\nDelivery: about 7 working days' + (p.store ? '\n(Online Store price depends on my catalogue)' : '') + (p.domFree ? '' : '\n(.com renewal: +₦18,000/year from year 2)') + '\n\nMy business name: ';
      out.querySelector('.qc-send').href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
    }
    q.addEventListener('change', render);
    render();
  }
})();
