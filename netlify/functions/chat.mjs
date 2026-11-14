// Netlify wrapper for api/chat.mjs (the handler itself is shared with the tests).
import handler from "../../api/chat.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/chat"] };
