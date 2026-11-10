import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { crts } from "../src/crts";
import { boxAround, glassBox } from "../src/glass";
import { BEZEL } from "../src/draw";
import { framingFor } from "../src/framing";
import { goTo, landedAt, openTour, stationIds, waitForCamera, clickLink, boxOf, waitForPanel, panelOf } from "./lib/page";

// Clicking the TVs on the overview (#176): a pointer cursor and an eased glow (its target is the canvas's data-hover)
// under the pointer, a click flies there, and at a station a TV takes no click of its own. Under reduced motion a move is a
// dark cover fading out and in, with no tear. That in flight the TVs take no clicks is proved by clickable()'s unit test.
// A click on the room at a station goes back (#224): the rule is goesBack()'s unit test; here the real clicks and taps.

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

/** TV `i`'s whole bezel as a box in the window, as the camera sees it at `stop`; null when it is behind the camera. */
function bezelBox(i: number, stop: number, size: { width: number; height: number }) {
  const s = framingFor(size).cameraAt({ kind: "at", stop });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const a = (crts[i].yaw * Math.PI) / 180, [cx, cy, cz] = crts[i].screen;
  const pts = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => {
    const r = (sx * BEZEL.width) / 2;
    return new Vector3(cx + Math.cos(a) * r, cy + (sy * BEZEL.height) / 2, cz - Math.sin(a) * r).project(cam);
  }));
  if (pts.some((p) => p.z > 1)) return null;
  return boxAround(pts.map((p) => ({ x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height })));
}

/** A point on TV `i`'s bezel, clear of its glass, as the camera sees it at `stop`: just right of the glass's edge. */
function bezelAt(i: number, stop: number, size: { width: number; height: number }) {
  const s = framingFor(size).cameraAt({ kind: "at", stop });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const a = (crts[i].yaw * Math.PI) / 180, right = 0.26; // the glass is 0.23 m from its centre, the bezel 0.29
  const p = new Vector3(crts[i].screen[0] + Math.cos(a) * right, crts[i].screen[1], crts[i].screen[2] - Math.sin(a) * right).project(cam);
  return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height };
}

/** What the page's top element is at a point: "canvas" when it is the room. */
const topAt = (page: Page, x: number, y: number) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase() ?? "none", [x, y]);

/** A point on the room itself (the canvas is on top there), off every TV's bezel, found by scanning the window. */
async function roomPoint(page: Page, stop: number, size: { width: number; height: number }) {
  const tvs = crts.map((_, i) => bezelBox(i, stop, size)).filter((b) => b !== null);
  for (const f of [0.04, 0.96, 0.1, 0.9, 0.5, 0.2, 0.8]) {
    for (const g of [0.5, 0.35, 0.65, 0.2, 0.8, 0.95]) {
      const x = Math.round(size.width * f), y = Math.round(size.height * g);
      if (tvs.some((t) => x > t.left - 12 && x < t.left + t.width + 12 && y > t.top - 12 && y < t.top + t.height + 12)) continue; // off every bezel
      if (await topAt(page, x, y) === "canvas") return { x, y };
    }
  }
  throw new Error("no point on the bare room in the window");
}

/** The visitor is still at `stop` with the URL unchanged, a while after a click that must do nothing (longer than a flight). */
async function staysAt(page: Page, stop: number, url: string) {
  await page.waitForTimeout(1500);
  await landedAt(page, stop);
  expect(page.url()).toBe(url);
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

  test("at a station, clicking where another TV is goes back to the overview", async ({ page }) => {
    await openTour(page);
    await goTo(page, 1);
    await waitForCamera(page);
    const size = page.viewportSize()!;
    const panel = await page.locator(`[data-screen="${stationIds[0]}"]`).boundingBox();
    const own = bezelBox(0, 1, size)!;
    const other = crts.map((_, i) => i).filter((i) => i !== 0).map((i) => ({ i, ...glassAt(i, 1, size) }))
      .find((g) => g.inFrame && !(g.x > own.left && g.x < own.left + own.width && g.y > own.top && g.y < own.top + own.height) && !(panel && g.x > panel.x && g.x < panel.x + panel.width && g.y > panel.y && g.y < panel.y + panel.height));
    expect(other, "another TV is in frame beside the station's TV and text").toBeTruthy();
    expect(await topAt(page, other!.x, other!.y), "the other TV is the canvas there").toBe("canvas");
    await page.mouse.move(other!.x, other!.y);
    // From a station another TV is not hot: no hover, no pointer cursor, but the click is a click on the room.
    await expect.poll(() => hover(page)).toBeNull();
    await expect.poll(() => cursor(page)).toBe("");
    await page.mouse.click(other!.x, other!.y);
    await landedAt(page, 0);
    expect(page.url()).not.toContain(`#${stationIds[0]}`);
  });
});

test.describe("a click on the room at a station (1440 x 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("on the room away from the TV goes back to the overview", async ({ page }) => {
    await openTour(page);
    await goTo(page, 2);
    await waitForCamera(page);
    const p = await roomPoint(page, 2, page.viewportSize()!);
    await page.mouse.click(p.x, p.y);
    await landedAt(page, 0);
  });

  test("on the station's own bezel leaves the URL alone", async ({ page }) => {
    await openTour(page);
    await goTo(page, 2);
    await waitForCamera(page);
    const url = page.url();
    const b = bezelAt(1, 2, page.viewportSize()!);
    expect(await topAt(page, b.x, b.y), "the bezel point is the room, not the text").toBe("canvas");
    await page.mouse.click(b.x, b.y);
    await staysAt(page, 2, url);
  });

  test("on the station's text panel leaves the URL alone", async ({ page }) => {
    await openTour(page);
    await goTo(page, 2);
    await waitForPanel(page, stationIds[1]);
    const url = page.url();
    const box = await boxOf(page, stationIds[1]);
    // the panel's own top left corner: padding, never a link
    await page.mouse.click(box.left + 2, box.top + 2);
    await staysAt(page, 2, url);
    await expect(panelOf(page, stationIds[1])).toBeVisible();
  });

  test("a 20 px drag on the room leaves the URL alone", async ({ page }) => {
    await openTour(page);
    await goTo(page, 2);
    await waitForCamera(page);
    const url = page.url();
    const p = await roomPoint(page, 2, page.viewportSize()!);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 10, p.y, { steps: 4 });
    await page.mouse.move(p.x + 20, p.y, { steps: 4 });
    await page.mouse.up();
    await staysAt(page, 2, url);
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

  test("at Contact, a tap on the room between the text panel and the meter bar goes back to the overview", async ({ page }) => {
    const contact = stationIds.indexOf("contact");
    await openTour(page);
    await goTo(page, contact + 1);
    await waitForPanel(page, "contact");
    await waitForCamera(page);
    const size = page.viewportSize()!;
    const panel = await boxOf(page, "contact");
    const bar = await page.locator("[data-meter-bar]").boundingBox();
    expect(bar, "the meter bar is on screen").toBeTruthy();
    // Contact's text is short, so the panel ends well above the meter bar: the strip between them is the room.
    const gap = { top: panel.top + panel.height, bottom: bar!.y };
    expect(gap.bottom - gap.top, `room between the panel (bottom ${gap.top}) and the meter bar (top ${gap.bottom})`).toBeGreaterThan(8);
    const x = Math.round(size.width / 2), y = Math.round((gap.top + gap.bottom) / 2);
    expect(await topAt(page, x, y), "the room's canvas is under that point").toBe("canvas");
    await page.touchscreen.tap(x, y);
    await landedAt(page, 0);
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

  test("a click on the room at a station goes back to the overview", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openTour(page);
    await goTo(page, 2);
    await waitForCamera(page);
    const p = await roomPoint(page, 2, page.viewportSize()!);
    await page.mouse.click(p.x, p.y);
    await landedAt(page, 0);
  });
});
