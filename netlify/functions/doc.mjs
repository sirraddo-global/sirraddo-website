// Netlify wrapper for api/doc.mjs (the handler itself is shared with the tests).
import handler from "../../api/doc.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/doc", "/doc"] };
