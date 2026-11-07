import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { stations } from "../src/content";
import { progressFor } from "../src/hold";
import { openTour, panelOf, scrollToProgress, waitForCamera } from "../tests/lib/page";

// The screenshots job: every station at desktop and phone size, with the camera still and the
// text showing. Files go to $SHOTS_DIR as <station id>-<desktop|phone>.png, and
// scripts/post-screenshots.mjs attaches them to the PR. Any shot that can't be taken fails the test.
const dir = process.env.SHOTS_DIR ?? "shots-out";
const sizes = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

test.setTimeout(90_000);
mkdirSync(dir, { recursive: true });

for (const [name, size] of Object.entries(sizes)) {
  test.describe(name, () => {
    test.use({ viewport: size });
    for (const [i, s] of stations.entries()) {
      test(`${s.id} at ${name}`, async ({ page }) => {
        await openTour(page);
        await scrollToProgress(page, progressFor(i + 1));
        const panel = panelOf(page, s.id);
        // The text is out once the shift has played: fully opaque and visible, with the tear's filter off.
        await expect(panel).toHaveCSS("opacity", "1");
        await expect(panel).toHaveCSS("visibility", "visible");
        await expect(panel).not.toHaveText("");
        await expect.poll(() => page.evaluate(() => document.querySelector("canvas")!.style.filter.includes("shift-tear"))).toBe(false);
        await waitForCamera(page);
        await page.screenshot({ path: `${dir}/${s.id}-${name}.png` });
      });
    }
  });
}
