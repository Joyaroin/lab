import { describe, it, expect } from "vitest";
import { easeGlow } from "./glow";

describe("easeGlow", () => {
  it("one 16 ms step from 0 towards 1 is less than half way", () => {
    const v = easeGlow(0, 1, 0.016);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(0.5);
  });
  it("eases out too, and arrives", () => {
    expect(easeGlow(1, 0, 0.016)).toBeGreaterThan(0.5);
    let v = 0;
    for (let i = 0; i < 100; i++) v = easeGlow(v, 1, 0.016);
    expect(v).toBe(1);
  });
});
