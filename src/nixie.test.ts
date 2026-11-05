import { describe, it, expect } from "vitest";
import { POWER_ON_SECONDS, powerOn } from "./nixie";

const digits = "0.000009";

describe("meter power-on", () => {
  it("starts dark, straight after the boot screen", () => {
    const s = powerOn(0, digits);
    expect(s.glow).toBe(0);
    expect(s.done).toBe(false);
  });
  it("flickers through other digits while warming up", () => {
    const mid = powerOn(POWER_ON_SECONDS * 0.4, digits, () => 0.99);
    expect(mid.glow).toBeGreaterThan(0);
    expect(mid.digits).not.toBe(digits);
    expect(mid.digits).toMatch(/^\d\.\d{6}$/); // keeps the decimal point
  });
  it("settles on the real reading at full glow, and stays there", () => {
    for (const t of [POWER_ON_SECONDS, POWER_ON_SECONDS + 5]) {
      expect(powerOn(t, digits)).toEqual({ digits, glow: 1, done: true });
    }
  });
  it("settles tubes left to right", () => {
    const s = powerOn(POWER_ON_SECONDS * 0.85, "0.000000", () => 0.99);
    expect(s.digits.startsWith("0.0")).toBe(true);
    expect(s.digits.endsWith("9")).toBe(true);
  });
});
