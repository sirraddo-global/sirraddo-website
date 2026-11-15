// Service notices: a banner on sirraddo.com.ng (and the project form, pay, preview and change pages) for planned
// upgrades, service problems, holiday breaks or anything else. Admin → Settings → Service notices.
// Each notice: { id, kind, title, message, date, from, to, show_from, on } — times are Lagos time.
// In the message, {date} {from} {to} are replaced, e.g. "Saturday 22 November", "10pm", "2am".
import { randomBytes } from "node:crypto";
import { getMeta, setMeta } from "./store.mjs";

export const NOTICE_KINDS = {
  upgrade: { emoji: "🛠️", title: "Planned upgrade", needsTime: true, message: "We're upgrading our service on {date} from {from} to {to}. Our website, chat and payment pages may be unavailable for a while. Your own website keeps working. Thank you for your patience." },
  issue: { emoji: "⚠️", title: "Service notice", needsTime: false, message: "Some of our services are slow or unavailable right now. We're working on it and will update this notice. For anything urgent, message us on WhatsApp." },
  holiday: { emoji: "📅", title: "Holiday break", needsTime: true, message: "Our office is closed on {date}. Websites, chat and online payments keep working; we'll reply to messages from {to}." },
  offer: { emoji: "📣", title: "News", needsTime: false, message: "" },
  custom: { emoji: "ℹ️", title: "Notice", needsTime: false, message: "" },
};

const DAY = 86400000;
// "2026-11-22" + "22:00" (Lagos, UTC+1) → Date
const at = (date, time) => new Date(`${date}T${/^\d{2}:\d{2}$/.test(time || "") ? time : "00:00"}:00+01:00`);
function window_(n) {
  const start = n.date ? at(n.date, n.from) : null;
  let end = n.date ? at(n.date, n.to || "23:59") : null;
  if (start && end && end <= start) end = new Date(end.getTime() + DAY); // e.g. 10pm → 2am
  const showFrom = n.show_from ? at(n.show_from, "00:00") : start ? new Date(start.getTime() - 3 * DAY) : null;
  return { start, end, showFrom };
}
const niceDate = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Lagos" });
const niceTime = (d) => d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" }).replace(":00", "").replace(" ", "").toLowerCase();

export function noticeText(n) {
  const { start, end } = window_(n);
  return String(n.message || "")
    .replaceAll("{date}", start ? niceDate(start) : "soon")
    .replaceAll("{from}", start ? niceTime(start) : "")
    .replaceAll("{to}", end ? niceTime(end) + (end.toDateString() !== start?.toDateString() ? ` on ${niceDate(end)}` : "") : "");
}
export function noticeStatus(n, now = new Date()) {
  if (!n.on) return "off";
  const { end, showFrom } = window_(n);
  if (end && now > end) return "ended";
  if (showFrom && now < showFrom) return "scheduled";
  return "showing";
}

export async function listNotices() {
  try { return JSON.parse((await getMeta(["notices"])).notices || "[]"); } catch { return []; }
}
export async function currentNotices(now = new Date()) {
  return (await listNotices()).filter((n) => noticeStatus(n, now) === "showing").map((n) => ({
    id: n.id + ":" + (n.updated || ""), kind: n.kind, emoji: (NOTICE_KINDS[n.kind] || NOTICE_KINDS.custom).emoji, title: n.title, message: noticeText(n),
  }));
}

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
export async function saveNotice(input) {
  const list = await listNotices();
  const kind = NOTICE_KINDS[input.kind] ? input.kind : "custom";
  const n = {
    id: /^[\w-]{6,20}$/.test(input.id || "") ? input.id : randomBytes(6).toString("base64url"),
    kind, title: clean(input.title, 80) || NOTICE_KINDS[kind].title, message: clean(input.message, 600),
    date: /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date : "",
    from: /^\d{2}:\d{2}$/.test(input.from || "") ? input.from : "", to: /^\d{2}:\d{2}$/.test(input.to || "") ? input.to : "",
    show_from: /^\d{4}-\d{2}-\d{2}$/.test(input.show_from || "") ? input.show_from : "",
    on: input.on !== false, updated: Date.now().toString(36),
  };
  if (!n.message) throw new Error("Write the message");
  if (/\{(date|from|to)\}/.test(n.message) && !n.date) throw new Error("This message uses {date}/{from}/{to}: pick the date and times");
  const i = list.findIndex((x) => x.id === n.id);
  if (i >= 0) list[i] = n; else list.unshift(n);
  await setMeta("notices", JSON.stringify(list.filter((x) => noticeStatus(x) !== "ended" || x.id === n.id).slice(0, 20)));
  return n;
}
export async function deleteNotice(id) {
  await setMeta("notices", JSON.stringify((await listNotices()).filter((x) => x.id !== id)));
}
// For the admin list: each notice with its status and the text customers see.
export async function noticesForAdmin() {
  return (await listNotices()).map((n) => ({ ...n, status: noticeStatus(n), preview: noticeText(n) }));
}
