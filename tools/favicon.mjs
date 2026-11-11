// Makes the tab icons from the meter's committed images: `make favicon`, through `heavy`, on the Mac. CI never runs it.
// In a browser canvas (Playwright's Chromium, as tools/og-image.mjs; the repo has no image decoder) it paints #05080a,
// the base layer (normal), then the light and the "0" numeral at the first tube's place (both additive, "lighter"),
// as src/meter-layers.ts says. The neighbouring tube is clipped out, so what is left at the sides is #05080a.
// The two icons are cropped differently: the 48 px favicon is close on the lit numeral (its glow fills the square,
// with a little dark margin), the 180 px apple-touch-icon is the whole tube (the glass fills the square's height).
// It writes public/favicon.png (48x48) and public/apple-touch-icon.png (180x180).
//   node tools/favicon.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const rel = (p) => fileURLToPath(new URL(p, import.meta.url));
const meter = (f) => rel(`../src/assets/meter/${f}`);
const layers = JSON.parse(readFileSync(meter("layers.json"), "utf8"));
const tube = layers.tubes[0];
const numeral = layers.layers["numeral-0.png"];
const b64 = (f) => readFileSync(meter(f)).toString("base64");

// The first tube's glass on the 840 px device: from its cap (y 22) down to the foot of its socket (y 232), 210 px.
// The column is as wide as the numeral's box plus 2 px, so the next tube's glass (from x 229) stays out.
const GLASS = { top: 22, height: 210 };
const cx = tube.x + numeral.width / 2;
const whole = { x: Math.round(cx - GLASS.height / 2), y: GLASS.top, size: GLASS.height };
const cy = tube.y + numeral.height / 2;
const NUMERAL_SQUARE = 124; // the numeral is 68x100; the rest is the glow and a dark margin
const close = { x: Math.round(cx - NUMERAL_SQUARE / 2), y: Math.round(cy - NUMERAL_SQUARE / 2), size: NUMERAL_SQUARE };
const column = { x: tube.x - 6, width: numeral.width + 12 };

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const out = await page.evaluate(async ({ base, light, num, tube, crops, column }) => {
    const load = async (b) => { const i = new Image(); i.src = "data:image/png;base64," + b; await i.decode(); return i; };
    const [b, l, n] = await Promise.all([load(base), load(light), load(num)]);
    // The device at full size, then the square cut out of it and scaled down.
    const full = document.createElement("canvas");
    full.width = 840; full.height = 356;
    const g = full.getContext("2d");
    g.fillStyle = "#05080a";
    g.fillRect(0, 0, full.width, full.height);
    g.save();
    g.beginPath(); g.rect(column.x, 0, column.width, full.height); g.clip();
    g.drawImage(b, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.drawImage(l, 0, 0);
    g.drawImage(n, tube.x, tube.y);
    g.restore();
    const result = {};
    for (const [size, crop] of Object.entries(crops)) {
      const c = document.createElement("canvas");
      c.width = +size; c.height = +size;
      const h = c.getContext("2d");
      h.fillStyle = "#05080a";
      h.fillRect(0, 0, +size, +size);
      h.imageSmoothingQuality = "high";
      h.drawImage(full, crop.x, crop.y, crop.size, crop.size, 0, 0, +size, +size);
      result[size] = c.toDataURL("image/png").split(",")[1];
    }
    return result;
  }, { base: b64("base.png"), light: b64("light.png"), num: b64("numeral-0.png"), tube, crops: { 48: close, 180: whole }, column });
  writeFileSync(rel("../public/favicon.png"), Buffer.from(out[48], "base64"));
  writeFileSync(rel("../public/apple-touch-icon.png"), Buffer.from(out[180], "base64"));
  console.log("favicon: wrote public/favicon.png (48x48) and public/apple-touch-icon.png (180x180)");
} finally {
  await browser.close();
}
