import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AdditiveBlending, type MeshBasicMaterial } from "three";
import type { Where } from "./where";
import { clickable } from "./clickable";
import type { Visit } from "./visit";
import { easeGlow } from "./glow";
import { crts } from "./crts";
import type { PressTarget } from "./RoomClick";
import { stations } from "./content";
import type { MeterLink } from "./nixie";
import { BEZEL, BEZEL_GAP, SCREEN_LAYER, pointGlowTexture } from "./draw";

// ---------------------------------------------------------------- the TVs as click targets
// On the overview each TV takes a click (a visit to its station) and shows a soft glow under the pointer. The hit
// target is an invisible plane the size of the bezel, in front of the bezel layer (the overlay meshes take no
// pointer). The glow eases in and out over about a third of a second, a slow swell that is far from a flash, so the
// flash limit does not count it. The hovered id is written to the canvas's data-hover, so a spec can check the target.
// Where the visitor is decides it every frame (clickable): at a station, or in flight, nothing is hot and no glow shows.

/** How far in front of the bezel layer the hit target and the glow stand. */
const TARGET_GAP = 0.003;

export function TvTargets({ visit, where, meter }: { visit: Visit; where: MutableRefObject<Where>; meter: MeterLink }) {
  const invalidate = useThree((s) => s.invalidate);
  const hovered = useRef<string | null>(null);
  const byPointer = useRef(true); // the pointer on the TV is a mouse or pen: a touch has no hover preview
  const shown = useRef<string | null>(null); // what the cursor and data-hover currently say
  const glow = useRef<Record<string, number>>({});
  const mats = useRef<Record<string, MeshBasicMaterial | null>>({});
  const tex = useMemo(() => pointGlowTexture("rgba(170,255,200,1)", "rgba(110,230,160,0.7)"), []);

  useFrame(({ gl }, dt) => {
    const hot = clickable(where.current) && visit.target() === 0 ? hovered.current : null; // only at the overview, which a fade's second half back to it counts as
    if (hot !== shown.current) {
      shown.current = hot;
      document.body.style.cursor = hot ? "pointer" : "";
      if (hot) gl.domElement.dataset.hover = hot; else delete gl.domElement.dataset.hover;
      // The tour's hover preview (#228) hears of the TV the pointer is on, under the same rule as the glow.
      meter.tvHover(hot && byPointer.current ? stations.findIndex((s) => s.id === hot) + 1 : null);
    }
    let easing = false;
    for (const crt of crts) {
      const goal = crt.id === hot ? 1 : 0;
      let v = glow.current[crt.id] ?? 0;
      v = easeGlow(v, goal, dt);
      if (v !== goal) easing = true;
      glow.current[crt.id] = v;
      const m = mats.current[crt.id];
      if (m) m.opacity = v;
    }
    if (easing) invalidate();
  });
  useEffect(() => () => { if (shown.current) { document.body.style.cursor = ""; meter.tvHover(null); } }, [meter]);

  return (
    <>
      {crts.map((crt) => {
        const a = (crt.yaw * Math.PI) / 180, d = SCREEN_LAYER + BEZEL_GAP + TARGET_GAP;
        const at: [number, number, number] = [crt.screen[0] + Math.sin(a) * d, crt.screen[1], crt.screen[2] + Math.cos(a) * d];
        return (
          <group key={crt.id} position={at} rotation={[0, a, 0]}>
            <mesh
              userData={{ press: { on: "tv", stop: stations.findIndex((s) => s.id === crt.id) + 1 } satisfies PressTarget }}
              onPointerOver={(e) => { e.stopPropagation(); hovered.current = crt.id; byPointer.current = e.nativeEvent.pointerType !== "touch"; invalidate(); }}
              onPointerOut={() => { if (hovered.current === crt.id) hovered.current = null; invalidate(); }}
              onClick={(e) => { if (!clickable(where.current) || visit.target() !== 0) return; e.stopPropagation(); visit.go(stations.findIndex((s) => s.id === crt.id) + 1); }}>
              <planeGeometry args={[BEZEL.width, BEZEL.height]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh renderOrder={3} raycast={() => null}>
              <planeGeometry args={[BEZEL.width * 1.4, BEZEL.height * 1.4]} />
              <meshBasicMaterial ref={(m) => { mats.current[crt.id] = m; }} map={tex} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
