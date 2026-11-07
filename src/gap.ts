import { fill, ui } from "./content";

// The gap: MediaSafe staging deploys since the last promotion to prod (ADR-0003).
// Commit history in, gap out. The browser reads it; a build-time value is the fallback.
export const GAP_URL =
  "https://api.github.com/repos/Joyaroin/morioh-cho-gitops/commits?per_page=100";

export type Commit = { commit: { message: string } };
export type SavedGap = { deploys: number; savedAt: string };
export type Gap = {
  deploys: number;
  live: boolean;
  /** false when the fetched window held no promotion, so the true gap may be larger */
  complete: boolean;
};

const subject = (c: Commit) => c.commit.message.split("\n")[0];

/** `commits` is newest first, as GitHub returns it. */
export function countGap(commits: Commit[]): { deploys: number; complete: boolean } {
  let deploys = 0;
  for (const c of commits) {
    const s = subject(c);
    if (s.startsWith("Promote MediaSafe")) return { deploys, complete: true };
    if (s.startsWith("Deploy MediaSafe") && s.endsWith("to staging")) deploys++;
  }
  return { deploys, complete: false };
}

export const GAP_TIMEOUT_MS = 5000;

export async function readGap(fetchFn: typeof fetch, saved: SavedGap, timeoutMs = GAP_TIMEOUT_MS): Promise<Gap> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(GAP_URL, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // includes 403/429 rate limits
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error("unexpected response");
    return { ...countGap(body as Commit[]), live: true };
  } catch {
    return { deploys: saved.deploys, live: false, complete: true };
  } finally {
    clearTimeout(timer);
  }
}

export const formatReading = (n: number) => (n / 1e6).toFixed(6);

export function gapLabel(g: Gap): string {
  const noun = g.deploys === 1 ? ui.deploy : ui.deploys;
  const base = fill(g.complete ? ui.gapBehind : ui.gapBehindAtLeast, { n: g.deploys, noun });
  return g.live ? base : fill(ui.gapSaved, { gap: base });
}
