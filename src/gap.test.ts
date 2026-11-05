import { describe, it, expect, vi } from "vitest";
import { countGap, readGap, formatReading, gapLabel } from "./gap";

const c = (message: string) => ({ commit: { message } });
const saved = { deploys: 4, savedAt: "2026-11-01T00:00:00Z" };
const ok = (body: unknown): typeof fetch => async () =>
  new Response(JSON.stringify(body), { status: 200 });

describe("countGap", () => {
  it("counts staging deploys newer than the latest promotion", () => {
    const history = [
      c("Deploy MediaSafe abc to staging"),
      c("Update docs"),
      c("Deploy MediaSafe def to staging"),
      c("Promote MediaSafe 123 to prod"),
      c("Deploy MediaSafe old to staging"),
    ];
    expect(countGap(history)).toEqual({ deploys: 2, complete: true });
  });
  it("is zero when nothing was deployed since promotion", () => {
    expect(countGap([c("Promote MediaSafe 1 to prod"), c("Deploy MediaSafe 0 to staging")])).toEqual({
      deploys: 0,
      complete: true,
    });
  });
  it("ignores other apps and prod deploys", () => {
    const h = [c("Deploy Other x to staging"), c("Deploy MediaSafe x to prod"), c("Promote MediaSafe 1")];
    expect(countGap(h).deploys).toBe(0);
  });
  it("marks the count incomplete when the window has no promotion", () => {
    expect(countGap([c("Deploy MediaSafe a to staging"), c("Deploy MediaSafe b to staging")])).toEqual({
      deploys: 2,
      complete: false,
    });
  });
});

describe("readGap", () => {
  it("returns a live reading", async () => {
    const r = await readGap(ok([c("Deploy MediaSafe a to staging"), c("Promote MediaSafe 1")]), saved);
    expect(r).toEqual({ deploys: 1, live: true, complete: true });
  });
  it("uses the saved value when the call fails", async () => {
    const r = await readGap(async () => { throw new TypeError("offline"); }, saved);
    expect(r).toEqual({ deploys: 4, live: false, complete: true });
  });
  it("uses the saved value when rate limited", async () => {
    for (const status of [403, 429]) {
      const r = await readGap(async () => new Response("{}", { status }), saved);
      expect(r.live).toBe(false);
      expect(r.deploys).toBe(4);
    }
  });
  it("uses the saved value when the body is not a commit list", async () => {
    expect((await readGap(ok({ message: "nope" }), saved)).live).toBe(false);
  });
});

describe("display", () => {
  it("formats six decimals", () => {
    expect(formatReading(9)).toBe("0.000009");
    expect(formatReading(0)).toBe("0.000000");
  });
  it("labels plainly and says when not live", () => {
    expect(gapLabel({ deploys: 9, live: true, complete: true })).toBe("prod is 9 deploys behind staging");
    expect(gapLabel({ deploys: 1, live: true, complete: true })).toBe("prod is 1 deploy behind staging");
    expect(gapLabel({ deploys: 9, live: false, complete: true })).toBe(
      "prod is 9 deploys behind staging (saved value, not live)",
    );
    expect(gapLabel({ deploys: 100, live: true, complete: false })).toBe(
      "prod is at least 100 deploys behind staging",
    );
  });
});

describe("readGap timeout", () => {
  it("falls back to the saved value when the call hangs", async () => {
    vi.useFakeTimers();
    const hung: typeof fetch = (_url, init) =>
      new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    const pending = readGap(hung, saved, 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ deploys: 4, live: false, complete: true });
    vi.useRealTimers();
  });
});
