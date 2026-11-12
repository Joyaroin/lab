import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Agents share the Mac, so each gets its own port in $TEST_PORT. CI leaves it unset.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  // Where TEST_PORT is set (agent sessions on the Mac) one worker, so one session can't take the CPU from the others.
  // CI, and a Mac without TEST_PORT, keep Playwright's default.
  workers: process.env.TEST_PORT ? 1 : undefined,
  testDir: "tests",
  testMatch: "*.spec.ts",
  webServer: {
    command: `npm run build && npm run preview -- --port ${port}`,
    // The repo root, so the tests run the same from any working directory.
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    url: origin,
    reuseExistingServer: false,
  },
  use: { baseURL: origin },
  // The meter and HUD only appear once the room is ready. WebGL draws on the CPU, in CI and on the
  // Mac, which takes a few seconds, so the timeout stays generous.
  expect: { timeout: 15_000 },
});
