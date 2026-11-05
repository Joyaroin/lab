import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchForStall } from "./stall";

describe("watchForStall", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up when nothing makes progress for the limit", () => {
    const onStall = vi.fn();
    watchForStall(1000, onStall);
    vi.advanceTimersByTime(999);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStall).toHaveBeenCalledOnce();
  });

  it("keeps waiting while progress keeps arriving, however long the total", () => {
    const onStall = vi.fn();
    const watch = watchForStall(1000, onStall);
    for (let i = 0; i < 500; i++) { vi.advanceTimersByTime(900); watch.progress(); }
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onStall).toHaveBeenCalledOnce();
  });

  it("never gives up after it is stopped", () => {
    const onStall = vi.fn();
    const watch = watchForStall(1000, onStall);
    watch.stop();
    vi.advanceTimersByTime(5000);
    watch.progress();
    vi.advanceTimersByTime(5000);
    expect(onStall).not.toHaveBeenCalled();
  });
});
