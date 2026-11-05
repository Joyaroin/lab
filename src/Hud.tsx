import type { CSSProperties } from "react";
import { links, stations } from "./content";

// Always-on corner overlay: résumé, contact and station links. Fixed, so it is reachable
// at every point in the tour.
export function Hud({ current, onJump }: { current: number; onJump: (station: number) => void }) {
  return (
    <nav aria-label="HUD" style={hud}>
      <div style={row}>
        {links.map((l) => <a key={l.label} href={l.href} style={link}>{l.label}</a>)}
      </div>
      <div style={row}>
        <a href="#entrance" style={link} aria-current={current === 0 ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); onJump(0); }}>Entrance</a>
        {stations.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} style={link} aria-current={current === i + 1 ? "location" : undefined}
            onClick={(e) => { e.preventDefault(); onJump(i + 1); }}>{s.name}</a>
        ))}
      </div>
    </nav>
  );
}

const hud: CSSProperties = {
  position: "fixed", top: 0, right: 0, zIndex: 20, maxWidth: "min(100vw, 34rem)", padding: "0.6rem 0.8rem",
  background: "rgba(5,8,10,0.7)", fontSize: "0.8rem", textAlign: "right",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.2rem 0.8rem" };
const link: CSSProperties = { color: "#7dffb0" };
