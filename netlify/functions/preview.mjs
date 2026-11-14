// Netlify wrapper for api/preview.mjs (the handler itself is shared with the tests).
import handler from "../../api/preview.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/preview", "/preview"] };
