import { useMemo } from "react";
import { AdditiveBlending, DoubleSide } from "three";
import { canvas, texture } from "./draw";

// ---------------------------------------------------------------- rain on the window
// Drops and the streaks they leave on the glass, catching the city's light. Drawn once.
// Numbers match build.py's window (WIN) in the back wall.
const WIN = { x0: -1.05, x1: 0.2, y0: 1.0, y1: 2.1, z: -1.938 };

function drawRain(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!, w = c.width, h = c.height;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const haze = g.createLinearGradient(0, 0, 0, h); // mist on the glass, thicker low down
  haze.addColorStop(0, "rgba(90,110,150,0.03)"); haze.addColorStop(1, "rgba(90,110,150,0.10)");
  g.fillStyle = haze; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { // streaks: a drop that ran, thin and slightly wavy
    const x = rand() * w, y = rand() * h * 0.8, len = 30 + rand() * 140;
    g.strokeStyle = `rgba(190,205,235,${0.08 + rand() * 0.14})`;
    g.lineWidth = 0.8 + rand() * 1.2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 1; k <= 6; k++) g.lineTo(x + Math.sin(k + i) * 1.5, y + (len * k) / 6);
    g.stroke();
    g.fillStyle = "rgba(220,230,255,0.35)";
    g.beginPath(); g.arc(x, y + len, 1.6 + rand() * 1.4, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 420; i++) { // beads
    const x = rand() * w, y = rand() * h, r = 0.6 + rand() * 1.8;
    g.fillStyle = `rgba(200,215,245,${0.1 + rand() * 0.25})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,240,210,0.5)"; g.fillRect(x - r * 0.4, y - r * 0.5, 0.8, 0.8); // a glint of city light
  }
}

export function Rain() {
  const t = useMemo(() => { const c = canvas(512, 450); drawRain(c); return texture(c); }, []);
  return (
    <mesh position={[(WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, WIN.z]} raycast={() => null} renderOrder={1}>
      <planeGeometry args={[WIN.x1 - WIN.x0, WIN.y1 - WIN.y0]} />
      <meshBasicMaterial map={t} transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
  );
}
