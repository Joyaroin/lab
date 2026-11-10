import { CanvasTexture, SRGBColorSpace } from "three";

// What more than one of the late-night overlay components shares (DeskMeter, Phosphor, Bezels, Rain
// and TvTargets, one file each in src/): the canvas and texture helpers, the glow texture and the
// layer and bezel sizes. The overlays are drawn over the baked room (Room.tsx); what each one does is in
// its own file.
export const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};
export const texture = (c: HTMLCanvasElement) => {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/** A round glow, bright in the middle and gone at the edge. */
export function pointGlowTexture(inner: string, mid: string) {
  const c = canvas(64, 64), g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner); r.addColorStop(0.3, mid); r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return texture(c);
}

/** How far in front of the baked glass the screen layer stands (metres). The bezel layer and its
 *  edge are measured from this. */
export const SCREEN_LAYER = 0.0062;
/** How far in front of the screen layer the bezel layer stands. */
export const BEZEL_GAP = 0.0016;
export const BEZEL = { width: 0.58, height: 0.48 }; // the baked bezel's face, from tools/room/build.py
