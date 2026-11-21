// Netlify wrapper for api/agent.mjs (the SIRRADDO agents programme).
import handler from "../../api/agent.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/agent"] };
