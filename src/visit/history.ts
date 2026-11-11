import type { Visit } from "./visit";
import { hashForStop, stopForHash, titleForStop } from "./route";

/** The parts of `window` the history link uses, so a test can stand in for them. */
export type HistoryHost = {
  history: Pick<History, "pushState" | "replaceState">;
  location: Pick<Location, "hash">;
  document: Pick<Document, "title">;
  addEventListener(type: "popstate", l: () => void): void;
  removeEventListener(type: "popstate", l: () => void): void;
};

const OVERVIEW_URL = "./";

/** Joins the visit to the browser's history. It tracks `shown`, the stop the URL shows, updated on every push,
 *  replace and popstate. Whenever the visitor goes or lands at a stop the URL does not show, it pushes that stop's
 *  entry: so a HUD link, TV click, meter or Esc gets one entry, a Back or Forward press (which already moved the
 *  URL) gets none, and a press that waited out a fade and was dropped, or that undid a Back, still ends with the
 *  URL on the visitor's stop.
 *
 *  Opening a link directly (`/#work`) lands on its station with no flight, and puts an overview entry under
 *  it (replace with ./, then push the hash) so Back goes to the overview.
 *
 *  The tab title follows the stop the URL shows (`titleForStop`), set after each history call, because a browser
 *  attaches the current title to the current entry: the replace keeps the page title, the push is then titled. Call this before the tour mounts,
 *  so the shift starts from where the visit already is. Returns the unlink. */
export function linkHistory(visit: Visit, host: HistoryHost): () => void {
  let shown = stopForHash(host.location.hash);
  const show = (stop: number) => {
    if (stop === shown) return;
    host.history.pushState(null, "", hashForStop(stop) || OVERVIEW_URL);
    host.document.title = titleForStop(stop);
    shown = stop;
  };
  if (shown >= 1) {
    const start = shown;
    host.history.replaceState(null, "", OVERVIEW_URL);
    host.history.pushState(null, "", hashForStop(start));
    host.document.title = titleForStop(start);
    visit.land(start);
  }
  const off = visit.subscribe((e) => {
    if (e.type === "move") show(e.to);
    // Landing with no press waiting (the target is here): the URL must show this stop.
    else if (visit.target() === e.stop) show(e.stop);
  });
  const onPop = () => {
    shown = stopForHash(host.location.hash);
    host.document.title = titleForStop(shown);
    visit.go(shown);
  };
  host.addEventListener("popstate", onPop);
  return () => { off(); host.removeEventListener("popstate", onPop); };
}
