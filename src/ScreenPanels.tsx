import type { CSSProperties } from "react";
import { stations } from "./content";

// Each station's text as real HTML. The room (Room.tsx) pins each panel to its CRT screen and
// sets its position, size and opacity; this file only holds how it looks.
export function ScreenPanels() {
  return (
    <>
      {stations.map((s) => (
        <section key={s.id} data-screen={s.id} aria-label={s.name} style={{ ...panel, visibility: "hidden" }}>
          <p style={worldLine}>{s.worldLine}</p>
          <h2 style={heading}>{s.heading}</h2>
          {s.body.map((b, i) => <p key={i} style={para}>{b}</p>)}
          <p style={linkRow}>
            {s.links.map((l) => (
              <a key={l.label + l.href} href={l.href} style={link}
                {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                {l.label}
              </a>
            ))}
          </p>
        </section>
      ))}
    </>
  );
}

const panel: CSSProperties = {
  position: "fixed", top: 0, left: 0, zIndex: 5, boxSizing: "border-box", overflowY: "auto",
  padding: "0.9rem 1rem", background: "rgba(4,18,10,0.92)", border: "1px solid #2f7a4d", borderRadius: 6,
  color: "#aaffc8", textShadow: "0 0 6px rgba(80,255,150,0.45)", fontSize: "1rem", lineHeight: 1.45,
  userSelect: "text", cursor: "auto", willChange: "transform",
};
const worldLine: CSSProperties = { margin: 0, fontSize: "0.75rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "#ffb347" };
const heading: CSSProperties = { margin: "0.2rem 0 0.5rem", fontSize: "1.25rem" };
const para: CSSProperties = { margin: "0 0 0.6rem" };
const linkRow: CSSProperties = { margin: 0, display: "flex", flexWrap: "wrap", gap: "0.3rem 1rem" };
const link: CSSProperties = { color: "#7dffb0", textDecoration: "underline" };
