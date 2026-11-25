// Demo websites by trade, built on the fly with our real website builder (sitegen) and sample content, so agents
// and the team can show a business owner "a website like yours" on a phone: /demo, /demo/salon, /demo/salon/contact…
// The businesses are made up; every page says it's a demo and links to "Get one like this" (the agent's link when
// opened from an agent's dashboard, ?a=CODE).
const img = (name, type = "image/svg+xml") => ({ url: `/assets/demo/${name}.svg`, name: `${name}.svg`, type });
const base = { phone: "0801 234 5678", whatsapp: "08012345678", email: "hello@example.com.ng" };

export const DEMOS = {
  salon: {
    label: "Hair & beauty salon", icon: "💇🏾‍♀️", interest: "Business website",
    brief: { ...base, business_name: "Glow Haven Salon", tagline: "Neat hair, happy you", colours: "wine and pink", style: "Elegant and classy",
      description: "Hair salon in Bodija, Ibadan for braids, wigs, natural hair care and nails.", address: "12 Bodija Market Road, Ibadan", hours: "Mon–Sat 8am–7pm",
      pages_10: ["Home", "About us", "Services", "Prices", "Gallery", "Testimonials", "Contact"],
      services: [{ name: "Knotless braids", details: "Medium or small, waist length", price: "25000" }, { name: "Wig installation", details: "Frontal or closure, with styling", price: "15000" },
        { name: "Natural hair treatment", details: "Wash, steam and deep conditioning", price: "8000" }, { name: "Gel nails", details: "Hands, with your choice of colour", price: "6000" }],
      testimonials: "Bisi A.: My braids lasted 6 weeks and still looked fresh!\nTolu O.: Very neat and on time. Booking on WhatsApp was easy." },
    files: { photos: [img("salon"), img("salon-2")] },
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
**Text:** We deliver across Ibadan from ₦1,000. Orders before 11am arrive for lunch.
## Page: Contact
### Find us
**Text:** Eat in, take away, or order for delivery.`,
  },
  church: {
    label: "Church & ministry", icon: "⛪", interest: "Business website",
    brief: { ...base, business_name: "Grace Assembly Ibadan", tagline: "A family of faith", colours: "royal blue and gold", style: "Simple and friendly",
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

export function demoRow(key) {
  const d = DEMOS[key];
  if (!d) return null;
  return { id: 0, name: "Demo", business: d.brief.business_name, interest: d.interest, status: "won", brief: d.brief, brief_files: d.files,
    draft_md: `# Website text: ${d.brief.business_name}\n\n${d.md}` };
}
