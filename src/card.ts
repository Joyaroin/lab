// The phosphor screen drawn on each CRT's glass, with a station's title card on it if one is given.
// Kept free of imports and of anything but plain canvas calls, so the browser tests can run this
// same code in a page to draw the card they expect to see (tests/titlecards.spec.ts).
// (Effects.tsx explains where the cards go and when they show.)

import type { Station } from "./content";

/** The size the screen is drawn at. */
export const CARD_PX = { width: 640, height: 500 };

/** The card's font size, as a share of the screen's height (the most each line gets: the name on one line or on two, the world line). */
const LINE_CAP = { worldLine: 1 / 11, nameOne: 1 / 5, nameTwo: 1 / 5 };

export const MONO = '"DejaVu Sans Mono", ui-monospace, monospace';

export function drawPhosphor(c: HTMLCanvasElement, card?: Pick<Station, "worldLine" | "name">) {
  const g = c.getContext("2d")!, w = c.width, h = c.height;
  g.fillStyle = "#020a05"; g.fillRect(0, 0, w, h);
  const glow = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.62);
  glow.addColorStop(0, "#0f3d22"); glow.addColorStop(0.6, "#082513"); glow.addColorStop(1, "#010603");
  g.fillStyle = glow; g.fillRect(0, 0, w, h);
  if (card) {
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(90,255,150,0.9)"; g.shadowBlur = 8;
    g.fillStyle = "#7dffb0";
    // The name is the part read from across the room, so it gets most of the glass: as large as fits,
    // on one line or, when that is larger, on two split at a space. The world line above it is smaller.
    // The one place the font is set: it measures at a probe size, then draws at the size that fits.
    const fit = (text: string, max: number) => {
      g.font = `bold 100px ${MONO}`;
      return Math.floor(Math.min(max, (100 * w * 0.8) / g.measureText(text).width));
    };
    const words = card.name.split(" ");
    let lines = [card.name], size = fit(card.name, h * LINE_CAP.nameOne);
    for (let i = 1; i < words.length; i++) {
      const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
      const s2 = Math.min(...pair.map((t) => fit(t, h * LINE_CAP.nameTwo)));
      if (s2 > size) { lines = pair; size = s2; }
    }
    const draw = (text: string, px: number, y: number) => {
      g.font = `bold ${px}px ${MONO}`; g.fillText(text, w / 2, y);
    };
    draw(card.worldLine, fit(card.worldLine, h * LINE_CAP.worldLine), h * 0.3);
    const mid = h * (lines.length > 1 ? 0.66 : 0.56), gap = size * 1.12;
    lines.forEach((t, i) => draw(t, size, mid + (i - (lines.length - 1) / 2) * gap));
    g.shadowBlur = 0;
    g.fillRect(w * 0.15, h * 0.4, w * 0.7, Math.max(2, h / 120)); // rule between the lines
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
