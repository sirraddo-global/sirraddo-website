// SIRRADDO GLOBAL LIMITED — small helpers: mobile menu + WhatsApp contact form.
(function () {
  // ----- Mobile menu -----
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    var setOpen = function (open) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  // ----- Contact form -> WhatsApp (no server) -----
  var WHATSAPP_NUMBER = '2348167550937'; // international format, no "+" or spaces
  var form = document.getElementById('contact-form');
  if (form) {
    var error = document.getElementById('form-error');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = ['cf-name', 'cf-reach', 'cf-message'].map(function (id) {
        return document.getElementById(id);
      });
      var firstEmpty = null;
      fields.forEach(function (f) {
        var empty = !f.value.trim();
        f.setAttribute('aria-invalid', empty ? 'true' : 'false');
        if (empty && !firstEmpty) firstEmpty = f;
      });
      if (firstEmpty) {
        error.textContent = 'Please fill in your name, email or phone, and message.';
        firstEmpty.focus();
        return;
      }
      error.textContent = '';
      var text =
        'Hello SIRRADDO GLOBAL LIMITED,\n\n' +
        fields[2].value.trim() +
        '\n\nName: ' + fields[0].value.trim() +
        '\nEmail or phone: ' + fields[1].value.trim();
      // Save the enquiry first (so it appears in the admin page), then open WhatsApp.
      // WhatsApp opens even if saving fails or takes too long.
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      var openWa = function (ref) {
        button.disabled = false;
        var url = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(text + (ref ? '\nReference: ' + ref : ''));
        window.location.href = url;
      };
      var timer = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 8000); });
      Promise.race([
        fetch('/api/lead', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'contact', name: fields[0].value.trim(), contact: fields[1].value.trim(), details: fields[2].value.trim(), page: location.pathname })
        }).then(function (r) { return r.json().catch(function () { return {}; }); }).catch(function () { return null; }),
        timer
      ]).then(function (j) { openWa(j && j.ref); });
    });
  }
})();
