// Pure DOM-coordinate helpers for editor↔preview scroll sync. Decoupled from
// Solid/CM so they're unit-testable with a fake surface. The source line is the
// canonical coordinate; preview pixel positions are derived live from the DOM.
//
// The preview is abstracted as a PreviewSurface so the same maths drives both
// the markdown pane (a scrolling div — divSurface) and the HTML pane (a
// sandboxed iframe whose DOCUMENT scrolls — iframeSurface).

export type PreviewAnchor = { line: number; top: number };

export type PreviewSurfaceEvent = "scroll" | "wheel" | "pointerdown";

export type PreviewSurface = {
  scrollTop: () => number;
  setScrollTop: (top: number) => void;
  clientHeight: () => number;
  scrollHeight: () => number;
  // Every [data-line] anchor as { line, top } in scrollTop space, sorted by top.
  anchors: () => PreviewAnchor[];
  // The rendered embed's rect in PARENT-VIEWPORT coordinates (an iframe adds
  // its own rect), or undefined when not rendered.
  findEmbedRect: (id: string) => DOMRect | undefined;
  // Subscribe to a surface event; returns the unsubscribe.
  on: (type: PreviewSurfaceEvent, cb: () => void) => () => void;
  // Observe content-height changes (figure-settle); returns the disconnect.
  observeContent: (cb: () => void) => () => void;
};

// Anchors of an element tree relative to a scroll container.
function collectAnchors(
  root: ParentNode,
  containerTop: number,
  scrollTop: number,
): PreviewAnchor[] {
  const anchors: PreviewAnchor[] = [];
  for (const el of root.querySelectorAll<HTMLElement>("[data-line]")) {
    const line = Number(el.dataset.line);
    if (!Number.isFinite(line)) continue;
    const top = el.getBoundingClientRect().top - containerTop + scrollTop;
    anchors.push({ line, top });
  }
  anchors.sort((a, b) => a.top - b.top);
  return anchors;
}

// The markdown preview: `el` scrolls, `contentEl` is the centered content card
// (observed for figure-settle). Behaviour is unchanged from the pre-surface code.
export function divSurface(
  el: HTMLElement,
  contentEl: HTMLElement | undefined,
): PreviewSurface {
  return {
    scrollTop: () => el.scrollTop,
    setScrollTop: (top) => {
      el.scrollTop = top;
    },
    clientHeight: () => el.clientHeight,
    scrollHeight: () => el.scrollHeight,
    anchors: () =>
      collectAnchors(el, el.getBoundingClientRect().top, el.scrollTop),
    findEmbedRect: (id) => {
      const target = el.querySelector(`[data-embed-id="${id}"]`);
      if (!target) return undefined;
      const r = target.getBoundingClientRect();
      return r.width === 0 || r.height === 0 ? undefined : r;
    },
    on: (type, cb) => {
      el.addEventListener(type, cb, { passive: true });
      return () => el.removeEventListener(type, cb);
    },
    observeContent: (cb) => {
      const ro = new ResizeObserver(() => cb());
      if (contentEl) ro.observe(contentEl);
      return () => ro.disconnect();
    },
  };
}

// The HTML preview: a same-origin srcdoc iframe whose document scrolls. The
// iframe must be loaded (contentDocument/contentWindow present).
export function iframeSurface(iframe: HTMLIFrameElement): PreviewSurface {
  const win = iframe.contentWindow!;
  const doc = iframe.contentDocument!;
  const root = () => doc.documentElement;
  return {
    scrollTop: () => win.scrollY,
    setScrollTop: (top) => win.scrollTo(0, top),
    clientHeight: () => root().clientHeight,
    scrollHeight: () => root().scrollHeight,
    anchors: () => collectAnchors(doc, 0, win.scrollY),
    findEmbedRect: (id) => {
      const target = doc.querySelector(`[data-embed-id="${id}"]`);
      if (!target) return undefined;
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return undefined;
      const f = iframe.getBoundingClientRect();
      return new DOMRect(f.left + r.left, f.top + r.top, r.width, r.height);
    },
    on: (type, cb) => {
      const target: EventTarget = type === "scroll" ? win : doc;
      target.addEventListener(type, cb, { passive: true });
      return () => target.removeEventListener(type, cb);
    },
    observeContent: (cb) => {
      // Created from the frame's own realm — cross-document observation isn't
      // guaranteed.
      const RO =
        (win as unknown as { ResizeObserver?: typeof ResizeObserver })
          .ResizeObserver ?? ResizeObserver;
      const ro = new RO(() => cb());
      if (doc.body) ro.observe(doc.body);
      return () => ro.disconnect();
    },
  };
}

// scrollTop that puts a fractional source line at the surface's top, linearly
// interpolating between the bracketing anchors. Guards: 0 anchors → 0; 1 anchor
// or out of range → clamp to the nearest anchor.
export function lineToPreviewTop(
  surface: PreviewSurface,
  line: number,
): number {
  const anchors = surface.anchors();
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

// Inverse: the fractional source line currently at the surface's top. Same
// guards as lineToPreviewTop.
export function previewTopToLine(surface: PreviewSurface): number {
  const anchors = surface.anchors();
  if (anchors.length === 0) return 0;
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  const top = surface.scrollTop();
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

// Scrollable AND at the end (a non-scrollable surface isn't "at bottom").
export function isSurfaceAtBottom(surface: PreviewSurface): boolean {
  const sh = surface.scrollHeight();
  const ch = surface.clientHeight();
  return sh > ch + 1 && surface.scrollTop() + ch >= sh - 2;
}

export function scrollSurfaceToBottom(surface: PreviewSurface): void {
  surface.setScrollTop(surface.scrollHeight() - surface.clientHeight());
}
