import { test, expect } from "@playwright/test";
import { waitUntilStill } from "./lib/page";

// waitUntilStill must wait for things that settle slowly, and must still fail for things that never settle.

test("waits through a slow settle and returns where it stopped", async () => {
  let n = 0;
  const got = await waitUntilStill(async () => Math.min(n++, 6), 50);
  expect(got).toBe(6);
});

test("fails, at its timeout, when the value never stops changing", async () => {
  let n = 0;
  const t0 = Date.now();
  await expect(waitUntilStill(async () => n++, 50, 1_000)).rejects.toThrow();
  expect(Date.now() - t0).toBeGreaterThan(900);
});
