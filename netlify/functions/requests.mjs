// Netlify wrapper for api/requests.mjs (the handler itself is shared with the tests).
import handler from "../../api/requests.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/requests"] };
