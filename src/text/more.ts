/** The part of a panel the "more" cue reads and sets. A DOM element is one; tests use a plain object. */
export type MoreEl = { scrollHeight: number; clientHeight: number; scrollTop: number; dataset: Record<string, string | undefined> };

/** Marks a panel whose text runs on below its bottom edge, which shows the "more" cue. */
export function markMore(el: MoreEl) {
  const more = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
  if (el.dataset.more !== String(more)) el.dataset.more = String(more);
}
