// POST /api/paystack-webhook — Paystack tells us about payments here (set this URL in Paystack:
// Settings → API Keys & Webhooks → Live Webhook URL). Every call is checked against PAYSTACK_SECRET_KEY,
// then the transaction is re-checked with Paystack before it is recorded.
import { validSignature, verifyPayment, recordPayment } from "./_lib/paystack.mjs";

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
  if (!validSignature(raw, req.headers["x-paystack-signature"])) return res.status(401).json({ error: "Bad signature" });
  let event;
  try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "Bad JSON" }); }
  try {
    if (event?.event === "charge.success" && event.data?.reference) {
      const tx = await verifyPayment(event.data.reference); // trust Paystack's answer, not the message body
      const result = await recordPayment(tx);
      return res.status(200).json({ ok: true, recorded: Boolean(result?.added) });
    }
    return res.status(200).json({ ok: true, ignored: event?.event || "unknown" });
  } catch (err) {
    console.error("paystack webhook failed", err);
    return res.status(500).json({ error: "Try again" }); // Paystack retries
  }
}
