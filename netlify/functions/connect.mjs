// Netlify wrapper for api/connect.mjs (the store owner's private "Connect Paystack" page).
import handler from "../../api/connect.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/connect", "/api/connect"] };
