import { test, expect } from "@playwright/test";
test("throwaway deliberate failure", async () => {
  expect(1, "deliberate failure for #66").toBe(2);
});
