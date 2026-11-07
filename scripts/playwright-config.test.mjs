import { describe, it, expect, afterEach, vi } from "vitest";

async function workers() {
  vi.resetModules();
  return (await import("../playwright.config.ts")).default.workers;
}

afterEach(() => vi.unstubAllEnvs());

describe("playwright.config workers", () => {
  it("runs one worker where TEST_PORT is set (the VM)", async () => {
    vi.stubEnv("TEST_PORT", "4293");
    expect(await workers()).toBe(1);
  });

  it("keeps Playwright's default without TEST_PORT", async () => {
    vi.stubEnv("TEST_PORT", "");
    expect(await workers()).toBeUndefined();
  });
});
