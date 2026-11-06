import { test, expect, type Page } from "@playwright/test";
import { holdSpan, progressFor } from "../src/hold";
import { POWER_ON_SECONDS, SHIFT_SECONDS } from "../src/nixie";
import { DWELL_MS, SNAP_BACK_MS } from "../src/shift";
import { panelOf as panel, scrollToProgress } from "./lib/page";

test.setTimeout(60_000);

// The Meter bar's digits, as the tests read them. The page-side readers are installed in every page
// (`window.__meter`), so the in-page watchers below don't each carry their own copy.
const METER_BAR = "[data-meter-bar]";
const meterDigits = (page: Page) => page.locator(`${METER_BAR} .meter-digits`);
const tubes = (page: Page) => page.locator(`${METER_BAR} [data-testid=tube]`).allTextContents().then((t) => t.join(""));
const label = (page: Page) => meterDigits(page).getAttribute("aria-label");
const reading = async (page: Page) => (await label(page))!.replace("Reading ", "").replace(".", "");

type MeterReaders = { tubes: () => string; truth: () => string; scramble: () => string; bar: () => Element };
declare global { interface Window { __meter: MeterReaders } }
const installMeterReaders = (page: Page) => page.addInitScript(() => {
  const bar = () => document.querySelector("[data-meter-bar]")!;
  const tubes = () => [...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join("");
  const truth = () => document.querySelector("[data-meter-bar] .meter-digits")!.getAttribute("aria-label")!.replace("Reading ", "").replace(".", "");
  // "true" while the tubes show the reading, else what they show: a scramble is a moment of the second kind.
  window.__meter = { bar, tubes, truth, scramble: () => (tubes() === truth() ? "true" : tubes()) };
});

/** Opens the site with the Meter bar up, and waits out its power-on (POWER_ON_SECONDS, which starts
 *  as the tour mounts, about when the bar appears) with a margin, so no test starts inside it. */
async function boot(page: Page) {
  await installMeterReaders(page);
  await page.goto("/");
  await expect(page.locator(METER_BAR)).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(POWER_ON_SECONDS * 1000 + 300);
}

// Samples the bar's digits every frame for `ms`.
const sample = (page: Page, ms: number) => page.evaluate((ms) => new Promise<string[]>((res) => {
  const seen: string[] = [], t0 = performance.now();
  const tick = () => {
    seen.push(window.__meter.tubes());
    performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(seen);
  };
  tick();
}), ms);

test("arriving in a hold scrambles the meter, which ends on the true reading", async ({ page }) => {
  await boot(page);
  const seen = page.evaluate(() => new Promise<string[]>((res) => {
    const out: string[] = [];
    const mo = new MutationObserver(() => out.push(window.__meter.tubes()));
    mo.observe(window.__meter.bar(), { childList: true, subtree: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res(out); }, 6_000);
  }));
  await scrollToProgress(page, progressFor(1));
  const digitsSeen = await seen;
  expect(new Set(digitsSeen).size).toBeGreaterThan(2); // it scrambled
  await expect.poll(async () => (await tubes(page)) === (await reading(page)), { timeout: 10_000 }).toBe(true); // and settled on the reading
});

test("scrolling quickly through a station does not scramble the meter", async ({ page }) => {
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await page.waitForTimeout(1500); // first visit, done
  await scrollToProgress(page, progressFor(2) - 0.12);
  await page.waitForTimeout(1200); // travelling: reading is fixed, no shift yet

  // The whole scroll-through happens in one task in the page, so it can't depend on the frame
  // rate or on Playwright round trips: arrive at station 2, spend a fifth of the dwell there on the
  // page's own clock, move on into the travel before station 3. Real scroll events come once per frame
  // (200 ms or more on software WebGL), so each scroll is followed by an event we dispatch ourselves,
  // which the app handles at once. Then watch the Meter bar for 1.5 s. Outside a hold no shift can
  // fire, so anything but the true reading on the tubes came from station 2, and a slow frame can't
  // cause it.
  const away = (progressFor(2) + progressFor(3)) / 2;
  expect(away).toBeGreaterThan(holdSpan(2)[1]);
  expect(away).toBeLessThan(holdSpan(3)[0]);
  const stay = DWELL_MS / 5;
  expect(stay).toBeLessThan(DWELL_MS);
  const { seen, stillThere } = await page.evaluate(([p2, p3, stay]) => new Promise<{ seen: string[]; stillThere: boolean }>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const to = (p: number) => { window.scrollTo(0, p * max()); window.dispatchEvent(new Event("scroll")); };
    const seen = [window.__meter.scramble()];
    const mo = new MutationObserver(() => seen.push(window.__meter.scramble()));
    mo.observe(window.__meter.bar(), { childList: true, subtree: true, characterData: true });
    to(p2);
    for (const t0 = performance.now(); performance.now() - t0 < stay;); // a short stay at station 2
    to(p3);
    setTimeout(() => {
      mo.disconnect();
      res({ seen, stillThere: Math.abs(window.scrollY / max() - p3) < 0.01 });
    }, 1_500);
  }), [progressFor(2), away, stay] as const);
  expect(stillThere).toBe(true);
  // The reading may move on, but the tubes never show random digits.
  expect(seen.filter((d) => d !== "true")).toEqual([]);
});

test("reduced motion shows the plain reading with no scramble", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await page.waitForTimeout(100);
  const seen = await sample(page, DWELL_MS + 1500);
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe(await reading(page));
});

// --- the tear, and the text resolving out of it ---

const filterOn = (page: Page) => page.evaluate(() => document.querySelector("canvas")!.style.filter.includes("shift-tear"));

// Watches the canvas's filter and the panel's opacity from inside the page, on its own clock.
const watch = (page: Page, id: string) => page.evaluate((id) => {
  const w = window as unknown as { __w: { starts: number[]; ends: number[]; shown: number | null; t0: number; litDuringTear: boolean; visibleDuringTear: boolean; slowestFrame: number; resolved: boolean } };
  const canvas = document.querySelector("canvas")!, el = document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
  const st = { starts: [] as number[], ends: [] as number[], shown: null as number | null, t0: performance.now(), litDuringTear: false, visibleDuringTear: true, slowestFrame: 0, resolved: false };
  let last = performance.now();
  w.__w = st;
  let on = false;
  new MutationObserver(() => {
    const now = canvas.style.filter.includes("shift-tear");
    if (now && !on) st.starts.push(performance.now() - st.t0);
    if (!now && on) st.ends.push(performance.now() - st.t0);
    on = now;
  }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
  const frame = () => {
    const now = performance.now();
    st.slowestFrame = Math.max(st.slowestFrame, now - last); last = now; // how slow this machine is drawing
    if (el.dataset.gated === "resolving" || el.getAnimations().length > 0) st.resolved = true; // the text's own resolve animation ran
    if (on) { // while the tear is on: is the text out yet, and is it still in the page for readers?
      if (Number(el.style.opacity) > 0.01) st.litDuringTear = true;
      if (el.style.visibility !== "visible") st.visibleDuringTear = false;
    }
    if (st.shown === null && Number(el.style.opacity) > 0.99 && el.style.visibility === "visible") st.shown = performance.now() - st.t0;
    requestAnimationFrame(frame);
  };
  frame();
}, id);
type Watched = { resolved: boolean; starts: number[]; ends: number[]; shown: number | null; slowestFrame: number; litDuringTear: boolean; visibleDuringTear: boolean };
const watched = (page: Page) => page.evaluate(() => (window as unknown as { __w: Watched }).__w);
// the shift has played and the text is out
const settled = (page: Page) => expect.poll(async () => { const w = await watched(page); return w.shown !== null && w.ends.length > 0; }, { timeout: 8_000 }).toBe(true);

// When the text must be fully out, counted from arrival: the design (250 ms dwell + the tear + the
// snap back, 1090 ms on a first visit; on a return the text shows when the 250 ms dwell ends; the
// exact numbers are pinned in shift.test.ts), plus the 220 ms a first visit's text takes to resolve (a
// return's does not), plus what this machine adds. The
// machine's share is judged by its own slowest frame, because the dwell timer, React and the tear
// each wait behind a frame: up to 4 of them, and 300 ms over. So a slow runner can't fail it, but
// text that is really late (a second or more past that) does.
const TEXT_RESOLVE_MS = 220; // the text's own resolve animation (ScreenPanels.tsx)
const lateBy = (design: number, w: Watched, resolve = TEXT_RESOLVE_MS) => design + resolve + 4 * w.slowestFrame + 300;

test("a first visit tears the view for about 0.8 s, and the text resolves as it ends", async ({ page }) => {
  await boot(page);
  await watch(page, "work");
  await scrollToProgress(page, progressFor(1));
  await settled(page);
  expect(await panel(page, "work").innerText()).not.toBe(""); // in the page throughout, selectable and findable
  const w = await watched(page);
  expect(w.starts).toHaveLength(1);
  expect(w.litDuringTear).toBe(false); // the text was out of sight while the view tore...
  expect(w.visibleDuringTear).toBe(true); // ...but never hidden from readers
  const len = w.ends[0] - w.starts[0];
  // The filter goes on at one frame and comes off at the first frame after the full tear's 0.8 s, so
  // it lasts that long, give or take a frame at each end.
  expect(len).toBeGreaterThan(SHIFT_SECONDS.full * 1000 - w.slowestFrame);
  expect(len).toBeLessThan(SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS + 2 * w.slowestFrame + 60);
  expect(w.shown! - w.starts[0]).toBeGreaterThan(len - 100); // not before the tear ends...
  expect(w.shown! - w.starts[0]).toBeLessThan(len + TEXT_RESOLVE_MS + 2 * w.slowestFrame + 150); // ...and soon after, once it has resolved
  expect(w.shown!).toBeLessThan(lateBy(1_090, w)); // see lateBy
  expect(await filterOn(page)).toBe(false);
});

test("a return shows its text when the 250 ms wait ends, and the flick plays over it", async ({ page }) => {
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await page.waitForTimeout(2500);
  await scrollToProgress(page, 0);
  await page.waitForTimeout(500);
  await watch(page, "work");
  await scrollToProgress(page, progressFor(1));
  await settled(page);
  const w = await watched(page);
  const len = w.ends[0] - w.starts[0];
  expect(len).toBeGreaterThan(SHIFT_SECONDS.short * 1000 - w.slowestFrame);
  expect(len).toBeLessThan(SHIFT_SECONDS.short * 1000 + SNAP_BACK_MS + 2 * w.slowestFrame + 60);
  expect(w.litDuringTear).toBe(true); // the text is out while the flick plays over it...
  expect(w.resolved).toBe(false); // ...with no resolve animation
  expect(w.shown! - w.starts[0]).toBeLessThan(2 * w.slowestFrame + 100); // out as the flick starts, not after it
  // The design is about 0.3 s from arrival (the wait, 250 ms; the camera's arrival is already done),
  // against 0.54 s before. lateBy allows for a slow machine.
  expect(w.shown!).toBeLessThan(lateBy(DWELL_MS, w, 0));
});

test("reduced motion gets no tear, and the text is there straight away", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await watch(page, "work");
  await scrollToProgress(page, progressFor(1));
  await expect.poll(async () => (await watched(page)).shown, { timeout: 5_000 }).not.toBeNull();
  await page.waitForTimeout(DWELL_MS + 1500);
  const w = await watched(page);
  expect(w.starts).toEqual([]);
  expect(await filterOn(page)).toBe(false);
  expect(w.shown!).toBeLessThan(700); // no held-back text: only the camera arriving
});

test("moving quickly between stations can't make more than 3 sudden changes in a second, tear after tear", async ({ page }) => {
  await boot(page);
  await watch(page, "work");
  // Hop between the stations, spending a little over the dwell at each, for 6 s.
  await page.evaluate(([stops, dwell]) => new Promise<void>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    let k = 0;
    const hop = () => {
      window.scrollTo(0, stops[k++ % stops.length] * max());
      window.dispatchEvent(new Event("scroll"));
    };
    hop();
    const id = setInterval(hop, dwell + 60);
    setTimeout(() => { clearInterval(id); res(); }, 6_000);
  }), [[1, 2, 3, 4, 5, 6].map(progressFor), DWELL_MS] as const);
  await page.waitForTimeout(1500);
  const { starts, ends, slowestFrame } = await watched(page);
  expect(starts.length).toBeGreaterThan(1); // it did tear, more than once
  // A sudden change is the tear starting, the re-cut (halfway through a full tear) and the snap back.
  const changes = starts.flatMap((a, i) => {
    const b = ends[i];
    return b === undefined ? [a] : b - a > 500 ? [a, (a + b) / 2, b] : [a, b];
  });
  // Times are seen a frame late, so shrink each window by the slowest frame at both ends.
  const span = 1000 - 2 * slowestFrame;
  for (const a of changes) expect(changes.filter((b) => b >= a && b < a + span).length).toBeLessThanOrEqual(3);
});

test("leaving mid-shift ends on the true reading, with no late jump", async ({ page }) => {
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await expect.poll(() => filterOn(page), { timeout: 5_000 }).toBe(true); // the shift is playing
  // leave the hold into travel, then watch the bar for 2 s
  const away = holdSpan(1)[1] + 0.03;
  const { seen, stillThere } = await page.evaluate(([p]) => new Promise<{ seen: string[]; stillThere: boolean }>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, p * max()); window.dispatchEvent(new Event("scroll"));
    const seen: string[] = [];
    const t0 = performance.now();
    const tick = () => { seen.push(window.__meter.scramble()); performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : res({ seen, stillThere: Math.abs(window.scrollY / max() - p) < 0.01 }); };
    setTimeout(tick, 150); // a few frames for React to take the shift off
  }), [away] as const);
  expect(stillThere).toBe(true);
  expect(seen.filter((d) => d !== "true")).toEqual([]); // never a scramble, and no jump to the reading at the end
  expect(await filterOn(page)).toBe(false); // the tear played out its own length and snapped back (it is never cut short, so the flash limit holds)
});

test("a shift that arrives during the power-on plays once it is over", async ({ page }) => {
  // When the tour (and the bar) appeared, on the page's clock: the power-on takes POWER_ON_SECONDS from about then.
  await page.addInitScript(() => {
    new MutationObserver((_, mo) => {
      if (document.querySelector("[data-meter-bar]")) { (window as unknown as { __barAt: number }).__barAt = performance.now(); mo.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.locator(METER_BAR)).toBeVisible();
  await watch(page, "work");
  await scrollToProgress(page, progressFor(1)); // the tubes are still warming up
  await page.waitForTimeout(500);
  // Not before the power-on is over. (A busy machine can take longer than this to get here, so the
  // time is checked on the page's clock rather than assuming 500 ms is still inside the power-on.)
  const early = await page.evaluate((powerOnMs) => {
    const w = (window as unknown as { __w: { starts: number[]; t0: number }; __barAt: number });
    return w.__w.starts.filter((s) => w.__w.t0 + s < w.__barAt + powerOnMs - 50);
  }, POWER_ON_SECONDS * 1000);
  expect(early).toEqual([]);
  await expect.poll(async () => (await watched(page)).starts.length, { timeout: 6_000 }).toBe(1); // then it plays
  await expect.poll(async () => (await watched(page)).shown, { timeout: 5_000 }).not.toBeNull();
});

test("reloading inside a hold is not an arrival: no shift, the meter never scrambles, and the text shows", async ({ page }) => {
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await expect.poll(async () => (await tubes(page)) === (await reading(page)), { timeout: 10_000 }).toBe(true); // first visit played out
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.locator(METER_BAR)).toBeVisible();
  await watch(page, "work");
  // Watch the tubes from the page's own clock for the whole of what follows: a shift that fired would
  // scramble them, whatever the filter and the text did.
  await page.evaluate(() => {
    const w = window as unknown as { __scrambles: string[] };
    w.__scrambles = [];
    const mo = new MutationObserver(() => { const s = window.__meter.scramble(); if (s !== "true") w.__scrambles.push(s); });
    mo.observe(window.__meter.bar(), { childList: true, subtree: true, characterData: true });
  });
  // Headless Chromium doesn't put the scroll position back here (the page is only tall once the room
  // is up), so do what browsers that do restore it do: scroll there, just after the tour mounts. The
  // app treats the first move off the top after a reload as that restore (TourView.tsx), not an arrival.
  await scrollToProgress(page, progressFor(1));
  await expect.poll(async () => (await watched(page)).shown, { timeout: 8_000 }).not.toBeNull();
  // Long enough for the shift to have played had it fired: past the power-on, the dwell and the tear.
  await page.waitForTimeout(POWER_ON_SECONDS * 1000 + DWELL_MS + SHIFT_SECONDS.full * 1000 + 500);
  expect((await watched(page)).starts).toEqual([]);
  expect(await filterOn(page)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __scrambles: string[] }).__scrambles)).toEqual([]);
  expect(await panel(page, "work").evaluate((e) => (e as HTMLElement).style.opacity)).toBe("1");
});
