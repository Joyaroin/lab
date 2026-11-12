import { describe, it, expect, afterEach, vi } from "vitest";

async function config(file = "../playwright.config.ts") {
  vi.resetModules();
  return (await import(file)).default;
}
const workers = async () => (await config()).workers;

afterEach(() => vi.unstubAllEnvs());

describe("playwright.config workers", () => {
  it("runs one worker where TEST_PORT is set (an agent session on the Mac)", async () => {
    vi.stubEnv("TEST_PORT", "4293");
    expect(await workers()).toBe(1);
  });

  it("runs 3 workers in CI, so up to 3 jobs drawing WebGL on the runner's CPUs don't overload it", async () => {
    vi.stubEnv("TEST_PORT", "");
    vi.stubEnv("CI", "true");
    expect(await workers()).toBe(3);
  });

  it("keeps Playwright's default on a Mac without TEST_PORT", async () => {
    vi.stubEnv("TEST_PORT", "");
    vi.stubEnv("CI", "");
    expect(await workers()).toBeUndefined();
  });
});

describe("playwright configs' renderer", () => {
  for (const file of ["../playwright.config.ts", "../playwright.screenshots.config.ts"]) {
    it(`${file}: draws on llvmpipe through the full Chromium where LAB_WEBGL=llvmpipe (CI)`, async () => {
      vi.stubEnv("LAB_WEBGL", "llvmpipe");
      const { use } = await config(file);
      expect(use.channel).toBe("chromium");
      expect(use.launchOptions.args).toContain("--use-angle=gl");
    });

    it(`${file}: keeps Playwright's default browser elsewhere`, async () => {
      vi.stubEnv("LAB_WEBGL", "");
      const { use } = await config(file);
      expect(use.channel).toBeUndefined();
      expect(use.launchOptions).toBeUndefined();
    });
  }
});
