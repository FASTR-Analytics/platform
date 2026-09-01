import {
  type FigureBlock,
  type ImageBlock,
  readFastrDocumentSettings,
  type ReportFormat,
} from "lib";
import { createEffect, on, onCleanup } from "solid-js";
import {
  buildReportBodyNodes,
  FASTR_THEME_STYLE_ATTR,
  interceptReportLinks,
  isDarkGroundBehind,
  renderReportBodyHtml,
  wrapReportDocument,
} from "./report_html";
import {
  type FigureInkTheme,
  type FigureRasterCache,
  GENERIC_LIGHT_INK,
} from "./report_figure_raster";
import { iframeSurface, type PreviewSurface } from "./scroll_sync";

// The rendered HTML report: a `sandbox="allow-same-origin"` srcdoc iframe
// (scripts browser-blocked; the report's own <style>/@page/vh work natively and
// stay scoped to the frame; blob: rasters and asset URLs load because the frame
// keeps the parent origin). The body is re-rendered in place — sanitize →
// materialize embeds → replaceChildren — debounced for typing, immediately for
// registry/raster changes.
//
// Lifecycle contract with the host: `onSurface(surface)` fires once the frame
// has loaded AND its first render has landed (the host aligns scroll there —
// the srcdoc document loads asynchronously, so a next-frame alignment would
// find no anchors); `onReady()` fires after every render (the host arms
// figure-settle). Pointer events are re-dispatched on the iframe element in the
// parent document (offset by the frame rect) so live cursors and the pane's
// click-to-deselect keep working over the frame.

type Props = {
  body: string;
  title: string;
  // "html" (the body IS the markup) or "fastr" (markdown compiled to markup).
  format: ReportFormat;
  // fastr only: the theme stylesheet, swapped in place when the user re-themes.
  themeCss?: string;
  figures: Record<string, FigureBlock>;
  images: Record<string, ImageBlock>;
  assetUrl: (imgFile: string) => string;
  rasters: FigureRasterCache;
  // Bumped by the host when a raster lands → immediate re-render.
  rasterVersion: number;
  // The style's light-ink palette for figures whose DETECTED ground is dark
  // (generic fallback applies when absent).
  lightInk?: FigureInkTheme;
  lineAnchors: boolean;
  forwardPointer?: boolean;
  onSurface?: (surface: PreviewSurface) => void;
  onReady?: () => void;
  class?: string;
  // e.g. "preview-content" — the live-cursor surface anchor (report_cursors).
  dataReportCursor?: string;
};

const BODY_DEBOUNCE_MS = 120;

export function ReportHtmlPreview(p: Props) {
  let iframe!: HTMLIFrameElement;
  let surface: PreviewSurface | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  const cleanups: (() => void)[] = [];

  // Ink follows each figure's ACTUAL ground: an unmeasured figure renders as
  // a probe (the author's <img> with a transparent pixel) for one pass; after
  // insertion the grounds are measured from computed styles and a changed/new
  // measurement triggers an immediate re-render that requests the raster with
  // the right ink. Measurements are per figure id and re-checked every render,
  // so CSS edits that flip a ground re-ink the chart.
  const darkGroundById = new Map<string, boolean>();

  function inkFor(id: string): FigureInkTheme | undefined {
    return darkGroundById.get(id) ? (p.lightInk ?? GENERIC_LIGHT_INK) : undefined;
  }

  // The theme sheet lives in the frame's <head>, not the srcdoc, so a theme
  // change re-skins the document without reloading the frame (which would drop
  // the surface, the scroll position and every blob: raster).
  function syncThemeCss(doc: Document) {
    const existing = doc.head.querySelector<HTMLStyleElement>(
      `style[${FASTR_THEME_STYLE_ATTR}]`,
    );
    const css = p.themeCss ?? "";
    if (css.length === 0) {
      existing?.remove();
      return;
    }
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css;
      return;
    }
    const el = doc.createElement("style");
    el.setAttribute(FASTR_THEME_STYLE_ATTR, "");
    el.textContent = css;
    doc.head.appendChild(el);
  }

  function render() {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;
    syncThemeCss(doc);
    // `:::report` is part of the body, so it is re-read on every render and
    // lands on <html> (see wrapReportDocument) rather than the text column.
    const docSettings = p.format === "fastr"
      ? readFastrDocumentSettings(p.body)
      : undefined;
    doc.documentElement.className = docSettings?.className ?? "";
    doc.documentElement.setAttribute("style", docSettings?.style ?? "");
    const html = renderReportBodyHtml(p.body, {
      lineAnchors: p.lineAnchors,
      format: p.format,
    });
    const frag = buildReportBodyNodes(
      doc,
      html,
      (id) => {
        const fb = p.figures[id];
        if (!fb) return { state: "missing" };
        if (!darkGroundById.has(id)) return { state: "probe" };
        return p.rasters.get(id, fb, inkFor(id));
      },
      (id) => {
        const ib = p.images[id];
        return ib ? p.assetUrl(ib.imgFile) : undefined;
      },
    );
    doc.body.replaceChildren(frag);
    let groundsChanged = false;
    for (
      const el of Array.from(
        doc.querySelectorAll('[data-embed-kind="figure"]'),
      )
    ) {
      // ONLY real <img> elements (the probe or a finished raster — both carry
      // the author's CSS). The pending placeholder is a div with our own
      // light-grey background: measuring it reads the placeholder, flips the
      // ground to "light", and oscillates raster inks forever.
      if (el.tagName !== "IMG") continue;
      const id = el.getAttribute("data-embed-id");
      if (!id) continue;
      const dark = isDarkGroundBehind(el);
      if (darkGroundById.get(id) !== dark) {
        darkGroundById.set(id, dark);
        groundsChanged = true;
      }
    }
    if (groundsChanged) {
      scheduleRender(0);
    }
    p.onReady?.();
  }

  function scheduleRender(delayMs: number) {
    if (!surface) return; // pre-load: onLoad renders
    if (renderTimer) clearTimeout(renderTimer);
    if (delayMs === 0) {
      renderTimer = undefined;
      render();
      return;
    }
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      render();
    }, delayMs);
  }

  function forward(type: "pointermove" | "pointerdown" | "click") {
    return (e: MouseEvent) => {
      const r = iframe.getBoundingClientRect();
      const init: PointerEventInit = {
        bubbles: true,
        cancelable: false,
        clientX: e.clientX + r.left,
        clientY: e.clientY + r.top,
        button: e.button,
        buttons: e.buttons,
      };
      const pe = e as PointerEvent;
      const ev = type === "click" ? new MouseEvent("click", init) : new PointerEvent(type, {
        ...init,
        pointerId: pe.pointerId ?? 1,
        pointerType: pe.pointerType ?? "mouse",
        isPrimary: true,
      });
      iframe.dispatchEvent(ev);
    };
  }

  function onLoad() {
    const doc = iframe.contentDocument;
    if (!doc?.body) return;
    surface = iframeSurface(iframe);
    cleanups.push(
      interceptReportLinks(doc, (href) => {
        window.open(href, "_blank", "noopener");
      }),
    );
    if (p.forwardPointer) {
      for (const type of ["pointermove", "pointerdown", "click"] as const) {
        const h = forward(type);
        doc.addEventListener(type, h, { passive: true });
        cleanups.push(() => doc.removeEventListener(type, h));
      }
    }
    render();
    p.onSurface?.(surface);
  }

  // Typing → debounced; registry / raster changes → immediate.
  createEffect(on(() => p.body, () => scheduleRender(BODY_DEBOUNCE_MS), { defer: true }));
  createEffect(
    on(
      () =>
        [
          p.figures,
          p.images,
          p.rasterVersion,
          p.lineAnchors,
          p.themeCss,
        ] as const,
      () => scheduleRender(0),
      { defer: true },
    ),
  );

  onCleanup(() => {
    if (renderTimer) clearTimeout(renderTimer);
    for (const c of cleanups) c();
    cleanups.length = 0;
    surface = undefined;
  });

  return (
    <iframe
      ref={iframe}
      class={p.class}
      title={p.title}
      sandbox="allow-same-origin"
      srcdoc={wrapReportDocument({ title: p.title, bodyHtml: "" })}
      data-report-cursor={p.dataReportCursor}
      onLoad={onLoad}
    />
  );
}
