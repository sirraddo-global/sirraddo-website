// Netlify wrapper for api/brief.mjs (the handler itself is shared with the tests).
import handler from "../../api/brief.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/brief"] };
