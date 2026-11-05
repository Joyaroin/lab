import { stations } from "./content";

// The tour: scroll position in, current station, camera position and meter reading out.
// Stop 0 is the entrance (shows the gap); stops 1..STATION_COUNT are the stations.
export const STATION_COUNT = stations.length;

// Camera position at each stop, entrance first. Matches the room's greybox layout.
const stops: [number, number, number][] = [
  [0, 2, 6], [-1.5, 2, 2], [1.5, 2, -2], [-1.5, 2, -6], [1.5, 2, -10], [-1.5, 2, -14], [0, 2, -18],
];

/** Camera position at stop `i` (0 is the entrance). */
export const stopPosition = (i: number) => stops[Math.min(Math.max(i, 0), STATION_COUNT)];

export type TourState = { station: number; camera: [number, number, number]; reading: number };

/** Scroll progress (0..1) at which the camera sits on stop `i`. */
export const progressFor = (i: number) => Math.min(Math.max(i, 0), STATION_COUNT) / STATION_COUNT;

export function tourAt(progress: number, gap: number): TourState {
  const p = Math.min(Math.max(Number.isFinite(progress) ? progress : 0, 0), 1);
  const x = p * STATION_COUNT;
  const i = Math.min(Math.floor(x), STATION_COUNT - 1);
  const f = x - i;
  const readingAt = (s: number) => (s === 0 ? gap : stations[s - 1].reading);
  const lerp = (a: number, b: number) => a + (b - a) * f;
  const a = stops[i], b = stops[i + 1];
  return {
    station: Math.round(x),
    camera: [lerp(a[0], b[0]), lerp(a[1], b[1]), lerp(a[2], b[2])],
    reading: lerp(readingAt(i), readingAt(i + 1)),
  };
}
