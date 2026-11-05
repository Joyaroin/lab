// Decides whether the room can start. `getContext` is injected so the check is testable;
// the browser version is `browserWebGL`.
export type Capability = { ok: true } | { ok: false; reason: "no-webgl" | "context-failed" };

export function checkCapability(getContext: () => unknown): Capability {
  try {
    return getContext() ? { ok: true } : { ok: false, reason: "no-webgl" };
  } catch {
    return { ok: false, reason: "context-failed" };
  }
}

export const browserWebGL = () => {
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2") ?? canvas.getContext("webgl");
};
