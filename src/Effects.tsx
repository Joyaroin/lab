import { useFrame, useThree } from "@react-three/fiber";
import { createRef, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, SRGBColorSpace, Vector3, type Camera, type Mesh, type MeshBasicMaterial } from "three";
import { framingFor } from "./framing";
import type { Where } from "./where";
import { textCovers } from "./text/place";
import { crts, CRT_GLASS, DESK_METER, NOTE_AT, PLATE_AT, type Crt } from "./crts";
import { powerOn, shiftDigits, type MeterLink } from "./nixie";
import type { Shift } from "./shift";
import { stations } from "./content";
import { CARD_PX, MONO, drawPhosphor } from "./card";

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
    if (el.dataset.meterBar === undefined ? !textCovers(el) : el.style.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (box.l < r.right && box.r > r.left && box.t < r.bottom && box.b > r.top) return false;
  }
  return true;
}

export function DeskMeter({ link, shift, reduced }: { link: MeterLink; shift: Shift; reduced: boolean }) {
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
  useEffect(() => shift.setWake(invalidate), [shift, invalidate]); // the shift wakes the room through this
  const played = useRef<{ id: number; at: number; done: boolean } | null>(null); // this meter's clock for the shift it is playing

  useFrame(({ camera, size, clock }) => {
    if (link.on && link.onAt === null) { link.onAt = clock.elapsedTime; shift.powerOnBegan(performance.now()); } // the boot screen just went
    const since = link.onAt === null ? 0 : clock.elapsedTime - link.onAt;
    const s = reduced && link.on ? powerOn(Infinity, link.digits) : powerOn(since, link.digits);
    let shifting = false;
    // The shift module decides whether a shift plays (power-on hold, reduced motion, leaving); this only draws it.
    const play = reduced ? null : shift.playing;
    if (play && played.current?.id !== play.id) played.current = { id: play.id, at: clock.elapsedTime, done: false };
    if (!play) played.current = null;
    if (play && played.current && !played.current.done) {
      const step = shiftDigits(clock.elapsedTime - played.current.at, link.digits, play.kind);
      if (step.done) played.current.done = true; else { s.digits = step.digits; shifting = true; }
    }
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

/** How much smaller than the glass the phosphor plane is, so it stays inside the bezel. */
const PLANE_INSET = 0.012;
/** How far in front of the baked glass the screen layer stands (metres). The bezel layer and its
 *  edge are measured from this. */
const SCREEN_LAYER = 0.0062;
/** How far in front of the screen layer the bezel layer stands. */
const BEZEL_GAP = 0.0016;

function phosphorFrame(crt: Crt) {
  const a = (crt.yaw * Math.PI) / 180, d = SCREEN_LAYER; // just in front of the baked glass
  return { position: [crt.screen[0] + Math.sin(a) * d, crt.screen[1], crt.screen[2] + Math.cos(a) * d] as const, yaw: a };
}

export function Phosphor({ where }: { where: MutableRefObject<Where> }) {
  const invalidate = useThree((s) => s.invalidate);
  const screens = useMemo(() => crts.map((crt) => {
    const station = stations.find((s) => s.id === crt.id);
    const c = canvas(CARD_PX.width, CARD_PX.height);
    drawPhosphor(c, station);
    // the same glass with no card, shown while the station's own text is on it
    const clear = canvas(CARD_PX.width, CARD_PX.height);
    drawPhosphor(clear);
    return { crt, t: texture(c), clear: texture(clear), mat: createRef<MeshBasicMaterial>(), mesh: createRef<Mesh>() };
  }), []);
  // Which screens show the clear glass now. The swap is done in a frame (below), so a change that
  // needs one is noticed here and asked for: it must not depend on the camera happening to move.
  const clearNow = useRef<boolean[]>([]);
  useEffect(() => {
    let queued = 0;
    // Looks after the scroll handlers have run (they are what move `where`), then asks for a frame.
    const look = () => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => {
        const framing = framingFor({ width: window.innerWidth, height: window.innerHeight });
        if (screens.some((_, k) => framing.textOnGlass(where.current, k + 1) !== !!clearNow.current[k])) invalidate();
      });
    };
    window.addEventListener("scroll", look, { passive: true });
    window.addEventListener("resize", look);
    return () => { cancelAnimationFrame(queued); window.removeEventListener("scroll", look); window.removeEventListener("resize", look); };
  }, [screens, where, invalidate]);
  useFrame(({ size }) => {
    const framing = framingFor(size);
    screens.forEach((s, k) => {
      const m = s.mat.current, mesh = s.mesh.current;
      if (!m || !mesh) return;
      const clear = framing.textOnGlass(where.current, k + 1);
      clearNow.current[k] = clear;
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
      {screens.map(({ crt, t, mat, mesh }) => {
        const f = phosphorFrame(crt);
        return (
          <mesh key={crt.id} ref={mesh} position={[...f.position]} rotation={[0, f.yaw, 0]} raycast={() => null}>
            <planeGeometry args={[CRT_GLASS.width - PLANE_INSET, CRT_GLASS.height - PLANE_INSET]} />
            <meshBasicMaterial ref={mat} map={t} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------- the bezels
// One thin plane per TV, drawn once, over the baked bezel (which is soft up close): a crisp edge
// round the glass, a small maker's plate, and a sticky note of its own. The words come from the
// station's `bezel` in the content module. No re-bake and no new asset: the textures are painted
// here, so the cost is code, not megabytes.
const BEZEL = { width: 0.58, height: 0.48 }; // the baked bezel's face, from tools/room/build.py
/** How far the edge's opening sits inside the glass. The clear screen layer stands SCREEN_LAYER in
 *  front of the glass, so it reaches a little past the glass onto the bezel: the edge stands
 *  BEZEL_GAP in front of it and starts inside the glass edge, so that overhang is covered when the
 *  TV is seen from a stop. (At a steep angle the gap stops covering it, but the clear layer only
 *  shows near a stop.) */
const EDGE_OVERLAP = 0.003;
const EDGE_WIDTH = 0.006;
// The baked note (build.py) is a 70 mm square centred 0.24 m left of and 0.15 m above the glass
// centre, behind the glass's front face. This one sits near it, 56 x 82 mm: it covers the part of the
// baked note that lies left of the glass and the glass hides the part inside the glass edge. A strip
// of a few mm above the glass's top edge, right of this note, is covered by neither (worked out from
// build.py's numbers, not seen in a render).
const NOTE_SIZE = { width: 0.056, height: 0.082 };
const PLATE_SIZE = { width: 0.13, height: 0.028 };
// One tilt per TV, all different (radians). Small enough that the note still covers the part of the baked note left of the glass.
const NOTE_TILTS = [-0.06, 0.02, 0.05, -0.03, 0.06, -0.01];
const NOTE_COLOURS = ["#f4e27a", "#f2a6b8", "#9fd8f0", "#b9e59a", "#f7c68b", "#d3b8f0"];

/** Adds a rounded rectangle to the current path (the caller starts the path). */
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawBezel(c: HTMLCanvasElement, bezel: { plate: string; note: string }, k: number) {
  const g = c.getContext("2d")!, w = c.width, h = c.height, m = w / BEZEL.width; // pixels per metre
  g.clearRect(0, 0, w, h);
  const hx = (CRT_GLASS.width / 2 - EDGE_OVERLAP) * m, hy = (CRT_GLASS.height / 2 - EDGE_OVERLAP) * m, r = 0.01 * m;
  const cx = w / 2, cy = h / 2, ew = EDGE_WIDTH * m;
  // the edge: a dark lip round the glass, then a thin light line where it meets the bezel
  g.save();
  g.beginPath(); g.rect(0, 0, w, h); roundRect(g, cx - hx, cy - hy, hx * 2, hy * 2, r);
  g.clip("evenodd");
  g.fillStyle = "#17120c"; g.beginPath(); roundRect(g, cx - hx - ew, cy - hy - ew, (hx + ew) * 2, (hy + ew) * 2, r + ew); g.fill();
  g.restore();
  g.lineWidth = Math.max(1, 0.0006 * m); g.strokeStyle = "rgba(255,246,222,0.55)";
  g.beginPath(); roundRect(g, cx - hx - ew, cy - hy - ew, (hx + ew) * 2, (hy + ew) * 2, r + ew); g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = Math.max(1, 0.0008 * m);
  g.beginPath(); roundRect(g, cx - hx, cy - hy, hx * 2, hy * 2, r); g.stroke();
  // the maker's plate, bottom left of the bezel
  const pw = PLATE_SIZE.width * m, ph = PLATE_SIZE.height * m, px = cx + PLATE_AT[0] * m - pw / 2, py = cy - PLATE_AT[1] * m - ph / 2;
  const metal = g.createLinearGradient(0, py, 0, py + ph);
  metal.addColorStop(0, "#d9d6cc"); metal.addColorStop(0.5, "#a9a69b"); metal.addColorStop(1, "#c4c1b6");
  g.fillStyle = metal; g.beginPath(); roundRect(g, px, py, pw, ph, 0.003 * m); g.fill();
  g.strokeStyle = "rgba(40,36,28,0.7)"; g.lineWidth = Math.max(1, 0.0007 * m); g.stroke();
  g.fillStyle = "#2a261e"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `bold ${0.014 * m}px ${MONO}`; g.fillText(bezel.plate, px + pw / 2, py + ph / 2 + 0.0005 * m, pw * 0.92);
  // the sticky note, at the bezel's top left corner, tilted differently on each TV
  const nw = NOTE_SIZE.width * m, nh = NOTE_SIZE.height * m, tilt = NOTE_TILTS[k % NOTE_TILTS.length];
  g.save();
  g.translate(cx + NOTE_AT[0] * m, cy - NOTE_AT[1] * m); g.rotate(tilt);
  g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 0.004 * m; g.shadowOffsetY = 0.002 * m;
  g.fillStyle = NOTE_COLOURS[k % NOTE_COLOURS.length]; g.fillRect(-nw / 2, -nh / 2, nw, nh);
  g.shadowColor = "transparent";
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-nw / 2, -nh / 2, nw, nw * 0.16); // the sticky strip
  g.fillStyle = "#3b2f6b"; g.font = `${0.0095 * m}px ${MONO}`;
  const lines = bezel.note.split("\n");
  lines.forEach((t, i) => g.fillText(t, 0, (i - (lines.length - 1) / 2) * 0.0115 * m + 0.005 * m, nw * 0.9));
  g.restore();
}

export function Bezels() {
  // Read once, on purpose: moving the window to another screen doesn't redraw the bezels.
  const dense = typeof devicePixelRatio === "number" && devicePixelRatio >= 1.5;
  const bezels = useMemo(() => crts.map((crt, k) => {
    const station = stations.find((s) => s.id === crt.id)!;
    // 1.5 px per mm, 2 on a high-density screen: about 6 MB a texture with mipmaps, 35 MB for six
    const px = dense ? 2000 : 1500;
    const c = canvas(Math.round(BEZEL.width * px), Math.round(BEZEL.height * px));
    drawBezel(c, station.bezel, k);
    return { crt, t: texture(c) };
  }), [dense]);
  return (
    <>
      {bezels.map(({ crt, t }) => {
        const a = (crt.yaw * Math.PI) / 180, d = SCREEN_LAYER + BEZEL_GAP; // in front of the clear screen layer
        return (
          <mesh key={crt.id} position={[crt.screen[0] + Math.sin(a) * d, crt.screen[1], crt.screen[2] + Math.cos(a) * d]}
            rotation={[0, a, 0]} renderOrder={2} raycast={() => null}>
            <planeGeometry args={[BEZEL.width, BEZEL.height]} />
            <meshBasicMaterial map={t} transparent depthWrite={false} toneMapped={false} />
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
