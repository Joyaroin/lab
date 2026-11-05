import { useEffect, useState } from "react";
import { readGap, type Gap, type SavedGap } from "./gap";
import savedJson from "./gap-saved.json";

const saved: SavedGap = savedJson;

/** The gap, or null while the live call is still in flight. The saved value is only
 *  returned (with live: false) once the live call has actually failed. */
export function useGap(): Gap | null {
  const [gap, setGap] = useState<Gap | null>(null);
  useEffect(() => {
    let cancelled = false;
    readGap(fetch, saved).then((g) => !cancelled && setGap(g));
    return () => { cancelled = true; };
  }, []);
  return gap;
}

/** Number to show on the meter while the live call is pending. */
export const pendingDeploys = saved.deploys;
