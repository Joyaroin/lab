import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, type MutableRefObject } from "react";
import { MeshBasicMaterial, Vector3, type Mesh, type MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import roomUrl from "./assets/room.glb?url";
import { crts, glassEdge } from "./crts";
import { fitPanel } from "./pin";
import { STATION_COUNT, tourAt } from "./tour";
import { ENTRANCE } from "./crts";

// Pins each station's HTML panel (a DOM element with data-screen="<id>") to its real CRT in the
// baked room: every frame it projects the CRT (positions in crts.ts) into the window and places
// the panel there, kept inside the window by fitPanel. The text stays real HTML, so it is sharp
// at any size, selectable, and its links work. Only the current station's panel is shown.
function ScreenPins({ progress }: { progress: MutableRefObject<number> }) {
  const c = useMemo(() => new Vector3(), []);
  const e = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
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
      const px = (c.x * 0.5 + 0.5) * size.width, py = (-c.y * 0.5 + 0.5) * size.height;
      const crtWidth = Math.hypot((e.x - c.x) * size.width, (e.y - c.y) * size.height);
      el.style.maxHeight = "none"; // measure the natural height, then fit
      const f = fitPanel(size, px, py, crtWidth, el.scrollHeight);
      el.style.width = `${f.width}px`;
      el.style.maxHeight = `${f.maxHeight}px`;
      el.style.transform = `translate(${f.left}px, ${f.top}px)`;
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
function CameraRig({ progress, reduced }: { progress: MutableRefObject<number>; reduced: boolean }) {
  useFrame(({ camera, pointer }, dt) => {
    const { camera: target, look } = tourAt(progress.current, 0);
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
    const px = reduced ? 0 : pointer.x * 0.3, py = reduced ? 0 : pointer.y * 0.15;
    camera.position.x += (target[0] + px - camera.position.x) * k;
    camera.position.y += (target[1] + py - camera.position.y) * k;
    camera.position.z += (target[2] - camera.position.z) * k;
    camera.lookAt(look[0], look[1], look[2]);
  });
  return null;
}

export default function Room({ onReady, progress, reduced }: {
  onReady: () => void; progress: MutableRefObject<number>; reduced: boolean;
}) {
  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: ENTRANCE.camera, fov: 55 }}
    >
      <CameraRig progress={progress} reduced={reduced} />
      <ScreenPins progress={progress} />
      <Suspense fallback={null}>
        <BakedRoom onLoaded={onReady} />
      </Suspense>
    </Canvas>
  );
}
