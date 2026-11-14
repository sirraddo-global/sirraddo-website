// Netlify wrapper for api/pay.mjs (the handler itself is shared with the tests).
import handler from "../../api/pay.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/pay", "/pay"] };
