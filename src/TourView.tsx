import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MeterLink } from "./nixie";
import { Tear, type PageTurn } from "./TearView";
import { stations, ui } from "./content";
import { Hud } from "./Hud";
import { ScreenPanels } from "./text/ScreenPanels";
import { Meter } from "./Meter";
import { formatReading, gapLabel, type Gap } from "./gap";
import { pendingDeploys } from "./useGap";
import type { Shift } from "./shift";
import { readingAt } from "./tour";
import type { Visit } from "./visit";
import type { Where } from "./where";

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The visit drives the tour: the camera follows it (see Room's CameraRig), and this reports where the
// visitor is to the shift and the HUD as it changes. The page does not scroll.
export function Tour({ gap, visit, meter, shift: shifts }: { gap: Gap | null; visit: Visit; meter: MeterLink; shift: Shift }) {
  const [here, setHere] = useState<Where>(() => visit.where(performance.now()));
  // The first landing at a station: the hint (#177) fades after it.
  const [visited, setVisited] = useState(false);
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
  useEffect(() => {
    // A move starting or landing is what changes where the visitor is.
    const report = () => setHere(visit.where(performance.now()));
    const off = visit.subscribe((e) => {
      if (e.type === "land" && e.stop >= 1) setVisited(true);
      report();
    });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && visit.target() >= 1) visit.back(); };
    window.addEventListener("keydown", onKey);
    return () => { off(); window.removeEventListener("keydown", onKey); };
  }, [visit]);

  const deploys = gap ? gap.deploys : pendingDeploys;
  const nearestStop = here.kind === "at" ? here.stop : Math.round(here.from + here.f);
  const t = { nearestStop, reading: readingAt(here, deploys) };
  const label = gap ? gapLabel(gap) : ui.readingPending;
  const digits = formatReading(Math.round(t.reading));
  useEffect(() => { meter.next = () => visit.next(); }, [meter, visit]);
  useEffect(() => { meter.digits = digits; meter.redraw?.(); }, [meter, digits]);

  return (
    <>
      <Tear shift={shifts} turn={turn} reduced={reduced} />
      <ScreenPanels onTurn={pageTurned} />
      <Hud where={here} visited={visited} visit={visit} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "var(--meter-bottom, 1rem)", zIndex: 10, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div style={{ pointerEvents: "auto" }}>
          <Meter reading={Math.round(t.reading)} label={t.nearestStop === 0 ? label : stationLabel(t.nearestStop)}
            live={gap ? gap.live : true} pending={!gap} shift={barShift} onClick={() => visit.next()} />
        </div>
      </div>
    </>
  );
}

const stationLabel = (i: number) => `${stations[i - 1].worldLine}: ${stations[i - 1].name}`;
