export type Saved = { deploys: number; savedAt: string };
export const LOCAL_GAP: URL;
export function newestSaved(local: Saved | undefined, committed: Saved): Saved;
export function nextSaved(reading: { live: boolean; deploys: number }, best: Saved, now: string): Saved;
