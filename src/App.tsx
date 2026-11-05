import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { BootScreen } from "./BootScreen";
import { SignalLost } from "./SignalLost";
import { browserWebGL, checkCapability } from "./capability";
import { Tour, prefersReducedMotion } from "./Tour";
import { useGap } from "./useGap";
import { Component, type ReactNode } from "react";

const loadRoom = () => import("./Room");
const Room = lazy(loadRoom);

class SceneBoundary extends Component<{ onFail: (e: unknown) => void; children: ReactNode }> {
  componentDidCatch(e: unknown) { this.props.onFail(e); }
  static getDerivedStateFromError() { return {}; }
  render() { return this.props.children; }
}

export function App({ load = loadRoom }: { load?: typeof loadRoom }) {
  const [capability] = useState(() => checkCapability(browserWebGL));
  const [failed, setFailed] = useState<string | null>(null);
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const gap = useGap();
  const progress = useRef(0);
  const [reduced] = useState(() => capability.ok && prefersReducedMotion());

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
      {!sceneReady && <BootScreen steps={steps} />}
      <SceneBoundary onFail={() => setFailed("scene-error")}>
        <Suspense fallback={null}>
          {codeLoaded && <Room onReady={() => setSceneReady(true)} progress={progress} reduced={reduced} />}
        </Suspense>
      </SceneBoundary>
      {sceneReady && <Tour gap={gap} progress={progress} />}
    </>
  );
}
