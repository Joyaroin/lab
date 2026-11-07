// The meter's power-on: straight after the boot screen goes, the tubes warm up from dark,
// flicker through other digits, and settle left to right on the real reading. Time in, what
// the tubes show out, so the room can draw it and stop asking for frames once it is done.
export const POWER_ON_SECONDS = 1.4;

export type PowerOn = { digits: string; glow: number; done: boolean };

export function powerOn(t: number, digits: string, rand: () => number = Math.random): PowerOn {
  if (t >= POWER_ON_SECONDS) return { digits, glow: 1, done: true };
  const u = Math.max(0, t) / POWER_ON_SECONDS;
  const glow = Math.min(1, u * 2.2); // warms up in the first half
  return { digits: scramble(u, digits, 0.45, 0.5, rand), glow, done: false };
}

// Tubes show random digits until their turn, then lock on the real one, left to right. The first
// locks at `from` (0..1 of the run) and the last at `from + spread`.
function scramble(u: number, digits: string, from: number, spread: number, rand: () => number): string {
  const tubes = [...digits].filter((c) => c !== ".").length;
  let k = 0;
  return [...digits].map((c) => {
    if (c === ".") return c;
    const settleAt = from + (spread * k++) / tubes;
    return u >= settleAt ? c : String(Math.floor(rand() * 10) % 10);
  }).join("");
}

// The shift's lengths live in src/shift; the browser specs still read SHIFT_SECONDS from here.
import { SHIFT_SECONDS, type ShiftKind } from "./shift/lengths";
export { SHIFT_SECONDS };
export type { ShiftKind };

// Where in a shift's run the tubes start locking (`from`) and how much of it they take (`spread`).
const SHIFT_LOCK = { from: 0.3, spread: 0.6 } as const;

/** The digits to show `t` seconds into a shift. Past the end, always exactly `digits`. */
export function shiftDigits(t: number, digits: string, kind: ShiftKind, rand: () => number = Math.random): { digits: string; done: boolean } {
  const len = SHIFT_SECONDS[kind];
  if (!(t < len)) return { digits, done: true };
  const u = Math.max(0, t) / len;
  return { digits: scramble(u, digits, SHIFT_LOCK.from, SHIFT_LOCK.spread, rand), done: false };
}

/** What the bar shows: the scrambled digits only while a shift is on. The scramble is cleared in an
 *  effect, which can run a frame or more after the render that ends the shift (late on a slow
 *  device); until then a stale scramble must not show beside the new reading. */
export const digitsToShow = (reading: string, scrambled: string | null, shifting: boolean) =>
  shifting && scrambled !== null ? scrambled : reading;

/** What the app and tour tell the room about the meter: the digits to show, what a click does,
 *  and whether the boot screen has gone (`on`), which starts the power-on. `redraw` and `onAt`
 *  are the room's. */
export type MeterLink = {
  digits: string; next: () => void; on: boolean; onAt: number | null; redraw?: () => void;
};

export const meterLink = (): MeterLink => ({ digits: "0.000000", next: () => {}, on: false, onAt: null });
