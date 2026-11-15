// Netlify wrapper for api/chat-upload.mjs (pictures and PDFs sent in the website chat).
import handler from "../../api/chat-upload.mjs";
import { adapt } from "../lib/adapter.mjs";

export default adapt(handler);
export const config = { path: ["/api/chat-upload"] };
