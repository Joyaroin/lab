import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, SRGBColorSpace, Vector3, type Group } from "three";
import { crts, CRT_GLASS, DESK_METER, type Crt } from "./crts";
import { powerOn, type MeterLink } from "./nixie";
import { stations } from "./content";

// The late-night look, drawn over the baked room (Room.tsx) without making it redraw nonstop.
// Everything here is a few small textured planes drawn once. The only things that move are the
// meter's power-on (about a second and a half, then it stops) and the CRT cursors, which blink
// at LIVING_FPS. Both are off when the visitor prefers reduced motion.
export const LIVING_FPS = 1;

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
const texture = (c: HTMLCanvasElement) => {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

// ---------------------------------------------------------------- the desk meter
// The baked meter (tools/room/build.py) is a walnut case with seven tubes, its digits baked in.
// Each tube gets a glass envelope drawn over it whose texture shows the live digit, so the one
// meter on the desk is the live display. Its place is DESK_METER in crts.ts.
const { position: NX, yaw: NYAW, tubeX: TUBE_X, tubeY: TUBE_Y, tubeR: TUBE_R, tubeH: TUBE_H } = DESK_METER;
const ARC = (2 * Math.PI) / 3;

function drawTube(c: HTMLCanvasElement, digit: string, glow: number) {
  const g = c.getContext("2d")!, w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  // dark glass, opaque over the baked digit, fading out toward the envelope's edges
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, "rgba(14,7,3,0)"); side.addColorStop(0.2, "rgba(14,7,3,1)");
  side.addColorStop(0.8, "rgba(14,7,3,1)"); side.addColorStop(1, "rgba(14,7,3,0)");
  g.fillStyle = side; g.fillRect(0, 0, w, h);
  const warm = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.45);
  warm.addColorStop(0, `rgba(255,110,20,${0.32 * glow})`); warm.addColorStop(1, "rgba(255,110,20,0)");
  g.fillStyle = warm; g.fillRect(0, 0, w, h);
  // the anode mesh: a faint grid of dots in front of the cathodes
  g.fillStyle = "rgba(120,70,35,0.35)";
  for (let y = 6; y < h - 4; y += 6) for (let x = w * 0.25 + ((y / 6) % 2) * 3; x < w * 0.75; x += 6) g.fillRect(x, y, 1.2, 1.2);
  // a plain sans face: monospace zeros are often slashed or dotted, which reads as "@" on a tube
  g.font = `${Math.round(h * 0.8)}px "DejaVu Sans", "Liberation Sans", Arial, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  // the unlit cathodes behind, as a ghost
  g.lineWidth = 1.2; g.strokeStyle = "rgba(110,60,25,0.35)"; g.strokeText("8", w / 2, h * 0.53);
  if (glow > 0) {
    g.shadowColor = `rgba(255,120,20,${glow})`;
    g.shadowBlur = 14 * glow;
    g.lineWidth = 7; g.strokeStyle = `rgba(255,120,25,${0.8 * glow})`; g.strokeText(digit, w / 2, h * 0.53);
    g.shadowBlur = 4 * glow;
    g.lineWidth = 3; g.strokeStyle = `rgba(255,226,180,${glow})`; g.strokeText(digit, w / 2, h * 0.53);
  }
}

function glowTexture(inner: string) {
  const c = canvas(128, 64), g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 32, 2, 64, 32, 64);
  r.addColorStop(0, inner); r.addColorStop(1, "rgba(0,0,0,0)");
  g.setTransform(1, 0, 0, 0.5, 0, 16); // an ellipse, wider than tall
  g.fillStyle = r; g.fillRect(0, -32, 128, 128);
  return texture(c);
}

/** A round glow, bright in the middle and gone at the edge. */
function pointGlowTexture(inner: string, mid: string) {
  const c = canvas(64, 64), g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(0.3, mid); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return texture(c);
}

/** Is the meter's row of tubes fully in the window, big enough to read, and not under a panel? */
function meterInView(camera: import("three").Camera, size: { width: number; height: number }, ends: Vector3[]): boolean {
  const pts = ends.map((v) => {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * size.width, y: (-p.y * 0.5 + 0.5) * size.height, z: p.z };
  });
  if (pts.some((p) => p.z > 1 || p.x < 4 || p.x > size.width - 4 || p.y < 4 || p.y > size.height - 4)) return false;
  if (Math.abs(pts[0].y - pts[1].y) < 14) return false; // a tube under 14 px tall isn't readable
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const box = { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
  for (const el of document.querySelectorAll<HTMLElement>("[data-screen], [data-meter-bar]")) {
    if (el.style.visibility === "hidden" || el.dataset.meterBar === undefined && Number(el.style.opacity) < 0.3) continue;
    const r = el.getBoundingClientRect();
    if (box.l < r.right && box.r > r.left && box.t < r.bottom && box.b > r.top) return false;
  }
  return true;
}

export function DeskMeter({ link, reduced }: { link: MeterLink; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);
  const tubes = useMemo(() => Array.from({ length: 7 }, () => {
    const c = canvas(96, 108);
    drawTube(c, "0", 0);
    return { c, t: texture(c), shown: "" };
  }), []);
  const geometry = useMemo(() => new CylinderGeometry(TUBE_R, TUBE_R, TUBE_H, 16, 1, true, -ARC / 2, ARC), []);
  const halo = useMemo(() => glowTexture("rgba(255,120,30,0.9)"), []);
  const pool = useMemo(() => glowTexture("rgba(255,110,25,0.8)"), []);
  const dotGlow = useMemo(() => pointGlowTexture("rgba(255,150,50,1)", "rgba(255,120,30,0.5)"), []);
  const ends = useMemo(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], []);
  const haloMat = useRef<import("three").MeshBasicMaterial>(null);
  const poolMat = useRef<import("three").MeshBasicMaterial>(null);
  const dotMat = useRef<import("three").MeshBasicMaterial>(null);
  const dotGlowMat = useRef<import("three").MeshBasicMaterial>(null);
  useEffect(() => { link.redraw = invalidate; return () => { link.redraw = undefined; }; }, [link, invalidate]);

  useFrame(({ camera, size, clock }) => {
    if (link.on && link.onAt === null) link.onAt = clock.elapsedTime; // the boot screen just went
    const since = link.onAt === null ? 0 : clock.elapsedTime - link.onAt;
    const s = reduced && link.on ? powerOn(Infinity, link.digits) : powerOn(since, link.digits);
    const digits = s.digits.replace(".", "");
    tubes.forEach((tube, i) => {
      const key = `${digits[i]}:${s.glow.toFixed(2)}`;
      if (tube.shown === key) return;
      drawTube(tube.c, digits[i], s.glow);
      tube.t.needsUpdate = true;
      tube.shown = key;
    });
    if (haloMat.current) haloMat.current.opacity = 0.55 * s.glow;
    if (poolMat.current) poolMat.current.opacity = 0.4 * s.glow;
    if (dotMat.current) dotMat.current.opacity = s.glow;
    if (dotGlowMat.current) dotGlowMat.current.opacity = s.glow;
    if (link.on && !s.done) invalidate(); // keep drawing until the power-on has settled

    const g = group.current;
    if (g) {
      g.updateMatrixWorld();
      ends[0].set(TUBE_X(0), TUBE_Y - TUBE_H / 2, 0.03); ends[1].set(TUBE_X(0), TUBE_Y + TUBE_H / 2, 0.03);
      ends[2].set(TUBE_X(6), TUBE_Y - TUBE_H / 2, 0.03); ends[3].set(TUBE_X(6), TUBE_Y + TUBE_H / 2, 0.03);
      const world = ends.map((v) => v.clone().applyMatrix4(g.matrixWorld));
      const bar = document.querySelector<HTMLElement>("[data-meter-bar]");
      if (bar) bar.dataset.deskMeter = meterInView(camera, size, world) ? "in-view" : "out-of-view";
    }
  });

  return (
    <group ref={group} position={NX} rotation={[0, NYAW, 0]}
      onClick={(e) => { e.stopPropagation(); link.next(); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      {tubes.map((tube, i) => (
        <mesh key={i} geometry={geometry} position={[TUBE_X(i), TUBE_Y, 0]}>
          <meshBasicMaterial map={tube.t} transparent toneMapped={false} />
        </mesh>
      ))}
      {/* the decimal point between the first two tubes, lit with them: a small hot core that
          reads as a point up close, in a soft halo that keeps it visible from across the room */}
      <mesh position={[-0.15, 0.108, 0.027]} raycast={() => null}>
        <circleGeometry args={[0.0035, 16]} />
        <meshBasicMaterial ref={dotMat} color="#ffd9a0" transparent opacity={0} toneMapped={false} />
      </mesh>
      <mesh position={[-0.15, 0.108, 0.028]} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[0.04, 0.04]} />
        <meshBasicMaterial ref={dotGlowMat} map={dotGlow} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* bloom: a soft amber haze in front of the tubes, and the light they throw on the desk */}
      <mesh position={[0, TUBE_Y, 0.05]} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[0.62, 0.26]} />
        <meshBasicMaterial ref={haloMat} map={halo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.003, 0.16]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={() => null}>
        <planeGeometry args={[0.7, 0.3]} />
        <meshBasicMaterial ref={poolMat} map={pool} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- CRT phosphor
// The baked glass is a flat green block. Each CRT gets a phosphor screen over it: a dark glass
// whose centre glows, scanlines, darker curved corners, and a few lines of dim terminal text
// with a blinking cursor. The lines are the station's `terminal` copy in the content module.
// The station's own text is the HTML panel pinned on top (Room.tsx).

function drawPhosphor(c: HTMLCanvasElement, lines: string[], cursor: boolean) {
  const g = c.getContext("2d")!, w = c.width, h = c.height;
  g.fillStyle = "#020a05"; g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.62);
  glow.addColorStop(0, "#0f3d22"); glow.addColorStop(0.6, "#082513"); glow.addColorStop(1, "#010603");
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  g.font = `${Math.round(h / 12)}px "DejaVu Sans Mono", ui-monospace, monospace`;
  g.textBaseline = "top";
  g.shadowColor = "rgba(90,255,150,0.9)"; g.shadowBlur = 6;
  g.fillStyle = "#7dffb0";
  const lh = h / 9;
  lines.forEach((l, i) => {
    const text = l.endsWith("_") ? l.slice(0, -1) : l;
    g.fillText(text, w * 0.09, h * 0.12 + i * lh);
    if (l.endsWith("_") && cursor) g.fillRect(w * 0.09 + g.measureText(text).width, h * 0.12 + i * lh, h / 22, h / 13);
  });
  g.shadowBlur = 0;
  g.fillStyle = "rgba(0,0,0,0.35)"; // scanlines
  for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
  // the tube's curve: corners fall off into the bezel
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.68);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.85)");
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  const sheen = g.createLinearGradient(0, 0, w, h); // a faint reflection on the glass
  sheen.addColorStop(0, "rgba(200,255,220,0.07)"); sheen.addColorStop(0.35, "rgba(200,255,220,0)");
  g.fillStyle = sheen; g.fillRect(0, 0, w, h);
}

function phosphorFrame(crt: Crt) {
  const a = (crt.yaw * Math.PI) / 180, d = 0.0062; // just in front of the baked glass
  return { position: [crt.screen[0] + Math.sin(a) * d, crt.screen[1], crt.screen[2] + Math.cos(a) * d] as const, yaw: a };
}

export function Phosphor({ reduced }: { reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const screens = useMemo(() => crts.map((crt) => {
    const c = canvas(320, 250);
    const lines = [...(stations.find((s) => s.id === crt.id)?.terminal ?? []), "$ _"];
    drawPhosphor(c, lines, true);
    return { crt, c, t: texture(c), lines };
  }), []);
  useEffect(() => {
    if (reduced) return;
    let on = true;
    const id = setInterval(() => {
      if (document.hidden) return;
      on = !on;
      for (const s of screens) { drawPhosphor(s.c, s.lines, on); s.t.needsUpdate = true; }
      invalidate();
    }, 1000 / LIVING_FPS);
    return () => clearInterval(id);
  }, [screens, reduced, invalidate]);
  return (
    <>
      {screens.map(({ crt, t }) => {
        const f = phosphorFrame(crt);
        return (
          <mesh key={crt.id} position={[...f.position]} rotation={[0, f.yaw, 0]} raycast={() => null}>
            <planeGeometry args={[CRT_GLASS.width - 0.012, CRT_GLASS.height - 0.012]} />
            <meshBasicMaterial map={t} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

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
