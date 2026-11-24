// Logo ideas: the AI's SVGs are cleaned (nothing that can run code or load files gets through) and returned to admin.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startHarness } from "./harness.mjs";
import { cleanSvg } from "../api/_lib/logos.mjs";

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h.close(); });

const good = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600"><circle cx="100" cy="200" r="60" fill="#13254f"/><text id="name" x="200" y="210" font-family="Georgia, serif" fill="#e8b230">Bola ${n}</text></svg>`;

test("cleanSvg keeps simple logos and refuses anything risky", () => {
  assert.ok(cleanSvg(good(1)).startsWith("<svg"));
  assert.doesNotMatch(cleanSvg(good(1)), /width=/);
  for (const bad of [
    good(1).replace("<circle", '<script>alert(1)</script><circle'),
    good(1).replace("<circle", '<circle onclick="x()"'),
    good(1).replace("<circle", '<image href="https://x/y.png"/><circle'),
    good(1).replace("<circle", '<a href="javascript:x"><circle').replace("</svg>", "</a></svg>"),
    good(1).replace("<circle", '<foreignObject><div>x</div></foreignObject><circle'),
    good(1).replace('fill="#13254f"', 'fill="url(https://evil/x)"'),
    good(1).replace('id="name"', ""),
    "<div>not a logo</div>",
  ]) assert.equal(cleanSvg(bad), "", bad.slice(0, 80));
});

test("logo_ideas action returns only the clean logos", async () => {
  const prev = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    if (String(u).includes("generativelanguage") && String(o?.body || "").includes("Draw the 3 logos")) {
      const reply = JSON.stringify({ logos: [{ name: "Leaf", svg: good(1) }, { name: "Bad", svg: good(2).replace("<circle", "<script>x</script><circle") }, { name: "Badge", svg: good(3) }] });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Here you go:\n" + reply } ] }, finishReason: "STOP" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return prev(u, o);
  };
  try {
    const r = await h.action({ action: "logo_ideas", brief: { business: "Bola Cakes", what: "cakes", primary: "#5B1A2A", accent: "#F1D3A1" } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.logos.length, 2);
    assert.deepEqual(r.json.logos.map((l) => l.name), ["Leaf", "Badge"]);
    assert.equal(r.json.primary, "#5b1a2a");
    const none = await h.action({ action: "logo_ideas", brief: { business: "" } });
    assert.equal(none.status, 400);
  } finally { globalThis.fetch = prev; }
});
