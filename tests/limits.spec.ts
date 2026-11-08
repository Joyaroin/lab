import { expect, test, type Page } from "@playwright/test";
import { progressFor } from "../src/hold";
import { goBack, goTo, waitForCamera } from "./lib/page";
import { defineSnapWatcher } from "./lib/snap";

// Ticket 131: specs for stated limits that no other spec pins on its own. Every number here is written
// out, not imported from src, because a spec that reads the limit from the code it checks passes
// when someone changes the limit. These state CONTEXT.md and the tracker's numbers:
//   - the shift waits 250 ms inside a hold before it fires (#56, #85)
//   - a full tear starts and ends (#46, #57); its 0.8 s length is pinned in src/tear.test.ts, not here: real time can't tell a loaded 0.8 s from a 1.0 s
//   - no one-second window holds more than 3 sudden changes (#46, CONTEXT.md), in the room and on a Work page turn
//   - the short flick lasts about 0.25 s; its snap back is visible when the displacement scale reaches 0, at 0.85 of its length (#58, #124)
//   - a reload within 5 s of the tour mounting is a restore, not an arrival (#90)
//   - a visit makes one call to GitHub (ADR-0003: 60 an hour is GitHub's, one call per visit is ours)
// Each one that depends on speed sweeps a range of speeds.
// The flash limit counts the snap back when it is visible: the displacement map's scale reaching 0 (tests/lib/snap.ts), at
// 680 ms into a full tear and about 212 ms into a short one. The filter coming off is later (800 and 250 ms) and is not what
// the eye sees. Counting that was the mistake #124 corrected: the specs below count `snaps`, not `off`. (SNAP_BACK_MS, 40 ms,
// only delays a first visit's text; it is not the snap back.)
test.setTimeout(90_000);

/** What the tear did, in ms on the page's clock: when the canvas's filter went on and off, when the
 *  bands were re-cut (the filter's noise seed changing while it is on), and when the snap back was
 *  visible (the displacement scale reaching 0). */
type Seen = { on: number[]; off: number[]; cuts: number[]; snaps: number[]; t0: number };

/** Installs the observer once; it runs again in every document the page loads. */
async function watchTear(page: Page) {
  await page.addInitScript(defineSnapWatcher);
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const w = window as unknown as { __seen: Seen };
      const seen: Seen = { on: [], off: [], cuts: [], snaps: [], t0: performance.now() };
      w.__seen = seen;
      let on = false;
      const watch = () => {
        const canvas = document.querySelector("canvas"), turb = document.querySelector("filter#shift-tear feTurbulence");
        if (!canvas || !turb) return requestAnimationFrame(watch);
        let seed = turb.getAttribute("seed");
        if (!window.__watchSnap("shift-tear", () => seen.snaps.push(performance.now() - seen.t0))) return requestAnimationFrame(watch);
        const mo = new MutationObserver((records) => {
          for (const r of records) {
            const t = performance.now() - seen.t0;
            if (r.target === turb) {
              const now = turb.getAttribute("seed");
              if (now !== seed && on) seen.cuts.push(t);
              seed = now;
              continue;
            }
            const now = canvas.style.filter.includes("shift-tear");
            if (now && !on) seen.on.push(t);
            if (!now && on) seen.off.push(t);
            on = now;
          }
        });
        // one observer for both, so the records arrive in the order they happened
        mo.observe(canvas, { attributes: true, attributeFilter: ["style"] });
        mo.observe(turb, { attributes: true, attributeFilter: ["seed"] });
      };
      watch();
    });
  });
}
/** Loads the site with the Meter bar up and waits out its power-on (1.4 s, plus a margin), so no test starts inside it. */
async function load(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(1700);
}
async function boot(page: Page) {
  await watchTear(page);
  await load(page);
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);

/** The most changes in any window of 1000 ms that starts at one of them: the limit's own definition, counted here. */
const busiest = (times: number[]) => Math.max(0, ...times.map((a) => times.filter((b) => b >= a && b < a + 1000).length));

// A visitor who stays in a hold for less than 250 ms is passing through and gets no shift; one who stays
// longer gets it. Swept at 100 and 210 ms (inside the wait; 210 is past 180, where a wait of 150 plus the app's
// 30 ms of timer slack would already have fired) and at 400 and 600 ms (past it).
// The stay is at a station the visitor has already seen: arriving at a new one makes the page render its panel,
// which on a slow machine holds the page for longer than the stay itself.
// The page's clock can't be trusted to measure a short stay on a slow machine (a 100 ms stay was measured at
// 260 ms here, because the page was busy before our timer could run). What decides the case is the order of two
// timers: the app's check, due 250 ms (plus slack) after the arrival, and ours, due `wanted` ms after it. Both are
// set before the page gets busy, and a busy page still runs timers in the order they were due. So a stay of 210
// ms leaves before the check at any speed. A long stay is retried until its measured stay really is long.
for (const wanted of [100, 210, 400, 600]) {
  const fires = wanted >= 250;
  test(`staying ${wanted} ms in a hold ${fires ? "fires the shift" : "fires no shift"}`, { tag: "@timing" }, async ({ page }) => {
    await boot(page);
    await goTo(page, 1); // the first visit, played out
    await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(0);
    await goBack(page);
    let dwelt = NaN, shifts = 0;
    for (let attempt = 0; attempt < 3 && (attempt === 0 || (fires && dwelt <= 300)); attempt++) {
      await page.waitForTimeout(1_500); // the last try's tear is over
      const before = (await seen(page)).on.length;
      dwelt = await page.evaluate(([stop, ms]) => new Promise<number>((res) => {
        const to = (f: number) => { window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)); window.dispatchEvent(new Event("scroll")); };
        const t0 = performance.now();
        to(stop);
        setTimeout(() => { to(0); res(performance.now() - t0); }, ms);
      }), [progressFor(1), wanted] as const);
      await page.waitForTimeout(1_500); // longer than the wait plus the flick, so a late shift would show
      shifts = (await seen(page)).on.length - before;
    }
    if (fires) expect(shifts, `stayed ${dwelt.toFixed(0)} ms`).toBeGreaterThan(0);
    else expect(shifts, `left after ${wanted} ms (measured ${dwelt.toFixed(0)})`).toBe(0);
  });
}

test("a full tear starts and ends", async ({ page }) => {
  await boot(page);
  await goTo(page, 1);
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(0);
  const s = await seen(page);
  const len = s.off[0] - s.on[0];
  // Only that the filter went on and then off. The length is not checked: the page's clock runs slow on a busy
  // machine, so a correct 0.8 s tear and a broken 1.0 s one can't be told apart here (src/tear.test.ts pins 0.8).
  expect(s.on.length).toBeGreaterThan(0);
  expect(len).toBeGreaterThan(0);
  expect(len).toBeLessThan(8_000); // the poll's own limit
});

// Hopping between stations, staying a little over the wait at each, tear after tear. Swept over how long each stay is.
// "cold" hops through all six, so each arrival is a first visit and plays the full tear (3 changes: on, re-cut, snap back).
// "warm" hops between two stations that have already played out, so each arrival is a return and plays the short flick
// (2 changes). A full tear and a short flick can't both fit under 3 (the 4 changes of two short flicks would), so the
// warm cases are the ones that notice a limit raised from 3 to 4. (A cold 310 ms case was dropped: with the limit at 5 it
// passed, so it proved nothing. Hops much faster than the 250 ms wait mostly cancel before they fire.)
const hop = (page: Page, stops: number[], every: number) => page.evaluate(([stops, every]) => new Promise<void>((res) => {
  const to = (f: number) => { window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)); window.dispatchEvent(new Event("scroll")); };
  let k = 0;
  const next = () => to(stops[k++ % stops.length]);
  next();
  const id = setInterval(next, every);
  setTimeout(() => { clearInterval(id); res(); }, 6_000);
}), [stops, every] as const);
for (const [kind, stays] of [["cold", [450, 700, 1000]], ["warm", [450, 550, 650]]] as const) {
  for (const stay of stays) {
    test(`hopping ${kind === "cold" ? "between stations" : "back and forth between two visited stations"} every ${stay} ms never puts more than 3 sudden changes in a real second`, { tag: "@timing" }, async ({ page }) => {
      await boot(page);
      if (kind === "warm") {
        for (const k of [1, 2]) { // visit both, and let each play out and show its text
          await goTo(page, k);
          await page.waitForTimeout(3_000);
        }
        await goBack(page);
        await page.waitForTimeout(500);
      }
      const before = (await seen(page)).on.length;
      await hop(page, (kind === "cold" ? [1, 2, 3, 4, 5, 6] : [1, 2]).map(progressFor), stay);
      await page.waitForTimeout(1500);
      const s = await seen(page);
      const since = (ts: number[]) => ts.slice(kind === "warm" ? before : 0); // warm: only what the hopping did
      expect(s.on.length - (kind === "warm" ? before : 0), "it did tear").toBeGreaterThan(0);
      expect(busiest([...since(s.on), ...since(s.cuts), ...since(s.snaps)])).toBeLessThanOrEqual(3);
    });
  }
}

// The short flick on a return lasts about 0.25 s: 250 ms of tear, then the filter comes off on the first frame after it.
// The bounds leave 100 ms above 290 for frame timing (a slow machine only lengthens it). A flick of 0.15 s measures about
// 190 and one of 0.4 s about 440. The visible snap back comes before that, about 212 ms in (the displacement scale reaching 0),
// and is what the flash limit counts; tests/shift.spec.ts records its time.
test("a return plays the short flick: about 0.25 s", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await goTo(page, 1);
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(0); // the first visit played out
  await goBack(page);
  await page.waitForTimeout(500);
  await goTo(page, 1);
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(1);
  const s = await seen(page);
  const len = s.off[1] - s.on[1];
  expect(len, "the return's flick").toBeGreaterThan(250);
  expect(len, "the return's flick").toBeLessThan(390);
});

// A reload puts the scroll position back just after the tour mounts; the first move off the top within 5 s
// of that is the restore (no shift), later than that it is an arrival (a shift). Real time: 3 s and 7 s,
// 2 s either side of the edge. The bar appearing is about when the tour mounts.
for (const [after, fires] of [[3_000, false], [7_000, true]] as const) {
  test(`after a reload, going into a hold ${after / 1000} s later ${fires ? "is an arrival: it shifts" : "is the restore: no shift"}`, { tag: "@timing" }, async ({ page }) => {
    await boot(page);
    await page.reload();
    await expect(page.locator("[data-meter-bar]")).toBeVisible();
    await page.waitForTimeout(after);
    await goTo(page, 1);
    await page.waitForTimeout(2_000); // past the wait, and into the tear if there is one
    const s = await seen(page);
    if (fires) expect(s.on.length, "it shifted").toBeGreaterThan(0);
    else expect(s.on, "no shift").toEqual([]);
  });
}

// The limit of 3 counts a Work page turn too: it flicks the Work TV only, so its changes are the panel's filter going on
// and its snap back. Turning the page every `every` ms, never more than 3 changes in a real second.
for (const every of [400, 700]) {
  test(`turning the Work page every ${every} ms never puts more than 3 sudden changes in a real second`, { tag: "@timing" }, async ({ page }) => {
    await page.addInitScript(defineSnapWatcher);
    await page.goto("/");
    await expect(page.getByLabel("Boot log")).toBeHidden();
    await page.getByRole("navigation", { name: "HUD" }).locator('a[href="#work"]').click();
    const panel = page.locator('[data-screen="work"]');
    await expect(panel).toHaveCSS("opacity", "1");
    await waitForCamera(page);
    await expect.poll(() => page.locator("canvas").evaluate((e) => (e as HTMLElement).style.filter), { timeout: 10_000 }).toBe("");
    const changes = await page.evaluate((every) => new Promise<number[]>((res) => {
      const el = document.querySelector<HTMLElement>('[data-screen="work"]')!;
      const ids = ["barracuda", "solace"];
      const t0 = performance.now(), times: number[] = [];
      let on = false;
      new MutationObserver(() => {
        const now = el.style.filter.includes("shift-tear");
        if (now && !on) times.push(performance.now() - t0); // the flick starting; its end is the snap back, below
        on = now;
      }).observe(el, { attributes: true, attributeFilter: ["style"] });
      window.__watchSnap("shift-tear-page", () => times.push(performance.now() - t0));
      let k = 0;
      const turn = () => el.querySelector<HTMLElement>(`button[data-page="${ids[k++ % 2]}"]`)!.click();
      turn();
      const id = setInterval(turn, every);
      setTimeout(() => { clearInterval(id); setTimeout(() => res(times), 1_500); }, 6_000);
    }), every);
    expect(changes.length, "the turns flicked").toBeGreaterThan(1);
    expect(busiest(changes)).toBeLessThanOrEqual(3);
  });
}

// ADR-0003: GitHub allows 60 calls an hour. A visit makes one, and nothing makes more later.
test("a visit makes one call to the GitHub API", async ({ page }) => {
  let calls = 0;
  await page.route("https://api.github.com/**", (r) => { calls++; return r.fulfill({ status: 403, json: {} }); });
  await boot(page);
  await goTo(page, 3);
  await page.waitForTimeout(3_000);
  expect(calls).toBe(1);
});
