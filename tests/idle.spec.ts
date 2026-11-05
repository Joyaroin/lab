import { test, expect, type Page } from "@playwright/test";
import { LIVING_FPS, LIVING_MS } from "../src/living";

// Counts the 3D scene's draw calls, which is what a drawn frame is made of. Headless Chromium has
// software WebGL, so this proves the scene is idle, not how much a phone would spend drawing.
// With `blink: false` the CRT cursors' timer never runs, so any draw that follows is the scene
// answering something else: the power-on, a scroll or a pointer move.
const countDraws = async (page: Page, { blink = true } = {}) => {
  await page.addInitScript(({ blink, blinkMs }) => {
    const w = window as unknown as { __draws: number; __frames: number };
    w.__draws = 0;
    w.__frames = 0; // each frame clears the screen once
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const clear = C.prototype.clear;
      C.prototype.clear = function (mask: number) { w.__frames++; return clear.call(this, mask); };
    }
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
        const orig = (C.prototype as any)[fn];
        (C.prototype as any)[fn] = function (...a: unknown[]) { w.__draws++; return orig.apply(this, a); };
      }
    }
    if (!blink) {
      const set = window.setInterval.bind(window);
      window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
        ms === blinkMs ? 0 : set(fn, ms, ...args)) as typeof window.setInterval;
    }
  }, { blink, blinkMs: 1000 / LIVING_FPS });
};
test.setTimeout(60_000); // several idle waits

const draws = (page: Page) => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: number }).__frames);

// The cursors blink for LIVING_MS after the power-on and any scroll or pointer move, then stop.
// Wait out that and the power-on, with a margin.
const SETTLE_MS = LIVING_MS + 3_000;

async function bootDone(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
}
async function powerOnSettled(page: Page) {
  await bootDone(page);
  await page.waitForTimeout(SETTLE_MS);
}

test("at rest the 3D scene draws no frames", async ({ page }) => {
  await countDraws(page);
  await powerOnSettled(page);
  expect(await draws(page)).toBeGreaterThan(0); // the power-on did draw
  const before = await draws(page);
  await page.waitForTimeout(5_000);
  expect(await draws(page)).toBe(before);
});

test("scrolling and pointer movement still draw, and then it goes idle again", async ({ page }) => {
  await countDraws(page, { blink: false });
  await powerOnSettled(page);
  let before = await draws(page);
  await page.mouse.move(100, 100);
  await page.mouse.move(400, 300, { steps: 5 });
  await expect.poll(() => draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(1_000);
  before = await draws(page);
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
  await expect.poll(() => draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(SETTLE_MS); // the camera has arrived
  before = await draws(page);
  await page.waitForTimeout(3_000);
  expect(await draws(page)).toBe(before);
});

// Without the cursors' timer, the only thing left to draw after the room starts is the power-on:
// a frame after frame for about a second and a half, then nothing. Counting frames (not draw
// calls) tells that from the one or two frames the room draws when it appears.
test("the power-on draws frame after frame, then stops", async ({ page }) => {
  await countDraws(page, { blink: false });
  await bootDone(page);
  await page.waitForTimeout(3_000);
  const settled = await frames(page);
  expect(settled).toBeGreaterThan(POWER_ON_MIN_FRAMES);
  await page.waitForTimeout(2_000);
  expect(await frames(page)).toBe(settled);
});
// Measured on this VM: 4 frames without the power-on, 17 with it. CI's slower rendering still
// manages the power-on's 1.4 s in about 7, so 5 separates the two.
const POWER_ON_MIN_FRAMES = 5;

// The CRT cursors blink for a few seconds, then hold lit. The blink is a draw a second.
test("the CRT cursors blink for a while after the power-on", async ({ page }) => {
  await countDraws(page);
  await bootDone(page);
  await page.waitForTimeout(2_000); // the power-on is over
  const before = await draws(page);
  await page.waitForTimeout(2_000); // about two blinks, if LIVING_MS has not run out
  expect(await draws(page)).toBeGreaterThan(before);
});
