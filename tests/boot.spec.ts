import { test, expect } from "@playwright/test";

test("boot screen shows name and title without waiting for large assets", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Adham Sedik" })).toBeVisible();
  await expect(page.getByText("SWE & Platform")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toContainText("[ ok ]");
  await page.screenshot({ path: "test-results/boot.png" });
});

const commits = (...subjects: string[]) => subjects.map((message) => ({ commit: { message } }));
const deploys = (n: number) => Array.from({ length: n }, (_, i) => `Deploy MediaSafe ${i} to staging`);

test("meter shows the live gap with a plain label", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) =>
    r.fulfill({ json: commits(...deploys(9), "Promote MediaSafe abc to prod") }),
  );
  await page.goto("/");
  await expect(page.getByText("prod is 9 deploys behind staging", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Reading 0.000009" })).toBeVisible();
  await page.screenshot({ path: "test-results/meter-live.png" });
});

test("meter shows the saved value and says so when the call fails", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 403, json: {} }));
  await page.goto("/");
  await expect(page.getByText(/saved value, not live/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Reading 0\.\d{6}$/ })).toBeVisible();
  await page.screenshot({ path: "test-results/meter-saved.png" });
});
