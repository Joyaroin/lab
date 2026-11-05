import { stations } from "./content";

export const STATION_COUNT = stations.length;

// Scroll is laid out as one stretch of travel into each station, then a hold there: the camera
// stays put. Lengths are in arbitrary units; only the ratio matters. The entrance has no hold.
export const TRAVEL = 1, HOLD = 0.6, PER_STATION = TRAVEL + HOLD, TOTAL = STATION_COUNT * PER_STATION;

/** The scroll progress (0..1) where the hold at station `i` (1..STATION_COUNT) starts and ends. */
export const holdSpan = (i: number): [number, number] => {
  const k = Math.min(Math.max(i, 1), STATION_COUNT) - 1;
  return [(k * PER_STATION + TRAVEL) / TOTAL, ((k + 1) * PER_STATION) / TOTAL];
};

/** Scroll progress (0..1) to land on stop `i`: the entrance at the top, a station in the middle of
 *  its hold. */
export const progressFor = (i: number) => {
  if (i <= 0) return 0;
  const [a, b] = holdSpan(i);
  return (a + b) / 2;
};
