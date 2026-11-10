import { describe, it, expect } from "vitest";
import { tearAt, TEAR_POSES, TEAR_SEEDS, TEAR_SLIP } from "./tear";
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
  });
  it("lasts 0.4 s for the full tear, pinned as a literal (the browser spec can't tell 0.4 from 0.5 on a loaded machine)", () => {
    expect(SHIFT_SECONDS.full).toBe(0.4);
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
  it("re-cuts the bands once in the full tear (two poses) and not at all in the flick", () => {
    const recuts = (kind: "full" | "short") => {
      const poses = run(kind).filter((x) => !x.done).map((x) => x.pose);
      return poses.filter((p, i) => i > 0 && p !== poses[i - 1]).length;
    };
    expect(TEAR_POSES).toEqual({ full: 2, short: 1 });
    expect(new Set(TEAR_SEEDS.full).size).toBe(TEAR_SEEDS.full.length); // and the re-cut is a different cut
    expect(recuts("full")).toBe(1);
    expect(recuts("short")).toBe(0);
  });
});
