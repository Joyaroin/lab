import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { MeshBasicMaterial, type Mesh, type MeshStandardMaterial, type PerspectiveCamera } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import roomUrl from "./assets/room.glb?url";
import { OVERVIEW } from "./crts";
import { FADE_MS, type Visit } from "./visit";
import { framingFor } from "./framing";
import { parallax } from "./tour";
import type { Where } from "./where";
import { Bezels, DeskMeter, Phosphor, Rain, TvTargets } from "./Effects";
import type { MeterLink } from "./nixie";
import type { Shift } from "./shift";
import { TextPins } from "./text/TextPins";

type V3 = [number, number, number];

// The baked room (tools/room/build.py): one mesh whose lighting is already in its texture, so
// it is drawn unlit. Lazy-loaded, so three.js and the model stay out of the first screen.
function BakedRoom({ onLoaded, onProgress }: { onLoaded: () => void; onProgress: () => void }) {
  const gltf = useLoader(GLTFLoader, roomUrl, undefined, onProgress);
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

// Moves the camera with the visit. Each frame it reads `visit.where(now)` (the visit has no timer: this read is
// what notices a landing), puts the camera on the framing's pose for it (a flight is `flightPose` from where the
// camera really began, with its field of view eased too), and adds slight mouse parallax, unless the visitor
// prefers reduced motion: then it holds still. The parallax eases in and out on its own.
// It writes the camera position to the canvas's data-camera, so tests can check the path. That
// ships in the live site on purpose: it is three numbers the visitor can already see, one attribute
// write per drawn frame, and tests of the real build need it. (Keeping it out of production would
// mean testing a different build from the one that ships.)
// The room is drawn only on demand (see Room): this asks for the next frame while a move runs or the
// parallax is still easing, and a move starting or the pointer moving starts it again. The wheel never moves the camera.
function CameraRig({ visit, where, reduced, cover }: { visit: Visit; where: MutableRefObject<Where>; reduced: boolean; cover: MutableRefObject<HTMLDivElement | null> }) {
  const invalidate = useThree((s) => s.invalidate);
  const covered = useRef(0); // the cover's opacity now
  const offset = useRef<V3>([0, 0, 0]); // the parallax now, eased toward the pointer's
  useEffect(() => {
    const redraw = () => invalidate();
    window.addEventListener("pointermove", redraw, { passive: true });
    const off = visit.subscribe(redraw);
    return () => { window.removeEventListener("pointermove", redraw); off(); };
  }, [invalidate, visit]);
  useFrame(({ gl, camera, pointer, size }, dt) => {
    const framing = framingFor(size);
    const nowMs = performance.now();
    const w = visit.where(nowMs);
    where.current = w;
    const { camera: target, look, fov } = framing.cameraAt(w, visit.launch(nowMs));
    // dt is large after an idle spell, so cap it: the first frame of a move still eases.
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    const [px, py, pz] = reduced ? [0, 0, 0] : parallax(target, look, pointer, framing.parallaxStrength(w));
    const o = offset.current;
    const dx = px - o[0], dy = py - o[1], dz = pz - o[2];
    o[0] += dx * k; o[1] += dy * k; o[2] += dz * k;
    // A parallax that is on its way to nothing (a landing at a station) stops easing once it is a couple of
    // millimetres off, so the tail of it does not keep the room drawing frames.
    const tail = Math.hypot(px, py, pz) < 1e-9 && Math.hypot(o[0], o[1], o[2]) < 2e-3;
    if (tail) { o[0] = o[1] = o[2] = 0; }
    camera.position.set(target[0] + o[0], target[1] + o[1], target[2] + o[2]);
    camera.lookAt(look[0], look[1], look[2]);
    const cam = camera as PerspectiveCamera;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    gl.domElement.dataset.camera = [camera.position.x, camera.position.y, camera.position.z].join(",");
    // A move is running while flying, before a cut's midpoint, and through a fade's second half (fade > 0): frames
    // must go on until the landing, which only this read notices.
    // The reduced-motion fade's cover. The cover never jumps: it follows the visit's fade() but may fall no faster
    // than a fade's own half (a move begun after the cut makes fade() drop from near 0.8 to 0 in one frame, #160).
    const want = visit.fade(nowMs);
    const fall = Math.min(dt, 0.1) / (FADE_MS / 2000);
    covered.current = want >= covered.current ? want : Math.max(want, covered.current - fall);
    if (cover.current) cover.current.style.opacity = String(covered.current);
    const moving = covered.current > 0 || w.kind === "flying" || w.stop !== visit.target() || visit.fade(nowMs) > 0;
    if (moving || (!tail && Math.hypot(dx, dy, dz) * (1 - k) > 1e-4)) invalidate();
  });
  return null;
}

export default function Room({ onReady, onProgress, visit, where, reduced, meter, shift }: {
  onReady: () => void; onProgress: () => void; visit: Visit; where: MutableRefObject<Where>; reduced: boolean; meter: MeterLink; shift: Shift;
}) {
  const cover = useRef<HTMLDivElement | null>(null);
  return (
    <>
    {/* Drawn on demand, not 60 times a second: the baked room is costly to draw (texture
        sampling over many layered props) and mostly stands still between stops, so this saves
        phone batteries and keeps software WebGL (CI, locked-down laptops) from starving the page. */}
    <Canvas
      frameloop="demand"
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: OVERVIEW.camera, fov: OVERVIEW.fov }}
    >
      <CameraRig visit={visit} where={where} reduced={reduced} cover={cover} />
      <TextPins where={where} shift={shift} />
      <Suspense fallback={null}>
        <BakedRoom onLoaded={onReady} onProgress={onProgress} />
        <DeskMeter link={meter} shift={shift} reduced={reduced} />
        <Phosphor where={where} />
        <Bezels />
        <TvTargets visit={visit} where={where} reduced={reduced} />
        <Rain />
      </Suspense>
    </Canvas>
    {/* The reduced-motion fade: a dark cover over the room and its text, under the HUD. CameraRig sets its opacity. */}
    <div ref={cover} data-fade-cover aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: 15, background: "#05080a", opacity: 0, pointerEvents: "none" }} />
    </>
  );
}
