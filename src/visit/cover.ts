import { FADE_MS } from "./visit";

/** The cover may fall no faster than a fade's own half: 1 / 0.15 s per second. */
export const COVER_MAX_FALL_PER_SEC = 1 / (FADE_MS / 2000);
/** A frame longer than this (s) counts as this long, so a slow frame can't drop the cover far in one step. */
const MAX_STEP = 1 / 30;

/** The cover's opacity after a frame of `dt` seconds. It rises with `want` at once and falls towards it by at
 *  most COVER_MAX_FALL_PER_SEC * min(dt, 1/30), at most 0.22 a step. So if the visit's fade() ever drops
 *  sharply (from about 0.8 to 0), the screen still eases out over several frames instead of snapping (#160). */
export function nextCover(prev: number, want: number, dt: number): number {
  if (want >= prev) return want;
  return Math.max(want, prev - COVER_MAX_FALL_PER_SEC * Math.min(Math.max(dt, 0), MAX_STEP));
}
