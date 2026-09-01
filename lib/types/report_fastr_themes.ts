// =============================================================================
// FASTR Markdown themes — the design tokens behind the format's REAL
// stylesheets. Unlike REPORT_HTML_STYLES (prose briefs steering the AI), these
// drive a deterministic renderer: report_fastr_css.ts projects one token set
// into `--fm-*` custom properties that the single structure sheet reads.
//
// A theme is therefore swappable at any time — a FASTR Markdown body carries no
// CSS of its own. Adding a theme is safe; REMOVING one needs the retired-value
// treatment (PROTOCOL_APP_MIGRATIONS.md + the Block-2 transform in
// data_transforms/reports.ts), same as the html styles.
// =============================================================================

export const FASTR_REPORT_THEMES = [
  "default",
  "minimal",
  "corporate",
  "ministry",
  "classic",
  "executive",
  "clinical",
  "editorial",
  "swiss",
  "monochrome",
  // The artistic set, matching the html style briefs of the same names.
  "bauhaus",
  "blueprint",
  "broadsheet",
  "risograph",
  "artdeco",
  "japanese",
  "terminal",
  "brutalist",
] as const;
export type FastrReportTheme = (typeof FASTR_REPORT_THEMES)[number];

// Callout kinds and stat deltas carry MEANING, so their colours cannot come
// from the palette — but a fixed light-page set is unreadable on a dark theme.
// One flag per theme picks the pair; dark GROUNDS inside a light theme (a dark
// band) switch to the same dark set locally.
export type FastrColorScheme = "light" | "dark";

export const FASTR_SEMANTIC_COLORS: Record<
  FastrColorScheme,
  { info: string; success: string; warning: string; danger: string }
> = {
  light: {
    info: "#2563eb",
    success: "#15803d",
    warning: "#b45309",
    danger: "#b91c1c",
  },
  dark: {
    info: "#7dd3fc",
    success: "#86efac",
    warning: "#fcd34d",
    danger: "#fca5a5",
  },
};

export type FastrThemeTokens = {
  // Whether the PAGE is light or dark — picks the semantic colour set.
  scheme: FastrColorScheme;
  // Full `@import url(...)` line, or "" for a system-font theme. <link> is
  // stripped by the sanitizer, so webfonts can only arrive this way.
  fontImport: string;
  fontBody: string;
  fontHeading: string;
  page: string;
  // Card / callout ground.
  surface: string;
  // Subtle secondary ground (stat tiles, table stripes).
  surfaceAlt: string;
  ink: string;
  inkMuted: string;
  accent: string;
  // Readable ink ON the accent colour.
  accentInk: string;
  border: string;
  radius: string;
  borderWidth: string;
  headingWeight: string;
  headingTracking: string;
  // "none" | "uppercase"
  headingCase: string;
  // Body column width.
  measure: string;
  // The theme's own DARK ground, for `tone=dark` bands and covers. A real
  // per-theme value rather than "invert the ink": Ministry's dark is deep
  // green, Corporate's is navy, Swiss's is black — that difference is most of
  // what makes a full-bleed band feel like it belongs to the theme.
  toneDark: string;
  toneDarkInk: string;
  // Rules the token model cannot express.
  extraCss: string;
};

const SYSTEM_SANS =
  `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

function googleFonts(spec: string): string {
  return `@import url('https://fonts.googleapis.com/css2?${spec}&display=swap');`;
}

export const FASTR_THEME_TOKENS: Record<FastrReportTheme, FastrThemeTokens> = {
  default: {
    scheme: "light",
    fontImport: "",
    fontBody: SYSTEM_SANS,
    fontHeading: SYSTEM_SANS,
    page: "#ffffff",
    surface: "#f6f8fa",
    surfaceAlt: "#eef2f6",
    ink: "#1a1a1a",
    inkMuted: "#5b6672",
    accent: "#2563eb",
    accentInk: "#ffffff",
    border: "#d8dee6",
    radius: "6px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "56rem",
    toneDark: "#1e293b",
    toneDarkInk: "#f1f5f9",
    extraCss: `
h2 { border-bottom: 1px solid var(--fm-border); padding-bottom: 0.25em; }
.fm-figure { background: var(--fm-surface); border: 1px solid var(--fm-border); border-radius: var(--fm-radius); padding: 1em; }
.fm-stat { border: 1px solid var(--fm-border); }
.fm-quote { border-left-width: 4px; border-left-color: var(--fm-accent); font-size: 1.1em; }
.fm-steps > *::before { color: var(--fm-accent-text); }
thead th { background: var(--fm-surface-alt); }
`,
  },
  minimal: {
    scheme: "light",
    fontImport: googleFonts("family=Inter:wght@400;500;600;700"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    page: "#ffffff",
    surface: "#fafafa",
    surfaceAlt: "#f4f4f5",
    ink: "#18181b",
    inkMuted: "#71717a",
    accent: "#18181b",
    accentInk: "#ffffff",
    border: "#e4e4e7",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "600",
    headingTracking: "-0.02em",
    headingCase: "none",
    measure: "44rem",
    toneDark: "#18181b",
    toneDarkInk: "#fafafa",
    extraCss: `
.fm-callout { border-left-width: 2px; background: none; padding-left: 1.1em; }
.fm-card { box-shadow: none; }
h2 { padding-bottom: 0.3em; border-bottom: 1px solid var(--fm-border); }
/* Hairlines instead of fills: nothing is boxed unless it has to be. */
.fm-stat { background: none; border-top: 2px solid var(--fm-ink); border-radius: 0; padding-left: 0; }
.fm-stat__value { font-weight: 600; }
.fm-figure { border-bottom: 1px solid var(--fm-border); padding-bottom: 0.9em; }
.fm-figure__caption { font-size: 0.8em; }
.fm-quote { border: none; padding-left: 0; font-size: 1.25em; font-weight: 300; color: var(--fm-ink); }
.fm-quote__cite { font-size: 0.7em; }
.fm-steps { border: none; background: none; }
.fm-steps > * { border-bottom: 1px solid var(--fm-border); padding-left: 3.4em; }
table { font-size: 0.9em; }
thead th { border-bottom-width: 1px; font-weight: 600; }
.fm-kicker { letter-spacing: 0.3em; }
`,
  },
  corporate: {
    scheme: "light",
    fontImport: googleFonts("family=Inter:wght@400;600;700;800"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    page: "#ffffff",
    surface: "#f4f7fb",
    surfaceAlt: "#e8eef7",
    ink: "#12233b",
    inkMuted: "#5a6b82",
    accent: "#0b4f9e",
    accentInk: "#ffffff",
    border: "#cfdae8",
    radius: "8px",
    borderWidth: "1px",
    headingWeight: "800",
    headingTracking: "-0.015em",
    headingCase: "none",
    measure: "56rem",
    toneDark: "#0b2d52",
    toneDarkInk: "#e8f0f9",
    extraCss: `
h1 { border-bottom: 3px solid var(--fm-accent); padding-bottom: 0.25em; }
h2 { color: var(--fm-accent-text); }
.fm-card { box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
/* A consultancy deck's devices: capped tiles, soft shadow, ruled tables. */
.fm-stat { border-top: 4px solid var(--fm-accent); box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
.fm-figure { background: var(--fm-surface); border-radius: var(--fm-radius); padding: 1.1em; box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
.fm-callout { box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
.fm-quote { background: var(--fm-surface); border-left-color: var(--fm-accent); padding: 1em 1.2em; border-radius: var(--fm-radius); }
.fm-steps { box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
.fm-steps > *::before { color: var(--fm-accent-text); }
thead th { background: var(--fm-accent); color: var(--fm-accent-ink); }
th, td { padding: 0.6em 0.8em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.8em;
  padding: 1.3em var(--fm-bleed-pad) 1.1em;
  background: var(--fm-tone-dark);
  color: var(--fm-tone-dark-ink);
  border-bottom: none;
}
`,
  },
  ministry: {
    scheme: "light",
    fontImport: googleFonts(
      "family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;600",
    ),
    fontBody: `"Source Sans 3", ${SYSTEM_SANS}`,
    fontHeading: `Merriweather, Georgia, serif`,
    page: "#ffffff",
    surface: "#f2f7f3",
    surfaceAlt: "#e6efe8",
    ink: "#16281c",
    inkMuted: "#54685b",
    accent: "#12633a",
    accentInk: "#ffffff",
    border: "#c9dbcf",
    radius: "4px",
    borderWidth: "1px",
    headingWeight: "900",
    headingTracking: "0",
    headingCase: "none",
    measure: "54rem",
    toneDark: "#0d3b22",
    toneDarkInk: "#e8f3ec",
    extraCss: `
h1 { text-align: center; }
h2 { color: var(--fm-accent-text); border-bottom: 2px solid var(--fm-border); padding-bottom: 0.25em; }
.fm-stat__value { font-family: var(--fm-font-heading); }
/* Official-document furniture: centred masthead, ruled tables, serif plates. */
.fm-figure { border: 1px solid var(--fm-border); padding: 1em; background: var(--fm-surface); }
.fm-figure__caption { font-family: var(--fm-font-heading); font-size: 0.8em; }
.fm-quote { border-left-color: var(--fm-accent); font-family: var(--fm-font-heading); font-size: 1.05em; }
.fm-steps > *::before { font-family: var(--fm-font-heading); color: var(--fm-accent-text); }
thead th { background: var(--fm-surface-alt); border-bottom-width: 2px; }
.fm-cover { text-align: center; }
.fm-kicker { letter-spacing: 0.3em; }
`,
  },
  classic: {
    scheme: "light",
    fontImport: googleFonts("family=Lora:wght@400;600;700"),
    fontBody: `Lora, Georgia, "Times New Roman", serif`,
    fontHeading: `Lora, Georgia, "Times New Roman", serif`,
    page: "#fdfbf7",
    surface: "#f5efe4",
    surfaceAlt: "#efe7d9",
    ink: "#2b2419",
    inkMuted: "#6b6152",
    accent: "#8a5a2b",
    accentInk: "#ffffff",
    border: "#ddd2bd",
    radius: "3px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "0",
    headingCase: "none",
    measure: "48rem",
    toneDark: "#33291c",
    toneDarkInk: "#f7f0e4",
    extraCss: `
body { line-height: 1.7; }
/* Book furniture: a rule under every heading, figures set like plates. */
h2 { border-bottom: 1px solid var(--fm-border); padding-bottom: 0.25em; }
.fm-figure { border: 1px solid var(--fm-border); padding: 1.1em; background: var(--fm-surface); }
.fm-figure__caption { font-style: italic; text-align: center; }
.fm-stat { background: var(--fm-surface); border: 1px solid var(--fm-border); }
.fm-quote { border-left-width: 2px; font-size: 1.15em; font-style: italic; }
.fm-steps { background: var(--fm-surface); }
thead th { border-bottom-width: 1px; font-variant: small-caps; letter-spacing: 0.05em; }
`,
  },
  executive: {
    scheme: "light",
    fontImport: googleFonts(
      "family=Playfair+Display:wght@700;900&family=Inter:wght@400;600",
    ),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `"Playfair Display", Georgia, serif`,
    page: "#ffffff",
    surface: "#f7f5f0",
    surfaceAlt: "#efeae0",
    ink: "#1c1c1c",
    inkMuted: "#6a6a6a",
    accent: "#9a7b34",
    accentInk: "#ffffff",
    border: "#ded8ca",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "900",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "52rem",
    toneDark: "#1c1c1c",
    toneDarkInk: "#f5f1e8",
    extraCss: `
h1 { font-size: 2.6em; }
h2 { border-bottom: 1px solid var(--fm-accent); padding-bottom: 0.2em; }
.fm-stat__value { font-family: var(--fm-font-heading); }
/* Gold hairlines and display serif carry the whole theme. */
.fm-stat { background: none; border-top: 1px solid var(--fm-accent); border-bottom: 1px solid var(--fm-accent); border-radius: 0; }
.fm-figure { border-top: 1px solid var(--fm-accent); border-bottom: 1px solid var(--fm-accent); padding: 1.2em 0; }
.fm-figure__caption { font-family: var(--fm-font-heading); font-style: italic; }
.fm-quote { border: none; border-top: 1px solid var(--fm-accent); border-bottom: 1px solid var(--fm-accent); padding: 1em 0; font-family: var(--fm-font-heading); font-size: 1.35em; font-style: italic; text-align: center; }
.fm-steps { border: none; background: none; }
.fm-steps > * { border-bottom: 1px solid var(--fm-accent); }
.fm-steps > *::before { font-family: var(--fm-font-heading); font-size: 1.1em; color: var(--fm-accent-text); }
thead th { border-bottom: 1px solid var(--fm-accent); font-family: var(--fm-font-heading); }
.fm-kicker { letter-spacing: 0.35em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.8em;
  padding: 1.1em var(--fm-bleed-pad) 0.9em;
  border-top: 1px solid var(--fm-accent);
  border-bottom: 1px solid var(--fm-accent);
}
`,
  },
  clinical: {
    scheme: "light",
    fontImport: googleFonts("family=IBM+Plex+Sans:wght@400;500;600;700"),
    fontBody: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    fontHeading: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    page: "#ffffff",
    surface: "#f1f8f8",
    surfaceAlt: "#e4f1f1",
    ink: "#10262b",
    inkMuted: "#546b70",
    accent: "#0f766e",
    accentInk: "#ffffff",
    border: "#c8dedd",
    radius: "4px",
    borderWidth: "1px",
    headingWeight: "600",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "56rem",
    toneDark: "#0c3b38",
    toneDarkInk: "#e6f4f2",
    extraCss: `
/* A data theme: the table and the stat tile are the primary devices. */
h2 { color: var(--fm-accent-text); }
thead th { background: var(--fm-accent); color: var(--fm-accent-ink); border-bottom: none; }
th, td { padding: 0.55em 0.8em; }
tbody tr:nth-child(even) { background: var(--fm-surface-alt); }
.fm-stat { border-left: 4px solid var(--fm-accent); }
.fm-figure { background: var(--fm-surface); padding: 1em; border-radius: var(--fm-radius); }
.fm-callout { border-left-width: 4px; }
.fm-quote { background: var(--fm-surface); border-left-color: var(--fm-accent); padding: 1em 1.2em; }
.fm-steps { background: var(--fm-surface); }
.fm-steps > *::before { color: var(--fm-accent-text); }
`,
  },
  editorial: {
    scheme: "light",
    fontImport: googleFonts(
      "family=IBM+Plex+Serif:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600",
    ),
    fontBody: `"IBM Plex Serif", Georgia, serif`,
    fontHeading: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    page: "#fffdf9",
    surface: "#f6f1e8",
    surfaceAlt: "#efe8db",
    ink: "#1f1b16",
    inkMuted: "#6d6459",
    accent: "#b3311f",
    accentInk: "#ffffff",
    radius: "0px",
    border: "#ded5c6",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "-0.02em",
    headingCase: "none",
    measure: "50rem",
    toneDark: "#1f1b16",
    toneDarkInk: "#f6f1e8",
    extraCss: `
h1 { border-top: 4px solid var(--fm-ink); border-bottom: 1px solid var(--fm-ink); padding: 0.3em 0; }
h2 { text-transform: uppercase; letter-spacing: 0.08em; font-size: 1.25em; border-bottom: 1px solid var(--fm-ink); padding-bottom: 0.2em; }
.fm-callout__title { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.8em; }
/* Magazine furniture: a big centred pull quote and ruled plates. */
.fm-quote { border: none; border-top: 3px solid var(--fm-ink); border-bottom: 3px solid var(--fm-ink); padding: 0.9em 0; font-family: var(--fm-font-heading); font-size: 1.45em; line-height: 1.25; text-align: center; color: var(--fm-ink); }
.fm-quote__cite { text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.55em; }
.fm-figure { border-top: 1px solid var(--fm-ink); padding-top: 0.9em; }
.fm-figure__caption { font-style: italic; }
.fm-stat { background: none; border-top: 3px solid var(--fm-ink); border-radius: 0; padding-left: 0; }
.fm-steps { border: none; background: none; }
.fm-steps > * { border-bottom: 1px solid var(--fm-ink); }
.fm-steps > *::before { font-family: var(--fm-font-heading); }
thead th { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85em; }
.fm-kicker { letter-spacing: 0.3em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 0.7em var(--fm-bleed-pad) 0.5em;
  border-top: 6px solid var(--fm-ink);
  border-bottom: 1px solid var(--fm-ink);
  font-size: 3.1em;
}
`,
  },
  swiss: {
    scheme: "light",
    fontImport: googleFonts("family=Inter:wght@400;500;700;900"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    page: "#ffffff",
    surface: "#f2f2f2",
    surfaceAlt: "#e8e8e8",
    ink: "#000000",
    inkMuted: "#666666",
    accent: "#e2231a",
    accentInk: "#ffffff",
    border: "#000000",
    radius: "0px",
    borderWidth: "2px",
    headingWeight: "900",
    headingTracking: "-0.03em",
    headingCase: "uppercase",
    measure: "54rem",
    toneDark: "#000000",
    toneDarkInk: "#ffffff",
    extraCss: `
h1 { text-transform: uppercase; }
.fm-stat__value { font-size: 2.6em; }
/* Grid, weight and silence: rules do the work, nothing is filled. */
h2 { border-top: 4px solid var(--fm-ink); padding-top: 0.35em; text-transform: uppercase; }
.fm-stat { background: none; border-top: 4px solid var(--fm-ink); border-radius: 0; padding-left: 0; }
.fm-stat__label { text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; font-size: 0.75em; }
.fm-figure { border-top: 4px solid var(--fm-ink); padding-top: 0.9em; }
.fm-figure__caption { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.75em; font-weight: 700; }
.fm-callout { background: none; border: none; border-top: 4px solid var(--fm-callout-color); padding-left: 0; border-radius: 0; }
.fm-callout__title { text-transform: uppercase; letter-spacing: 0.08em; }
.fm-quote { border: none; border-top: 4px solid var(--fm-accent); padding: 0.8em 0 0; font-size: 1.35em; font-weight: 700; line-height: 1.15; color: var(--fm-ink); }
.fm-steps { border: none; background: none; }
.fm-steps > * { border-bottom: 1px solid var(--fm-ink); padding-left: 3.6em; }
.fm-steps > *::before { color: var(--fm-accent-text); }
table { border-top: 4px solid var(--fm-ink); border-bottom: 4px solid var(--fm-ink); }
thead th { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.8em; }
.fm-kicker { letter-spacing: 0.3em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 1.4em var(--fm-bleed-pad) 1em;
  background: var(--fm-ink);
  color: var(--fm-page);
  border-bottom: none;
  font-size: 3em;
  line-height: 0.95;
}
`,
  },
  monochrome: {
    scheme: "light",
    fontImport: googleFonts("family=Inter:wght@400;600;800"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    page: "#ffffff",
    surface: "#f4f4f4",
    surfaceAlt: "#e9e9e9",
    ink: "#111111",
    inkMuted: "#666666",
    accent: "#111111",
    accentInk: "#ffffff",
    border: "#cccccc",
    radius: "2px",
    borderWidth: "1px",
    headingWeight: "800",
    headingTracking: "-0.02em",
    headingCase: "none",
    measure: "52rem",
    toneDark: "#111111",
    toneDarkInk: "#f4f4f4",
    extraCss: `
.fm-callout { background: var(--fm-surface); border-left-color: var(--fm-ink); }
/* Every emphasis has to come from weight and tone, never from hue. */
h2 { border-bottom: 3px solid var(--fm-ink); padding-bottom: 0.25em; }
.fm-stat { border-left: 5px solid var(--fm-ink); border-radius: 0; }
.fm-figure { background: var(--fm-surface-alt); padding: 1em; }
.fm-figure__caption { font-weight: 700; }
.fm-quote { border-left-width: 6px; border-left-color: var(--fm-ink); font-size: 1.2em; color: var(--fm-ink); }
.fm-steps { background: var(--fm-surface); }
.fm-steps > * { padding-left: 4.2em; }
.fm-steps > *::before { background: var(--fm-ink); color: var(--fm-page); padding: 0.1em 0.45em; left: 1em; }
thead th { background: var(--fm-ink); color: var(--fm-page); border-bottom: none; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 1.2em var(--fm-bleed-pad) 1em;
  background: var(--fm-ink);
  color: var(--fm-page);
  border-bottom: none;
}
`,
  },
  bauhaus: {
    scheme: "light",
    fontImport: googleFonts(
      "family=Archivo:wght@700;900&family=Space+Grotesk:wght@400;500;700",
    ),
    fontBody: `"Space Grotesk", ${SYSTEM_SANS}`,
    fontHeading: `Archivo, ${SYSTEM_SANS}`,
    page: "#f5f1e8",
    surface: "#ece7da",
    surfaceAlt: "#e2dbca",
    ink: "#1a1a1a",
    inkMuted: "#5d574c",
    accent: "#d02e26",
    accentInk: "#ffffff",
    border: "#1a1a1a",
    radius: "0px",
    borderWidth: "3px",
    headingWeight: "900",
    headingTracking: "-0.02em",
    headingCase: "uppercase",
    measure: "54rem",
    toneDark: "#1a1a1a",
    toneDarkInk: "#f5f1e8",
    extraCss: `
h1 { font-size: 2.8em; line-height: 0.95; }
h2 { color: #1f5ca9; }
.fm-band { border-block: 5px solid var(--fm-ink); }
.fm-stat__value { font-family: var(--fm-font-heading); }
/* Primary blocks, circles and heavy rules — the shapes are the design. */
.fm-stat { border: 3px solid var(--fm-ink); border-top-width: 10px; border-radius: 0; }
.fm-figure { border: 3px solid var(--fm-ink); padding: 1em; }
.fm-figure__caption { font-family: var(--fm-font-heading); text-transform: uppercase; letter-spacing: 0.06em; }
.fm-callout { border: 3px solid var(--fm-ink); border-left-width: 10px; border-radius: 0; }
.fm-quote { border: 3px solid var(--fm-ink); border-left: 10px solid #1f5ca9; padding: 1em 1.2em; color: var(--fm-ink); }
.fm-steps { border-width: 3px; }
.fm-steps > * { border-bottom-width: 3px; padding-left: 4.4em; }
.fm-steps > *::before { background: #1f5ca9; color: #fff; border-radius: 999px; width: 2em; height: 2em; display: grid; place-items: center; left: 1em; top: 0.85em; }
thead th { background: var(--fm-accent); color: var(--fm-accent-ink); }
th, td { border: 2px solid var(--fm-ink); }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 1.2em var(--fm-bleed-pad) 0.9em;
  background: var(--fm-accent);
  color: var(--fm-accent-ink);
  border-bottom: 10px solid var(--fm-ink);
}
`,
  },
  blueprint: {
    scheme: "dark",
    fontImport: googleFonts(
      "family=IBM+Plex+Mono:wght@400;600&family=Archivo+Narrow:wght@600;700",
    ),
    fontBody: `"IBM Plex Mono", ui-monospace, monospace`,
    fontHeading: `"Archivo Narrow", ${SYSTEM_SANS}`,
    page: "#123b63",
    surface: "#17456f",
    surfaceAlt: "#0e3253",
    ink: "#e7f0f7",
    inkMuted: "#a7c2d8",
    accent: "#7fa6c6",
    accentInk: "#0b2742",
    border: "#4d7ba3",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "0.06em",
    headingCase: "uppercase",
    measure: "56rem",
    toneDark: "#0b2742",
    toneDarkInk: "#e7f0f7",
    extraCss: `
html {
  background-image:
    repeating-linear-gradient(0deg, rgba(231, 240, 247, 0.13) 0 1px, transparent 1px 20px),
    repeating-linear-gradient(90deg, rgba(231, 240, 247, 0.13) 0 1px, transparent 1px 20px);
}
hr { border-top-style: dashed; }
/* A drafting sheet: everything is a dashed annotation on the grid. */
h2 { border-bottom: 1px dashed var(--fm-border); padding-bottom: 0.3em; }
.fm-card, .fm-callout { border-style: dashed; }
.fm-stat { border: 1px dashed var(--fm-border); background: none; border-radius: 0; }
.fm-stat__label { text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.72em; }
.fm-figure { border: 1px dashed var(--fm-border); padding: 1em; background: rgba(0, 0, 0, 0.15); }
.fm-figure__caption { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.72em; }
.fm-quote { border: 1px dashed var(--fm-border); border-left-width: 4px; padding: 1em 1.2em; color: var(--fm-ink); }
.fm-steps { border-style: dashed; background: rgba(0, 0, 0, 0.15); }
.fm-steps > * { border-bottom-style: dashed; }
.fm-steps > *::before { color: var(--fm-accent-text); }
th, td { border-bottom: 1px dashed var(--fm-border); }
thead th { border-bottom: 1px solid var(--fm-ink); text-transform: uppercase; letter-spacing: 0.08em; }
.fm-kicker { letter-spacing: 0.3em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 1.3em var(--fm-bleed-pad) 1.1em;
  border-bottom: 1px dashed var(--fm-border);
}
`,
  },
  broadsheet: {
    scheme: "light",
    fontImport: googleFonts(
      "family=Playfair+Display:wght@700;900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600",
    ),
    fontBody: `"Source Serif 4", Georgia, serif`,
    fontHeading: `"Playfair Display", Georgia, serif`,
    page: "#faf7f0",
    surface: "#f2ede2",
    surfaceAlt: "#eae3d4",
    ink: "#1c1c1c",
    inkMuted: "#605c54",
    accent: "#7a1f1a",
    accentInk: "#ffffff",
    border: "#cfc7b8",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "900",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "52rem",
    toneDark: "#1c1c1c",
    toneDarkInk: "#faf7f0",
    extraCss: `
h1 {
  text-align: center;
  font-size: 3em;
  border-top: 1px solid var(--fm-ink);
  border-bottom: 1px solid var(--fm-ink);
  padding: 0.2em 0;
}
/* Front-page furniture: centred double rules, plates with cutlines. */
h2 { text-align: center; border-bottom: 3px double var(--fm-ink); padding-bottom: 0.25em; }
.fm-stat { background: none; border-top: 1px solid var(--fm-ink); border-bottom: 1px solid var(--fm-ink); border-radius: 0; text-align: center; padding-left: 0; }
.fm-figure { border-bottom: 1px solid var(--fm-ink); padding-bottom: 0.8em; }
.fm-figure__caption { font-style: italic; text-align: center; }
.fm-quote { border: none; border-top: 3px double var(--fm-ink); border-bottom: 3px double var(--fm-ink); padding: 0.9em 0; text-align: center; font-family: var(--fm-font-heading); font-size: 1.35em; color: var(--fm-ink); }
.fm-steps { border: none; background: none; }
.fm-steps > * { border-bottom: 1px solid var(--fm-border); }
.fm-steps > *::before { font-family: var(--fm-font-heading); }
thead th { border-bottom: 3px double var(--fm-ink); font-variant: small-caps; }
.fm-cover { text-align: center; }
.fm-kicker { letter-spacing: 0.35em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 0.5em var(--fm-bleed-pad) 0.4em;
  border-top: 1px solid var(--fm-ink);
  border-bottom: 3px double var(--fm-ink);
}
`,
  },
  risograph: {
    scheme: "light",
    fontImport: googleFonts("family=Space+Grotesk:wght@400;500;700"),
    fontBody: `"Space Grotesk", ${SYSTEM_SANS}`,
    fontHeading: `"Space Grotesk", ${SYSTEM_SANS}`,
    page: "#f7f3e8",
    surface: "#efe9d9",
    surfaceAlt: "#e6dfcb",
    ink: "#1d3159",
    inkMuted: "#5b6885",
    accent: "#ff48b0",
    accentInk: "#1d3159",
    border: "#c3c9d6",
    radius: "2px",
    borderWidth: "2px",
    headingWeight: "700",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "50rem",
    toneDark: "#1d3159",
    toneDarkInk: "#f7f3e8",
    extraCss: `
h1, h2 { color: #0078bf; text-shadow: 3px 3px 0 var(--fm-accent); }
.fm-card { box-shadow: 4px 4px 0 rgba(0, 120, 191, 0.25); }
/* Misregistered offset printing: everything sits slightly off its shadow. */
.fm-stat { border: 2px solid #0078bf; box-shadow: 4px 4px 0 var(--fm-accent); border-radius: 2px; }
.fm-figure { border: 2px solid #0078bf; box-shadow: 5px 5px 0 var(--fm-accent); padding: 0.9em; background: var(--fm-page); }
.fm-figure__caption { color: #0078bf; font-weight: 700; }
.fm-callout { border: 2px solid #0078bf; border-left-width: 8px; box-shadow: 4px 4px 0 var(--fm-accent); }
.fm-quote { border: 2px solid var(--fm-accent); border-left-width: 8px; box-shadow: 4px 4px 0 rgba(0, 120, 191, 0.35); padding: 1em 1.2em; color: var(--fm-ink); }
.fm-steps { border: 2px solid #0078bf; box-shadow: 5px 5px 0 var(--fm-accent); }
.fm-steps > *::before { color: #0078bf; }
thead th { background: #0078bf; color: #fff; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.8em;
  padding: 1.2em var(--fm-bleed-pad) 1em;
  border-bottom: 3px solid #0078bf;
}
`,
  },
  artdeco: {
    scheme: "light",
    fontImport: googleFonts(
      "family=Marcellus&family=Cormorant+Garamond:wght@400;600;700",
    ),
    fontBody: `"Cormorant Garamond", Georgia, serif`,
    fontHeading: `Marcellus, Georgia, serif`,
    page: "#f5efe0",
    surface: "#ede5d1",
    surfaceAlt: "#e4dac2",
    ink: "#191714",
    inkMuted: "#6b6353",
    accent: "#b08d3e",
    accentInk: "#191714",
    border: "#b08d3e",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "400",
    headingTracking: "0.18em",
    headingCase: "uppercase",
    measure: "48rem",
    toneDark: "#191714",
    toneDarkInk: "#f5efe0",
    extraCss: `
body { font-size: 1.06em; }
h1 { text-align: center; }
.fm-band { border-block: 1px solid var(--fm-accent); }
/* Doubled gold rules and wide capitals, everything on the centre line. */
h2 { text-align: center; border-bottom: 3px double var(--fm-accent); padding-bottom: 0.3em; }
.fm-stat { background: none; border: 1px solid var(--fm-accent); border-radius: 0; text-align: center; padding-left: 0; }
.fm-stat__value { font-family: var(--fm-font-heading); }
.fm-stat__label { text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.72em; }
.fm-figure { border: 1px solid var(--fm-accent); padding: 1em; }
.fm-figure__caption { text-align: center; text-transform: uppercase; letter-spacing: 0.16em; font-size: 0.72em; }
.fm-quote { border: none; border-top: 3px double var(--fm-accent); border-bottom: 3px double var(--fm-accent); padding: 1em 0; text-align: center; font-family: var(--fm-font-heading); font-size: 1.3em; letter-spacing: 0.04em; color: var(--fm-ink); }
.fm-steps { border-color: var(--fm-accent); background: none; }
.fm-steps > * { border-bottom-color: var(--fm-accent); }
.fm-steps > *::before { font-family: var(--fm-font-heading); color: var(--fm-accent-text); }
thead th { border-bottom: 3px double var(--fm-accent); text-transform: uppercase; letter-spacing: 0.14em; font-size: 0.8em; }
.fm-cover { text-align: center; }
.fm-kicker { letter-spacing: 0.45em; }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.8em;
  padding: 1.2em var(--fm-bleed-pad) 1em;
  border-top: 3px double var(--fm-accent);
  border-bottom: 3px double var(--fm-accent);
}
`,
  },
  japanese: {
    scheme: "light",
    fontImport: googleFonts(
      "family=Shippori+Mincho:wght@600;700&family=Zen+Kaku+Gothic+New:wght@400;500",
    ),
    fontBody: `"Zen Kaku Gothic New", ${SYSTEM_SANS}`,
    fontHeading: `"Shippori Mincho", Georgia, serif`,
    page: "#fbfaf7",
    surface: "#f4f2ec",
    surfaceAlt: "#eceae2",
    ink: "#2b2b28",
    inkMuted: "#8c8a84",
    accent: "#b04a39",
    accentInk: "#ffffff",
    border: "#dedbd2",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "0.02em",
    headingCase: "none",
    measure: "46rem",
    toneDark: "#2b2b28",
    toneDarkInk: "#fbfaf7",
    extraCss: `
body { line-height: 1.85; }
h1, h2, h3 { margin-top: 2.4em; }
/* Space is the device: hairlines, no fills, generous rhythm. */
h2 { border-bottom: 1px solid var(--fm-border); padding-bottom: 0.5em; }
.fm-card, .fm-callout { border-radius: 0; }
.fm-stat { background: none; border-top: 1px solid var(--fm-ink); border-radius: 0; padding: 1.2em 0 0; }
.fm-stat__label { color: var(--fm-ink-muted); letter-spacing: 0.06em; }
.fm-figure { margin: 2.6em 0; }
.fm-figure__caption { margin-top: 1em; letter-spacing: 0.04em; }
.fm-callout { background: none; border-left-width: 1px; padding: 0.4em 0 0.4em 1.6em; }
.fm-quote { border: none; padding: 0.6em 0 0.6em 2em; font-size: 1.15em; color: var(--fm-ink); }
.fm-steps { border: none; background: none; }
.fm-steps > * { border-bottom: 1px solid var(--fm-border); padding: 1.4em 0 1.4em 3.6em; }
.fm-steps > *::before { left: 0; color: var(--fm-ink-muted); }
thead th { border-bottom-width: 1px; }
`,
  },
  terminal: {
    scheme: "dark",
    fontImport: googleFonts("family=JetBrains+Mono:wght@400;700"),
    fontBody: `"JetBrains Mono", ui-monospace, monospace`,
    fontHeading: `"JetBrains Mono", ui-monospace, monospace`,
    page: "#0c0f0d",
    surface: "#141a16",
    surfaceAlt: "#0f1512",
    ink: "#9bb39f",
    inkMuted: "#6d8271",
    accent: "#33ff66",
    accentInk: "#0c0f0d",
    border: "#1e3a2a",
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "0",
    headingCase: "none",
    measure: "54rem",
    toneDark: "#050706",
    toneDarkInk: "#c8e6ce",
    extraCss: `
h1::before, h2::before { content: "> "; color: var(--fm-accent); }
h1, h2, h3 { color: var(--fm-accent); }
/* A session transcript: bracket tags, dashed rules, screenshot panels. */
.fm-stat { border: 1px solid var(--fm-border); background: none; border-radius: 0; }
.fm-stat__label { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.72em; }
.fm-figure { border: 1px solid var(--fm-border); padding: 0.9em; background: rgba(0, 0, 0, 0.35); }
.fm-figure__caption::before { content: "// "; }
.fm-callout { border: 1px solid var(--fm-callout-color); border-left-width: 4px; background: rgba(0, 0, 0, 0.3); }
.fm-callout__title::before { content: "[ "; }
.fm-callout__title::after { content: " ]"; }
.fm-quote { border: 1px dashed var(--fm-border); padding: 1em 1.2em; color: var(--fm-ink); }
.fm-steps { border: 1px solid var(--fm-border); background: rgba(0, 0, 0, 0.3); }
.fm-steps > * { border-bottom: 1px dashed var(--fm-border); padding-left: 4.4em; }
.fm-steps > *::before { content: "[" counter(fm-step, decimal-leading-zero) "]"; color: var(--fm-accent); }
th, td { border-bottom: 1px dashed var(--fm-border); }
thead th { border-bottom: 1px solid var(--fm-accent); color: var(--fm-accent); }

body > h1:first-child {
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 1.2em var(--fm-bleed-pad) 1em;
  border-bottom: 1px solid var(--fm-accent);
}
`,
  },
  brutalist: {
    scheme: "light",
    fontImport: "",
    fontBody: `Arial, Helvetica, ${SYSTEM_SANS}`,
    fontHeading: `Arial, Helvetica, ${SYSTEM_SANS}`,
    page: "#ffffff",
    surface: "#ffffff",
    surfaceAlt: "#ededed",
    ink: "#000000",
    inkMuted: "#444444",
    accent: "#ffff00",
    accentInk: "#000000",
    border: "#000000",
    radius: "0px",
    borderWidth: "3px",
    headingWeight: "700",
    headingTracking: "-0.02em",
    headingCase: "uppercase",
    measure: "54rem",
    toneDark: "#000000",
    toneDarkInk: "#ffffff",
    extraCss: `
h1 { background: var(--fm-accent); display: inline-block; padding: 0 0.15em; }
h2 { border-bottom: 6px solid var(--fm-ink); padding-bottom: 0.2em; letter-spacing: 0.12em; }
h3 { letter-spacing: 0.14em; }
.fm-card { box-shadow: 5px 5px 0 var(--fm-ink); border-width: 5px; }
.fm-callout {
  border: 5px solid var(--fm-ink);
  border-left-width: 14px;
  border-radius: 0;
  background: #fff;
}
.fm-callout__title { letter-spacing: 0.14em; text-transform: uppercase; }
.fm-stat { border: 5px solid var(--fm-ink); }
.fm-stat__value { letter-spacing: -0.04em; }
.fm-stat__label { text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
.fm-stat__delta { border-radius: 0; border: 2px solid currentColor; }
/* A figure is a specimen: framed hard, captioned like a filename. */
.fm-figure { border: 5px solid var(--fm-ink); padding: 14px; background: #fff; }
.fm-figure__caption {
  font-family: "Courier New", ui-monospace, monospace;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--fm-ink);
}
.fm-steps { border-width: 5px; }
.fm-steps > * { border-bottom-width: 3px; padding-left: 4.6em; }
.fm-steps > *::before {
  background: var(--fm-ink);
  color: var(--fm-accent);
  padding: 0.1em 0.5em;
  left: 1em;
}
.fm-quote {
  border: 3px solid var(--fm-ink);
  border-left: 14px solid var(--fm-ink);
  padding: 1.1em 1.3em;
  color: var(--fm-ink);
  background: #fff;
}
/* Default HTML tables were never ugly enough to hide. */
table { border: 5px solid var(--fm-ink); }
th, td { border: 2px solid var(--fm-ink); }
thead th { background: var(--fm-accent); text-transform: uppercase; letter-spacing: 0.1em; }
.fm-kicker { letter-spacing: 0.4em; color: var(--fm-ink); }
.fm-dek { border-top-width: 4px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--fm-ink); }
.fm-band .fm-kicker, .fm-band .fm-dek { color: inherit; }
a { text-decoration: underline; text-underline-offset: 3px; }

/* The opening title is the masthead: a full-bleed acid block. */
body > h1:first-child {
  display: block;
  margin: calc(-1 * var(--fm-page-pad-top)) var(--fm-bleed-margin) 1.6em;
  padding: 1.5em var(--fm-bleed-pad) 1.1em;
  border-bottom: 6px solid var(--fm-ink);
  font-size: 3.2em;
  line-height: 0.94;
  letter-spacing: -0.03em;
}
`,
  },
};

// Colour-only skin taken from a custom report_styles row (its reference_css
// targets AI-generated class names, not fm-*, so only the palette transfers).
export type FastrThemeColorOverride = {
  page: string;
  ink: string;
  accent: string;
};

export function isFastrReportTheme(v: unknown): v is FastrReportTheme {
  return typeof v === "string" &&
    (FASTR_REPORT_THEMES as readonly string[]).includes(v);
}
