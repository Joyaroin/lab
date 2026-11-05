// The one list of CRTs in the baked room (tools/room/build.py), shared by the tour and the
// screen panels. For each station: where its CRT screen is, and where the camera stops to face it.
// When the room's CRTs or the camera stops move, change them here and nowhere else.
// Positions are in site axes: x across, y up, -z down the tour.
type V3 = [number, number, number];
export type Crt = { id: string; screen: V3; camera: V3 };

// Screen centres come from the build script's crt(x, z) calls: the screen sits 0.18 in front of
// the CRT, 1.24 up. The glass is 0.46 wide by 0.36 high.
export const CRT_GLASS = { width: 0.46, height: 0.36 };
const crt = (id: string, x: number, z: number): Crt => ({
  id,
  screen: [x, 1.24, z + 0.18],
  camera: [x * 0.5, 1.5, z + 2.4], // in front of the CRT, nudged toward the room's centre
});

/** One entry per station, in tour order. Ids match the content module's station ids. */
export const crts: Crt[] = [
  crt("work", -3.4, -4.1),
  crt("mediasafe", 3.3, -8.1),
  crt("home-lab", -3.6, -13.3),
  crt("order-tracker", 3.4, -16.1),
  crt("wc2026-predictor", -2.6, -20.1),
  crt("contact", -0.6, -24.1),
];

/** Camera position at the entrance, which is not a station. */
export const ENTRANCE_CAMERA: V3 = [0, 2, 6];
