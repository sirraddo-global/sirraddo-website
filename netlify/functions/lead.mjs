// Netlify wrapper for api/lead.mjs (the handler itself is shared with the tests).
import handler from "../../api/lead.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/lead"] };
