import type { Where } from "./where";

/** What a press (a click or a tap) landed on, in the 3D room: the open room, a TV (by its stop) or the desk meter. The
 *  page's own controls and the station's text panel are not in the room, so they never become a Press. `moved` is how
 *  far the pointer travelled between going down and coming up, in px. */
export type Press =
  | { on: "room"; moved: number }
  | { on: "tv"; stop: number; moved: number }
  | { on: "meter"; moved: number };

/** A press that moves farther than this is a drag, not a click. */
export const DRAG_PX = 6;

/** Whether a press on the room goes back to the overview: at a station, and not in flight, a click that is not on
 *  that station's own TV. Another TV counts as the room from up close. The desk meter's click means next, so it never
 *  goes back. At the overview and in flight it never applies. A pure rule so a unit test can prove it (#224).
 *  `moving` is whether a move is running (`visit.moving()`). Under reduced motion a move is a fade and `where` reads as
 *  at a station all through it, so only `moving` says a fade is on: then it never applies either. */
export function goesBack(where: Where, press: Press, moving: boolean): boolean {
  if (moving) return false;
  if (where.kind !== "at" || where.stop === 0) return false;
  if (press.moved > DRAG_PX) return false;
  if (press.on === "meter") return false;
  if (press.on === "tv" && press.stop === where.stop) return false;
  return true;
}
