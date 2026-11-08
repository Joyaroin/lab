import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, type MutableRefObject } from "react";
import { MeshBasicMaterial, type Mesh, type MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import roomUrl from "./assets/room.glb?url";
import { CAMERA_FOV, ENTRANCE } from "./crts";
import { framingFor } from "./framing";
import { parallax } from "./tour";
import type { Where } from "./where";
import { Bezels, DeskMeter, Phosphor, Rain } from "./Effects";
import type { MeterLink } from "./nixie";
import type { Shift } from "./shift";
import { TextPins } from "./text/TextPins";

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
function CameraRig({ where, reduced }: { where: MutableRefObject<Where>; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const redraw = () => invalidate();
    window.addEventListener("scroll", redraw, { passive: true });
    window.addEventListener("pointermove", redraw, { passive: true });
    return () => { window.removeEventListener("scroll", redraw); window.removeEventListener("pointermove", redraw); };
  }, [invalidate]);
  useFrame(({ gl, camera, pointer, size }, dt) => {
    const framing = framingFor(size);
    const { camera: target, look } = framing.cameraAt(where.current, reduced);
    // dt is large after an idle spell, so cap it: the first frame of a move still eases.
    const k = reduced ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 6);
    const [px, py, pz] = reduced ? [0, 0, 0] : parallax(target, look, pointer, framing.parallaxStrength(where.current));
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

export default function Room({ onReady, onProgress, where, reduced, meter, shift }: {
  onReady: () => void; onProgress: () => void; where: MutableRefObject<Where>; reduced: boolean; meter: MeterLink; shift: Shift;
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
      <CameraRig where={where} reduced={reduced} />
      <TextPins where={where} shift={shift} />
      <Suspense fallback={null}>
        <BakedRoom onLoaded={onReady} onProgress={onProgress} />
        <DeskMeter link={meter} shift={shift} reduced={reduced} />
        <Phosphor where={where} />
        <Bezels />
        <Rain />
      </Suspense>
    </Canvas>
  );
}
