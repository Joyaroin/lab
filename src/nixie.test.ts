import { describe, it, expect } from "vitest";
import { POWER_ON_SECONDS, SHIFT_SECONDS, powerOn, shiftDigits, digitsToShow } from "./nixie";

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
  it("lasts 1.4 s: still warming at 1.39 s, done at 1.4 s (#71)", () => {
    expect(powerOn(1.39, digits).done).toBe(false);
    expect(powerOn(1.4, digits).done).toBe(true);
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

describe("when the tubes lock", () => {
  // Fixes SHIFT_LOCK through the public shiftDigits, so changing it fails here on purpose. The random
  // digits are 9 and the true ones 0, so a tube showing 0 has locked.
  const locked = (kind: "full" | "short", ms: number) =>
    [...shiftDigits(ms / 1000, "0.000000", kind, () => 0.99).digits.replace(".", "")].map((c) => c === "0");
  // 7 tubes: tube k locks at len * (0.3 + 0.6 * k / 7), in ms.
  const lockMs = { full: [120, 154.3, 188.6, 222.9, 257.1, 291.4, 325.7], short: [75, 96.4, 117.9, 139.3, 160.7, 182.1, 203.6] };
  it("locks 7 tubes left to right at fixed times, the last at 325.7 ms in a full shift", () => {
    for (const kind of ["full", "short"] as const) {
      lockMs[kind].forEach((at, k) => {
        const before = locked(kind, at - 0.2), after = locked(kind, at + 0.2);
        expect(before[k], `${kind} tube ${k} is still random just before ${at} ms`).toBe(false);
        expect(after[k], `${kind} tube ${k} has locked just after ${at} ms`).toBe(true);
      });
    }
  });
});

describe("what the bar shows", () => {
  it("shows the scramble only while a shift is on, so a stale one never sits beside the new reading", () => {
    expect(digitsToShow("0000213", "2622044", true)).toBe("2622044");
    expect(digitsToShow("0000213", "2622044", false)).toBe("0000213"); // the shift just ended, the effect hasn't cleared it yet
    expect(digitsToShow("0000213", null, true)).toBe("0000213");
  });
});
