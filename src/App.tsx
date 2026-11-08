import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { BootScreen } from "./BootScreen";
import { SignalLost } from "./SignalLost";
import { browserWebGL, checkCapability, type FailureReason } from "./capability";
import { Tour, prefersReducedMotion } from "./TourView";
import { useGap } from "./useGap";
import { meterLink } from "./nixie";
import { createShift } from "./shift";
import { watchForStall } from "./stall";
import { ui } from "./content";
import type { Where } from "./where";
import { Component, type ReactNode } from "react";

const loadRoom = () => import("./Room");
const Room = lazy(loadRoom);

class SceneBoundary extends Component<{ onFail: (e: unknown) => void; children: ReactNode }> {
  componentDidCatch(e: unknown) { this.props.onFail(e); }
  static getDerivedStateFromError() { return {}; }
  render() { return this.props.children; }
}

const BOOT_FADE_MS = 700;
// A load ends at signal lost when it has made no progress for this long. Progress is the room
// code arriving, and then each chunk of the room model (see Room's onProgress). The limit is
// set by the one step that reports nothing while it runs: the room code (about 256 KB gzip),
// which takes about 10 s at 200 kbit/s, slower than 3G. 30 s is three times that, and also
// covers a mobile signal dropping out briefly and the model being decoded after its last byte.
// There is no upper bound on total time: the room is a fixed 2.3 MB, so a link that keeps
// delivering bytes does finish, and cutting it off would only punish slow visitors.
export const STALL_LIMIT_MS = 30_000;

export function App({ load = loadRoom }: { load?: typeof loadRoom }) {
  const [capability] = useState(() => checkCapability(browserWebGL));
  const [failed, setFailed] = useState<FailureReason | null>(null);
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const gap = useGap();
  const where = useRef<Where>({ kind: "at", stop: 0 });
  const [reduced] = useState(() => capability.ok && prefersReducedMotion());
  const [meter] = useState(meterLink);
  const [shift] = useState(() => createShift(reduced));
  const [booted, setBooted] = useState(false); // the boot screen has faded out

  // Boot screen to meter is one moment: once the room is ready the boot screen fades out over
  // the room as the desk meter starts to power on, then it is removed.
  useEffect(() => {
    if (!sceneReady) return;
    meter.on = true;
    meter.redraw?.();
    const id = setTimeout(() => setBooted(true), reduced ? 0 : BOOT_FADE_MS);
    return () => clearTimeout(id);
  }, [sceneReady, meter, reduced]);

  const stall = useRef<ReturnType<typeof watchForStall>>(undefined);
  useEffect(() => {
    if (!capability.ok || sceneReady || failed) return; // once the load has failed, the reason stands
    const watch = watchForStall(STALL_LIMIT_MS, () => setFailed("load-timed-out"));
    stall.current = watch;
    return () => { watch.stop(); stall.current = undefined; };
  }, [capability, sceneReady, failed]);
  const onLoadProgress = useCallback(() => stall.current?.progress(), []);

  useEffect(() => {
    if (!capability.ok) return;
    load().then(() => { setCodeLoaded(true); onLoadProgress(); }, () => setFailed("scene-load-failed"));
  }, [capability, load, onLoadProgress]);

  if (!capability.ok) return <SignalLost reason={capability.reason} />;
  if (failed) return <SignalLost reason={failed} />;

  const steps = [
    { label: ui.stepCapability, done: true },
    { label: ui.stepCode, done: codeLoaded },
    { label: ui.stepScene, done: sceneReady },
  ];
  return (
    <>
      {!booted && <BootScreen steps={steps} fading={sceneReady} />}
      <SceneBoundary onFail={() => setFailed("scene-error")}>
        <Suspense fallback={null}>
          {codeLoaded && <Room onReady={() => setSceneReady(true)} onProgress={onLoadProgress} where={where} reduced={reduced} meter={meter} shift={shift} />}
        </Suspense>
      </SceneBoundary>
      {sceneReady && <Tour gap={gap} where={where} meter={meter} shift={shift} />}
    </>
  );
}
