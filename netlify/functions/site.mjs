// Netlify wrapper for api/site.mjs (the handler itself is shared with the tests).
import handler from "../../api/site.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/site", "/change"] };
