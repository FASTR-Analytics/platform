// =============================================================================
// The `legacy` report theme: the platform's own, registered with the report
// engine (Report Forge) rather than built into it, because it reproduces a
// look only this app ever had.
//
// It is the look of the reports written BEFORE FASTR Markdown: plain markdown
// rendered by panther's own markdown style (client/src/generate_report/
// report_markdown_style.ts over panther's _004_markdown_style defaults),
// which is what View mode and the PDF/Word exports gave a markdown report.
// It exists so those reports can be converted to FASTR Markdown without
// their authors finding a different document: white page, near-black text,
// Inter, the link blue as the only colour in the file, panther's modest
// heading scale (h1 1.65 at weight 800, h2 1.25, h3 1.125, h4-h6 plain body
// text), tables ruled on every edge under a shaded header, and panther's
// block rhythm. Chosen deliberately, so a converted report keeps it and a
// new report is never started on it.
//
// What it CANNOT carry over, because these are the format's and not the
// theme's: the document is set at 16px/1.55 (REPORT_BASE_CSS) where panther
// set it at 14px/1.4, so the column holds fewer words per line; and figures
// are PNG rasters where panther drew them into the PDF as vectors.
//
// REGISTRATION ORDER IS LOAD-BEARING. The theme exists only once this module
// has run, and a stored config naming it fails validation before then (the
// reports data transform would drop the theme from every converted report).
// So lib/types/reports.ts, which owns reportConfigSchema, imports this file
// itself: no caller can reach the schema without the registration having
// run. lib/mod.ts exports it too, for the id.
// =============================================================================

import { registerFastrTheme } from "../report-forge/engine/report_fastr_themes.ts";

export const REPORT_LEGACY_THEME = "legacy";

// The engine's own built-ins compose these two from private helpers; written
// out here they are the same strings.
const SYSTEM_SANS =
  `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
// The app set markdown in International Inter; Inter is its public twin and
// the one the default theme already inlines into the printed file. 800 is
// here for the h1 weight, which no other theme asks Inter for.
const INTER_IMPORT =
  `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`;

registerFastrTheme(REPORT_LEGACY_THEME, {
  label: { en: "Legacy", fr: "Ancien", pt: "Antigo" },
  caption: {
    en: "The look of the old markdown reports",
    fr: "L'aspect des anciens rapports markdown",
    pt: "O aspeto dos antigos relatórios markdown",
  },
  tokens: {
    scheme: "light",
    // panther's own: base100 as the page, baseContent as the text, and the
    // markdown style's link blue as the accent. That blue is the ONE colour a
    // markdown report ever showed, and it is a full-saturation web blue where
    // every other theme's hues are muted. It is kept anyway, and exempt from
    // the muted-palette rule the engine's tests hold its built-ins to
    // (server/tests/report_config_test.ts pins what it does keep), because a
    // muted blue would simply be a different document. The warm pole is NOT
    // panther's alarm red: nothing
    // in a markdown report was ever warm (there were no callouts, stats or
    // deltas to colour), so it is free, and a muted brick is the better
    // neighbour for the blocks a converted report may gain later.
    palette: {
      paper: "#ffffff",
      ink: "#2a2a2a",
      accent: "#0066cc",
      warm: "#9c5a4d",
    },
    fontImport: INTER_IMPORT,
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    radius: "4px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "0em",
    headingCase: "none",
    // panther rendered the report into the preview's max-w-4xl card.
    measure: "56rem",
    // panther's headingRelFontSizes with the report style's heavier h1, and
    // h4-h6 as they were: base text, unbolded. Leading is the base text's
    // 1.4, not the structure sheet's tighter 1.2.
    headings: {
      h1: { size: "1.65em", weight: "800", lineHeight: "1.4" },
      h2: { size: "1.25em", lineHeight: "1.4" },
      h3: { size: "1.125em", lineHeight: "1.4" },
      h4: { weight: "400", lineHeight: "1.4" },
      h5: { weight: "400", lineHeight: "1.4" },
      h6: { weight: "400", lineHeight: "1.4" },
    },
    // panther's marginsEm verbatim: every block declares the gap ABOVE it and
    // nothing below, so the space after a heading is whatever follows it
    // asking for room (0.5em before a list, 1.5em before a quote). A
    // paragraph keeps a bottom margin as well as its top, which collapsing
    // makes a no-op between blocks and which the page layout needs: the
    // editor reads a paragraph's rhythm off margin-BOTTOM (measurePrintMetrics
    // pMargin), and a paragraph with none would close up every page.
    extraCss: `
h1, h2, h3, h4, h5, h6 { font-family: var(--fm-font-body); margin-bottom: 0; }
h1 { margin-top: 0.9em; }
h2 { margin-top: 0.95em; border-bottom: none; padding-bottom: 0; }
h3, h4, h5, h6 { margin-top: 1em; }
p { margin: 1em 0; }
a { text-decoration: underline; }
/* panther's own list indent (textIndentEm), markers and all: the structure
   sheet draws them with a ::before at the negative of the padding, so the
   two move together or the marker leaves the text. */
ul, ol { margin: 0.5em 0; --fm-mt: 0.5em; --fm-mb: 0.5em; padding-left: 1.714em; }
ul > li::before, ol:not(.fm-toc__list) > li::before { left: -1.714em; width: 1.714em; }
li { margin: 0.5em 0 0; }
li:first-child { margin-top: 0; }
hr { margin: 1.5em 0; }
pre { margin: 1.5em 0; padding: 1em; }
blockquote { margin: 1.5em 0; --fm-mt: 1.5em; --fm-mb: 1.5em; padding: 0.25em 0 0.25em 0.75em; border-left: 3px solid var(--fm-ink); color: var(--fm-ink); }
/* A ruled grid with a shaded header, sized by its content, not the structure
   sheet's full-width underlined table. */
table { width: auto; margin: 1em 0 1.5em; --fm-mt: 1em; --fm-mb: 1.5em; font-size: 1em; }
th, td { border: 1px solid var(--fm-border); padding: 0.25em 0.5em; }
thead th { background: var(--fm-surface-alt); border-bottom: 1px solid var(--fm-border); }
/* An image was a bare image in the flow, never a card. */
.fm-figure { margin: 1em 0 1.5em; --fm-mt: 1em; --fm-mb: 1.5em; }
`,
  },
});
