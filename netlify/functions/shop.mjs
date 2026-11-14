// Netlify wrapper for api/shop.mjs (the handler itself is shared with the tests).
import handler from "../../api/shop.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/shop"] };
