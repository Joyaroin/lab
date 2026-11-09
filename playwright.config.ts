import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Agents share the Mac, so each gets its own port in $TEST_PORT. CI leaves it unset.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;

// With a GPU (CI on echoes), draw WebGL on it through Vulkan. Without one (the agents' Mac),
// launch Chromium as before.
const gpuArgs = existsSync("/dev/dri/renderD128")
  ? ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist", "--enable-gpu"]
  : [];

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
  use: { baseURL: origin, launchOptions: { args: gpuArgs } },
  // The meter and HUD only appear once the room is ready. CI draws on the GPU, where that is quick, but
  // the same specs run on the CPU on a Mac, which takes a few seconds, so the timeout stays generous.
  expect: { timeout: 15_000 },
});
