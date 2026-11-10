import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatReading } from "./gap";
import { fill, ui } from "./content";
import { runFrames } from "./frames";
import type { BarKey } from "./bar";
import { digitsToShow, shiftDigits, type ShiftKind } from "./nixie";
import { deviceLayers, type Placed } from "./meter-device";
import { DEVICE as SIZE, TUBES, LAYERS } from "./meter-layers";
import { meterUrl, preloadMeterImages, useMeterImages } from "./meter-images";
import { deviceSize, lineType } from "./pin";
import { useWin } from "./useWin";

/** The digits the bar shows: the reading, except for a moment while a shift scrambles them. Frames
 *  run only during the shift. `shift.id` changes to start a new one. */
function useShifted(digits: string, shift?: { kind: ShiftKind; id: number } | null) {
  const [shown, setShown] = useState<string | null>(null);
  const now = useRef(digits); // read each frame, so the scramble lands on where the visitor is, not where they were
  now.current = digits;
  useEffect(() => {
    if (!shift) return;
    const stop = runFrames((seconds) => {
      const s = shiftDigits(seconds, now.current, shift.kind);
      setShown(s.done ? null : s.digits);
      return s.done;
    });
    return () => { stop(); setShown(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift?.id]);
  return digitsToShow(digits, shown, !!shift);
}

/** The words on a key: its cap and its accessible name. */
const KEY_WORDS: Record<BarKey, { cap: string; name: string }> = {
  prev: { cap: ui.keyPrev, name: ui.prevStation },
  room: { cap: ui.keyRoom, name: ui.backToRoom },
  next: { cap: ui.keyNext, name: ui.nextStation },
  start: { cap: ui.keyStart, name: ui.startTour },
};

// The meter bar, under the room: the reading's digits, the line naming the stop, and the keys. Only the keys
// are buttons (`onKey` hears which was pressed). The nixie meter on the desk (DeskMeter in DeskMeter.tsx) shows
// the same digits; the bar always shows its own. `live` is false only once the live call has failed; `pending`
// is while it's in flight.
//
// Once its images have arrived (src/meter-images.ts) the bar is the device: the rendered layers put together (the
// list is src/meter-layers.ts, the mapping from a reading src/meter-device.ts), the reading's digits as lit numerals
// over the tubes, and the keys as buttons over their drawn keys. Until then, and for good if they fail, it is the plain
// text digits and plain buttons.
export function Meter({ reading, label, keys, live, pending = false, shift, onKey }: {
  reading: number; label: string; keys: BarKey[]; live: boolean; pending?: boolean; shift?: { kind: ShiftKind; id: number } | null;
  onKey: (key: BarKey) => void;
}) {
  const digits = formatReading(reading);
  const shown = useShifted(digits, shift);
  const win = useWin();
  useEffect(preloadMeterImages, []);
  const images = useMeterImages();
  const name = fill(ui.meterReading, { digits });
  const line = (style: CSSProperties) => (
    <span data-live={live} data-pending={pending} style={{ display: "block", opacity: live ? 1 : 0.75, ...style }}>{label}</span>
  );

  if (images === "ready") {
    const size = deviceSize(win), type = lineType(win);
    const layers = deviceLayers(shown, keys);
    const tubes = layers.filter((l) => l.id.startsWith("tube-") || l.id === "dot");
    return (
      <div style={deviceBar} data-meter-bar>
        <style>{css}</style>
        <div data-device className="meter-device" style={{ width: size.width, height: size.height }}>
          {layers.filter((l) => l.id === "base" || l.id === "light").map((l) => <Layer key={l.id} l={l} />)}
          <span role="img" aria-label={name} className="meter-digits" style={within(READING, DEVICE)}>
            {tubes.map((l) => l.id === "dot"
              ? <Layer key={l.id} l={l} rel={READING} />
              : <span key={l.id} data-testid="tube" style={{ ...within(l, READING), fontSize: 0, color: "transparent" }}>
                  {l.digit}<Layer l={l} fill />
                </span>)}
          </span>
          {layers.filter((l) => l.id.startsWith("key-")).map((l) => {
            const k = l.id.slice(4) as BarKey;
            return (
              <span key={l.id} className="meter-keyart" style={within(l, DEVICE)}>
                <button type="button" data-key={k} aria-label={KEY_WORDS[k].name} className="meter-key" onClick={() => onKey(k)}>
                  {KEY_WORDS[k].cap}
                </button>
                <Layer l={l} fill />
              </span>
            );
          })}
        </div>
        {line({ ...deviceLine, fontSize: type.font, lineHeight: `${type.lineHeight}px` })}
      </div>
    );
  }

  return (
    <div style={bar} data-meter-bar>
      <style>{css}</style>
      <span role="img" aria-label={name} className="meter-digits">
        {[...shown].map((ch, i) =>
          ch === "." ? <span key={i} className="meter-dot">.</span> : <span key={i} className="meter-tube" data-testid="tube">{ch}</span>,
        )}
      </span>
      {line({})}
      <div style={keyRow}>
        {keys.map((k) => (
          <button key={k} type="button" data-key={k} aria-label={KEY_WORDS[k].name} style={key} onClick={() => onKey(k)}>
            {KEY_WORDS[k].cap}
          </button>
        ))}
      </div>
    </div>
  );
}

type Box = { x: number; y: number; width: number; height: number };
/** The whole device, as a box. */
const DEVICE: Box = { x: 0, y: 0, ...SIZE };
/** The tubes' region of the device: the reading's box. The numerals and the dot are placed inside it. */
const READING: Box = {
  x: TUBES[0].x, y: TUBES[0].y,
  width: TUBES[TUBES.length - 1].x + LAYERS.numerals[0].width - TUBES[0].x, height: LAYERS.numerals[0].height,
};
/** A layer's place inside `of`, in percent, so it follows the device's CSS size with no measuring. */
const within = (l: Box, of: Box): CSSProperties => ({
  position: "absolute", left: `${((l.x - of.x) / of.width) * 100}%`, top: `${((l.y - of.y) / of.height) * 100}%`,
  width: `${(l.width / of.width) * 100}%`, height: `${(l.height / of.height) * 100}%`,
});

/** One image of the device. `fill` fills its parent (a tube or a key's art); otherwise it is placed in `rel`. */
function Layer({ l, rel = DEVICE, fill: filled = false }: { l: Placed; rel?: Box; fill?: boolean }) {
  return (
    <img src={meterUrl(l.file)} alt="" draggable={false} data-layer={l.id}
      style={{ ...(filled ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : within(l, rel)), ...(l.mode === "add" ? { mixBlendMode: "plus-lighter" } : null) }} />
  );
}

const css = `
.meter-digits { display: inline-flex; align-items: flex-end; gap: 0.18rem; margin-bottom: 0.3rem; }
.meter-tube { font-size: 1.35rem; padding: 0.05em 0.22em; color: #ffcf8a; background: radial-gradient(ellipse at 50% 55%, #3a1a06, #120803 75%);
  border: 1px solid #4a2c10; border-radius: 0.45em 0.45em 0.2em 0.2em; text-shadow: 0 0 4px #ff8c1a, 0 0 12px #ff6a00; }
.meter-dot { font-size: 1.35rem; color: #ffcf8a; text-shadow: 0 0 8px #ff8c1a; }
.meter-device { position: relative; isolation: isolate; flex: none; }
.meter-device img { display: block; pointer-events: none; user-select: none; }
.meter-device .meter-digits { display: block; margin: 0; }
.meter-keyart { display: block; }
.meter-key { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); width: max(75%, 44px); height: 44px; box-sizing: border-box;
  padding: 0; border: 0; border-radius: 6px; background: transparent; color: transparent; font: inherit; cursor: pointer; }
.meter-keyart img { transition: filter 0.12s, transform 0.08s; }
.meter-key:hover + img, .meter-key:focus-visible + img { filter: brightness(1.35); }
.meter-key:active + img { filter: brightness(0.8); transform: translateY(2%) scale(0.97); }
`;

const bar: CSSProperties = {
  color: "#ffb347", textAlign: "center", fontSize: "0.9rem", maxWidth: "calc(100vw - 1rem)", boxSizing: "border-box",
  fontFamily: "ui-monospace, monospace", padding: "0.45rem 0.8rem", background: "rgba(5,8,10,0.72)", borderRadius: "0.5em",
  textShadow: "0 0 6px rgba(255,140,30,0.45)",
};
/** The device bar has no box of its own: the device, then the line under it (its height is `lineHeight` in src/pin.ts). */
const deviceBar: CSSProperties = {
  color: "#ffb347", textAlign: "center", fontSize: "0.9rem", fontFamily: "ui-monospace, monospace", textShadow: "0 0 6px rgba(255,140,30,0.45)",
  display: "flex", flexDirection: "column", alignItems: "center",
};
const deviceLine: CSSProperties = {
  boxSizing: "border-box", padding: "4px 10px", maxWidth: "calc(100vw - 1rem)", background: "rgba(5,8,10,0.72)", borderRadius: 6,
};
const keyRow: CSSProperties = { display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.35rem" };
const key: CSSProperties = {
  minWidth: 44, minHeight: 44, padding: "0 0.9rem", boxSizing: "border-box", cursor: "pointer", color: "#ffcf8a", background: "#1c0f06",
  border: "1px solid #6b4a1c", borderRadius: "0.4em", font: "inherit", fontSize: "0.8rem", letterSpacing: "0.08em",
};
