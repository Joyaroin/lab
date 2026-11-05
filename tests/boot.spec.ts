import { test, expect } from "@playwright/test";

test("boot screen shows name and title without waiting for large assets", async ({ page }) => {
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Adham Sedik" })).toBeVisible();
  await expect(page.getByText("Platform engineering co-op")).toBeVisible();
  await expect(page.getByLabel("Boot log")).toContainText("[ ok ]");
  await page.screenshot({ path: "test-results/boot.png" });
});
