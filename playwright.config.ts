import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  use: { baseURL: "http://127.0.0.1:4173" },
  // The meter and HUD only appear once the room is ready, which takes a few seconds on CI's
  // software WebGL (about 1.5 s here, more with two workers on two CPUs).
  expect: { timeout: 15_000 },
});
