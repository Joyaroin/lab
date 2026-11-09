import { useFrame } from "@react-three/fiber";
import { useMemo, type MutableRefObject } from "react";
import { crts } from "../crts";
import type { Shift } from "../shift";
import type { Where } from "../where";
import { placeText, scratch } from "./place";

// Pins each station's HTML panel (a DOM element with data-screen="<id>") to its real CRT in the
// baked room: every frame it projects the CRT's panel point into the window and places the panel
// there (on a phone, the station's phone pin if it has one), as wide as the CRT looks, kept inside
// the window by fitPanel. The text stays real HTML, so it is sharp at any size, selectable, and its
// links work. Only the panel of the hold the visitor is in is shown. It runs inside the canvas, so it is
// placed right after the camera moves. The room only mounts it.
export function TextPins({ where, shift }: { where: MutableRefObject<Where>; shift: Shift }) {
  const s = useMemo(scratch, []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld(); // CameraRig just moved it; project from where it is now
    const nowMs = performance.now();
    const menuHeight = document.querySelector<HTMLElement>("[data-menu]")?.offsetHeight ?? 0; // the phone menu's real height (Hud.tsx)
    crts.forEach((crt, k) => {
      const el = document.querySelector<HTMLElement>(`[data-screen="${crt.id}"]`);
      if (el) placeText(el, crt, k, { camera, size, where: where.current, nowMs, shift, scratch: s, menuHeight });
    });
  });
  return null;
}
