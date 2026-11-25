// The VPS setup: uploads stored in FILES_DIR (put / read / serve / delete), and the server's static + health routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";

test("FILES_DIR storage: put, read, serve, refuse escapes, delete", async () => {
  const dir = await mkdtemp(join(tmpdir(), "files-"));
  process.env.FILES_DIR = dir; process.env.URL = "https://www.sirraddo.com.ng";
  try {
    const p = await import("../api/_lib/platform.mjs?vps=" + Date.now());
    assert.equal(p.filesEnabled(), true);
    const { url } = await p.putFile("chats/2026-11/s1/logo.png", Buffer.from("PNGDATA"), { contentType: "image/png" });
    assert.match(url, /^https:\/\/www\.sirraddo\.com\.ng\/files\/chats\/2026-11\/s1\/logo-[0-9a-f]{16}\.png$/);
    assert.equal(String(await p.readStoredFile(url)), "PNGDATA");
    assert.equal(await p.readStoredFile("https://evil.example/files/" + url.split("/files/")[1]), null, "only our own hosts");
    const res = await p.getFileResponse(url.split("/files/")[1]);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.equal(await p.getFileResponse("../../etc/passwd"), null);
    assert.equal(await p.deleteFiles("chats/2026-11/"), 1);
    assert.equal(await p.getFileResponse(url.split("/files/")[1]), null);
    await p.putFile("chats/2025-01/s/x.jpg", Buffer.from("x"), { contentType: "image/jpeg" });
    assert.equal(await p.deleteOldChatFiles(90, new Date("2026-11-25")), 1, "old month removed");
  } finally { delete process.env.FILES_DIR; await rm(dir, { recursive: true, force: true }); }
});

test("VPS server: health, pages, 404, admin headers, bare domain → www", async () => {
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ["server/vps.mjs"], { env: { ...process.env, PORT: String(port), URL: "https://www.sirraddo.com.ng" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error("server didn't start")), 15000); child.stdout.on("data", (d) => { if (/website on/.test(d)) { clearTimeout(t); ok(); } }); });
    const B = `http://127.0.0.1:${port}`;
    assert.equal(await (await fetch(B + "/health")).text(), "ok");
    assert.equal((await fetch(B + "/design")).status, 200);
    assert.equal((await fetch(B + "/no-such-page")).status, 404);
    const admin = await fetch(B + "/admin");
    assert.equal(admin.headers.get("cache-control"), "no-store");
    const bare = await new Promise((ok) => http.get({ host: "127.0.0.1", port, path: "/design", headers: { host: "sirraddo.com.ng" } }, (r) => { r.resume(); ok(r); }));
    assert.equal(bare.statusCode, 301); assert.equal(bare.headers.location, "https://www.sirraddo.com.ng/design");
    assert.equal((await fetch(B + "/api/order")).status, 200, "functions are routed");
  } finally { child.kill(); }
});
