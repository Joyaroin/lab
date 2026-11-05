// The meter's power-on: straight after the boot screen goes, the tubes warm up from dark,
// flicker through other digits, and settle left to right on the real reading. Time in, what
// the tubes show out, so the room can draw it and stop asking for frames once it is done.
export const POWER_ON_SECONDS = 1.4;

export type PowerOn = { digits: string; glow: number; done: boolean };

export function powerOn(t: number, digits: string, rand: () => number = Math.random): PowerOn {
  if (t >= POWER_ON_SECONDS) return { digits, glow: 1, done: true };
  const u = Math.max(0, t) / POWER_ON_SECONDS;
  const glow = Math.min(1, u * 2.2); // warms up in the first half
  const tubes = [...digits].filter((c) => c !== ".").length;
  let k = 0;
  const shown = [...digits].map((c) => {
    if (c === ".") return c;
    const settleAt = 0.45 + (0.5 * k++) / tubes; // left to right over the second half
    return u >= settleAt ? c : String(Math.floor(rand() * 10) % 10);
  }).join("");
  return { digits: shown, glow, done: false };
}

/** What the app and tour tell the room about the meter: the digits to show, what a click does,
 *  and whether the boot screen has gone (`on`), which starts the power-on. `redraw` and `onAt`
 *  are the room's. */
export type MeterLink = { digits: string; next: () => void; on: boolean; onAt: number | null; redraw?: () => void };

export const meterLink = (): MeterLink => ({ digits: "0.000000", next: () => {}, on: false, onAt: null });
