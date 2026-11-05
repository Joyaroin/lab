import { test, expect, type Page } from "@playwright/test";

// Counts the 3D scene's draw calls, which is what a drawn frame is made of. Headless Chromium has
// software WebGL, so this proves the scene is idle, not how much a phone would spend drawing.
const countDraws = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
        const orig = (C.prototype as any)[fn];
        (C.prototype as any)[fn] = function (...a: unknown[]) { w.__draws++; return orig.apply(this, a); };
      }
    }
  });
};
test.setTimeout(60_000); // several idle waits

const draws = (page: Page) => page.evaluate(() => (window as unknown as { __draws: number }).__draws);

// The cursors blink for a short while after the power-on and any scroll or pointer move, then
// stop. Keep in step with LIVING_MS in src/Effects.tsx.
const SETTLE_MS = 8_000;

async function powerOnSettled(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
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
  await countDraws(page);
  await powerOnSettled(page);
  let before = await draws(page);
  await page.mouse.move(100, 100);
  await page.mouse.move(400, 300, { steps: 5 });
  await page.waitForTimeout(500);
  expect(await draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(SETTLE_MS);
  before = await draws(page);
  await page.evaluate(() => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) / 2));
  await page.waitForTimeout(500);
  expect(await draws(page)).toBeGreaterThan(before);

  await page.waitForTimeout(SETTLE_MS);
  before = await draws(page);
  await page.waitForTimeout(3_000);
  expect(await draws(page)).toBe(before);
});

test("the power-on draws", async ({ page }) => {
  await countDraws(page);
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  const before = await draws(page);
  await page.waitForTimeout(800);
  expect(await draws(page)).toBeGreaterThan(before);
});

test("at rest the CRTs still look alive", async ({ page }) => {
  await powerOnSettled(page);
  await page.screenshot({ path: "test-results/idle-rest.png" });
});
