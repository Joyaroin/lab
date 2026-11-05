import { stations } from "./content";
import { crts, ENTRANCE, isPortrait } from "./crts";

type V3 = [number, number, number];

// The tour: scroll position in, current station, camera position and meter reading out.
// Stop 0 is the entrance (shows the gap, close on the desk meter); stops 1..STATION_COUNT are
// the stations.
export const STATION_COUNT = stations.length;

// Camera position at each stop, entrance first, then one per CRT (see crts.ts).
const stops: V3[] = [ENTRANCE.camera, ...crts.map((c) => c.camera)];
// What the camera looks at from each stop: into the room at the entrance, then at each CRT.
const looks: V3[] = [ENTRANCE.look, ...crts.map((c) => c.look)];
// On a portrait window the camera stands further back along the same line, so a phone sees the
// station's desk, not only one CRT. The factor per stop is in room-layout.json (1 if unset).
// A station with its own phone stop uses that instead (MediaSafe and WC2026, whose pulled-back
// view was mostly dark).
const pulls: number[] = [ENTRANCE.portrait, ...crts.map((c) => c.portrait)];
const phones = [undefined, ...crts.map((c) => c.phone)];
const portraitStops: V3[] = stops.map((c, i) => {
  const phone = phones[i];
  if (phone) return phone.camera;
  const l = looks[i], k = pulls[i];
  return [l[0] + (c[0] - l[0]) * k, l[1] + (c[1] - l[1]) * k, l[2] + (c[2] - l[2]) * k];
});
const portraitLooks: V3[] = looks.map((l, i) => phones[i]?.look ?? l);

/** Camera position at stop `i` (0 is the entrance). */
export const stopPosition = (i: number) => stops[Math.min(Math.max(i, 0), STATION_COUNT)];

export type TourState = { station: number; camera: V3; look: V3; reading: number };

/** Scroll progress (0..1) at which the camera sits on stop `i`. */
export const progressFor = (i: number) => Math.min(Math.max(i, 0), STATION_COUNT) / STATION_COUNT;

const straight = (a: V3, b: V3, f: number): V3 => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * f) as V3;
/** A quadratic curve from `a` to `b` that passes through `mid` halfway along. */
const curveThrough = (mid: V3) => (a: V3, b: V3, f: number): V3 =>
  [0, 1, 2].map((k) => {
    const c = 2 * mid[k] - (a[k] + b[k]) / 2;
    return (1 - f) ** 2 * a[k] + 2 * (1 - f) * f * c + f ** 2 * b[k];
  }) as V3;

/** `aspect` is the window's width over height; below 1 (portrait) the portrait stops are used. */
export function tourAt(progress: number, gap: number, aspect = 16 / 9): TourState {
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  const x = p * STATION_COUNT;
  const i = Math.min(Math.floor(x), STATION_COUNT - 1);
  const f = x - i;
  const readingAt = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  const lerp = (a: number, b: number) => a + (b - a) * f;
  const path = isPortrait(aspect) ? portraitStops : stops;
  const aims = isPortrait(aspect) ? portraitLooks : looks;
  const a = path[i], b = path[i + 1], la = aims[i], lb = aims[i + 1];
  // Leaving the entrance, the camera pulls back from the meter through the wide view of the room
  // (ENTRANCE.reveal) on one smooth curve; between stations it goes straight.
  const move = i === 0 ? curveThrough(ENTRANCE.reveal.camera) : straight;
  const turn = i === 0 ? curveThrough(ENTRANCE.reveal.look) : straight;
  return {
    station: Math.round(x),
    camera: move(a, b, f),
    look: turn(la, lb, f),
    reading: lerp(readingAt(i), readingAt(i + 1)),
  };
}

/** Slight mouse parallax: where to move the camera, in room coordinates, for a pointer at
 *  (`x`, `y`), each -1..1 across the window. The shift is along the camera's own right and up,
 *  so it slides the view sideways rather than toward or away from what it looks at, and it is a
 *  fixed share of the distance to the look point, so it feels the same close up and from afar. */
export const PARALLAX = { right: 0.1, up: 0.05 };
export function parallax(camera: V3, look: V3, pointer: { x: number; y: number }): V3 {
  const f = [look[0] - camera[0], look[1] - camera[1], look[2] - camera[2]];
  const d = Math.hypot(f[0], f[1], f[2]);
  if (d === 0) return [0, 0, 0];
  // right = forward x world up, as three.js's lookAt builds it; up = right x forward
  const rl = Math.hypot(f[2], f[0]);
  if (rl === 0) return [0, 0, 0];
  const r = [-f[2] / rl, 0, f[0] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]].map((v) => v / d);
  const a = pointer.x * PARALLAX.right * d, b = pointer.y * PARALLAX.up * d;
  return [r[0] * a + u[0] * b, r[1] * a + u[1] * b, r[2] * a + u[2] * b];
}
