import { test, expect } from "@playwright/test";

const signalLost = (page: import("@playwright/test").Page) =>
  expect(page.getByRole("alert")).toContainText("SIGNAL LOST");

test("name and title are in the HTML before the script runs", async ({ page }) => {
  await page.route("**/assets/*.js", (r) => r.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Adham Sedik" })).toBeVisible();
  await expect(page.getByText("SWE & Platform")).toBeVisible();
});

test("room starts and boot screen goes away", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/room.png" });
});

test("signal lost when WebGL is disabled", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...a: any[]) {
      return /webgl/.test(type) ? null : (orig as any).call(this, type, ...a);
    } as any;
  });
  await page.goto("/");
  await signalLost(page);
  for (const name of ["Résumé", "LinkedIn", "GitHub"])
    await expect(page.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Adham Sedik" })).toBeVisible();
  await page.screenshot({ path: "test-results/signal-lost.png" });
});

test("signal lost when the scene fails to load", async ({ page }) => {
  await page.route("**/assets/Room-*.js", (r) => r.abort());
  await page.goto("/");
  await signalLost(page);
});

const commits = (...subjects: string[]) => subjects.map((message) => ({ commit: { message } }));
const deploys = (n: number) => Array.from({ length: n }, (_, i) => `Deploy MediaSafe ${i} to staging`);

test("meter shows the live gap with a plain label", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ json: commits(...deploys(9), "Promote MediaSafe abc to prod") }),
  );
  await page.goto("/");
  await expect(page.getByText("prod is 9 deploys behind staging", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Reading 0.000009" })).toBeVisible();
  await page.screenshot({ path: "test-results/meter-live.png" });
});

test("meter shows the saved value and says so when the call fails", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByText(/saved value, not live/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Reading 0\.\d{6}$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/meter-saved.png" });
});

test("meter does not say 'saved value' while the live call is still pending", async ({ page }) => {
  await page.route("https://api.github.com/**", async (r) => {
    await new Promise((res) => setTimeout(res, 1500));
    await r.fulfill({ json: commits(...deploys(2), "Promote MediaSafe abc to prod") });
  });
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("reading prod and staging…")).toBeVisible();
  await expect(page.getByText(/saved value/)).toHaveCount(0);
  await expect(page.getByText("prod is 2 deploys behind staging", { exact: true })).toBeVisible();
});

// --- tour ---
const scrollFraction = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.scrollY / (document.documentElement.scrollHeight - innerHeight));

async function startTour(page: import("@playwright/test").Page) {
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ json: commits(...deploys(9), "Promote MediaSafe abc to prod") }),
  );
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "HUD" })).toBeVisible();
}

test("scrolling moves the tour and rolls the meter, and back again", async ({ page }) => {
  await startTour(page);
  const reading = page.getByRole("img", { name: /^Reading/ });
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000861");
  await page.evaluate(() => scrollTo(0, 0));
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
});

test("HUD links and the meter jump to stations; the HUD stays reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // jumps land at once
  await startTour(page);
  const reading = page.getByRole("img", { name: /^Reading/ });
  await page.getByRole("navigation", { name: "HUD" }).getByRole("link", { name: "Home lab" }).click();
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000512");
  await page.screenshot({ path: "test-results/tour-home-lab.png" });
  await page.getByRole("button", { name: /^Meter/ }).click(); // next station
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000640");
  await page.screenshot({ path: "test-results/tour-order-tracker.png" });
  for (const f of [0, 0.3, 0.7, 1]) {
    await page.evaluate((f) => scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), f);
    for (const name of ["Résumé", "LinkedIn", "GitHub", "Contact"])
      await expect(page.getByRole("navigation", { name: "HUD" }).getByRole("link", { name })).toBeInViewport();
  }
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000861");
  await page.screenshot({ path: "test-results/tour-contact.png" });
  await page.getByRole("button", { name: /^Meter/ }).click(); // wraps to the entrance
  await expect(reading).toHaveAttribute("aria-label", "Reading 0.000009");
  await expect.poll(() => scrollFraction(page)).toBe(0);
});

test("reduced motion: jumps are instant; otherwise they glide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startTour(page);
  await page.getByRole("link", { name: "Contact" }).click();
  expect(await scrollFraction(page)).toBeCloseTo(1, 2);

  const page2 = await page.context().newPage();
  await page2.emulateMedia({ reducedMotion: "no-preference" });
  await startTour(page2);
  await page2.getByRole("link", { name: "Contact" }).click();
  expect(await scrollFraction(page2)).toBeLessThan(0.99);
  await expect.poll(() => scrollFraction(page2)).toBeCloseTo(1, 2);
});
