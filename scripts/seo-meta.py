#!/usr/bin/env python3
# Google titles and descriptions for each public page (also used for WhatsApp/Facebook/X link previews).
# Run after editing this list, and after industry-pages.py or design-samples.py (they run it themselves).
# Keep every claim true to the page: prices, what each package includes and delivery times.
import html, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEO = {
    "index.html": ("SIRRADDO | Web Design, Flyers & Digital Solutions in Nigeria",
        "CAC-registered Nigerian tech company in Ibadan (RC 9939920). Business websites from ₦50,000 in 7 working days, flyers from ₦5,000, and custom software."),
    "websites.html": ("Business Website Design in Nigeria (From ₦50,000) | SIRRADDO",
        "Get a fast, mobile-ready business website in Ibadan & across Nigeria from ₦50,000. Live in about 7 working days. Pay 70% to start, 30% before launch."),
    "school-websites-nigeria.html": ("School Website Design in Nigeria (From ₦50,000) | SIRRADDO",
        "Nursery, primary & secondary school websites in Nigeria from ₦50,000. Admissions forms, parent notices, portal links, and Paystack fees on School Pro."),
    "real-estate-websites-nigeria.html": ("Real Estate Website Design Nigeria (From ₦50,000) | SIRRADDO",
        "Property & real estate websites in Nigeria from ₦50,000. Showcase houses, land with C of O, price filters & WhatsApp inspection booking in 7 working days."),
    "ecommerce-online-store-nigeria.html": ("E-Commerce & Online Store Design Nigeria (₦50k+) | SIRRADDO",
        "Sell online in Nigeria from ₦50,000 with WhatsApp ordering, or a full cart with Paystack or Flutterwave checkout and your own store admin from ₦150,000."),
    "clinic-hospital-websites-nigeria.html": ("Clinic, Hospital & Pharmacy Websites Nigeria | SIRRADDO",
        "Trusted websites for clinics, labs & pharmacies in Nigeria from ₦50,000. List HMOs, lab tests, doctor schedules & WhatsApp appointment booking."),
    "hotel-websites-nigeria.html": ("Hotel & Short-Let Website Design Nigeria (₦50k+) | SIRRADDO",
        "Direct booking websites for hotels & short-let apartments in Nigeria from ₦50,000. Room rates, event halls, WhatsApp booking, and Paystack on Direct Booking."),
    "filling-station-websites-nigeria.html": ("Filling Station & Gas Plant Websites Nigeria | SIRRADDO",
        "Websites for filling stations & cooking gas plants in Nigeria from ₦50,000. Live pump price board, bulk diesel calculator & gas delivery orders."),
    "design.html": ("Flyer, Logo & Business Card Design Nigeria (₦5k+) | SIRRADDO",
        "Fast flyer, menu, logo & business card design in Ibadan & Nigeria from ₦5,000. Usually ready in 1–2 working days, in WhatsApp, Instagram & print sizes."),
    "design-samples.html": ("75 Flyer, Menu, Logo & Business Card Samples | SIRRADDO",
        "Browse 75 sample flyers, menus, social posts, labels, business cards and logos made with SIRRADDO's design studio for Nigerian businesses."),
    "services.html": ("Google Maps, WhatsApp Business & CV Services | SIRRADDO",
        "Affordable digital setup for Nigerian businesses & job seekers: Google Maps listing (₦7k), WhatsApp Business (₦5k), CV design (₦3k) & QR menus."),
    "agents.html": ("Earn 10%–15% Referring Website Clients in Nigeria | SIRRADDO",
        "Join the SIRRADDO agent programme in Nigeria. Earn ₦5,000–₦15,000+ per website client and 10% on design orders, with payouts to your bank."),
}

def meta(h, attr, key, value):
    tag = f'<meta {attr}="{key}" content="{value}">'
    pat = re.compile(rf'<meta {attr}="{re.escape(key)}" content="[^"]*">')
    if pat.search(h): return pat.sub(lambda m: tag, h, count=1)
    tw = list(re.finditer(r'<meta name="twitter:[^>]*>', h))
    anchor = (tw[-1] if tw else None) or re.search(r'<meta property="og:[^>]*>\s*(?!.*<meta property="og:)', h, re.S) or re.search(r"</title>", h)
    return h[:anchor.end()] + "\n  " + tag + h[anchor.end():]

def apply(name):
    p = ROOT / name
    if name not in SEO or not p.exists(): return
    t, d = (html.escape(x, quote=True) for x in SEO[name])
    h = p.read_text()
    h = re.sub(r"<title>.*?</title>", lambda m: f"<title>{t}</title>", h, count=1, flags=re.S)
    for attr, key, val in [("name", "description", d), ("property", "og:title", t), ("property", "og:description", d),
                           ("name", "twitter:card", "summary_large_image"), ("name", "twitter:title", t), ("name", "twitter:description", d)]:
        h = meta(h, attr, key, val)
    p.write_text(h)

if __name__ == "__main__":
    for n in SEO: apply(n)
    print(f"SEO tags set on {len(SEO)} pages")
