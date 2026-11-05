import type { CSSProperties } from "react";
import { formatReading } from "./gap";

// The meter is a flat, self-contained display: it takes a reading and a label and
// draws them. It knows nothing about the page, so it can later be pinned to a
// screen in the room (the room places it; the meter doesn't position itself).
export function Meter({ reading, label, live }: { reading: number; label: string; live: boolean }) {
  const digits = formatReading(reading);
  return (
    <figure style={figure} aria-label="Meter">
      <div role="img" aria-label={`Reading ${digits}`} style={tubes}>
        {[...digits].map((ch, i) =>
          ch === "." ? (
            <span key={i} style={dot}>.</span>
          ) : (
            <span key={i} style={tube} data-testid="tube">{ch}</span>
          ),
        )}
      </div>
      <figcaption data-live={live} style={{ marginTop: "0.75rem", opacity: live ? 1 : 0.7 }}>
        {label}
      </figcaption>
    </figure>
  );
}

const figure: CSSProperties = { margin: 0, color: "#ffb347" };
const tubes: CSSProperties = { display: "flex", alignItems: "flex-end", gap: "0.4rem" };
const tube: CSSProperties = {
  fontFamily: "monospace", fontSize: "clamp(2rem, 8vw, 4.5rem)", padding: "0.2em 0.35em",
  background: "#1a0f05", border: "1px solid #5a3a14", borderRadius: "0.3em",
  textShadow: "0 0 12px #ff8c1a", 
};
const dot: CSSProperties = { fontSize: "clamp(2rem, 8vw, 4.5rem)", fontFamily: "monospace", textShadow: "0 0 12px #ff8c1a" };
