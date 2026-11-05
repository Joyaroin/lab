import { describe, it, expect } from "vitest";
import { createShifts, DWELL_MS, MAX_SHIFTS_PER_SECOND, SNAP_BACK_MS } from "./shift";
import { SHIFT_SECONDS } from "./nixie";
import { holdSpan, progressFor, STATION_COUNT } from "./hold";

const mid = (i: number) => progressFor(i);
const settle = (s: ReturnType<typeof createShifts>, p: number, t: number) => {
  s.observe(p, t);
  return s.observe(p, t + DWELL_MS);
};

describe("the shift", () => {
  it("fires in full on arrival inside a hold, once the visitor stays", () => {
    const s = createShifts();
    expect(s.observe(mid(1), 0)).toBeNull(); // just arrived: not yet
    expect(s.observe(mid(1), DWELL_MS)).toBe("full");
    expect(s.observe(mid(1), DWELL_MS * 5)).toBeNull(); // only once per arrival
  });
  it("is short on a return to a visited station", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full");
    s.observe(mid(2), 5000); // away, in another hold, unsettled
    expect(s.observe(0, 5001)).toBeNull();
    expect(settle(s, mid(1), 6000)).toBe("short");
  });
  it("is full for each station's first visit", () => {
    const s = createShifts();
    expect(settle(s, mid(1), 0)).toBe("full");
    expect(settle(s, mid(2), 3000)).toBe("full");
  });
  it("does not fire when scrolling quickly through a station", () => {
    const s = createShifts();
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i);
      expect(s.observe(a + 1e-6, i * 1000)).toBeNull();
      expect(s.observe(b - 1e-6, i * 1000 + DWELL_MS / 4)).toBeNull();
      expect(s.observe(b + 0.02, i * 1000 + DWELL_MS / 2)).toBeNull();
    }
    // and passing through didn't count as a visit
    expect(settle(s, mid(1), 20000)).toBe("full");
  });
  it("never fires at the entrance", () => {
    const s = createShifts();
    expect(settle(s, 0, 0)).toBeNull();
    expect(settle(s, 0.0001, 5000)).toBeNull();
  });
  it("never fires with reduced motion", () => {
    const s = createShifts(true);
    expect(settle(s, mid(1), 0)).toBeNull();
    expect(settle(s, mid(2), 3000)).toBeNull();
  });
  it("keeps visits in memory only", () => {
    const a = createShifts();
    expect(settle(a, mid(1), 0)).toBe("full");
    expect(settle(createShifts(), mid(1), 0)).toBe("full"); // a reload is a new tracker
    
  });
});

describe("limiting flashes", () => {
  it("never starts more than 3 shifts in any second, however fast the visitor moves", () => {
    const s = createShifts();
    const starts: number[] = [];
    // hop between the stations every 260 ms (just past the dwell) for 20 s, over and over
    for (let t = 0, k = 0; t < 20_000; t += DWELL_MS + 10, k++) {
      const st = (k % STATION_COUNT) + 1;
      s.observe(mid(st), t);
      if (s.observe(mid(st), t + DWELL_MS)) starts.push(t + DWELL_MS);
    }
    expect(starts.length).toBeGreaterThan(10); // it still fires when it can
    for (const a of starts) {
      expect(starts.filter((b) => b >= a && b < a + 1000).length).toBeLessThanOrEqual(MAX_SHIFTS_PER_SECOND);
    }
  });
  it("shows the text at once when a shift is held back, and does not count that visit", () => {
    const s = createShifts();
    for (let k = 0; k < MAX_SHIFTS_PER_SECOND; k++) expect(settle(s, mid(k + 1), k * 300)).not.toBeNull();
    const t = 3 * 300 + 10; // 3 shifts in the last second
    expect(settle(s, mid(4), t)).toBeNull();
    expect(s.ready(4, mid(4), t + DWELL_MS)).toBe(true);
    s.observe(0, t + 3000); // away, then back
    expect(settle(s, mid(4), t + 5000)).toBe("full"); // later, still a first visit
  });
});

describe("text resolving out of the shift", () => {
  it("is held back from arrival until the shift ends, then shows", () => {
    const s = createShifts();
    s.observe(mid(1), 0);
    expect(s.ready(1, mid(1), 10)).toBe(false);
    expect(s.observe(mid(1), DWELL_MS)).toBe("full");
    const end = DWELL_MS + SHIFT_SECONDS.full * 1000 + SNAP_BACK_MS; // after the tear has snapped back
    expect(s.ready(1, mid(1), end - 1)).toBe(false);
    expect(s.ready(1, mid(1), end)).toBe(true);
  });
  it("shows sooner after a short flick", () => {
    const s = createShifts();
    settle(s, mid(1), 0);
    s.observe(0, 5000);
    s.observe(mid(1), 6000);
    expect(s.observe(mid(1), 6000 + DWELL_MS)).toBe("short");
    expect(s.ready(1, mid(1), 6000 + DWELL_MS + SHIFT_SECONDS.short * 1000 + SNAP_BACK_MS)).toBe(true);
  });
  it("stays through the fade out on leaving, and is held back again on the next arrival", () => {
    const s = createShifts();
    settle(s, mid(1), 0);
    expect(s.ready(1, mid(1), 5000)).toBe(true);
    const [, end] = holdSpan(1);
    s.observe(end + 0.005, 6000);
    expect(s.ready(1, end + 0.005, 6000)).toBe(true); // still fading out, not blanked
    expect(s.ready(1, 0, 7000)).toBe(false); // gone
    s.observe(holdSpan(1)[0] + 1e-4, 8000);
    expect(s.ready(1, holdSpan(1)[0] + 1e-4, 8000)).toBe(false);
  });
  it("shows at once with reduced motion", () => {
    const s = createShifts(true);
    expect(s.ready(1, mid(1), 0)).toBe(true);
  });
});

describe("the power-on and a reload", () => {
  it("waits for the power-on, then plays the shift if the visitor is still there", () => {
    const s = createShifts(false, { quietUntil: 1400 });
    s.observe(mid(1), 0);
    expect(s.observe(mid(1), DWELL_MS)).toBeNull(); // the tubes are still warming up
    expect(s.observe(mid(1), 1399)).toBeNull();
    expect(s.observe(mid(1), 1400)).toBe("full");
  });
  it("does not play a shift for the hold the page was reloaded in, and shows its text", () => {
    const s = createShifts(false, { startProgress: mid(2) });
    expect(s.ready(2, mid(2), 0)).toBe(true);
    expect(settle(s, mid(2), 0)).toBeNull();
    expect(settle(s, mid(2), 1000)).toBeNull();
    // leaving and coming back is an arrival like any other, and nothing was remembered
    s.observe(0, 2000);
    expect(settle(s, mid(2), 3000)).toBe("full");
  });
  it("treats a scroll position the page restored as a reload, not an arrival", () => {
    const s = createShifts();
    s.observe(0, 0);
    s.restore(mid(4)); // the browser put the visitor back after the reload
    expect(s.ready(4, mid(4), 0)).toBe(true);
    expect(settle(s, mid(4), 100)).toBeNull();
    s.observe(0, 2000);
    expect(settle(s, mid(4), 3000)).toBe("full");
  });
  it("reports where the visitor is, so a shift can end when they leave", () => {
    const s = createShifts();
    s.observe(mid(3), 0);
    expect(s.station).toBe(3);
    s.observe(holdSpan(3)[1] + 0.02, 100);
    expect(s.station).toBe(0);
  });
});
