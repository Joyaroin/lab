import { Vector3, type Camera } from "three";
import { glassCorners, type Crt } from "./crts";

/** The glass's four corners in window pixels, as `camera` sees them now (call `updateMatrixWorld`
 *  first if it just moved). The one projection the app uses to lay a station's text over its
 *  glass (Room.tsx), so tests of the alignment run the same code. */
export function glassOnScreen(crt: Crt, camera: Camera, size: { width: number; height: number }) {
  const v = new Vector3();
  return glassCorners(crt).map((c) => {
    v.set(...c).project(camera);
    return { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height };
  });
}

/** The box around the glass's corners on screen. */
export function glassBox(crt: Crt, camera: Camera, size: { width: number; height: number }) {
  const pts = glassOnScreen(crt, camera, size), xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const left = Math.min(...xs), top = Math.min(...ys);
  return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
