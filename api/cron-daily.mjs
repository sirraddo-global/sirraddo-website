// GET /api/cron-daily — runs the morning job by hand (the automatic run is netlify/functions/daily.mjs, 7am Lagos).
// Does everything in api/_lib/automation.mjs runDaily(): the morning summary email with one-tap
// WhatsApp links, automatic customer reminders, client website checks, the Monday report and
// backup, and deleting chats older than 90 days.
// Needs "Authorization: Bearer <CRON_SECRET>".
import { timingSafeEqual, createHash } from "node:crypto";
import { dbConfigured } from "./_lib/store.mjs";
import { runDaily } from "./_lib/automation.mjs";

function authorised(req) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorised" });
  if (!dbConfigured()) return res.status(503).json({ error: "DATABASE_URL is not set" });
  try {
    return res.status(200).json(await runDaily(new Date()));
  } catch (err) {
    console.error("daily cron failed", err);
    return res.status(500).json({ error: "Daily job failed" });
  }
}
