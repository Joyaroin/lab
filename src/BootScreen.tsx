import { useEffect, useState } from "react";
import { identity } from "./content";
import { readGap, gapLabel, type Gap, type SavedGap } from "./gap";
import savedJson from "./gap-saved.json";
import { Meter } from "./Meter";

const saved: SavedGap = savedJson;

export type Step = { label: string; done: boolean };

// Progress is the share of real load steps finished (capability check, room code, scene).
// The meter shows the saved value at once, then the live gap once it's read.
export function BootScreen({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length;
  const [gap, setGap] = useState<Gap>({ deploys: saved.deploys, live: false, complete: true });
  useEffect(() => {
    let cancelled = false;
    readGap(fetch, saved).then((g) => !cancelled && setGap(g));
    return () => { cancelled = true; };
  }, []);
  return (
    <main style={{ padding: "12vh 8vw" }}>
      <h1 style={{ margin: 0, fontSize: "clamp(2rem, 6vw, 4rem)" }}>{identity.name}</h1>
      <p style={{ margin: "0.5rem 0 2rem", fontSize: "clamp(1rem, 2.5vw, 1.5rem)" }}>{identity.title}</p>
      <Meter reading={gap.deploys} label={gapLabel(gap)} live={gap.live} />
      <progress aria-label="Load progress" max={steps.length} value={done} style={{ marginTop: "2rem" }} />
      <pre aria-label="Boot log" style={{ margin: "1rem 0 0", opacity: 0.8 }}>
        {steps.map((s) => `[ ${s.done ? "ok" : ".."} ] ${s.label}`).join("\n")}
      </pre>
    </main>
  );
}
