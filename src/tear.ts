import { SHIFT_SECONDS, type ShiftKind } from "./shift/lengths";

// The tear: horizontal bands of the view slip sideways with a red and cyan edge, then snap back.
// This is only the timing: how far the bands slip and how wide the edge is, `t` seconds in. The
// view draws it with an SVG filter (TearView.tsx). The full version re-cuts the bands once (two
// poses in 0.4 s); the short one is a single flick. The flash limit (shift.ts) counts every jump:
// the start, the re-cut and the snap back (when the slip reaches 0, TEAR_SNAP_U, not the end of the length).
/** The noise seed of each pose's cut of the bands, per kind. The number of poses is the number of
 *  seeds, so the two cannot drift apart. */
export const TEAR_SEEDS = { full: [11, 4], short: [11] } as const satisfies Record<ShiftKind, readonly number[]>;
export const TEAR_POSES = { full: TEAR_SEEDS.full.length, short: TEAR_SEEDS.short.length } as const;
/** Largest slip and edge width, as a share of the window width. */
export const TEAR_SLIP = 0.06, TEAR_EDGE = 0.008;

export type Tear = { slip: number; edge: number; pose: number; done: boolean };

/** How far through its length the tear snaps back: its slip is 0 from here on (the filter stays on, drawing
 *  nothing, until the length ends). The one source for when the snap back is visible: the envelope and the
 *  shift's flash count (changeOffsets) both read it. */
export const TEAR_SNAP_U = 0.85;
/** When the snap back is visible, in ms after the tear starts. */
export const snapBackMs = (kind: ShiftKind) => SHIFT_SECONDS[kind] * 1000 * TEAR_SNAP_U;

/** 0 when `t` is outside the effect, rising fast to 1 and easing back to 0 before the end, so the
 *  last moment is a clean snap back to the plain view. */
const envelope = (u: number) => (u <= 0 || u >= TEAR_SNAP_U ? 0 : u < 0.12 ? u / 0.12 : 1 - ((u - 0.12) / 0.73) ** 2 * 0.6);

export function tearAt(t: number, kind: ShiftKind): Tear {
  const len = SHIFT_SECONDS[kind];
  if (!(t < len)) return { slip: 0, edge: 0, pose: 0, done: true };
  const u = Math.max(0, t) / len;
  const e = envelope(u) * (kind === "full" ? 1 : 0.6);
  return { slip: TEAR_SLIP * e, edge: TEAR_EDGE * e, pose: Math.min(TEAR_POSES[kind] - 1, Math.floor(u * TEAR_POSES[kind])), done: false };
}
