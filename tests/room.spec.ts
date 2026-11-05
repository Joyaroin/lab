import { test, expect } from "@playwright/test";

// Baked room loads and the tour still moves the camera. Screenshots go to test-results/.
test("baked room loads and the entrance and every station render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const glb = page.waitForResponse((r) => r.url().includes("room-") && r.url().endsWith(".glb") && r.ok());
  await page.goto("/");
  await glb;
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  const shots: Buffer[] = [];
  const stops = ["entrance", "work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
  for (const [i, name] of stops.entries()) {
    const frac = i / (stops.length - 1);
    await page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), frac);
    await page.waitForTimeout(1500);
    shots.push(await page.screenshot({ path: `test-results/room-${name}.png` }));
  }
  expect(shots[0].equals(shots[1])).toBe(false); // camera moved
  expect(errors).toEqual([]);
});
