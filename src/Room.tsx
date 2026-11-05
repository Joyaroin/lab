import { Canvas, useFrame } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { Vector3 } from "three";
import { stations as content } from "./content";
import { stopPosition, tourAt, STATION_COUNT } from "./tour";

// Each station's CRT hangs in front of the camera's stop for it.
const SCREEN_W = 3.2, SCREEN_H = 2;
const screenAt = (i: number): [number, number, number] => {
  const [x, , z] = stopPosition(i);
  return [x, 1.6, z - 5];
};

// Pins each station's HTML panel (a DOM element with data-screen="<id>") to its CRT: every
// frame it projects the screen into the window and moves the element there. The text stays
// real HTML, so it is sharp at any size, selectable, and its links work. Only the panel for
// the station the camera is at is shown.
function ScreenPins({ progress }: { progress: MutableRefObject<number> }) {
  const v = new Vector3();
  useFrame(({ camera, size }) => {
    const at = progress.current * STATION_COUNT;
    content.forEach((s, k) => {
      const el = document.querySelector<HTMLElement>(`[data-screen="${s.id}"]`);
      if (!el) return;
      const strength = Math.max(0, 1 - Math.abs(at - (k + 1)) * 3);
      el.style.opacity = String(strength);
      el.style.visibility = strength < 0.05 ? "hidden" : "visible";
      el.style.pointerEvents = strength > 0.6 ? "auto" : "none";
      const [x, y, z] = screenAt(k + 1);
      v.set(x, y, z).project(camera);
      const left = v.clone().set(x - SCREEN_W / 2, y, z).project(camera);
      const right = v.clone().set(x + SCREEN_W / 2, y, z).project(camera);
      const projected = ((right.x - left.x) / 2) * size.width;
      const width = Math.min(Math.max(projected, Math.min(352, size.width * 0.92)), size.width * 0.92, 640);
      v.set(x, y, z).project(camera);
      const px = (v.x * 0.5 + 0.5) * size.width, py = (-v.y * 0.5 + 0.5) * size.height;
      el.style.width = `${width}px`;
      el.style.maxHeight = `${Math.max(120, size.height - 190)}px`;
      el.style.transform = `translate(${px - width / 2}px, ${py}px) translateY(-50%)`;
    });
  });
  return null;
}

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
      <ScreenPins progress={progress} />
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
      {content.map((s, k) => (
        <group key={s.id} position={screenAt(k + 1)}>
          <mesh position={[0, 0, -0.08]}>
            <boxGeometry args={[SCREEN_W + 0.3, SCREEN_H + 0.3, 0.15]} />
            <meshStandardMaterial color="#14181a" />
          </mesh>
          <mesh>
            <planeGeometry args={[SCREEN_W, SCREEN_H]} />
            <meshBasicMaterial color="#0b2416" />
          </mesh>
        </group>
      ))}
    </Canvas>
  );
}
