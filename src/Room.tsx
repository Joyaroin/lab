import { Canvas } from "@react-three/fiber";

// Greybox: simple shapes at rough station positions. Lazy-loaded, so three.js stays out of
// the first screen.
const stations: [number, number, number][] = [
  [0, 0.5, 0], [-3, 0.5, -4], [3, 0.5, -8], [-3, 0.5, -12], [3, 0.5, -16], [-3, 0.5, -20], [0, 0.5, -24],
];

export default function Room({ onReady }: { onReady: () => void }) {
  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: [0, 2, 6], fov: 55 }}
      onCreated={onReady}
    >
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
