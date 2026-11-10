// The meter device's scene: a walnut case with seven glass nixie tubes and legend keys. Our own design (ADR-0002),
// from the approved reference (design/room-references/meter/). tools/meter/render.mjs opens this page and draws it a
// part at a time, so the site can lay the parts over one another: it calls window.meter.draw(parts) and cuts the
// layers from what it gets back. The key words are the content module's: none is written here.
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ui } from "../../src/content";

// The device is drawn 840 px wide: sharp at twice 420 px and at three times 280 px. The shape is the reference's.
const W = 840, H = Math.round((840 * 280) / 660);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.setClearColor(0x000000, 0); // every layer has a clear background
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.07; // a dark room: the tubes are the light

const camera = new THREE.PerspectiveCamera(22, W / H, 0.1, 50);
camera.position.set(0, 0.93, 3.78);
camera.lookAt(0, 0.6, 0);

// ---- textures drawn on canvases ----
const canvasOf = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
// A fixed seed, so the wood grain is the same every render and rendering again writes the same files.
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function wood() {
  const c = canvasOf(2048, 512), g = c.getContext("2d");
  g.fillStyle = "#3d2110"; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 420; i++) { // long grain streaks, some dark, some pale
    const y = rnd() * c.height, a = 0.05 + rnd() * 0.16, dark = rnd() < 0.62;
    g.strokeStyle = dark ? `rgba(14,6,2,${a})` : `rgba(120,74,38,${a * 0.6})`;
    g.lineWidth = 0.6 + rnd() * 3.2;
    g.beginPath();
    const wob = 4 + rnd() * 10, ph = rnd() * 6.3, f = 0.002 + rnd() * 0.004;
    for (let x = -10; x <= c.width + 10; x += 24) g.lineTo(x, y + Math.sin(x * f + ph) * wob);
    g.stroke();
  }
  return tex(c);
}
function words(text, w, h, { color, font, glow = 0, align = "center" }) {
  const c = canvasOf(w, h), g = c.getContext("2d");
  g.font = font; g.textAlign = align; g.textBaseline = "middle"; g.fillStyle = color;
  if (glow) { g.shadowColor = color; g.shadowBlur = glow; }
  g.fillText(text, align === "center" ? w / 2 : 0, h / 2);
  return tex(c);
}
function numeral(ch) { // a lit cathode: a thin warm core inside wide orange light
  const c = canvasOf(384, 576), g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "300 440px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  const draw = (fill, blur, shadow, n = 1) => { g.fillStyle = fill; g.shadowColor = shadow; g.shadowBlur = blur; for (let i = 0; i < n; i++) g.fillText(ch, 192, 300); };
  draw("rgba(255,84,0,0.7)", 80, "rgba(255,70,0,1)", 3);
  draw("rgba(255,128,24,1)", 30, "rgba(255,110,10,1)", 3);
  draw("#ffd9a0", 10, "rgba(255,170,70,1)", 2);
  draw("#fff3dc", 2, "rgba(255,220,160,1)");
  return tex(c);
}
function ghost() { // the unlit cathodes stacked behind the lit one
  const c = canvasOf(384, 576), g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle"; g.font = "200 430px 'Helvetica Neue', Helvetica, Arial, sans-serif";
  g.lineWidth = 2; g.strokeStyle = "rgba(120,96,80,0.2)";
  for (const [ch, dx] of [["8", 0], ["3", 5], ["6", -5], ["4", 3]]) g.strokeText(ch, 192 + dx, 300);
  return tex(c);
}
function mesh() { // the anode: a fine hexagonal grid, as an alpha map
  const c = canvasOf(256, 256), g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#fff"; g.lineWidth = 2.2;
  const s = 16, hgt = s * Math.sqrt(3);
  for (let row = -1; row < 256 / hgt + 1; row++) for (let col = -1; col < 256 / (s * 1.5) + 1; col++) {
    const cx = col * s * 1.5, cy = row * hgt + (col % 2 ? hgt / 2 : 0);
    g.beginPath();
    for (let k = 0; k < 6; k++) g.lineTo(cx + s * Math.cos((k * Math.PI) / 3), cy + s * Math.sin((k * Math.PI) / 3));
    g.closePath(); g.stroke();
  }
  const t = tex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2.2); return t;
}
function halo(inner, outer) {
  const c = canvasOf(256, 256), g = c.getContext("2d"), r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, inner); r.addColorStop(0.45, outer); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  return tex(c);
}
const glowMat = (map, opacity = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });


// ---- the case ----
const CASE = { w: 2.86, h: 0.37, d: 0.78 };
const brass = new THREE.MeshStandardMaterial({ color: 0x8c6f3c, metalness: 1, roughness: 0.46 }); // aged, not polished
const black = new THREE.MeshStandardMaterial({ color: 0x0c0a09, metalness: 0.2, roughness: 0.55 });
const woodMap = wood();
const box = new THREE.Mesh(new RoundedBoxGeometry(CASE.w, CASE.h, CASE.d, 5, 0.035),
  new THREE.MeshPhysicalMaterial({ map: woodMap, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.5 }));
box.position.y = CASE.h / 2;
const front = CASE.d / 2;

// The parts, which draw() shows one set at a time. unlit: the case and the tubes, dark. lights: what the tubes
// light up. digit: one lit numeral on the middle tube. dot: the decimal point. keys: one each.
const unlit = new THREE.Group(), lights = new THREE.Group(), dot = new THREE.Group();
const digit = new Map(), keys = new Map();
unlit.add(box);

for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { // four screws
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16), brass);
  screw.rotation.x = Math.PI / 2; screw.position.set(sx * (CASE.w / 2 - 0.07), CASE.h / 2 + sy * (CASE.h / 2 - 0.07), front + 0.004);
  unlit.add(screw);
}

// The keys, on the fascia: legend switches, each a dark cap with one lit word saying what it does.
// Previous on the left, next on the right, the room between them. The words are the content module's.
const KEY = { prev: { x: -1.02, word: ui.keyPrev }, room: { x: 0, word: ui.keyRoom }, next: { x: 1.02, word: ui.keyNext }, start: { x: 0, word: ui.keyStart } };
const KEY_W = 0.52, KEY_H = 0.17, KEY_Y = CASE.h / 2;
const capMat = new THREE.MeshStandardMaterial({ color: 0x17100a, metalness: 0.3, roughness: 0.5 });
for (const [name, k] of Object.entries(KEY)) {
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(KEY_W + 0.05, KEY_H + 0.05, 0.03, 4, 0.02), brass);
  bezel.position.set(k.x, KEY_Y, front + 0.004);
  const cap = new THREE.Mesh(new RoundedBoxGeometry(KEY_W, KEY_H, 0.07, 4, 0.025), capMat);
  cap.position.set(k.x, KEY_Y, front + 0.03);
  const word = new THREE.Mesh(new THREE.PlaneGeometry(KEY_W, KEY_H),
    glowMat(words(k.word, 520, 170, { color: "#ffbe6a", font: "700 112px ui-monospace, Menlo, monospace", glow: 14 })));
  word.position.set(k.x, KEY_Y, front + 0.067);
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(KEY_W * 1.5, KEY_H * 2.6), glowMat(halo("rgba(255,130,40,0.32)", "rgba(255,100,20,0.08)"), 0.7));
  lamp.position.set(k.x, KEY_Y, front + 0.066);
  keys.set(name, new THREE.Group().add(bezel, cap, lamp, word));
}

// ---- the tubes ----
const TUBE = { r: 0.142, h: 0.76, gap: 0.325 };
const profile = [new THREE.Vector2(TUBE.r, 0)];
const dome = TUBE.h - TUBE.r;
profile.push(new THREE.Vector2(TUBE.r, dome));
for (let i = 1; i <= 10; i++) { const a = (i / 10) * (Math.PI / 2) * 0.93; profile.push(new THREE.Vector2(Math.cos(a) * TUBE.r, dome + Math.sin(a) * TUBE.r)); }
profile.push(new THREE.Vector2(0.018, TUBE.h + 0.035), new THREE.Vector2(0, TUBE.h + 0.045)); // the sealed tip
const glassGeo = new THREE.LatheGeometry(profile, 48);
// Glass as light added over what is behind it: only its reflections show, strongest at the edges. Its blending adds
// the colour and leaves the alpha alone, so over a clear background the glass stays clear except for what it reflects.
const glass = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.035, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 6,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
const tint = new THREE.MeshBasicMaterial({ color: 0x1a0d05, transparent: true, opacity: 0.1, depthWrite: false });
const meshMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, metalness: 0.9, roughness: 0.45, alphaMap: mesh(), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
const ghostMat = new THREE.MeshBasicMaterial({ map: ghost(), transparent: true, depthWrite: false });
const haloMap = halo("rgba(255,120,30,0.7)", "rgba(255,80,0,0.2)");
const top = CASE.h;
const MID = 3; // the middle tube: its numerals are the ones cut out, and every tube uses them
const tubeX = (i) => (i - MID) * TUBE.gap;
const tubeY = 0.05 + TUBE.h * 0.38; // the middle of a tube's numeral, above its socket
for (let i = 0; i < 7; i++) {
  const g = new THREE.Group();
  g.position.set(tubeX(i), top, -0.04);
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r * 1.12, TUBE.r * 1.16, 0.05, 40), black); socket.position.y = 0.025;
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r * 0.8, TUBE.r * 0.8, 0.07, 32), new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.7 })); foot.position.y = 0.085;
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(TUBE.r * 0.8, TUBE.r * 0.8, TUBE.h * 0.6, 40, 1, true), meshMat); cage.position.y = tubeY;
  const stack = new THREE.Mesh(new THREE.PlaneGeometry(TUBE.r * 1.5, TUBE.r * 2.25), ghostMat); stack.position.set(0, tubeY, -0.012);
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(TUBE.r * 4.6, TUBE.r * 5.2), glowMat(haloMap, 0.75)); aura.position.set(0, tubeY, -0.03);
  const shell = new THREE.Mesh(glassGeo, glass); shell.position.y = 0.05; shell.renderOrder = 5;
  const smoke = new THREE.Mesh(glassGeo, tint); smoke.position.y = 0.05; smoke.renderOrder = 1;
  g.add(socket, foot, smoke, stack, cage, shell);
  unlit.add(g);
  const light = new THREE.Group(); light.position.copy(g.position); light.add(aura);
  lights.add(light);
  if (i === MID) {
    for (const ch of "0123456789") {
      const lit = new THREE.Mesh(new THREE.PlaneGeometry(TUBE.r * 1.95, TUBE.r * 2.92), glowMat(numeral(ch)));
      lit.position.set(g.position.x, top + tubeY, g.position.z + 0.01);
      digit.set(ch, lit);
    }
  }
}
// the decimal point: a small neon dot low between the first two tubes
const dotMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), glowMat(halo("rgba(255,225,170,1)", "rgba(255,120,20,0.6)")));
dotMesh.position.set(-2.5 * TUBE.gap, top + 0.11, 0.06);
dot.add(dotMesh);
// the tubes' light on the case, and a soft key light from the upper left
for (const x of [-0.75, 0, 0.75]) { const l = new THREE.PointLight(0xff7a1e, 0.5, 1.5, 2); l.position.set(x, top + 0.28, 0.3); lights.add(l); }
// the fascia catches a little of the tubes' light from above
for (const x of [-0.9, 0.9]) { const l = new THREE.PointLight(0xff8a30, 0.16, 1.4, 2); l.position.set(x, top + 0.12, 0.75); lights.add(l); }
const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.6), glowMat(halo("rgba(255,110,25,0.33)", "rgba(255,90,10,0.1)"), 0.9));
pool.rotation.x = -Math.PI / 2; pool.position.set(0, top + 0.002, 0.1);
lights.add(pool);
scene.add(unlit, lights, dot, ...digit.values(), ...keys.values());
// no white key light: only a faint green rim from the TV behind and above, as in the room. These two are always on.
const rim = new THREE.DirectionalLight(0x58ffa0, 0.5); rim.position.set(0.6, 2.4, -3); scene.add(rim);
const fill = new THREE.DirectionalLight(0x9fd8c0, 0.05); fill.position.set(-2, 2, 4); scene.add(fill);

// ---- where each part lands in the picture ----
camera.updateMatrixWorld();
const toPixel = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]; };
/** The box, in pixels of the picture, of a flat plane facing the camera: its centre and size in the room. */
const plane = (cx, cy, cz, w, h) => {
  const px = [-1, 1].flatMap((sx) => [-1, 1].map((sy) => toPixel(cx + (sx * w) / 2, cy + (sy * h) / 2, cz)));
  const xs = px.map((p) => p[0]), ys = px.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
const mid = toPixel(tubeX(MID), 0, 0)[0];
const rects = {
  // a lit numeral's plane and the decimal point's, then each key's lamp plane, which holds the key and its glow
  numeral: plane(tubeX(MID), top + tubeY, -0.04 + 0.01, TUBE.r * 1.95, TUBE.r * 2.92),
  dot: plane(-2.5 * TUBE.gap, top + 0.11, 0.06, 0.12, 0.12),
  keys: Object.fromEntries(Object.entries(KEY).map(([n, k]) => [n, plane(k.x, KEY_Y, front + 0.066, KEY_W * 1.5, KEY_H * 2.6)])),
  // how far each tube is to the right of the middle one, in pixels
  tubeDx: Array.from({ length: 7 }, (_, i) => toPixel(tubeX(i), 0, 0)[0] - mid),
};

const gl = renderer.getContext();
const raw = new Uint8Array(W * H * 4);
const base64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
/**
 * Draws some of the parts and returns the picture as base64 of premultiplied RGBA, bottom row first.
 * parts: { unlit, lights, digit: "0"-"9", dot, key: "prev" | "room" | "next" | "start" }
 */
function draw(parts) {
  unlit.visible = !!parts.unlit; lights.visible = !!parts.lights; dot.visible = !!parts.dot;
  for (const [ch, m] of digit) m.visible = parts.digit === ch;
  for (const [n, k] of keys) k.visible = parts.key === n;
  renderer.render(scene, camera);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  return base64(raw);
}
window.meter = { width: W, height: H, rects, draw };
document.body.dataset.ready = "1";
