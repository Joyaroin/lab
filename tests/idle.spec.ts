import { test, expect, type Page } from "@playwright/test";
import { countDraws, goTo, draws, frames } from "./lib/page";

test.setTimeout(60_000); // several idle waits

// Wait out the power-on (about 1.5 s) and the camera's glide, with a margin.
const SETTLE_SLEEP_MS = 8_000;

async function bootDone(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
}
async function powerOnSettled(page: Page) {
  await bootDone(page);
  await page.waitForTimeout(SETTLE_SLEEP_MS);
}

test("at rest the 3D scene draws no frames", async ({ page }) => {
  await countDraws(page);
  await powerOnSettled(page);
  expect(await draws(page)).toBeGreaterThan(0); // the power-on did draw
  const before = await draws(page);
  await page.waitForTimeout(5_000);
  expect(await draws(page)).toBe(before);
});

test("a flight and pointer movement still draw, and then it goes idle again", async ({ page }) => {
  await countDraws(page);
  await powerOnSettled(page);
  let before = await draws(page);
  await page.mouse.move(100, 100);
  await page.mouse.move(400, 300, { steps: 5 });
  await expect.poll(() => draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(1_000);
  before = await draws(page);
  await goTo(page, 1);
  await expect.poll(() => draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(SETTLE_SLEEP_MS); // the camera has arrived
  before = await draws(page);
  await page.waitForTimeout(3_000);
  expect(await draws(page)).toBe(before);
});

// After the room starts, the only thing left to draw is the power-on:
// a frame after frame for about a second and a half, then nothing. Counting frames (not draw
// calls) tells that from the one or two frames the room draws when it appears.
test("the power-on draws frame after frame, then stops", { tag: "@timing" }, async ({ page }) => {
  await countDraws(page);
  await bootDone(page);
  await page.waitForTimeout(3_000);
  const settled = await frames(page);
  expect(settled).toBeGreaterThan(POWER_ON_MIN_FRAMES);
  await page.waitForTimeout(2_000);
  expect(await frames(page)).toBe(settled);
});
// Measured on this VM: 4 frames without the power-on, 17 with it. CI's slower rendering still
// is expected to manage the power-on's 1.4 s in about 7 (an estimate, not measured on the runner), so 5 should separate the two.
const POWER_ON_MIN_FRAMES = 5;

test("at rest the title cards show on the TVs", async ({ page }) => {
  await powerOnSettled(page);
  await page.screenshot({ path: "test-results/idle-rest.png" });
});
