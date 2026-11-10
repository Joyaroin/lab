import { test, expect, type Page } from "@playwright/test";
import { fill, stations, ui } from "../src/content";
import { formatReading } from "../src/gap";
import { stopForHash } from "../src/visit/route";
import { barKey, goTo, landedAt, openTour, stationIds } from "./lib/page";

// The meter bar's keys and the arrow keys (#223): PREV, ROOM, NEXT and START step the visitor through the stations.
// Each waits for the HUD link's aria-current (set at a landing) and reads the URL's hash for where the visitor is.
// A move is a quick fade, so the specs run under reduced motion.

const stopOf = (id: string) => stationIds.indexOf(id) + 1;
const MEDIASAFE = stopOf("mediasafe"), HOME_LAB = stopOf("home-lab"), WORK = stopOf("work"), CONTACT = stopOf("contact");

/** The stop the URL names: 0 for the overview. */
const urlStop = (page: Page) => stopForHash(new URL(page.url()).hash);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openTour(page);
  await landedAt(page, 0);
});

test.describe("the keys", () => {
  test("NEXT at MediaSafe goes to Home lab", async ({ page }) => {
    await goTo(page, MEDIASAFE);
    await barKey(page, "next").click();
    await landedAt(page, HOME_LAB);
    expect(new URL(page.url()).hash).toBe("#home-lab");
  });

  test("PREV at Work goes to the overview", async ({ page }) => {
    await goTo(page, WORK);
    await barKey(page, "prev").click();
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  test("PREV at MediaSafe goes to Work", async ({ page }) => {
    await goTo(page, MEDIASAFE);
    await barKey(page, "prev").click();
    await landedAt(page, WORK);
  });

  test("ROOM at any station goes to the overview", async ({ page }) => {
    for (let stop = 1; stop <= stations.length; stop++) {
      await goTo(page, stop);
      await barKey(page, "room").click();
      await landedAt(page, 0);
      expect(urlStop(page), `ROOM at station ${stop}`).toBe(0);
    }
  });

  test("START at the overview goes to Work", async ({ page }) => {
    await barKey(page, "start").click();
    await landedAt(page, WORK);
    expect(new URL(page.url()).hash).toBe("#work");
  });

  test("NEXT at Contact goes to the overview", async ({ page }) => {
    await goTo(page, CONTACT);
    await barKey(page, "next").click();
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  test("the bar's line names the stop and counts the stations, from the content module", async ({ page }) => {
    await goTo(page, MEDIASAFE);
    const s = stations[MEDIASAFE - 1];
    const line = fill(ui.stopLine, { label: `${s.worldLine}: ${s.name}`, n: MEDIASAFE, total: stations.length });
    await expect(page.locator("[data-meter-bar]").getByText(line, { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: fill(ui.meterReading, { digits: formatReading(s.reading) }) })).toBeVisible();
  });
});

test.describe("the arrow keys", () => {
  test("Right at MediaSafe goes to Home lab, Left goes back", async ({ page }) => {
    await goTo(page, MEDIASAFE);
    await page.keyboard.press("ArrowRight");
    await landedAt(page, HOME_LAB);
    expect(new URL(page.url()).hash).toBe("#home-lab");
    await page.keyboard.press("ArrowLeft");
    await landedAt(page, MEDIASAFE);
  });

  test("Left at Work goes to the overview", async ({ page }) => {
    await goTo(page, WORK);
    await page.keyboard.press("ArrowLeft");
    await landedAt(page, 0);
  });

  test("Right at Contact goes to the overview", async ({ page }) => {
    await goTo(page, CONTACT);
    await page.keyboard.press("ArrowRight");
    await landedAt(page, 0);
  });

  test("Right at the overview goes to Work", async ({ page }) => {
    await page.keyboard.press("ArrowRight");
    await landedAt(page, WORK);
    expect(new URL(page.url()).hash).toBe("#work");
  });

  test("Left at the overview does nothing", async ({ page }) => {
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(800); // longer than a fade
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
  });

  test("Ctrl+Right is ignored", async ({ page }) => {
    await page.keyboard.press("Control+ArrowRight");
    await page.waitForTimeout(800);
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
    await goTo(page, MEDIASAFE);
    await page.keyboard.press("Control+ArrowRight");
    await page.keyboard.press("Alt+ArrowLeft");
    await page.waitForTimeout(800);
    await landedAt(page, MEDIASAFE);
  });
});

for (const [name, size, atStation] of [
  ["1440 x 900", { width: 1440, height: 900 }, ["prev", "room", "next"]],
  ["390 x 844", { width: 390, height: 844 }, ["prev", "next"]],
] as const) {
  test(`each key is a button with its accessible name, at least 44 x 44 px (${name})`, async ({ page }) => {
    await page.setViewportSize(size);
    const names = { prev: ui.prevStation, room: ui.backToRoom, next: ui.nextStation, start: ui.startTour };
    const caps = { prev: ui.keyPrev, room: ui.keyRoom, next: ui.keyNext, start: ui.keyStart };
    const check = async (keys: readonly (keyof typeof names)[]) => {
      await expect(page.locator("[data-meter-bar]").getByRole("button")).toHaveCount(keys.length);
      for (const k of keys) {
        const key = page.getByRole("button", { name: names[k], exact: true });
        await expect(key).toBeVisible();
        await expect(key).toHaveText(caps[k]);
        const box = (await key.boundingBox())!;
        expect(box.width, `${k} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${k} height`).toBeGreaterThanOrEqual(44);
        expect(box.x, `${k} is on screen`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${k} is on screen`).toBeLessThanOrEqual(size.width);
        expect(box.y + box.height, `${k} is on screen`).toBeLessThanOrEqual(size.height);
      }
    };
    await check(["start"]); // the overview
    await goTo(page, MEDIASAFE);
    await check(atStation);
  });
}

test.describe("the bar itself", () => {
  test("a click on the bar outside its keys moves nothing", async ({ page }) => {
    const bar = page.locator("[data-meter-bar]");
    await bar.click({ position: { x: 3, y: 3 } });
    await page.waitForTimeout(800);
    await landedAt(page, 0);
    expect(urlStop(page)).toBe(0);
    await goTo(page, MEDIASAFE);
    await bar.click({ position: { x: 3, y: 3 } });
    await page.getByRole("img", { name: /^Reading/ }).click(); // the reading is not a key either
    await page.waitForTimeout(800);
    await landedAt(page, MEDIASAFE);
    expect(urlStop(page)).toBe(MEDIASAFE);
  });

  test("the reading is found by its label, and at the overview its digits are visible", async ({ page }) => {
    const reading = page.getByRole("img", { name: /^Reading/ });
    await expect(reading).toHaveAttribute("aria-label", /^Reading \d/);
    await expect(reading).toBeVisible();
    await expect(reading.getByTestId("tube").first()).toBeVisible();
    const box = (await reading.boundingBox())!;
    expect(box.width).toBeGreaterThan(20);
    expect(box.height).toBeGreaterThan(10);
  });
});
