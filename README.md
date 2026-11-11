# SIRRADDO GLOBAL LIMITED: company website

A static website (HTML, CSS and a little JavaScript). A tiny build script (`scripts/build.mjs`, plain Node, no packages to install) fills in the site address, generates the sitemap and copies everything into `public/`. Vercel runs it automatically on every deploy.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The main one-page site: hero, About us, Products & services, Compliance, Contact |
| `websites.html` | Website design service page (served at `/websites`): packages, what is included, our work, how it works, renewal, FAQ |
| `privacy.html` | Privacy Policy (served at `/privacy`) |
| `terms.html` | Terms of Use (served at `/terms`) |
| `404.html` | "Page not found" page |
| `assets/styles.css` | All styling. Brand colours are at the top, in `:root` |
| `assets/site.js` | Mobile menu and the contact form, which opens WhatsApp |
| `assets/fonts/` | The Inter font, hosted on this site (no Google Fonts), with its open-source licence |
| `assets/favicon.svg` | Browser tab icon |
| `assets/og-image.png` | Preview image shown when the site is shared on WhatsApp, X, LinkedIn and so on |
| `site.config.mjs` | **Site settings:** the site address (`SITE_URL`), the demo cards switch (`SHOW_DEMO_CARDS`) and the pages listed in the sitemap |
| `scripts/build.mjs` | Build script. Puts `SITE_URL` into the pages, removes the demo cards when switched off, and writes `sitemap.xml` and `robots.txt` |
| `scripts/check-live.mjs` | Checks the live `/websites` page has the expected content (see "Live site check" below) |
| `.github/workflows/live-check.yml` | Runs that check on GitHub after every push to `main` |
| `vercel.json` | Vercel settings: runs the build, serves `public/`, clean URLs (`/privacy` instead of `/privacy.html`) and security headers |

`public/` is created by the build. Don't edit it, and don't commit it.

## Changing text

1. Open the `.html` file in any text editor, or edit it on GitHub with the pencil icon.
2. Find the text with Ctrl+F (Cmd+F on a Mac), change it, and save or commit.
3. Vercel redeploys automatically within a minute or so of a push to `main`.

Things you will probably want to change:

- **Mission statement:** in `index.html`, search for `class="mission"` and change the sentence after it.
- **Website packages and prices:** in `websites.html`, edit the package cards under "Packages" and the renewal price under "Renewal". The homepage card "Websites for businesses" also shows the starting price (₦50,000).
- **Portfolio ("Our work"):** in `websites.html`, the comment above the "Our work" section explains how to swap a "Coming soon" card for a real project with a screenshot (put images in `assets/work/`).
- **Demo cards (Restaurant, School, Shop):** hidden for now. To show them, set `SHOW_DEMO_CARDS = true` in `site.config.mjs`. They sit between the `DEMO_CARDS:START` and `DEMO_CARDS:END` comments in `websites.html`.
- **New page:** add it to `SITEMAP_PAGES` in `site.config.mjs` and give it the same `{{SITE_URL}}` tags in its `<head>` as the other pages.
- **WhatsApp messages on the websites page:** each button's pre-filled message is in its link, after `?text=`. Spaces are written `%20`.
- **SCUML number:** search for `SC 311502618` in all five `.html` files (compliance section and footer).
- **Phone or WhatsApp number:** update it in `index.html` (search for `8167550937`) **and** in `assets/site.js` (`WHATSAPP_NUMBER`).
- **Email address:** search for `sirraddogloballimited@gmail.com` in `index.html`, `privacy.html` and `terms.html`.
- **Header and footer:** each page has its own copy of the header and footer. If you change a link or the copyright line, change it in all five `.html` files.
- **Policy dates:** when you change the Privacy Policy or Terms, update the "Last updated" date at the top of that page.
- **Search and share text:** the `<title>`, `<meta name="description">` and `og:` tags at the top of each page. Leave `{{SITE_URL}}` as it is: the build fills it in.

Keep HTML special characters escaped: write `&amp;` for `&`.

### Logo

The logo is an inline SVG, so it needs no image file. It appears in the header and footer of each page. RR and DD use the class `l-gold`. The other letters and the rule use `l-main`, which takes the colour from the surrounding CSS: navy in the header, white in the footer.

## Previewing locally

You need Node.js 18 or newer. From this folder, run the build:

```bash
node scripts/build.mjs
```

Then serve the result:

```bash
python3 -m http.server 8000 -d public
```

Open http://localhost:8000. Locally, `/privacy` only works as `/privacy.html`; clean URLs work on Vercel. Run the build again after each change.

## Deploying on Vercel

1. On https://vercel.com, choose **Add New → Project** and import this GitHub repository.
2. Framework preset: **Other**. Leave Build Command and Output Directory empty: `vercel.json` sets them.
3. Click **Deploy**. Every push to `main` deploys again automatically.

## Adding a custom domain later (for example `sirraddo.com.ng`)

1. In Vercel, open the project and go to **Settings → Domains**.
2. Type the domain, for example `sirraddo.com.ng`, and click **Add**. Add `www.sirraddo.com.ng` too, and let Vercel redirect one to the other.
3. Vercel shows the DNS records to create. At your domain registrar, open the DNS settings and add them. Usually this means:
   - an **A** record for the root domain (`@`) pointing to the IP address Vercel shows;
   - a **CNAME** record for `www` pointing to the target Vercel shows (such as `cname.vercel-dns.com`).

   Or switch the domain's nameservers to Vercel's, if Vercel offers that.
4. Wait for DNS to update. This can take from a few minutes to 48 hours. Vercel adds the HTTPS certificate automatically.
5. Once the domain works, change one line in `site.config.mjs`:

   ```js
   export const SITE_URL = "https://sirraddo.com.ng";
   ```

   Push to `main`. The next deploy updates the canonical links, `og:url`, the share image link, `sitemap.xml` and `robots.txt` on every page.

## Live site check

After every push to `main`, GitHub Actions waits up to 10 minutes for Vercel to publish. It then checks the live `/websites` page at `SITE_URL`:

- content: no Google Maps item in the "every website" list, "7 working days", renewal prices, demo cards matching `SHOW_DEMO_CARDS`, and one "Recommended" badge on the Business card;
- layout: in Chromium at phone and desktop widths, the "Recommended" band sits on the Business card.

To see the result, open the repository's **Actions** tab and choose **Live site check**. The run summary shows a table of passes and fails. To run it by hand, open **Live site check** and click **Run workflow**.

To run it on your computer against the live site:

```bash
node scripts/check-live.mjs
```

To run it against a local preview:

```bash
BASE_URL=http://localhost:8000 node scripts/check-live.mjs
```

If you change the page on purpose (for example new prices), update the matching line in `scripts/check-live.mjs`.
