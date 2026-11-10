import { useMemo } from "react";
import { crts, CRT_GLASS, NOTE_AT, PLATE_AT } from "./crts";
import { stations } from "./content";
import { MONO } from "./card";
import { noteStyleFor } from "./notes";
import { BEZEL, BEZEL_GAP, SCREEN_LAYER, canvas, texture } from "./draw";

// ---------------------------------------------------------------- the bezels
// One thin plane per TV, drawn once, over the baked bezel (which is soft up close): a crisp edge
// round the glass, a small maker's plate, and a sticky note of its own. The words come from the
// station's `bezel` in the content module. No re-bake and no new asset: the textures are painted
// here, so the cost is code, not megabytes.
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

/** Adds a rounded rectangle to the current path (the caller starts the path). */
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

function drawBezel(c: HTMLCanvasElement, bezel: { plate: string; note: string }, stationId: string) {
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
  // the sticky note, at the bezel's top left corner, tilted differently on each TV (its style is the station's, in notes.ts)
  const nw = NOTE_SIZE.width * m, nh = NOTE_SIZE.height * m, style = noteStyleFor(stationId);
  g.save();
  g.translate(cx + NOTE_AT[0] * m, cy - NOTE_AT[1] * m); g.rotate(style.tilt);
  g.shadowColor = "rgba(0,0,0,0.45)"; g.shadowBlur = 0.004 * m; g.shadowOffsetY = 0.002 * m;
  g.fillStyle = style.colour; g.fillRect(-nw / 2, -nh / 2, nw, nh);
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
  const bezels = useMemo(() => crts.map((crt) => {
    const station = stations.find((s) => s.id === crt.id)!;
    // 1.5 px per mm, 2 on a high-density screen: about 6 MB a texture with mipmaps, 30 MB for five
    const px = dense ? 2000 : 1500;
    const c = canvas(Math.round(BEZEL.width * px), Math.round(BEZEL.height * px));
    drawBezel(c, station.bezel, crt.id);
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
