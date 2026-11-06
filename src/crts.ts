// The one list of CRTs in the baked room, shared by the tour and the screen panels. For each
// station: where its CRT screen is, which way it faces, and the camera views the layout holds for it
// (used on phones and by build.py's --preview; the desktop stops come from stop.ts, not the layout).
// The numbers live in room-layout.json, which tools/room/build.py also reads to place the CRTs,
// so the room and the tour can't drift apart. Change a CRT's place there, then re-bake (`make room`).
// Positions are in site axes: x across, y up, +z toward the room's door.
// `with { type: "json" }` so a Playwright test can import this file (and tour.ts) in plain Node,
// which refuses a JSON import without it. useGap.ts imports its JSON bare: only Vite loads that one.
import layout from "./room-layout.json" with { type: "json" };

type V3 = [number, number, number];
/** A phone stop: where the camera stands, what it looks at and where the text is pinned. */
export type Stop = { camera: V3; look: V3; panel: V3 };
/** `panel` is where the station's text is pinned: the CRT screen, unless the layout gives a
 *  point beside it so the text leaves the station's subject in view (the home lab's rack).
 *  `portrait` is how much further back the camera stands on a portrait window (see tour.ts).
 *  `phone`, if set, replaces that pull-back with its own stop on a portrait window, to bring lit
 *  parts of the room into a tall, narrow frame. Desktop never uses it. */
export type Crt = { id: string; screen: V3; yaw: number; camera: V3; look: V3; panel: V3; portrait: number; phone?: Stop };
type LayoutCrt = {
  id: string; screen: number[]; yaw: number; camera: number[]; look: number[]; panel?: number[]; portrait?: number;
  phone?: { camera: number[]; look: number[]; panel?: number[] };
};

/** Where the maker's plate and the sticky note sit on a TV's bezel: metres right of and up from the
 *  glass centre. The note is near the baked note's spot (tools/room/build.py). */
export const PLATE_AT = [-0.2, -0.21] as const;
export const NOTE_AT = [-0.258, 0.149] as const;
/** The glass on every CRT, in metres. */
export const CRT_GLASS = { width: 0.46, height: 0.36 };

const v3 = (a: number[]): V3 => [a[0], a[1], a[2]];

/** One entry per station, in tour order. Ids match the content module's station ids. */
export const crts: Crt[] = (layout.crts as LayoutCrt[]).map((c) => ({
  id: c.id, screen: v3(c.screen), yaw: c.yaw, camera: v3(c.camera), look: v3(c.look),
  panel: v3(c.panel ?? c.screen), portrait: c.portrait ?? 1,
  ...(c.phone && { phone: { camera: v3(c.phone.camera), look: v3(c.phone.look), panel: v3(c.phone.panel ?? c.panel ?? c.screen) } }),
}));

/** A window taller than it is wide (aspect is width over height). Phones in portrait. */
export const isPortrait = (aspect: number) => aspect < 1;

/** Where a station's text is pinned in a window of this shape. */
export const panelPoint = (crt: Crt, aspect: number): V3 => (isPortrait(aspect) && crt.phone ? crt.phone.panel : crt.panel);

/** The camera's vertical field of view, in degrees. */
export const CAMERA_FOV = 55;

/** Where the camera stands at the entrance, which is not a station, and what it looks at: close
 *  on the desk meter. `reveal` is the wide view of the room the camera pulls back through on its
 *  way to the first station (see tour.ts). */
const entrance: { camera: number[]; look: number[]; portrait?: number; reveal: { camera: number[]; look: number[] } } = layout.entrance;
export const ENTRANCE = {
  camera: v3(entrance.camera), look: v3(entrance.look), portrait: entrance.portrait ?? 1,
  reveal: { camera: v3(entrance.reveal.camera), look: v3(entrance.reveal.look) },
};

/** The desk meter's place in the baked room. Numbers match build.py's meter: seven tubes in a
 *  row on a case at `position`, turned `yaw` radians. Tube positions are in the case's frame. */
const METER_YAW = (70 * Math.PI) / 180;
export const DESK_METER = {
  position: [-1.55, 0.76, 0.26] as V3,
  yaw: METER_YAW,
  tubeX: (i: number) => -0.18 + i * 0.06,
  tubeY: 0.135, tubeR: 0.027, tubeH: 0.064,
  /** The bottom and top of the first and last tubes' fronts, in room coordinates. */
  tubeEnds(): V3[] {
    const [px, py, pz] = DESK_METER.position, c = Math.cos(METER_YAW), s = Math.sin(METER_YAW), z = 0.03;
    const at = (x: number, y: number): V3 => [px + x * c + z * s, py + y, pz - x * s + z * c];
    const { tubeX, tubeY, tubeH } = DESK_METER;
    return [at(tubeX(0), tubeY - tubeH / 2), at(tubeX(0), tubeY + tubeH / 2), at(tubeX(6), tubeY - tubeH / 2), at(tubeX(6), tubeY + tubeH / 2)];
  },
};

/** The middle of the glass's right-hand edge, used to measure how wide the screen looks. */
export function glassEdge(crt: Crt): V3 {
  const a = (crt.yaw * Math.PI) / 180, h = CRT_GLASS.width / 2;
  return [crt.screen[0] + Math.cos(a) * h, crt.screen[1], crt.screen[2] - Math.sin(a) * h];
}

/** The glass's four corners in room coordinates. */
export function glassCorners(crt: Crt): V3[] {
  const a = (crt.yaw * Math.PI) / 180, hw = CRT_GLASS.width / 2, hh = CRT_GLASS.height / 2;
  return [-1, 1].flatMap((sx) => [-1, 1].map((sy): V3 => [crt.screen[0] + Math.cos(a) * hw * sx, crt.screen[1] + hh * sy, crt.screen[2] - Math.sin(a) * hw * sx]));
}

/** One wide view of the room per leg between stations (leg 1 is the first station to the second):
 *  where the camera and its look point are halfway along that leg (see tour.ts). */
export const ARCS: { camera: V3; look: V3 }[] = (layout.arcs as { camera: number[]; look: number[] }[]).map((a) => ({ camera: v3(a.camera), look: v3(a.look) }));
