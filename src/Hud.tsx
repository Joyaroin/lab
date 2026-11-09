import { useEffect, type CSSProperties } from "react";
import { identity, links, stations, ui } from "./content";
import type { Visit } from "./visit";
import type { Where } from "./where";

/** Where the meter bar's wrapper stands above the window's bottom. The HUD owns it (it is what changes on a phone, #177). */
const METER_BOTTOM = "1rem";

// Always-on corner overlay: résumé, contact and station links. Fixed, so it is reachable at every
// point. The station links are real #id links that fly to that station; Room flies back to the overview.
// It owns what #177 changes: the parts that depend on where the visitor is and on whether they have
// visited a station yet (`visited`, set on the first landing at one), and the meter bar's bottom offset
// (the CSS variable --meter-bottom, which the bar's wrapper reads).
export function Hud({ where, visit }: { where: Where; visited: boolean; visit: Visit }) {
  useEffect(() => { document.documentElement.style.setProperty("--meter-bottom", METER_BOTTOM); }, []);
  const stop = where.kind === "at" ? where.stop : -1; // during a flight no link is current
  return (
    <nav aria-label={ui.hud} style={hud}>
      <div style={{ color: "#ffb347" }}>{identity.availability}</div>
      <div style={row}>
        {links.map((l) => <a key={l.label} href={l.href} style={link}>{l.label}</a>)}
      </div>
      <div style={row}>
        <a href="./" style={link} aria-current={stop === 0 ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); visit.back(); }}>{ui.room}</a>
        {stations.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} style={link} aria-current={stop === i + 1 ? "location" : undefined}
            onClick={(e) => { e.preventDefault(); visit.go(i + 1); }}>{s.name}</a>
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
