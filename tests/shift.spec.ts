import { test, expect, type Page } from "@playwright/test";
import { POWER_ON_SECONDS, SHIFT_SECONDS } from "../src/nixie";
import { busiestWindow, MAX_CHANGES_PER_SECOND, WAIT_MS } from "../src/shift";
import { defineSnapWatcher } from "./lib/snap";
import { clickLink, defineHudDriver, goBack, goTo, hudHref, landedAt, panelOf } from "./lib/page";

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
  await page.addInitScript(defineSnapWatcher);
  await page.addInitScript(defineHudDriver);
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
  // The visible scramble ends when the last tube locks, not at the shift's end. How long it lasts, and when each
  // tube locks, are pinned with a fake clock in src/nixie.test.ts:64; a busy machine can't be held to them
  // here. So this checks that it scrambled, that it settled on the reading, and that the tubes end on it.
  const seen = page.evaluate(() => new Promise<{ at: number; d: string }[]>((res) => {
    const out: { at: number; d: string }[] = [];
    const t0 = performance.now();
    const mo = new MutationObserver(() => out.push({ at: performance.now() - t0, d: window.__meter.scramble() }));
    mo.observe(window.__meter.bar(), { childList: true, subtree: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res(out); }, 6_000);
  }));
  await goTo(page, 1);
  const shown = await seen;
  const scrambled = shown.filter((c) => c.d !== "true");
  expect(scrambled.length).toBeGreaterThan(0); // it scrambled
  const last = scrambled[scrambled.length - 1].at;
  const settled = shown.find((c) => c.at > last && c.d === "true");
  expect(settled, "and settled on the reading").toBeDefined();
  await expect.poll(async () => (await tubes(page)) === (await reading(page)), { timeout: 10_000 }).toBe(true);
});

test("reduced motion shows the plain reading with no scramble", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await goTo(page, 1);
  await page.waitForTimeout(100);
  const seen = await sample(page, WAIT_MS + 1500);
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe(await reading(page));
});

// --- the tear, and the text resolving out of it ---

const filterOn = (page: Page) => page.evaluate(() => document.querySelector("canvas")!.style.filter.includes("shift-tear"));

/** What `watch` records, in ms on the page's own clock from `t0`: when the tear started, re-cut and
 *  ended (the filter coming off), when its snap back was visible (the displacement scale reaching 0), when the panel was fully out, and what the machine's slowest frame was. */
type Watched = { cuts: number[]; starts: number[]; ends: number[]; snaps: number[]; shown: number | null; t0: number; litDuringTear: boolean; visibleDuringTear: boolean; slowestFrame: number; resolved: boolean };

// Watches the canvas's filter and the panel's opacity from inside the page, on its own clock.
const watch = (page: Page, id: string) => page.evaluate((id) => {
  const w = window as unknown as { __w: Watched };
  const canvas = document.querySelector("canvas")!, el = document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
  const st: Watched = { cuts: [], starts: [], ends: [], snaps: [], shown: null, t0: performance.now(), litDuringTear: false, visibleDuringTear: true, slowestFrame: 0, resolved: false };
  let last = performance.now();
  w.__w = st;
  // Each stay is timed from the landing (the HUD link's aria-current), not from the click that starts the flight.
  const landing = document.querySelector(`nav[aria-label="HUD"] a[href="#${id}"]`)!;
  const land = new MutationObserver(() => { if (landing.getAttribute("aria-current") === "location") { st.t0 = performance.now(); land.disconnect(); } });
  land.observe(landing, { attributes: true, attributeFilter: ["aria-current"] });
  let on = false;
  // The tear's filter goes on and off with the canvas's style; a re-cut of the bands is the filter's
  // noise seed changing while it is on. One observer for both, so the records arrive in the order they happened.
  const turb = document.querySelector("filter#shift-tear feTurbulence")!;
  let seed = turb.getAttribute("seed");
  window.__watchSnap("shift-tear", () => st.snaps.push(performance.now() - st.t0));
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
const TEXT_RESOLVE_MS = 220; // the text's own resolve animation (src/text/ScreenPanels.tsx)
const lateBy = (design: number, w: Watched, resolve = TEXT_RESOLVE_MS) => design + resolve + 4 * w.slowestFrame + 300;

test("a first visit tears the view for about 0.8 s, and the text resolves as it ends", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await watch(page, "work");
  await goTo(page, 1);
  await settled(page);
  expect(await panelOf(page, "work").innerText()).not.toBe(""); // in the page throughout, selectable and findable
  const w = await watched(page);
  expect(w.starts).toHaveLength(1);
  expect(w.litDuringTear).toBe(false); // the text was out of sight while the view tore...
  expect(w.visibleDuringTear).toBe(true); // ...but never hidden from readers
  const len = w.ends[0] - w.starts[0];
  // The tear's length, the snap back's time and when the text shows are pinned with a fake clock (src/frames.test.ts,
  // src/tear.test.ts, src/shift/shift.test.ts); here only their order is checked. The snap back is visible when the
  // slip reaches 0, at 0.85 of the length (680 ms by design). Its time is recorded for CI's report.
  const snap = w.snaps[0] - w.starts[0];
  test.info().annotations.push({ type: "snap-back-ms", description: `full tear: ${snap.toFixed(0)} ms after the filter went on (design 680), filter off at ${len.toFixed(0)} ms, slowest frame ${w.slowestFrame.toFixed(0)} ms` });
  console.log(`snap-back-ms full ${snap.toFixed(0)} (design 680; filter off ${len.toFixed(0)}; slowest frame ${w.slowestFrame.toFixed(0)})`);
  expect(w.starts).toHaveLength(1); // the tear started
  expect(w.snaps).toHaveLength(1);
  expect(w.snaps[0], "it snapped back before it came off").toBeLessThan(w.ends[0]);
  expect(len, "it came off within 3 s of starting").toBeLessThan(3_000);
  expect(w.shown!, "the text showed after the snap back").toBeGreaterThan(w.snaps[0] - w.t0);
  expect(w.shown!).toBeLessThan(lateBy(1_090, w)); // see lateBy
  expect(await filterOn(page)).toBe(false);
});

test("a return shows its text when the 250 ms wait ends, and the flick plays over it", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await goTo(page, 1);
  await page.waitForTimeout(2500);
  await goBack(page);
  await page.waitForTimeout(500);
  await watch(page, "work");
  await goTo(page, 1);
  await settled(page);
  const w = await watched(page);
  const len = w.ends[0] - w.starts[0];
  const snap = w.snaps[0] - w.starts[0];
  test.info().annotations.push({ type: "snap-back-ms", description: `short flick: ${snap.toFixed(0)} ms after the filter went on (design 212.5), filter off at ${len.toFixed(0)} ms, slowest frame ${w.slowestFrame.toFixed(0)} ms` });
  console.log(`snap-back-ms short ${snap.toFixed(0)} (design 212.5; filter off ${len.toFixed(0)}; slowest frame ${w.slowestFrame.toFixed(0)})`);
  expect(w.snaps).toHaveLength(1);
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
  await goTo(page, 1);
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
  // Hop between the stations through the HUD, spending a little over the wait at each (timed from the landing), for 6 s.
  await page.evaluate(async ([hrefs, wait]) => {
    const go = (window as unknown as { __hudGo: (href: string) => Promise<number> }).__hudGo;
    const end = performance.now() + 6_000;
    for (let k = 0; performance.now() < end; k++) {
      await go(hrefs[k % hrefs.length]);
      await new Promise((r) => setTimeout(r, wait + 60));
    }
  }, [[1, 2, 3, 4, 5, 6].map(hudHref), WAIT_MS] as const);
  await page.waitForTimeout(1500);
  // A sudden change is the tear starting, each re-cut (watched: the noise seed changing) and the visible snap back (the displacement scale reaching 0, #124).
  const { starts, snaps, cuts } = await watched(page);
  expect(starts.length).toBeGreaterThan(1); // it did tear, more than once
  expect(cuts.length).toBeGreaterThan(0); // and the re-cut was seen, not assumed
  expect(snaps.length).toBe(starts.length); // every tear's visible snap back was seen
  const changes = [...starts, ...cuts, ...snaps];
  // The real times, in a full second: the limit's own padding covers the frames, the test doesn't shrink the window.
  expect(busiestWindow(changes)).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
});

// The tear is timed on performance.now() (TearView's useTear): it starts at one reading and comes off
// at the first frame where 0.8 s have passed. A slow frame can only make it come off later, never
// sooner. What we measure can come out a little short, because our observer runs after the end of
// the task that set the filter (React's effect flush, a slow frame long under 16x throttling). So the exact length is
// pinned with a fake clock (src/frames.test.ts, src/tear.test.ts) and this checks only that the tear was
// not cut short: it must last longer than half the full tear. A tear cut short by leaving comes off
// within a frame or two, far under that at any frame rate.
const WATCH_AFTER_LEAVING_MS = 2_000;

// Under Chromium's 16x CPU throttling, so the check is shown to hold at slow frame rates (the 1x and 10x runs went in #123: the fast tests in src/shift/shift.test.ts cover the rule).
// The throttling is a Chrome DevTools Protocol command, which only Chromium has; the project runs
// Chromium alone, so another browser would fail at newCDPSession rather than skip it.
for (const rate of [16]) {
  test(`leaving mid-shift ends on the true reading, with no late jump, and the tear plays out (${rate}x)`, { tag: "@timing" }, async ({ page }) => {
    await boot(page);
    await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate });
    // Leave the hold the moment the tear starts, from inside the page, so no round trip delays it. Time
    // the tear on the page's own clock, from the filter going on to it coming off, and watch the bar
    // for 2 s after leaving. Nothing here waits on a timer for its result.
    const left = page.evaluate(([room, watchMs]) => new Promise<{ seen: string[]; length: number | null }>((res) => {
      const canvas = document.querySelector("canvas")!;
      const on = () => canvas.style.filter.includes("shift-tear");
      const seen: string[] = [];
      new MutationObserver((_, mo) => {
        if (!on()) return;
        mo.disconnect();
        const started = performance.now();
        void (window as unknown as { __hudGo: (href: string) => Promise<number> }).__hudGo(room); // leaving is clicking Room
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
          res({ seen, length: on() ? null : length });
        };
        tick();
      }).observe(canvas, { attributes: true, attributeFilter: ["style"] });
    }), [hudHref(0), WATCH_AFTER_LEAVING_MS] as const);
    // Click Work without waiting for the landing: the in-page watcher leaves for Room the moment the tear starts, which
    // can come before a round trip to the page could see Work's aria-current.
    await clickLink(page, 1);
    const { seen, length } = await left;
    await landedAt(page, 0); // the visitor did leave: back in the room
    expect(length, `the tear never came off in the ${WATCH_AFTER_LEAVING_MS} ms after leaving`).not.toBeNull();
    // the tear plays out its own length after leaving, never cut short
    console.log(`leaving-16x length ${length!.toFixed(0)} ms`);
    expect(length!, "the tear's length after leaving").toBeGreaterThan(SHIFT_SECONDS.full * 500);
    expect(seen.filter((d) => d !== "true")).toEqual([]); // never a scramble, and no jump to the reading at the end
    expect(await filterOn(page)).toBe(false); // and it did snap back
  });
}

