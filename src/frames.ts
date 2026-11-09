/** A frame loop with a clock and a frame scheduler you can swap, so timing is testable without a browser. */
export type FrameOptions = {
  now?: () => number;
  request?: (cb: () => void) => number;
  cancel?: (id: number) => void;
  /** Gets the clock reading the loop counts from, before the first step. */
  onStart?: (startMs: number) => void;
};

/** Runs `step` with the seconds since the loop started, until it returns true (done). The first step
 *  runs at once, with 0 s, before any frame is requested; each later one on a requested frame.
 *  Returns a stop function: it cancels the requested frame, and no step runs after it. */
export function runFrames(step: (seconds: number) => boolean, opts: FrameOptions = {}): () => void {
  const now = opts.now ?? (() => performance.now());
  const request = opts.request ?? ((cb) => requestAnimationFrame(cb));
  const cancel = opts.cancel ?? ((id) => cancelAnimationFrame(id));
  const start = now();
  opts.onStart?.(start);
  let id = 0, stopped = false;
  const tick = () => {
    if (stopped || step((now() - start) / 1000)) return;
    id = request(tick);
  };
  tick();
  return () => { stopped = true; cancel(id); };
}
