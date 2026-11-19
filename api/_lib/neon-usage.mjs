// Database usage watch: reads this month's compute hours and storage from the Neon API (read-only key) once a
// day, shows them in admin (Dashboard and Packages → Database), and emails you at 70% and 90% of the free plan.
// Setup: Neon → Account settings → API keys → create → Netlify env NEON_API_KEY (and NEON_PROJECT_ID if you
// have several projects: Neon → your project → Settings → Project ID). Reading usage doesn't wake the database.
import { getMeta, setMeta, sendEmail, emailConfigured } from "./store.mjs";

const API = "https://console.neon.tech/api/v2";
export const FREE_CUH = 100; // free plan: compute hours per project per month
export const FREE_GB = 1; // free plan: storage per project
export const neonConfigured = () => Boolean(process.env.NEON_API_KEY);

async function call(path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${process.env.NEON_API_KEY}`, Accept: "application/json" } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message || `Neon API ${res.status}`);
  return j;
}
// Which project: NEON_PROJECT_ID, or the one whose endpoint is in DATABASE_URL, or the only one.
async function projectId() {
  if (process.env.NEON_PROJECT_ID) return process.env.NEON_PROJECT_ID;
  const list = (await call("/projects?limit=50")).projects || [];
  if (list.length === 1) return list[0].id;
  const host = (() => { try { return new URL(process.env.DATABASE_URL || "").hostname; } catch { return ""; } })();
  const ep = host.split(".")[0].replace(/-pooler$/, "");
  for (const p of list) {
    const eps = (await call(`/projects/${p.id}/endpoints`)).endpoints || [];
    if (eps.some((e) => e.id === ep)) return p.id;
  }
  throw new Error("Add NEON_PROJECT_ID in Netlify (Neon → your project → Settings → Project ID).");
}

export async function fetchUsage() {
  const id = await projectId();
  const p = (await call(`/projects/${id}`)).project || {};
  return {
    project: id,
    cuh: Math.round(((p.compute_time_seconds || 0) / 3600) * 10) / 10, // 0.25 CU for 1 s = 0.25 compute seconds
    activeHours: Math.round(((p.active_time_seconds || 0) / 3600) * 10) / 10,
    storageGB: Math.round(((p.synthetic_storage_size || 0) / 1e9) * 1000) / 1000,
    periodStart: p.consumption_period_start || null,
    periodEnd: p.consumption_period_end || null,
    at: new Date().toISOString(),
  };
}
export async function savedUsage() {
  try { return JSON.parse((await getMeta(["neon_usage"])).neon_usage || "null"); } catch { return null; }
}

// Daily: refresh, and warn once per month at 70% and once at 90% (only on the free plan).
export async function checkNeonUsage({ plan = "free", site = "" } = {}) {
  if (!neonConfigured()) return null;
  const u = await fetchUsage();
  await setMeta("neon_usage", JSON.stringify(u));
  if (plan !== "free") return u;
  const pct = Math.max(u.cuh / FREE_CUH, u.storageGB / FREE_GB);
  const level = pct >= 0.9 ? 90 : pct >= 0.7 ? 70 : 0;
  const month = (u.periodStart || u.at).slice(0, 7);
  if (level && emailConfigured()) {
    const key = `neon_warned_${month}_${level}`;
    if (!(await getMeta([key]))[key]) {
      await sendEmail(`⚠️ Database at ${Math.round(pct * 100)}% of the free plan this month`,
        `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5">
<p>Your Neon database has used <b>${u.cuh} of ${FREE_CUH} compute hours</b> and <b>${u.storageGB} of ${FREE_GB} GB</b> this month.</p>
<p>${level === 90 ? "<b>Upgrade today.</b> At 100% it pauses for every store until next month (checkout, sign-in and reviews stop)." : "Plan to upgrade this week, before it reaches 100%."}</p>
<p>How: console.neon.tech → your organisation → Billing → Upgrade → <b>Launch</b>. Add a dollar card, set a spending limit (e.g. $25), keep scale to zero on. Nothing else changes.</p>
<p>Then in admin → Packages → Prices, set "Neon plan" to Launch so these warnings stop.</p>
<p><a href="${site}/admin">Open admin</a></p></div>`).catch((e) => console.error("neon warn email failed", e));
      await setMeta(key, "1");
    }
  }
  return u;
}
