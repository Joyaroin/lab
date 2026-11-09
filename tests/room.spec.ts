import { test, expect } from "@playwright/test";
import { BOTTOM_CLEAR, SIDE, TOP_CLEAR } from "../src/pin";
import { boxOf, panelOf, meanBrightness, goTo, openTour, stationIds, waitForCamera, waitForPanel, waitUntilStill } from "./lib/page";

// Baked room loads and the tour still moves the camera. Screenshots go to test-results/.
// Seven software-WebGL screenshots: each waits for a drawn frame, which is slow on a loaded machine.
test.setTimeout(60_000);
test("baked room loads and the overview and every station render", { tag: "@render" }, async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const glb = page.waitForResponse((r) => r.url().includes("room-") && r.url().endsWith(".glb") && r.ok());
  await openTour(page);
  await glb;
  await expect(page.locator("canvas")).toBeVisible();
  const shots: Buffer[] = [];
  const stops = ["overview", ...stationIds];
  for (const [i, name] of stops.entries()) {
    await goTo(page, i);
    // Wait for the station's text to be fully in, which only happens inside its hold, rather
    // than a fixed time. The overview has no text, so it gets a short settle instead.
    if (i === 0) await page.waitForTimeout(300);
    else await expect(page.locator(`[data-screen="${name}"]`)).toHaveCSS("opacity", "1");
    shots.push(await page.screenshot({ path: `test-results/room-${name}.png` }));
  }
  expect(shots[0].equals(shots[1])).toBe(false); // camera moved
  expect(errors).toEqual([]);
});

// Ticket 36: on a portrait phone, MediaSafe and Software factory used to be mostly dark. Visited
// through the HUD, each must now frame lit parts of the room. Mean frame brightness (0-255) was about
// 22 for both before; the other stations sit between 22 and 31. The mean covers the whole window,
// station text and HUD included, so this shows the frame got brighter, not which part is lit.

test("on a phone, MediaSafe and Software factory frame lit parts of the room", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  for (const [name, label] of [["mediasafe", "World line 02: MediaSafe"], ["software-factory", "World line 05: Software factory"]]) {
    await goTo(page, stationIds.indexOf(name) + 1);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    // The first visit's tear plays after the landing, and the text comes out of it: measure once it is over.
    await expect(panelOf(page, name)).toHaveCSS("opacity", "1");
    await expect.poll(() => page.locator("canvas").evaluate((e) => (e as HTMLElement).style.filter)).toBe("");
    // Measure once the camera has arrived and the frame stops changing, not after a guessed delay.
    // Brightness is rounded to 0.1 so the rendering's tiny noise doesn't read as movement.
    const bright = await waitUntilStill(async () => Math.round((await meanBrightness(page, await page.screenshot())) * 10) / 10, 500);
    await page.screenshot({ path: `test-results/room-phone-${name}.png` });
    expect(bright, name).toBeGreaterThan(27);
  }
});

// Ticket 48: on desktop each station stops square to its TV, the text is laid over the glass, and
// moving the pointer inside a hold doesn't move either.
for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: text sits on the glass at every station and the pointer does not move it`, { tag: "@render" }, async ({ page }) => {
    test.setTimeout(150_000); // six stations, each waits for the camera on software WebGL
    await page.setViewportSize({ width: w, height: h });
    await openTour(page);
    for (const [k, id] of stationIds.entries()) {
      await goTo(page, k + 1);
      await expect(page.locator(`[data-screen="${id}"]`)).toBeVisible();
      const b = await waitForPanel(page, id); // the camera has arrived: the text stops moving
      // The text is laid over the glass, and the glass fills the band between the HUD and the meter:
      // inside it on every side, and as big as the band allows. The margins are the app's own (pin.ts),
      // so the test moves with them. The old floating card was inside the band too, but never filled it.
      const bandH = h - TOP_CLEAR - BOTTOM_CLEAR, bandW = w - 2 * SIDE;
      expect(b.top, id).toBeGreaterThanOrEqual(TOP_CLEAR - 1);
      expect(b.top + b.height, id).toBeLessThanOrEqual(h - BOTTOM_CLEAR + 1);
      expect(b.left, id).toBeGreaterThanOrEqual(SIDE - 1);
      expect(b.left + b.width, id).toBeLessThanOrEqual(w - SIDE + 1);
      expect(b.height >= bandH - 2 || b.width >= bandW - 2, `${id} fills the band (${b.width.toFixed(0)}x${b.height.toFixed(0)} in ${bandW}x${bandH})`).toBe(true);
      expect(Math.abs(b.left + b.width / 2 - w / 2), `${id} centred across`).toBeLessThan(2);
      expect(Math.abs(b.top + b.height / 2 - (TOP_CLEAR + bandH / 2)), `${id} centred in the band`).toBeLessThan(2);
      await page.screenshot({ path: `test-results/desktop-${w}x${h}-${id}.png` });
      // pointer to a corner: the text, and so the glass behind it, stay where they are
      await page.mouse.move(5, 5);
      await page.mouse.move(w - 5, h - 5);
      await waitForCamera(page, 400); // the pointer's frames have been drawn and the camera has stopped
      const after = await boxOf(page, id);
      // allow for the camera's last sub-pixel of easing; a parallax shift would be tens of pixels
      for (const k of ["left", "top", "width", "height"] as const) expect(Math.abs(after[k] - b[k]), `${id} ${k}`).toBeLessThan(1);
    }
  });
}
