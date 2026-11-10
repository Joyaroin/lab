import { test, expect } from "@playwright/test";
import { clearances } from "../src/pin";
import { goTo, openTour, overflowPanel, panelOf, waitForPanel } from "./lib/page";

// #218: on a portrait window the text panel takes all the free height between the name block and the
// meter bar (src/pin.ts, `clearances`), not half of it.
const win = { width: 390, height: 844 };

test("on a 390x844 phone the Work panel is at least 460 px tall and fills the free height, and the more cue shows when its text does not fit", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(win);
  await openTour(page);
  await goTo(page, 1);
  await expect(panelOf(page, "work")).toBeVisible();
  const box = await waitForPanel(page, "work");
  const free = win.height - clearances(win).top - clearances(win).bottom;
  expect(box.height, "the real Work panel").toBeGreaterThanOrEqual(460);
  expect(box.height).toBeLessThanOrEqual(free + 1);
  // the real copy may fit in the panel; make it overflow, as panel-scroll.spec does, and the cue must show
  await overflowPanel(page, "work");
  const grown = await waitForPanel(page, "work");
  expect(grown.height, "an overflowing panel takes all the free height").toBeGreaterThanOrEqual(free - 1);
  await expect(panelOf(page, "work")).toHaveAttribute("data-more", "true");
  await expect(panelOf(page, "work").locator(".crt-more")).toBeVisible();
});
