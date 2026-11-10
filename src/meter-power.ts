import { runFrames, type FrameOptions } from "./frames";
import { powerOn, type PowerOn } from "./nixie";

// The device's power-on (#229): the tubes, the numerals over them, the dot and the keys come up from dark together,
// from `powerOn` in src/nixie.ts (the same one the desk meter plays). The one number that says how far the device is
// lit is `glow`: the opacity of the tubes' light, of the numerals and the dot, and of the keys' pictures.
// The clock is the page's (`performance.now()`): `startedAt` is when the boot screen began to go, so the device,
// whenever its images arrive, is as lit as the clock says; it never starts the power-on over.

/** How lit the device is at `nowMs`. `startedAt` is null until the boot screen has begun to go (dark). Under reduced
 *  motion it is lit at once. Past the power-on's length it is lit, with the real reading. */
export function deviceLit(startedAt: number | null, nowMs: number, reduced: boolean, reading: string, rand?: () => number): PowerOn {
  if (reduced) return powerOn(Infinity, reading);
  if (startedAt === null) return { ...powerOn(0, reading, rand), digits: reading };
  return powerOn((nowMs - startedAt) / 1000, reading, rand);
}

/** Calls `emit` with the device's state now and on each frame, until it is lit. Asks for no frame once lit, so a
 *  device that appears after the power-on, or under reduced motion, is lit with one call and nothing more.
 *  `reading` is asked each time. Returns the stop. Not started while `startedAt` is null: the caller starts it
 *  again when it is set. */
export function watchPowerOn(
  startedAt: number | null, reduced: boolean, reading: () => string, emit: (s: PowerOn) => void,
  opts: Pick<FrameOptions, "now" | "request" | "cancel"> = {},
): () => void {
  const now = opts.now ?? (() => performance.now());
  return runFrames(() => {
    const s = deviceLit(startedAt, now(), reduced, reading());
    emit(s);
    return s.done || startedAt === null;
  }, opts);
}

/** The opacity of each part of the device at a state of the power-on: the tubes' light, the numerals and the dot
 *  over them, and the drawn keys. All one number, so they come up from dark together and the device starts dark
 *  (the base has no keys and no light of its own). */
export const deviceOpacity = (s: PowerOn) => ({ light: s.glow, numerals: s.glow, keys: s.glow });
