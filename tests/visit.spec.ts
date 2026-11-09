import { test, expect } from "@playwright/test";
import { stations } from "../src/content";
import { clickLink, goTo, hudLink, landedAt, openTour, stationIds, waitForCamera } from "./lib/page";

// Click-to-visit (#174, ADR 0005): the HUD's station links fly to a station, Room flies back, Esc goes back from a
// station, and the meter bar's click steps to the next monitor (the last one to the overview, the overview to Work).
// Each waits for the HUD link's aria-current, which is set when the visitor lands.

test("the site opens on the overview: Room is current, no station is", async ({ page }) => {
  await openTour(page);
  await landedAt(page, 0);
  for (let i = 1; i <= stationIds.length; i++) await expect(hudLink(page, i)).not.toHaveAttribute("aria-current", "location");
});

test("a station link flies to that station and shows its text; Room links back to the overview", async ({ page }) => {
  await openTour(page);
  const start = await waitForCamera(page);
  await clickLink(page, 3);
  await landedAt(page, 3);
  await expect(page.locator(`[data-screen="${stationIds[2]}"]`)).toBeVisible();
  expect(await waitForCamera(page), "the camera moved").not.toEqual(start);
  await expect(hudLink(page, 0)).not.toHaveAttribute("aria-current", "location");
  const room = hudLink(page, 0);
  expect(await room.getAttribute("href")).toBe("./");
  await room.click();
  await landedAt(page, 0);
  await expect(page.locator(`[data-screen="${stationIds[2]}"]`)).toBeHidden();
  expect(await waitForCamera(page), "back where it began").toEqual(start);
});

test("Esc at a station goes back to the overview; at the overview it does nothing", async ({ page }) => {
  await openTour(page);
  await page.keyboard.press("Escape");
  await landedAt(page, 0);
  await goTo(page, 2);
  await page.keyboard.press("Escape");
  await landedAt(page, 0);
});

test("the meter bar steps to the next monitor: Work from the overview, on to the next, the last back to the overview", async ({ page }) => {
  await openTour(page);
  const bar = page.getByRole("button", { name: /^Meter/ });
  await bar.click();
  await landedAt(page, 1);
  await bar.click();
  await landedAt(page, 2);
  await goTo(page, stations.length);
  await bar.click();
  await landedAt(page, 0);
});

test("a second click mid-flight re-targets and lands at the last one", async ({ page }) => {
  await openTour(page);
  await clickLink(page, 1);
  await clickLink(page, 5);
  await landedAt(page, 5);
});
