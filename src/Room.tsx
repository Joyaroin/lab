import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, type MutableRefObject } from "react";
import { MeshBasicMaterial, type Mesh, type MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import roomUrl from "./assets/room.glb?url";
import { tourAt } from "./tour";

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
    const target = tourAt(progress.current, 0).camera;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
    const px = reduced ? 0 : pointer.x * 0.3, py = reduced ? 0 : pointer.y * 0.15;
    camera.position.x += (target[0] + px - camera.position.x) * k;
    camera.position.y += (target[1] + py - camera.position.y) * k;
    camera.position.z += (target[2] - camera.position.z) * k;
    camera.lookAt(camera.position.x * 0.5, 1, camera.position.z - 6);
  });
  return null;
}

export default function Room({ onReady, progress, reduced }: {
  onReady: () => void; progress: MutableRefObject<number>; reduced: boolean;
}) {
  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: [0, 2, 6], fov: 55 }}
    >
      <CameraRig progress={progress} reduced={reduced} />
      <Suspense fallback={null}>
        <BakedRoom onLoaded={onReady} />
      </Suspense>
    </Canvas>
  );
}
