// Gives up on a load only when it has stopped moving. Each call to progress() restarts the
// clock, so a slow connection that keeps delivering bytes is never cut off, however long it takes.
export function watchForStall(limitMs: number, onStall: () => void) {
  let id: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const arm = () => {
    clearTimeout(id);
    if (!stopped) id = setTimeout(onStall, limitMs);
  };
  arm();
  return {
    progress: arm,
    stop() { stopped = true; clearTimeout(id); },
  };
}
