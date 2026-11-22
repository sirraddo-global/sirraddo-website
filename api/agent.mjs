// /api/agent: the SIRRADDO agents programme (apply, log in, dashboard, bank details, payout request).
// The agent's login is their WhatsApp number + password; the session token is sent as "Authorization: Bearer ag.…".
import { apply, login, agentFromToken, dashboard, saveBank, requestPayout, changePassword, programme, AgentError, agentQr, registerProspect, statement, newsSeen, finishTraining } from "./_lib/agents.mjs";

const hits = new Map(); // ip -> [times]: applying and logging in are limited
function limited(ip, max) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

export default async function handler(req, res) {
  res.setHeader("X-Robots-Tag", "noindex");
  if (!req.query?.qr) res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      // An agent's QR code (for their flyers and cards): /api/agent?qr=CODE → SVG of their link.
      if (req.query?.qr) {
        const svg = await agentQr(String(req.query.qr));
        if (!svg) return res.status(404).json({ error: "Unknown agent code" });
        res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.status(200).send(svg);
      }
      const prog = await programme(); // commission %, smallest payout, levels, for the page
      if (req.query?.by && /^[A-Za-z0-9]{3,20}$/.test(req.query.by)) {
        const { inviterName } = await import("./_lib/agents.mjs");
        return res.status(200).json({ ...prog, invitedBy: await inviterName(req.query.by) });
      }
      return res.status(200).json(prog);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const ip = String(req.headers["x-forwarded-for"] || req.headers["x-nf-client-connection-ip"] || "").split(",")[0].trim() || "?";
    if (body.action === "apply") {
      if (limited("a:" + ip, 5)) return res.status(429).json({ error: "Too many tries. Please wait a bit, or message us on WhatsApp." });
      return res.status(200).json(await apply(body));
    }
    if (body.action === "login") {
      if (limited("l:" + ip, 20)) return res.status(429).json({ error: "Too many tries. Please wait a bit, or message us on WhatsApp." });
      return res.status(200).json(await login(body.phone, body.password));
    }
    const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const a = await agentFromToken(auth);
    if (!a) return res.status(401).json({ error: "Please log in again." });
    switch (body.action) {
      case "me": return res.status(200).json(await dashboard(a));
      case "bank": await saveBank(a, body); return res.status(200).json(await dashboard(a));
      case "payout": await requestPayout(a); return res.status(200).json(await dashboard(a));
      case "password": return res.status(200).json(await changePassword(a, body.current, body.next));
      case "prospect": return res.status(200).json(await registerProspect(a, body));
      case "statement": return res.status(200).json(await statement(a, body.month));
      case "news_seen": return res.status(200).json(await newsSeen(a));
      case "training": return res.status(200).json(await finishTraining(a, body.answers));
      default: return res.status(400).json({ error: "Unknown action" });
    }
  } catch (err) {
    if (err instanceof AgentError) return res.status(err.status).json({ error: err.message });
    console.error("agent api failed", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
