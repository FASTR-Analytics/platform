// =============================================================================
// The standalone report DOCUMENT shell: the base stylesheet and the html
// wrapper around a sanitized report body. Pure strings, in lib/ so the client
// (preview, .html export, paged PDF) and the Deno tests that render fixture
// documents through headless Chrome build byte-identical documents.
// =============================================================================

import { escapeReportHtml } from "./types/reports.ts";

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
/* Figure rasters are TRANSPARENT PNGs with no default background — whatever
   the report paints behind them (page color, texture, image, panel) shows
   through. A style that wants a distinct card sets a background in its CSS. */
img[data-embed-kind] { display: block; }
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

// FASTR Markdown reports carry no CSS of their own — their whole design is the
// theme stylesheet, which therefore has to be part of the document. It goes in
// its own <style> AFTER the base sheet (so it wins) and is marked so the
// preview can swap it in place when the theme changes.
export const FASTR_THEME_STYLE_ATTR = "data-fm-theme";

export type ReportDocumentShell = {
  title: string;
  bodyHtml: string;
  themeCss?: string;
  // FASTR Markdown `:::report` settings. They go on <html>, not <body>: the
  // page ground has to reach past the centred text column, and --fm-measure
  // has to be in scope for the full-bleed bands inside body.
  documentClass?: string;
  documentStyle?: string;
  // The FASTR `@page` rule (sheet size, orientation, margins). The print
  // dialog still owns headers and page numbers; CSS cannot switch those on.
  pageCss?: string;
  // A paged render: the paged stylesheet (after everything else, so it wins
  // on order), the hidden title span first in <body>, and the Paged.js
  // polyfill + runner last in <body>. All three are OUR markup, never the
  // author's — the sanitized report is bodyHtml alone.
  headExtraCss?: string;
  bodyPrefixHtml?: string;
  bodySuffixHtml?: string;
};

export function wrapReportDocument(p: ReportDocumentShell): string {
  const title = p.title
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const theme = p.themeCss
    ? `\n<style ${FASTR_THEME_STYLE_ATTR}>${p.themeCss}</style>`
    : "";
  const docAttrs = [
    p.documentClass ? ` class="${escapeReportHtml(p.documentClass)}"` : "",
    p.documentStyle ? ` style="${escapeReportHtml(p.documentStyle)}"` : "",
  ].join("");
  const pageRule = p.pageCss ? `\n<style>${p.pageCss}</style>` : "";
  const headExtra = p.headExtraCss ? `\n<style>${p.headExtraCss}</style>` : "";
  return `<!doctype html>
<html${docAttrs}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${REPORT_BASE_CSS}</style>${theme}${pageRule}${headExtra}
</head>
<body>${p.bodyPrefixHtml ?? ""}${p.bodyHtml}${p.bodySuffixHtml ?? ""}</body>
</html>`;
}

// The scripts a paged document ends with: Paged.js held back from auto-run,
// the polyfill itself, then the runner. The polyfill source is inlined
// (the document must be self-contained for the server); a `</script` inside
// it would end the tag early, so it is escaped (harmless inside a JS string).
export function pagedDocumentScriptsHtml(
  polyfillSource: string,
  runnerJs: string,
): string {
  const safe = polyfillSource.replaceAll("</script", "<\\/script");
  return `<script>window.PagedConfig={auto:false};</script>` +
    `<script>${safe}</script>` +
    `<script>${runnerJs}</script>`;
}

// A stand-in for an image whose box matters but whose pixels do not (the
// editor's layout frame, the render test's fixtures): an SVG with the size as
// its intrinsic dimensions. A 1px pixel with width/height ATTRIBUTES is not
// enough: once it loads, its own 1:1 ratio outranks the attributes under
// `height: auto`, and every figure lays out as a square.
export function sizedPlaceholderImageSrc(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"/>`,
  );
}
