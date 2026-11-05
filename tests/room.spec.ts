import { test, expect, type Page } from "@playwright/test";
import { holdSpan, progressFor } from "../src/hold";

// Baked room loads and the tour still moves the camera. Screenshots go to test-results/.
// Seven software-WebGL screenshots: each waits for a drawn frame, which is slow on a loaded machine.
test.setTimeout(60_000);
test("baked room loads and the entrance and every station render", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const glb = page.waitForResponse((r) => r.url().includes("room-") && r.url().endsWith(".glb") && r.ok());
  await page.goto("/");
  await glb;
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  const shots: Buffer[] = [];
  const stops = ["entrance", "work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
  for (const [i, name] of stops.entries()) {
    const frac = progressFor(i);
    await page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), frac);
    // Wait for the station's text to be fully in, which only happens inside its hold, rather
    // than a fixed time. The entrance has no text, so it gets a short settle instead.
    if (i === 0) await page.waitForTimeout(300);
    else await expect(page.locator(`[data-screen="${name}"]`)).toHaveCSS("opacity", "1");
    shots.push(await page.screenshot({ path: `test-results/room-${name}.png` }));
  }
  expect(shots[0].equals(shots[1])).toBe(false); // camera moved
  expect(errors).toEqual([]);
});

// Ticket 36: on a portrait phone, MediaSafe and WC2026 used to be mostly dark. Scrolled to with
// the wheel, each must now frame lit parts of the room. Mean frame brightness (0-255) was about
// 22 for both before; the other stations sit between 22 and 31. The mean covers the whole window,
// station text and HUD included, so this shows the frame got brighter, not which part is lit.

/** Mean brightness (0-255) of what the window shows now. */
async function meanBrightness(page: Page) {
  const shot = await page.screenshot();
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
    return sum / (d.length / 4);
  }, "data:image/png;base64," + shot.toString("base64"));
}

test("on a phone, MediaSafe and WC2026 Predictor frame lit parts of the room", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  const stops = ["entrance", "work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
  for (const [name, label] of [["mediasafe", "World line 02: MediaSafe"], ["wc2026-predictor", "World line 05: WC2026 Predictor"]]) {
    const frac = progressFor(stops.indexOf(name));
    const delta = await page.evaluate((f) => f * (document.documentElement.scrollHeight - innerHeight) - scrollY, frac);
    await page.mouse.move(195, 300);
    await page.mouse.wheel(0, delta);
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    // Measure once the camera has arrived and the frame stops changing, not after a guessed delay.
    let last = -1;
    await expect.poll(async () => {
      const now = await meanBrightness(page), still = Math.abs(now - last) < 0.05;
      last = now;
      return still;
    }, { intervals: [500] }).toBe(true);
    await page.screenshot({ path: `test-results/room-phone-${name}.png` });
    expect(last, name).toBeGreaterThan(27);
  }
});

// Ticket 48: on desktop each station stops square to its TV, the text is laid over the glass, and
// moving the pointer inside a hold doesn't move either.
for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: text sits on the glass at every station and the pointer does not move it`, async ({ page }) => {
    test.setTimeout(150_000); // six stations, each waits for the camera on software WebGL
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    const ids = ["work", "mediasafe", "home-lab", "order-tracker", "wc2026-predictor", "contact"];
    const box = (id: string) => page.locator(`[data-screen="${id}"]`).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    for (const [k, id] of ids.entries()) {
      const delta = await page.evaluate((f) => f * (document.documentElement.scrollHeight - innerHeight) - scrollY, progressFor(k + 1));
      await page.mouse.move(10, h / 2); // beside the text, so the wheel scrolls the page
      await page.mouse.wheel(0, delta);
      await expect(page.locator(`[data-screen="${id}"]`)).toBeVisible();
      // wait for the camera to arrive: the text stops moving
      let last = "";
      await expect.poll(async () => { const now = JSON.stringify(await box(id)); const still = now === last; last = now; return still; }, { intervals: [400] }).toBe(true);
      const b = await box(id);
      // between the HUD (128) and the meter (150 from the bottom), inside the sides
      expect(b.top, id).toBeGreaterThanOrEqual(127);
      expect(b.top + b.height, id).toBeLessThanOrEqual(h - 149);
      expect(b.left, id).toBeGreaterThanOrEqual(7);
      expect(b.left + b.width, id).toBeLessThanOrEqual(w - 7);
      await page.screenshot({ path: `test-results/desktop-${w}x${h}-${id}.png` });
      // pointer to a corner: the text, and so the glass behind it, stay where they are
      await page.mouse.move(5, 5);
      await page.mouse.move(w - 5, h - 5);
      await page.waitForTimeout(800);
      const after = await box(id);
      // allow for the camera's last sub-pixel of easing; a parallax shift would be tens of pixels
      for (const k of ["left", "top", "width", "height"] as const) expect(Math.abs(after[k] - b[k]), `${id} ${k}`).toBeLessThan(1);
    }
  });
}

// Ticket 72: with reduced motion, travel between stations is a straight line, but the leg from the
// entrance keeps its curve. Each test reads the camera from the canvas's data-camera at the two stops
// of a leg and halfway between them, once it has stopped moving. Halfway along a straight line is
// the average of the two stops; the arc sits well off that (about 2 m here).
for (const [name, leg, straight] of [["between stations 1 and 2", 1, true], ["out of the entrance", 0, false]] as const) {
  test(`reduced motion, ${name}: the camera ${straight ? "is on the straight line" : "keeps its curve"}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    const read = () => page.locator("canvas").evaluate((c) => (c.dataset.camera ?? "").split(",").map(Number));
    // scroll to progress `p` and wait for the camera to stop moving
    const goTo = async (p: number) => {
      await page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), p);
      let last = "";
      await expect.poll(async () => { const now = JSON.stringify(await read()); const still = now === last; last = now; return still; }, { intervals: [300] }).toBe(true);
      return read();
    };
    const [from, to] = [leg === 0 ? 0 : holdSpan(leg)[1], progressFor(leg + 1)];
    const a = await goTo(from);
    const b = await goTo(to);
    const m = await goTo((from + (leg === 0 ? holdSpan(1)[0] : holdSpan(leg + 1)[0])) / 2);
    const offLine = Math.hypot(...m.map((v, k) => v - (a[k] + b[k]) / 2));
    if (straight) expect(offLine).toBeLessThan(0.01);
    else expect(offLine).toBeGreaterThan(0.3);
    await ctx.close();
  });
}
