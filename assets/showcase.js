// Website showcase on /websites: five sample sites in a laptop and a phone, switched by tabs.
(function () {
  var root = document.getElementById('showcase'); if (!root) return;
  var S = [
    { k: 'kassy', name: 'Kassy Treats & More', title: 'Kassy Treats & More: bakery, small chops and catering, Ibadan', tab: 'Food & bakery', url: 'kassytreats.com.ng', what: 'Warm menu with category tabs (Cakes, Small Chops, Parfait & Zobo, Event Trays), naira prices and “+ Add to WhatsApp order”: customers build the whole order, then send it in one message. Same-day Ibadan delivery badge.' },
    { k: 'crestline', name: 'Crestline Homes & Properties', tab: 'Real estate', url: 'crestlinehomes.ng', what: 'Search bar for location, budget and type (Bodija, Jericho, Akobo, Lekki), a 3-column listing grid with “Verified C of O” badges, naira prices, room and plot details, and “Book physical inspection on WhatsApp” on every property.' },
    { k: 'zainab', name: 'Zainab Luxe Atelier', tab: 'Fashion & beauty', url: 'zainabluxe.com', what: 'Editorial split lookbook, an uneven 2-column collection (Bridal Couture, Ready-to-Wear, Luxury Wigs), size and length pills, naira prices and “Order custom fit on WhatsApp” with the chosen size.' },
    { k: 'olivecare', name: 'OliveCare Specialist Clinic', tab: 'Clinic & health', url: 'olivecareclinic.ng', what: 'Trust-first page: HMO and registration strip, 2×2 department and lab cards with clear naira prices and who is available today, and a same-day appointment form that goes straight to WhatsApp.' },
    { k: 'brightpath', name: 'BrightPath International Schools', tab: 'School', url: 'brightpathschools.ng', what: 'Welcoming campus page with Creche / Primary / Secondary tabs (fees per level), a key stats bar, a 4-step admissions timeline, and “Download prospectus / Book a campus tour”.' },
  ];
  var tabs = root.querySelector('.sc-tabs'), stage = root.querySelector('.sc-stage'), fd = root.querySelector('.sc-frame--d iframe'), fm = root.querySelector('.sc-frame--m iframe');
  tabs.innerHTML = S.map(function (s, i) { return '<button type="button" role="tab" aria-selected="' + (i ? 'false' : 'true') + '" class="' + (i ? '' : 'on') + '" data-i="' + i + '"><b>' + s.tab + '</b><span>' + s.name + '</span></button>'; }).join('');
  function pick(i) {
    var s = S[i], src = '/assets/showcase/' + s.k + '.html';
    tabs.querySelectorAll('button').forEach(function (b) { var on = +b.dataset.i === i; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    // only reload a frame when it shows something else (the first one is already in the HTML)
    if (stage.dataset.v !== 'mobile') { if (fd.getAttribute('src') !== src) fd.src = src; } else fd.removeAttribute('src');
    if (stage.dataset.v !== 'desktop') { if (fm.getAttribute('src') !== src) fm.src = src; } else fm.removeAttribute('src');
    stage.dataset.k = s.k; root.querySelector('.sc-url').textContent = s.url; root.querySelector('.sc-name').textContent = s.title || s.name; root.querySelector('.sc-what').textContent = s.what;
    root.querySelector('.sc-open').href = src;
    root.querySelector('.sc-build').href = 'https://wa.me/2348167550937?text=' + encodeURIComponent('Hello SIRRADDO, I saw the ' + s.tab.toLowerCase() + ' sample (' + s.name + ') on your website. I would like a website like this for my business.');
    cur = i;
  }
  var cur = 0;
  tabs.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) pick(+b.dataset.i); });
  tabs.addEventListener('keydown', function (e) { if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; var n = (cur + (e.key === 'ArrowRight' ? 1 : S.length - 1)) % S.length; pick(n); tabs.querySelectorAll('button')[n].focus(); });
  root.querySelector('.sc-view').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    root.querySelectorAll('.sc-view button').forEach(function (x) { x.classList.toggle('on', x === b); });
    stage.dataset.v = b.dataset.v; pick(cur); fit();
  });
  // Scale each page down to its frame: desktop is laid out at 1280px wide, mobile at 390px.
  function scale(box, frame, w, h) { var k = box.clientWidth / w; frame.style.width = w + 'px'; frame.style.height = h + 'px'; frame.style.transform = 'scale(' + k + ')'; box.style.height = (h * k) + 'px'; }
  function fit() { scale(root.querySelector('.sc-frame--d'), fd, 1280, 800); scale(root.querySelector('.sc-frame--m'), fm, 390, 780); }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else window.addEventListener('resize', fit);
  if (window.matchMedia && matchMedia('(max-width: 640px)').matches) { stage.dataset.v = 'mobile'; root.querySelectorAll('.sc-view button').forEach(function (x) { x.classList.toggle('on', x.dataset.v === 'mobile'); }); }
  pick(0); fit();
})();
