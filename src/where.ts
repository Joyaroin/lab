import { legAt } from "./hold";

/** Where the visitor is. 0 is the entrance (the overview, once it replaces it); 1..STATION_COUNT are the
 *  stations, in tour order. `f` is the share (0..1) of the flight from `from` to `to`. */
export type Where =
  | { kind: "at"; stop: number }
  | { kind: "flying"; from: number; to: number; f: number };

/** The adapter from scroll: the entrance at 0, a hold at its station, and a leg flying from its stop to the
 *  next with `f` the share along. Same leg maths as the tour's. Progress is clamped to 0..1. */
export function whereAt(progress: number): Where {
  const { i, f } = legAt(progress);
  if (f === 1) return { kind: "at", stop: i + 1 };
  if (i === 0 && f === 0) return { kind: "at", stop: 0 };
  return { kind: "flying", from: i, to: i + 1, f };
}
