import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { stations } from "../src/content";
import { CAMERA_FOV, crts, CRT_GLASS, NOTE_AT, PLATE_AT } from "../src/crts";
import { PER_STATION, TOTAL, TRAVEL, progressFor } from "../src/hold";
import { tourAt } from "../src/tour";

// Each TV's bezel has a crisp dark edge round the glass, a maker's plate and its own sticky note.
// This flies to each TV the way the page does, projects points on the bezel from the tour's own
// camera, and reads the pixels the page really drew there, at normal and 2x pixel density.
// Screenshots go to test-results/ for the PR's contact sheet.

const size = { width: 1280, height: 800 };
const WIDE = 0.6; // far enough into the travel that the whole bezel is in frame

const cameraAt = (p: number) => tourAt(p, 0, size).camera;

async function scrollToProgress(page: Page, p: number) {
  await page.evaluate((p) => scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)), p);
  const want = cameraAt(p);
  await expect.poll(async () => {
    const got = (await page.locator("canvas").first().getAttribute("data-camera"))?.split(",").map(Number) ?? [];
    return got.length === 3 ? Math.hypot(...got.map((g, k) => g - want[k])) : Infinity;
  }).toBeLessThan(0.02);
  await page.waitForTimeout(300); // let the drawn frame land
}

/** Window-pixel position of the point `x` metres right and `y` up from TV `i`'s glass centre. */
function onBezel(i: number, p: number, x: number, y: number): [number, number] {
  const s = tourAt(p, 0, size);
  const cam = new PerspectiveCamera(CAMERA_FOV, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const c = crts[i], a = (c.yaw * Math.PI) / 180;
  const v = new Vector3(c.screen[0] + Math.cos(a) * x, c.screen[1] + y, c.screen[2] - Math.sin(a) * x).project(cam);
  return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
}

/** The colour at each point; with `reach` > 0, the brightest pixel within that many window pixels
 *  of it, so a TV seen at a slant still lands on its note. */
async function pixels(page: Page, shot: Buffer, points: [number, number][], scale: number, reach = 0) {
  return page.evaluate(async ({ src, points, scale, reach }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d")!; x.drawImage(img, 0, 0);
    return points.map(([px, py]) => {
      const r = Math.round(reach * scale), d = x.getImageData(Math.round(px * scale) - r, Math.round(py * scale) - r, 2 * r + 1, 2 * r + 1).data;
      let best = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k] + d[k + 1] + d[k + 2] > d[best] + d[best + 1] + d[best + 2]) best = k;
      return Array.from(d.slice(best, best + 3));
    });
  }, { src: "data:image/png;base64," + shot.toString("base64"), points, scale, reach });
}
const lum = ([r, g, b]: number[]) => 0.3 * r + 0.59 * g + 0.11 * b;

for (const scale of [1, 2]) {
  test(`every TV has its edge, plate and own note at ${scale}x`, async ({ browser }) => {
    test.setTimeout(300_000); // 2x draws four times the pixels on software WebGL
    const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: scale });
    const page = await ctx.newPage();
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "HUD" })).toBeVisible();
    const notes: string[] = [];
    for (const [i, s] of stations.entries()) {
      // 1. at the stop: the dark lip sits just outside the glass, where the screen layer reaches
      await scrollToProgress(page, progressFor(i + 1));
      const hold = await page.screenshot({ path: `test-results/bezel-hold-${scale}x-${s.id}.png` });
      // sample 2 mm outside the middle of each side of the glass, which is where the lip is
      const p0 = progressFor(i + 1), hw = CRT_GLASS.width / 2, hh = CRT_GLASS.height / 2, out = 0.002;
      const sides = await pixels(page, hold, [onBezel(i, p0, hw + out, 0), onBezel(i, p0, -hw - out, 0), onBezel(i, p0, 0, hh + out), onBezel(i, p0, 0, -hh - out)], scale);
      sides.forEach((px, k) => expect(lum(px), `${s.id}: edge on side ${k} is dark (${px})`).toBeLessThan(60));

      // 2. from the wide view: the plate is metal grey and the note has this TV's own colour
      const p = (i * PER_STATION + WIDE * TRAVEL) / TOTAL;
      await scrollToProgress(page, p);
      const wide = await page.screenshot({ path: `test-results/bezel-wide-${scale}x-${s.id}.png` });
      const [plate] = await pixels(page, wide, [onBezel(i, p, ...PLATE_AT)], scale);
      const [note] = await pixels(page, wide, [onBezel(i, p, ...NOTE_AT)], scale, 6);
      expect(Math.max(...plate) - Math.min(...plate), `${s.id}: plate is grey (${plate})`).toBeLessThan(30);
      expect(lum(plate), `${s.id}: plate is metal, not bezel beige`).toBeLessThan(215);
      expect(lum(note), `${s.id}: note is paper-bright (${note})`).toBeGreaterThan(120);
      // 3. the baked note under it (70 mm, up to 5 mm from its corners) must not show round the painted one
      const baked = await pixels(page, wide, [[-0.27, 0.12], [-0.27, 0.18], [-0.237, 0.12]].map(([x, y]) => onBezel(i, p, x, y)), scale, 2);
      baked.forEach((px, k) => expect(lum(px), `${s.id}: baked note corner ${k} is covered (${px})`).toBeGreaterThan(120));
      notes.push(note.join(","));
    }
    expect(new Set(notes).size, "each TV has its own note").toBe(stations.length);
    await ctx.close();
  });
}
