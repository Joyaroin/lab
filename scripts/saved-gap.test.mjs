import { describe, expect, it } from "vitest";
import { newestSaved, nextSaved } from "./saved-gap.mjs";

const committed = { deploys: 9, savedAt: "2026-11-01T00:00:00Z" };
const newer = { deploys: 11, savedAt: "2026-11-05T22:04:25Z" };
const older = { deploys: 3, savedAt: "2026-10-01T00:00:00Z" };

describe("newestSaved", () => {
  it("uses the committed value when there is no local file", () => {
    expect(newestSaved(undefined, committed)).toBe(committed);
  });
  it("prefers a newer local value", () => {
    expect(newestSaved(newer, committed)).toBe(newer);
  });
  it("ignores a local value older than the committed one", () => {
    expect(newestSaved(older, committed)).toBe(committed);
  });
});

describe("nextSaved", () => {
  it("saves a live reading with the time it was read", () => {
    expect(nextSaved({ live: true, deploys: 4 }, newer, "2026-11-06T08:00:00Z")).toEqual({
      deploys: 4,
      savedAt: "2026-11-06T08:00:00Z",
    });
  });
  it("keeps the best saved value when the read was not live", () => {
    expect(nextSaved({ live: false, deploys: 4 }, newer, "2026-11-06T08:00:00Z")).toBe(newer);
  });
});
