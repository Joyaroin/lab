import { test, expect, type Page } from "@playwright/test";
import { holdSpan, progressFor } from "../src/hold";
import { DWELL_MS } from "../src/shift";

test.setTimeout(60_000);

const bar = (page: Page) => page.locator("[data-meter-bar] .meter-digits");
const tubes = (page: Page) => page.locator("[data-meter-bar] [data-testid=tube]").allTextContents().then((t) => t.join(""));
const label = (page: Page) => bar(page).getAttribute("aria-label");

async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(1_000); // power-on
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
  const seen = page.evaluate(() => new Promise<string[]>((res) => {
    const out: string[] = [];
    const read = () => [...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join("");
    const mo = new MutationObserver(() => out.push(read()));
    mo.observe(document.querySelector("[data-meter-bar]")!, { childList: true, subtree: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res(out); }, 6_000);
  }));
  await scrollTo(page, progressFor(1));
  const digitsSeen = await seen;
  const true_ = (await label(page))!.replace("Reading ", "").replace(".", "");
  expect(new Set(digitsSeen).size).toBeGreaterThan(2); // it scrambled
  await expect.poll(() => tubes(page), { timeout: 10_000 }).toBe(true_); // and settled on the reading
});

test("scrolling quickly through a station does not scramble the meter", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(1500); // first visit, done
  await scrollTo(page, progressFor(2) - 0.12);
  await page.waitForTimeout(1200); // travelling: reading is fixed, no shift yet

  // The whole scroll-through happens in one task in the page, so it can't depend on the frame
  // rate or on Playwright round trips: arrive at station 2, spend 50 ms there on the page's own
  // clock, move on into the travel before station 3. Real scroll events come once per frame (200 ms or more on
  // software WebGL), so each scroll is followed by an event we dispatch ourselves, which the app
  // handles at once. Then watch the bar for 1.5 s. Outside a hold no shift can fire, so anything
  // but the true reading on the tubes came from station 2, and a slow frame can't cause it.
  const away = (progressFor(2) + progressFor(3)) / 2;
  expect(away).toBeGreaterThan(holdSpan(2)[1]);
  expect(away).toBeLessThan(holdSpan(3)[0]);
  const { seen, stillThere } = await page.evaluate(([p2, p3]) => new Promise<{ seen: string[]; stillThere: boolean }>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const to = (p: number) => { window.scrollTo(0, p * max()); window.dispatchEvent(new Event("scroll")); };
    // A scramble is a moment when the tubes differ from the true reading in the label.
    const read = () => {
      const tubes = [...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join("");
      const truth = document.querySelector("[data-meter-bar] .meter-digits")!.getAttribute("aria-label")!.replace("Reading ", "").replace(".", "");
      return tubes === truth ? "true" : tubes;
    };
    const seen = [read()];
    const mo = new MutationObserver(() => seen.push(read()));
    mo.observe(document.querySelector("[data-meter-bar]")!, { childList: true, subtree: true, characterData: true });
    to(p2);
    for (const t0 = performance.now(); performance.now() - t0 < 50;); // 50 ms at station 2
    to(p3);
    setTimeout(() => {
      mo.disconnect();
      res({ seen, stillThere: Math.abs(window.scrollY / max() - p3) < 0.01 });
    }, 1_500);
  }), [progressFor(2), away] as const);
  expect(stillThere).toBe(true);
  // The reading may move on, but the tubes never show random digits.
  expect(seen.filter((d) => d !== "true")).toEqual([]);
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
