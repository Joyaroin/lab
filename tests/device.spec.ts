import { test, expect, type Page } from "@playwright/test";
import { ui } from "../src/content";
import { readFileSync } from "node:fs";
import { barKey, goTo, landedAt, openTour, stationIds } from "./lib/page";

// The meter bar's device (#227): the rendered images put together. The keys' size, name and focus ring are
// checked in stepping.spec.ts and focus.spec.ts; this spec holds the device's size, the middle key's place on a
// portrait window, and the fallback when the images do not arrive.

// Playwright's loader can't import a JSON module, so the layer list's file is read directly (src/meter-layers.ts reads the same one).
const list = JSON.parse(readFileSync(new URL("../src/assets/meter/layers.json", import.meta.url), "utf8")) as {
  width: number; height: number; layers: Record<string, { x: number; y: number; width: number; height: number }>;
};
const DEVICE = { width: list.width, height: list.height };

const MEDIASAFE = stationIds.indexOf("mediasafe") + 1;
const device = (page: Page) => page.locator("[data-meter-bar] [data-device]");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const [name, size, width] of [
  ["1920 x 1080", { width: 1920, height: 1080 }, 420],
  ["1440 x 900", { width: 1440, height: 900 }, 417.6],
  ["390 x 844", { width: 390, height: 844 }, 280],
] as const) {
  test(`the device is ${width} px wide at ${name}, at the overview and at a station`, async ({ page }) => {
    await page.setViewportSize(size);
    await openTour(page);
    await expect(device(page)).toBeVisible();
    const check = async (where: string) => {
      const box = (await device(page).boundingBox())!;
      expect(Math.abs(box.width - width), `${where}: width ${box.width}`).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - (width * DEVICE.height) / DEVICE.width), `${where}: height ${box.height}`).toBeLessThanOrEqual(1);
      const line = (await page.locator("[data-meter-bar] [data-live]").boundingBox())!;
      expect(line.y, `${where}: the line is under the device`).toBeGreaterThanOrEqual(box.y + box.height - 1);
    };
    await check("overview");
    await goTo(page, MEDIASAFE);
    await check("station");
  });
}

test("on a portrait window a station shows PREV and NEXT, and the middle key's place on the device is empty", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  await goTo(page, MEDIASAFE);
  await expect(device(page).locator("[data-key]")).toHaveCount(2);
  await expect(barKey(page, "prev")).toBeVisible();
  await expect(barKey(page, "next")).toBeVisible();
  const box = (await device(page).boundingBox())!;
  const k = list.layers["key-room.png"], s = box.width / DEVICE.width;
  const middle = { x: box.x + (k.x + k.width / 2) * s, y: box.y + (k.y + k.height / 2) * s };
  // no key picture and no button covers the middle place; the case under it is there
  const covering = await page.evaluate(({ x, y }) => [...document.querySelectorAll("[data-meter-bar] [data-device] img, [data-meter-bar] button")]
    .filter((e) => { const r = e.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; })
    .map((e) => e.getAttribute("data-layer") ?? e.tagName), middle);
  expect(covering.filter((l) => /^key-|^BUTTON$/.test(l))).toEqual([]);
  expect(covering).toContain("base");
});

test("the device's pictures are files, asked for while the boot screen is up", async ({ page }) => {
  const asked: number[] = [];
  page.on("request", (r) => { if (/meter|\/assets\/.*\.png/.test(r.url()) && r.resourceType() === "image") asked.push(Date.now()); });
  await openTour(page);
  const bootGone = Date.now();
  expect(asked.length, "an image request per layer").toBeGreaterThanOrEqual(15);
  expect(Math.max(...asked), "every request was made before the boot screen went").toBeLessThan(bootGone);
  await expect(device(page).locator("img").first()).toBeVisible();
  expect(await page.evaluate(() => [...document.querySelectorAll("[data-meter-bar] img")].every((i) => !i.getAttribute("src")!.startsWith("data:")))).toBe(true);
});

test.describe("with the images blocked", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/*.png", (r) => r.abort());
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTour(page);
  });

  test("the reading shows as text digits and the keys as buttons, with no device", async ({ page }) => {
    await expect(device(page)).toHaveCount(0);
    const reading = page.getByRole("img", { name: /^Reading \d/ });
    await expect(reading).toBeVisible();
    const tubes = reading.getByTestId("tube");
    await expect(tubes).toHaveCount(7);
    expect(await tubes.allTextContents()).toEqual([...(await reading.getAttribute("aria-label"))!.replace("Reading ", "").replace(".", "")]);
    const start = barKey(page, "start");
    await expect(start).toBeVisible();
    await expect(start).toHaveText(ui.keyStart);
    await expect(start).toHaveCSS("color", "rgb(255, 207, 138)"); // the cap is the button's visible text
  });

  test("the keys still move the visit", async ({ page }) => {
    await barKey(page, "start").click();
    await landedAt(page, 1);
    await barKey(page, "next").click();
    await landedAt(page, 2);
    await barKey(page, "room").click();
    await landedAt(page, 0);
  });
});
