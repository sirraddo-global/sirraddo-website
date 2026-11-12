// POST /api/paystack-webhook — Paystack tells us about payments here (set this URL in Paystack:
// Settings → API Keys & Webhooks → Live Webhook URL). Every call is checked against PAYSTACK_SECRET_KEY,
// then the transaction is re-checked with Paystack before it is recorded.
import { validSignature, verifyPayment, recordPayment } from "./_lib/paystack.mjs";
import { setMeta } from "./_lib/store.mjs";

async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 512 * 1024) throw new Error("too big");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  let raw;
  try { raw = await readRaw(req); } catch { return res.status(413).json({ error: "Too large" }); }
  // Signed with the secret key (Paystack's standard). If the signature can't be checked (e.g. Paystack changes how it
  // signs), we still only record a payment after asking Paystack directly, so a fake message can't add one.
  const signed = validSignature(raw, req.headers["x-paystack-signature"]);
  let event;
  try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "Bad JSON" }); }
  if (!signed) console.warn("paystack webhook without a valid x-paystack-signature; verifying with Paystack instead");
  if (!signed && !/^SGL\d+-/.test(String(event?.data?.reference || ""))) return res.status(401).json({ error: "Bad signature" });
  await setMeta("paystack_webhook", new Date().toISOString()).catch(() => {}); // shown in admin → Setup status
  try {
    if (event?.event === "charge.success" && event.data?.reference) {
      let tx;
      try { tx = await verifyPayment(event.data.reference); } // trust Paystack's answer, not the message body
      catch (e) {
        if (!signed) return res.status(400).json({ error: "Unknown transaction" });
        throw e; // signed by Paystack: a temporary error, so let Paystack retry
      }
      const result = await recordPayment(tx);
      return res.status(200).json({ ok: true, recorded: Boolean(result?.added) });
    }
    return res.status(200).json({ ok: true, ignored: event?.event || "unknown" });
  } catch (err) {
    console.error("paystack webhook failed", err);
    return res.status(500).json({ error: "Try again" }); // Paystack retries
  }
}
