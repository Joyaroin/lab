import { describe, it, expect } from "vitest";
import { holdSpan, panelStrength, progressFor, STATION_COUNT } from "./hold";
import { whereAt } from "./where";

describe("whereAt", () => {
  it("is the entrance at progress 0", () => {
    expect(whereAt(0)).toEqual({ kind: "at", stop: 0 });
  });

  it("is at the station in the middle and at both edges of its hold", () => {
    for (let i = 1; i <= STATION_COUNT; i++) {
      const [a, b] = holdSpan(i);
      for (const p of [a, progressFor(i)]) expect(whereAt(p)).toEqual({ kind: "at", stop: i });
      // The hold's ends are inclusive, as holdSpan says: its last pixel is still at the station.
      expect(whereAt(b)).toEqual({ kind: "at", stop: i });
    }
  });

  it("is flying at a leg's start, middle and end", () => {
    for (let i = 0; i < STATION_COUNT; i++) {
      const start = i === 0 ? 0 : holdSpan(i)[1], end = holdSpan(i + 1)[0];
      expect(whereAt(start)).toEqual({ kind: "at", stop: i });
      const mid = whereAt((start + end) / 2);
      expect(mid).toMatchObject({ kind: "flying", from: i, to: i + 1 });
      expect(mid.kind === "flying" && mid.f).toBeCloseTo(0.5);
      expect(whereAt(end)).toEqual({ kind: "at", stop: i + 1 });
      const justBefore = whereAt(end - 1e-6);
      expect(justBefore.kind === "flying" && justBefore.f).toBeGreaterThan(0.99);
      const justAfter = whereAt(start + 1e-6);
      if (i > 0) expect(justAfter.kind === "flying" && justAfter.f).toBeLessThan(0.01);
    }
  });

  it("clamps progress outside 0..1", () => {
    expect(whereAt(-3)).toEqual(whereAt(0));
    expect(whereAt(7)).toEqual(whereAt(1));
    expect(whereAt(1)).toEqual({ kind: "at", stop: STATION_COUNT });
  });

  it("gives panelStrength the same answer as the progress it came from", () => {
    for (let n = 0; n <= 400; n++) {
      const p = n / 400;
      for (let i = 1; i <= STATION_COUNT; i++) expect(panelStrength(whereAt(p), i)).toBeCloseTo(panelStrength(p, i), 10);
    }
  });
});
