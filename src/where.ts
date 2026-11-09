/** Where the visitor is. 0 is the overview; 1..STATION_COUNT are the
 *  stations, in tour order. `f` is the share (0..1) of the flight from `from` to `to`. */
export type Where =
  | { kind: "at"; stop: number }
  | { kind: "flying"; from: number; to: number; f: number };
