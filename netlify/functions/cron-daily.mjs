// Netlify wrapper for api/cron-daily.mjs (the handler itself is shared with the tests).
import handler from "../../api/cron-daily.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/cron-daily"] };
