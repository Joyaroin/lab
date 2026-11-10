import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { identity, links, stations, ui } from "./content";
import {
  BUTTON_PX, clearances, COMPACT_GAP, COMPACT_LINE_H, HUD_GAP, HUD_MARGIN, hudTier, LINK_ROW_H, LINK_ROW_W, NAME_BLOCK_W, PHONE_COLS, PHONE_GAP_PX,
  PHONE_MENU_H, PHONE_PAD_PX,
} from "./pin";
import type { Visit } from "./visit";
import type { Where } from "./where";

/** Where the meter bar's wrapper stands above the window's bottom. The HUD owns it. */
const METER_BOTTOM = "1rem";
/** The meter bar clears the phone menu (its height is `PHONE_MENU_H`, from src/pin.ts) and the usual 1rem above. */
const PHONE_METER_BOTTOM = `calc(${PHONE_MENU_H}px + 1rem)`;

/** The window's size, read again on every resize. Everything the HUD places by `clearances` follows it. */
function useWin() {
  const [win, setWin] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const read = () => setWin((w) => (w.width === window.innerWidth && w.height === window.innerHeight ? w : { width: window.innerWidth, height: window.innerHeight }));
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return win;
}

/** True on a portrait window, the same test the framing makes (width under height). */
export function usePortrait() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener("resize", cb); return () => window.removeEventListener("resize", cb); },
    () => window.innerWidth < window.innerHeight,
  );
}

// The always-on overlay (#222). On a landscape window: a name block at the top left (name, title, availability)
// and a row of links: Room and the stations, a divider, then the outside links. From ONE_ROW_MIN_W (src/pin.ts)
// the two share a line; narrower, the row has its own line under the name block, and from under TWO_LINE_MIN_W (the row's box plus both margins)
// it wraps as two whole groups, so the HUD has three lines. On a short landscape window (`hudTier`, src/pin.ts) the HUD is compact: name, title
// and outside links on one line and the stops under it, or from under COMPACT_MIN_W three short lines. On a portrait window the name block spans the top with the outside links (no
// availability line) and Room and the stations are a bottom menu, three to a row. Fixed, so it is reachable at every
// point. The station links are real #id links that fly to that station; Room flies back to the overview.
// It owns what #177 changes: the parts that depend on where the visitor is and on whether they have
// visited a station yet (`visited`, set on the first landing at one), and the meter bar's bottom offset
// (the CSS variable --meter-bottom, which the bar's wrapper reads). The sizes that matter (the boxes, the
// clearances, the hint's height) come from src/pin.ts, so the fitting rule and the HUD can't drift apart.
export function Hud({ where, visited, visit }: { where: Where; visited: boolean; visit: Visit }) {
  const win = useWin();
  const tier = hudTier(win); // the same rule the clearances follow (src/pin.ts)
  const portrait = tier === "phone";
  const oneRow = tier === "oneRow";
  const compact = tier === "compactTwo" || tier === "compactThree";
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
  const look = (i: number, base: CSSProperties, current: CSSProperties) => (stop === i ? { ...base, ...current } : base);
  const stopLink = portrait ? button : compact ? linkCompact : link;
  const stopHere = portrait ? buttonHere : linkHere;
  const stopLinks = (
    <>
      <a href="./" style={look(0, stopLink, stopHere)} aria-current={stop === 0 ? "location" : undefined}
        onClick={(e) => { e.preventDefault(); visit.back(); }}>{ui.room}</a>
      {stations.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} style={look(i + 1, stopLink, stopHere)} aria-current={stop === i + 1 ? "location" : undefined}
          onClick={(e) => { e.preventDefault(); visit.go(i + 1); }}>{s.name}</a>
      ))}
    </>
  );
  // The outside links open a new tab; the mark is decoration, so it is out of the link's name.
  const outside = links.map((l) => (
    <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={compact ? linkTight : link}>{l.label}<span aria-hidden="true" style={compact ? undefined : { marginLeft: 4 }}>↗</span></a>
  ));
  return (
    <>
    {hintShown && <div role="status" data-hint style={{ ...hint, bottom: clearances(win).bottom + HINT_GAP, opacity: visited ? 0 : 1 }}>{portrait ? ui.hintPortrait : ui.hintLandscape}</div>}
    <nav aria-label={ui.hud} style={portrait ? hudPhone : oneRow ? hudOneRow : compact ? hudCompact : hudTwoLines}>
      {compact ? (
        // Two lines: name, title and the outside links, then the stops. Three (under COMPACT_MIN_W): the outside links get a line.
        <>
          <div data-name-block style={{ ...nameBlock, ...compactLine }}>
            <div style={{ ...nameStyle, whiteSpace: "nowrap" }}>{identity.name}</div>
            <div style={{ ...lineStyle, whiteSpace: "nowrap" }}>{identity.title}</div>
            {tier === "compactTwo" && <div style={{ ...groupWhole, columnGap: 4, marginLeft: "auto", paddingLeft: 6 }}>{outside}</div>}
          </div>
          {tier === "compactThree" && <div data-outside style={{ ...nameBlock, ...compactLine, columnGap: 4 }}>{outside}</div>}
          <div data-link-row style={{ ...compactLine, ...linkRowBase, flexWrap: "nowrap" }}>
            <div style={groupWhole}>{stopLinks}</div>
          </div>
        </>
      ) : portrait ? (
        <div data-name-block style={{ ...nameBlock, ...nameBlockPhone }}>
          <div style={nameStyle}>{identity.name}</div>
          <div style={lineStyle}>{identity.title}</div>
          <div style={{ ...groupStyle, marginTop: 4 }}>{outside}</div>
        </div>
      ) : (
        <>
          <div data-name-block style={nameBlock}>
            <div style={nameStyle}>{identity.name}</div>
            <div style={lineStyle}>{identity.title}</div>
            <div style={{ ...lineStyle, color: "#ffb347" }}>{identity.availability}</div>
          </div>
          <div data-link-row style={oneRow ? linkRowOne : linkRowOwnLine}>
            <div style={groupWhole}>{stopLinks}</div>
            <span aria-hidden="true" style={divider} />
            <div style={groupWhole}>{outside}</div>
          </div>
        </>
      )}
      {portrait && <div data-menu style={menuBar}>{stopLinks}</div>}
    </nav>
    </>
  );
}

/** The hint line stands this far above the bottom clearance, so it clears the meter device. */
const HINT_GAP = 8;
/** The HUD's text is never under this (px). */
const HUD_FONT = 14;
const INK = "#05080a", GREEN = "#7dffb0", AMBER = "#ffb347";
// The backdrop of a box is a spread shadow, not padding, so the box itself stays inside the size src/pin.ts gives it.
const backdrop = "0 0 0 6px rgba(5,8,10,0.7)";
const hudBase: CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, zIndex: 20, display: "flex", pointerEvents: "none", fontSize: HUD_FONT, lineHeight: 1.3,
};
const hudOneRow: CSSProperties = { ...hudBase, padding: `${HUD_MARGIN}px`, paddingBottom: 0, justifyContent: "space-between", alignItems: "flex-start", gap: HUD_GAP };
const hudTwoLines: CSSProperties = { ...hudBase, padding: `${HUD_MARGIN}px`, paddingBottom: 0, flexDirection: "column", alignItems: "flex-start", gap: 8 };
const hudCompact: CSSProperties = { ...hudBase, padding: `${HUD_MARGIN}px`, paddingBottom: 0, flexDirection: "column", alignItems: "flex-start", gap: COMPACT_GAP };
const compactLine: CSSProperties = { display: "flex", alignItems: "center", columnGap: 10, height: COMPACT_LINE_H, maxWidth: "100%", boxSizing: "border-box" };
const hudPhone: CSSProperties = { ...hudBase, flexDirection: "column" };
const nameBlock: CSSProperties = {
  boxSizing: "border-box", maxWidth: NAME_BLOCK_W, background: "rgba(5,8,10,0.7)", boxShadow: backdrop, pointerEvents: "auto", flex: "none",
  borderRadius: 2,
};
const nameBlockPhone: CSSProperties = { maxWidth: "none", width: "100%", boxShadow: "none", borderRadius: 0, padding: "8px 0.9rem" };
const nameStyle: CSSProperties = { fontSize: "1.25rem", fontWeight: "bold", lineHeight: 1.2 };
const lineStyle: CSSProperties = { fontSize: HUD_FONT };
const linkRowBase: CSSProperties = {
  display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 0, rowGap: 4, background: "rgba(5,8,10,0.7)", boxShadow: backdrop,
  pointerEvents: "auto", boxSizing: "border-box", borderRadius: 2,
};
const linkRowOne: CSSProperties = { ...linkRowBase, flexWrap: "nowrap", maxWidth: LINK_ROW_W, height: LINK_ROW_H, flex: "none" };
const linkRowOwnLine: CSSProperties = { ...linkRowBase, maxWidth: "100%" };
const groupStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 };
// A landscape group never wraps inside itself: when the row is too narrow for both it wraps between the groups, so
// no line holds a single link. Narrower than the stations group plus both margins (about 540 px) it overflows instead.
const groupWhole: CSSProperties = { ...groupStyle, flexWrap: "nowrap", flex: "none" };
const divider: CSSProperties = { width: 1, height: "1.1em", background: "#2f7a4d", margin: "0 6px" };
const menuBar: CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, padding: PHONE_PAD_PX, background: "rgba(5,8,10,0.7)", pointerEvents: "auto",
  display: "grid", gridTemplateColumns: `repeat(${PHONE_COLS}, 1fr)`, gridAutoRows: `${BUTTON_PX}px`, gap: PHONE_GAP_PX,
};
const button: CSSProperties = {
  color: GREEN, border: `1px solid ${GREEN}`, borderRadius: 4, display: "flex", alignItems: "center",
  justifyContent: "center", textAlign: "center", fontSize: HUD_FONT, lineHeight: 1.1, minHeight: BUTTON_PX, boxSizing: "border-box",
  fontWeight: "normal", background: "transparent",
};
// The current stop: heavier and filled, not only a different colour.
const here: CSSProperties = { color: INK, background: GREEN, fontWeight: "bold" };
const buttonHere = here;
const linkHere: CSSProperties = { ...here, textDecoration: "none" };
const linkCompact: CSSProperties = { color: GREEN, padding: "4px 5px", fontWeight: "normal", background: "transparent", whiteSpace: "nowrap" };
// The outside links beside the title: 4 px of padding each side, so name, title and links fit COMPACT_MIN_W (src/pin.ts).
const linkTight: CSSProperties = { ...linkCompact, padding: "4px" };
const link: CSSProperties = { color: GREEN, padding: "5px 5px", fontWeight: "normal", background: "transparent", whiteSpace: "nowrap" };
const hint: CSSProperties = {
  position: "fixed", left: 0, right: 0, zIndex: 15, textAlign: "center",
  color: AMBER, fontSize: "0.9rem", pointerEvents: "none", transition: "opacity 0.5s",
};
