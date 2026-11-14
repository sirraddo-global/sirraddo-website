// The morning run, every day at 06:00 UTC (7am in Lagos): see api/_lib/automation.mjs runDaily().
// Netlify stops scheduled runs after 30 seconds, so runDaily leaves slower steps for the next day when
// time is short. You can also start it by hand: Netlify → Logs → Functions → daily → Run now.
import { dbConfigured } from "../../api/_lib/store.mjs";
import { runDaily } from "../../api/_lib/automation.mjs";

export default async (request, context) => {
  globalThis.__requestContext = context;
  if (!dbConfigured()) { console.error("daily: DATABASE_URL is not set"); return new Response("no database", { status: 503 }); }
  try {
    const report = await runDaily();
    console.log("daily run", JSON.stringify(report));
    return new Response("ok");
  } catch (err) {
    console.error("daily run failed", err);
    return new Response("failed", { status: 500 });
  }
};
export const config = { schedule: "0 6 * * *" };
