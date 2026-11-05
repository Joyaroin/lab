import { describe, it, expect } from "vitest";
import { checkCapability } from "./capability";

describe("checkCapability", () => {
  it("sends the visitor to signal lost when WebGL is missing", () => {
    expect(checkCapability(() => null)).toEqual({ ok: false, reason: "no-webgl" });
  });
  it("sends the visitor to signal lost when creating the context throws", () => {
    const r = checkCapability(() => {
      throw new Error("blocked");
    });
    expect(r).toEqual({ ok: false, reason: "context-failed" });
  });
  it("starts the room when a context is available", () => {
    expect(checkCapability(() => ({}))).toEqual({ ok: true });
  });
});
