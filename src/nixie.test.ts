import { describe, it, expect } from "vitest";
import { POWER_ON_SECONDS, SHIFT_SECONDS, powerOn, shiftDigits, lastLockSeconds, digitsToShow } from "./nixie";

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

describe("meter shift", () => {
  it("scrambles, keeping the decimal point, then locks left to right", () => {
    const mid = shiftDigits(SHIFT_SECONDS.full * 0.1, digits, "full", () => 0.99);
    expect(mid.done).toBe(false);
    expect(mid.digits).toMatch(/^\d\.\d{6}$/);
    expect(mid.digits).not.toBe(digits);
    const late = shiftDigits(SHIFT_SECONDS.full * 0.5, "0.000000", "full", () => 0.99);
    expect(late.digits.startsWith("0.0")).toBe(true);
    expect(late.digits.endsWith("9")).toBe(true);
  });
  it("ends on the true reading every time, whatever the dice say", () => {
    for (const kind of ["full", "short"] as const) {
      for (const r of [0, 0.5, 0.99]) {
        expect(shiftDigits(SHIFT_SECONDS[kind], digits, kind, () => r)).toEqual({ digits, done: true });
      }
    }
  });
  it("the short one is a quick flick", () => {
    expect(SHIFT_SECONDS.short).toBeLessThanOrEqual(0.3);
    expect(SHIFT_SECONDS.short).toBeLessThan(SHIFT_SECONDS.full);
  });
});

describe("what the bar shows", () => {
  it("shows the scramble only while a shift is on, so a stale one never sits beside the new reading", () => {
    expect(digitsToShow("0000213", "2622044", true)).toBe("2622044");
    expect(digitsToShow("0000213", "2622044", false)).toBe("0000213"); // the shift just ended, the effect hasn't cleared it yet
    expect(digitsToShow("0000213", null, true)).toBe("0000213");
  });
});

describe("lastLockSeconds", () => {
  it("is when the last tube stops showing random digits in a shift", () => {
    const digits = "0.123456", rand = () => 0.99; // never equals a real digit here
    for (const kind of ["full", "short"] as const) {
      const at = lastLockSeconds(kind, 7);
      expect(shiftDigits(at - 0.001, digits, kind, rand).digits).not.toBe(digits);
      expect(shiftDigits(at + 0.001, digits, kind, rand).digits).toBe(digits);
    }
    expect(lastLockSeconds("full", 7) * 1000).toBeCloseTo(651.4, 0);
  });
});
