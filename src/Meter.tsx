import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatReading } from "./gap";
import { fill, ui } from "./content";
import { runFrames } from "./frames";
import type { BarKey } from "./bar";
import { digitsToShow, shiftDigits, type ShiftKind } from "./nixie";

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
export function Meter({ reading, label, keys, live, pending = false, shift, onKey }: {
  reading: number; label: string; keys: BarKey[]; live: boolean; pending?: boolean; shift?: { kind: ShiftKind; id: number } | null;
  onKey: (key: BarKey) => void;
}) {
  const digits = formatReading(reading);
  const shown = useShifted(digits, shift);
  return (
    <div style={bar} data-meter-bar>
      <style>{css}</style>
      <span role="img" aria-label={fill(ui.meterReading, { digits })} className="meter-digits">
        {[...shown].map((ch, i) =>
          ch === "." ? <span key={i} className="meter-dot">.</span> : <span key={i} className="meter-tube" data-testid="tube">{ch}</span>,
        )}
      </span>
      <span data-live={live} data-pending={pending} style={{ display: "block", opacity: live ? 1 : 0.75 }}>
        {label}
      </span>
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

const css = `
.meter-digits { display: inline-flex; align-items: flex-end; gap: 0.18rem; margin-bottom: 0.3rem; }
.meter-tube { font-size: 1.35rem; padding: 0.05em 0.22em; color: #ffcf8a; background: radial-gradient(ellipse at 50% 55%, #3a1a06, #120803 75%);
  border: 1px solid #4a2c10; border-radius: 0.45em 0.45em 0.2em 0.2em; text-shadow: 0 0 4px #ff8c1a, 0 0 12px #ff6a00; }
.meter-dot { font-size: 1.35rem; color: #ffcf8a; text-shadow: 0 0 8px #ff8c1a; }
`;

const bar: CSSProperties = {
  color: "#ffb347", textAlign: "center", fontSize: "0.9rem", maxWidth: "calc(100vw - 1rem)", boxSizing: "border-box",
  fontFamily: "ui-monospace, monospace", padding: "0.45rem 0.8rem", background: "rgba(5,8,10,0.72)", borderRadius: "0.5em",
  textShadow: "0 0 6px rgba(255,140,30,0.45)",
};
const keyRow: CSSProperties = { display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "0.35rem" };
const key: CSSProperties = {
  minWidth: 44, minHeight: 44, padding: "0 0.9rem", boxSizing: "border-box", cursor: "pointer", color: "#ffcf8a", background: "#1c0f06",
  border: "1px solid #6b4a1c", borderRadius: "0.4em", font: "inherit", fontSize: "0.8rem", letterSpacing: "0.08em",
};
