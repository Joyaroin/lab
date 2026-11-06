import { describe, it, expect } from "vitest";
import { tearAt, TEAR_POSES, TEAR_SLIP } from "./tear";
import { SHIFT_SECONDS } from "./nixie";

const run = (kind: "full" | "short") => Array.from({ length: 201 }, (_, k) => tearAt((k / 200) * SHIFT_SECONDS[kind], kind));

describe("the tear", () => {
  it("is the length of the shift, and past it is plainly nothing", () => {
    for (const kind of ["full", "short"] as const) {
      const end = SHIFT_SECONDS[kind];
      expect(tearAt(end, kind)).toMatchObject({ slip: 0, edge: 0, done: true });
      expect(tearAt(end * 3, kind).done).toBe(true);
      expect(tearAt(end * 0.5, kind).done).toBe(false);
    }
    expect(SHIFT_SECONDS.full).toBeCloseTo(0.8, 5);
  });
  it("slips and has a coloured edge in the middle, and snaps back before the end", () => {
    for (const kind of ["full", "short"] as const) {
      const r = run(kind);
      expect(Math.max(...r.map((x) => x.slip))).toBeGreaterThan(TEAR_SLIP * 0.5);
      expect(Math.max(...r.map((x) => x.edge))).toBeGreaterThan(0);
      expect(r[r.length - 2].slip).toBe(0); // already straight just before the end
      expect(Math.min(...r.map((x) => x.slip))).toBe(0);
    }
  });
  it("is smaller for the short flick", () => {
    expect(Math.max(...run("short").map((x) => x.slip))).toBeLessThan(Math.max(...run("full").map((x) => x.slip)));
  });
  it("re-cuts the bands at most twice, so the pattern never changes more than 3 times a second", () => {
    for (const kind of ["full", "short"] as const) {
      const poses = run(kind).filter((x) => !x.done).map((x) => x.pose);
      const changes = poses.filter((p, i) => i > 0 && p !== poses[i - 1]).length;
      expect(changes).toBeLessThanOrEqual(TEAR_POSES[kind] - 1);
      expect(changes / SHIFT_SECONDS[kind]).toBeLessThanOrEqual(3);
    }
  });
});
