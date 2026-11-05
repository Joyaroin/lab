import type { CSSProperties } from "react";
import { formatReading } from "./gap";

// The meter is a flat, self-contained display: it takes a reading and a label and
// draws them. The tour places it. Clicking it calls `onClick` (the tour advances).
// `live` is false only once the live call has failed; `pending` is while it's in flight.
export function Meter({ reading, label, live, pending = false, onClick }: {
  reading: number; label: string; live: boolean; pending?: boolean; onClick?: () => void;
}) {
  const digits = formatReading(reading);
  return (
    <button type="button" onClick={onClick} style={button} aria-label={`Meter. ${label}. Click for the next station`}>
      <span role="img" aria-label={`Reading ${digits}`} style={tubes}>
        {[...digits].map((ch, i) =>
          ch === "." ? (
            <span key={i} style={dot}>.</span>
          ) : (
            <span key={i} style={tube} data-testid="tube">{ch}</span>
          ),
        )}
      </span>
      <span data-live={live} data-pending={pending} style={{ display: "block", marginTop: "0.5rem", opacity: live ? 1 : 0.7 }}>
        {label}
      </span>
    </button>
  );
}

const button: CSSProperties = {
  all: "unset", cursor: "pointer", color: "#ffb347", textAlign: "center",
  fontFamily: "ui-monospace, monospace", padding: "0.5rem 0.75rem", background: "rgba(5,8,10,0.55)", borderRadius: "0.5em",
};
const tubes: CSSProperties = { display: "flex", justifyContent: "center", alignItems: "flex-end", gap: "0.25rem" };
const tube: CSSProperties = {
  fontFamily: "monospace", fontSize: "clamp(1.4rem, 5vw, 2.8rem)", padding: "0.15em 0.3em",
  background: "#1a0f05", border: "1px solid #5a3a14", borderRadius: "0.3em",
  textShadow: "0 0 12px #ff8c1a",
};
const dot: CSSProperties = { fontSize: "clamp(1.4rem, 5vw, 2.8rem)", fontFamily: "monospace", textShadow: "0 0 12px #ff8c1a" };
