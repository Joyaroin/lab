import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BootScreen } from "./BootScreen";
import { SignalLost } from "./SignalLost";
import { browserWebGL, checkCapability } from "./capability";
import { Tour, prefersReducedMotion } from "./Tour";
import { useGap } from "./useGap";
import { meterLink } from "./nixie";
import { Component, type ReactNode } from "react";

const loadRoom = () => import("./Room");
const Room = lazy(loadRoom);

class SceneBoundary extends Component<{ onFail: (e: unknown) => void; children: ReactNode }> {
  componentDidCatch(e: unknown) { this.props.onFail(e); }
  static getDerivedStateFromError() { return {}; }
  render() { return this.props.children; }
}

const BOOT_FADE_MS = 700;

export function App({ load = loadRoom }: { load?: typeof loadRoom }) {
  const [capability] = useState(() => checkCapability(browserWebGL));
  const [failed, setFailed] = useState<string | null>(null);
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const gap = useGap();
  const progress = useRef(0);
  const [reduced] = useState(() => capability.ok && prefersReducedMotion());
  const [meter] = useState(meterLink);
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

  useEffect(() => {
    if (!capability.ok) return;
    load().then(() => setCodeLoaded(true), () => setFailed("scene-load-failed"));
  }, [capability, load]);

  if (!capability.ok) return <SignalLost reason={capability.reason} />;
  if (failed) return <SignalLost reason={failed} />;

  const steps = [
    { label: "capability check", done: true },
    { label: "room code", done: codeLoaded },
    { label: "room scene", done: sceneReady },
  ];
  return (
    <>
      {!booted && <BootScreen steps={steps} fading={sceneReady} />}
      <SceneBoundary onFail={() => setFailed("scene-error")}>
        <Suspense fallback={null}>
          {codeLoaded && <Room onReady={() => setSceneReady(true)} progress={progress} reduced={reduced} meter={meter} />}
        </Suspense>
      </SceneBoundary>
      {sceneReady && <Tour gap={gap} progress={progress} meter={meter} />}
    </>
  );
}
