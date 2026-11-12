import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// The screenshots job's config: the same server and browser as playwright.config.ts, but it runs
// only shots/, so the browser job never takes screenshots and this job never runs the browser specs.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "shots",
  testMatch: "*.spec.ts",
  workers: 1,
  retries: 0, // a screenshot that can't be taken fails the job
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: origin,
    reuseExistingServer: false,
  },
  use: { baseURL: origin },
  expect: { timeout: 15_000 },
});
