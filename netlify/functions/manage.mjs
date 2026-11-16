// Netlify wrapper for api/manage.mjs (the store owner's "Manage my store" page).
import handler from "../../api/manage.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/manage", "/api/manage"] };
