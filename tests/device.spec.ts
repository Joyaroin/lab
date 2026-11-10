import { test, expect, type Page } from "@playwright/test";
import { fill, ui } from "../src/content";
import { readFileSync } from "node:fs";
import { HUD_MARGIN } from "../src/pin";
import { barKey, goTo, landedAt, openTour, panelOf, stationIds, waitForPanel } from "./lib/page";

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

// A short landscape window (a phone held sideways, 740 x 360; and 680 x 360 and 560 x 400, which used to wrap) has the compact HUD. The
// line under the device shows the short form of the gap's sentence, runs up to the HUD's side margins in 12.8 px type, so it is always
// one line, and the text panel above it is at least 120 px tall and ends above the meter bar.
const commits = (...subjects: string[]) => subjects.map((message) => ({ commit: { message } }));
for (const win of [{ width: 740, height: 360 }, { width: 680, height: 360 }, { width: 660, height: 365 }, { width: 560, height: 400 }]) {
  test(`at ${win.width} x ${win.height} the line under the device is one line, with the short gap sentence, and the text panel is 120 px or more and ends above the meter bar`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.route("https://api.github.com/**", (r) => r.fulfill({ json: commits(...Array.from({ length: 9 }, (_, i) => `Deploy MediaSafe ${i} to staging`), "Promote MediaSafe abc to prod") }));
    await page.setViewportSize(win);
    await openTour(page);
    await expect(device(page)).toBeVisible();
    const oneLine = () => page.locator("[data-meter-bar] [data-live]").evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return { tops: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size, font: parseFloat(getComputedStyle(el).fontSize) };
    });
    const check = async (where: string) => {
      const line = (await page.locator("[data-meter-bar] [data-live]").boundingBox())!;
      expect(await oneLine(), `${where}: one row of text, in 12.8 px type`).toEqual({ tops: 1, font: 12.8 });
      expect(line.height, `${where}: one line is 24 px tall`).toBeLessThanOrEqual(25);
      expect(line.x, `${where}: inside the HUD's left margin`).toBeGreaterThanOrEqual(HUD_MARGIN - 1);
      expect(line.x + line.width, `${where}: inside the HUD's right margin`).toBeLessThanOrEqual(win.width - HUD_MARGIN + 1);
    };
    await check("overview");
    await expect(page.locator("[data-meter-bar] [data-live]"), "the short form, not the long one").toHaveText(fill(ui.gapBehindShort, { n: 9, noun: ui.deploys }));
    await goTo(page, 1);
    await expect(panelOf(page, "work")).toBeVisible();
    await check("station");
    const panel = await waitForPanel(page, "work");
    const bar = (await page.locator("[data-meter-bar]").boundingBox())!;
    expect(panel.height, "a readable panel").toBeGreaterThanOrEqual(120 - 1);
    expect(panel.top + panel.height, "the text panel ends above the meter bar").toBeLessThanOrEqual(bar.y);
  });
}

// On a window that is not short the long sentence stays.
test("at 1440 x 900 the overview's line is the long gap sentence", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) => r.fulfill({ json: commits(...Array.from({ length: 9 }, (_, i) => `Deploy MediaSafe ${i} to staging`), "Promote MediaSafe abc to prod") }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openTour(page);
  await expect(page.locator("[data-meter-bar] [data-live]")).toHaveText(fill(ui.gapBehind, { n: 9, noun: ui.deploys }));
});

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

// The power-on (#229): the tubes' light, the numerals and the keys come up from dark together. The timing is a unit test
// (src/meter-power.test.ts); this watches the real device's opacities from its first frame and checks the order.
const watchLevels = () => {
  const seen: { light: number; key: number; numeral: number }[] = [];
  (window as unknown as { __levels: typeof seen }).__levels = seen;
  const read = (sel: string) => { const e = document.querySelector(`[data-meter-bar] ${sel}`); return e ? Number(getComputedStyle(e).opacity) : null; };
  const frame = () => {
    const light = read('img[data-layer="light"]'), key = read('img[data-layer^="key-"]'), numeral = read('[data-testid="tube"] img');
    if (light !== null && key !== null && numeral !== null) seen.push({ light, key, numeral });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};
const levels = (page: Page) => page.evaluate(() => (window as unknown as { __levels: { light: number; key: number; numeral: number }[] }).__levels);

test("the device comes up from dark: tubes' light, numerals and keys rise together to fully lit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(watchLevels);
  await openTour(page);
  await expect.poll(async () => (await levels(page)).at(-1)?.light).toBe(1);
  const seen = await levels(page);
  expect(seen[0].light, "dark when the device first shows").toBeLessThan(0.5);
  for (const s of seen) {
    expect(s.key, "the keys carry the tubes' light").toBeCloseTo(s.light, 1);
    expect(s.numeral).toBeCloseTo(s.light, 1);
  }
  expect(seen.at(-1)).toEqual({ light: 1, key: 1, numeral: 1 });
});

test("under reduced motion the device is lit from its first frame, keys too", async ({ page }) => {
  await page.addInitScript(watchLevels);
  await openTour(page);
  await expect(device(page)).toBeVisible();
  const seen = await levels(page);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((s) => s.light === 1 && s.key === 1 && s.numeral === 1)).toBe(true);
});

test("a device whose images arrive after the power-on is lit when it appears, with no second power-on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(watchLevels);
  let release = () => {};
  const held = new Promise<void>((r) => { release = r; });
  await page.route("**/*.png", async (r) => { await held; await r.continue(); });
  await openTour(page);
  await expect(device(page)).toHaveCount(0); // plain bar while the images are out
  await page.waitForTimeout(2000); // past the power-on's 1.4 s
  release();
  await expect(device(page)).toBeVisible();
  await expect(page.locator('[data-meter-bar] img[data-layer="light"]')).toBeVisible();
  const seen = await levels(page);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((s) => s.light === 1 && s.key === 1 && s.numeral === 1), JSON.stringify(seen.slice(0, 3))).toBe(true);
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
