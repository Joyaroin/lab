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

test("a test left at the default 30 s limit fails with the last values read, not a plain timeout", async () => {
  test.setTimeout(8_000); // stands in for the 30 s default: shorter than STILL_LIMIT_MS
  let n = 0;
  const t0 = Date.now();
  const err = await waitUntilStill(async () => ({ n: n++ }), 50).then(() => null, (e: Error) => e);
  expect(err, "it failed").not.toBeNull();
  expect(Date.now() - t0, "before the test's own timeout").toBeLessThan(8_000);
  const plain = err!.message.replace(/\u001b\[\d+m/g, ""); // Playwright colours the diff
  expect(plain).toMatch(/still moving, last read \{.*n.*:\d+\}/);
});

test("time the test has already used counts: with less than the margin left the poll fails at once", async () => {
  test.setTimeout(5_000);
  await new Promise((r) => setTimeout(r, 3_500));
  let n = 0;
  const t0 = Date.now();
  const err = await waitUntilStill(async () => ({ n: n++ }), 50).then(() => null, (e: Error) => e);
  expect(err, "it failed").not.toBeNull();
  expect(Date.now() - t0, "at once: less than the margin was left").toBeLessThan(500);
  expect(err!.message.replace(/\u001b\[\d+m/g, "")).toMatch(/still moving, last read/);
});
