import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { POWER_ON_SECONDS, SHIFT_SECONDS, setMeterShift, type MeterLink } from "./nixie";
import { Tear, type PageTurn } from "./TearView";
import { stations } from "./content";
import { Hud } from "./Hud";
import { ScreenPanels } from "./ScreenPanels";
import { Meter } from "./Meter";
import { formatReading, gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import { createShifts, WAIT_MS, SNAP_BACK_MS, type Play, type ShiftKind, type TextGate } from "./shift";
import { progressFor, STATION_COUNT } from "./hold";
import { tourAt } from "./tour";

// Page height in screens: how much scrolling the tour takes. 9 screens is 8 of scrolling, about
// 0.8 of a screen per stretch of travel, plus half a screen of hold at each station.
const SCROLL_SCREENS = 9;

/** Timers are set a little past the moment they wait for (and a late timer is no problem), so that
 *  when one fires the moment has really come: the wait is over, the tear has snapped back. */
const TIMER_SLACK_MS = 30;

/** After a reload the browser puts the scroll position back once the page is tall enough, which is
 *  just after the tour mounts. The first move off the top within this long counts as that restore,
 *  not an arrival. Long, because a slow device restores late; the cost is that a visitor who jumps
 *  into a hold within this long of a reload gets no shift there, which is harmless. */
const RESTORE_WINDOW_MS = 5000;

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scrollProgress = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
};

// Scroll drives the tour. The page scrolls (a tall spacer); the room is fixed behind it.
// `progress` is shared with the room's camera via a ref so frames don't re-render React.
export function Tour({ gap, progress, meter, gate }: { gap: Gap | null; progress: MutableRefObject<number>; meter: MeterLink; gate: TextGate }) {
  const [p, setP] = useState(scrollProgress);
  // The tour mounts as the meter starts its power-on, so no shift starts until that is over. The
  // page opening inside a hold (a reload) is not an arrival: no shift, and its text shows.
  const [reduced] = useState(prefersReducedMotion);
  const [quietUntil] = useState(() => performance.now() + POWER_ON_SECONDS * 1000);
  const [shifts] = useState(() => createShifts(reduced, { startProgress: scrollProgress(), quietUntil }));
  const [barShift, setBarShift] = useState<Play | null>(null);
  // The tear is kept apart from the bar's shift: leaving mid-shift ends the bar's, but the tear plays
  // out its own length, so its snap back is always where the flash limit counted it.
  const [tearShift, setTearShift] = useState<Play | null>(null);

  // A Work page turn's flick, on that TV's screen only. The page turns whether or not it plays.
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const turnId = useRef(0);
  const pageTurned = useCallback((el: HTMLElement) => {
    if (shifts.turn(performance.now())) setTurn({ el, id: ++turnId.current });
  }, [shifts]);

  const turnStarted = useCallback((nowMs: number) => shifts.turnStarted(nowMs), [shifts]);

  // The tear starts a frame or more after the shift fires (later on a slow device), and the text
  // follows once it is over: say when it began, and ask the room for a frame to show the text.
  const tearTimer = useRef(0);
  const tearStarted = useCallback((kind: ShiftKind, nowMs: number) => {
    shifts.tearStarted(kind, nowMs);
    clearTimeout(tearTimer.current);
    if (kind === "short") return; // a return's text is already showing
    tearTimer.current = window.setTimeout(() => meter.redraw?.(), SHIFT_SECONDS[kind] * 1000 + SNAP_BACK_MS + TIMER_SLACK_MS);
  }, [shifts, meter]);
  useEffect(() => () => clearTimeout(tearTimer.current), []);

  useEffect(() => {
    gate.ready = shifts.ready; gate.resolves = shifts.resolves;
    return () => { gate.ready = () => true; gate.resolves = () => false; };
  }, [gate, shifts]);

  useEffect(() => {
    let timer = 0, id = 0;
    let active: number | null = null; // the station whose shift is playing
    const stop = () => {
      active = null;
      setMeterShift(meter, null);
      setBarShift(null);
    };
    const check = () => {
      const kind = shifts.observe(progress.current, performance.now());
      // Leaving mid-shift ends it: the bar and the desk meter go straight to the reading for
      // where the visitor is. The tear finishes its own length.
      if (active !== null && shifts.station !== active) stop();
      if (kind) {
        active = shifts.station;
        setMeterShift(meter, kind);
        const next: Play = { kind, id: ++id };
        setBarShift(next); setTearShift(next);
      }
      meter.redraw?.(); // the text's gate may have opened
    };
    // After a reload the browser puts the scroll position back once the page is tall enough, which
    // is just after this mounts. That first scroll is the page's doing, not an arrival.
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    let restoring = nav?.type === "reload" || nav?.type === "back_forward";
    const mountedAt = performance.now();
    const onScroll = () => {
      progress.current = scrollProgress(); setP(progress.current);
      if (restoring && progress.current > 0) { // the first move off the top, soon after mounting
        restoring = false;
        if (performance.now() - mountedAt < RESTORE_WINDOW_MS) shifts.restore(progress.current);
      }
      check();
      clearTimeout(timer); // the visitor may have stopped
      timer = window.setTimeout(check, Math.max(WAIT_MS, quietUntil - performance.now()) + TIMER_SLACK_MS);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { clearTimeout(timer); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [progress, shifts, meter, quietUntil]);

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
