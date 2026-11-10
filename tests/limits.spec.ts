import { expect, test, type Page } from "@playwright/test";
import { defineHudDriver, goBack, goTo, hudHref, stationIds, waitForCamera } from "./lib/page";
import { defineSnapWatcher } from "./lib/snap";
import { SHIFT_SECONDS } from "../src/nixie";

// Ticket 131: specs for stated limits that no other spec pins on its own. The limit's own numbers are written
// out here, not imported from src, because a spec that reads the limit from the code it checks passes
// when someone changes the limit: the limit (3 sudden changes) and its 1000 ms window. The lengths of the shift
// (SHIFT_SECONDS, FLIGHT_MS) are not the limit's own numbers: code here takes them from src, and comments only explain them
// (#220). These state CONTEXT.md and the tracker's numbers:
//   - a landing fires the shift at once, with no wait (#56, #85, #220); the power-on hold is pinned in src/shift/shift.test.ts
//   - a full tear starts and ends (#46, #57); its 0.4 s length is pinned in src/tear.test.ts, not here: real time can't tell a loaded 0.4 s from a 0.5 s
//   - no one-second window holds more than 3 sudden changes (#46, CONTEXT.md), in the room and on a Work page turn
//   - the short flick lasts about 0.25 s; its snap back is visible when the displacement scale reaches 0, at 0.85 of its length (#58, #124)
//   - a visit makes one call to GitHub (ADR-0003: 60 an hour is GitHub's, one call per visit is ours)
// Each one that depends on speed sweeps a range of speeds.
// The flash limit counts the snap back when it is visible: the displacement map's scale reaching 0 (tests/lib/snap.ts), at
// 340 ms into a full tear and about 212 ms into a short one. The filter coming off is later (400 and 250 ms) and is not what
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
  await page.addInitScript(defineHudDriver);
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

// A landing fires the shift at once, in the same check, with no wait: the tear's filter goes on within a few frames of the
// HUD link's aria-current (the landing), not a quarter of a second later as it did with the old wait (#220). AT_ONCE_MS is a
// few frames of room for React and the page's busy moments; a wait of 250 ms or more fails it. It is the first visit, played
// full; the power-on hold (1.4 s) is over by then, so it is the only thing that could hold the shift back.
const AT_ONCE_MS = 150;
test("a landing fires the shift at once", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  const landed = await page.evaluate(async (href) => {
    const go = (window as unknown as { __hudGo: (href: string) => Promise<number> }).__hudGo;
    return go(href); // flies there; resolves at the landing, on the page's clock
  }, hudHref(1));
  await expect.poll(async () => (await seen(page)).on.length, { timeout: 8_000 }).toBeGreaterThan(0);
  const s = await seen(page);
  const delay = s.t0 + s.on[0] - landed; // the page's clock on both sides
  expect(delay, "the tear started after the landing, not before it").toBeGreaterThan(-100);
  expect(delay, `the tear started ${delay.toFixed(0)} ms after the landing`).toBeLessThan(AT_ONCE_MS);
});

test("a full tear starts and ends", async ({ page }) => {
  await boot(page);
  await goTo(page, 1);
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(0);
  const s = await seen(page);
  const len = s.off[0] - s.on[0];
  // Only that the filter went on and then off. The length is not checked: the page's clock runs slow on a busy
  // machine, so a correct 0.4 s tear and a broken 0.5 s one can't be told apart here (src/tear.test.ts pins 0.4).
  expect(s.on.length).toBeGreaterThan(0);
  expect(len).toBeGreaterThan(0);
  expect(len).toBeLessThan(8_000); // the poll's own limit
});

// Hopping between stations, tear after tear, swept over how long each stay is (timed from the landing). A landing is a flight
// (FLIGHT_MS, 900 ms) after the last one's stay, and a full tear's changes fall at 0, 200 and 340 ms, so a
// stay of under about 100 ms puts a fourth change into one real second: [200, 1200) then holds 200, 340, and the
// second tear's start and re-cut. Without the flash limit those short stays break
// it; the limit (its window is 1100 ms) holds back the landings under about 200 ms of stay. So the short stays are the cases
// that fail when the limiter is loosened; the longer ones show it lets tears through when they fit.
// "cold" hops through every station, so each arrival is a first visit and plays the full tear (3 changes: on, re-cut, snap back).
// "warm" hops between two stations that have already played out, so each arrival is a return and plays the short flick
// (2 changes), so the warm cases check that back-to-back returns stay within the limit too (the shortest warm stay fails
// as well when the limiter is loosened to 4: ticket 220's one break run).
// Each hop is a HUD click, and each stay is timed from the landing: the flights are on top of the stay.
const hop = (page: Page, stops: number[], every: number) => page.evaluate(async ([hrefs, every]) => {
  const go = (window as unknown as { __hudGo: (href: string) => Promise<number> }).__hudGo;
  const end = performance.now() + 6_000;
  for (let k = 0; performance.now() < end; k++) {
    await go(hrefs[k % hrefs.length]);
    await new Promise((r) => setTimeout(r, every));
  }
}, [stops.map(hudHref), every] as const);
for (const [kind, stays] of [["cold", [0, 40, 150, 450]], ["warm", [0, 150, 450]]] as const) {
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
      await hop(page, kind === "cold" ? stationIds.map((_, i) => i + 1) : [1, 2], stay);
      await page.waitForTimeout(1500);
      const s = await seen(page);
      const since = (ts: number[]) => ts.slice(kind === "warm" ? before : 0); // warm: only what the hopping did
      expect(s.on.length - (kind === "warm" ? before : 0), "it did tear").toBeGreaterThan(0);
      expect(busiest([...since(s.on), ...since(s.cuts), ...since(s.snaps)])).toBeLessThanOrEqual(3);
    });
  }
}

// The short flick on a return starts and ends: the filter goes on, then comes off on the first frame after the tear.
// Its length (SHIFT_SECONDS.short, 0.25 s) is pinned in src/shift/shift.test.ts, so this spec sets no tight
// bound, which a busy machine could break either way. It only checks the flick lasted longer than half of that, so a flick cut
// short on the return still fails, at any frame rate. The visible snap back comes about 212 ms in (the displacement scale
// reaching 0) and is what the flash limit counts; tests/shift.spec.ts records its time.
test("a return plays the short flick: it starts and ends", { tag: "@timing" }, async ({ page }) => {
  await boot(page);
  await goTo(page, 1);
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(0); // the first visit played out
  await goBack(page);
  await page.waitForTimeout(500);
  await goTo(page, 1);
  await expect.poll(async () => (await seen(page)).off.length, { timeout: 8_000 }).toBeGreaterThan(1);
  const s = await seen(page);
  const len = s.off[1] - s.on[1];
  expect(len, "the return's flick").toBeGreaterThan(SHIFT_SECONDS.short * 500);
});

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
