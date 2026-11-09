import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { crts } from "../src/crts";
import { glassBox } from "../src/glass";
import { framingFor } from "../src/framing";
import { goTo, landedAt, openTour, stationIds, waitForCamera, clickLink } from "./lib/page";

// Clicking the TVs on the overview (#176): a pointer cursor and an eased glow (its target is the canvas's data-hover)
// under the pointer, a click flies there, and at a station the TVs take no clicks. Under reduced motion a move is a
// dark cover fading out and in, with no tear. That in flight the TVs take no clicks is proved by clickable()'s unit test.

/** Where TV `i`'s glass is in the window as the camera sees it at `stop`: its centre, and whether that is clearly in frame. */
function glassAt(i: number, stop: number, size: { width: number; height: number }) {
  const s = framingFor(size).cameraAt({ kind: "at", stop });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const b = glassBox(crts[i], cam, size);
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  const m = 30;
  return { x, y, inFrame: x > m && x < size.width - m && y > m && y < size.height - m };
}

const hover = (page: Page) => page.locator("canvas").first().getAttribute("data-hover");
const cursor = (page: Page) => page.evaluate(() => document.body.style.cursor);

test.describe("desktop window", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("hovering a TV on the overview sets the pointer cursor and its data-hover; leaving clears them", async ({ page }) => {
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
    const size = page.viewportSize()!;
    for (const i of [0, 3]) {
      const g = glassAt(i, 0, size);
      expect(g.inFrame, `TV ${i} is in frame on the overview`).toBe(true);
      await page.mouse.move(g.x, g.y);
      await expect.poll(() => hover(page)).toBe(stationIds[i]);
      await expect.poll(() => cursor(page)).toBe("pointer");
    }
    await page.mouse.move(size.width / 2, 2);
    await expect.poll(() => hover(page)).toBeNull();
    await expect.poll(() => cursor(page)).toBe("");
  });

  test("clicking a TV on the overview lands on its station with its text showing", async ({ page }) => {
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
    const g = glassAt(2, 0, page.viewportSize()!);
    await page.mouse.move(g.x, g.y);
    await expect.poll(() => hover(page)).toBe(stationIds[2]);
    await page.mouse.click(g.x, g.y);
    await landedAt(page, 3);
    await expect(page.locator(`[data-screen="${stationIds[2]}"]`)).toBeVisible();
    // At the station nothing is hot: no cursor, no hover target.
    await expect.poll(() => hover(page)).toBeNull();
    await expect.poll(() => cursor(page)).toBe("");
  });

  test("at a station, clicking where another TV is does nothing", async ({ page }) => {
    await openTour(page);
    await goTo(page, 1);
    await waitForCamera(page);
    const size = page.viewportSize()!;
    const panel = await page.locator(`[data-screen="${stationIds[0]}"]`).boundingBox();
    const other = crts.map((_, i) => i).filter((i) => i !== 0).map((i) => ({ i, ...glassAt(i, 1, size) }))
      .find((g) => g.inFrame && !(panel && g.x > panel.x && g.x < panel.x + panel.width && g.y > panel.y && g.y < panel.y + panel.height));
    expect(other, "another TV is in frame beside the station's text").toBeTruthy();
    await page.mouse.move(other!.x, other!.y);
    await page.mouse.click(other!.x, other!.y);
    await page.waitForTimeout(1500); // longer than a flight: a wrongly accepted click would have landed by now
    await landedAt(page, 1);
    await expect.poll(() => hover(page)).toBeNull();
    await expect.poll(() => cursor(page)).toBe("");
  });
});

test.describe("phone window with touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("tapping a TV that is in frame on the portrait overview lands on it", async ({ page }) => {
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
    const size = page.viewportSize()!;
    const tvs = crts.map((_, i) => ({ i, ...glassAt(i, 0, size) })).filter((g) => g.inFrame);
    expect(tvs.length, "a TV is in frame on the portrait overview").toBeGreaterThan(0);
    // The one nearest the middle of the window is least likely to sit under the HUD or the meter.
    tvs.sort((a, b) => Math.hypot(a.x - size.width / 2, a.y - size.height / 2) - Math.hypot(b.x - size.width / 2, b.y - size.height / 2));
    await page.touchscreen.tap(tvs[0].x, tvs[0].y);
    await landedAt(page, tvs[0].i + 1);
  });
});

test.describe("reduced motion", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a HUD link shows the dark cover, never lets it drop sharply, and lands with no tear", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Records the cover's opacity at every write, and whether the canvas ever had the tear's filter.
    await page.addInitScript(() => {
      const w = window as unknown as { __cover: number[]; __tear: boolean };
      w.__cover = []; w.__tear = false;
      const watch = () => {
        const cover = document.querySelector<HTMLElement>("[data-fade-cover]"), canvas = document.querySelector("canvas");
        if (!cover || !canvas) return requestAnimationFrame(watch);
        new MutationObserver(() => w.__cover.push(Number(cover.style.opacity))).observe(cover, { attributes: true, attributeFilter: ["style"] });
        new MutationObserver(() => { if (canvas.style.filter.includes("shift-tear")) w.__tear = true; }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
      };
      watch();
    });
    await openTour(page);
    await landedAt(page, 0);
    await clickLink(page, 2);
    await landedAt(page, 2);
    await expect(page.locator(`[data-screen="${stationIds[1]}"]`)).toBeVisible();
    await page.waitForTimeout(1500);
    const { cover, tear } = await page.evaluate(() => {
      const w = window as unknown as { __cover: number[]; __tear: boolean };
      return { cover: w.__cover, tear: w.__tear };
    });
    expect(Math.max(...cover, 0), "the cover came up").toBeGreaterThan(0.3);
    expect(cover.at(-1), "the cover is gone").toBe(0);
    // It may fall no faster than the fade's own pace: about 0.67 of its height in the longest frame the rig allows.
    for (let k = 1; k < cover.length; k++) expect(cover[k - 1] - cover[k], `cover step ${k}: ${cover.join(" ")}`).toBeLessThanOrEqual(0.7);
    expect(tear, "no tear played").toBe(false);
  });
});
