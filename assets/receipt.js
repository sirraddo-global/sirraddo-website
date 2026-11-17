// Store receipts on the buyer's phone: draws the receipt (data in <script id="rcpt">) on a canvas and saves it as a
// picture (PNG) or a PDF. Nothing is emailed or uploaded; it all happens in the browser.
(function () {
  var dataEl = document.getElementById('rcpt');
  if (!dataEl) return;
  var d = JSON.parse(dataEl.textContent);
  var W = 1080, PAD = 64, NAVY = '#13254F', INK = '#1B2433', GREY = '#5A6577', LINE = '#E1E6EF';
  var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  function wrap(ctx, text, max) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  // Draws twice: once to measure the height, then for real.
  function draw(ctx, real) {
    var y = PAD;
    function font(size, weight) { ctx.font = (weight || 400) + ' ' + size + 'px ' + FONT; }
    function text(t, x, size, weight, color, align) {
      font(size, weight); ctx.fillStyle = color || INK; ctx.textAlign = align || 'left';
      if (real) ctx.fillText(t, x, y);
    }
    function rule(color, h) { if (real) { ctx.fillStyle = color; ctx.fillRect(PAD, y, W - PAD * 2, h); } }
    ctx.textBaseline = 'top';
    if (real) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, ctx.canvas.height); }
    // Header: store name (wrapped) on the left, RECEIPT + PAID on the right.
    font(46, 800);
    text('RECEIPT', W - PAD, 46, 800, NAVY, 'right');
    font(22, 700);
    var pw = ctx.measureText('PAID').width + 32;
    if (real) { ctx.fillStyle = '#E6F4EA'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(W - PAD - pw, y + 60, pw, 36, 18); else ctx.rect(W - PAD - pw, y + 60, pw, 36); ctx.fill(); }
    var yy = y; y = y + 66; text('PAID', W - PAD - 16, 22, 700, '#1E7B3C', 'right'); y = yy;
    font(40, 800);
    wrap(ctx, d.store, W - PAD * 2 - 300).forEach(function (l) { text(l, PAD, 40, 800, NAVY); y += 50; });
    font(26);
    if (d.contact) wrap(ctx, d.contact, W - PAD * 2).forEach(function (l) { text(l, PAD, 26, 400, GREY); y += 36; });
    y = Math.max(y, yy + 110) + 28;
    // Receipt no. / date on the left, billed to on the right.
    var top = y, col = W / 2 + 10;
    text('RECEIPT NO.', PAD, 22, 600, GREY); y += 30;
    font(28); wrap(ctx, d.ref, col - PAD - 30).forEach(function (l) { text(l, PAD, 28); y += 36; });
    y += 12; text('DATE PAID', PAD, 22, 600, GREY); y += 30;
    font(28); wrap(ctx, d.when, col - PAD - 30).forEach(function (l) { text(l, PAD, 28); y += 36; });
    var left = y; y = top;
    text('BILLED TO', col, 22, 600, GREY); y += 30;
    font(28); d.buyer.forEach(function (b) { wrap(ctx, b, W - PAD - col).forEach(function (l) { text(l, col, 28); y += 36; }); });
    y = Math.max(left, y) + 30;
    // Items table.
    var cQty = W - PAD - 430, cPrice = W - PAD - 210, cAmt = W - PAD;
    text('Item', PAD, 24, 700, GREY); text('Qty', cQty, 24, 700, GREY, 'center'); text('Price', cPrice, 24, 700, GREY, 'right'); text('Amount', cAmt, 24, 700, GREY, 'right');
    y += 38; rule(NAVY, 4); y += 18;
    d.items.forEach(function (it) {
      font(28); var lines = wrap(ctx, it.name, cQty - PAD - 50);
      text(String(it.qty), cQty, 28, 400, INK, 'center'); text(it.price, cPrice, 28, 400, INK, 'right'); text(it.amount, cAmt, 28, 400, INK, 'right');
      lines.forEach(function (l) { text(l, PAD, 28); y += 38; });
      y += 10; rule(LINE, 2); y += 16;
    });
    if (d.delivery) { text('Delivery', PAD, 28); text(d.delivery, cAmt, 28, 400, INK, 'right'); y += 48; rule(LINE, 2); y += 16; }
    text('Total paid', PAD, 32, 800); text(d.total, cAmt, 40, 800, INK, 'right'); y += 70;
    font(24); wrap(ctx, d.note, W - PAD * 2).forEach(function (l) { text(l, PAD, 24, 400, GREY); y += 34; });
    y += 8; font(24); wrap(ctx, 'Thank you for shopping with ' + d.store + '.', W - PAD * 2).forEach(function (l) { text(l, PAD, 24, 400, GREY); y += 34; });
    return y + PAD;
  }

  function canvas() {
    var c = document.createElement('canvas'); c.width = W; c.height = 400;
    var h = draw(c.getContext('2d'), false);
    c.height = Math.ceil(h);
    draw(c.getContext('2d'), true);
    return c;
  }
  var name = 'Receipt-' + String(d.ref).replace(/[^A-Za-z0-9-]/g, '');
  function save(blob, file) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = file; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  // A one-page PDF holding the receipt as a JPEG (keeps the ₦ sign and any font exactly as on screen).
  function pdf(jpeg, w, h) {
    var pw = 595, ph = Math.round(h * 595 / w), enc = new TextEncoder(), parts = [], offsets = [], len = 0;
    function add(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(n, body, stream) {
      offsets[n] = len; add(n + ' 0 obj\n' + body);
      if (stream) { add('\nstream\n'); add(stream); add('\nendstream'); }
      add('\nendobj\n');
    }
    var content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    add('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4, '<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>', jpeg);
    obj(5, '<< /Length ' + content.length + ' >>', enc.encode(content));
    var xref = len, x = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    add(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }

  function busy(btn, on) { btn.disabled = on; btn.setAttribute('aria-busy', on ? 'true' : 'false'); }
  document.querySelectorAll('[data-save]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      busy(btn, true);
      try {
        var c = canvas();
        if (btn.getAttribute('data-save') === 'png') {
          c.toBlob(function (b) { save(b, name + '.png'); busy(btn, false); }, 'image/png');
        } else {
          c.toBlob(function (b) {
            b.arrayBuffer().then(function (buf) { save(pdf(new Uint8Array(buf), c.width, c.height), name + '.pdf'); busy(btn, false); });
          }, 'image/jpeg', 0.92);
        }
      } catch (e) { busy(btn, false); window.print(); }
    });
  });
})();
