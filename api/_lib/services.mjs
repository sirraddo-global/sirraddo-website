// Monthly / yearly service fees on top of a project: a dedicated database, custom system hosting and care,
// customer accounts (Standard Store)… Each client can have several. Stored in customer_requests.services:
//   [{ id, name, amount, period: "monthly" | "yearly", next_due: "YYYY-MM-DD", active, started }]
// Paid online (Paystack, kind "service") or recorded in admin; each payment moves next_due on by one period.
// Reminders by email to the client (our direct customer) 7 days before, on the day, and 3 days late.
import { randomBytes } from "node:crypto";
import { q, ensureSchema, getRequest, updateRequest } from "./store.mjs";

export const SERVICE_PRESETS = [
  ["Dedicated database", "monthly"],
  ["Custom system hosting and care", "monthly"],
  ["Customer accounts (Standard Store)", "yearly"],
  ["Website care plan", "monthly"],
];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const todayLagos = () => new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);
export function addPeriod(date, period) {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  if (period === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); }
  return d.toISOString().slice(0, 10);
}
export const daysUntil = (date, today = todayLagos()) => Math.round((new Date(date + "T00:00:00Z") - new Date(today + "T00:00:00Z")) / 86400000);
export const servicesOf = (r) => (Array.isArray(r?.services) ? r.services : []);
export const findService = (r, sid) => servicesOf(r).find((s) => s.id === sid) || null;

// Clean a list coming from admin.
export function cleanServices(list) {
  if (!Array.isArray(list) || list.length > 20) throw new Error("Services must be a list (at most 20)");
  return list.map((s) => {
    const name = String(s?.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const amount = Math.round(Number(String(s?.amount ?? "").replace(/[^\d.]/g, "")));
    if (!name) throw new Error("Each service needs a name");
    if (!(amount > 0)) throw new Error(`Add the amount for "${name}"`);
    if (!ISO.test(String(s?.next_due || ""))) throw new Error(`Choose when "${name}" is next due`);
    return {
      id: /^[a-z0-9]{6,16}$/.test(String(s?.id || "")) ? s.id : randomBytes(5).toString("hex"),
      name, amount, period: s?.period === "yearly" ? "yearly" : "monthly", next_due: s.next_due,
      active: s?.active !== false, started: ISO.test(String(s?.started || "")) ? s.started : todayLagos(),
    };
  });
}

// What can be paid online for a service now: from 14 days before it is due, or any time after.
export function serviceDue(r, sid) {
  const s = findService(r, sid);
  if (!s || !s.active || !(s.amount > 0) || daysUntil(s.next_due) > 14) return null;
  return { kind: "service", amount: s.amount, label: `${s.name} (${s.period}, due ${s.next_due})`, service_id: s.id, service_due: s.next_due };
}
export const dueServices = (r) => servicesOf(r).filter((s) => s.active && daysUntil(s.next_due) <= 14);

// After a payment for (service, due date): move that service on by one period (once per due date).
export async function advanceService(id, sid, due) {
  await ensureSchema();
  const r = await getRequest(id);
  const list = servicesOf(r);
  const s = list.find((x) => x.id === sid);
  if (!s || s.next_due !== due) return r;
  s.next_due = addPeriod(due, s.period);
  return (await updateRequest(id, { services: list })) || r;
}

// Admin "Record payment" (cash / transfer): adds the payment and moves the due date on.
export async function recordServicePayment(id, sid, { amount, date, note } = {}) {
  const r = await getRequest(id);
  const s = findService(r, sid);
  if (!s) throw new Error("Not found");
  const amt = Math.round(Number(String(amount ?? s.amount).replace(/[^\d.]/g, ""))) || s.amount;
  const day = ISO.test(String(date || "")) ? date : todayLagos();
  const payments = [...(r.payments || []), { date: day, amount: amt, kind: "service", service_id: s.id, note: String(note || `${s.name} for ${s.next_due}`).slice(0, 200) }];
  await updateRequest(id, { payments });
  return advanceService(id, s.id, s.next_due);
}

// Clients with a service due within 7 days or overdue (for the daily summary).
export async function servicesDueSoon() {
  await ensureSchema();
  const rows = await q(`SELECT id, name, business, contact, email, doc_token, services FROM customer_requests WHERE jsonb_array_length(services) > 0`, []);
  const out = [];
  for (const r of rows) for (const s of servicesOf(r)) if (s.active && daysUntil(s.next_due) <= 7) out.push({ r, s, days: daysUntil(s.next_due) });
  return out.sort((a, b) => a.days - b.days);
}
