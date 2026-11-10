import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MeterLink } from "./nixie";
import { Tear, type PageTurn } from "./TearView";
import { fill, stations, ui } from "./content";
import { Hud, usePortrait } from "./Hud";
import { barFor, type BarKey } from "./bar";
import { ScreenPanels } from "./text/ScreenPanels";
import { Meter } from "./Meter";
import { formatReading, gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import type { Shift } from "./shift";
import { readingAt } from "./tour";
import type { Visit } from "./visit";
import type { Where } from "./where";

/** Focus follows the visitor: landing at a station focuses its panel (once the text shows), and landing at the
 *  overview focuses the link or control that was focused when the visitor left it. */
function useFocusFollowsVisit(visit: Visit) {
  useEffect(() => {
    let origin: Element | null = null;
    let frame = 0;
    const focusPanel = (stop: number) => {
      const until = performance.now() + 5000;
      const tryFocus = () => {
        const panel = document.querySelector<HTMLElement>(`[data-screen="${stations[stop - 1].id}"]`);
        if (panel && getComputedStyle(panel).visibility !== "hidden") { panel.focus({ preventScroll: true }); return; }
        if (performance.now() < until) frame = requestAnimationFrame(tryFocus);
      };
      tryFocus();
    };
    const land = (stop: number) => {
      cancelAnimationFrame(frame);
      if (stop >= 1) return focusPanel(stop);
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus({ preventScroll: true });
      origin = null;
    };
    const off = visit.subscribe((e) => {
      if (e.type === "move") {
        cancelAnimationFrame(frame);
        // leaving the overview: remember what started it (the page body when a click on a TV did)
        if (e.from.kind === "at" && e.from.stop === 0 && !origin && document.activeElement !== document.body) origin = document.activeElement;
      } else land(e.stop);
    });
    if (visit.target() >= 1) land(visit.target()); // opened on a station by a direct link
    return off;
  }, [visit]);
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The visit drives the tour: the camera follows it (see Room's CameraRig), and this reports where the
// visitor is to the shift and the HUD as it changes. The page does not scroll.
export function Tour({ gap, visit, meter, shift: shifts }: { gap: Gap | null; visit: Visit; meter: MeterLink; shift: Shift }) {
  const [here, setHere] = useState<Where>(() => visit.where(performance.now()));
  // The first landing at a station: the hint (#177) fades after it.
  const [visited, setVisited] = useState(() => visit.target() >= 1);
  // The tour mounts as the meter starts its power-on, and tells the shift so (below). It reports where
  // the visitor is and that a page turned; the shift owns all the timing.
  const [reduced] = useState(prefersReducedMotion);
  // The bar plays what the shift says is playing; leaving mid-shift ends it. The tear subscribes itself.
  const barShift = useSyncExternalStore(shifts.subscribe, () => shifts.playing);

  // A Work page turn's flick, on that TV's screen only. The page turns whether or not it plays.
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const turnId = useRef(0);
  const pageTurned = useCallback((el: HTMLElement) => {
    if (shifts.turn()) setTurn({ el, id: ++turnId.current });
  }, [shifts]);

  // The shift hears of the visitor's place in the same commit that shows it (the HUD's aria-current), so what the
  // visitor sees and what the shift waits from are the same moment, even when the page is busy.
  useLayoutEffect(() => shifts.mount({ startWhere: visit.where(performance.now()) }), [visit, shifts]);
  useLayoutEffect(() => { shifts.observe(here); }, [here, shifts]);
  useFocusFollowsVisit(visit);
  useEffect(() => {
    // A move starting or landing is what changes where the visitor is.
    const report = () => setHere(visit.where(performance.now()));
    const off = visit.subscribe((e) => {
      if (e.type === "land" && e.stop >= 1) setVisited(true);
      report();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && visit.target() >= 1) visit.back();
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === "ArrowLeft") visit.prev();
      else if (e.key === "ArrowRight") visit.next();
    };
    window.addEventListener("keydown", onKey);
    return () => { off(); window.removeEventListener("keydown", onKey); };
  }, [visit]);

  const deploys = gap ? gap.deploys : pendingDeploys;
  const gapLine = gap ? gapLabel(gap) : ui.readingPending;
  const digits = formatReading(Math.round(readingAt(here, deploys)));
  // The bar shows the stop being flown to, not the camera's place on the way: its keys, its line and its digits.
  const portrait = usePortrait();
  const bar = barFor(here, portrait ? "portrait" : "square");
  const barReading = Math.round(readingAt({ kind: "at", stop: bar.stop }, deploys));
  const barLine = bar.stop === 0 ? gapLine : fill(ui.stopLine, { label: stationLabel(bar.stop), n: bar.stop, total: stations.length });
  const press = (key: BarKey) => {
    if (key === "prev") visit.prev();
    else if (key === "room") visit.back();
    else if (key === "next") visit.next();
    else visit.go(1);
  };
  useEffect(() => { meter.next = () => visit.next(); }, [meter, visit]);
  useEffect(() => { meter.digits = digits; meter.redraw?.(); }, [meter, digits]);

  return (
    <>
      <Tear shift={shifts} turn={turn} reduced={reduced} />
      <ScreenPanels onTurn={pageTurned} />
      <Hud where={here} visited={visited} visit={visit} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "var(--meter-bottom, 1rem)", zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Meter reading={barReading} label={barLine} keys={bar.keys}
            live={gap ? gap.live : true} pending={!gap} shift={barShift} poweredAt={meter.onMs} reduced={reduced} onKey={press} />
        </div>
      </div>
    </>
  );
}

const stationLabel = (i: number) => `${stations[i - 1].worldLine}: ${stations[i - 1].name}`;
