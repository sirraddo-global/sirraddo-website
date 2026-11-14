// Netlify wrapper for api/paystack-webhook.mjs (the handler itself is shared with the tests).
import handler from "../../api/paystack-webhook.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/paystack-webhook"] };
