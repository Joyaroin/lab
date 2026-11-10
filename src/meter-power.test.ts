import { describe, it, expect } from "vitest";
import { deviceLit, deviceOpacity, watchPowerOn } from "./meter-power";
import { POWER_ON_SECONDS, type PowerOn } from "./nixie";

const reading = "0.000009";

/** A frame clock to step by hand: `tick(ms)` moves time on and runs the requested frame. */
function clock(start = 5000) {
  let t = start, pending: (() => void) | null = null, requested = 0;
  return {
    opts: { now: () => t, request: (cb: () => void) => { pending = cb; requested++; return requested; }, cancel: () => { pending = null; } },
    tick(ms: number) { t += ms; const cb = pending; pending = null; cb?.(); },
    set(ms: number) { t = ms; },
    get requested() { return requested; },
    get waiting() { return pending !== null; },
  };
}

describe("the device's power-on", () => {
  it("is dark before the boot screen goes", () => {
    expect(deviceLit(null, 9999, false, reading)).toMatchObject({ glow: 0, digits: reading, done: false });
  });

  it("goes from dark to lit through the power-on, the glow rising and then holding", () => {
    const c = clock();
    const seen: PowerOn[] = [];
    watchPowerOn(5000, false, () => reading, (s) => seen.push(s), c.opts);
    for (let i = 0; i < 20 && c.waiting; i++) c.tick(100); // 2 s of frames, at 100 ms
    expect(seen[0].glow).toBe(0);
    expect(seen.at(-1)).toEqual({ digits: reading, glow: 1, done: true });
    const glows = seen.map((s) => s.glow);
    expect(glows).toEqual([...glows].sort((a, b) => a - b)); // never dims
    expect(glows.some((g) => g > 0 && g < 1)).toBe(true);
    expect(c.waiting).toBe(false); // the frames stop once it is lit
  });

  it("is half warmed at the point powerOn says, and lit at its length", () => {
    const at = (s: number) => deviceLit(1000, 1000 + s * 1000, false, reading, () => 0.99);
    expect(at(0).glow).toBe(0);
    expect(at(POWER_ON_SECONDS * 0.25).glow).toBeCloseTo(0.55, 5);
    expect(at(POWER_ON_SECONDS - 0.01).done).toBe(false);
    expect(at(POWER_ON_SECONDS)).toEqual({ digits: reading, glow: 1, done: true });
  });

  it("is lit at once under reduced motion, with no frame asked for", () => {
    const c = clock();
    const seen: PowerOn[] = [];
    watchPowerOn(null, true, () => reading, (s) => seen.push(s), c.opts);
    expect(seen).toEqual([{ digits: reading, glow: 1, done: true }]);
    expect(c.requested).toBe(0);
    expect(deviceLit(5000, 5000, true, reading).glow).toBe(1); // even at the first instant of a power-on
  });

  it("appears lit when it starts after the power-on has finished, and does not play it again", () => {
    const c = clock(5000);
    const seen: PowerOn[] = [];
    // the images arrive 10 s after the boot screen began to go
    c.set(15_000);
    watchPowerOn(5000, false, () => reading, (s) => seen.push(s), c.opts);
    expect(seen).toEqual([{ digits: reading, glow: 1, done: true }]);
    expect(c.requested).toBe(0);
  });

  it("joins the power-on where the clock is when the images arrive part way", () => {
    const c = clock(5000);
    c.set(5000 + 700);
    const seen: PowerOn[] = [];
    watchPowerOn(5000, false, () => reading, (s) => seen.push(s), c.opts);
    expect(seen[0].glow).toBe(1 * Math.min(1, (0.7 / POWER_ON_SECONDS) * 2.2)); // not dark: it does not start over
    expect(seen[0].done).toBe(false);
    expect(c.waiting).toBe(true);
  });

  it("asks for no frames before the boot screen has gone", () => {
    const c = clock();
    watchPowerOn(null, false, () => reading, () => {}, c.opts);
    expect(c.requested).toBe(0);
  });

  it("stops asking for frames when stopped", () => {
    const c = clock();
    const seen: PowerOn[] = [];
    const stop = watchPowerOn(5000, false, () => reading, (s) => seen.push(s), c.opts);
    c.tick(100);
    stop();
    const n = seen.length;
    c.tick(100);
    expect(seen.length).toBe(n);
  });

  it("lights the tubes' light, the numerals and the keys by the same amount at every step", () => {
    for (const s of [0, 0.2, 0.5, 0.9, 1.3, 1.4, 3]) {
      const lit = deviceLit(0, s * 1000, false, reading);
      expect(deviceOpacity(lit)).toEqual({ light: lit.glow, numerals: lit.glow, keys: lit.glow });
    }
    expect(deviceOpacity(deviceLit(0, 0, false, reading))).toEqual({ light: 0, numerals: 0, keys: 0 }); // starts dark, keys too
    expect(deviceOpacity(deviceLit(0, 0, true, reading))).toEqual({ light: 1, numerals: 1, keys: 1 }); // reduced motion: lit at once
  });
});
