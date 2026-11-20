// The one shared Google sign-in page for every Standard Store (www.sirraddo.com.ng/signin).
// A store website opens it with ?s=<store>&o=<store's web address>&r=<page to come back to>. The server checks that
// the address really is that store's website; only then is Google's sign-in handed back, and only to that address:
// by message to the window that opened this one, or (if there isn't one) by going back to the store page.
(function () {
  'use strict';
  var q = new URLSearchParams(location.search), s = q.get('s') || '', o = q.get('o') || '', r = q.get('r') || '/';
  if (r.charAt(0) !== '/' || r.charAt(1) === '/' || r.charAt(1) === '\\') r = '/';
  function $(id) { return document.getElementById(id); }
  function fail(t) { $('lead').textContent = ''; $('msg').className = 'err'; $('msg').textContent = t; }
  function hand(cred) {
    var w = null; try { w = window.opener; } catch (e) { w = null; }
    if (w && !w.closed) {
      try { w.postMessage({ sirraddoGoogle: cred }, o); } catch (e) { /* fall through to going back */ }
      $('lead').textContent = 'Signed in. You can close this window.';
      $('gbtn').hidden = true;
      setTimeout(function () { window.close(); }, 300);
      return;
    }
    location.replace(o + r + '#sgc=' + encodeURIComponent(cred));
  }
  if (!s || !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)) return fail('This sign-in link is not complete. Please go back to the store and tap “Continue with Google” again.');
  fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'google_hub', s: s, o: o }) })
    .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.error || 'Something went wrong'); return j; }); })
    .then(function (j) {
      document.title = 'Sign in to ' + j.name;
      $('title').textContent = 'Sign in to ' + j.name;
      $('lead').textContent = 'Continue with your Google account to see your orders, receipts and saved addresses.';
      var sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
      sc.onerror = function () { fail('Google sign-in could not load. Check your internet and try again, or use your phone number on the store.'); };
      sc.onload = function () {
        try {
          window.google.accounts.id.initialize({ client_id: j.client, callback: function (x) { if (x && x.credential) hand(x.credential); }, auto_select: false, context: 'signin' });
          window.google.accounts.id.renderButton($('gbtn'), { theme: 'outline', size: 'large', width: 280, text: 'continue_with', shape: 'pill' });
        } catch (e) { fail('Google sign-in could not start. Please use your phone number on the store.'); }
      };
      document.head.appendChild(sc);
    })
    .catch(function (e) { fail(e.message); });
}());
