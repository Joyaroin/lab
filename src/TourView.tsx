import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import type { MeterLink } from "./nixie";
import { Tear, type PageTurn } from "./TearView";
import { stations } from "./content";
import { Hud } from "./Hud";
import { ScreenPanels } from "./text/ScreenPanels";
import { Meter } from "./Meter";
import { formatReading, gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import type { NavigationKind, Shift } from "./shift";
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
export function Tour({ gap, progress, meter, shift: shifts }: { gap: Gap | null; progress: MutableRefObject<number>; meter: MeterLink; shift: Shift }) {
  const [p, setP] = useState(scrollProgress);
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

  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const unmount = shifts.mount({
      startProgress: scrollProgress(),
      navigationType: (nav?.type ?? "navigate") as NavigationKind,
    });
    const onScroll = () => {
      progress.current = scrollProgress(); setP(progress.current);
      shifts.observe(progress.current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { unmount(); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [progress, shifts]);

  const jump = useCallback((station: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: progressFor(station) * max, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const deploys = gap ? gap.deploys : pendingDeploys;
  const t = tourAt(p, deploys);
  const label = gap ? gapLabel(gap) : "reading prod and staging…";
  const next = t.nearestStop >= STATION_COUNT ? 0 : t.nearestStop + 1;
  const digits = formatReading(Math.round(t.reading));
  useEffect(() => { meter.next = () => jump(next); }, [meter, jump, next]);
  useEffect(() => { meter.digits = digits; meter.redraw?.(); }, [meter, digits]);

  return (
    <>
      <div aria-hidden style={{ height: `${SCROLL_SCREENS * 100}vh` }} />
      <Tear shift={shifts} turn={turn} reduced={reduced} />
      <ScreenPanels onTurn={pageTurned} />
      <Hud nearestStop={t.nearestStop} onJump={jump} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "1rem", zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Meter reading={Math.round(t.reading)} label={t.nearestStop === 0 ? label : stationLabel(t.nearestStop)}
            live={gap ? gap.live : true} pending={!gap} shift={barShift} onClick={() => jump(next)} />
        </div>
      </div>
    </>
  );
}

const stationLabel = (i: number) => `${stations[i - 1].worldLine}: ${stations[i - 1].name}`;
