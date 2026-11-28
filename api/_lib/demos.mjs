// Demo websites by trade, built on the fly with our real website builder (sitegen) and sample content, so agents
// and the team can show a business owner "a website like yours" on a phone: /demo, /demo/salon, /demo/salon/contact…
// The businesses are made up; every page says it's a demo and links to "Get one like this" (the agent's link when
// opened from an agent's dashboard, ?a=CODE).
const img = (name, type = "image/svg+xml") => ({ url: `/assets/demo/${name}.svg`, name: `${name}.svg`, type });
const base = { phone: "0800 000 0000", whatsapp: "08000000000", email: "hello@example.com.ng" };

export const DEMOS = {
  salon: {
    label: "Hair & beauty salon", icon: "💇🏾‍♀️", interest: "Business website",
    brief: { ...base, business_name: "Glow Haven Salon", tagline: "Neat hair, happy you", colours: "wine and pink", style: "Elegant and classy",
      description: "Hair salon in Bodija, Ibadan for braids, wigs, natural hair care and nails.", address: "12 Bodija Market Road, Ibadan", hours: "Mon–Sat 8am–7pm",
      pages_10: ["Home", "About us", "Services", "Prices", "Gallery", "Testimonials", "Contact"],
      services: [{ name: "Knotless braids", details: "Medium or small, waist length", price: "25000" }, { name: "Wig installation", details: "Frontal or closure, with styling", price: "15000" },
        { name: "Natural hair treatment", details: "Wash, steam and deep conditioning", price: "8000" }, { name: "Gel nails", details: "Hands, with your choice of colour", price: "6000" }],
      testimonials: "Bisi A.: My braids lasted 6 weeks and still looked fresh!\nTolu O.: Very neat and on time. Booking on WhatsApp was easy." },
    files: { photos: [img("salon"), img("salon-2"), img("salon-3"), img("salon-4")] },
    md: `## Page: Home
### Hero
**Headline:** Beautiful hair, done right
**Subheadline:** Braids, wigs and nails in Bodija, by stylists who take their time.
**Button text:** Book on WhatsApp
### Why clients love us
**Text:** Clean salon, gentle hands and styles that last. We tell you the price before we start, and we finish on time.
## Page: About us
### Our story
**Text:** Glow Haven started in 2018 with one chair and a big dream. Today our team of five stylists serves busy women across Ibadan.
## Page: Services
### What we do
**Text:** From protective styles to nail care, everything you need for a fresh look.
## Page: Prices
### Our prices
**Text:** Prices include washing and styling. Bring your own hair or buy from us.
## Page: Gallery
### Recent work
**Text:** A few of the styles we did this month.
## Page: Testimonials
### What clients say
**Text:** Real words from our clients.
## Page: Contact
### Visit or book
**Text:** Walk in or book on WhatsApp to skip the queue.`,
  },
  restaurant: {
    label: "Restaurant & food", icon: "🍲", interest: "Business website",
    brief: { ...base, business_name: "Mama Tee's Kitchen", tagline: "Home-cooked meals, fast", colours: "orange and brown", style: "Bold and colourful",
      description: "Nigerian food in Ring Road, Ibadan: amala, rice, swallow and soups. Eat in, take away or delivery.", address: "5 Ring Road, Ibadan", hours: "Mon–Sun 8am–9pm",
      pages_10: ["Home", "Menu", "About us", "Gallery", "Delivery", "Contact"],
      services: [{ name: "Amala & Ewedu", details: "With gbegiri and assorted meat", price: "3500" }, { name: "Jollof rice & chicken", details: "Party jollof with fried plantain", price: "4000" },
        { name: "Pounded yam & Egusi", details: "With beef or fish", price: "4500" }, { name: "Small chops pack", details: "For parties: puff-puff, samosa, spring rolls", price: "12000" }] },
    files: { photos: [img("restaurant"), img("restaurant-2")] },
    md: `## Page: Home
### Hero
**Headline:** Hot food, just like home
**Subheadline:** Order your favourite Nigerian dishes and get them delivered in Ibadan.
**Button text:** Order on WhatsApp
### Fresh every day
**Text:** We cook fresh every morning with clean ingredients and generous portions.
### Ibadan delivery zones
**Text:** Ring Road & Oluyole ₦1,000 · Bodija & Akobo ₦1,500. Order before 11am for lunch.
## Page: Menu
### Our menu
**Text:** Pick your meal and send us a WhatsApp message to order.
## Page: About us
### About Mama Tee
**Text:** Mama Tee has cooked for families and parties in Ibadan for over 15 years.
## Page: Gallery
### From our kitchen
**Text:** Some of today's dishes.
## Page: Delivery
### Delivery
**Text:** Ring Road & Oluyole ₦1,000 · Bodija & Akobo ₦1,500 · other parts of Ibadan from ₦2,000. Orders before 11am arrive for lunch.
## Page: Contact
### Find us
**Text:** Eat in, take away, or order for delivery.`,
  },
  church: {
    label: "Church & ministry", icon: "⛪", interest: "Business website",
    brief: { ...base, business_name: "Grace Assembly Ibadan", giving: "Tithes & offerings: Example Bank · 0123456789 · Grace Assembly Ibadan\nBuilding project: Example Bank · 0123456780 · Grace Assembly Building Fund", tagline: "A family of faith", colours: "royal blue and gold", style: "Simple and friendly",
      description: "A friendly church in Agodi, Ibadan with Sunday services, Bible study, youth and children's church.", address: "20 Agodi Road, Ibadan", hours: "Sunday 8am & 10am · Wednesday 6pm",
      pages_10: ["Home", "About us", "Services", "Events", "Gallery", "Contact"],
      services: [{ name: "Sunday service", details: "8am and 10am, with children's church" }, { name: "Bible study", details: "Wednesdays at 6pm" },
        { name: "Youth fellowship", details: "Fridays at 5pm" }, { name: "Counselling", details: "Book a time with a pastor" }] },
    files: { photos: [img("church"), img("church-2")] },
    md: `## Page: Home
### Hero
**Headline:** You belong here
**Subheadline:** Join us this Sunday for worship, the Word and warm fellowship.
**Button text:** Plan your visit
### This week
**Text:** Sunday services at 8am and 10am. Bible study on Wednesday at 6pm. Everyone is welcome.
## Page: About us
### Who we are
**Text:** Grace Assembly is a growing family of believers in Agodi, serving our city with love since 2005.
## Page: Services
### Our services
**Text:** Times for worship, study and fellowship.
## Page: Events
### Coming up
**Text:** Youth camp in December and our Christmas carol service on 21 December.
## Page: Gallery
### Moments
**Text:** Photos from our services and events.
## Page: Contact
### Visit us
**Text:** We'd love to meet you. Call or send a WhatsApp message with any question.`,
  },
  school: {
    label: "School", icon: "🏫", interest: "Business website",
    brief: { ...base, business_name: "Bright Stars School", tagline: "Raising confident learners", colours: "green and white", style: "Clean and modern",
      description: "Nursery and primary school in Akobo, Ibadan with small classes, a library and after-school clubs.", address: "8 Akobo Road, Ibadan", hours: "Mon–Fri 7:30am–3pm",
      pages_10: ["Home", "About us", "Services", "Admissions", "Gallery", "FAQ", "Contact"],
      services: [{ name: "Nursery", details: "Ages 2–5, play-based learning" }, { name: "Primary", details: "Basic 1–6, Nigerian and British curriculum" },
        { name: "After-school clubs", details: "Coding, music and art" }, { name: "School bus", details: "Pick-up across Akobo and Bodija" }] },
    files: { photos: [img("school"), img("school-2")] },
    md: `## Page: Home
### Hero
**Headline:** Where every child shines
**Subheadline:** Small classes, caring teachers and a safe place to learn in Akobo.
**Button text:** Book a school visit
### Why parents choose us
**Text:** At most 20 pupils per class, a library, and weekly reports so you always know how your child is doing.
## Page: About us
### Our school
**Text:** Bright Stars was founded in 2012 to give every child a strong start.
## Page: Services
### Classes and clubs
**Text:** Learning that grows with your child.
## Page: Admissions
### How to apply
**Text:** Visit the school, collect a form, and your child takes a short friendly assessment. Admission is open all year.
## Page: Gallery
### School life
**Text:** Learning, sports and fun.
## Page: FAQ
### Questions
#### Do you have a school bus?
Yes, we pick up across Akobo and Bodija.
#### When can my child start?
Any time: admission is open all year.
## Page: Contact
### Visit us
**Text:** Call or WhatsApp to book a visit.`,
  },
  realestate: {
    label: "Real estate & property", icon: "🏡", interest: "Business website",
    brief: { ...base, business_name: "Crestline Homes & Properties", tagline: "Verified homes, honest prices", style: "Clean and modern",
      description: "Real estate agency in Ibadan for houses and flats to rent or buy, and land with verified documents.", address: "Bodija, Ibadan", hours: "Mon–Sat 9am–6pm",
      pages_10: ["Home", "Listings", "About us", "FAQ", "Contact"],
      services: [{ name: "3-bedroom flat for Rent in Bodija", details: "All rooms en suite, 24hr security, parking for 2 cars", price: "1800000" }, { name: "4-bedroom duplex for Sale in Akobo", details: "Verified C of O, fitted kitchen, BQ", price: "95000000" },
        { name: "Land for Sale in Jericho", details: "600 sqm plot with C of O, dry land, good road", price: "38000000" }, { name: "Mini flat for Rent in Agodi GRA", details: "New building, prepaid meter", price: "650000" },
        { name: "Shop space for Lease on Ring Road", details: "Ground floor, busy road, 40 sqm", price: "900000" }, { name: "2-bedroom Shortlet in Jericho", details: "Furnished, Wi-Fi and 24/7 power, per night", price: "45000" }] },
    files: { photos: [img("property"), img("property-2")] },
    md: `## Page: Home
### Hero
**Headline:** Find your next home in Ibadan
**Subheadline:** Houses, flats and land with checked documents. Book an inspection on WhatsApp.
**Button text:** Book an inspection
### Why buyers trust us
**Text:** We check the documents of every property before we list it, and we tell you every fee up front.
## Page: Listings
### Available now
**Text:** Filter by rent, sale or land, then ask about any property on WhatsApp.
## Page: About us
### About Crestline
**Text:** Crestline has helped families and businesses find property in Ibadan since 2015.
## Page: FAQ
### Questions
#### Do you charge for inspections?
Inspections are free. Agency and legal fees are shown before you pay anything.
#### Can I pay in instalments?
Some properties allow it. Ask us about the one you like.
## Page: Contact
### Visit our office
**Text:** Call or WhatsApp to book an inspection.`,
  },
  clinic: {
    label: "Clinic & pharmacy", icon: "🩺", interest: "Business website",
    brief: { ...base, business_name: "OliveCare Specialist Clinic", tagline: "Care you can trust", style: "Clean and modern",
      description: "Specialist clinic and laboratory in Iwo Road, Ibadan. Most HMO plans accepted.", address: "Iwo Road, Ibadan", hours: "Mon–Sat 8am–8pm · Emergencies 24/7",
      pages_10: ["Home", "Services", "About us", "FAQ", "Contact"],
      services: [{ name: "General consultation", details: "Doctor on duty every day", price: "10000" }, { name: "Children's clinic", details: "Paediatrician Monday to Friday", price: "15000" },
        { name: "Women's health", details: "Antenatal care and scans", price: "18000" }, { name: "Laboratory tests", details: "Full blood count, malaria, sugar; most results in 24 hours", price: "3000" }] },
    files: { photos: [img("clinic"), img("clinic-2")] },
    md: `## Page: Home
### Hero
**Headline:** See a specialist the same day
**Subheadline:** Consultations and lab tests in Iwo Road, Ibadan, with clear prices before you come.
**Button text:** Book an appointment
### HMO patients welcome
**Text:** We accept most HMO plans. Bring your HMO card and ID.
## Page: Services
### Our services
**Text:** Departments and tests, with prices.
## Page: About us
### About OliveCare
**Text:** Registered doctors and lab scientists, a clean clinic and short waiting times.
## Page: FAQ
### Questions
#### Do I need an appointment?
Walk-ins are welcome; booking on WhatsApp saves you waiting.
#### How do I get my results?
Most results are ready in 24 hours and can be sent to you on WhatsApp.
## Page: Contact
### Find us
**Text:** Call, WhatsApp or walk in.`,
  },
  hotel: {
    label: "Hotel & short-let", icon: "🏨", interest: "Business website",
    brief: { ...base, business_name: "RoyalGate Hotel & Suites", tagline: "Quiet luxury in Ibadan", style: "Elegant and classy",
      description: "Hotel and serviced short-let apartments in Jericho, Ibadan with 24/7 power, Wi-Fi, a pool and an event hall.", address: "Jericho GRA, Ibadan", hours: "Front desk open 24/7",
      pages_10: ["Home", "Rooms", "Events", "About us", "Contact"],
      services: [{ name: "Standard Room", details: "Queen bed, smart TV, work desk, breakfast option", price: "25000" }, { name: "Executive Suite", details: "King bed, lounge area, mini bar, city view", price: "45000" },
        { name: "2-Bed Luxury Short-Let", details: "2 bedrooms, full kitchen, living room; weekly rates", price: "75000" }] },
    files: { photos: [img("hotel"), img("hotel-2")] },
    md: `## Page: Home
### Hero
**Headline:** Quiet luxury in the heart of Ibadan
**Subheadline:** Rooms, suites and short-let apartments with 24/7 power, fast Wi-Fi and a pool. Book direct and save.
**Button text:** Check availability
### Everything you need
**Text:** 24/7 power and solar backup, fast Wi-Fi, 24-hour security, a pool and lounge, and secure parking.
### Events & Conference Hall
**Text:** Up to 150 guests, from ₦150,000/day: weddings, birthdays, trainings and AGMs, with sound, projector and backup power.
## Page: Rooms
### Rooms & short-lets
**Text:** Nightly rates in naira. Weekly and monthly rates on request.
## Page: Events
### The Gate Hall
**Text:** Weddings, birthdays, trainings and AGMs for up to 150 guests, from ₦150,000/day, with sound, projector and backup power. Catering on request.
## Page: About us
### About RoyalGate
**Text:** A calm, secure hotel in Jericho GRA, 10 minutes from Dugbe.
## Page: Contact
### Find us
**Text:** Call or WhatsApp the front desk any time.`,
  },
  fuel: {
    label: "Filling station & gas plant", icon: "⛽", interest: "Business website",
    brief: { ...base, business_name: "PrimeFuel Energy & Gas Plant", tagline: "Fair meters, honest prices", style: "Bold and colourful",
      description: "Filling station and cooking gas (LPG) plant on Iwo Road and Oluyole, Ibadan. Bulk diesel delivery and fleet accounts.", address: "Iwo Road, Ibadan", hours: "Open daily 6am–10pm",
      pages_10: ["Home", "Services", "About us", "Contact"],
      fuel_prices: { pms: { price: "980", status: "available" }, ago: { price: "1150", status: "available" }, lpg: { price: "1200", status: "low" }, updated: "2026-11-26T06:30:00Z" },
      services: [{ name: "Bulk diesel delivery", details: "For businesses, estates, hotels and schools; from 200 litres" }, { name: "Cooking gas refill & delivery", details: "Any cylinder size, home delivery in Ibadan" },
        { name: "Fleet fuel accounts", details: "Fuel cards for your drivers and one monthly invoice" }, { name: "POS & transfer", details: "Pay by card, transfer or cash" }] },
    files: { photos: [img("fuel"), img("fuel-2")] },
    md: `## Page: Home
### Hero
**Headline:** Fuel, diesel and cooking gas. Fair meters, honest prices.
**Subheadline:** Today's prices below. Order bulk diesel for your business or gas delivered to your home.
**Button text:** Order on WhatsApp
### Accurate meter guarantee
**Text:** Our pumps are checked and sealed, so you get every litre you pay for.
## Page: Services
### What we offer
**Text:** Fuel, gas and delivery for homes and businesses.
## Page: About us
### About PrimeFuel
**Text:** A licensed filling station and gas plant serving Ibadan since 2016.
## Page: Contact
### Find the station
**Text:** Iwo Road and Oluyole, Ibadan. Call or WhatsApp for deliveries.`,
  },
  shop: {
    label: "Online store", icon: "🛍️", interest: "Online Store",
    brief: { ...base, business_name: "Adire Lane", tagline: "Made-in-Nigeria fashion", colours: "navy and gold", style: "Clean and modern",
      description: "Ankara, adire and handmade accessories, delivered across Nigeria.", address: "Bodija, Ibadan", hours: "Orders 24/7 · Delivery Mon–Sat",
      pages_10: ["Home", "Shop", "About us", "Delivery", "Contact"],
      products: [["Ankara Maxi Dress", 18500, "Women"], ["Adire Two-Piece", 22000, "Women"], ["Men's Kaftan", 25000, "Men"], ["Aso-Oke Gele", 9500, "Accessories"],
        ["Leather Sandals", 12000, "Accessories"], ["Beaded Necklace", 6500, "Accessories"], ["Kids Ankara Set", 8000, "Kids"], ["Ankara Tote Bag", 7500, "Accessories"]]
        .map(([name, price, category], i) => ({ name, price: String(price), category, details: "Handmade in Ibadan.", photo: `/assets/demo/p${i + 1}.svg`, ...(i === 0 ? { was: "22000" } : {}) })) },
    files: { photos: [img("fashion")], product_photos: Array.from({ length: 8 }, (_, i) => img("p" + (i + 1))) },
    md: `## Page: Home
### Hero
**Headline:** Wear Nigeria, proudly
**Subheadline:** Ankara, adire and handmade pieces, delivered to your door.
**Button text:** Shop now
## Page: Shop
### All products
**Text:** Pick your size and colour, pay by card or transfer, and we deliver.
## Page: About us
### Our story
**Text:** Adire Lane works with local tailors and dyers in Ibadan.
## Page: Delivery
### Delivery
**Text:** Ibadan in 1–2 days, other states in 3–5 days.
## Page: Contact
### Talk to us
**Text:** Questions about sizes or orders? WhatsApp us.`,
  },
};

export function demoRow(key, { surface } = {}) {
  const d = DEMOS[key];
  if (!d) return null;
  return { id: 0, name: "Demo", business: d.brief.business_name, interest: d.interest, status: "won", brief: surface ? { ...d.brief, surface } : d.brief, brief_files: d.files,
    draft_md: `# Website text: ${d.brief.business_name}\n\n${d.md}` };
}
