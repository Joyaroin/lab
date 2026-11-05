import { test, expect, type Page } from "@playwright/test";
import { progressFor } from "../src/hold";
import { DWELL_MS } from "../src/shift";

test.setTimeout(60_000);

const bar = (page: Page) => page.locator("[data-meter-bar] .meter-digits");
const tubes = (page: Page) => page.locator("[data-meter-bar] [data-testid=tube]").allTextContents().then((t) => t.join(""));
const label = (page: Page) => bar(page).getAttribute("aria-label");

async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await page.waitForTimeout(2_500); // power-on
}
const scrollTo = (page: Page, progress: number) => page.evaluate((p) => {
  window.scrollTo(0, p * (document.documentElement.scrollHeight - window.innerHeight));
}, progress);

// Samples the bar's digits every frame for `ms`.
const sample = (page: Page, ms: number) => page.evaluate((ms) => new Promise<string[]>((res) => {
  const seen: string[] = [], t0 = performance.now();
  const tick = () => {
    seen.push([...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join(""));
    performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(seen);
  };
  tick();
}), ms);

test("arriving in a hold scrambles the meter, which ends on the true reading", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(100);
  const seen = await sample(page, DWELL_MS + 1500);
  const true_ = (await label(page))!.replace("Reading ", "").replace(".", "");
  expect(new Set(seen).size).toBeGreaterThan(2); // it scrambled
  expect(seen.at(-1)).toBe(true_);
  expect(await tubes(page)).toBe(true_);
});

test("scrolling quickly through a station does not scramble the meter", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(1500); // first visit, done
  await scrollTo(page, progressFor(2) - 0.12);
  await page.waitForTimeout(1200); // travelling: reading is rolling or fixed, but no shift yet
  await scrollTo(page, progressFor(2));
  const seen = await sample(page, DWELL_MS / 2);
  await scrollTo(page, progressFor(3));
  const after = await sample(page, DWELL_MS / 2);
  // left station 2 before the dwell: the reading just moved on, no random digits
  expect(new Set([...seen, ...after]).size).toBeLessThanOrEqual(2);
});

test("reduced motion shows the plain reading with no scramble", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(100);
  const seen = await sample(page, DWELL_MS + 1500);
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe((await label(page))!.replace("Reading ", "").replace(".", ""));
});
