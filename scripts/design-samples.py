#!/usr/bin/env python3
# Builds /design-samples (design-samples.html): every sample design our design tools make, with a summary table
# and, under each picture, its look, colours, fonts and the exact words on it, so people and search engines
# can read every design as text. Pictures in assets/design-samples/, made by rendering the real design tools
# for one sample business (Kassy Treats & More). Re-run after changing the samples:
#   python3 scripts/design-samples.py /path/to/meta.json
import json, html, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
meta = json.load(open(sys.argv[1] if len(sys.argv) > 1 else ROOT / "assets/design-samples/meta.json"))
E = html.escape

GROUPS = [
    ("flyer", "Flyers", "Flyer", "18 looks, each with its own layout, colours and fonts. The order form shows the 3 that suit the business; the designer can switch to any of them."),
    ("menu", "Menus and price lists", "Menu", "When a customer lists 4 or more items, the design becomes a menu or price list, in 5 layouts."),
    ("social", "Social media pack", "Social post", "A set of 5 posts in one style. Each draft shows a different post from the customer's list."),
    ("launch", "Launch pack", "Launch pack", "For a grand opening or a new branch."),
    ("xmas", "Christmas & New Year pack", "Christmas", "The first draft keeps the customer's colours; the others use Christmas colours with snowflakes and an ornament."),
    ("sallah", "Ramadan & Sallah pack", "Ramadan & Sallah", "Eid green or Ramadan night colours with a crescent and stars."),
    ("easter", "Easter pack", "Easter", "Easter purple or spring colours with Easter eggs."),
    ("independence", "Independence Day pack", "Independence", "Naija green with green-white-green bands."),
    ("invite", "Invitations", "Invitation", "Weddings, birthdays, naming ceremonies and events. The contact line reads RSVP."),
    ("card", "Business cards", "Business card", "5 layouts, front and back in one picture. The back has a QR code to WhatsApp or the website."),
    ("logo", "Logos", "Logo", "18 logos made straight away from the business name: 13 from the initials and 5 with an icon chosen from what the business does."),
    ("sizes", "Sizes", "Size", "Every design also comes in WhatsApp status, square and A4 print sizes."),
    ("more", "More industry samples", "Industry sample", "Five designs for other kinds of business: real estate, church, salon and beauty, a corporate business card and a product label. Same design tools, set to each business's own colours and fonts. The photo spaces show an icon here; the customer's own photos go there."),
]
SIZE_NAMES = ["WhatsApp status (9:16)", "Square (1:1)", "A4 print"]

def swatch(hexv):
    return f'<span class="dsx-sw" style="background:{E(hexv)}" aria-hidden="true"></span>{E(hexv.upper())}' if hexv else ""

def colours(m):
    c = (m or {}).get("colours") or {}
    parts = [("Main", c.get("main")), ("Accent", c.get("accent")), ("Light", c.get("light"))]
    return " ".join(f'<span class="dsx-c">{k}: {swatch(v)}</span>' for k, v in parts if v)

def colours_text(m):
    c = (m or {}).get("colours") or {}
    return ", ".join(f"{k} {v.upper()}" for k, v in [("main", c.get("main")), ("accent", c.get("accent")), ("light", c.get("light"))] if v)

def lines(m):
    out = []
    for t in (m or {}).get("text") or []:
        out += [x.strip() for x in str(t).split("\n") if x.strip()]
    return out

rows, sections, n = [], [], 0
for key, title, short, intro in GROUPS:
    items = meta.get(key) or []
    figs = []
    for i, it in enumerate(items):
        n += 1
        m = it.get("m") or {}
        layout = m.get("layout") or it["t"].split(" · ")[0]
        look = m.get("look") or ""
        name = it["name"] + " (" + (look + " look · " if look else "") + layout + " layout)" if it.get("name") else SIZE_NAMES[i] + " · " + layout if key == "sizes" else (look + " look · " + layout + " layout" if look else layout)
        fonts = ", ".join(m.get("fonts") or [])
        words = lines(m)
        img = f"/assets/design-samples/{key}-{i:02d}.jpg"
        alt = f"{short} {i + 1}: {name}. Text: " + " · ".join(words)
        rows.append(f"<tr><td>{E(title)}</td><td>{n}. {E(name)}</td><td>{E(colours_text(m))}</td><td>{E(fonts)}</td><td>{E(' · '.join(words))}</td></tr>")
        figs.append(f'''<figure class="dsx-fig" id="d{n}">
  <img src="{img}" alt="{E(alt)}" loading="lazy" decoding="async">
  <figcaption>
    <strong>{n}. {E(name)}</strong>
    <span class="dsx-meta">{colours(m)}</span>
    {f'<span class="dsx-meta">Fonts: {E(fonts)}</span>' if fonts else ''}
    <span class="dsx-words">{'<br>'.join(E(w) for w in words)}</span>
  </figcaption>
</figure>''')
    sections.append(f'<section class="section dsx-sec" id="{key}"><div class="container"><h2>{E(title)}</h2><p class="lead">{E(intro)}</p><div class="dsx-grid{" dsx-wide" if key in ("card", "logo") else ""}">' + "".join(figs) + "</div></div></section>")

nav = "".join(f'<a href="#{k}">{E(t)}</a>' for k, t, _, _ in GROUPS)
main = f'''<main id="main">
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow">Design samples</p>
        <h1>{n} designs from our design studio</h1>
        <p class="lead">Every design below was made by the same design tools our customers use on <a href="/design">sirraddo.com.ng/design</a>, mostly for one sample business, Kassy Treats &amp; More (a bakery in Ibadan), with sample wording and six product photos, plus five more for a property company, a church, a salon, a law firm and a drinks label. Under each picture you can read its look, colours, fonts and every word on it.</p>
        <p><a class="btn btn--gold" href="/design">Order your design</a></p>
      </div>
    </section>
    <nav class="dsx-nav" aria-label="Design types"><div class="container">{nav}<a href="#summary">Summary table</a></div></nav>
    <section class="section" id="summary"><div class="container">
      <h2>All {n} designs at a glance</h2>
      <details class="dsx-sum" open><summary>Show or hide the table</summary>
      <div class="dsx-table"><table>
        <thead><tr><th>Category</th><th>Design and look</th><th>Colours</th><th>Fonts</th><th>Words on the design</th></tr></thead>
        <tbody>{"".join(rows)}</tbody>
      </table></div></details>
      <p class="dsx-note">Sample business and wording for illustration. The phone number shown is a sample.</p>
    </div></section>
    {"".join(sections)}
  </main>'''

shell = (ROOT / "design.html").read_text()
head, rest = shell.split('<main id="main">', 1)
foot = rest.split("</main>", 1)[1]
head = re.sub(r"<title>.*?</title>", "<title>Design samples: flyers, menus, business cards and logos | SIRRADDO</title>", head, flags=re.S)
head = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{n} sample designs from SIRRADDO\'s design studio: flyers, menus, social media packs, seasonal packs, invitations, business cards and logos, with their colours, fonts and text.">', head)
head = re.sub(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="https://www.sirraddo.com.ng/design-samples">', head)
head = re.sub(r'<meta property="og:url" content="[^"]*">', '<meta property="og:url" content="https://www.sirraddo.com.ng/design-samples">', head)
head = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="Design samples | SIRRADDO">', head)
head = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', "", head, flags=re.S)
head = re.sub(r'<script[^>]*src="/assets/design\.js[^"]*"[^>]*></script>\s*', "", head)
foot = re.sub(r'<script[^>]*src="/assets/(design|growth)\.js[^"]*"[^>]*></script>\s*', "", foot)
(ROOT / "design-samples.html").write_text(head + main + foot)
print("design-samples.html:", n, "designs")
