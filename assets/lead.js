// SIRRADDO — "Choose package" / "Chat on WhatsApp" buttons marked with data-lead.
// Asks for name and number first, saves them (/api/lead), then opens WhatsApp with a reference.
// If anything fails, the visitor still gets to WhatsApp: the link's own href is the fallback.
(function () {
  var WHATSAPP = '2348167550937';
  var buttons = document.querySelectorAll('a[data-lead]');
  if (!buttons.length || typeof HTMLDialogElement !== 'function') return;

  var PACKAGES = ['Starter website', 'Business website', 'Online Store', 'Custom app', 'Other'];
  var LABELS = { 'Starter website': 'Starter (₦50,000)', 'Business website': 'Business (₦100,000)', 'Online Store': 'Online Store (from ₦150,000)', 'Custom app': 'Custom app', Other: 'Not sure yet' };

  var dialog = document.createElement('dialog');
  dialog.className = 'lead-dialog';
  dialog.setAttribute('aria-labelledby', 'lead-title');
  dialog.innerHTML =
    '<form class="lead-form" novalidate>' +
      '<button type="button" class="lead-close" aria-label="Close">×</button>' +
      '<h2 id="lead-title">Let\'s get started</h2>' +
      '<p class="lead-sub">Leave your details so we can follow up, then continue on WhatsApp.</p>' +
      '<label for="lead-name">Your name</label>' +
      '<input id="lead-name" name="name" autocomplete="name" required maxlength="120">' +
      '<label for="lead-contact">WhatsApp number</label>' +
      '<input id="lead-contact" name="contact" type="tel" inputmode="tel" autocomplete="tel" placeholder="080..." required maxlength="40">' +
      '<label for="lead-email">Email <span>(optional, for your invoice and receipts)</span></label>' +
      '<input id="lead-email" name="email" type="email" inputmode="email" autocomplete="email" maxlength="200">' +
      '<label for="lead-business">Business name or type <span>(optional)</span></label>' +
      '<input id="lead-business" name="business" autocomplete="organization" maxlength="200">' +
      '<label for="lead-package">Package</label>' +
      '<select id="lead-package" name="interest">' + PACKAGES.map(function (p) { return '<option value="' + p + '">' + LABELS[p] + '</option>'; }).join('') + '</select>' +
      '<label for="lead-details">Anything else? <span>(optional)</span></label>' +
      '<textarea id="lead-details" name="details" rows="2" maxlength="1000"></textarea>' +
      '<div class="lead-hp" aria-hidden="true"><label for="lead-website">Website</label><input id="lead-website" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<p class="lead-error" role="alert"></p>' +
      '<button class="btn btn--gold btn--block lead-submit" type="submit">Continue to WhatsApp</button>' +
      '<p class="lead-note">We save these details to follow up on your request. See our <a href="/privacy">Privacy Policy</a>. ' +
      '<a class="lead-skip" href="#">Skip and open WhatsApp</a></p>' +
    '</form>';
  document.body.appendChild(dialog);

  var form = dialog.querySelector('form');
  var err = dialog.querySelector('.lead-error');
  var submit = dialog.querySelector('.lead-submit');
  var skip = dialog.querySelector('.lead-skip');
  var current = null; // the button that opened the form
  var f = {};
  ['name', 'contact', 'email', 'business', 'package', 'details', 'website'].forEach(function (k) { f[k] = document.getElementById('lead-' + k); });

  function saved() { try { return JSON.parse(localStorage.getItem('sirraddo-lead') || '{}'); } catch (e) { return {}; } }
  function remember(v) { try { localStorage.setItem('sirraddo-lead', JSON.stringify(v)); } catch (e) { /* ignore */ } }

  function openWhatsApp(text) {
    window.location.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text);
  }

  Array.prototype.forEach.call(buttons, function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      current = a;
      var prev = saved();
      f.name.value = prev.name || '';
      f.contact.value = prev.contact || '';
      f.email.value = prev.email || '';
      f.business.value = prev.business || '';
      f.package.value = a.getAttribute('data-lead') || prev.interest || 'Other';
      f.details.value = '';
      err.textContent = '';
      submit.disabled = false;
      submit.textContent = 'Continue to WhatsApp';
      dialog.showModal();
      (f.name.value ? f.business : f.name).focus();
    });
  });

  dialog.querySelector('.lead-close').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  skip.addEventListener('click', function (e) {
    e.preventDefault();
    dialog.close();
    if (current) window.location.href = current.href;
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = {
      name: f.name.value.trim(), contact: f.contact.value.trim(), email: f.email.value.trim(), business: f.business.value.trim(),
      interest: f.package.value, details: f.details.value.trim()
    };
    if (v.name.length < 2) { err.textContent = 'Please enter your name.'; f.name.focus(); return; }
    if (v.contact.replace(/\D/g, '').length < 10) { err.textContent = 'Please enter your WhatsApp number, e.g. 08012345678.'; f.contact.focus(); return; }
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) { err.textContent = 'Please check your email address.'; f.email.focus(); return; }
    err.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Saving…';
    remember({ name: v.name, contact: v.contact, email: v.email, business: v.business, interest: v.interest });

    var body = Object.assign({ source: 'form', page: location.pathname, website: f.website.value }, v);
    var timer = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 8000); });
    Promise.race([
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .catch(function () { return null; }),
      timer
    ]).then(function (j) {
      var label = v.interest === 'Other' ? 'a website' : 'the ' + v.interest.replace(' website', '') + ' package';
      var text = 'Hi, I\'m ' + v.name + (v.business ? ' (' + v.business + ')' : '') + '. I\'m interested in ' + label + '.' +
        (v.details ? ' ' + v.details : '') + (j && j.ref ? '\nMy reference: ' + j.ref : '');
      if (j && j.error && !j.ok && /valid|name|email/i.test(j.error)) {
        err.textContent = j.error; submit.disabled = false; submit.textContent = 'Continue to WhatsApp'; return;
      }
      submit.textContent = 'Opening WhatsApp…';
      dialog.close();
      openWhatsApp(text);
    });
  });
})();
