import type { CustomMarkdownStyleOptions } from "panther";

// Shared markdown render style for reports — used by View mode AND the PDF/Word
// exports so they never drift. Each export uses a separate panther render path
// (markdownToPdfBrowser / markdownToWordBrowser), so the style must be passed to
// each explicitly; this constant is the single source of truth.
//
// H1: slightly larger than the panther default (relFontSize 1.5) and heavier.
export const REPORT_MARKDOWN_STYLE: CustomMarkdownStyleOptions = {
  text: { h1: { font: { weight: 800 }, relFontSize: 1.65 } },
};
