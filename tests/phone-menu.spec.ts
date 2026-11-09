import { test, expect } from "@playwright/test";
import { ui } from "../src/content";
import { goTo, hudLink, landedAt, openTour, stationIds, waitForPanel } from "./lib/page";

// The phone menu and the hint line (#177). The hint's words depend on the window's shape; the bottom
// buttons are for a portrait window only.
const hint = (page: import("@playwright/test").Page) => page.locator("[data-hint]");

test.describe("phone touch", () => {
test.use({ hasTouch: true });
test("on a phone the links are bottom buttons at least 44 px tall, clear of the meter bar, and a tap lands on its station", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  const meter = (await page.locator("[data-meter-bar]").boundingBox())!;
  for (let i = 0; i <= stationIds.length; i++) {
    const b = (await hudLink(page, i).boundingBox())!;
    expect(b.height, `link ${i} height`).toBeGreaterThanOrEqual(44);
    expect(b.y, `link ${i} is along the bottom`).toBeGreaterThan(844 / 2);
    expect(b.y + b.height, `link ${i} is on screen`).toBeLessThanOrEqual(844);
    expect(b.y >= meter.y + meter.height || b.y + b.height <= meter.y, `link ${i} clear of the meter bar`).toBe(true);
  }
  await hudLink(page, 3).tap();
  await landedAt(page, 3);
  await expect(page.locator(`[data-screen="${stationIds[2]}"]`)).toBeVisible();
});
});

test("on a landscape window the links stay in the corner HUD, not 44 px buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  expect((await hudLink(page, 1).boundingBox())!.y).toBeLessThan(100);
});

test("the hint says Click a monitor on landscape and shows until the first landing, even back at the overview", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  await expect(hint(page)).toHaveText(ui.hintLandscape);
  await goTo(page, 1); // the landing, not the click
  await expect(hint(page)).toBeHidden();
  await goTo(page, 0);
  await expect(hint(page)).toBeHidden();
});

test("the hint says Tap a monitor, or pick one below on portrait, and is gone after the first landing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  await expect(hint(page)).toHaveText(ui.hintPortrait);
  await expect(hint(page)).toBeVisible();
  await goTo(page, 2);
  await expect(hint(page)).toBeHidden();
  await goTo(page, 0);
  await expect(hint(page)).toBeHidden();
});

// The meter bar stands above the phone menu, so the station text must end above the bar at every station.
for (const [w, h] of [[390, 844], [360, 740]]) {
  test(`portrait ${w}x${h}: the station text ends above the meter bar at every station`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: w, height: h });
    await openTour(page);
    for (const [k, id] of stationIds.entries()) {
      await goTo(page, k + 1);
      const panel = await waitForPanel(page, id);
      const bar = (await page.locator("[data-meter-bar]").boundingBox())!;
      expect(panel.top + panel.height, `${id} ends above the meter bar (${bar.y})`).toBeLessThanOrEqual(bar.y);
    }
  });
}
