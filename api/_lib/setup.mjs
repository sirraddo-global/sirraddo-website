// Admin → Setup status: which connections are set in Vercel, without ever showing a key's value.
import { dbConfigured, emailConfigured, customerEmailConfigured, getMeta } from "./store.mjs";
import { pickProvider } from "./providers.mjs";
import { paystackConfigured } from "./paystack.mjs";
import { SITE } from "./automation.mjs";
import { cloudflareConfigured } from "./cloudflare.mjs";

const VERCEL = "Vercel → your project → Environment Variables, then Redeploy.";

export async function setupStatus() {
  const env = process.env;
  const meta = await getMeta(["daily_run", "paystack_webhook"]).catch(() => ({}));
  const ai = pickProvider();
  const live = /^sk_live_/.test(env.PAYSTACK_SECRET_KEY || "");
  const ranHoursAgo = meta.daily_run ? (Date.now() - Date.parse(meta.daily_run)) / 3600000 : null;
  return [
    { label: "Database (requests, clients, chats)", ok: dbConfigured(), note: "Saved in Neon.", fix: `Add DATABASE_URL. ${VERCEL}` },
    { label: "AI chat assistant and website text", ok: Boolean(ai), note: ai ? `Using ${ai.name === "anthropic" ? "Claude (Anthropic)" : "Gemini (Google)"}.` : "",
      fix: `Add GEMINI_API_KEY (free) or ANTHROPIC_API_KEY. ${VERCEL}` },
    { label: "Emails to you (new leads, morning summary)", ok: emailConfigured(), note: env.LEAD_EMAIL_TO ? `Sent to ${env.LEAD_EMAIL_TO}.` : "",
      fix: `Add RESEND_API_KEY and LEAD_EMAIL_TO. ${VERCEL}` },
    { label: "Emails to customers (receipts, forms, previews)", ok: customerEmailConfigured(), note: env.LEAD_EMAIL_FROM ? `From ${env.LEAD_EMAIL_FROM}.` : "",
      fix: `Verify your domain in Resend, then add LEAD_EMAIL_FROM, e.g. SIRRADDO <receipts@sirraddo.com.ng>. ${VERCEL}` },
    { label: "Photo and logo uploads (project form)", ok: Boolean(env.BLOB_READ_WRITE_TOKEN), note: "Vercel Blob storage.",
      fix: "Vercel → Storage → Create → Blob, connect it to this project with the read-write token, then Redeploy." },
    { label: "Online payments (Paystack)", ok: paystackConfigured(), warn: paystackConfigured() && !live,
      note: paystackConfigured() ? (live ? "Live key: real payments." : "TEST key: payments are not real. Switch to the live key before customers pay.") +
        (meta.paystack_webhook ? ` Last payment notice from Paystack: ${meta.paystack_webhook}.` : " No payment notice received from Paystack yet.") : "",
      fix: `Add PAYSTACK_SECRET_KEY (Paystack → Settings → API Keys & Webhooks → Live Secret Key). ${VERCEL} In Paystack, set the Live Webhook URL to ${SITE}/api/paystack-webhook` },
    { label: "Customer websites (Cloudflare: publish, domains, email forwarding)", ok: cloudflareConfigured(), note: "Go live in one tap from Clients.",
      fix: `In Cloudflare: My Profile → API Tokens → Create Token → Custom token with: Account · Cloudflare Pages · Edit; Account · Email Routing Addresses · Edit; Zone · Zone · Edit; Zone · DNS · Edit; Zone · Email Routing Rules · Edit (Zone resources: All zones from your account). Add it as CLOUDFLARE_API_TOKEN, and your Account ID (Cloudflare home → your account → ⋯ → Copy account ID) as CLOUDFLARE_ACCOUNT_ID. ${VERCEL}` },
    { label: "Daily automation (reminders, morning email, site checks)", ok: (env.CRON_SECRET || "").length >= 16, warn: ranHoursAgo !== null && ranHoursAgo > 30,
      note: meta.daily_run ? `Last ran ${meta.daily_run}${ranHoursAgo > 30 ? ". That is over a day ago: check Vercel → Settings → Cron Jobs." : "."}` : "Hasn't run yet. It runs every morning at 7am.",
      fix: `Add CRON_SECRET (any long random text, at least 16 characters). ${VERCEL}` },
  ];
}
