import { stations } from "./content";
import { crts, ENTRANCE } from "./crts";

type V3 = [number, number, number];

// The tour: scroll position in, current station, camera position and meter reading out.
// Stop 0 is the entrance (shows the gap); stops 1..STATION_COUNT are the stations.
export const STATION_COUNT = stations.length;

// Camera position at each stop, entrance first, then one per CRT (see crts.ts).
const stops: V3[] = [ENTRANCE.camera, ...crts.map((c) => c.camera)];
// What the camera looks at from each stop: into the room at the entrance, then at each CRT.
const looks: V3[] = [ENTRANCE.look, ...crts.map((c) => c.look)];

/** Camera position at stop `i` (0 is the entrance). */
export const stopPosition = (i: number) => stops[Math.min(Math.max(i, 0), STATION_COUNT)];

export type TourState = { station: number; camera: V3; look: V3; reading: number };

/** Scroll progress (0..1) at which the camera sits on stop `i`. */
export const progressFor = (i: number) => Math.min(Math.max(i, 0), STATION_COUNT) / STATION_COUNT;

export function tourAt(progress: number, gap: number): TourState {
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  const x = p * STATION_COUNT;
  const i = Math.min(Math.floor(x), STATION_COUNT - 1);
  const f = x - i;
  const readingAt = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  const lerp = (a: number, b: number) => a + (b - a) * f;
  const a = stops[i], b = stops[i + 1], la = looks[i], lb = looks[i + 1];
  return {
    station: Math.round(x),
    camera: [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])],
    look: [lerp(la[0], lb[0]), lerp(la[1], lb[1]), lerp(la[2], lb[2])],
    reading: lerp(readingAt(i), readingAt(i + 1)),
  };
}
