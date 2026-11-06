// The phosphor screen drawn on each CRT's glass, with a station's title card on it if one is given.
// Kept free of imports and of anything but plain canvas calls, so the browser tests can run this
// same code in a page to draw the card they expect to see (tests/titlecards.spec.ts).
// (Effects.tsx explains where the cards go and when they show.)

/** The size the screen is drawn at. */
export const CARD_PX = { width: 640, height: 500 };

export const MONO = '"DejaVu Sans Mono", ui-monospace, monospace';

export function drawPhosphor(c: HTMLCanvasElement, card?: { worldLine: string; name: string }) {
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
