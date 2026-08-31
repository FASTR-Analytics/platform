// HTML-format reports: the ONE document builder behind the editor preview, the
// version-history preview, the .html download and print-to-PDF —
// sanitize (DOMPurify + the lib config) → materialize embeds → base CSS.
// DOM-dependent (client only); the sanitizer CONFIG itself is pure data in
// lib/types/reports.ts and is exercised by server/tests/report_html_sanitize_test.ts.
//
// The preview renders the result inside a `sandbox="allow-same-origin"` srcdoc
// iframe: scripts are browser-blocked there regardless of the sanitizer, the
// report's <style> stays scoped to its own document, and blob:/asset URLs work
// because the frame keeps the parent origin (removing allow-same-origin would
// break the rasters). The .html export is opened un-sandboxed by the user, so
// the sanitizer is load-bearing there.

import DOMPurify from "dompurify";
import {
  injectReportHtmlLineAnchors,
  REPORT_PURIFY_CONFIG,
  t3,
} from "lib";

export function sanitizeReportHtml(html: string): string {
  return DOMPurify.sanitize(html, REPORT_PURIFY_CONFIG);
}

// Inserted BEFORE the report's own CSS so the report always wins.
export const REPORT_BASE_CSS = `
:root { color-scheme: light; }
html { background: #ffffff; }
body {
  box-sizing: border-box;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
  max-width: 56rem;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: #1a1a1a;
}
img { max-width: 100%; height: auto; }
/* Figure rasters are TRANSPARENT PNGs; white here is the safe default and a
   report's own CSS overrides it to inject the style's background. */
img[data-embed-kind] { display: block; background: #ffffff; }
table { border-collapse: collapse; }
.report-embed-pending {
  display: flex; align-items: center; justify-content: center;
  width: 100%; aspect-ratio: 16 / 9;
  background: #f3f4f6; border: 1px dashed #d1d5db; border-radius: 4px;
  color: #6b7280; font-size: 0.85rem;
}
.report-embed-missing { display: block; color: #b91c1c; font-size: 0.85rem; }
@media print {
  body { max-width: none; padding: 0; }
  img, table, figure, .report-embed-pending { break-inside: avoid; }
}
/* Styled reports depend on their backgrounds surviving print. */
*, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

export function wrapReportDocument(p: {
  title: string;
  bodyHtml: string;
}): string {
  const title = p.title
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${REPORT_BASE_CSS}</style>
</head>
<body>${p.bodyHtml}</body>
</html>`;
}

// Inject line anchors (preview only) → sanitize.
export function renderReportBodyHtml(
  body: string,
  opts: { lineAnchors: boolean },
): string {
  return sanitizeReportHtml(
    opts.lineAnchors ? injectReportHtmlLineAnchors(body) : body,
  );
}

export type FigureRasterState =
  | { state: "ready"; url: string; width: number; height: number }
  | { state: "pending"; aspect?: number }
  | { state: "missing" };

const EMBED_SRC_RE = /^(figure|image):(.+)$/;

function missingText(kind: "figure" | "image", id: string): string {
  return kind === "figure"
    ? `${
      t3({
        en: "Missing visualization:",
        fr: "Visualisation manquante :",
        pt: "Visualização em falta:",
      })
    } ${id}`
    : `${
      t3({
        en: "Missing image:",
        fr: "Image manquante :",
        pt: "Imagem em falta:",
      })
    } ${id}`;
}

function carryAnchor(from: Element, to: Element): void {
  const line = from.getAttribute("data-line");
  if (line !== null) to.setAttribute("data-line", line);
}

// Swap every embed <img> (src figure:/image:) for its resolved rendering,
// keeping the author's class/style/id and the data-line anchor:
//   ready   → the raster/asset URL + width/height + data-embed-id/kind
//   pending → a placeholder box (aspect from the last known raster if any)
//   missing → the "Missing visualization/image: id" note
export function materializeReportEmbeds(
  root: ParentNode,
  resolveFigure: (id: string) => FigureRasterState,
  resolveImage: (id: string) => string | undefined,
): void {
  const doc = root instanceof Document ? root : root.ownerDocument!;
  for (const img of Array.from(root.querySelectorAll<HTMLImageElement>("img"))) {
    const m = EMBED_SRC_RE.exec((img.getAttribute("src") ?? "").trim());
    if (!m) continue;
    const kind = m[1] as "figure" | "image";
    const id = m[2];
    const missing = () => {
      const span = doc.createElement("span");
      span.className = "report-embed-missing";
      span.setAttribute("data-embed-id", id);
      span.setAttribute("data-embed-kind", kind);
      carryAnchor(img, span);
      span.textContent = missingText(kind, id);
      img.replaceWith(span);
    };
    if (kind === "image") {
      const url = resolveImage(id);
      if (!url) {
        missing();
        continue;
      }
      img.setAttribute("src", url);
      img.setAttribute("data-embed-id", id);
      img.setAttribute("data-embed-kind", "image");
      continue;
    }
    const r = resolveFigure(id);
    if (r.state === "ready") {
      img.setAttribute("src", r.url);
      img.setAttribute("width", String(r.width));
      img.setAttribute("height", String(r.height));
      img.setAttribute("data-embed-id", id);
      img.setAttribute("data-embed-kind", "figure");
    } else if (r.state === "pending") {
      const box = doc.createElement("div");
      box.className = "report-embed-pending";
      if (img.className) box.className += ` ${img.className}`;
      const style = img.getAttribute("style");
      if (style) box.setAttribute("style", style);
      if (r.aspect) box.style.aspectRatio = String(r.aspect);
      const idAttr = img.getAttribute("id");
      if (idAttr) box.id = idAttr;
      box.setAttribute("data-embed-id", id);
      box.setAttribute("data-embed-kind", "figure");
      carryAnchor(img, box);
      box.textContent = t3({
        en: "Rendering…",
        fr: "Rendu en cours…",
        pt: "A renderizar…",
      });
      img.replaceWith(box);
    } else {
      missing();
    }
  }
}

// Sanitized html → live nodes in `doc` with embeds materialized. Building in a
// <template> keeps everything inert (no CSS/loads) until the caller adopts it.
export function buildReportBodyNodes(
  doc: Document,
  sanitizedHtml: string,
  resolveFigure: (id: string) => FigureRasterState,
  resolveImage: (id: string) => string | undefined,
): DocumentFragment {
  const tpl = doc.createElement("template");
  tpl.innerHTML = sanitizedHtml;
  materializeReportEmbeds(tpl.content, resolveFigure, resolveImage);
  return tpl.content;
}

// Print/export: lazy images may never load off-screen.
export function stripLazyLoading(root: ParentNode): void {
  for (const img of Array.from(root.querySelectorAll("img[loading]"))) {
    img.removeAttribute("loading");
  }
}

// Clicks inside a rendered report document: in-page fragments scroll within
// the frame; everything else opens in a new tab (the sandboxed frame must never
// navigate itself or the app). Returns the remover.
export function interceptReportLinks(
  doc: Document,
  openExternal: (href: string) => void,
): () => void {
  const onClick = (e: Event) => {
    const target = e.target as Element | null;
    const a = target?.closest?.("a");
    if (!a) return;
    const raw = a.getAttribute("href") ??
      (a as unknown as { href?: { baseVal?: string } }).href?.baseVal;
    if (!raw) return;
    e.preventDefault();
    if (raw.startsWith("#")) {
      const name = decodeURIComponent(raw.slice(1));
      const el = name
        ? doc.getElementById(name) ??
          doc.querySelector(`[name="${CSS.escape(name)}"]`)
        : doc.documentElement;
      el?.scrollIntoView({ block: "start" });
      return;
    }
    openExternal(raw);
  };
  doc.addEventListener("click", onClick);
  return () => doc.removeEventListener("click", onClick);
}
