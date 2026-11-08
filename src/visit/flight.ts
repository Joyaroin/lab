// The flight path: one smooth curve between two camera poses (a stop's camera and what it looks at).
// Pure, so it is tested without a browser. The camera does not cut across the room. It climbs out of
// the pose it leaves (toward the middle of the room), passes over the middle of the room, and
// comes in to the pose it is going to the same way. That keeps it off the desks, shelves and the
// other TVs, and bows it back toward the middle of the room, as the overview does.
import { CAMERA_FOV } from "../crts";
type V3 = [number, number, number];
/** `exit` is the points the camera heads through first when it leaves this pose, and arrives through in reverse: set where heading for the middle of the room is no way out (the overview, in a corner of the room's shelves). */
/** `fov` is the vertical field of view in degrees; CAMERA_FOV where left out. */
export type Pose = { camera: V3; look: V3; exit?: V3[]; fov?: number };

/** The point every flight passes over, and what the camera looks at as it does. */
export const HUB = { camera: [0, 1.75, 0.1] as V3, look: [0, 1, -0.6] as V3 };
/** How far a flight heads toward the middle of the room from a stop before it turns, and how far it climbs, in metres. */
export const STEP = 0.45, CLIMB = 0.3;
const CEILING = 2.0;

const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The waypoints a flight uses to leave or arrive at `pose`: its `exit`, or a point a little way toward the middle of the room and a little higher. */
function out(pose: Pose): V3[] {
  if (pose.exit) return pose.exit;
  const [cx, cy, cz] = pose.camera, dx = HUB.camera[0] - cx, dz = HUB.camera[2] - cz, h = Math.hypot(dx, dz) || 1;
  return [[cx + (dx / h) * STEP, Math.min(cy + CLIMB, CEILING), cz + (dz / h) * STEP]];
}

/** The point `s` of the way along a smooth curve through `pts` (Catmull-Rom with chord-length knots, so it passes through every point and has no corners). */
function through(pts: V3[], s: number): V3 {
  const knots = [0];
  for (let i = 1; i < pts.length; i++) knots.push(knots[i - 1] + Math.sqrt(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])));
  const t = s * knots[knots.length - 1];
  let i = 1;
  while (i < pts.length - 1 && t > knots[i]) i++;
  // Segment (i-1, i); the end points are mirrored to give the curve a tangent there.
  const p1 = pts[i - 1], p2 = pts[i];
  const p0 = i >= 2 ? pts[i - 2] : ([2 * p1[0] - p2[0], 2 * p1[1] - p2[1], 2 * p1[2] - p2[2]] as V3);
  const p3 = i + 1 < pts.length ? pts[i + 1] : ([2 * p2[0] - p1[0], 2 * p2[1] - p1[1], 2 * p2[2] - p1[2]] as V3);
  const t1 = knots[i - 1], t2 = knots[i];
  const t0 = i >= 2 ? knots[i - 2] : t1 - (t2 - t1), t3 = i + 1 < pts.length ? knots[i + 1] : t2 + (t2 - t1);
  const lerp = (a: V3, b: V3, ta: number, tb: number): V3 => mix(a, b, (t - ta) / (tb - ta));
  const a1 = lerp(p0, p1, t0, t1), a2 = lerp(p1, p2, t1, t2), a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2), b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
}

/** The field of view `f` (0..1) of the way along a flight: eased (smoothstep) between the two poses', exactly each pose's at 0 and 1. */
export function flightFov(from: Pose, to: Pose, f: number): number {
  const a = from.fov ?? CAMERA_FOV, b = to.fov ?? CAMERA_FOV;
  if (f <= 0) return a;
  if (f >= 1) return b;
  return a + (b - a) * f * f * (3 - 2 * f);
}

/** The camera, look point and field of view `f` (0..1) of the way along the flight from `from` to `to`. It is
 *  exactly `from` at 0 and exactly `to` at 1. */
export function flightPose(from: Pose, to: Pose, f: number): Required<Pick<Pose, "fov">> & Pose {
  const fov = flightFov(from, to, f);
  if (f <= 0) return { camera: [...from.camera], look: [...from.look], fov };
  if (f >= 1) return { camera: [...to.camera], look: [...to.look], fov };
  return {
    camera: through([from.camera, ...out(from), HUB.camera, ...out(to).slice().reverse(), to.camera], f),
    look: through([from.look, HUB.look, to.look], f),
    fov,
  };
}
