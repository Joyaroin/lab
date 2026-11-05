import { test, expect, type Page } from "@playwright/test";
import { progressFor } from "../src/hold";

// Ticket 63: a panel that scrolls must keep its scroll position while the wheel turns, and
// at the end the wheel must carry on to the next stop.
const panelOf = (page: Page, id: string) => page.locator(`[data-screen="${id}"]`);
const top = (page: Page, id: string) => panelOf(page, id).evaluate((e) => e.scrollTop);

async function goTo(page: Page, k: number) {
  const delta = await page.evaluate((f) => f * (document.documentElement.scrollHeight - innerHeight) - scrollY, progressFor(k));
  await page.mouse.move(5, 5);
  await page.mouse.wheel(0, delta);
}
async function settle(page: Page, id: string) {
  let last = "";
  await expect.poll(async () => {
    const now = JSON.stringify(await panelOf(page, id).evaluate((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
    const still = now === last; last = now; return still;
  }, { intervals: [400] }).toBe(true);
}

for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: the real wheel over Work reads to the end without jumping back, then moves on`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    await goTo(page, 1);
    await expect(panelOf(page, "work")).toBeVisible();
    await settle(page, "work");
    const room = await panelOf(page, "work").evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(room, "Work must overflow for this test to mean anything").toBeGreaterThan(20);
    const box = (await panelOf(page, "work").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
    let prev = 0;
    for (let i = 0; i < 40 && prev < room - 1; i++) {
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(120);
      const now = await top(page, "work");
      expect(now, `step ${i}`).toBeGreaterThanOrEqual(prev); // never back toward the top
      prev = now;
    }
    expect(prev).toBeGreaterThanOrEqual(room - 2); // reached the end
    // moving the pointer keeps the position
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 5 });
    await page.waitForTimeout(200);
    expect(await top(page, "work")).toBe(prev);
    // carrying on moves to the next stop
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(100);
      if (await panelOf(page, "mediasafe").evaluate((e) => getComputedStyle(e).visibility) === "visible") break;
    }
    await expect(panelOf(page, "mediasafe")).toBeVisible();
  });
}

test("resizing the window leaves a scrolled panel inside its range", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await goTo(page, 1);
  await settle(page, "work");
  await panelOf(page, "work").evaluate((e) => { e.scrollTop = 1e6; });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(800);
  const s = await panelOf(page, "work").evaluate((e) => ({ t: e.scrollTop, max: e.scrollHeight - e.clientHeight }));
  expect(s.t).toBeLessThanOrEqual(s.max + 1);
});

// Phone-sized window (the non-glass path, where the panel's height limit was reset every frame).
test.describe("phone-sized window", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a real touch swipe and the wheel over MediaSafe keep the panel's position", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    await page.evaluate((f) => window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)), progressFor(2));
    await expect(panelOf(page, "mediasafe")).toHaveCSS("opacity", "1");
    await settle(page, "mediasafe");
    const room = await panelOf(page, "mediasafe").evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(room).toBeGreaterThan(200);
    const box = (await panelOf(page, "mediasafe").boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    let prev = 0;
    for (let i = 0; i < 16; i++) {
      // a real touch drag: finger down, moves up 60 px in steps, lifts
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let m = 1; m <= 6; m++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - m * 10 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(150);
      const now = await top(page, "mediasafe");
      expect(now, `swipe ${i}`).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
    expect(prev).toBeGreaterThanOrEqual(room - 2); // all the way to the end, past where it used to jump back
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 4 });
    await page.waitForTimeout(200);
    expect(await top(page, "mediasafe")).toBe(prev);
  });
});

test("phone-sized window: the real wheel over MediaSafe does not jump back", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await goTo(page, 2);
  await expect(panelOf(page, "mediasafe")).toHaveCSS("opacity", "1");
  await settle(page, "mediasafe");
  const box = (await panelOf(page, "mediasafe").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  let prev = 0;
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 20);
    await page.waitForTimeout(120);
    const now = await top(page, "mediasafe");
    expect(now, `step ${i}`).toBeGreaterThanOrEqual(prev);
    prev = now;
  }
  expect(prev).toBeGreaterThanOrEqual((await panelOf(page, "mediasafe").evaluate((e) => e.scrollHeight - e.clientHeight)) - 2);
});
