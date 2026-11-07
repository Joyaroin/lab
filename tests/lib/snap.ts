// The tear's visible snap back: the displacement map's scale reaching 0 (TearView sets it every frame, and the
// bands slip by that much). The filter stays on, drawing nothing, until the tear's length ends, so "the filter
// came off" is later than what the eye sees (#124). Every flash-limit spec counts this instead.
// Install the page side with `page.addInitScript(defineSnapWatcher)` before the page loads, or `page.evaluate(defineSnapWatcher)` on a page already up.
declare global { interface Window { __watchSnap: (filterId: string, onSnap: () => void) => boolean } }

/** Runs in the page, so it uses nothing from outside. `window.__watchSnap(filterId, onSnap)` calls `onSnap` each
 *  time that filter's displacement scale goes from above 0 to 0, and returns false if the filter isn't in the page yet. */
export function defineSnapWatcher() {
  window.__watchSnap = (filterId, onSnap) => {
    const disp = document.querySelector(`filter#${filterId} feDisplacementMap`);
    if (!disp) return false;
    const visible = () => parseFloat(disp.getAttribute("scale") ?? "0") > 0;
    let was = visible();
    new MutationObserver(() => {
      const now = visible();
      if (was && !now) onSnap();
      was = now;
    }).observe(disp, { attributes: true, attributeFilter: ["scale"] });
    return true;
  };
}
