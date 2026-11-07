import { test, expect } from "@playwright/test";
import { waitUntilStill } from "./lib/page";

// waitUntilStill must wait for things that settle slowly, and must still fail for things that never settle.

test("waits through a slow settle and returns where it stopped", async () => {
  let n = 0;
  const got = await waitUntilStill(async () => Math.min(n++, 6), 50);
  expect(got).toBe(6);
});

test("fails, at its timeout, when the value never stops changing", { tag: "@timing" }, async () => {
  let n = 0;
  const t0 = Date.now();
  await expect(waitUntilStill(async () => n++, 50, 1_000)).rejects.toThrow();
  expect(Date.now() - t0).toBeGreaterThan(900);
});

test("a test left at the default 30 s limit fails with the last values read, not a plain timeout", { tag: "@timing" }, async () => {
  test.setTimeout(8_000); // stands in for the 30 s default: shorter than STILL_LIMIT_MS
  let n = 0;
  const t0 = Date.now();
  const err = await waitUntilStill(async () => ({ n: n++ }), 50).then(() => null, (e: Error) => e);
  expect(err, "it failed").not.toBeNull();
  expect(Date.now() - t0, "before the test's own timeout").toBeLessThan(8_000);
  const plain = err!.message.replace(/\u001b\[\d+m/g, ""); // Playwright colours the diff
  expect(plain).toMatch(/still moving, last read \{.*n.*:\d+\}/);
});
