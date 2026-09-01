// =============================================================================
// FASTR Markdown stylesheets — ONE structure sheet plus a per-theme token block.
// Pure strings (no DOM), so the same builder serves the editor preview, the
// version-history preview, the .html/print export and the creation picker's
// tiles; the tiles pass a scope selector and therefore show the REAL theme
// rather than a hand-authored impression.
//
// Loaded AFTER REPORT_BASE_CSS (page box, embed placeholders, print rules), so
// these rules win. The class taxonomy is defined once in
// fastr_markdown_blocks.ts — renaming a class means changing both, plus the AI
// brief that teaches the block vocabulary.
// =============================================================================

import {
  FASTR_THEME_TOKENS,
  type FastrReportTheme,
  type FastrThemeColorOverride,
  type FastrThemeTokens,
} from "./types/report_fastr_themes.ts";

// Scope "" = the whole report document; anything else (a picker tile) roots the
// same rules at that selector.
function selectors(scope: string): { root: string; d: string; vars: string } {
  return scope === ""
    ? { root: "html, body", d: "", vars: ":root" }
    : { root: scope, d: `${scope} `, vars: scope };
}

export function buildFastrThemeVarsCss(
  tokens: FastrThemeTokens,
  scope = "",
  colors?: FastrThemeColorOverride,
): string {
  const { vars } = selectors(scope);
  const page = colors?.page ?? tokens.page;
  const ink = colors?.ink ?? tokens.ink;
  const accent = colors?.accent ?? tokens.accent;
  return `${vars} {
  --fm-page: ${page};
  --fm-surface: ${tokens.surface};
  --fm-surface-alt: ${tokens.surfaceAlt};
  --fm-ink: ${ink};
  --fm-ink-muted: ${tokens.inkMuted};
  --fm-accent: ${accent};
  --fm-accent-ink: ${tokens.accentInk};
  --fm-border: ${tokens.border};
  --fm-radius: ${tokens.radius};
  --fm-border-width: ${tokens.borderWidth};
  --fm-font-body: ${tokens.fontBody};
  --fm-font-heading: ${tokens.fontHeading};
  --fm-heading-weight: ${tokens.headingWeight};
  --fm-heading-tracking: ${tokens.headingTracking};
  --fm-heading-case: ${tokens.headingCase};
  --fm-measure: ${tokens.measure};
  --fm-callout-color: ${accent};
}`;
}

export function buildFastrStructureCss(scope = ""): string {
  const { root, d } = selectors(scope);
  return `
${root} {
  background: var(--fm-page);
  color: var(--fm-ink);
  font-family: var(--fm-font-body);
}
${d}body { max-width: var(--fm-measure); }
${d}h1, ${d}h2, ${d}h3, ${d}h4, ${d}h5, ${d}h6 {
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  letter-spacing: var(--fm-heading-tracking);
  text-transform: var(--fm-heading-case);
  color: var(--fm-ink);
  line-height: 1.2;
  margin: 1.8em 0 0.6em;
}
${d}h1 { font-size: 2.15em; margin-top: 0; }
${d}h2 { font-size: 1.55em; }
${d}h3 { font-size: 1.2em; }
${d}h4, ${d}h5, ${d}h6 { font-size: 1em; }
${d}p { margin: 0 0 1em; }
${d}a { color: var(--fm-accent); }
${d}strong { font-weight: 700; }
${d}ul, ${d}ol { margin: 0 0 1em; padding-left: 1.4em; }
${d}li { margin: 0.25em 0; }
${d}hr { border: 0; border-top: 1px solid var(--fm-border); margin: 2em 0; }
${d}code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
  background: var(--fm-surface-alt);
  padding: 0.1em 0.3em;
  border-radius: 3px;
}
${d}pre {
  background: var(--fm-surface-alt);
  border-radius: var(--fm-radius);
  padding: 0.9em 1.1em;
  overflow-x: auto;
}
${d}pre code { background: none; padding: 0; }
${d}table { width: 100%; margin: 0 0 1.4em; font-size: 0.94em; }
${d}th, ${d}td {
  border-bottom: 1px solid var(--fm-border);
  padding: 0.5em 0.7em;
  text-align: left;
  vertical-align: top;
}
${d}thead th {
  border-bottom: 2px solid var(--fm-ink);
  font-weight: 700;
}
${d}blockquote {
  margin: 1.4em 0;
  padding: 0.2em 0 0.2em 1.1em;
  border-left: 3px solid var(--fm-border);
  color: var(--fm-ink-muted);
}

/* ── Figures (an embed on its own line becomes a captioned figure) ────────── */
${d}.fm-figure { margin: 1.6em 0; }
${d}.fm-figure img { display: block; width: 100%; }
${d}.fm-figure__caption {
  margin-top: 0.5em;
  font-size: 0.85em;
  color: var(--fm-ink-muted);
  line-height: 1.4;
}

/* ── Callouts ─────────────────────────────────────────────────────────────── */
${d}.fm-callout {
  margin: 1.5em 0;
  padding: 1em 1.2em;
  background: var(--fm-surface);
  border-left: 4px solid var(--fm-callout-color);
  border-radius: var(--fm-radius);
}
${d}.fm-callout > :last-child { margin-bottom: 0; }
${d}.fm-callout__title {
  font-family: var(--fm-font-heading);
  font-weight: 700;
  color: var(--fm-callout-color);
  margin-bottom: 0.35em;
}
${d}.fm-callout--note { --fm-callout-color: var(--fm-accent); }
${d}.fm-callout--info { --fm-callout-color: #2563eb; }
${d}.fm-callout--success { --fm-callout-color: #15803d; }
${d}.fm-callout--warning { --fm-callout-color: #b45309; }
${d}.fm-callout--danger { --fm-callout-color: #b91c1c; }

/* ── Tiles & cards ────────────────────────────────────────────────────────── */
${d}.fm-tiles {
  display: grid;
  gap: 1em;
  margin: 1.6em 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
${d}.fm-tiles--1 { grid-template-columns: minmax(0, 1fr); }
${d}.fm-tiles--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
${d}.fm-tiles--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
${d}.fm-tiles--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
${d}.fm-card {
  background: var(--fm-surface);
  border: var(--fm-border-width) solid var(--fm-border);
  border-radius: var(--fm-radius);
  padding: 1em 1.1em;
}
${d}.fm-card > :last-child { margin-bottom: 0; }
${d}.fm-card--accent {
  background: var(--fm-accent);
  border-color: var(--fm-accent);
  color: var(--fm-accent-ink);
}
${d}.fm-card--accent .fm-card__title,
${d}.fm-card--accent a { color: var(--fm-accent-ink); }
${d}.fm-card__title {
  font-family: var(--fm-font-heading);
  font-weight: 700;
  font-size: 0.95em;
  margin-bottom: 0.4em;
}

/* ── Stats ────────────────────────────────────────────────────────────────── */
${d}.fm-stat {
  background: var(--fm-surface-alt);
  border-radius: var(--fm-radius);
  padding: 1em 1.1em;
  margin: 1.2em 0;
}
${d}.fm-tiles .fm-stat, ${d}.fm-columns .fm-stat { margin: 0; }
${d}.fm-stat > :last-child { margin-bottom: 0; }
${d}.fm-stat__value {
  font-family: var(--fm-font-heading);
  font-size: 2.1em;
  font-weight: var(--fm-heading-weight);
  letter-spacing: var(--fm-heading-tracking);
  line-height: 1.05;
  color: var(--fm-accent);
}
${d}.fm-stat__label {
  font-size: 0.85em;
  color: var(--fm-ink-muted);
  margin-top: 0.25em;
}
${d}.fm-stat__delta {
  display: inline-block;
  margin-top: 0.5em;
  font-size: 0.8em;
  font-weight: 700;
  padding: 0.1em 0.45em;
  border-radius: 999px;
}
${d}.fm-stat__delta--up { color: #15803d; background: rgba(21, 128, 61, 0.12); }
${d}.fm-stat__delta--down { color: #b91c1c; background: rgba(185, 28, 28, 0.12); }
${d}.fm-stat__delta--flat { color: var(--fm-ink-muted); background: rgba(0, 0, 0, 0.06); }

/* ── Columns ──────────────────────────────────────────────────────────────── */
${d}.fm-columns {
  display: grid;
  gap: 1.5em;
  margin: 1.6em 0;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
${d}.fm-columns--1 { grid-template-columns: minmax(0, 1fr); }
${d}.fm-columns--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
${d}.fm-columns--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
${d}.fm-columns--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
${d}.fm-col > :last-child { margin-bottom: 0; }
${d}.fm-col--span2 { grid-column: span 2; }
${d}.fm-col--span3 { grid-column: span 3; }
${d}.fm-col--span4 { grid-column: span 4; }

/* ── Pull quote ───────────────────────────────────────────────────────────── */
${d}.fm-quote {
  margin: 1.8em 0;
  padding: 0.2em 0 0.2em 1.2em;
  border-left: 4px solid var(--fm-accent);
  font-family: var(--fm-font-heading);
  font-size: 1.2em;
  line-height: 1.45;
  color: var(--fm-ink);
}
${d}.fm-quote > p:last-of-type { margin-bottom: 0; }
${d}.fm-quote__cite {
  display: block;
  margin-top: 0.6em;
  font-family: var(--fm-font-body);
  font-size: 0.72em;
  font-style: normal;
  color: var(--fm-ink-muted);
}

/* Unknown block name — still groups its content rather than swallowing it. */
${d}.fm-block { margin: 1.2em 0; }
`;
}

// Narrow panes (the split-view preview) and print both need the grids to
// collapse; scoped tiles keep their layout at any size.
const RESPONSIVE_CSS = `
@media (max-width: 640px) {
  .fm-tiles, .fm-columns { grid-template-columns: minmax(0, 1fr) !important; }
  .fm-col--span2, .fm-col--span3, .fm-col--span4 { grid-column: auto; }
}
@media print {
  .fm-card, .fm-callout, .fm-stat, .fm-figure { break-inside: avoid; }
}
`;

// The complete stylesheet for a FASTR Markdown report. `@import` must lead the
// sheet (CSS requires it before any other rule), so the font import comes first.
// Every theme's font import, deduped. A stylesheet that concatenates several
// scoped themes (the creation picker) must lead with these — CSS drops an
// @import that follows any other rule, so per-theme imports would silently
// leave every theme but the first without its typeface.
export function fastrAllFontImportsCss(): string {
  const seen = new Set<string>();
  for (const tokens of Object.values(FASTR_THEME_TOKENS)) {
    if (tokens.fontImport.length > 0) seen.add(tokens.fontImport);
  }
  return [...seen].join("\n");
}

export function buildFastrReportCss(
  theme: FastrReportTheme,
  colors?: FastrThemeColorOverride,
  scope = "",
  opts?: { omitFontImport?: boolean },
): string {
  const tokens = FASTR_THEME_TOKENS[theme] ?? FASTR_THEME_TOKENS.default;
  const { d } = selectors(scope);
  const extra = tokens.extraCss.trim().length === 0
    ? ""
    : scope === ""
    ? tokens.extraCss
    // Scoped tiles need the theme's own rules scoped too; extraCss is written
    // one selector-list per line, which keeps this rewrite honest.
    : tokens.extraCss.replace(/^([^@\s][^{]*)\{/gm, (_m, sel: string) =>
      `${
        sel
          .split(",")
          .map((s: string) => {
            const t = s.trim();
            // A theme's page-level rule targets the tile root, not a <body>
            // that does not exist inside the tile.
            return t === "body" || t === "html" ? scope : `${d}${t}`;
          })
          .join(", ")
      } {`);
  return [
    opts?.omitFontImport ? "" : tokens.fontImport,
    buildFastrThemeVarsCss(tokens, scope, colors),
    buildFastrStructureCss(scope),
    extra,
    scope === "" ? RESPONSIVE_CSS : "",
  ].filter((s) => s.trim().length > 0).join("\n");
}
