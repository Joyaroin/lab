import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { stations } from "../src/content";
import { CAMERA_FOV, crts, glassCorners } from "../src/crts";
import { PER_STATION, TOTAL, TRAVEL } from "../src/hold";
import { tourAt } from "../src/tour";

// A TV you aren't at carries a title card: its station's world line over its name, drawn on the
// glass in bright green. This scrolls to a wide view of each TV (on the way into it, with its
// text not yet showing), finds the glass on screen from the tour's own camera, and looks for the
// card's green. The other half, that the card is gone behind the text at the stop, is checked in
// boot.spec.ts ("the text sits on the glass with no card and no phosphor behind it").

const size = { width: 1280, height: 800 };
// Far enough into the travel that the TV is large, but before its text starts to fade in.
const INTO_TRAVEL = 0.6;

/** The tour's camera position at progress `p`, on the path the page flies with normal motion. */
const cameraAt = (p: number) => tourAt(p, 0, size.width / size.height, size.height).camera;

/** Scrolls to `p` and waits until the camera has arrived there: it eases toward the scroll position,
 *  so the glass is only where the test works it out to be once the canvas reports that position. */
async function scrollToProgress(page: Page, p: number) {
  await page.evaluate((p) => scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight)), p);
  const want = cameraAt(p);
  await expect.poll(async () => {
    const got = (await page.locator("canvas").first().getAttribute("data-camera"))?.split(",").map(Number) ?? [];
    return got.length === 3 ? Math.hypot(...got.map((g, k) => g - want[k])) : Infinity;
  }, { message: "camera arrived at the scroll position" }).toBeLessThan(0.02);
}

/** The glass's box in window pixels at scroll progress `p`, or undefined if it is off screen. */
function glassBox(i: number, p: number) {
  const s = tourAt(p, 0, size.width / size.height, size.height);
  const cam = new PerspectiveCamera(CAMERA_FOV, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const pts = glassCorners(crts[i]).map((c) => new Vector3(...c).project(cam));
  const xs = pts.map((v) => ((v.x + 1) / 2) * size.width), ys = pts.map((v) => ((1 - v.y) / 2) * size.height);
  const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(size.width, Math.max(...xs));
  const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(size.height, Math.max(...ys));
  return x1 - x0 > 20 && y1 - y0 > 20 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : undefined;
}

test("every TV shows its own title card from the wide view", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(size);
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "HUD" })).toBeVisible();
  const cards: string[] = [];
  for (const [i, s] of stations.entries()) {
    const p = ((i * PER_STATION) + INTO_TRAVEL * TRAVEL) / TOTAL;
    const box = glassBox(i, p);
    expect(box, `${s.id}: glass in frame`).toBeDefined();
    await scrollToProgress(page, p);
    await expect(page.locator(`[data-screen="${s.id}"]`)).toBeHidden(); // its text isn't showing
    await page.screenshot({ path: `test-results/titlecard-full-desktop-${s.id}.png` }); // for the PR's contact sheet
    const shot = await page.screenshot({ path: `test-results/titlecard-desktop-${s.id}.png`, clip: box });
    const green = await page.evaluate(async (src) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const x = c.getContext("2d")!; x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k + 1] > 150 && d[k + 1] > d[k] + 30) n++; // bright green, as card text is
      return n / (c.width * c.height);
    }, "data:image/png;base64," + shot.toString("base64"));
    cards.push(`${s.id} ${(green * 100).toFixed(1)}%`);
    expect(green, `${s.id}: title card on the glass (${box!.width.toFixed(0)}x${box!.height.toFixed(0)}px)`).toBeGreaterThan(0.02);
  }
  console.log(cards.join("\n"));
});
