import { test, expect } from "@playwright/test";
import { clickLink, hudLink, landedAt, openTour, panelOf, readCamera, stationIds, waitForCamera } from "./lib/page";

// Monitor links and browser history (#175): each monitor has an address, the browser's back and forward move the
// visit, a direct link lands with no flight and an overview entry under it, and focus follows the visitor.

const at = (page: import("@playwright/test").Page) => new URL(page.url()).hash;
const focusedIsPanel = (page: import("@playwright/test").Page, id: string) =>
  page.evaluate((id) => (document.activeElement as HTMLElement | null)?.dataset.screen === id, id);

test("clicking Work makes the address #work; back is the overview, forward is Work again", async ({ page }) => {
  await openTour(page);
  await clickLink(page, 1);
  await landedAt(page, 1);
  expect(at(page)).toBe("#work");
  await page.goBack();
  await landedAt(page, 0);
  expect(at(page)).toBe("");
  await page.goForward();
  await landedAt(page, 1);
  expect(at(page)).toBe("#work");
});

test("opening /#work lands on Work with its text showing and the camera still; back goes to the overview", async ({ page }) => {
  await page.goto("/#work");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 1);
  await expect(panelOf(page, "work")).toBeVisible();
  const a = await readCamera(page);
  await page.waitForTimeout(500);
  expect(await readCamera(page), "no flight").toEqual(a);
  await page.goBack();
  await landedAt(page, 0);
  expect(new URL(page.url()).pathname).toBe("/");
  expect(at(page)).toBe("");
  await expect(panelOf(page, "work")).toBeHidden();
});

test("an unknown hash opens the overview", async ({ page }) => {
  await page.goto("/#nope");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 0);
});

test("a reload on /#mediasafe lands there", async ({ page }) => {
  await page.goto("/#mediasafe");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 2);
  await page.reload();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await landedAt(page, 2);
  await expect(panelOf(page, "mediasafe")).toBeVisible();
});

test("focus moves to the panel on landing, and back to the link on return", async ({ page }) => {
  await openTour(page);
  await waitForCamera(page);
  await hudLink(page, 3).focus();
  await clickLink(page, 3);
  await landedAt(page, 3);
  await expect.poll(() => focusedIsPanel(page, stationIds[2])).toBe(true);
  await hudLink(page, 0).click();
  await landedAt(page, 0);
  await expect(hudLink(page, 3)).toBeFocused();
});
