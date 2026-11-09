import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { identity, links, stations, ui } from "./content";
import type { Visit } from "./visit";
import type { Where } from "./where";

/** Where the meter bar's wrapper stands above the window's bottom. The HUD owns it. */
const METER_BOTTOM = "1rem";
/** The phone's bottom buttons: each at least this tall, in rows of PHONE_COLS. */
export const BUTTON_PX = 44;
const PHONE_COLS = 4;
const PHONE_GAP = "0.3rem";
const PHONE_PAD = "0.4rem";
const PHONE_ROWS = Math.ceil((stations.length + 1) / PHONE_COLS);
/** The meter bar clears the buttons: their rows, gaps and padding, and the usual 1rem above. */
const PHONE_METER_BOTTOM = `calc(${PHONE_ROWS * BUTTON_PX}px + ${PHONE_ROWS - 1} * ${PHONE_GAP} + 2 * ${PHONE_PAD} + 1rem)`;

/** True on a portrait window, the same test the framing makes (width under height). */
function usePortrait() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); },
    () => window.innerWidth < window.innerHeight,
  );
}

// The always-on overlay: résumé, contact and station links, the Room link and the hint. A top-right
// overlay on a landscape window, a bottom menu on a portrait one. Fixed, so it is reachable at every
// point. The station links are real #id links that fly to that station; Room flies back to the overview.
// It owns what #177 changes: the parts that depend on where the visitor is and on whether they have
// visited a station yet (`visited`, set on the first landing at one), and the meter bar's bottom offset
// (the CSS variable --meter-bottom, which the bar's wrapper reads).
export function Hud({ where, visited, visit }: { where: Where; visited: boolean; visit: Visit }) {
  const portrait = usePortrait();
  useEffect(() => {
    document.documentElement.style.setProperty("--meter-bottom", portrait ? PHONE_METER_BOTTOM : METER_BOTTOM);
  }, [portrait]);
  // The hint shows on the overview until the first landing at a station, then fades and stays gone (in memory).
  const [hintGone, setHintGone] = useState(false);
  useEffect(() => {
    if (!visited) return;
    const t = setTimeout(() => setHintGone(true), 600); // after the fade
    return () => clearTimeout(t);
  }, [visited]);
  const hintShown = !hintGone;
  const stop = where.kind === "at" ? where.stop : -1; // during a flight no link is current
  const menu = (
    <>
      <a href="./" style={portrait ? button : link} aria-current={stop === 0 ? "location" : undefined}
        onClick={(e) => { e.preventDefault(); visit.back(); }}>{ui.room}</a>
      {stations.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} style={portrait ? button : link} aria-current={stop === i + 1 ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); visit.go(i + 1); }}>{s.name}</a>
      ))}
    </>
  );
  return (
    <>
    {hintShown && <div role="status" data-hint style={{ ...hint, opacity: visited ? 0 : 1 }}>{portrait ? ui.hintPortrait : ui.hintLandscape}</div>}
    <nav aria-label={ui.hud} style={portrait ? { ...hud, ...hudPhone } : hud}>
      <div style={{ color: "#ffb347" }}>{identity.availability}</div>
      <div style={row}>
        {links.map((l) => <a key={l.label} href={l.href} style={link}>{l.label}</a>)}
      </div>
      {portrait ? <div data-menu style={menuBar}>{menu}</div> : <div style={row}>{menu}</div>}
    </nav>
    </>
  );
}
const hudPhone: CSSProperties = { left: 0, maxWidth: "100vw" };
const menuBar: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, padding: PHONE_PAD, background: "rgba(5,8,10,0.7)",
  display: "grid", gridTemplateColumns: `repeat(${PHONE_COLS}, 1fr)`, gridAutoRows: `${BUTTON_PX}px`, gap: PHONE_GAP,
};
const button: CSSProperties = {
  color: "#7dffb0", border: "1px solid #7dffb0", borderRadius: 4, display: "flex", alignItems: "center",
  justifyContent: "center", textAlign: "center", fontSize: "0.8rem", lineHeight: 1.1, minHeight: BUTTON_PX, boxSizing: "border-box",
};
const hint: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: "calc(var(--meter-bottom, 1rem) + 5.5rem)", zIndex: 15, textAlign: "center",
  color: "#ffb347", fontSize: "0.9rem", pointerEvents: "none", transition: "opacity 0.5s",
};
const hud: CSSProperties = {
  position: "fixed", top: 0, right: 0, zIndex: 20, maxWidth: "min(100vw, 34rem)", padding: "0.6rem 0.8rem",
  background: "rgba(5,8,10,0.7)", fontSize: "0.8rem", textAlign: "right",
};
const row: CSSProperties = { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.2rem 0.8rem" };
const link: CSSProperties = { color: "#7dffb0" };
