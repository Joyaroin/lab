import { describe, it, expect } from "vitest";
import { panelStrength, PANEL_SHOWN, STATION_COUNT } from "./hold";
import type { Where } from "./where";

const at = (stop: number): Where => ({ kind: "at", stop });
const leg = (from: number, to: number, f: number): Where => ({ kind: "flying", from, to, f });

describe("panelStrength", () => {
  it("is full at the station and zero at every other stop", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      expect(panelStrength(at(i), i)).toBe(1);
      expect(panelStrength(at(i === 1 ? 2 : 1), i)).toBe(0);
    }
    expect(panelStrength(at(0), 1)).toBe(0);
  });
  it("fades out over the first part of a flight away, and in over the last part of a flight in", () => {
    let prev = 1;
    for (let k = 0; k <= 100; k++) {
      const s = panelStrength(leg(1, 2, k / 100), 1);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
      expect(panelStrength(leg(0, 1, 1 - k / 100), 1)).toBeCloseTo(s, 9); // the same distance from the station, arriving
    }
    expect(panelStrength(leg(1, 2, 0), 1)).toBe(1);
    expect(panelStrength(leg(1, 2, 0.5), 1)).toBe(0);
    expect(panelStrength(leg(1, 2, 0.5), 2)).toBe(0);
  });
  it("belongs to the two ends of a flight only, not to a station it passes between", () => {
    expect(panelStrength(leg(1, 3, 0.5), 2)).toBe(0);
  });
});

describe("PANEL_SHOWN", () => {
  it("is above zero, so a fully faded panel is hidden", () => {
    expect(PANEL_SHOWN).toBeGreaterThan(0);
    expect(panelStrength(leg(1, 2, 0.5), 1)).toBeLessThan(PANEL_SHOWN);
  });
});
