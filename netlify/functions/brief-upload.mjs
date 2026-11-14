// Netlify wrapper for api/brief-upload.mjs (the handler itself is shared with the tests).
import handler from "../../api/brief-upload.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/brief-upload"] };
