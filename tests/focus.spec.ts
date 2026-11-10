import { test, expect, type Locator, type Page } from "@playwright/test";
import { hudLink, landedAt, openTour, panelOf, stationIds } from "./lib/page";

// The site's focus ring (#219): a 2 px solid amber outline on every link and button under keyboard
// focus, and the boot screen's progress bar in the site's green.
const RING = "2px solid rgb(255, 179, 71)";

const outline = (el: Locator) =>
  el.evaluate((e) => { const s = getComputedStyle(e); return `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`; });

/** Presses Tab until `el` has focus, as a keyboard visitor reaches it. */
async function tabTo(page: Page, el: Locator) {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await el.evaluate((e) => e === document.activeElement)) return;
  }
  throw new Error("Tab never reached the element");
}

test("a HUD link reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const link = hudLink(page, 2);
  await tabTo(page, link);
  expect(await outline(link)).toBe(RING);
});

test("a phone menu button reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  const button = hudLink(page, 3);
  await tabTo(page, button);
  expect(await outline(button)).toBe(RING);
});

test("a link in a station's panel reached with Tab has the ring", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  await hudLink(page, 1).click();
  await landedAt(page, 1);
  const panel = panelOf(page, stationIds[0]);
  await expect(panel).toBeFocused();
  const link = panel.getByRole("link").first();
  await tabTo(page, link);
  expect(await outline(link)).toBe(RING);
});

test("the meter bar's button reached with Tab has the ring", async ({ page }) => {
  // Its inline style starts with `all: unset`, which would beat a plain stylesheet rule.
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const bar = page.locator("[data-meter-bar]");
  await tabTo(page, bar);
  expect(await outline(bar)).toBe(RING);
});

test("a station's panel has no outline after a click on its HUD link, and the ring after Enter on it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const panel = panelOf(page, stationIds[0]);

  await hudLink(page, 1).click();
  await landedAt(page, 1);
  await expect(panel).toBeFocused();
  expect((await outline(panel)).split(" ")[1]).toBe("none");

  await hudLink(page, 0).click();
  await landedAt(page, 0);
  await expect(panel).not.toBeFocused();

  await tabTo(page, hudLink(page, 1));
  await page.keyboard.press("Enter");
  await landedAt(page, 1);
  await expect(panel).toBeFocused();
  expect(await outline(panel)).toBe(RING);
});

test("the boot screen's progress bar is drawn in the site's green", async ({ page }) => {
  // The room's code is accepted and never answered, so the boot screen stays up.
  await page.route("**/assets/Room-*.js", () => {});
  await page.goto("/");
  const bar = page.getByRole("progressbar", { name: "Load progress" });
  await expect(bar).toBeVisible();
  expect(await bar.evaluate((e) => getComputedStyle(e).accentColor)).toBe("rgb(125, 255, 176)");
  await page.screenshot({ path: "test-results/boot-progress.png" });
});
