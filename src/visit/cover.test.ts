import { describe, it, expect } from "vitest";
import { nextCover, COVER_MAX_FALL_PER_SEC } from "./cover";

describe("nextCover", () => {
  it("rises with the wanted opacity at once", () => {
    expect(nextCover(0.2, 0.6, 0.016)).toBe(0.6);
  });

  it.each([0.016, 0.1, 1])("a second move during a fade (want 0.8 -> 0) never snaps, dt %s", (dt) => {
    const next = nextCover(0.8, 0, dt);
    expect(next).toBeGreaterThan(0.5);
    expect(0.8 - next).toBeLessThanOrEqual(0.25);
  });

  it("falls to 0 over several frames", () => {
    let c = 0.8;
    let steps = 0;
    while (c > 0 && steps < 100) { c = nextCover(c, 0, 0.016); steps++; }
    expect(c).toBe(0);
    expect(steps).toBeGreaterThan(5);
    expect(COVER_MAX_FALL_PER_SEC).toBeGreaterThan(0);
  });
});
