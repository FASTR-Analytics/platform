// Pure DOM-coordinate helpers for editor↔preview scroll sync. Decoupled from
// Solid/CM so they're unit-testable with a fake container. The source line is the
// canonical coordinate; preview pixel positions are derived live from the DOM.

export type PreviewAnchor = { line: number; top: number };

// Every [data-line] anchor in the preview as { line, top }, where top is the
// element's offset within the scroll container's content (i.e. scrollTop space).
// Sorted by top; non-finite data-line values are filtered out.
export function previewAnchors(container: HTMLElement): PreviewAnchor[] {
  const containerTop = container.getBoundingClientRect().top;
  const scrollTop = container.scrollTop;
  const anchors: PreviewAnchor[] = [];
  for (const el of container.querySelectorAll<HTMLElement>("[data-line]")) {
    const line = Number(el.dataset.line);
    if (!Number.isFinite(line)) continue;
    const top = el.getBoundingClientRect().top - containerTop + scrollTop;
    anchors.push({ line, top });
  }
  anchors.sort((a, b) => a.top - b.top);
  return anchors;
}

// scrollTop that puts a fractional source line at the container's top, linearly
// interpolating between the bracketing anchors. Guards: 0 anchors → 0; 1 anchor
// or out of range → clamp to the nearest anchor.
export function lineToPreviewTop(container: HTMLElement, line: number): number {
  const anchors = previewAnchors(container);
  if (anchors.length === 0) return 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  // At/above the first anchor → the very top (scrollTop 0), so the lead padding
  // (py-10) above the first block shows and both panes sit at the top together,
  // rather than clamping to the first block ~40px down.
  if (line <= first.line) return 0;
  if (line >= last.line) return last.top;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (line >= a.line && line <= b.line) {
      const span = b.line - a.line;
      const frac = span > 0 ? (line - a.line) / span : 0;
      return a.top + frac * (b.top - a.top);
    }
  }
  return last.top;
}

// Inverse: the fractional source line currently at the container's top. Same
// guards as lineToPreviewTop.
export function previewTopToLine(container: HTMLElement): number {
  const anchors = previewAnchors(container);
  if (anchors.length === 0) return 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const top = container.scrollTop;
  if (anchors.length === 1 || top <= first.top) return first.line;
  if (top >= last.top) return last.line;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (top >= a.top && top <= b.top) {
      const span = b.top - a.top;
      const frac = span > 0 ? (top - a.top) / span : 0;
      return a.line + frac * (b.line - a.line);
    }
  }
  return last.line;
}
