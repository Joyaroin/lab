import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, type MutableRefObject } from "react";
import { MeshBasicMaterial, Vector3, type Mesh, type MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import roomUrl from "./assets/room.glb?url";
import { crts, glassEdge } from "./crts";
import { fitPanel } from "./pin";
import { STATION_COUNT, tourAt } from "./tour";
import { ENTRANCE } from "./crts";
import { DeskMeter, Phosphor, Rain } from "./Effects";
import type { MeterLink } from "./nixie";
import { markMore } from "./ScreenPanels";

// Pins each station's HTML panel (a DOM element with data-screen="<id>") to its real CRT in the
// baked room: every frame it projects the CRT's panel point (room-layout.json, via crts.ts) into
// the window and places the panel there, as wide as the CRT looks, kept inside the window by fitPanel. The text stays real HTML, so it is sharp
// at any size, selectable, and its links work. Only the current station's panel is shown.
function ScreenPins({ progress }: { progress: MutableRefObject<number> }) {
  const c = useMemo(() => new Vector3(), []);
  const e = useMemo(() => new Vector3(), []);
  const p = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld(); // CameraRig just moved it; project from where it is now
    const at = progress.current * STATION_COUNT;
    crts.forEach((crt, k) => {
      const el = document.querySelector<HTMLElement>(`[data-screen="${crt.id}"]`);
      if (!el) return;
      const strength = Math.min(1, Math.max(0, 1.1 - Math.abs(at - (k + 1)) * 3)); // full strength a little either side
      el.style.opacity = String(strength);
      el.style.visibility = strength < 0.05 ? "hidden" : "visible";
      el.style.pointerEvents = strength > 0.6 ? "auto" : "none";
      if (strength < 0.05) return;
      const [x, y, z] = crt.screen;
      c.set(x, y, z).project(camera);
      e.set(...glassEdge(crt)).project(camera);
      p.set(...crt.panel).project(camera);
      const px = (p.x * 0.5 + 0.5) * size.width, py = (-p.y * 0.5 + 0.5) * size.height;
      const crtWidth = Math.hypot((e.x - c.x) * size.width, (e.y - c.y) * size.height);
      // Set the width first, then measure the natural height at that width and fit, so the
      // panel settles in this one frame: frames are only drawn on demand.
      el.style.width = `${fitPanel(size, px, py, crtWidth, 0).width}px`;
      el.style.maxHeight = "none";
      const f = fitPanel(size, px, py, crtWidth, el.scrollHeight);
      el.style.maxHeight = `${f.maxHeight}px`;
      el.style.transform = `translate(${f.left}px, ${f.top}px)`;
      markMore(el);
    });
  });
  return null;
}

// The baked room (tools/room/build.py): one mesh whose lighting is already in its texture, so
// it is drawn unlit. Lazy-loaded, so three.js and the model stay out of the first screen.
function BakedRoom({ onLoaded }: { onLoaded: () => void }) {
  const gltf = useLoader(GLTFLoader, roomUrl);
  const scene = useMemo(() => {
    const s = gltf.scene.clone();
    s.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const old = m.material as MeshStandardMaterial;
      m.material = new MeshBasicMaterial({ map: old.map, toneMapped: false });
    });
    return s;
  }, [gltf]);
  useEffect(onLoaded, [onLoaded]);
  return <primitive object={scene} />;
}

// Moves the camera along the tour. Eases toward the scroll position and adds slight mouse
// parallax, unless the visitor prefers reduced motion: then it snaps and holds still.
// The room is drawn only on demand (see Room): this asks for the next frame until the camera
// has arrived, and scrolling or moving the pointer starts it again.
function CameraRig({ progress, reduced }: { progress: MutableRefObject<number>; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("pointermove", redraw, { passive: true });
    return () => { window.removeEventListener("scroll", redraw); window.removeEventListener("pointermove", redraw); };
  }, [invalidate]);
  useFrame(({ camera, pointer, size }, dt) => {
    const { camera: target, look } = tourAt(progress.current, 0, size.width / size.height);
    // dt is large after an idle spell, so cap it: the first frame of a move still eases.
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    const px = reduced ? 0 : pointer.x * 0.3, py = reduced ? 0 : pointer.y * 0.15;
    const dx = target[0] + px - camera.position.x, dy = target[1] + py - camera.position.y, dz = target[2] - camera.position.z;
    camera.position.x += dx * k;
    camera.position.y += dy * k;
    camera.position.z += dz * k;
    camera.lookAt(look[0], look[1], look[2]);
    if (Math.hypot(dx, dy, dz) * (1 - k) > 1e-4) invalidate();
  });
  return null;
}

export default function Room({ onReady, progress, reduced, meter }: {
  onReady: () => void; progress: MutableRefObject<number>; reduced: boolean; meter: MeterLink;
}) {
  return (
    // Drawn on demand, not 60 times a second: the baked room is costly to draw (texture
    // sampling over many layered props) and mostly stands still between stops, so this saves
    // phone batteries and keeps software WebGL (CI, locked-down laptops) from starving the page.
    <Canvas
      frameloop="demand"
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: ENTRANCE.camera, fov: 55 }}
    >
      <CameraRig progress={progress} reduced={reduced} />
      <ScreenPins progress={progress} />
      <Suspense fallback={null}>
        <BakedRoom onLoaded={onReady} />
        <DeskMeter link={meter} reduced={reduced} />
        <Phosphor reduced={reduced} />
        <Rain />
      </Suspense>
    </Canvas>
  );
}
