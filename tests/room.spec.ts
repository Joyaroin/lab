import { test, expect, type Page } from "@playwright/test";
import { progressFor } from "../src/hold";

// Baked room loads and the tour still moves the camera. Screenshots go to test-results/.
test("baked room loads and the entrance and every station render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const glb = page.waitForResponse((r) => r.url().includes("room-") && r.url().endsWith(".glb") && r.ok());
  await page.goto("/");
  await glb;
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  const shots: Buffer[] = [];
  const stops = ["entrance", "work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
  for (const [i, name] of stops.entries()) {
    const frac = progressFor(i);
    await page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), frac);
    await page.waitForTimeout(1500);
    shots.push(await page.screenshot({ path: `test-results/room-${name}.png` }));
  }
  expect(shots[0].equals(shots[1])).toBe(false); // camera moved
  expect(errors).toEqual([]);
});

// Ticket 36: on a portrait phone, MediaSafe and WC2026 used to be mostly dark. Scrolled to with
// the wheel, each must now frame lit parts of the room. Mean frame brightness (0-255) was about
// 22 for both before; the other stations sit between 22 and 31. The mean covers the whole window,
// station text and HUD included, so this shows the frame got brighter, not which part is lit.

/** Mean brightness (0-255) of what the window shows now. */
async function meanBrightness(page: Page) {
  const shot = await page.screenshot();
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
    return sum / (d.length / 4);
  }, "data:image/png;base64," + shot.toString("base64"));
}

test("on a phone, MediaSafe and WC2026 Predictor frame lit parts of the room", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  const stops = ["entrance", "work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
  for (const [name, label] of [["mediasafe", "World line 02: MediaSafe"], ["wc2026-predictor", "World line 05: WC2026 Predictor"]]) {
    const frac = progressFor(stops.indexOf(name));
    const delta = await page.evaluate((f) => f * (document.documentElement.scrollHeight - innerHeight) - scrollY, frac);
    await page.mouse.move(195, 300);
    await page.mouse.wheel(0, delta);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    // Measure once the camera has arrived and the frame stops changing, not after a guessed delay.
    let last = -1;
    await expect.poll(async () => {
      const now = await meanBrightness(page), still = Math.abs(now - last) < 0.05;
      last = now;
      return still;
    }, { intervals: [500] }).toBe(true);
    await page.screenshot({ path: `test-results/room-phone-${name}.png` });
    expect(last, name).toBeGreaterThan(27);
  }
});
