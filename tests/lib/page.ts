import { expect, test, type Page } from "@playwright/test";
import { stations } from "../../src/content";
import { progressFor } from "../../src/hold";

// Helpers the browser specs share. Specs that need a page to settle, scroll to a stop or read
// pixels use these, so there is one way of doing each.

/** Stations by id, in tour order. */
export const stationIds = stations.map((s) => s.id);

export const panelOf = (page: Page, id: string) => page.locator(`[data-screen="${id}"]`);

/** Loads the site and waits until the boot screen has gone. */
export async function openTour(page: Page) {
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
}

/** Jumps the page to scroll progress `p` (0..1) at once. */
export const scrollToProgress = (page: Page, p: number) =>
  page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), p);

/** Turns the real wheel to get to stop `k` (0 is the entrance), with the pointer at (`x`, `y`): put it
 *  beside the text so the wheel scrolls the page, not a panel. */
export async function wheelToStop(page: Page, k: number, x = 5, y = 5) {
  const delta = await page.evaluate((f) => f * (document.documentElement.scrollHeight - innerHeight) - scrollY, progressFor(k));
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, delta);
}

/** The longest `waitUntilStill` waits for things to stop moving: three times the 15 s `expect` limit,
 *  because on a slow runner (software WebGL, a host under load) the camera eases in far fewer frames
 *  and one 1920x1080 wheel test timed out at 15 s once. It is a ceiling, not a delay: it only costs
 *  anything when something never settles, and then it still fails, with the last values it read. */
export const STILL_LIMIT_MS = 45_000;

/** Time to leave the test itself after the poll gives up, so the poll's failure (with its last
 *  values) is what gets reported and not the test's plain timeout. */
const TEST_MARGIN_MS = 3_000;

/** How long a poll may run in the test that is running: the limit, or the test's timeout less a margin,
 *  whichever is shorter. A test left at Playwright's 30 s default would otherwise time out first, with
 *  a plain timeout and not what the poll last read. This counts the test's whole timeout, not what is
 *  left of it (TestInfo has no start time to subtract). If a test has already used most of its time when
 *  the poll starts, Playwright cuts the poll off at the test's deadline instead. */
function pollBudget(limit: number) {
  try {
    const { timeout } = test.info();
    if (timeout > 0) return Math.max(1, Math.min(limit, timeout - TEST_MARGIN_MS));
  } catch { /* outside a test: no test clock to respect */ }
  return limit;
}

/** Waits until `read()` returns the same thing twice, `every` ms apart, and fails if it hasn't
 *  within `timeout` ms (at most `STILL_LIMIT_MS`, and always before the test's own timeout). The
 *  failure shows the last value read. The scene is only drawn on demand and eases toward its target,
 *  so "the same twice" means the camera has arrived. */
export async function waitUntilStill<T>(read: () => Promise<T>, every = 300, timeout = STILL_LIMIT_MS) {
  let last: string | undefined;
  await expect.poll(async () => {
    const now = JSON.stringify(await read());
    const still = now === last;
    last = now;
    return still ? "still" : `still moving, last read ${now}`;
  }, { intervals: [every], timeout: pollBudget(timeout) }).toBe("still");
  return JSON.parse(last!) as T;
}

/** The camera's position, from the canvas's data-camera. Fails if the attribute is missing or
 *  isn't three numbers, so a page that never wrote one can't pass as "the camera is at zero". */
export async function readCamera(page: Page): Promise<number[]> {
  const raw = await page.locator("canvas").first().getAttribute("data-camera");
  expect(raw, "the canvas writes data-camera").toBeTruthy();
  const v = raw!.split(",").map(Number);
  expect(v, `data-camera "${raw}" is three numbers`).toHaveLength(3);
  for (const n of v) expect(Number.isFinite(n), `data-camera "${raw}"`).toBe(true);
  return v;
}

/** Waits for the camera to stop moving, and returns where it stopped. */
export const waitForCamera = (page: Page, every = 300) => waitUntilStill(() => readCamera(page), every);

/** A panel's box in window pixels. */
export const boxOf = (page: Page, id: string) => panelOf(page, id).evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});

/** Waits for a panel to stop moving (the camera easing into the stop), and returns its box. */
export const waitForPanel = (page: Page, id: string, every = 400) => waitUntilStill(() => boxOf(page, id), every);

/** Hands a screenshot to `fn` inside the page, as decoded pixels, and returns what it returns.
 *  `fn` runs in the browser, so it can't use anything from the spec's own scope; pass what it needs
 *  as `arg`. This is the one place that decodes a screenshot. */
export function readShot<A, R>(page: Page, png: Buffer, fn: (img: ImageData, arg: A) => R, arg: A): Promise<R> {
  return page.evaluate(async ({ src, fnSrc, arg }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    return (0, eval)(`(${fnSrc})`)(x.getImageData(0, 0, c.width, c.height), arg);
  }, { src: "data:image/png;base64," + png.toString("base64"), fnSrc: fn.toString(), arg });
}

/** Mean brightness (0-255) of a screenshot. */
export const meanBrightness = (page: Page, png: Buffer) => readShot(page, png, (img) => {
  const d = img.data;
  let sum = 0;
  for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
  return sum / (d.length / 4);
}, null);

// Counts the 3D scene's draw calls, which is what a drawn frame is made of. Headless Chromium has
// software WebGL, so this proves the scene is idle, not how much a phone would spend drawing.
// Nothing on the CRTs moves, so every draw is the power-on, a scroll or a pointer move.
export const countDraws = async (page: Page) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number; __frames: number };
    w.__draws = 0;
    w.__frames = 0; // each frame clears the screen once
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const clear = C.prototype.clear;
      C.prototype.clear = function (mask: number) { w.__frames++; return clear.call(this, mask); };
    }
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"] as const) {
        const orig = (C.prototype as any)[fn];
        (C.prototype as any)[fn] = function (...a: unknown[]) { w.__draws++; return orig.apply(this, a); };
      }
    }
  });
};
export const draws = (page: Page) => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
export const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: number }).__frames);

