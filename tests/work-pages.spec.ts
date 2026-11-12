import { test, expect, type Page } from "@playwright/test";
import { pageSwitch, stations } from "../src/content";
import { SHIFT_SECONDS } from "../src/nixie";
import { busiestWindow, MAX_CHANGES_PER_SECOND, SNAP_BACK_MS } from "../src/shift";
import { countDraws, draws, frames, goBack, goTo, landedAt, overflowPanel, panelOf, waitForCamera, waitForPanel, waitUntilStill } from "./lib/page";
import { defineSnapWatcher } from "./lib/snap";
import { WORK_COPY, WORK_LEADS } from "./fixtures/work-copy";

// Ticket 55: Work is two pages on one TV, switched by a timeline of two buttons.
const work = stations.find((s) => s.id === "work")!;
const workPanel = (page: Page) => panelOf(page, "work");
const seg = (page: Page, id: string) => workPanel(page).locator(`button[data-page="${id}"]`);

async function openWork(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto("/");
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await goTo(page, 1);
  await expect(workPanel(page)).toHaveCSS("opacity", "1");
  await waitForCamera(page); // the camera has arrived
}
// the lead and the bullets: the text a page shows
const shown = async (page: Page) => [...(await workPanel(page).locator("[data-lead]").allInnerTexts()), ...(await workPanel(page).locator("li").allInnerTexts())];

for (const [w, h] of [[1280, 800], [1920, 1080]]) {
  test(`desktop ${w}x${h}: Work opens on Solace, and a click or Enter on a segment turns the page`, async ({ page }) => {
    test.setTimeout(90_000);
    await openWork(page, w, h);
    const [solace, barracuda] = work.pages!;

    // opens on Solace, with its text only; the open page is marked in words and shape, not colour
    await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true");
    await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "false");
    await expect(seg(page, "solace")).toContainText(pageSwitch.open);
    await expect(seg(page, "barracuda")).not.toContainText(pageSwitch.open);
    const widthOf = async (id: string) => (await seg(page, id).boundingBox())!;
    expect((await widthOf("barracuda")).x).toBeLessThan((await widthOf("solace")).x); // oldest on the left
    expect(await shown(page)).toEqual(expect.arrayContaining([solace.lead, ...solace.body]));
    expect(await shown(page)).not.toContain(barracuda.lead);
    expect(await shown(page)).not.toContain(barracuda.body[0]);
    expect(await seg(page, "barracuda").evaluate((e) => getComputedStyle(e).cursor)).toBe("pointer");
    await page.screenshot({ path: `test-results/work-${w}x${h}-solace.png` });

    // a click on the other segment
    await seg(page, "barracuda").click();
    await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "true");
    await expect(seg(page, "barracuda")).toContainText(pageSwitch.open);
    await expect(seg(page, "solace")).not.toContainText(pageSwitch.open);
    expect(await shown(page)).toEqual(expect.arrayContaining([barracuda.lead, ...barracuda.body]));
    expect(await shown(page)).not.toContain(solace.lead); // turning the page changes the lead
    expect(await shown(page)).not.toContain(solace.body[0]);
    await page.screenshot({ path: `test-results/work-${w}x${h}-barracuda.png` });

    // Enter on the focused segment, from the keyboard
    await seg(page, "solace").focus();
    await page.keyboard.press("Enter");
    await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true");
    expect(await shown(page)).toEqual(expect.arrayContaining(solace.body));
    await page.screenshot({ path: `test-results/work-${w}x${h}-solace-focus.png` });

    // every paragraph of the old copy is reachable on one page or the other
    const seen = new Set(await shown(page));
    await seg(page, "barracuda").focus();
    await page.keyboard.press("Enter");
    (await shown(page)).forEach((t) => seen.add(t));
    for (const b of [...WORK_LEADS, ...WORK_COPY]) expect(seen, b).toContain(b); // the approved wording, from a fixture
  });
}

test("scrolling does not turn the page", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await overflowPanel(page, "work"); // the real copy is too short to scroll, so the test makes it
  const box = (await workPanel(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 30); await page.waitForTimeout(80); }
  // the wheel did reach the panel and scroll its text, and still the page did not turn
  expect(await workPanel(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true");
  await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "false");
});

test("a turn starts the new page at its top", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await overflowPanel(page, "work"); // the real copy is too short to scroll, so the test makes it
  await workPanel(page).evaluate((e) => { e.scrollTop = 1e6; });
  const before = await workPanel(page).evaluate((e) => e.scrollTop);
  expect(before, "the panel was scrolled before the turn").toBeGreaterThan(0);
  // click from script: Playwright's own click scrolls the button into view, which would move the panel itself
  await seg(page, "barracuda").evaluate((b: HTMLElement) => b.click());
  await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "true");
  expect(await workPanel(page).evaluate((e) => e.scrollTop)).toBe(0);
});

// Leaving Work: the panel has more text than room and has been read to its end. Clicking Room still leaves, and
// afterwards the wheel over where the panel was moves nothing: the camera stays at the overview.
test("leaving Work with a long panel works, and the wheel over the room then moves nothing", async ({ page }) => {
  test.setTimeout(90_000);
  await openWork(page, 1280, 800);
  await overflowPanel(page, "work"); // the real copy is too short to overflow, so the test makes it
  await workPanel(page).evaluate((e) => { e.scrollTop = 1e6; }); // read to the end first
  const box = (await workPanel(page).boundingBox())!;
  await goBack(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 }); // the pointer's parallax settles first
  const camera = await waitForCamera(page);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(75); }
  expect(await waitForCamera(page), "the camera did not move").toEqual(camera);
  expect(await page.evaluate(() => scrollY), "the page did not scroll").toBe(0);
  await landedAt(page, 0);
});

// Ticket 58: turning the page plays the short flick on the Work TV only.
// Watches the panel's and the canvas's filter from inside the page; returns what it saw.
// `on`/`off` are when the panel's filter really went on and came off, `snaps` when the flick's snap back was visible
// (its displacement scale reaching 0), in ms from the watch's start.
type Seen = { on: number[]; off: number[]; snaps: number[]; canvas: number };
const watchFilters = async (page: Page) => { await page.evaluate(defineSnapWatcher); await page.evaluate(() => {
  const w = window as unknown as { __f: Seen };
  const panelEl = document.querySelector<HTMLElement>('[data-screen="work"]')!, canvas = document.querySelector("canvas")!;
  w.__f = { on: [], off: [], snaps: [], canvas: 0 };
  let on = false;
  const t0 = performance.now();
  new MutationObserver(() => {
    const now = panelEl.style.filter.includes("shift-tear");
    if (now && !on) w.__f.on.push(performance.now() - t0);
    if (!now && on) w.__f.off.push(performance.now() - t0);
    on = now;
  }).observe(panelEl, { attributes: true, attributeFilter: ["style"] });
  new MutationObserver(() => { if (canvas.style.filter.includes("shift-tear")) w.__f.canvas++; }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
  window.__watchSnap("shift-tear-page", () => w.__f.snaps.push(performance.now() - t0));
}); };
const filters = (page: Page) => page.evaluate(() => (window as unknown as { __f: Seen }).__f);

/** The limit's window (1.1 s) and a little more, so a booked change has left it. */
const ARRIVAL_WINDOW_MS = 1_300;
/** Opens Work (waiting out the arrival's own tear) and starts watching the filters. */
async function openWorkWatched(page: Page) {
  // Notes when the arrival's tear starts on the canvas (it starts after the desk meter's power-on, which on a slow
  // machine is after the camera has arrived, so "no filter yet" does not mean "tear over").
  await page.addInitScript(() => {
    const w = window as unknown as { __tearAt: number | null };
    w.__tearAt = null;
    new MutationObserver((records) => {
      for (const r of records) if (w.__tearAt === null && r.target instanceof HTMLCanvasElement && r.target.style.filter.includes("shift-tear")) w.__tearAt = performance.now();
    }).observe(document, { attributes: true, attributeFilter: ["style"], subtree: true });
  });
  await openWork(page, 1280, 800);
  // The first visit's tear is over once the canvas has no filter after having had one (its text, which waits for it, is already out).
  // A page turn books its flick against the limit of sudden changes in a window (WINDOW_MS in src/shift/shift.ts, 1.1 s from a
  // change), and the tear's changes still count in it: a click that comes sooner is turned with no flick, and this
  // helper's callers click at once. So wait out the window too, on the page's own clock.
  await expect.poll(() => page.evaluate((window_ms) => {
    const at = (window as unknown as { __tearAt: number | null }).__tearAt;
    return at !== null && performance.now() - at > window_ms && document.querySelector("canvas")!.style.filter === "";
  }, ARRIVAL_WINDOW_MS), { timeout: 10_000 }).toBe(true);
  await watchFilters(page);
}
/** Waits until every flick that started has snapped back. */
const flicksOver = (page: Page) => expect.poll(async () => { const f = await filters(page); return f.on.length > 0 && f.off.length === f.on.length; }, { timeout: 10_000 }).toBe(true);
/** For checks that something did NOT happen: waits for the length of a flick plus a few drawn frames, counted on the page's own clock and frames, so a slow machine waits longer. */
const pastAFlick = (page: Page) => page.evaluate(([ms]) => new Promise<void>((res) => {
  const t0 = performance.now();
  let n = 0;
  const tick = () => (++n >= 5 && performance.now() - t0 > ms ? res() : requestAnimationFrame(tick));
  tick();
}), [SHIFT_SECONDS.short * 1000 + SNAP_BACK_MS] as const);

test("a page turn flicks the Work TV only, and the page still changes", async ({ page }) => {
  test.setTimeout(60_000);
  await openWorkWatched(page);
  await seg(page, "barracuda").click();
  await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "true");
  expect(await shown(page)).toEqual(expect.arrayContaining(work.pages![1].body));
  await flicksOver(page);
  expect((await filters(page)).on).toHaveLength(1);
  expect((await filters(page)).canvas).toBe(0); // not the whole view
  expect(await workPanel(page).evaluate((e) => (e as HTMLElement).style.filter)).toBe(""); // and it ends
  expect(await page.locator("canvas").evaluate((e) => (e as HTMLElement).style.filter)).toBe("");
});

test("after a page turn the scene draws no frames at rest", async ({ page }) => {
  test.setTimeout(60_000);
  await countDraws(page);
  await openWorkWatched(page);
  await seg(page, "barracuda").click();
  await flicksOver(page);
  // The camera has been still since arriving, so anything drawn now would be the flick's doing. An absence
  // can't be waited for, so as idle.spec.ts does: let a few seconds pass and compare.
  await waitUntilStill(() => frames(page), 500); // a frame the page turn may have asked for has been drawn
  const before = { draws: await draws(page), frames: await frames(page) };
  await page.waitForTimeout(3_000);
  expect({ draws: await draws(page), frames: await frames(page) }).toEqual(before);
});

test("reduced motion swaps the page with no effect", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await openWork(page, 1280, 800);
  await watchFilters(page);
  await seg(page, "barracuda").click();
  await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "true");
  expect(await shown(page)).toEqual(expect.arrayContaining(work.pages![1].body));
  await pastAFlick(page);
  expect(await filters(page)).toEqual({ on: [], off: [], snaps: [], canvas: 0 });
});

// Clicks arrive at a set pace: the pause between them is the stimulus, not a wait for something.
const clickEvery = async (page: Page, ms: number, ids: string[]) => {
  for (const id of ids) {
    const t = Date.now();
    await seg(page, id).click();
    await page.waitForTimeout(Math.max(0, ms - (Date.now() - t)));
  }
};

test("clicking quickly back and forth ends on the right page and still flicks", async ({ page }) => {
  test.setTimeout(60_000);
  await openWorkWatched(page);
  await clickEvery(page, 60, ["barracuda", "solace", "barracuda", "solace", "barracuda", "solace", "barracuda"]);
  await expect(seg(page, "barracuda")).toHaveAttribute("aria-pressed", "true");
  expect(await shown(page)).toEqual(expect.arrayContaining(work.pages![1].body));
  expect(await shown(page)).not.toContain(work.pages![0].body[0]);
  await flicksOver(page);
  const f = await filters(page);
  expect(f.on.length).toBeLessThan(7); // not one per click
  expect(f.canvas).toBe(0);
});

// The limit is on real changes: measured from when the filter goes on and when the snap back is visible (the displacement
// scale reaching 0, not the filter coming off, #124), with no shrunk window. 0.7 s is the pace that put 4 real changes in a
// second before the frame allowance; the window's edges are pinned with a fake clock in src/shift/shift.test.ts.
for (const every of [700]) {
  test(`clicking every ${every} ms never puts more than 3 sudden changes in a real second`, { tag: "@timing" }, async ({ page }) => {
    test.setTimeout(60_000);
    await openWorkWatched(page);
    await clickEvery(page, every, Array.from({ length: 8 }, (_, k) => (k % 2 ? "solace" : "barracuda")));
    await flicksOver(page);
    const f = await filters(page);
    expect(f.on.length).toBeGreaterThan(1); // it flicks more than once
    expect(f.off.length).toBe(f.on.length);
    expect(f.snaps.length, "every flick's snap back was seen").toBe(f.on.length);
    expect(busiestWindow([...f.on, ...f.snaps])).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
    await expect(seg(page, "solace")).toHaveAttribute("aria-pressed", "true"); // 8 clicks, ends on the last one
  });
}
