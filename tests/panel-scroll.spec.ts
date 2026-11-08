import { test, expect, type Page } from "@playwright/test";
import { progressFor } from "../src/hold";
import { openTour, overflowPanel, panelOf, scrollToProgress, waitForPanel, wheelToStop } from "./lib/page";

// Ticket 63: a panel that scrolls must keep its scroll position while the wheel turns, and
// at the end the wheel must carry on to the next stop.
//
// About the fixed waits (waitForTimeout) below. A panel's own scrolling fires no window scroll
// event, so it asks the scene for no frame; the panel's position is only put back, wrongly, in the
// next frame the scene draws, and the pointer movements and wheel ticks that these tests make are
// what ask for one. On CI's software WebGL a frame takes up to ~100 ms, so each wait is one
// frame's worth, after which a jump back would have happened. They cannot be "wait for X", because
// the bug is the absence of a change.
const FRAME_WAIT_MS = 150;
// The gap between wheel ticks while carrying on to the next stop. This loop waits for something to
// appear, not for the absence of a change, so the time only sets how often it looks: short enough
// that it stops soon after the panel shows, long enough not to flood the page with wheel events.
const NEXT_STOP_POLL_MS = 100;

const panelScrollTop = (page: Page, id: string) => panelOf(page, id).evaluate((e) => e.scrollTop);
const panelRoom = (page: Page, id: string) => panelOf(page, id).evaluate((e) => e.scrollHeight - e.clientHeight);

for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: the real wheel over Work reads to the end without jumping back, then moves on`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: w, height: h });
    await openTour(page);
    await wheelToStop(page, 1);
    await expect(panelOf(page, "work")).toBeVisible();
    await waitForPanel(page, "work");
    await overflowPanel(page, "work"); // the real copy is too short to overflow, so the test makes it
    const room = await panelRoom(page, "work");
    expect(room, "Work must overflow for this test to mean anything").toBeGreaterThan(20);
    const box = (await panelOf(page, "work").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
    let prev = 0;
    for (let i = 0; i < 40 && prev < room - 1; i++) {
      await page.mouse.wheel(0, 40);
      await page.waitForTimeout(FRAME_WAIT_MS);
      const now = await panelScrollTop(page, "work");
      expect(now, `step ${i}`).toBeGreaterThanOrEqual(prev); // never back toward the top
      prev = now;
    }
    expect(prev).toBeGreaterThanOrEqual(room - 2); // reached the end
    // moving the pointer keeps the position
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 5 });
    await page.waitForTimeout(FRAME_WAIT_MS);
    expect(await panelScrollTop(page, "work")).toBe(prev);
    // carrying on moves to the next stop
    for (let i = 0; i < 40; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(NEXT_STOP_POLL_MS);
      if (await panelOf(page, "mediasafe").evaluate((e) => getComputedStyle(e).visibility) === "visible") break;
    }
    await expect(panelOf(page, "mediasafe")).toBeVisible();
  });
}

// A panel scrolled to its end, then the window resized: the position must follow the new range
// (clamped if the range shrank, kept if it grew), and never be reset to the top, which is what
// happened when the panel's height limit was lifted and restored every frame. The panel is
// scrolled to its end first so there is a position to lose; the test fails if it comes back at 0.
async function resizeKeepsPosition(page: Page, id: string, stop: number, from: { width: number; height: number }, to: { width: number; height: number }) {
  await page.setViewportSize(from);
  await openTour(page);
  await wheelToStop(page, stop);
  await expect(panelOf(page, id)).toHaveCSS("opacity", "1");
  await waitForPanel(page, id);
  await overflowPanel(page, id, 4); // enough that it still overflows at the larger size
  const before = await panelRoom(page, id);
  expect(before, `${id} must overflow at ${from.width}x${from.height} for this test to mean anything`).toBeGreaterThan(20);
  await panelOf(page, id).evaluate((e) => e.scrollTo(0, e.scrollHeight));
  const atEnd = await panelScrollTop(page, id);
  expect(atEnd).toBeGreaterThan(before - 2);
  await page.setViewportSize(to);
  await waitForPanel(page, id); // laid out again, and the camera has settled at the new size
  const after = { top: await panelScrollTop(page, id), room: await panelRoom(page, id) };
  expect(after.top, "still inside its range").toBeLessThanOrEqual(after.room + 1);
  expect(after.top, "not reset to the top").toBeGreaterThanOrEqual(Math.min(atEnd, after.room) - 2);
}

test("resizing a desktop window keeps a scrolled panel at its place in the new range", async ({ page }) => {
  test.setTimeout(90_000);
  await resizeKeepsPosition(page, "work", 1, { width: 1280, height: 800 }, { width: 1024, height: 768 }); // more overflow: keeps its place
  await resizeKeepsPosition(page, "work", 1, { width: 1280, height: 800 }, { width: 1920, height: 1080 }); // less: clamped
});

test("resizing a phone-sized window keeps a scrolled panel at its place in the new range", async ({ page }) => {
  test.setTimeout(90_000);
  await resizeKeepsPosition(page, "mediasafe", 2, { width: 390, height: 844 }, { width: 360, height: 640 });
  await resizeKeepsPosition(page, "mediasafe", 2, { width: 390, height: 844 }, { width: 430, height: 932 });
});

// Phone-sized window (the non-glass path, where the panel's height limit was reset every frame).
test.describe("phone-sized window", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a real touch swipe and the wheel over MediaSafe keep the panel's position", async ({ page }) => {
    test.setTimeout(90_000);
    await openTour(page);
    await scrollToProgress(page, progressFor(2));
    await expect(panelOf(page, "mediasafe")).toHaveCSS("opacity", "1");
    await waitForPanel(page, "mediasafe");
    await overflowPanel(page, "mediasafe"); // the real copy is too short, so the test adds text
    const room = await panelRoom(page, "mediasafe");
    expect(room).toBeGreaterThan(200);
    const box = (await panelOf(page, "mediasafe").boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    // a real touch drag: finger down, moves up 60 px in steps, lifts
    const swipe = async () => {
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let m = 1; m <= 6; m++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - m * 10 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(FRAME_WAIT_MS);
    };
    let prev = 0;
    for (let i = 0; i < 16 && prev < room - 2; i++) {
      await swipe();
      const now = await panelScrollTop(page, "mediasafe");
      expect(now, `swipe ${i}`).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
    expect(prev).toBeGreaterThanOrEqual(room - 2); // all the way to the end, past where it used to jump back
    // Past the end: further swipes must not send the panel back toward the top, and (as with the
    // wheel) carry the page on toward the next stop.
    const pageAtEnd = await page.evaluate(() => scrollY);
    for (let i = 0; i < 5; i++) {
      await swipe();
      expect(await panelScrollTop(page, "mediasafe"), `swipe past the end ${i}`).toBeGreaterThanOrEqual(prev - 1);
    }
    expect(await page.evaluate(() => scrollY), "swiping past the end carries the page on").toBeGreaterThan(pageAtEnd + 20);
    await page.mouse.move(box.x + 20, box.y + 20, { steps: 4 });
    await page.waitForTimeout(FRAME_WAIT_MS);
    expect(await panelScrollTop(page, "mediasafe")).toBeGreaterThanOrEqual(prev - 1);
  });
});

test("phone-sized window: the real wheel over MediaSafe does not jump back", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openTour(page);
  await wheelToStop(page, 2);
  await expect(panelOf(page, "mediasafe")).toHaveCSS("opacity", "1");
  await waitForPanel(page, "mediasafe");
  const box = (await panelOf(page, "mediasafe").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  let prev = 0;
  for (let i = 0; i < 25; i++) {
    await page.mouse.wheel(0, 20);
    await page.waitForTimeout(FRAME_WAIT_MS);
    const now = await panelScrollTop(page, "mediasafe");
    expect(now, `step ${i}`).toBeGreaterThanOrEqual(prev);
    prev = now;
  }
  expect(prev).toBeGreaterThanOrEqual((await panelOf(page, "mediasafe").evaluate((e) => e.scrollHeight - e.clientHeight)) - 2);
});

// The "more" cue follows its panel's visibility: marked as having more, it still must not count as
// visible while the panel is hidden (at the entrance), and shows once the panel does.
test("the more cue is visible only when its panel is", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openTour(page);
  const cue = panelOf(page, "work").locator(".crt-more");
  const visibility = () => cue.evaluate((e) => getComputedStyle(e).visibility);
  await panelOf(page, "work").evaluate((e) => { e.dataset.more = "true"; }); // the entrance: panel hidden
  expect(await panelOf(page, "work").evaluate((e) => getComputedStyle(e).visibility)).toBe("hidden");
  expect(await visibility()).toBe("hidden");
  await wheelToStop(page, 1);
  await expect(panelOf(page, "work")).toBeVisible();
  await waitForPanel(page, "work");
  await panelOf(page, "work").evaluate((e) => { e.dataset.more = "true"; });
  expect(await visibility()).toBe("visible");
});
