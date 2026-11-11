import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { hasPhoneNumber } from "./content";

// make resume builds public/resume.pdf from resume/resume.tex. The source is published with the repo,
// so it must never hold a phone number.
describe("the résumé", () => {
  it("has its built PDF committed", () => {
    expect(existsSync("public/resume.pdf")).toBe(true);
  });
  it("has a source in resume/ with no phone number", () => {
    const tex = readFileSync("resume/resume.tex", "utf8");
    expect(tex.length).toBeGreaterThan(0);
    expect(hasPhoneNumber(tex)).toBe(false);
  });
  it("is caught by the phone rule when the source holds one", () => {
    expect(hasPhoneNumber("\\small +1 (613) 555-0142 $|$")).toBe(true);
  });
});
