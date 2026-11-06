import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The baked room's real triangles, read straight from the committed room.glb (ADR-0004: the model
// is committed, and tools/room/build.py is what makes it). Tests use this to ask how close a point
// is to anything solid, so a prop added to build.py is caught once the room is re-baked, with no
// second list of boxes to keep in step with it.
type V3 = [number, number, number];

const CELL = 0.25;
let cache: { tris: Float64Array; grid: Map<string, number[]> } | undefined;

function load() {
  if (cache) return cache;
  const b = readFileSync(fileURLToPath(new URL("../../src/assets/room.glb", import.meta.url)));
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const bin = b.subarray(20 + jsonLen + 8);
  const tris: number[] = [];
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    const pos = json.accessors[p.attributes.POSITION], idx = json.accessors[p.indices];
    const pv = json.bufferViews[pos.bufferView], iv = json.bufferViews[idx.bufferView];
    const P = new Float32Array(bin.buffer.slice(bin.byteOffset + (pv.byteOffset ?? 0) + (pos.byteOffset ?? 0), bin.byteOffset + (pv.byteOffset ?? 0) + (pos.byteOffset ?? 0) + pos.count * 12));
    const I = new Uint16Array(bin.buffer.slice(bin.byteOffset + (iv.byteOffset ?? 0) + (idx.byteOffset ?? 0), bin.byteOffset + (iv.byteOffset ?? 0) + (idx.byteOffset ?? 0) + idx.count * 2));
    for (const i of I) tris.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  }
  const t = Float64Array.from(tris), grid = new Map<string, number[]>();
  for (let n = 0; n < t.length / 9; n++) {
    const lo = [0, 1, 2].map((k) => Math.min(t[n * 9 + k], t[n * 9 + 3 + k], t[n * 9 + 6 + k])), hi = [0, 1, 2].map((k) => Math.max(t[n * 9 + k], t[n * 9 + 3 + k], t[n * 9 + 6 + k]));
    if (lo[0] < -2.5 || hi[0] > 2.5 || lo[1] < -0.5 || hi[1] > 3 || lo[2] < -2.5 || hi[2] > 2.5) continue; // outside the room (sky, city)
    for (let x = Math.floor(lo[0] / CELL); x <= Math.floor(hi[0] / CELL); x++)
      for (let y = Math.floor(lo[1] / CELL); y <= Math.floor(hi[1] / CELL); y++)
        for (let z = Math.floor(lo[2] / CELL); z <= Math.floor(hi[2] / CELL); z++) {
          const key = `${x},${y},${z}`;
          (grid.get(key) ?? grid.set(key, []).get(key)!).push(n);
        }
  }
  return (cache = { tris: t, grid });
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Distance from point `p` to triangle (a, b, c): Ericson's closest-point test. */
function distToTriangle(p: number[], a: number[], b: number[], c: number[]): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  let q: number[];
  const at = (u: number, v: number) => [a[0] + ab[0] * u + ac[0] * v, a[1] + ab[1] * u + ac[1] * v, a[2] + ab[2] * u + ac[2] * v];
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) q = b;
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) q = at(d1 / (d1 - d3), 0);
    else if (d6 >= 0 && d5 <= d6) q = c;
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) q = at(0, d2 / (d2 - d6));
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = at(1 - w, w); }
    else { const den = 1 / (va + vb + vc); q = at(vb * den, vc * den); }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** The distance from `p` to the nearest surface in the room, if that is under `within` metres, else Infinity. */
export function nearestSurface(p: V3, within: number): number {
  const { tris, grid } = load();
  let best = Infinity;
  const r = Math.ceil(within / CELL), cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL), cz = Math.floor(p[2] / CELL);
  const seen = new Set<number>();
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++)
    for (const n of grid.get(`${x},${y},${z}`) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      const o = n * 9;
      best = Math.min(best, distToTriangle(p, [tris[o], tris[o + 1], tris[o + 2]], [tris[o + 3], tris[o + 4], tris[o + 5]], [tris[o + 6], tris[o + 7], tris[o + 8]]));
    }
  return best <= within ? best : Infinity;
}
