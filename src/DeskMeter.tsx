import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { AdditiveBlending, CylinderGeometry, type MeshBasicMaterial } from "three";
import { DESK_METER } from "./crts";
import { powerOn, shiftDigits, type MeterLink } from "./nixie";
import { meterDigits, PREVIEW_REST_MS, previewStop } from "./bar";
import type { Where } from "./where";
import type { Shift } from "./shift";
import type { PressTarget } from "./RoomClick";
import { canvas, pointGlowTexture, texture } from "./draw";

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


export function DeskMeter({ link, shift, reduced, where }: { link: MeterLink; shift: Shift; reduced: boolean; where: MutableRefObject<Where> }) {
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
  const haloMat = useRef<MeshBasicMaterial>(null);
  const poolMat = useRef<MeshBasicMaterial>(null);
  const dotMat = useRef<MeshBasicMaterial>(null);
  const dotGlowMat = useRef<MeshBasicMaterial>(null);
  useEffect(() => { link.redraw = invalidate; return () => { link.redraw = undefined; }; }, [link, invalidate]);
  useEffect(() => shift.setWake(invalidate), [shift, invalidate]); // the shift wakes the room through this
  const played = useRef<{ id: number; at: number; done: boolean } | null>(null); // this meter's clock for the shift it is playing

  useFrame(({ clock }) => {
    if (link.on && link.onAt === null) { link.onAt = clock.elapsedTime; shift.powerOnBegan(performance.now()); } // the boot screen just went
    const since = link.onAt === null ? 0 : clock.elapsedTime - link.onAt;
    // The digits and the scramble come from the one rule the meter bar reads too (src/bar.ts): the reading at the visitor's place, or
    // the hover preview's station. The shift module decides whether a shift plays (power-on hold, reduced motion, leaving).
    const now = performance.now();
    const { digits: reading, scramble: play } = meterDigits({ who: "desk", where: where.current, preview: link.preview, deploys: link.deploys, now, playing: shift.playing, reduced });
    const s = reduced && link.on ? powerOn(Infinity, reading) : powerOn(since, reading);
    let shifting = false;
    const waiting = link.preview !== null && previewStop(where.current, link.preview) !== null && now - link.preview.since < PREVIEW_REST_MS;
    if (play && played.current?.id !== play.id) played.current = { id: play.id, at: clock.elapsedTime, done: false };
    if (!play) played.current = null;
    if (play && played.current && !played.current.done) {
      const step = shiftDigits(clock.elapsedTime - played.current.at, reading, play.kind);
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
    if (link.on && (!s.done || shifting || waiting)) invalidate(); // keep drawing until the power-on or shift has settled, and through a preview's rest
  });

  return (
    <group position={DESK_METER.position} rotation={[0, DESK_METER.yaw, 0]}
      userData={{ press: { on: "meter" } satisfies PressTarget }}
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
