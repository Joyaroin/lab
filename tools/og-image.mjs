// Takes the link preview image, public/og-image.png: `make og-image`, through `heavy`, on the Mac. CI never runs it.
// It builds the real site and serves it with `vite preview` (as playwright.config.ts does), opens it in Playwright's
// Chromium at a 1200x630 window with device scale factor 2, waits for the room to settle at the overview, hides
// the HUD's link row and the meter bar for the shot only, and scales the shot down to 1200x630 in a browser canvas
// (the repo has no image decoder).
//   TEST_PORT=<port> node tools/og-image.mjs
import { spawn, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = fileURLToPath(new URL("../public/og-image.png", import.meta.url));
const port = Number(process.env.TEST_PORT) || 4173;
const W = 1200, H = 630;

const build = spawnSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) throw new Error("npm run build failed");
const server = spawn("npm", ["run", "preview", "--", "--port", String(port)], { cwd: root, stdio: "inherit" });
const stop = () => server.kill();
process.on("exit", stop);

const browser = await chromium.launch({ args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => { throw e; });
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; ; i++) {
    try { await page.goto(url); break; } catch (e) { if (i > 60) throw e; await new Promise((r) => setTimeout(r, 500)); }
  }
  await page.getByLabel("Boot log").waitFor({ state: "hidden", timeout: 180_000 });

  // The camera is still, and the desk meter's reading is in (the bar's "Reading ..." isn't pending) and has stopped changing.
  const state = () => page.evaluate(() => ({
    camera: document.querySelector("canvas")?.getAttribute("data-camera") ?? null,
    pending: document.querySelector("[data-meter-bar] [data-pending]")?.getAttribute("data-pending") ?? "missing",
    reading: document.querySelector("[data-meter-bar] [role=img]")?.getAttribute("aria-label") ?? null,
  }));
  let last = "", still = 0;
  for (let i = 0; i < 240 && still < 8; i++) { // 8 equal reads, 500 ms apart
    const s = await state();
    const now = JSON.stringify(s);
    const ready = s.camera && s.pending === "false" && s.reading?.startsWith("Reading ");
    still = ready && now === last ? still + 1 : 0;
    last = now;
    await page.waitForTimeout(500);
  }
  if (still < 8) throw new Error(`the room never settled; last state ${last}`);
  console.log(`og-image: settled at ${last}`);

  // Hidden for the shot only: the HUD's link row and the meter bar (device and line).
  await page.addStyleTag({ content: "[data-link-row],[data-meter-bar]{visibility:hidden!important}" });
  await page.waitForTimeout(500);

  const shot = await page.screenshot({ type: "png" }); // 2400x1260
  const b64 = await page.evaluate(async ({ b64, W, H }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, W, H);
    return c.toDataURL("image/png").split(",")[1];
  }, { b64: shot.toString("base64"), W, H });
  writeFileSync(out, Buffer.from(b64, "base64"));
  console.log(`og-image: wrote public/og-image.png (${Math.round(Buffer.from(b64, "base64").length / 1024)} KB)`);
} finally {
  await browser.close();
  stop();
}
