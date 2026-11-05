import { useCallback, useEffect, useState, type MutableRefObject } from "react";
import type { MeterLink } from "./nixie";
import { stations } from "./content";
import { Hud } from "./Hud";
import { ScreenPanels } from "./ScreenPanels";
import { Meter } from "./Meter";
import { formatReading, gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import { progressFor, STATION_COUNT, tourAt } from "./tour";

const SCROLL_SCREENS = 6; // page height in screens: sets how much scrolling the tour takes

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scrollProgress = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? window.scrollY / max : 0;
};

// Scroll drives the tour. The page scrolls (a tall spacer); the room is fixed behind it.
// `progress` is shared with the room's camera via a ref so frames don't re-render React.
export function Tour({ gap, progress, meter }: { gap: Gap | null; progress: MutableRefObject<number>; meter: MeterLink }) {
  const [p, setP] = useState(scrollProgress);

  useEffect(() => {
    const onScroll = () => { progress.current = scrollProgress(); setP(progress.current); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [progress]);

  const jump = useCallback((station: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: progressFor(station) * max, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const deploys = gap ? gap.deploys : pendingDeploys;
  const t = tourAt(p, deploys);
  const label = gap ? gapLabel(gap) : "reading prod and staging…";
  const next = t.station >= STATION_COUNT ? 0 : t.station + 1;
  const digits = formatReading(Math.round(t.reading));
  useEffect(() => { meter.next = () => jump(next); }, [meter, jump, next]);
  useEffect(() => { meter.digits = digits; meter.redraw?.(); }, [meter, digits]);

  return (
    <>
      <div aria-hidden style={{ height: `${SCROLL_SCREENS * 100}vh` }} />
      <ScreenPanels />
      <Hud current={t.station} onJump={jump} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "1rem", zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Meter reading={Math.round(t.reading)} label={t.station === 0 ? label : stationLabel(t.station)}
            live={gap ? gap.live : true} pending={!gap} onClick={() => jump(next)} />
        </div>
      </div>
    </>
  );
}

const stationLabel = (i: number) => `${stations[i - 1].worldLine}: ${stations[i - 1].name}`;
