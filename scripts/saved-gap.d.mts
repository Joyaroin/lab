export const LOCAL_GAP: URL;
export function newestSaved<T extends { savedAt: string }>(local: T | undefined, committed: T): T;
export function nextSaved<T extends { deploys: number; savedAt: string }>(reading: { live: boolean; deploys: number }, best: T, now: string): T | { deploys: number; savedAt: string };
