// Background remover for the Design studio. Runs on the VPS only (127.0.0.1, never public), as its own PM2 app.
//   POST /remove   body = a JPG/PNG/WebP photo, header x-bg-key: BG_KEY   →   PNG with a see-through background
//   GET  /health   → ok
// Uses the open-source IS-Net model (isnet-general-use, Apache-2.0) through ONNX Runtime. The model is loaded on the
// first request and unloaded after 5 idle minutes, so it only uses memory (~900 MB at peak) while you are designing.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import ort from "onnxruntime-node";
import sharp from "sharp";

const PORT = Number(process.env.BG_PORT || 4105);
const KEY = process.env.BG_KEY || "";
const MODEL = process.env.BG_MODEL || join(fileURLToPath(new URL(".", import.meta.url)), "models", "isnet-general-use.onnx");
const SIZE = 1024, MAX_OUT = 2000, MAX_IN = 12 * 1024 * 1024, IDLE_MS = 5 * 60 * 1000;

let session = null, idleTimer = null, queue = Promise.resolve();
async function getSession() {
  if (!session) session = await ort.InferenceSession.create(MODEL, { intraOpNumThreads: 2, interOpNumThreads: 1, graphOptimizationLevel: "all", enableCpuMemArena: false, enableMemPattern: false, executionMode: "sequential" });
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { const s = session; session = null; try { await s?.release(); } catch {} if (global.gc) global.gc(); }, IDLE_MS);
  return session;
}

export async function removeBackground(input) {
  const base = sharp(input, { failOn: "none" }).rotate(); // respect phone camera rotation
  const meta = await base.metadata();
  const scale = Math.min(1, MAX_OUT / Math.max(meta.width, meta.height));
  const W = Math.round(meta.width * scale), H = Math.round(meta.height * scale);
  const rgb = await base.clone().resize(W, H).removeAlpha().raw().toBuffer();

  // Model input: 1024×1024, scaled by the brightest value, minus 0.5 (as the model was trained).
  const small = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).resize(SIZE, SIZE, { fit: "fill" }).raw().toBuffer();
  let max = 1; for (let i = 0; i < small.length; i++) if (small[i] > max) max = small[i];
  const data = new Float32Array(3 * SIZE * SIZE), plane = SIZE * SIZE;
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) data[c * plane + i] = small[i * 3 + c] / max - 0.5;

  const s = await getSession();
  const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, SIZE, SIZE]) });
  const pred = out[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < plane; i++) { if (pred[i] < lo) lo = pred[i]; if (pred[i] > hi) hi = pred[i]; }
  const mask = Buffer.alloc(plane);
  for (let i = 0; i < plane; i++) mask[i] = Math.round(((pred[i] - lo) / (hi - lo || 1)) * 255);
  const alpha = await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(W, H, { fit: "fill", kernel: "lanczos3" }).extractChannel(0).raw().toBuffer(); // stay 1 channel (sharp makes 3 otherwise)

  return sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 8 }).toBuffer();
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  if (req.method !== "POST" || req.url !== "/remove") { res.writeHead(404); return res.end(); }
  if (!KEY || req.headers["x-bg-key"] !== KEY) { res.writeHead(401); return res.end("bad key"); }
  const chunks = []; let size = 0;
  req.on("data", (c) => { size += c.length; if (size > MAX_IN) req.destroy(); else chunks.push(c); });
  req.on("end", () => {
    // One photo at a time: the server has 2 cores and this uses both.
    queue = queue.then(async () => {
      try {
        const png = await removeBackground(Buffer.concat(chunks));
        res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" }); res.end(png);
      } catch (e) {
        console.error("remove failed", e.message);
        res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "Couldn't read that picture." }));
      }
    });
  });
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, "127.0.0.1", () => console.log(`bg-remover on 127.0.0.1:${PORT}`));
