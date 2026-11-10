import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { MeterLink } from "./nixie";
import { Tear, type PageTurn } from "./TearView";
import { fill, stations, ui } from "./content";
import { Hud, usePortrait } from "./Hud";
import { barFor, createHover, meterDigits, PREVIEW_REST_MS, previewStop, type BarKey } from "./bar";
import { ScreenPanels } from "./text/ScreenPanels";
import { Meter } from "./Meter";
import { gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import type { Shift } from "./shift";
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

  // The hover preview (#228): where the pointer rests at the overview. The TV reports through the meter link (the room's
  // canvas), a HUD link through `onPoint`. The pointer's rest is the rule in src/bar.ts; this only hears of it and asks for the
  // render when the rest is over (the digits follow the line 150 ms later).
  const [hover] = useState(() => createHover(() => performance.now()));
  const [rested, restedNow] = useReducer((n: number) => n + 1, 0);
  const pointed = useSyncExternalStore(hover.subscribe, hover.preview);
  const preview = visit.target() === 0 ? pointed : null; // a visit under way (or a fade's second half) is not the overview
  useEffect(() => {
    meter.tvHover = (stop) => hover.point("tv", stop);
    return () => { meter.tvHover = () => {}; };
  }, [meter, hover]);
  const onPoint = useCallback((stop: number | null) => hover.point("link", stop), [hover]);
  // A visit ends the pointer's claim on a HUD link: it has not moved since, so back at the overview it shows no preview until
  // it enters a link again (the shift's rule: leaving ends on the true reading). The TV's report already follows the same rule
  // (TvTargets reports it only at the overview), so a pointer left on a TV starts its rest again on the landing.
  useEffect(() => visit.subscribe((e) => {
    if (e.type === "move") hover.point("link", null);
    else if (e.stop === 0) hover.rest();
  }), [visit, hover]);
  useEffect(() => {
    if (!preview || previewStop(here, preview) === null) return;
    const left = preview.since + PREVIEW_REST_MS - performance.now();
    if (left <= 0) return;
    const id = setTimeout(restedNow, left + 2);
    return () => clearTimeout(id);
  }, [preview, here, rested]);

  const deploys = gap ? gap.deploys : pendingDeploys;
  const gapLine = gap ? gapLabel(gap) : ui.readingPending;
  // The bar shows the stop being flown to, not the camera's place on the way: its keys, its line and its digits. Through a preview
  // the line is the station's world line and name at once (no count), and the digits follow once the pointer has rested.
  const portrait = usePortrait();
  const bar = barFor(here, portrait ? "portrait" : "square");
  const previewed = previewStop(here, preview);
  const shown = meterDigits({ who: "bar", where: here, preview, deploys, now: performance.now(), playing: barShift, reduced });
  const barLine = previewed !== null ? stationLabel(previewed) : bar.stop === 0 ? gapLine : fill(ui.stopLine, { label: stationLabel(bar.stop), n: bar.stop, total: stations.length });
  const press = (key: BarKey) => {
    if (key === "prev") visit.prev();
    else if (key === "room") visit.back();
    else if (key === "next") visit.next();
    else visit.go(1);
  };
  useEffect(() => { meter.next = () => visit.next(); }, [meter, visit]);
  // The desk meter works its digits out from these, by the same rule as the bar (src/bar.ts).
  useEffect(() => { meter.deploys = deploys; meter.preview = preview; meter.redraw?.(); }, [meter, deploys, preview]);

  return (
    <>
      <Tear shift={shifts} turn={turn} reduced={reduced} />
      <ScreenPanels onTurn={pageTurned} />
      <Hud where={here} visited={visited} visit={visit} onPoint={onPoint} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "var(--meter-bottom, 1rem)", zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Meter reading={shown.reading} label={barLine} keys={bar.keys}
            live={gap ? gap.live : true} pending={!gap} shift={shown.scramble} onKey={press} />
        </div>
      </div>
    </>
  );
}

const stationLabel = (i: number) => `${stations[i - 1].worldLine}: ${stations[i - 1].name}`;
