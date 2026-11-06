import { useFrame, useThree } from "@react-three/fiber";
import { createRef, useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, SRGBColorSpace, Vector3, type Camera, type Mesh, type MeshBasicMaterial } from "three";
import { textOnGlass } from "./tour";
import { crts, CRT_GLASS, DESK_METER, type Crt } from "./crts";
import { powerOn, shiftDigits, type MeterLink } from "./nixie";
import { stations } from "./content";

// The late-night look, drawn over the baked room (Room.tsx) without making it redraw nonstop.
// Everything here is a few small textured planes drawn once. The only things that move are the
// meter's power-on, about a second and a half, then it stops. At rest the scene draws nothing.
// It is off when the visitor prefers reduced motion.

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
function meterInView(camera: Camera, size: { width: number; height: number }, ends: Vector3[]): boolean {
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
  const tubes = useMemo(() => Array.from({ length: 7 }, () => {
    const c = canvas(96, 108);
    drawTube(c, "0", 0);
    return { c, t: texture(c), shown: "" };
  }), []);
  const geometry = useMemo(() => new CylinderGeometry(DESK_METER.tubeR, DESK_METER.tubeR, DESK_METER.tubeH, 16, 1, true, -ARC / 2, ARC), []);
  const halo = useMemo(() => glowTexture("rgba(255,120,30,0.9)"), []);
  const pool = useMemo(() => glowTexture("rgba(255,110,25,0.8)"), []);
  const dotGlow = useMemo(() => pointGlowTexture("rgba(255,150,50,1)", "rgba(255,120,30,0.5)"), []);
  const ends = useMemo(() => DESK_METER.tubeEnds().map((v) => new Vector3(...v)), []); // the meter never moves
  const haloMat = useRef<MeshBasicMaterial>(null);
  const poolMat = useRef<MeshBasicMaterial>(null);
  const dotMat = useRef<MeshBasicMaterial>(null);
  const dotGlowMat = useRef<MeshBasicMaterial>(null);
  useEffect(() => { link.redraw = invalidate; return () => { link.redraw = undefined; }; }, [link, invalidate]);

  useFrame(({ camera, size, clock }) => {
    if (link.on && link.onAt === null) link.onAt = clock.elapsedTime; // the boot screen just went
    const since = link.onAt === null ? 0 : clock.elapsedTime - link.onAt;
    const s = reduced && link.on ? powerOn(Infinity, link.digits) : powerOn(since, link.digits);
    let shifting = false;
    if (link.shift && !reduced && s.done) {
      if (link.shiftAt === null) link.shiftAt = clock.elapsedTime;
      const sh = shiftDigits(clock.elapsedTime - link.shiftAt, link.digits, link.shift);
      if (sh.done) { link.shift = null; link.shiftAt = null; } else { s.digits = sh.digits; shifting = true; }
    } else if (link.shift && reduced) { link.shift = null; link.shiftAt = null; } // reduced motion: no shift, show the plain reading
    // (while the power-on is still running the shift stays pending and plays when it ends: the tour's
    // quiet period is timed from when the tour mounts, the power-on from the first frame after, which
    // on a slow device is later)
    const digits = s.digits.replace(".", "");
    tubes.forEach((tube, i) => {
      // an unlit tube shows no digit, so it needs no redraw as the random digits change
      const key = `${s.glow > 0 ? digits[i] : ""}:${s.glow.toFixed(2)}`;
      if (tube.shown === key) return;
      drawTube(tube.c, digits[i], s.glow);
      tube.t.needsUpdate = true;
      tube.shown = key;
    });
    if (haloMat.current) haloMat.current.opacity = 0.55 * s.glow;
    if (poolMat.current) poolMat.current.opacity = 0.4 * s.glow;
    if (dotMat.current) dotMat.current.opacity = s.glow;
    if (dotGlowMat.current) dotGlowMat.current.opacity = s.glow;
    if (link.on && (!s.done || shifting)) invalidate(); // keep drawing until the power-on or shift has settled

    const bar = document.querySelector<HTMLElement>("[data-meter-bar]");
    if (bar) bar.dataset.deskMeter = meterInView(camera, size, ends) ? "in-view" : "out-of-view";
  });

  return (
    <group position={DESK_METER.position} rotation={[0, DESK_METER.yaw, 0]}
      onClick={(e) => { e.stopPropagation(); link.next(); }}
      onPointerOver={() => { document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = ""; }}>
      {tubes.map((tube, i) => (
        <mesh key={i} geometry={geometry} position={[DESK_METER.tubeX(i), DESK_METER.tubeY, 0]}>
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
      <mesh position={[0, DESK_METER.tubeY, 0.05]} renderOrder={2} raycast={() => null}>
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
// whose centre glows, scanlines and darker curved corners. While you aren't at that station it
// also carries a title card: the station's world line over its name, big enough to read from the
// wide view. Both lines come from the content module (worldLine and name); no copy is held here.
// Nothing on the card moves or reads as live. The station's own text is the HTML panel pinned on
// top (Room.tsx), and the card is swapped for the clear glass while that text is showing.

const MONO = '"DejaVu Sans Mono", ui-monospace, monospace';

function drawPhosphor(c: HTMLCanvasElement, card?: { worldLine: string; name: string }) {
  const g = c.getContext("2d")!, w = c.width, h = c.height;
  g.fillStyle = "#020a05"; g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.62);
  glow.addColorStop(0, "#0f3d22"); glow.addColorStop(0.6, "#082513"); glow.addColorStop(1, "#010603");
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  if (card) {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(90,255,150,0.9)"; g.shadowBlur = 8;
    g.fillStyle = "#7dffb0";
    // Each line is as large as fits inside the visible part of the glass, up to a cap.
    const fit = (text: string, cap: number) => {
      g.font = `bold ${cap}px ${MONO}`;
      const wide = g.measureText(text).width;
      return Math.floor(wide > w * 0.8 ? (cap * w * 0.8) / wide : cap);
    };
    const small = fit(card.worldLine, h / 8);
    g.font = `bold ${small}px ${MONO}`; g.fillText(card.worldLine, w / 2, h * 0.34);
    const big = fit(card.name, h / 5);
    g.font = `bold ${big}px ${MONO}`; g.fillText(card.name, w / 2, h * 0.56);
    g.shadowBlur = 0;
    g.fillRect(w * 0.15, h * 0.44, w * 0.7, Math.max(2, h / 120)); // rule between the lines
  }
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

/** How much smaller than the glass the phosphor plane is, so it stays inside the bezel. */
const PLANE_INSET = 0.012;

function phosphorFrame(crt: Crt) {
  const a = (crt.yaw * Math.PI) / 180, d = 0.0062; // just in front of the baked glass
  return { position: [crt.screen[0] + Math.sin(a) * d, crt.screen[1], crt.screen[2] + Math.cos(a) * d] as const, yaw: a };
}

export function Phosphor({ progress }: { progress: { current: number } }) {
  const screens = useMemo(() => crts.map((crt) => {
    const station = stations.find((s) => s.id === crt.id);
    const c = canvas(640, 500);
    drawPhosphor(c, station);
    // the same glass with no card, shown while the station's own text is on it
    const clear = canvas(640, 500);
    drawPhosphor(clear);
    return { crt, t: texture(c), clear: texture(clear), mats: createRef<MeshBasicMaterial>(), mesh: createRef<Mesh>() };
  }), []);
  useFrame(({ size }) => {
    screens.forEach((s, k) => {
      const m = s.mats.current, mesh = s.mesh.current;
      if (!m || !mesh) return;
      const clear = textOnGlass(progress.current, k + 1, size.width / size.height);
      const map = clear ? s.clear : s.t;
      if (m.map !== map) { m.map = map; m.needsUpdate = true; }
      // While the text is on the glass, the plane runs out to the glass edge: otherwise the flat
      // baked glass shows in the gap around it as a bright rim (the card used to hide that).
      const grow = clear ? CRT_GLASS.width / (CRT_GLASS.width - PLANE_INSET) : 1;
      if (mesh.scale.x !== grow) mesh.scale.set(grow, clear ? CRT_GLASS.height / (CRT_GLASS.height - PLANE_INSET) : 1, 1);
    });
  });
  return (
    <>
      {screens.map(({ crt, t, mats, mesh }) => {
        const f = phosphorFrame(crt);
        return (
          <mesh key={crt.id} ref={mesh} position={[...f.position]} rotation={[0, f.yaw, 0]} raycast={() => null}>
            <planeGeometry args={[CRT_GLASS.width - PLANE_INSET, CRT_GLASS.height - PLANE_INSET]} />
            <meshBasicMaterial ref={mats} map={t} toneMapped={false} />
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
