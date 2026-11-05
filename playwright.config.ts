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
  // The room's three 4096 px textures take about 3.5 s to load on headless Chromium's software
  // WebGL, longer on a busy VM, and the meter and HUD only appear once the room is ready.
  expect: { timeout: 15_000 },
});
