import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PerspectiveCamera } from "three";
import { CAMERA_FOV, crts } from "../crts";
import { holdSpan, progressFor } from "../hold";
import { createShift, WAIT_MS } from "../shift";
import { POWER_ON_SECONDS, SHIFT_SECONDS } from "../nixie";
import { framingFor } from "../framing";
import { markMore } from "./more";
import { placeText, scratch, textCovers, type PanelEl } from "./place";

// Fake timers also fake performance.now, so the real shift module runs on the test's clock.
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

/** A plain stand-in for the panel's DOM element: just what the text module reads and sets. */
function fakeEl(over: Partial<{ scrollHeight: number; clientHeight: number; scrollTop: number }> = {}) {
  return { style: { maxHeight: "" }, dataset: {}, scrollTop: 0, scrollHeight: 600, clientHeight: 300, ...over } as unknown as PanelEl & { style: Record<string, string> };
}

const mid = progressFor;
const FULL_MS = SHIFT_SECONDS.full * 1000 + 1000; // generous: the tear and the snap back

/** One shift, mounted and past its power-on, and a way to place station `i`'s text at `progress` as the room does. */
function setup(window = { width: 1280, height: 800 }) {
  const shift = createShift(false);
  shift.setWake(() => {});
  shift.mount({ startProgress: 0, navigationType: "navigate" });
  shift.powerOnBegan(performance.now());
  vi.advanceTimersByTime(POWER_ON_SECONDS * 1000 + 1);
  const cam = new PerspectiveCamera(CAMERA_FOV, window.width / window.height, 0.1, 1000);
  const sc = scratch();
  const el = fakeEl();
  /** The visitor moves to `p` (the camera follows at once) and the text for station `i` is placed once. */
  const place = (i: number, p: number, node = el) => {
    const t = framingFor(window).cameraAt(p);
    cam.position.set(...t.camera); cam.lookAt(...t.look); cam.updateMatrixWorld();
    placeText(node, crts[i - 1], i - 1, { camera: cam, size: window, progress: p, nowMs: performance.now(), shift, scratch: sc });
  };
  const observe = (p: number) => { shift.observe(p); place(1, p); };
  return { shift, el, place, observe };
}

describe("a station's text", () => {
  it("is held back at opacity 0, still in the page, from arrival until the shift ends", () => {
    const s = setup();
    s.observe(mid(1));
    expect(s.el.style.visibility).toBe("visible");
    expect(s.el.style.opacity).toBe("0");
    expect(s.el.dataset.gated).toBe("true");
    vi.advanceTimersByTime(WAIT_MS + 30); // the shift fires; the tear has not ended
    s.place(1, mid(1));
    expect(s.el.style.opacity).toBe("0");
    expect(s.el.dataset.gated).toBe("true");
  });
  it("resolves once on a first visit when held text comes out, then just shows", () => {
    const s = setup();
    s.observe(mid(1));
    vi.advanceTimersByTime(WAIT_MS + 30);
    vi.advanceTimersByTime(FULL_MS);
    s.place(1, mid(1));
    expect(s.el.dataset.gated).toBe("resolving");
    expect(Number(s.el.style.opacity)).toBe(1);
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(100); s.place(1, mid(1)); expect(s.el.dataset.gated).toBe("resolving"); } // set once, so the CSS animation plays once
    expect(Number(s.el.style.opacity)).toBe(1);
    s.observe(0); vi.advanceTimersByTime(100); s.place(1, 0); // leaving clears it for the next arrival
    expect(s.el.dataset.gated).toBeUndefined();
  });
  it("decides from what the module drew, not from `data-gated` on the element", () => {
    const s = setup();
    s.observe(mid(1));
    vi.advanceTimersByTime(WAIT_MS + 30 + FULL_MS);
    delete s.el.dataset.gated; // tampered between frames: held text still resolves when it comes out
    s.place(1, mid(1));
    expect(s.el.dataset.gated).toBe("resolving");
    s.el.dataset.gated = "true"; // tampered again: it stays resolving, not re-held
    vi.advanceTimersByTime(100); s.place(1, mid(1));
    expect(s.el.dataset.gated).toBe("true"); // not rewritten, but not read either
    s.observe(0); vi.advanceTimersByTime(100); s.place(1, 0);
    expect(s.el.dataset.gated).toBeUndefined();
  });
  it("just appears on a return: it never resolves", () => {
    const s = setup();
    s.observe(mid(1)); vi.advanceTimersByTime(WAIT_MS + 30 + FULL_MS); s.place(1, mid(1)); vi.advanceTimersByTime(1000); s.place(1, mid(1));
    s.observe(0); vi.advanceTimersByTime(100); s.place(1, 0);
    s.observe(mid(1));
    expect(s.el.dataset.gated).toBe("true");
    expect(s.el.style.opacity).toBe("0");
    const states = new Set<string | undefined>();
    for (let t = 0; t < WAIT_MS + 200; t += 10) { vi.advanceTimersByTime(10); s.place(1, mid(1)); states.add(s.el.dataset.gated); }
    expect(states.has("resolving")).toBe(false);
    expect(s.el.dataset.gated).toBeUndefined();
    expect(Number(s.el.style.opacity)).toBe(1);
  });
  it("is hidden away from its hold", () => {
    const s = setup();
    s.place(1, 0);
    expect(s.el.style.visibility).toBe("hidden");
    expect(textCovers(s.el)).toBe(false);
  });
});

describe("the wheel", () => {
  it("goes to the text only during the hold, once it is up", () => {
    const s = setup();
    const [h0, h1] = holdSpan(1);
    s.observe(mid(1));
    expect(s.el.style.pointerEvents).toBe("none"); // held back: nothing to scroll yet
    vi.advanceTimersByTime(WAIT_MS + 30 + FULL_MS + 2000);
    s.place(1, mid(1));
    expect(s.el.style.pointerEvents).toBe("auto");
    s.place(1, h0 + 1e-4);
    expect(s.el.style.pointerEvents).toBe("auto");
    s.shift.observe(h1 + 0.005); s.place(1, h1 + 0.005); // leaving: the text is still fading out, but the camera is moving
    expect(Number(s.el.style.opacity)).toBeGreaterThan(0.3);
    expect(s.el.style.pointerEvents).toBe("none");
    const early = setup(); // and before the hold, on the way in, it is not up yet
    early.shift.observe(h0 - 0.03); early.place(1, h0 - 0.03);
    expect(early.el.style.pointerEvents).toBe("none");
  });
});

describe("text on the glass", () => {
  it("is laid over the glass at a hold in a landscape window, with its own height", () => {
    const s = setup();
    s.place(1, mid(1));
    expect(s.el.dataset.glass).toBe("true");
    expect(s.el.style.maxHeight).toBe("none");
    expect(parseFloat(s.el.style.width)).toBeGreaterThan(100);
    expect(parseFloat(s.el.style.height)).toBeGreaterThan(50);
    expect(s.el.style.fontSize).toMatch(/px$/);
    expect(s.el.style.transform).toMatch(/^translate\(/);
  });
  it("is not on a portrait window: it is pinned with a height limit and no glass mark", () => {
    const s = setup({ width: 390, height: 844 });
    s.el.dataset.glass = "true"; // left over from a landscape frame
    s.place(1, mid(1));
    expect(s.el.dataset.glass).toBeUndefined();
    expect(s.el.style.height).toBe("");
    expect(s.el.style.maxHeight).toMatch(/px$/);
  });
  it("keeps the visitor's scroll position when it is pinned", () => {
    const s = setup({ width: 390, height: 844 });
    const el = fakeEl({ scrollTop: 40, scrollHeight: 2000 });
    s.place(1, mid(1), el);
    expect(el.scrollTop).toBe(40);
  });
});

describe("the more cue", () => {
  it("shows when the text runs on more than 4 px below the edge", () => {
    const el = fakeEl({ scrollHeight: 304, clientHeight: 300 });
    markMore(el);
    expect(el.dataset.more).toBe("false"); // 4 px is not enough
    el.scrollHeight = 305;
    markMore(el);
    expect(el.dataset.more).toBe("true");
    el.scrollTop = 1;
    markMore(el);
    expect(el.dataset.more).toBe("false");
  });
  it("is worked out on every placing", () => {
    const s = setup();
    const el = fakeEl({ scrollHeight: 900, clientHeight: 300 });
    s.place(1, mid(1), el);
    expect(el.dataset.more).toBe("true");
  });
});

describe("covering the meter", () => {
  it("counts a visible panel of opacity 0.3 or more, and not a fainter or hidden one", () => {
    expect(textCovers({ style: { visibility: "visible", opacity: "0.3" } })).toBe(true);
    expect(textCovers({ style: { visibility: "visible", opacity: "0.29" } })).toBe(false);
    expect(textCovers({ style: { visibility: "hidden", opacity: "1" } })).toBe(false);
  });
  it("does not count held-back text, which is at opacity 0", () => {
    const s = setup();
    s.observe(mid(1));
    expect(textCovers(s.el)).toBe(false);
  });
});
