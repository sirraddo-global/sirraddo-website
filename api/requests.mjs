// /api/requests — admin access to saved customer requests.
// GET: list requests. PATCH { id, status?, notes? }: update one.
// Needs header "Authorization: Bearer <ADMIN_PASSWORD>".
import { timingSafeEqual, createHash } from "node:crypto";
import { listRequests, updateRequest, STATUSES } from "./_lib/store.mjs";

const failed = new Map(); // ip -> [timestamps] of wrong passwords

function authorised(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (expected.length < 12) return false; // refuse weak or missing passwords
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (failed.get(ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 10) return res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });

  if (!authorised(req)) {
    recent.push(now);
    failed.set(ip, recent);
    const configured = (process.env.ADMIN_PASSWORD || "").length >= 12;
    return res.status(401).json({ error: configured ? "Wrong password" : "ADMIN_PASSWORD is not set (min 12 characters)" });
  }
  if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DATABASE_URL is not set" });

  try {
    if (req.method === "GET") {
      return res.status(200).json({ requests: await listRequests(), statuses: STATUSES });
    }
    if (req.method === "PATCH") {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = null; }
      }
      const id = Number(body?.id);
      const status = body?.status;
      const notes = typeof body?.notes === "string" ? body.notes.slice(0, 2000) : undefined;
      if (!Number.isInteger(id) || (status !== undefined && !STATUSES.includes(status))) {
        return res.status(400).json({ error: "Invalid update" });
      }
      const row = await updateRequest(id, { status, notes });
      return row ? res.status(200).json(row) : res.status(404).json({ error: "Not found" });
    }
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("requests failed", err);
    return res.status(500).json({ error: "Database error" });
  }
}
