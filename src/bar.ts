import type { Framing } from "./framing";
import type { Where } from "./where";

/** A key on the meter bar. */
export type BarKey = "prev" | "room" | "next" | "start";

/** What the bar shows: its keys in order, and the stop whose line and digits it shows. */
export type Bar = { keys: BarKey[]; stop: number };

/** What the bar shows at `where` in a framing. At the overview: START alone. At a station: PREV, ROOM, NEXT, and
 *  on a portrait window PREV and NEXT (the phone's menu has the way back to the room). In a flight everything is that
 *  of the stop being flown to. */
export function barFor(where: Where, framing: Framing["name"]): Bar {
  const stop = where.kind === "at" ? where.stop : where.to;
  if (stop === 0) return { keys: ["start"], stop };
  return { keys: framing === "portrait" ? ["prev", "next"] : ["prev", "room", "next"], stop };
}
