import { stations } from "../content";

/** The stop a URL hash names: `#<station id>` is that station (1..), anything else is the overview (0). */
export function stopForHash(hash: string): number {
  const i = stations.findIndex((s) => `#${s.id}` === hash);
  return i + 1;
}

/** The hash for a stop: `#<station id>`, or "" for the overview. */
export function hashForStop(stop: number): string {
  return stop >= 1 && stop <= stations.length ? `#${stations[stop - 1].id}` : "";
}
