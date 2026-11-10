// Renders the meter device's layers to src/assets/meter/ with a local browser that has WebGL: `make meter`,
// through `heavy`, on the Mac. CI never runs it. The scene (meter.js) needs index.html beside it and imports bare
// `three`, so Vite serves it from this repo and Playwright's Chromium opens it: nothing is fetched from a CDN.
//   TEST_PORT=<port> node tools/meter/render.mjs
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { encodePng } from "./png.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = fileURLToPath(new URL("../../src/assets/meter/", import.meta.url));
const port = Number(process.env.TEST_PORT) || 4311;

const server = await createServer({
  root, configFile: false, appType: "mpa", logLevel: "warn",
  server: { host: "127.0.0.1", port, strictPort: true },
  optimizeDeps: { entries: ["tools/meter/index.html"] },
});
await server.listen();
const browser = await chromium.launch({ args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => { throw e; });
  page.on("console", (m) => { if (m.type() === "error") console.error(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/tools/meter/index.html`);
  await page.waitForFunction(() => document.body.dataset.ready === "1", null, { timeout: 120_000 });
  const { width, height, rects } = await page.evaluate(() => ({ width: window.meter.width, height: window.meter.height, rects: window.meter.rects }));

  // premultiplied RGBA, top row first
  const draw = async (parts) => {
    const b64 = await page.evaluate((p) => window.meter.draw(p), parts);
    const flipped = Buffer.from(b64, "base64");
    const px = Buffer.alloc(flipped.length);
    for (let y = 0; y < height; y++) flipped.copy(px, y * width * 4, (height - 1 - y) * width * 4, (height - y) * width * 4);
    return px;
  };
  // A layer's PNG is straight alpha. A pixel of added light has colour and no alpha, so its alpha is set to the
  // brightest of its channels: laid additively it adds exactly the light drawn, and laid normally it is nearly the same.
  const straight = (px) => {
    const o = new Uint8Array(px.length);
    for (let i = 0; i < px.length; i += 4) {
      const a = Math.max(px[i], px[i + 1], px[i + 2], px[i + 3]);
      if (!a) continue;
      for (let k = 0; k < 3; k++) o[i + k] = Math.min(255, Math.round((px[i + k] * 255) / a));
      o[i + 3] = a;
    }
    return o;
  };
  const crop = (px, r) => {
    const o = Buffer.alloc(r.width * r.height * 4);
    for (let y = 0; y < r.height; y++) px.copy(o, y * r.width * 4, ((r.y + y) * width + r.x) * 4, ((r.y + y) * width + r.x + r.width) * 4);
    return o;
  };
  // the picture's box around a plane, grown outwards to whole pixels and kept inside the picture
  const box = (r) => {
    const x = Math.max(0, Math.floor(r.x0)), y = Math.max(0, Math.floor(r.y0));
    return { x, y, width: Math.min(width, Math.ceil(r.x1)) - x, height: Math.min(height, Math.ceil(r.y1)) - y };
  };

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const layers = {};
  const write = (file, px, r) => {
    writeFileSync(out + file, encodePng(straight(crop(px, r)), r.width, r.height));
    layers[file] = r;
  };
  const whole = { x: 0, y: 0, width, height };

  const dark = await draw({ unlit: true });
  write("base.png", dark, whole);

  // the tubes' light on the case: what turning the lights on adds to the dark case, so base + light is the lit case
  const lit = await draw({ unlit: true, lights: true });
  const added = Buffer.alloc(lit.length);
  for (let i = 0; i < lit.length; i++) added[i] = i % 4 === 3 ? 0 : Math.max(0, lit[i] - dark[i]);
  write("light.png", added, whole);

  // the numerals are cut from the middle tube; one crop serves all seven, so the tubes' places are listed
  const numeral = box(rects.numeral);
  for (const d of "0123456789") write(`numeral-${d}.png`, await draw({ digit: d }), numeral);
  write("dot.png", await draw({ dot: true }), box(rects.dot));
  // a key is drawn with the lights on, as it is on the lit device
  for (const k of ["prev", "room", "next", "start"]) write(`key-${k}.png`, await draw({ lights: true, key: k }), box(rects.keys[k]));

  const tubes = rects.tubeDx.map((dx) => ({ x: numeral.x + Math.round(dx), y: numeral.y }));
  const files = Object.keys(layers).sort();
  writeFileSync(out + "layers.json", JSON.stringify({ width, height, layers: Object.fromEntries(files.map((f) => [f, layers[f]])), tubes }, null, 2) + "\n");
  console.log(`meter: wrote ${readdirSync(out).length} files to src/assets/meter/`);
} finally {
  await browser.close();
  await server.close();
}
