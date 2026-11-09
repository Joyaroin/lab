import { stations } from "./content";
import type { Where } from "./where";

type V3 = [number, number, number];

// The meter's reading at a Where, and the mouse parallax. The camera's flight is in src/visit/flight.ts,
// along the stops of the framing (src/framing).

/** The meter's reading at `where`: the gap at the overview, the station's reading at a station, and over a
 *  flight it rolls between the two stops' readings. */
export function readingAt(where: Where, gap: number): number {
  const of = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  if (where.kind === "at") return of(where.stop);
  return of(where.from) + (of(where.to) - of(where.from)) * where.f;
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
