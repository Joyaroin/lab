import { expect, test, type Page } from "@playwright/test";
import { progressFor } from "../src/hold";
import { POWER_ON_SECONDS } from "../src/nixie";
import { scrollToProgress } from "./lib/page";

// Ticket 131: specs for stated limits that no other spec pins on its own. Every number here is written
// out, not imported from src, because a spec that reads the limit from the code it checks passes
// when someone changes the limit. These state CONTEXT.md and the tracker's numbers:
//   - the shift waits 250 ms inside a hold before it fires (#56, #85)
//   - a full tear lasts about 0.8 s (#46, #57)
//   - no one-second window holds more than 3 sudden changes (#46, CONTEXT.md)
// Each one that depends on speed sweeps a range of speeds.
test.setTimeout(90_000);

/** What the tear did, in ms on the page's clock: when the canvas's filter went on, off, and when the
 *  bands were re-cut (the filter's noise seed changing while it is on). */
type Seen = { on: number[]; off: number[]; cuts: number[]; t0: number };

async function boot(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const w = window as unknown as { __seen: Seen };
      const seen: Seen = { on: [], off: [], cuts: [], t0: performance.now() };
      w.__seen = seen;
      let on = false;
      const watch = () => {
        const canvas = document.querySelector("canvas"), turb = document.querySelector("filter#shift-tear feTurbulence");
        if (!canvas || !turb) return requestAnimationFrame(watch);
        let seed = turb.getAttribute("seed");
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
  await page.goto("/");
  await expect(page.locator("[data-meter-bar]")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toBeHidden();
  await page.waitForTimeout(POWER_ON_SECONDS * 1000 + 300); // no test starts inside the meter's power-on
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);

/** The most changes in any window of 1000 ms that starts at one of them: the limit's own definition, counted here. */
const busiest = (times: number[]) => Math.max(0, ...times.map((a) => times.filter((b) => b >= a && b < a + 1000).length));

// A visitor who stays in a hold for less than 250 ms is passing through and gets no shift; one who stays
// longer gets it. Dwells are measured on the page's own clock, so a slow machine can't turn a short
// stay into a long one unnoticed: a case counts as the dwell it really had.
for (const wanted of [100, 175, 400, 600]) {
  test(`staying ${wanted} ms in a hold ${wanted < 250 ? "fires no shift" : "fires the shift"}`, async ({ page }) => {
    await boot(page);
    const dwelt = await page.evaluate(([stop, ms]) => new Promise<number>((res) => {
      const to = (f: number) => { window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)); window.dispatchEvent(new Event("scroll")); };
      const t0 = performance.now();
      to(stop);
      setTimeout(() => { to(0); res(performance.now() - t0); }, ms);
    }), [progressFor(1), wanted] as const);
    await page.waitForTimeout(1500); // longer than the wait plus the tear, so a late shift would show
    const s = await seen(page);
    if (dwelt < 235) expect(s.on, `left after ${dwelt.toFixed(0)} ms`).toEqual([]);
    else if (dwelt > 300) expect(s.on.length, `stayed ${dwelt.toFixed(0)} ms`).toBeGreaterThan(0);
  });
}

test("a full tear lasts about 0.8 s: not 0.6, not 1.0", async ({ page }) => {
  await boot(page);
  await scrollToProgress(page, progressFor(1));
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(0);
  const s = await seen(page);
  const len = s.off[0] - s.on[0];
  // 800 ms of tear and a 40 ms snap back, give or take the frames at each end (the machine's slowness only lengthens it).
  expect(len).toBeGreaterThan(740);
  expect(len).toBeLessThan(840 + 250);
});

// Hopping between stations, staying a little over the wait at each, tear after tear. Swept over how long each stay is.
for (const stay of [310, 450, 700, 1000]) {
  test(`hopping between stations every ${stay} ms never puts more than 3 sudden changes in a real second`, async ({ page }) => {
    await boot(page);
    await page.evaluate(([stops, every]) => new Promise<void>((res) => {
      const to = (f: number) => { window.scrollTo(0, f * (document.documentElement.scrollHeight - innerHeight)); window.dispatchEvent(new Event("scroll")); };
      let k = 0;
      const hop = () => to(stops[k++ % stops.length]);
      hop();
      const id = setInterval(hop, every);
      setTimeout(() => { clearInterval(id); res(); }, 6_000);
    }), [[1, 2, 3, 4, 5, 6].map(progressFor), stay] as const);
    await page.waitForTimeout(1500);
    const s = await seen(page);
    expect(s.on.length, "it did tear").toBeGreaterThan(0);
    expect(busiest([...s.on, ...s.cuts, ...s.off])).toBeLessThanOrEqual(3);
  });
}
