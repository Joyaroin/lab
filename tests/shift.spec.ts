import { test, expect, type Page } from "@playwright/test";
import { holdSpan, progressFor } from "../src/hold";
import { DWELL_MS } from "../src/shift";

test.setTimeout(60_000);

const bar = (page: Page) => page.locator("[data-meter-bar] .meter-digits");
const tubes = (page: Page) => page.locator("[data-meter-bar] [data-testid=tube]").allTextContents().then((t) => t.join(""));
const label = (page: Page) => bar(page).getAttribute("aria-label");

async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(1_000); // power-on
}
const scrollTo = (page: Page, progress: number) => page.evaluate((p) => {
  window.scrollTo(0, p * (document.documentElement.scrollHeight - window.innerHeight));
}, progress);

// Samples the bar's digits every frame for `ms`.
const sample = (page: Page, ms: number) => page.evaluate((ms) => new Promise<string[]>((res) => {
  const seen: string[] = [], t0 = performance.now();
  const tick = () => {
    seen.push([...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join(""));
    performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(seen);
  };
  tick();
}), ms);

test("arriving in a hold scrambles the meter, which ends on the true reading", async ({ page }) => {
  await boot(page);
  const seen = page.evaluate(() => new Promise<string[]>((res) => {
    const out: string[] = [];
    const read = () => [...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join("");
    const mo = new MutationObserver(() => out.push(read()));
    mo.observe(document.querySelector("[data-meter-bar]")!, { childList: true, subtree: true, characterData: true });
    setTimeout(() => { mo.disconnect(); res(out); }, 6_000);
  }));
  await scrollTo(page, progressFor(1));
  const digitsSeen = await seen;
  const true_ = (await label(page))!.replace("Reading ", "").replace(".", "");
  expect(new Set(digitsSeen).size).toBeGreaterThan(2); // it scrambled
  await expect.poll(() => tubes(page), { timeout: 10_000 }).toBe(true_); // and settled on the reading
});

test("scrolling quickly through a station does not scramble the meter", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(1500); // first visit, done
  await scrollTo(page, progressFor(2) - 0.12);
  await page.waitForTimeout(1200); // travelling: reading is fixed, no shift yet

  // The whole scroll-through happens in one task in the page, so it can't depend on the frame
  // rate or on Playwright round trips: arrive at station 2, spend 50 ms there on the page's own
  // clock, move on into the travel before station 3. Real scroll events come once per frame (200 ms or more on
  // software WebGL), so each scroll is followed by an event we dispatch ourselves, which the app
  // handles at once. Then watch the bar for 1.5 s. Outside a hold no shift can fire, so anything
  // but the true reading on the tubes came from station 2, and a slow frame can't cause it.
  const away = (progressFor(2) + progressFor(3)) / 2;
  expect(away).toBeGreaterThan(holdSpan(2)[1]);
  expect(away).toBeLessThan(holdSpan(3)[0]);
  const { seen, stillThere } = await page.evaluate(([p2, p3]) => new Promise<{ seen: string[]; stillThere: boolean }>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const to = (p: number) => { window.scrollTo(0, p * max()); window.dispatchEvent(new Event("scroll")); };
    // A scramble is a moment when the tubes differ from the true reading in the label.
    const read = () => {
      const tubes = [...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join("");
      const truth = document.querySelector("[data-meter-bar] .meter-digits")!.getAttribute("aria-label")!.replace("Reading ", "").replace(".", "");
      return tubes === truth ? "true" : tubes;
    };
    const seen = [read()];
    const mo = new MutationObserver(() => seen.push(read()));
    mo.observe(document.querySelector("[data-meter-bar]")!, { childList: true, subtree: true, characterData: true });
    to(p2);
    for (const t0 = performance.now(); performance.now() - t0 < 50;); // 50 ms at station 2
    to(p3);
    setTimeout(() => {
      mo.disconnect();
      res({ seen, stillThere: Math.abs(window.scrollY / max() - p3) < 0.01 });
    }, 1_500);
  }), [progressFor(2), away] as const);
  expect(stillThere).toBe(true);
  // The reading may move on, but the tubes never show random digits.
  expect(seen.filter((d) => d !== "true")).toEqual([]);
});

test("reduced motion shows the plain reading with no scramble", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(100);
  const seen = await sample(page, DWELL_MS + 1500);
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe((await label(page))!.replace("Reading ", "").replace(".", ""));
});

// --- the tear, and the text resolving out of it ---

const panel = (page: Page, id: string) => page.locator(`[data-screen="${id}"]`);
const filterOn = (page: Page) => page.evaluate(() => document.querySelector("canvas")!.style.filter.includes("shift-tear"));

// Watches the canvas's filter and the panel's opacity from inside the page, on its own clock.
const watch = (page: Page, id: string) => page.evaluate((id) => {
  const w = window as unknown as { __w: { starts: number[]; ends: number[]; shown: number | null; t0: number; litDuringTear: boolean; visibleDuringTear: boolean; slowestFrame: number } };
  const canvas = document.querySelector("canvas")!, el = document.querySelector<HTMLElement>(`[data-screen="${id}"]`)!;
  const st = { starts: [] as number[], ends: [] as number[], shown: null as number | null, t0: performance.now(), litDuringTear: false, visibleDuringTear: true, slowestFrame: 0 };
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
    if (on) { // while the tear is on: is the text out yet, and is it still in the page for readers?
      if (Number(el.style.opacity) > 0.01) st.litDuringTear = true;
      if (el.style.visibility !== "visible") st.visibleDuringTear = false;
    }
    if (st.shown === null && Number(el.style.opacity) > 0.99 && el.style.visibility === "visible") st.shown = performance.now() - st.t0;
    requestAnimationFrame(frame);
  };
  frame();
}, id);
type Watched = { starts: number[]; ends: number[]; shown: number | null; slowestFrame: number; litDuringTear: boolean; visibleDuringTear: boolean };
const watched = (page: Page) => page.evaluate(() => (window as unknown as { __w: Watched }).__w);
// the shift has played and the text is out
const settled = (page: Page) => expect.poll(async () => { const w = await watched(page); return w.shown !== null && w.ends.length > 0; }, { timeout: 8_000 }).toBe(true);

// When the text must be fully out, counted from arrival: the design (250 ms dwell + the tear + the
// snap back, 1090 ms on a first visit and 540 ms on a return; the exact numbers are pinned in
// shift.test.ts), plus the 220 ms the text takes to resolve, plus what this machine adds. The
// machine's share is judged by its own slowest frame, because the dwell timer, React and the tear
// each wait behind a frame: up to 4 of them, and 300 ms over. So a slow runner can't fail it, but
// text that is really late (a second or more past that) does.
const lateBy = (design: number, w: Watched) => design + 220 + 4 * w.slowestFrame + 300;

test("a first visit tears the view for about 0.8 s, and the text resolves as it ends", async ({ page }) => {
  await boot(page);
  await watch(page, "work");
  await scrollTo(page, progressFor(1));
  await settled(page);
  expect(await panel(page, "work").innerText()).not.toBe(""); // in the page throughout, selectable and findable
  const w = await watched(page);
  expect(w.starts).toHaveLength(1);
  expect(w.litDuringTear).toBe(false); // the text was out of sight while the view tore...
  expect(w.visibleDuringTear).toBe(true); // ...but never hidden from readers
  const len = w.ends[0] - w.starts[0];
  expect(len).toBeGreaterThan(600);
  expect(len).toBeLessThan(1200 + 2 * w.slowestFrame); // the filter comes off on the first frame after 0.8 s
  expect(w.shown! - w.starts[0]).toBeGreaterThan(len - 100); // not before the tear ends...
  expect(w.shown! - w.starts[0]).toBeLessThan(len + 600 + 2 * w.slowestFrame); // ...and soon after
  expect(w.shown!).toBeLessThan(lateBy(1_090, w)); // see lateBy
  expect(await filterOn(page)).toBe(false);
});

test("a return is a short flick, and its text is back almost at once", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(2500);
  await scrollTo(page, 0);
  await page.waitForTimeout(500);
  await watch(page, "work");
  await scrollTo(page, progressFor(1));
  await settled(page);
  const w = await watched(page);
  expect(w.ends[0] - w.starts[0]).toBeLessThan(600 + 2 * w.slowestFrame);
  expect(w.shown! - w.starts[0]).toBeLessThan(w.ends[0] - w.starts[0] + 600 + 2 * w.slowestFrame); // soon after the flick ends
  expect(w.shown!).toBeLessThan(lateBy(540, w)); // see lateBy
});

test("reduced motion gets no tear, and the text is there straight away", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await boot(page);
  await watch(page, "work");
  await scrollTo(page, progressFor(1));
  await expect.poll(async () => (await watched(page)).shown, { timeout: 5_000 }).not.toBeNull();
  await page.waitForTimeout(DWELL_MS + 1500);
  const w = await watched(page);
  expect(w.starts).toEqual([]);
  expect(await filterOn(page)).toBe(false);
  expect(w.shown!).toBeLessThan(700); // no held-back text: only the camera arriving
});

test("moving quickly between stations can't tear more than 3 times a second", async ({ page }) => {
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
  const { starts } = await watched(page);
  expect(starts.length).toBeGreaterThan(0); // it did tear
  for (const a of starts) expect(starts.filter((b) => b >= a && b < a + 1000).length).toBeLessThanOrEqual(3);
});

test("leaving mid-shift ends on the true reading, with no late jump", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await expect.poll(() => filterOn(page), { timeout: 5_000 }).toBe(true); // the shift is playing
  // leave the hold into travel, then watch the bar for 2 s
  const away = holdSpan(1)[1] + 0.03;
  const { seen, stillThere } = await page.evaluate(([p]) => new Promise<{ seen: string[]; stillThere: boolean }>((res) => {
    const max = () => document.documentElement.scrollHeight - window.innerHeight;
    const read = () => {
      const tubes = [...document.querySelectorAll("[data-meter-bar] [data-testid=tube]")].map((e) => e.textContent).join("");
      const truth = document.querySelector("[data-meter-bar] .meter-digits")!.getAttribute("aria-label")!.replace("Reading ", "").replace(".", "");
      return tubes === truth ? "true" : tubes;
    };
    window.scrollTo(0, p * max()); window.dispatchEvent(new Event("scroll"));
    const seen: string[] = [];
    const t0 = performance.now();
    const tick = () => { seen.push(read()); performance.now() - t0 < 2000 ? requestAnimationFrame(tick) : res({ seen, stillThere: Math.abs(window.scrollY / max() - p) < 0.01 }); };
    setTimeout(tick, 150); // a few frames for React to take the shift off
  }), [away] as const);
  expect(stillThere).toBe(true);
  expect(seen.filter((d) => d !== "true")).toEqual([]); // never a scramble, and no jump to the reading at the end
  expect(await filterOn(page)).toBe(false); // the tear snapped back too
});

test("a shift that arrives during the power-on plays once it is over", async ({ page }) => {
  // When the tour (and the bar) appeared, on the page's clock: the power-on takes 1.4 s from about then.
  await page.addInitScript(() => {
    new MutationObserver((_, mo) => {
      if (document.querySelector("[data-meter-bar]")) { (window as unknown as { __barAt: number }).__barAt = performance.now(); mo.disconnect(); }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await watch(page, "work");
  await scrollTo(page, progressFor(1)); // the tubes are still warming up
  await page.waitForTimeout(500);
  // Not before the power-on is over. (A busy machine can take longer than this to get here, so the
  // time is checked on the page's clock rather than assuming 500 ms is still inside the power-on.)
  const early = await page.evaluate(() => {
    const w = (window as unknown as { __w: { starts: number[]; t0: number }; __barAt: number });
    return w.__w.starts.filter((s) => w.__w.t0 + s < w.__barAt + 1_400 - 50);
  });
  expect(early).toEqual([]);
  await expect.poll(async () => (await watched(page)).starts.length, { timeout: 6_000 }).toBe(1); // then it plays
  await expect.poll(async () => (await watched(page)).shown, { timeout: 5_000 }).not.toBeNull();
});

test("reloading inside a hold is not an arrival: no shift, and the text shows", async ({ page }) => {
  await boot(page);
  await scrollTo(page, progressFor(1));
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await watch(page, "work");
  // Headless Chromium doesn't put the scroll position back here (the page is only tall once the room
  // is up), so do what browsers that do restore it do: scroll there, just after the tour mounts.
  await scrollTo(page, progressFor(1));
  await expect.poll(async () => (await watched(page)).shown, { timeout: 8_000 }).not.toBeNull();
  await page.waitForTimeout(DWELL_MS + 2000);
  expect((await watched(page)).starts).toEqual([]);
  expect(await filterOn(page)).toBe(false);
});
