// Netlify wrapper for api/demo.mjs (sample websites by trade).
import handler from "../../api/demo.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/demo", "/demo/*"] };
