# SIRRADDO GLOBAL LIMITED: company website

A plain static website (HTML, CSS and a little JavaScript). There is no build step: Vercel serves the files as they are.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The main one-page site: hero, About us, Products & services, Compliance, Contact |
| `privacy.html` | Privacy Policy (served at `/privacy`) |
| `terms.html` | Terms of Use (served at `/terms`) |
| `404.html` | "Page not found" page |
| `assets/styles.css` | All styling. Brand colours are at the top, in `:root` |
| `assets/site.js` | Mobile menu and the contact form, which opens WhatsApp |
| `assets/fonts/` | The Inter font, hosted on this site (no Google Fonts), with its open-source licence |
| `assets/favicon.svg` | Browser tab icon |
| `assets/og-image.png` | Preview image shown when the site is shared on WhatsApp, X, LinkedIn and so on |
| `vercel.json` | Vercel settings: clean URLs (`/privacy` instead of `/privacy.html`) and security headers |

## Changing text

1. Open the `.html` file in any text editor, or edit it on GitHub with the pencil icon.
2. Find the text with Ctrl+F (Cmd+F on a Mac), change it, and save or commit.
3. Vercel redeploys automatically within a minute or so of a push to `main`.

Things you will probably want to change:

- **Mission statement:** in `index.html`, search for `class="mission"` and change the sentence after it.
- **SCUML number:** search for `SC 311502618` in all four `.html` files (compliance section and footer).
- **Phone or WhatsApp number:** update it in `index.html` (search for `8167550937`) **and** in `assets/site.js` (`WHATSAPP_NUMBER`).
- **Email address:** search for `sirraddogloballimited@gmail.com` in `index.html`, `privacy.html` and `terms.html`.
- **Header and footer:** each page has its own copy of the header and footer. If you change a link or the copyright line, change it in all four `.html` files.
- **Policy dates:** when you change the Privacy Policy or Terms, update the "Last updated" date at the top of that page.
- **Search and share text:** the `<title>`, `<meta name="description">` and `og:` tags at the top of each page.

Keep HTML special characters escaped: write `&amp;` for `&`.

### Logo

The logo is an inline SVG, so it needs no image file. It appears in the header and footer of each page. RR and DD use the class `l-gold`. The other letters and the rule use `l-main`, which takes the colour from the surrounding CSS: navy in the header, white in the footer.

## Previewing locally

From this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Locally, `/privacy` only works as `/privacy.html`; clean URLs work on Vercel.

## Deploying on Vercel

1. On https://vercel.com, choose **Add New → Project** and import this GitHub repository.
2. Framework preset: **Other**. Leave Build Command and Output Directory empty.
3. Click **Deploy**. Every push to `main` deploys again automatically.

## Adding a custom domain later (for example `sirraddo.com.ng`)

1. In Vercel, open the project and go to **Settings → Domains**.
2. Type the domain, for example `sirraddo.com.ng`, and click **Add**. Add `www.sirraddo.com.ng` too, and let Vercel redirect one to the other.
3. Vercel shows the DNS records to create. At your domain registrar, open the DNS settings and add them. Usually this means:
   - an **A** record for the root domain (`@`) pointing to the IP address Vercel shows;
   - a **CNAME** record for `www` pointing to the target Vercel shows (such as `cname.vercel-dns.com`).

   Or switch the domain's nameservers to Vercel's, if Vercel offers that.
4. Wait for DNS to update. This can take from a few minutes to 48 hours. Vercel adds the HTTPS certificate automatically.
5. Once the domain works, search all four `.html` files for `https://sirraddo-website.vercel.app` and replace it with your new address (for example `https://sirraddo.com.ng`). This updates the share image, `og:url` and `canonical` links.
