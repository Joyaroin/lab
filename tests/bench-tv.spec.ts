import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { bench, crts, type Crt } from "../src/crts";
import { glassBox } from "../src/glass";
import { framingFor } from "../src/framing";
import { stations, ui } from "../src/content";
import { landedAt, openTour, waitForCamera } from "./lib/page";

// The bench TV (#221): the switched-off set on the workbench, with no station. At the overview a click on it
// is a click on the room, which at the overview does nothing: no flight, no change to the URL. The HUD
// has a link for each of the five stations and none for it.

const size = { width: 1280, height: 800 };

/** The middle of `crt`'s glass in the window at the overview, as the tour's own camera sees it. */
function glassCentre(crt: Crt) {
  const s = framingFor(size).cameraAt({ kind: "at", stop: 0 });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const b = glassBox(crt, cam, size);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

const hudLinks = (page: Page) => page.getByRole("navigation", { name: ui.hud }).getByRole("link");

test("the HUD has five station links, and none is the bench TV's", async ({ page }) => {
  await page.setViewportSize(size);
  await openTour(page);
  const hrefs = await hudLinks(page).evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => h?.startsWith("#")));
  expect(hrefs).toEqual(stations.map((s) => `#${s.id}`));
  expect(hrefs).toHaveLength(5);
});

test("at the overview a click where the bench TV is leaves the URL alone", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize(size);
  await openTour(page);
  await waitForCamera(page);
  const at = glassCentre(bench);
  expect(at.x, "the bench TV's glass is in the window").toBeGreaterThan(0);
  expect(at.x).toBeLessThan(size.width);
  expect(at.y).toBeGreaterThan(0);
  expect(at.y).toBeLessThan(size.height);
  const before = page.url();
  // the same click on a station's TV flies there, so a click at this spot would show if the bench TV took one
  const work = glassCentre(crts[0]);
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName.toLowerCase(), [at.x, at.y])).toBe("canvas");
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1200); // longer than a flight (0.9 s): nothing should be moving
  expect(page.url()).toBe(before);
  await landedAt(page, 0);
  await page.mouse.click(work.x, work.y);
  await expect.poll(() => page.url()).toContain(`#${crts[0].id}`);
});
