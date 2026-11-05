// The one list of CRTs in the baked room, shared by the tour and the screen panels. For each
// station: where its CRT screen is, which way it faces, and where the camera stops to face it.
// The numbers live in room-layout.json, which tools/room/build.py also reads to place the CRTs,
// so the room and the tour can't drift apart. Change them there, then re-bake (`make room`).
// Positions are in site axes: x across, y up, +z toward the room's door.
import layout from "./room-layout.json";

type V3 = [number, number, number];
/** `panel` is where the station's text is pinned: the CRT screen, unless the layout gives a
 *  point beside it so the text leaves the station's subject in view (the home lab's rack). */
/** `portrait` is how much further back the camera stands on a portrait window (see tour.ts). */
export type Crt = { id: string; screen: V3; yaw: number; camera: V3; look: V3; panel: V3; portrait: number };
type LayoutCrt = { id: string; screen: number[]; yaw: number; camera: number[]; look: number[]; panel?: number[]; portrait?: number };

/** The glass on every CRT, in metres. */
export const CRT_GLASS = { width: 0.46, height: 0.36 };

const v3 = (a: number[]): V3 => [a[0], a[1], a[2]];

/** One entry per station, in tour order. Ids match the content module's station ids. */
export const crts: Crt[] = (layout.crts as LayoutCrt[]).map((c) => ({
  id: c.id, screen: v3(c.screen), yaw: c.yaw, camera: v3(c.camera), look: v3(c.look),
  panel: v3(c.panel ?? c.screen), portrait: c.portrait ?? 1,
}));

/** Where the camera stands at the entrance, which is not a station, and what it looks at. */
const entrance: { camera: number[]; look: number[]; portrait?: number } = layout.entrance;
export const ENTRANCE = { camera: v3(entrance.camera), look: v3(entrance.look), portrait: entrance.portrait ?? 1 };

/** The middle of the glass's right-hand edge, used to measure how wide the screen looks. */
export function glassEdge(crt: Crt): V3 {
  const a = (crt.yaw * Math.PI) / 180, h = CRT_GLASS.width / 2;
  return [crt.screen[0] + Math.cos(a) * h, crt.screen[1], crt.screen[2] - Math.sin(a) * h];
}
