import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { crts } from "../src/crts";
import { glassBox } from "../src/glass";
import { framingFor } from "../src/framing";
import { fill, stations, ui } from "../src/content";
import { formatReading } from "../src/gap";
import { hudLink, landedAt, openTour, waitForCamera } from "./lib/page";

// The hover preview (#228): at the overview, the pointer resting on a lit TV or a station's HUD link makes the meter bar
// show that station's world line and name before the click, and moving off puts the gap's sentence back. Keyboard focus
// never previews. These specs read the line's text (and the reading it settles on), never the 150 ms rest or the scramble:
// the timing is src/bar.test.ts's, with a fake clock.

/** The gap's sentence, as the bar shows it at the overview with no preview: set once the page has read it (the saved gap's,
 *  as the live call is refused), so a spec doesn't hold the build's own copy of the number. */
let gapLine = "";
const line = (stop: number) => `${stations[stop - 1].worldLine}: ${stations[stop - 1].name}`;

/** The line under the meter bar's digits: the one span in the bar that isn't the digits or a key. */
const barLine = (page: Page) => page.locator("[data-meter-bar] > span[data-live]");

/** Where TV `i`'s glass is in the window as the camera sees it at the overview. */
function glassAt(i: number, size: { width: number; height: number }) {
  const s = framingFor(size).cameraAt({ kind: "at", stop: 0 });
  const cam = new PerspectiveCamera(s.fov, size.width / size.height, 0.01, 50);
  cam.position.set(...s.camera); cam.lookAt(new Vector3(...s.look)); cam.updateMatrixWorld();
  const b = glassBox(crts[i], cam, size);
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

test.describe("the hover preview at the overview (1440 x 900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
    // Records whether the room's canvas ever has a filter on it: the tear's. A preview is not a shift.
    await page.addInitScript(() => {
      const w = window as unknown as { __filtered: boolean };
      w.__filtered = false;
      const watch = () => {
        const canvas = document.querySelector("canvas");
        if (!canvas) return requestAnimationFrame(watch);
        new MutationObserver(() => { if (canvas.style.filter && canvas.style.filter !== "none") w.__filtered = true; }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
      };
      watch();
    });
    await openTour(page);
    await landedAt(page, 0);
    await waitForCamera(page);
    await expect(barLine(page)).not.toHaveText(ui.readingPending);
    gapLine = (await barLine(page).textContent())!;
    expect(gapLine, "the gap's sentence names the project").toContain("MediaSafe");
    expect(gapLine).not.toContain(stations[1].worldLine);
  });

  const canvasNeverFiltered = async (page: Page) => {
    expect(await page.evaluate(() => (window as unknown as { __filtered: boolean }).__filtered), "the canvas never had a filter").toBe(false);
    await expect(page.locator("canvas").first()).toHaveCSS("filter", "none");
  };

  test("the pointer on the MediaSafe link shows its world line and name under the meter bar; moving off shows the gap's sentence", async ({ page }) => {
    await hudLink(page, 2).hover();
    await expect(barLine(page)).toHaveText("World line 02: MediaSafe");
    expect(await barLine(page).textContent(), "no count in a preview").not.toContain(" of ");
    // the digits follow the line once the pointer has rested
    await expect(page.locator("[data-meter-bar] [role=img]")).toHaveAttribute("aria-label", fill(ui.meterReading, { digits: formatReading(stations[1].reading) }));
    await page.mouse.move(720, 2);
    await expect(barLine(page)).toHaveText(gapLine);
    await expect(page.locator("[data-meter-bar] [role=img]")).not.toHaveAttribute("aria-label", fill(ui.meterReading, { digits: formatReading(stations[1].reading) }));
    await canvasNeverFiltered(page);
  });

  test("the pointer on a TV shows that station's line; leaving it shows the gap's sentence", async ({ page }) => {
    const size = page.viewportSize()!;
    for (const i of [0, 3]) {
      const g = glassAt(i, size);
      await page.mouse.move(g.x, g.y);
      await expect(barLine(page)).toHaveText(line(i + 1));
    }
    await page.mouse.move(720, 2);
    await expect(barLine(page)).toHaveText(gapLine);
    await canvasNeverFiltered(page);
  });

  test("a visit and the return made with the keyboard, the pointer on no link: focus is back on the link and the line is the gap's", async ({ page }) => {
    await page.mouse.move(720, 2); // an empty spot: only the restored focus is under test
    await hudLink(page, 2).focus();
    await expect(barLine(page), "focus alone shows no preview").toHaveText(gapLine);
    await page.keyboard.press("Enter");
    await landedAt(page, 2);
    await waitForCamera(page);
    await page.keyboard.press("Escape");
    await landedAt(page, 0);
    await waitForCamera(page);
    await expect(hudLink(page, 2), "focus is back on the link that started the visit").toBeFocused();
    await expect(barLine(page)).toHaveText(gapLine);
  });

  test("a visit started by clicking a link the pointer stays on: back at the overview the line and digits are the gap's, with no preview and no scramble", async ({ page }) => {
    await hudLink(page, 2).click(); // the pointer rests on the link from here on
    await landedAt(page, 2);
    await waitForCamera(page);
    await page.keyboard.press("Escape");
    await landedAt(page, 0);
    await waitForCamera(page);
    const digits = page.locator("[data-meter-bar] [role=img]");
    const gapDigits = await digits.getAttribute("aria-label");
    expect(gapDigits).not.toBe(fill(ui.meterReading, { digits: formatReading(stations[1].reading) }));
    // past the 150 ms rest and the 0.25 s scramble, the bar still shows the gap's
    await page.waitForTimeout(600);
    await expect(barLine(page)).toHaveText(gapLine);
    await expect(digits).toHaveAttribute("aria-label", gapDigits!);
    // moving off the link and back on is a new rest: the preview works again
    await page.mouse.move(720, 2);
    await hudLink(page, 2).hover();
    await expect(barLine(page)).toHaveText("World line 02: MediaSafe");
  });
});
