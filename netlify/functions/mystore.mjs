// Netlify wrapper for api/mystore.mjs (the store owner's own admin at /mystore).
import handler from "../../api/mystore.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/mystore"] };
