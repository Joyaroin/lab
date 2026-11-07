import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { setMeterShift, type MeterLink } from "./nixie";
import { Tear, type PageTurn } from "./TearView";
import { stations } from "./content";
import { Hud } from "./Hud";
import { ScreenPanels } from "./ScreenPanels";
import { Meter } from "./Meter";
import { formatReading, gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import type { NavigationKind, Play, Shift, ShiftKind, TextGate } from "./shift";
import { progressFor, STATION_COUNT } from "./hold";
import { tourAt } from "./tour";

// Page height in screens: how much scrolling the tour takes. 9 screens is 8 of scrolling, about
// 0.8 of a screen per stretch of travel, plus half a screen of hold at each station.
const SCROLL_SCREENS = 9;

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scrollProgress = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
};

// Scroll drives the tour. The page scrolls (a tall spacer); the room is fixed behind it.
// `progress` is shared with the room's camera via a ref so frames don't re-render React.
export function Tour({ gap, progress, meter, gate, shift: shifts }: { gap: Gap | null; progress: MutableRefObject<number>; meter: MeterLink; gate: TextGate; shift: Shift }) {
  const [p, setP] = useState(scrollProgress);
  // The tour mounts as the meter starts its power-on, and tells the shift so (below). It reports where
  // the visitor is and that a page turned; the shift owns all the timing.
  const [reduced] = useState(prefersReducedMotion);
  const [barShift, setBarShift] = useState<Play | null>(null);
  // The tear is kept apart from the bar's shift: leaving mid-shift ends the bar's, but the tear plays
  // out its own length, so its snap back is always where the flash limit counted it.
  const [tearShift, setTearShift] = useState<Play | null>(null);

  // A Work page turn's flick, on that TV's screen only. The page turns whether or not it plays.
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const turnId = useRef(0);
  const pageTurned = useCallback((el: HTMLElement) => {
    if (shifts.turn()) setTurn({ el, id: ++turnId.current });
  }, [shifts]);

  const turnStarted = useCallback((nowMs: number) => shifts.turnStarted(nowMs), [shifts]);

  // The tear starts a frame or more after the shift fires (later on a slow device): say when it began.
  const tearStarted = useCallback((kind: ShiftKind, nowMs: number) => shifts.tearStarted(kind, nowMs), [shifts]);

  useEffect(() => {
    gate.ready = shifts.ready; gate.resolves = shifts.resolves;
    return () => { gate.ready = () => true; gate.resolves = () => false; };
  }, [gate, shifts]);

  useEffect(() => {
    let id = 0;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const unmount = shifts.mount({
      startProgress: scrollProgress(),
      navigationType: (nav?.type ?? "navigate") as NavigationKind,
      onStart: ({ kind }) => {
        setMeterShift(meter, kind);
        const next: Play = { kind, id: ++id };
        setBarShift(next); setTearShift(next);
      },
      // Leaving mid-shift ends the bar's and the desk meter's shift. The tear finishes its own length.
      onEnd: () => { setMeterShift(meter, null); setBarShift(null); },
      wake: () => meter.redraw?.(),
    });
    const onScroll = () => {
      progress.current = scrollProgress(); setP(progress.current);
      shifts.observe(progress.current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { unmount(); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [progress, shifts, meter]);

  const jump = useCallback((station: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: progressFor(station) * max, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const deploys = gap ? gap.deploys : pendingDeploys;
  const t = tourAt(p, deploys, { width: window.innerWidth, height: window.innerHeight });
  const label = gap ? gapLabel(gap) : "reading prod and staging…";
  const next = t.station >= STATION_COUNT ? 0 : t.station + 1;
  const digits = formatReading(Math.round(t.reading));
  useEffect(() => { meter.next = () => jump(next); }, [meter, jump, next]);
  useEffect(() => { meter.digits = digits; meter.redraw?.(); }, [meter, digits]);

  return (
    <>
      <div aria-hidden style={{ height: `${SCROLL_SCREENS * 100}vh` }} />
      <Tear shift={tearShift} turn={turn} reduced={reduced} onStart={tearStarted} onTurnStart={turnStarted} />
      <ScreenPanels onTurn={pageTurned} />
      <Hud current={t.station} onJump={jump} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "1rem", zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Meter reading={Math.round(t.reading)} label={t.station === 0 ? label : stationLabel(t.station)}
            live={gap ? gap.live : true} pending={!gap} shift={barShift} onClick={() => jump(next)} />
        </div>
      </div>
    </>
  );
}

const stationLabel = (i: number) => `${stations[i - 1].worldLine}: ${stations[i - 1].name}`;
