/* "Websites we have built": adds live client websites whose owners agreed to be shown
   (Admin → Marketing → Showcase → "Customer agreed"). They go before the demo cards. */
(function () {
  var grid = document.querySelector('#work .grid');
  if (!grid || !window.fetch) return;
  fetch('/api/site?work=1').then(function (r) { return r.ok ? r.json() : { work: [] }; }).then(function (j) {
    (j.work || []).forEach(function (w) {
      var card = document.createElement('article');
      card.className = 'card work work--client';
      var pv = document.createElement('div');
      pv.className = 'work-preview work-preview--client';
      pv.style.background = w.primary || '#13244F';
      if (w.photo) {
        var img = document.createElement('img');
        img.src = w.photo; img.alt = 'Photo from the ' + w.name + ' website'; img.loading = 'lazy'; img.decoding = 'async';
        pv.appendChild(img);
      }
      var tag = document.createElement('span');
      tag.className = 'work-client-name';
      if (w.logo) { var lg = document.createElement('img'); lg.src = w.logo; lg.alt = ''; lg.className = 'work-client-logo'; tag.appendChild(lg); }
      tag.appendChild(document.createTextNode(w.name));
      pv.appendChild(tag);
      var body = document.createElement('div');
      body.className = 'work-body';
      var badge = document.createElement('span');
      badge.className = 'badge badge--gold';
      badge.textContent = w.interest || 'Website';
      var h = document.createElement('h3'); h.textContent = w.name;
      body.appendChild(badge); body.appendChild(h);
      if (w.rating) { var st = document.createElement('p'); st.className = 'work-stars'; st.textContent = '★★★★★'.slice(0, Math.round(w.rating.average)) + ' ' + w.rating.average + ' from ' + w.rating.count + ' review' + (w.rating.count === 1 ? '' : 's'); body.appendChild(st); }
      if (w.tagline) { var p = document.createElement('p'); p.textContent = w.tagline; body.appendChild(p); }
      if (w.url) {
        var a = document.createElement('a');
        a.className = 'card-link'; a.href = w.url; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = 'Visit ' + w.host;
        var vh = document.createElement('span'); vh.className = 'visually-hidden'; vh.textContent = ' (opens in a new tab)';
        a.appendChild(vh); a.appendChild(document.createTextNode(' →'));
        body.appendChild(a);
      }
      card.appendChild(pv); card.appendChild(body);
      var demo = grid.querySelector('.work-preview--placeholder');
      grid.insertBefore(card, demo ? demo.closest('article') : null);
    });
  }).catch(function () {});
})();
