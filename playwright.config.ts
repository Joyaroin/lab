import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Agents share the VM, so each gets its own port in $TEST_PORT. CI leaves it unset.
const port = Number(process.env.TEST_PORT) || 4173;
const origin = `http://127.0.0.1:${port}`;

// With a GPU (CI on echoes), draw WebGL on it through Vulkan. Without one (the agents' VM, a Mac),
// launch Chromium as before.
const gpuArgs = existsSync("/dev/dri/renderD128")
  ? ["--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist", "--enable-gpu"]
  : [];

export default defineConfig({
  // On the VM (TEST_PORT set) one worker, so one session can't take the CPU from the other.
  // CI and the Mac keep Playwright's default.
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
  // The meter and HUD only appear once the room is ready, which takes a few seconds on CI's
  // software WebGL (about 1.5 s here, more with two workers on two CPUs).
  expect: { timeout: 15_000 },
});
