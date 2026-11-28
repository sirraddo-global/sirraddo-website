#!/usr/bin/env python3
"""Writes the 4 "websites by industry" landing pages from websites.html (same head, header and footer).
Run after changing the text below:  python3 scripts/industry-pages.py
"""
import html, json, re, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = (ROOT / "websites.html").read_text()
WA = "2348167550937"

PAGES = [
    dict(slug="school-websites-nigeria", eyebrow="School websites · Ibadan, Nigeria",
         title="School Website Design in Ibadan & Nigeria (From ₦50,000)",
         h1="School website design in Ibadan &amp; Nigeria",
         price="From ₦50,000",
         desc="School websites for nurseries, primary and secondary schools in Ibadan and across Nigeria from ₦50,000: admissions form, parent notices, school calendar and fast loading on parents' phones.",
         lead="A website parents can trust: admissions information and an enquiry form, notices you update yourself, the school calendar and fees, all fast on any phone.",
         wa="Hello SIRRADDO, I saw your school website page. I would like a website for my school.",
         sample=("iframe", "/assets/showcase/brightpath.html", "BrightPath International Schools sample website"),
         pick="Starter",
         feats=[("Admissions made easy", "Entry requirements, fees per level and an admissions enquiry form that comes straight to you."),
                ("Parent notices", "Post resumption dates, PTA meetings and closures yourself, in minutes, from your phone."),
                ("School calendar", "Term dates, exams, open days and events in one place parents can check any time."),
                ("Fast on every phone", "Built mobile-first and light, so it opens quickly even on slow data."),
                ("Gallery and staff", "Photos of your classrooms, labs and events, and your teachers and leadership."),
                ("WhatsApp button", "Parents tap once to call or chat with the school office.")],
         faqs=[("Can parents apply online?", "Yes. The website has an admissions enquiry form with the details you ask for. Each enquiry comes to you by email, and parents can also message the school office on WhatsApp in one tap."),
               ("Can we post notices and change fees ourselves?", "Yes. You can update notices, opening hours and phone numbers yourself, and we make other changes for you through your private link."),
               ("How long does it take?", "Usually 7 working days after we receive your completed project form, logo and photos.")]),
    dict(slug="real-estate-websites-nigeria", eyebrow="Real estate websites · Nigeria",
         title="Real Estate & Property Website Design in Nigeria (From ₦50,000)",
         h1="Real estate &amp; property website design in Nigeria",
         price="From ₦50,000",
         desc="Property websites for Nigerian estate agents and developers from ₦50,000: property listings with C of O and document status, location and budget filters, and WhatsApp inspection booking.",
         lead="Show every property properly: listings with photos, price and document status, filters by location, budget and type, and an inspection request on WhatsApp from every listing.",
         wa="Hello SIRRADDO, I saw your real estate website page. I would like a property website for my business.",
         sample=("iframe", "/assets/showcase/crestline.html", "Crestline Homes & Properties sample website"),
         pick="Business",
         feats=[("Property listings", "Photos, naira price, rooms or plot size and location for every property, sale, rent or land."),
                ("Document status badges", "Mark listings with a verified C of O or other title you have checked, so buyers know what they're seeing."),
                ("Location and budget filters", "Buyers narrow down by area, price range and property type."),
                ("Book an inspection on WhatsApp", "Every listing has a button that sends you the property name and the buyer's request."),
                ("Google Business Profile", "Guided setup on the Business package, so people find your office on Google Maps."),
                ("Mobile-first", "Most buyers browse on their phones: every page is built for them first.")],
         faqs=[("Can I add and remove properties myself?", "Small updates like prices, numbers and notices you can do yourself. For new listings, send the details and photos through your private link and we add them."),
               ("Why does it start at ₦50,000?", "The Starter package (₦50,000, up to 5 pages) suits a single estate or one-page promo. Most agencies with many listings choose Business (₦100,000, up to 10 pages with Google Business Profile setup) or Property Portal Pro, where you add and update listings yourself."),
               ("How long does it take?", "Usually 7 working days after we receive your completed project form, logo and photos.")]),
    dict(slug="ecommerce-online-store-nigeria", eyebrow="Online stores · Paystack · Nigeria",
         title="E-Commerce & Online Store Design with Paystack (From ₦150,000)",
         h1="E-commerce &amp; online store design with Paystack",
         price="From ₦150,000",
         desc="Online stores for Nigerian businesses from ₦150,000: shopping cart, card, transfer or pay-on-delivery checkout, receipts for every order and payments straight into your own Paystack account.",
         lead="Sell around the clock: customers add to cart and pay by card, bank transfer or on delivery, get a receipt straight away, and the money goes into your own Paystack account.",
         wa="Hello SIRRADDO, I saw your online store page. I would like an online store for my business.",
         sample=("img", "/assets/work/demo-store-mobile.jpg", "SIRRADDO demo store on a phone"),
         pick="Online Store",
         feats=[("Shopping cart", "Product catalogue with photos, sizes or options, and a cart that works on any phone."),
                ("Card, transfer or pay on delivery", "You switch each payment method on or off yourself."),
                ("Receipts for every order", "Buyers save or share their receipt, and you get an order email."),
                ("Paid into your own Paystack", "Payments go into your own Paystack account, not ours."),
                ("Your own store admin", "Manage orders, prices, stock and payments from your phone."),
                ("Orders on WhatsApp too", "Customers who prefer to chat can still send their order on WhatsApp.")],
         faqs=[("Do I need a Paystack account?", "Yes, in your business name. We connect your store to it, so every payment goes straight to you. Without it, the store can still take orders on WhatsApp."),
               ("Can I try a store first?", "Yes. Open our demo store at sirraddodemo.com.ng and place a test order."),
               ("What decides the final price?", "Mostly the size of your catalogue. Tell us roughly how many products you sell and we send you a fixed quote.")]),
    dict(slug="clinic-hospital-websites-nigeria", eyebrow="Clinic &amp; pharmacy websites · Nigeria",
         title="Clinic, Hospital & Pharmacy Website Design in Nigeria (From ₦50,000)",
         h1="Clinic, hospital &amp; pharmacy website design in Nigeria",
         price="From ₦50,000",
         desc="Websites for clinics, hospitals and pharmacies in Nigeria from ₦50,000: HMO list, services and lab test menu, doctor schedules and appointment booking on WhatsApp.",
         lead="Help patients choose you with confidence: the HMOs you accept, your services and lab tests, which doctors are in today, and an appointment request on WhatsApp.",
         wa="Hello SIRRADDO, I saw your clinic website page. I would like a website for my clinic / pharmacy.",
         sample=("iframe", "/assets/showcase/olivecare.html", "OliveCare Specialist Clinic sample website"),
         pick="Starter",
         feats=[("HMOs you accept", "A clear list near the top, so patients know before they come."),
                ("Services and lab tests", "Departments and test menus, with prices if you want to show them."),
                ("Doctor schedules", "Which specialists are available on which days."),
                ("Appointment requests on WhatsApp", "Patients fill a short form and it arrives on your WhatsApp."),
                ("Registration and trust", "Your registration details, address, map and opening hours."),
                ("Fast on every phone", "Light, mobile-first pages that open quickly.")],
         faqs=[("Is patient information kept on the website?", "No. Appointment requests go straight to your WhatsApp; the website doesn't store medical records."),
               ("Can pharmacies show products and prices?", "Yes. A Starter or Business website can list products and prices. To take payments online, choose the Online Store."),
               ("How long does it take?", "Usually 7 working days after we receive your completed project form, logo and photos.")]),
    dict(slug="hotel-websites-nigeria", eyebrow="Hotel &amp; short-let websites · Nigeria",
         title="Hotel & Short-Let Website Design in Nigeria (From ₦100,000)",
         h1="Hotel &amp; short-let website design in Nigeria",
         price="From ₦100,000",
         desc="Websites for hotels, guest houses and short-let apartments in Nigeria from ₦100,000: direct booking requests on WhatsApp, rooms with naira nightly rates, amenities, event hall enquiries and a map.",
         lead="Take bookings direct, without paying booking-site commission: guests pick their dates and room, see the nightly rate and send the request to your front desk on WhatsApp.",
         wa="Hello SIRRADDO, I saw your hotel website page. I would like a website for my hotel / short-let.",
         sample=("iframe", "/assets/showcase/royalgate-hotel.html", "RoyalGate Hotel & Suites sample website"),
         pick="Business",
         feats=[("Direct booking bar", "Check-in, check-out and room type; the request arrives on your WhatsApp with the number of nights."),
                ("Rooms and short-lets", "Photos, naira nightly rates and what's included for every room, suite or apartment."),
                ("Amenity badges", "24/7 power, Wi-Fi, security, pool, parking: the things guests ask about first."),
                ("Event hall enquiries", "Date, type of event and number of guests, sent to you in one message."),
                ("Map and directions", "Your location on Google Maps, and Google Business Profile setup on the Business package."),
                ("Fast on every phone", "Most guests find you on their phone: every page is built for them first.")],
         faqs=[("Can guests pay online to confirm a booking?", "On the Business package, bookings come to you on WhatsApp and you confirm and collect payment your usual way. If you want guests to pay online on the website, choose the Direct Booking + Paystack package and we connect your own Paystack account."),
               ("Can I change room rates for weekends or festive periods?", "Yes. Send the new rates through your private link and we update them, and you can post short notices yourself (for example a weekend promo)."),
               ("How long does it take?", "Usually 7 working days after we receive your completed project form, logo and photos.")]),
    dict(slug="filling-station-websites-nigeria", eyebrow="Filling station &amp; gas plant websites · Nigeria",
         title="Filling Station & Gas Plant Website Design in Nigeria (From ₦50,000)",
         h1="Filling station &amp; gas plant website design in Nigeria",
         price="From ₦50,000",
         desc="Websites for filling stations and LPG cooking gas plants in Nigeria from ₦50,000: a live pump price board you update from your phone, bulk diesel and home gas delivery requests on WhatsApp, fleet accounts and trust badges.",
         lead="A live price board for petrol, diesel and cooking gas that you update yourself from your phone in seconds, plus bulk diesel and home gas delivery requests on WhatsApp with the estimated total already worked out.",
         wa="Hello SIRRADDO, I saw your filling station website page. I would like a website for my filling station / gas plant.",
         sample=("iframe", "/assets/showcase/primefuel-station.html", "PrimeFuel Energy & Gas Plant sample website"),
         pick="Starter",
         feats=[("Live price board you update yourself", "Open Manage my website on your phone, type today's petrol, diesel and gas prices and tap Available, Low stock or Out of stock. Save, and your website updates within a minute, with the time it was updated."),
                ("Bulk diesel & gas calculator", "Customers enter litres or kg and their delivery zone, see the estimated total and send the request on WhatsApp."),
                ("Fleet and generator accounts", "A clear offer for companies, hotels, schools and estates that buy every month."),
                ("Trust strip", "Accurate meters, POS and transfer, and your licence: the reasons to choose your station."),
                ("Find the station", "Address, opening hours and a map, so drivers can find you."),
                ("Fast on every phone", "Light pages that open quickly, even on slow data.")],
         faqs=[("Can I change the pump prices myself?", "Yes, any time, from your phone. Your private Manage my website link has an 'Update my pump prices & stock' section: type the new prices, tap the stock status and save. No login, no waiting for us."),
               ("Can it work for a gas plant only?", "Yes. We build it around what you sell: cooking gas refills, cylinder sales and home delivery, without the fuel parts."),
               ("How long does it take?", "Usually 7 working days after we receive your completed project form, logo and photos.")]),
]

# Per page: the 3rd card renamed for the industry, and a note under Starter where it only suits a small promo.
TAILOR = {
  "school-websites-nigeria": {"third": ("School Pro", "from ₦150,000", "Everything in Business, plus online payments: admission form fees and school fees paid by card or transfer into your own Paystack account, with a receipt for every payment, links to your result checker or school portal, and WhatsApp.")},
  "real-estate-websites-nigeria": {"starter": "Best for one estate or a one-page promo.", "third": ("Property Portal Pro", "from ₦150,000", "Everything in Business, plus listings you add and update yourself from your phone (no limit), agent profiles, and WhatsApp inspection booking on every property.")},
  "ecommerce-online-store-nigeria": {"starter": "A simple catalogue: your products with Order on WhatsApp buttons, no checkout.", "business": "A bigger catalogue with WhatsApp ordering and a Google listing, no checkout.", "third": ("Online Store with Paystack", "from ₦150,000", "Shopping cart, card, transfer or pay-on-delivery checkout into your own Paystack account, your own store admin and orders on WhatsApp. Large catalogues are quoted.")},
  "clinic-hospital-websites-nigeria": {"third": ("Online Store", "from ₦150,000", "Shopping cart, online payments, your own store admin and orders on WhatsApp. Ideal for pharmacies taking online orders and payments.")},
  "hotel-websites-nigeria": {"starter": "Best for a single short-let apartment (1 page).", "third": ("Direct Booking + Paystack", "from ₦150,000", "Everything in Business, plus guests pay for their booking online by card or transfer into your own Paystack account, with a receipt for every booking. You confirm dates on WhatsApp.")},
  "filling-station-websites-nigeria": {"third": ("Gas Delivery & Multi-Branch Pro", "from ₦150,000", "Everything in Business, plus customers order and pay online for cooking gas refills and cylinders into your own Paystack account, a page and price board for each branch, and orders sent to WhatsApp for dispatch.")},
}
PKGS = [("Starter", "₦50,000", "Up to 5 pages, .com.ng domain, hosting, SSL and 1 business email for the first year."),
        ("Business", "₦100,000", "Up to 10 pages, 5 business emails, Google Business Profile setup and a monthly visitor report."),
        ("Online Store", "from ₦150,000", "Shopping cart, online payments, your own store admin and orders on WhatsApp.")]
OTHERS = [("school-websites-nigeria", "Schools"), ("real-estate-websites-nigeria", "Real estate"), ("ecommerce-online-store-nigeria", "Online stores"), ("clinic-hospital-websites-nigeria", "Clinics &amp; pharmacies"), ("hotel-websites-nigeria", "Hotels &amp; short-lets"), ("filling-station-websites-nigeria", "Filling stations &amp; gas")]

head_end = SRC.index("<main id=\"main\">")
foot_start = SRC.index("</main>")
head, foot = SRC[:head_end], SRC[foot_start:]

def page(p):
    t, d, url = html.escape(p["title"]), html.escape(p["desc"]), "{{SITE_URL}}/" + p["slug"]
    h = head
    h = re.sub(r"<title>.*?</title>", f"<title>{t} – SIRRADDO GLOBAL LIMITED</title>", h)
    h = re.sub(r'(<meta name="description" content=")[^"]*', r"\g<1>" + d.replace("\\", ""), h)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*', r"\g<1>" + t, h)
    h = re.sub(r'(<meta property="og:description" content=")[^"]*', r"\g<1>" + d, h)
    h = h.replace('content="{{SITE_URL}}/websites"', f'content="{url}"').replace('href="{{SITE_URL}}/websites"', f'href="{url}"')
    # only the scripts these pages use
    h = re.sub(r'  <script src="/assets/(showcase|growth|work|reviews)\.js" defer></script>\n', "", h)
    ld = [{"@context": "https://schema.org", "@type": "Service", "name": p["title"], "serviceType": "Website design", "areaServed": "Nigeria",
           "provider": {"@type": "Organization", "name": "SIRRADDO GLOBAL LIMITED", "url": "{{SITE_URL}}"}, "description": p["desc"]},
          {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faqs"]]}]
    h = h.replace("</head>", "".join(f'  <script type="application/ld+json">{json.dumps(x, ensure_ascii=False)}</script>\n' for x in ld) + "</head>")
    wa = f"https://wa.me/{WA}?text=" + urllib.parse.quote(p["wa"])
    kind, src, alt = p["sample"]
    if kind == "iframe":
        sample = f'<div class="ind-phone"><div class="ind-screen"><iframe title="{html.escape(alt)}" loading="lazy" src="{src}"></iframe></div></div>'
        note = '<p class="sc-note">Sample website: the business, prices and photos are examples.</p>'
    else:
        sample = f'<div class="ind-phone"><div class="ind-screen"><img src="{src}" alt="{html.escape(alt)}" width="390" height="780" loading="lazy"></div></div>'
        note = '<p class="sc-note"><a href="https://sirraddodemo.com.ng" target="_blank" rel="noopener">Try the demo store yourself ↗</a></p>'
    feats = "\n".join(f"            <li><b>{a}</b> {b}</li>" for a, b in p["feats"])
    tl = TAILOR.get(p["slug"], {})
    cards = []
    for k, (n, pr, x) in enumerate(PKGS):
        if k == 2 and tl.get("third"): n, pr, x = tl["third"]
        if k == 0 and tl.get("starter"): x = x + " " + tl["starter"]
        if k == 1 and tl.get("business"): x = tl["business"] + " " + x
        pick = (k == 0 and p["pick"] == "Starter") or (k == 1 and p["pick"] == "Business") or (k == 2 and p["pick"] == "Online Store")
        badge = '<span class="ind-badge">Recommended</span>' if pick else ""
        cards.append(f'          <article class="{"is-pick" if pick else ""}">{badge}<h3>{html.escape(n)}</h3><p class="price">{pr}</p><p>{html.escape(x)}</p></article>')
    pk = "\n".join(cards)
    def link(a): return html.escape(a).replace("sirraddodemo.com.ng", '<a href="https://sirraddodemo.com.ng" target="_blank" rel="noopener">sirraddodemo.com.ng<span class="visually-hidden"> (opens in a new tab)</span></a>')
    faq = "\n".join(f"          <details><summary>{html.escape(q)}</summary><p>{link(a)}</p></details>" for q, a in p["faqs"])
    others = "".join(f'<a href="/{s}">{n}</a>' for s, n in OTHERS if s != p["slug"])
    body = f'''<main id="main">
    <section class="hero ind-hero" aria-labelledby="hero-title">
      <div class="container">
        <p class="eyebrow">{p["eyebrow"]}</p>
        <h1 id="hero-title">{p["h1"]} <span class="ind-from">({p["price"]})</span></h1>
        <p class="lead">{p["lead"]}</p>
        <div class="btn-row">
          <a class="btn btn--wa" data-lead="Other" href="{wa}" target="_blank" rel="noopener">Get a quote on WhatsApp<span class="visually-hidden"> (opens WhatsApp in a new tab)</span></a>
          <a class="btn btn--outline-light" href="/websites#quote">Work out your price</a>
        </div>
      </div>
    </section>

    <section class="section section--grey" aria-labelledby="feat-title">
      <div class="container">
        <div class="section-head"><p class="eyebrow eyebrow--dark">What you get</p><h2 id="feat-title">Built for the way your customers decide</h2></div>
        <div class="ind-grid">
          <ul class="ind-feats">
{feats}
          </ul>
          <div>{sample}{note}</div>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="pk-title">
      <div class="container">
        <div class="section-head"><p class="eyebrow eyebrow--dark">Packages</p><h2 id="pk-title">One-off price, first year included</h2><p>Domain, hosting, SSL and business email for the first year are in every package. <a href="/websites#packages">See every detail →</a></p></div>
        <div class="ind-prices">
{pk}
        </div>
      </div>
    </section>

    <section class="section section--grey" aria-labelledby="faq-title">
      <div class="container">
        <div class="section-head"><p class="eyebrow eyebrow--dark">FAQ</p><h2 id="faq-title">Questions we often get</h2></div>
        <div class="faq">
{faq}
          <details><summary>How do I pay?</summary><p>Usually 70% to start and 30% before your website goes live. For projects of ₦150,000 or more you can pay 50% to start, 30% when you approve your preview and 20% before going live.</p></details>
        </div>
        <nav class="ind-links" aria-label="Websites by industry"><b>Other industries:</b> {others}<a href="/websites#showcase">All samples</a></nav>
      </div>
    </section>

    <section class="cta-band" aria-labelledby="cta-title">
      <div class="container">
        <h2 id="cta-title">Ready to get started?</h2>
        <p>Tell us about your business on WhatsApp and we send you a clear, fixed quote.</p>
        <div class="btn-row">
          <a class="btn btn--gold" data-lead="Other" href="{wa}" target="_blank" rel="noopener">Chat on WhatsApp<span class="visually-hidden"> (opens WhatsApp in a new tab)</span></a>
          <a class="btn btn--outline-light" href="/websites">See all website details</a>
        </div>
      </div>
    </section>
  '''
    return h + body + foot

for p in PAGES:
    (ROOT / f'{p["slug"]}.html').write_text(page(p))
    print("wrote", p["slug"] + ".html")
