import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, type MutableRefObject } from "react";
import { MeshBasicMaterial, Vector3, type Mesh, type MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import roomUrl from "./assets/room.glb?url";
import { CAMERA_FOV, crts, ENTRANCE, glassEdge, isPortrait, panelPoint } from "./crts";
import { glassBox } from "./glass";
import { fitPanel, glassFontSize } from "./pin";
import { PANEL_SHOWN, panelStrength, parallax, textOnGlass, parallaxStrength, tourAt } from "./tour";
import { Bezels, DeskMeter, Phosphor, Rain } from "./Effects";
import type { MeterLink } from "./nixie";
import type { TextGate } from "./shift";
import { markMore } from "./ScreenPanels";

// Pins each station's HTML panel (a DOM element with data-screen="<id>") to its real CRT in the
// baked room: every frame it projects the CRT's panel point (room-layout.json, via crts.ts) into
// the window and places the panel there (on a phone, the station's phone pin if it has one), as
// wide as the CRT looks, kept inside the window by fitPanel. The text stays real HTML, so it is
// sharp at any size, selectable, and its links work. Only the current station's panel is shown.
function ScreenPins({ progress, gate }: { progress: MutableRefObject<number>; gate: TextGate }) {
  const c = useMemo(() => new Vector3(), []);
  const e = useMemo(() => new Vector3(), []);
  const p = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld(); // CameraRig just moved it; project from where it is now
    crts.forEach((crt, k) => {
      const el = document.querySelector<HTMLElement>(`[data-screen="${crt.id}"]`);
      if (!el) return;
      // Full for the whole hold. Held back (but still in the page, for readers, selection and search)
      // from arrival until the shift ends, then it resolves out of the effect.
      const strength = panelStrength(progress.current, k + 1);
      const out = gate.ready(k + 1, progress.current, performance.now());
      if (out && el.dataset.gated === "true") el.dataset.gated = "resolving";
      else if (!out && strength >= PANEL_SHOWN) el.dataset.gated = "true";
      else if (!out) delete el.dataset.gated;
      el.style.opacity = String(out ? strength : 0);
      el.style.visibility = strength < PANEL_SHOWN ? "hidden" : "visible";
      el.style.pointerEvents = out && strength > 0.6 ? "auto" : "none";
      if (strength < PANEL_SHOWN) return;
      if (textOnGlass(progress.current, k + 1, size.width / size.height)) {
        // Desktop: the camera is square to the glass, so the text is laid exactly over it.
        const { left, top, width, height } = glassBox(crt, camera, size);
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        if (el.style.maxHeight !== "none") el.style.maxHeight = "none"; // the fixed height is the limit
        el.style.fontSize = `${glassFontSize(width)}px`;
        el.dataset.glass = "true";
        el.style.transform = `translate(${left}px, ${top}px)`;
        markMore(el);
        return;
      }
      el.style.height = "";
      el.style.fontSize = "";
      delete el.dataset.glass;
      const [x, y, z] = crt.screen;
      c.set(x, y, z).project(camera);
      e.set(...glassEdge(crt)).project(camera);
      p.set(...panelPoint(crt, size.width / size.height)).project(camera);
      const px = (p.x * 0.5 + 0.5) * size.width, py = (-p.y * 0.5 + 0.5) * size.height;
      const crtWidth = Math.hypot((e.x - c.x) * size.width, (e.y - c.y) * size.height);
      // Set the width first, then measure the natural height at that width and fit, so the
      // panel settles in this one frame: frames are only drawn on demand.
      el.style.width = `${fitPanel(size, px, py, crtWidth, 0).width}px`;
      // With no height limit nothing overflows, so the browser resets scrollTop to 0: keep it and
      // put it back once the limit is restored (it is clamped to the new range if the panel shrank).
      const kept = el.scrollTop;
      el.style.maxHeight = "none";
      const f = fitPanel(size, px, py, crtWidth, el.scrollHeight);
      el.style.maxHeight = `${f.maxHeight}px`;
      el.scrollTop = kept;
      el.style.transform = `translate(${f.left}px, ${f.top}px)`;
      markMore(el);
    });
  });
  return null;
}

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

// Moves the camera along the tour. Eases toward the scroll position and adds slight mouse
// parallax, unless the visitor prefers reduced motion: then it snaps, holds still, and travels in
// a straight line between stations (the leg from the entrance still curves).
// It writes the camera position to the canvas's data-camera, so tests can check the path. That
// ships in the live site on purpose: it is three numbers the visitor can already see, one attribute
// write per drawn frame, and tests of the real build need it. (Keeping it out of production would
// mean testing a different build from the one that ships.)
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
  useFrame(({ gl, camera, pointer, size }, dt) => {
    const { camera: target, look } = tourAt(progress.current, 0, size.width / size.height, size.height, reduced);
    // dt is large after an idle spell, so cap it: the first frame of a move still eases.
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    const [px, py, pz] = reduced ? [0, 0, 0] : parallax(target, look, pointer, isPortrait(size.width / size.height) ? 1 : parallaxStrength(progress.current)); // phones are unchanged
    const dx = target[0] + px - camera.position.x, dy = target[1] + py - camera.position.y, dz = target[2] + pz - camera.position.z;
    camera.position.x += dx * k;
    camera.position.y += dy * k;
    camera.position.z += dz * k;
    camera.lookAt(look[0], look[1], look[2]);
    gl.domElement.dataset.camera = [camera.position.x, camera.position.y, camera.position.z].join(",");
    if (Math.hypot(dx, dy, dz) * (1 - k) > 1e-4) invalidate();
  });
  return null;
}

export default function Room({ onReady, onProgress, progress, reduced, meter, gate }: {
  onReady: () => void; onProgress: () => void; progress: MutableRefObject<number>; reduced: boolean; meter: MeterLink; gate: TextGate;
}) {
  return (
    // Drawn on demand, not 60 times a second: the baked room is costly to draw (texture
    // sampling over many layered props) and mostly stands still between stops, so this saves
    // phone batteries and keeps software WebGL (CI, locked-down laptops) from starving the page.
    <Canvas
      frameloop="demand"
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: ENTRANCE.camera, fov: CAMERA_FOV }}
    >
      <CameraRig progress={progress} reduced={reduced} />
      <ScreenPins progress={progress} gate={gate} />
      <Suspense fallback={null}>
        <BakedRoom onLoaded={onReady} onProgress={onProgress} />
        <DeskMeter link={meter} reduced={reduced} />
        <Phosphor progress={progress} />
        <Bezels />
        <Rain />
      </Suspense>
    </Canvas>
  );
}
