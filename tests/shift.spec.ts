import { test, expect, type Page } from "@playwright/test";
import { holdSpan, progressFor } from "../src/hold";
import { POWER_ON_SECONDS, SHIFT_SECONDS } from "../src/nixie";
import { busiestWindow, MAX_CHANGES_PER_SECOND, WAIT_MS, SNAP_BACK_MS } from "../src/shift";
import { lockTimesMs } from "./lib/lock";
import { panelOf, scrollToProgress } from "./lib/page";

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

test("arriving in a hold scrambles the meter for the length of the shift, and it ends on the true reading", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  // Each time the bar changes, does it show the reading, or something else? Something else is the scramble.
  // The visible scramble ends when the last tube locks, not at the shift's end. How many frames draw by then depends on the machine (under
  // heavy load one frame can take over a second), so the test counts none. It uses the page's own
  // clock and the machine's slowest frame. The first scrambled frame shows up to a frame after the
  // shift starts and the settle up to a frame after the last lock, so the observed length is at least
  // the last lock's time less one slowest frame. In the frame before the last lock only the last tube
  // is random, and it shows its true digit 1 time in 10, so the settle can come a frame early: the
  // floor gives up a second frame for that, but never more than one tube's slot (the gap between the
  // last two locks), so a fast machine does not get a wider margin than the scramble's own spacing.
  // What it caught, measured by making the bar's clock run fast in a scratch copy on a machine whose
  // slowest frame was about 90 ms: a scramble ending 33% early failed, ones ending 18% early or less
  // passed. A slower machine has a wider floor and catches less.
  const seen = page.evaluate(() => new Promise<{ changes: { at: number; d: string }[]; frames: { at: number; gap: number }[] }>((res) => {
    const out: { at: number; d: string }[] = [];
    const t0 = performance.now();
    const mo = new MutationObserver(() => out.push({ at: performance.now() - t0, d: window.__meter.scramble() }));
    mo.observe(window.__meter.bar(), { childList: true, subtree: true, characterData: true });
    // Every frame, and how long it took to come after the one before.
    const frames: { at: number; gap: number }[] = [];
    let last = performance.now();
    const frame = () => { const now = performance.now(); frames.push({ at: now - t0, gap: now - last }); last = now; requestAnimationFrame(frame); };
    frame();
    setTimeout(() => { mo.disconnect(); res({ changes: out, frames }); }, 6_000);
  }));
  await scrollToProgress(page, progressFor(1));
  const { changes: shown, frames } = await seen;
  const scrambled = shown.filter((c) => c.d !== "true");
  expect(scrambled.length).toBeGreaterThan(0); // it scrambled
  const first = scrambled[0].at, last = scrambled[scrambled.length - 1].at;
  const settled = shown.find((c) => c.at > last && c.d === "true");
  expect(settled, "and settled on the reading").toBeDefined();
  // The machine's slowest frame while the scramble was on (the frames from its first change to its
  // settle), not the slowest of the whole run: the page's load and the tear's first draw can take much
  // longer than the frames that show the digits, and a wide allowance would let an early stop pass.
  const slowest = Math.max(0, ...frames.filter((f) => f.at >= first && f.at <= settled!.at).map((f) => f.gap));
  const locks = lockTimesMs("full", (await reading(page)).length);
  const lastLock = locks[locks.length - 1], slot = lastLock - locks[locks.length - 2];
  expect(settled!.at - first).toBeGreaterThan(lastLock - slowest - Math.min(slot, slowest)); // it lasted until the last tube locks
  await expect.poll(async () => (await tubes(page)) === (await reading(page)), { timeout: 10_000 }).toBe(true);
});

test("scrolling quickly through a station does not scramble the meter", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await page.waitForTimeout(1500); // first visit, done
  await scrollToProgress(page, progressFor(2) - 0.12);
  await page.waitForTimeout(1200); // travelling: reading is fixed, no shift yet

  // The whole scroll-through happens in one task in the page, so it can't depend on the frame
  // rate or on Playwright round trips: arrive at station 2, spend a fifth of the wait there on the
  // page's own clock, move on into the travel before station 3. Real scroll events come once per frame
  // (200 ms or more on software WebGL), so each scroll is followed by an event we dispatch ourselves,
  // which the app handles at once. Then watch the Meter bar for 1.5 s. Outside a hold no shift can
  // fire, so anything but the true reading on the tubes came from station 2, and a slow frame can't
  // cause it.
  const away = (progressFor(2) + progressFor(3)) / 2;
  expect(away).toBeGreaterThan(holdSpan(2)[1]);
  expect(away).toBeLessThan(holdSpan(3)[0]);
  const stay = WAIT_MS / 5;
  expect(stay).toBeLessThan(WAIT_MS);
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
  const seen = await sample(page, WAIT_MS + 1500);
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe(await reading(page));
});

// --- the tear, and the text resolving out of it ---

const filterOn = (page: Page) => page.evaluate(() => document.querySelector("canvas")!.style.filter.includes("shift-tear"));

/** What `watch` records, in ms on the page's own clock from `t0`: when the tear started, re-cut and
 *  ended, when the panel was fully out, and what the machine's slowest frame was. */
type Watched = { cuts: number[]; starts: number[]; ends: number[]; shown: number | null; t0: number; litDuringTear: boolean; visibleDuringTear: boolean; slowestFrame: number; resolved: boolean };

// Watches the canvas's filter and the panel's opacity from inside the page, on its own clock.
const watch = (page: Page, id: string) => page.evaluate((id) => {
  const w = window as unknown as { __w: Watched };
  const canvas = document.querySelector("canvas")!, el = document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
  const st: Watched = { cuts: [], starts: [], ends: [], shown: null, t0: performance.now(), litDuringTear: false, visibleDuringTear: true, slowestFrame: 0, resolved: false };
  let last = performance.now();
  w.__w = st;
  let on = false;
  // The tear's filter goes on and off with the canvas's style; a re-cut of the bands is the filter's
  // noise seed changing while it is on. One observer for both, so the records arrive in the order they happened.
  const turb = document.querySelector("filter#shift-tear feTurbulence")!;
  let seed = turb.getAttribute("seed");
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      const t = performance.now() - st.t0;
      if (r.target === turb) {
        const now = turb.getAttribute("seed");
        if (now !== seed && on) st.cuts.push(t);
        seed = now;
        continue;
      }
      const now = canvas.style.filter.includes("shift-tear");
      if (now && !on) st.starts.push(t);
      if (!now && on) st.ends.push(t);
      on = now;
    }
  });
  mo.observe(canvas, { attributes: true, attributeFilter: ["style"] });
  mo.observe(turb, { attributes: true, attributeFilter: ["seed"] });
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
const watched = (page: Page) => page.evaluate(() => (window as unknown as { __w: Watched }).__w);
// the shift has played and the text is out
const settled = (page: Page) => expect.poll(async () => { const w = await watched(page); return w.shown !== null && w.ends.length > 0; }, { timeout: 8_000 }).toBe(true);

// When the text must be fully out, counted from arrival: the design (250 ms wait + the tear + the
// snap back, 1090 ms on a first visit; on a return the text shows when the 250 ms wait ends; the
// exact numbers are pinned in shift.test.ts), plus the 220 ms a first visit's text takes to resolve (a
// return's does not), plus what this machine adds. The
// machine's share is judged by its own slowest frame, because the wait's timer, React and the tear
// each wait behind a frame: up to 4 of them, and 300 ms over. So a slow runner can't fail it, but
// text that is really late (a second or more past that) does.
const TEXT_RESOLVE_MS = 220; // the text's own resolve animation (ScreenPanels.tsx)
const lateBy = (design: number, w: Watched, resolve = TEXT_RESOLVE_MS) => design + resolve + 4 * w.slowestFrame + 300;

test("a first visit tears the view for about 0.8 s, and the text resolves as it ends", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await watch(page, "work");
  await scrollToProgress(page, progressFor(1));
  await settled(page);
  expect(await panelOf(page, "work").innerText()).not.toBe(""); // in the page throughout, selectable and findable
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

test("a return shows its text when the 250 ms wait ends, and the flick plays over it", { tag: "@timing" }, async ({ page }) => {
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
  expect(w.shown!).toBeLessThan(lateBy(WAIT_MS, w, 0));
});

test("reduced motion gets no tear, and the text is there straight away", { tag: "@timing" }, async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await watch(page, "work");
  await scrollToProgress(page, progressFor(1));
  await expect.poll(async () => (await watched(page)).shown, { timeout: 5_000 }).not.toBeNull();
  await page.waitForTimeout(WAIT_MS + 1500);
  const w = await watched(page);
  expect(w.starts).toEqual([]);
  expect(await filterOn(page)).toBe(false);
  expect(w.shown!).toBeLessThan(700); // no held-back text: only the camera arriving
});

test("moving quickly between stations can't make more than the limit of sudden changes in a second, tear after tear", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await watch(page, "work");
  // Hop between the stations, spending a little over the wait at each, for 6 s.
  await page.evaluate(([stops, wait]) => new Promise<void>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    let k = 0;
    const hop = () => {
      window.scrollTo(0, stops[k++ % stops.length] * max());
      window.dispatchEvent(new Event("scroll"));
    };
    hop();
    const id = setInterval(hop, wait + 60);
    setTimeout(() => { clearInterval(id); res(); }, 6_000);
  }), [[1, 2, 3, 4, 5, 6].map(progressFor), WAIT_MS] as const);
  await page.waitForTimeout(1500);
  // A sudden change is the tear starting, each re-cut (watched: the noise seed changing) and the snap back.
  const { starts, ends, cuts } = await watched(page);
  expect(starts.length).toBeGreaterThan(1); // it did tear, more than once
  expect(cuts.length).toBeGreaterThan(0); // and the re-cut was seen, not assumed
  const changes = [...starts, ...cuts, ...ends];
  // The real times, in a full second: the limit's own padding covers the frames, the test doesn't shrink the window.
  expect(busiestWindow(changes)).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
});

// The tear is timed on performance.now() (TearView's useTear): it starts at one reading and comes off
// at the first frame where 0.8 s have passed. A slow frame can only make it come off later, never
// sooner. The only thing that shortens what we measure is the gap between the tear starting and our
// observer running, so a small fixed allowance covers every frame rate. A tear cut short comes off
// within a frame or two of the visitor leaving, far under this, however slow the frames are.
const TEAR_ALLOWANCE_MS = 50;
const WATCH_AFTER_LEAVING_MS = 2_000;

// At 1x and under Chromium's CPU throttling, so the check is shown to hold at slow frame rates.
// The throttling is a Chrome DevTools Protocol command, which only Chromium has; the project runs
// Chromium alone, so another browser would fail at newCDPSession rather than skip it.
for (const rate of [1, 10, 16]) {
  test(`leaving mid-shift ends on the true reading, with no late jump, and the tear plays out (${rate}x)`, { tag: "@timing" }, async ({ page }) => {
    await boot(page);
    if (rate > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
    // Leave the hold the moment the tear starts, from inside the page, so no round trip delays it. Time
    // the tear on the page's own clock, from the filter going on to it coming off, and watch the bar
    // for 2 s after leaving. Nothing here waits on a timer for its result.
    const away = holdSpan(1)[1] + 0.03;
    const left = page.evaluate(([p, watchMs]) => new Promise<{ seen: string[]; stillThere: boolean; length: number | null }>((res) => {
      const max = () => document.documentElement.scrollHeight - window.innerHeight;
      const canvas = document.querySelector("canvas")!;
      const on = () => canvas.style.filter.includes("shift-tear");
      const seen: string[] = [];
      new MutationObserver((_, mo) => {
        if (!on()) return;
        mo.disconnect();
        const started = performance.now();
        window.scrollTo(0, p * max()); window.dispatchEvent(new Event("scroll"));
        let length: number | null = null;
        new MutationObserver((_, end) => {
          if (on()) return;
          end.disconnect();
          length = performance.now() - started;
        }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
        const bar = new MutationObserver(() => seen.push(window.__meter.scramble()));
        bar.observe(window.__meter.bar(), { childList: true, subtree: true, characterData: true });
        // Every frame until 2 s after leaving. A tear that was going to come off has done so by the
        // first frame past that: its own frames run at the same rate as ours.
        const tick = () => {
          seen.push(window.__meter.scramble());
          if (performance.now() - started < watchMs) return requestAnimationFrame(tick);
          bar.disconnect();
          res({ seen, stillThere: Math.abs(window.scrollY / max() - p) < 0.01, length: on() ? null : length });
        };
        tick();
      }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
    }), [away, WATCH_AFTER_LEAVING_MS] as const);
    await scrollToProgress(page, progressFor(1));
    const { seen, stillThere, length } = await left;
    expect(stillThere).toBe(true);
    expect(length, `the tear never came off in the ${WATCH_AFTER_LEAVING_MS} ms after leaving`).not.toBeNull();
    // the tear plays out its own length after leaving, never cut short
    expect(length!, "the tear's length after leaving").toBeGreaterThan(SHIFT_SECONDS.full * 1000 - TEAR_ALLOWANCE_MS);
    expect(seen.filter((d) => d !== "true")).toEqual([]); // never a scramble, and no jump to the reading at the end
    expect(await filterOn(page)).toBe(false); // and it did snap back
  });
}

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
    const w = (window as unknown as { __w: Watched; __barAt: number });
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
  // Long enough for the shift to have played had it fired: past the power-on, the wait and the tear.
  await page.waitForTimeout(POWER_ON_SECONDS * 1000 + WAIT_MS + SHIFT_SECONDS.full * 1000 + 500);
  expect((await watched(page)).starts).toEqual([]);
  expect(await filterOn(page)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { __scrambles: string[] }).__scrambles)).toEqual([]);
  expect(await panelOf(page, "work").evaluate((e) => (e as HTMLElement).style.opacity)).toBe("1");
});
