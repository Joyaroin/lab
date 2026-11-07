import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatReading } from "./gap";
import { fill, ui } from "./content";
import { digitsToShow, shiftDigits, type ShiftKind } from "./nixie";

/** The digits the bar shows: the reading, except for a moment while a shift scrambles them. Frames
 *  run only during the shift. `shift.id` changes to start a new one. */
function useShifted(digits: string, shift?: { kind: ShiftKind; id: number } | null) {
  const [shown, setShown] = useState<string | null>(null);
  const now = useRef(digits); // read each frame, so the scramble lands on where the visitor is, not where they were
  now.current = digits;
  useEffect(() => {
    if (!shift) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const s = shiftDigits((performance.now() - start) / 1000, now.current, shift.kind);
      setShown(s.done ? null : s.digits);
      if (!s.done) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); setShown(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift?.id]);
  return digitsToShow(digits, shown, !!shift);
}

// The meter's plain label, under the room. The meter itself is the nixie meter on the desk
// (DeskMeter in Effects.tsx), which shows the live digits. Where the desk meter is out of frame,
// too small, or under a station's text, the room marks this bar `data-desk-meter="out-of-view"`
// and it shows a small copy of the digits, so the reading is always on screen exactly once.
// Clicking it calls `onClick` (the tour advances), as clicking the desk meter does.
// `live` is false only once the live call has failed; `pending` is while it's in flight.
export function Meter({ reading, label, live, pending = false, shift, onClick }: {
  reading: number; label: string; live: boolean; pending?: boolean; shift?: { kind: ShiftKind; id: number } | null; onClick?: () => void;
}) {
  const digits = formatReading(reading);
  const shown = useShifted(digits, shift);
  return (
    <button type="button" onClick={onClick} style={button} data-meter-bar data-desk-meter="out-of-view"
      aria-label={fill(ui.meterButton, { label })}>
      <style>{css}</style>
      <span role="img" aria-label={fill(ui.meterReading, { digits })} className="meter-digits">
        {[...shown].map((ch, i) =>
          ch === "." ? <span key={i} className="meter-dot">.</span> : <span key={i} className="meter-tube" data-testid="tube">{ch}</span>,
        )}
      </span>
      <span data-live={live} data-pending={pending} style={{ display: "block", opacity: live ? 1 : 0.75 }}>
        {label}
      </span>
    </button>
  );
}

const css = `
.meter-digits { display: inline-flex; align-items: flex-end; gap: 0.18rem; margin-bottom: 0.3rem; }
[data-desk-meter="in-view"] .meter-digits { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); margin: 0; }
.meter-tube { font-size: 1.35rem; padding: 0.05em 0.22em; color: #ffcf8a; background: radial-gradient(ellipse at 50% 55%, #3a1a06, #120803 75%);
  border: 1px solid #4a2c10; border-radius: 0.45em 0.45em 0.2em 0.2em; text-shadow: 0 0 4px #ff8c1a, 0 0 12px #ff6a00; }
.meter-dot { font-size: 1.35rem; color: #ffcf8a; text-shadow: 0 0 8px #ff8c1a; }
`;

const button: CSSProperties = {
  all: "unset", cursor: "pointer", color: "#ffb347", textAlign: "center", fontSize: "0.9rem",
  fontFamily: "ui-monospace, monospace", padding: "0.45rem 0.8rem", background: "rgba(5,8,10,0.72)", borderRadius: "0.5em",
  textShadow: "0 0 6px rgba(255,140,30,0.45)",
};
