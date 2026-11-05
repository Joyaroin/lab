import { describe, it, expect } from "vitest";
import { createShifts, DWELL_MS } from "./shift";
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
