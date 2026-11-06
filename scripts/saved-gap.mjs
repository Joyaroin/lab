// The saved gap: the fallback the meter shows when the browser can't read the live value.
// The build writes today's value to the local file below, which git ignores (.gitignore lists
// it too), so a build never changes a tracked file. vite.config.ts and save-gap.mjs both use this.
export const LOCAL_GAP = new URL("../src/gap-saved.local.json", import.meta.url);

/** The newer of the local file's value and the committed one. Either local value may be missing. */
export function newestSaved(local, committed) {
  return local && local.savedAt > committed.savedAt ? local : committed;
}

/** What to write: today's reading if it was live, else the newest saved value. `now` is an ISO time. */
export function nextSaved(reading, best, now) {
  return reading.live ? { deploys: reading.deploys, savedAt: now } : best;
}
