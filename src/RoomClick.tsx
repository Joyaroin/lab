import { useThree } from "@react-three/fiber";
import { useEffect, type MutableRefObject } from "react";
import { Raycaster, Vector2, type Object3D } from "three";
import { goesBack, type Press } from "./back";
import type { Visit } from "./visit";
import type { Where } from "./where";

// ---------------------------------------------------------------- a click on the room goes back
// At a station, a click on the room around the TV goes back to the overview (goesBack decides). The canvas takes
// only presses on the room itself: the HUD, the menu, the meter bar and the station's text are page elements over it,
// so their clicks never reach this. This does its own hit test so it can say which part of the room was pressed, and
// measures its own drag (R3F's click gate is 2 px, the rule's is 6). The desk meter's own click (next) and a TV's
// own click (TvTargets) are unchanged: this listens beside them and never stops them. Objects that matter to the rule
// carry `userData.press` (a TV's hit plane, the desk meter's group).

/** What the rule needs to know about an object, set on it as `userData.press`. */
export type PressTarget = { on: "tv"; stop: number } | { on: "meter" };

const raycaster = new Raycaster();
const ndc = new Vector2();

const tagOf = (o: Object3D | null): PressTarget | null => {
  for (; o; o = o.parent) if (o.userData.press) return o.userData.press as PressTarget;
  return null;
};

export function RoomClick({ visit, where }: { visit: Visit; where: MutableRefObject<Where> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onClick = (e: MouseEvent) => {
      const start = down ?? { x: e.clientX, y: e.clientY };
      down = null;
      const w = where.current;
      // not at a station, or a move already begun toward the overview (a fade's second half): nothing to do
      if (w.kind !== "at" || w.stop === 0 || visit.target() !== w.stop) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      let hit: PressTarget | null = null;
      for (const h of raycaster.intersectObjects(scene.children, true)) { hit = tagOf(h.object); if (hit) break; }
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      const press: Press = hit ? { ...hit, moved } : { on: "room", moved };
      if (goesBack(w, press)) visit.back();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("click", onClick);
    return () => { el.removeEventListener("pointerdown", onDown); el.removeEventListener("click", onClick); };
  }, [gl, scene, camera, visit, where]);
  return null;
}
