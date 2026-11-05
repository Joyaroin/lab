import { Canvas, useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { tourAt } from "./tour";

// Greybox: simple shapes at rough station positions. Lazy-loaded, so three.js stays out of
// the first screen.
const stations: [number, number, number][] = [
  [0, 0.5, 0], [-3, 0.5, -4], [3, 0.5, -8], [-3, 0.5, -12], [3, 0.5, -16], [-3, 0.5, -20], [0, 0.5, -24],
];

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
      onCreated={onReady}
    >
      <CameraRig progress={progress} reduced={reduced} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 6, 4]} />
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -12]}>
        <planeGeometry args={[14, 40]} />
        <meshStandardMaterial color="#1a2226" />
      </mesh>
      {stations.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[1.6, 1, 1]} />
          <meshStandardMaterial color={i === 0 ? "#ffb347" : "#3a7d55"} />
        </mesh>
      ))}
    </Canvas>
  );
}
