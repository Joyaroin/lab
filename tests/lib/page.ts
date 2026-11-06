import { expect, type Page } from "@playwright/test";
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

/** Waits until `read()` returns the same thing twice, `every` ms apart. The scene is only drawn on
 *  demand and eases toward its target, so "the same twice" means the camera has arrived. */
export async function waitUntilStill<T>(read: () => Promise<T>, every = 300) {
  let last: string | undefined;
  await expect.poll(async () => {
    const now = JSON.stringify(await read());
    const still = now === last;
    last = now;
    return still;
  }, { intervals: [every] }).toBe(true);
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
