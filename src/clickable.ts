import type { Where } from "./where";

/** Whether the TVs take clicks and show a hover glow: only at the overview (stop 0). At a station the other TVs are
 *  not clickable from up close, and in flight nothing is. A pure rule so a unit test can prove it (#176). */
export const clickable = (where: Where): boolean => where.kind === "at" && where.stop === 0;
