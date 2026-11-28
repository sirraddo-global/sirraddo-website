// 🔍 AI check before sending: the AI compares the work with the order and lists what to fix, check or improve.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";
import { permFor } from "../api/_lib/staff.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test("checks a CV and a design against the order; fixes come first", async () => {
  const prev = globalThis.fetch; let seen = "";
  globalThis.fetch = async (u, o) => {
    if (String(u).includes("generativelanguage") && String(o?.body || "").includes("quality checker")) {
      seen = String(o.body);
      const reply = JSON.stringify({ verdict: "ready", summary: "Nearly there.", issues: [{ level: "tip", where: "Profile", problem: "A bit long", fix: "Cut to 3 lines" }, { level: "fix", where: "Phone", problem: "Phone is 0800 000 0001 but the order says 08000000000", fix: "Use 08000000000" }, { level: "odd", problem: "" }], good: ["Clear layout"] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: reply }] }, finishReason: "STOP" }] }), { status: 200 });
    }
    return prev(u, o);
  };
  try {
    const id = (await h.action({ action: "create", name: "Ada", contact: "08000000000", interest: "CV design", details: "ORDER: CV design\nAbout you:\nAccountant, 4 years at Dunamis Foods" })).json.id;
    const cv = await h.action({ action: "review_work", id, kind: "cv", cv: { name: "Ada", contact: { phone: "0800 000 0001" } } });
    assert.equal(cv.status, 200, cv.text);
    assert.equal(cv.json.verdict, "fix first", "a 'fix' always means not ready, whatever the AI said");
    assert.equal(cv.json.issues[0].level, "fix");
    assert.equal(cv.json.issues.length, 2, "empty issues dropped");
    assert.match(seen, /Dunamis Foods/, "the order is sent for comparison");
    const none = await h.action({ action: "review_work", id, kind: "design", images: [] });
    assert.equal(none.status, 400);
    const d = await h.action({ action: "review_work", id, kind: "design", images: [PNG, "not a picture"] });
    assert.equal(d.status, 200, d.text);
    const bad = await h.action({ action: "review_work", id, kind: "nonsense", images: [PNG] });
    assert.equal(bad.status, 400);
  } finally { globalThis.fetch = prev; }
  assert.equal(permFor("review_work"), "build");
});
