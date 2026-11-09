import type { Visit } from "./visit";
import { hashForStop, stopForHash } from "./route";

/** The parts of `window` the history link uses, so a test can stand in for them. */
export type HistoryHost = {
  history: Pick<History, "pushState" | "replaceState">;
  location: Pick<Location, "hash">;
  addEventListener(type: "popstate", l: () => void): void;
  removeEventListener(type: "popstate", l: () => void): void;
};

const OVERVIEW_URL = "./";

/** Joins the visit to the browser's history. Every move that did not come from history pushes one entry (so
 *  HUD links, TV clicks, the meter and Esc all get one); popstate moves the visit to the entry's stop, marked
 *  fromHistory so it pushes nothing.
 *
 *  Opening a link directly (`/#work`) lands on its station with no flight, and puts an overview entry under
 *  it (replace with ./, then push the hash) so Back goes to the overview. Call this before the tour mounts,
 *  so the shift starts from where the visit already is. Returns the unlink. */
export function linkHistory(visit: Visit, host: HistoryHost): () => void {
  const start = stopForHash(host.location.hash);
  if (start >= 1) {
    host.history.replaceState(null, "", OVERVIEW_URL);
    host.history.pushState(null, "", hashForStop(start));
    visit.land(start, { fromHistory: true });
  }
  const off = visit.subscribe((e) => {
    if (e.type === "move" && !e.fromHistory) host.history.pushState(null, "", hashForStop(e.to) || OVERVIEW_URL);
  });
  const onPop = () => visit.go(stopForHash(host.location.hash), { fromHistory: true });
  host.addEventListener("popstate", onPop);
  return () => { off(); host.removeEventListener("popstate", onPop); };
}
