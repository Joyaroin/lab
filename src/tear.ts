import { SHIFT_SECONDS, type ShiftKind } from "./nixie";

// The tear: horizontal bands of the view slip sideways with a red and cyan edge, then snap back.
// This is only the timing: how far the bands slip and how wide the edge is, `t` seconds in. The
// view draws it with an SVG filter (TearView.tsx). The full version re-cuts the bands twice (three
// poses in 0.8 s); the short one is a single flick. Neither changes pose more than 3 times a second.
export const TEAR_POSES = { full: 3, short: 1 } as const;
/** Largest slip and edge width, as a share of the window width. */
export const TEAR_SLIP = 0.06, TEAR_EDGE = 0.008;

export type Tear = { slip: number; edge: number; pose: number; done: boolean };

/** 0 when `t` is outside the effect, rising fast to 1 and easing back to 0 before the end, so the
 *  last moment is a clean snap back to the plain view. */
const envelope = (u: number) => (u <= 0 || u >= 0.85 ? 0 : u < 0.12 ? u / 0.12 : 1 - ((u - 0.12) / 0.73) ** 2 * 0.6);

export function tearAt(t: number, kind: ShiftKind): Tear {
  const len = SHIFT_SECONDS[kind];
  if (!(t < len)) return { slip: 0, edge: 0, pose: 0, done: true };
  const u = Math.max(0, t) / len;
  const e = envelope(u) * (kind === "full" ? 1 : 0.6);
  return { slip: TEAR_SLIP * e, edge: TEAR_EDGE * e, pose: Math.min(TEAR_POSES[kind] - 1, Math.floor(u * TEAR_POSES[kind])), done: false };
}
