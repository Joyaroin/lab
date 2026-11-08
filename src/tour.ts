import { stations } from "./content";
import { ARCS, ENTRANCE } from "./crts";
import { legAt } from "./hold";
import type { Where } from "./where";

type V3 = [number, number, number];

// The tour: scroll position in, nearest stop and meter reading out; legs and arcs for the camera, which
// the framing (src/framing) flies along its own stops.
// Stop 0 is the entrance (shows the gap, close on the desk meter); stops 1..STATION_COUNT are
// the stations.

export type TourState = { nearestStop: number; reading: number };

/** A quadratic curve from `a` to `b` that passes through `mid` halfway along. */
const curveThrough = (mid: V3) => (a: V3, b: V3, f: number): V3 =>
  [0, 1, 2].map((k) => {
    const c = 2 * mid[k] - (a[k] + b[k]) / 2;
    return (1 - f) ** 2 * a[k] + 2 * (1 - f) * f * c + f ** 2 * b[k];
  }) as V3;

const line = (a: V3, b: V3, f: number): V3 => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f) as V3;

/** The nearest stop and the reading, from scroll progress alone. The gap is what the entrance shows. */
export function tourAt(progress: number, gap: number): TourState {
  const { i, f } = legAt(progress);
  const readingAt = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  return {
    nearestStop: Math.round(i + f),
    reading: f === 1 ? readingAt(i + 1) : readingAt(i) + (readingAt(i + 1) - readingAt(i)) * f,
  };
}

/** The meter's reading at `where`: the gap at the overview, the station's reading at a station, and over a
 *  flight it rolls between the two stops' readings. */
export function readingAt(where: Where, gap: number): number {
  const of = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  if (where.kind === "at") return of(where.stop);
  return of(where.from) + (of(where.to) - of(where.from)) * where.f;
}

/** Where the camera is and what it looks at, flying the legs between `cameras` and `looks` (entrance
 *  first, then one per station: the framing supplies them). With `reduced` (reduced motion) travel
 *  between stations is a straight line, not an arc. The leg from the entrance stays curved: the
 *  entrance isn't a station, and the wide view of the room on the way in is kept for everyone. */
export function flyAlong(cameras: V3[], looks: V3[], at: number | Where, reduced = false): { camera: V3; look: V3 } {
  if (typeof at !== "number") {
    // A Where: at a stop is the end of the leg into it (the entrance is the start of the first leg).
    if (at.kind === "flying") return flyLeg(cameras, looks, at.from, at.f, reduced);
    return at.stop === 0 ? flyLeg(cameras, looks, 0, 0, reduced) : flyLeg(cameras, looks, at.stop - 1, 1, reduced);
  }
  const { i, f } = legAt(at);
  return flyLeg(cameras, looks, i, f, reduced);
}

/** The leg form: leg `i` (from stop `i` to stop `i + 1`), `f` of the way along. */
export function flyLeg(cameras: V3[], looks: V3[], i: number, f: number, reduced = false): { camera: V3; look: V3 } {
  const a = cameras[i], b = cameras[i + 1], la = looks[i], lb = looks[i + 1];
  // Leaving the entrance, the camera pulls back from the meter through the wide view of the room
  // (ENTRANCE.reveal) on one smooth curve. Between stations it does the same through that leg's
  // wide view of the room (ARCS), so the room shows halfway between two TVs, unless reduced motion
  // asks for a straight line there. The entrance leg always curves.
  const mid = i === 0 ? ENTRANCE.reveal : ARCS[i - 1];
  const straight = reduced && i > 0;
  const along = (from: V3, to: V3, via: V3) => (straight ? line : curveThrough(via))(from, to, f);
  // In a hold the camera is exactly on the stop, not a lerp that lands within rounding of it.
  return {
    camera: f === 1 ? [...b] : along(a, b, mid.camera),
    look: f === 1 ? [...lb] : along(la, lb, mid.look),
  };
}

/** Slight mouse parallax: where to move the camera, in room coordinates, for a pointer at
 *  (`x`, `y`), each -1..1 across the window. The shift is along the camera's own right and up,
 *  so it slides the view sideways rather than toward or away from what it looks at, and it is a
 *  fixed share of the distance to the look point, so it feels the same close up and from afar. */
export const PARALLAX = { right: 0.1, up: 0.05 };
export function parallax(camera: V3, look: V3, pointer: { x: number; y: number }, strength = 1): V3 {
  const f = [look[0] - camera[0], look[1] - camera[1], look[2] - camera[2]];
  const d = Math.hypot(f[0], f[1], f[2]);
  if (d === 0) return [0, 0, 0];
  // right = forward x world up, as three.js's lookAt builds it; up = right x forward
  const rl = Math.hypot(f[2], f[0]);
  if (rl === 0) return [0, 0, 0];
  const r = [-f[2] / rl, 0, f[0] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]].map((v) => v / d);
  const a = pointer.x * PARALLAX.right * d * strength, b = pointer.y * PARALLAX.up * d * strength;
  return [r[0] * a + u[0] * b, r[1] * a + u[1] * b, r[2] * a + u[2] * b];
}
