// The client review page (/rate?t=…): our client rates SIRRADDO, with their business name and an optional photo.
// The photo is shrunk on the phone (max 600px, JPEG) before it is sent. It waits for approval in admin.
(function () {
  var t = new URLSearchParams(location.search).get('t') || '';
  var $ = function (id) { return document.getElementById(id); };
  var form = $('rt-form'), lead = $('rt-lead'), msg = $('rt-msg'), photo = null;
  var api = '/api/site?client_review=' + encodeURIComponent(t);

  function fail(text) { lead.textContent = text; lead.className = 'rt-msg'; }
  if (!t) { fail('This review link is missing its code. Please use the link we sent you.'); return; }

  fetch(api).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
    if (!x.ok) { fail((x.j && x.j.error) || 'This review link isn\'t valid.'); return; }
    var j = x.j;
    $('rt-title').textContent = 'How did we do' + (j.name ? ', ' + j.name : '') + '?';
    lead.textContent = 'Thank you for choosing SIRRADDO' + (j.business ? ' for ' + j.business : '') + '. A few honest words help other business owners decide. It takes a minute.';
    $('rt-name').value = j.full || j.name || '';
    $('rt-business').value = j.business || '';
    if (j.mine) {
      lead.textContent += ' You have already sent a review: sending again replaces it.';
      var s = form.querySelector('input[name=stars][value="' + j.mine.stars + '"]'); if (s) s.checked = true;
      $('rt-text').value = j.mine.text || '';
      if (j.mine.business) $('rt-business').value = j.mine.business;
    }
    form.hidden = false;
  }).catch(function () { fail('No connection. Please check your internet and reload.'); });

  $('rt-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { msg.textContent = 'Please choose a photo.'; return; }
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      var max = 600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      photo = c.toDataURL('image/jpeg', 0.82);
      URL.revokeObjectURL(url);
      $('rt-preview').src = photo; $('rt-preview').hidden = false; msg.textContent = '';
    };
    img.onerror = function () { msg.textContent = 'That photo couldn\'t be opened. Please try another.'; };
    img.src = url;
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var s = form.querySelector('input[name=stars]:checked');
    var text = $('rt-text').value.trim(), name = $('rt-name').value.trim();
    if (!s) { msg.textContent = 'Please tap the stars to give a rating.'; return; }
    if (text.length < 10) { msg.textContent = 'Please write a sentence or two about working with us.'; return; }
    if (name.length < 2) { msg.textContent = 'Please write your name.'; return; }
    if (!$('rt-consent').checked) { msg.textContent = 'Please tick the box to let us show your review.'; return; }
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; msg.textContent = '';
    btn.textContent = 'Sending…';
    fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      stars: +s.value, text: text, name: name, business: $('rt-business').value.trim(), photo: photo, keepPhoto: !photo, consent: true }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) {
          form.innerHTML = '';
          var p = document.createElement('p'); p.className = 'rt-done';
          p.textContent = 'Thank you! Your review means a lot to us. It will appear on our website once we have checked it.';
          form.appendChild(p);
        } else { btn.disabled = false; btn.textContent = 'Send my review'; msg.textContent = (x.j && x.j.error) || 'Sorry, that didn\'t send.'; }
      }).catch(function () { btn.disabled = false; btn.textContent = 'Send my review'; msg.textContent = 'No connection. Please try again.'; });
  });
})();
