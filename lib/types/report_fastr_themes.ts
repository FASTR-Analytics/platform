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
  // The artistic pair, matching the html style briefs of the same names.
  "bauhaus",
  "broadsheet",
] as const;
export type FastrReportTheme = (typeof FASTR_REPORT_THEMES)[number];

// The FOUR colours a theme is. Everything else the stylesheet needs (surfaces,
// borders, the muted ink, the dark band, the chart cycle, the status colours)
// is mixed from these by deriveFastrThemeColors, so a theme never has more
// than four colours and a tint of one of them is still that colour.
//   paper  the page
//   ink    the text
//   accent the theme's own colour: headings' rules, info, success, the
//          rising delta, a chart's "good"
//   warm   the theme's warm pole: danger, a chart's "bad", the falling delta
// There were five until the cool pole went (Nick, 2026-09-18). It had been a
// green on every theme whatever else the theme was made of, and re-cutting it
// as each theme's own cool colour only moved the problem: on the slate and
// navy themes the cool pole and the accent were two blues doing one job. So
// the accent does that job. A theme now has ONE hue plus its warm, and the
// pair still says what it means by TEMPERATURE: the accent is the cooler of
// the two and carries the good news, the warm pole the hotter and carries the
// bad. Warning is neither: it is the theme's gold, derived from the warm pole
// (see deriveFastrThemeColors), which is why the caution tier survives having
// no colour of its own.
//
// The catch, kept in the open: on a theme whose accent IS warm (Editorial's
// ochre, Swiss's and Bauhaus's red, Broadsheet's maroon, Classic's gold) the
// good news and the bad news are two warm tones, told apart by depth rather
// than by hue. Those themes lean on the lightness gap, which the theme tests
// hold them to.
//
// The four are also the four TONES a block can take as its ground
// (`tone=ink`, `tone=warm`): FASTR_GROUNDS, each with the type that reads on
// it. Only four, so the picker shows four (Nick, 2026-09-18). `cool` is a
// retired spelling and renders as the accent (FASTR_TONE_ALIASES).
export type FastrThemePalette = {
  paper: string;
  ink: string;
  accent: string;
  warm: string;
};

// Callout kinds, stat deltas and role marks carry MEANING. Their colours are
// the theme's own (danger is its warm pole, success and info its accent, the
// warning its gold), so they read as what they mean ON THAT PAGE. Success and
// info share the accent: with four colours the theme's hue is both its note
// and its good news, and the two callouts differ by their title and icon.
export type FastrColorScheme = "light" | "dark";
export type FastrThemeSemantic = { info: string; success: string; warning: string; danger: string };

// What a theme lends to charts, all derived from the four: `series` is the
// cycle (accent, warm, then shades and tints of the two) behind the two
// discrete colour scales; good is the accent, bad the warm pole and warn the
// theme's gold, so they read as what they mean ON THE THEME'S OWN PAGE
// rather than borrowing the app's red and green.
export type FastrThemeChart = {
  series: string[];
  // Reference / no-signal: the single-grey scale, a roll-up total series, an
  // unchanged bar in a percent-change chart.
  neutral: string;
  good: string;
  bad: string;
  // The caution tier between good and bad: the middle traffic light of a
  // thresholds table. An amber the theme would use (gold on Art Deco, the
  // yellow ink on Risograph, a khaki on Monochrome).
  warn: string;
  // The sequential scale's ends (the blue-green option), [from, to]: `to` is
  // the emphatic end — the one a lone series takes — and `from` the receding
  // one, so a light theme runs tint → shade and a dark theme dim → bright.
  ramp: [string, string];
};

// A theme as written: its four colours, its type and its extra rules.
export type FastrThemeSpec = {
  // Whether the PAGE is light or dark: which way the derived tints run.
  scheme: FastrColorScheme;
  palette: FastrThemePalette;
  // Full `@import url(...)` line, or "" for a system-font theme. <link> is
  // stripped by the sanitizer, so webfonts can only arrive this way.
  fontImport: string;
  fontBody: string;
  fontHeading: string;
  radius: string;
  borderWidth: string;
  headingWeight: string;
  headingTracking: string;
  // "none" | "uppercase"
  headingCase: string;
  // Body column width.
  measure: string;
  // Rules the token model cannot express. They may name the five as
  // --fm-paper, --fm-ink, --fm-accent and --fm-warm (and a
  // ground's type as --fm-<tone>-ground-ink), and never a literal colour.
  extraCss: string;
};

export const FASTR_GROUNDS = ["paper", "ink", "accent", "warm"] as const;
export type FastrGround = (typeof FASTR_GROUNDS)[number];
// A palette colour as a GROUND: the panel colour and the type on it.
export type FastrGroundColors = { color: string; ink: string };

// The colours the stylesheet reads, mixed from a palette.
export type FastrDerivedColors = {
  page: string;
  // Card / callout ground.
  surface: string;
  // Subtle secondary ground (stat tiles, table stripes).
  surfaceAlt: string;
  ink: string;
  inkMuted: string;
  accent: string;
  border: string;
  // The four tones: each palette colour as a ground, with the paper or the
  // ink as its type, whichever stands further from it. The paper ground
  // carries a hint of ink, or a paper panel on the paper page would be
  // invisible; the ink ground is the dark band on a light theme and the
  // light one on a dark theme.
  grounds: Record<FastrGround, FastrGroundColors>;
  // The status colours as they read on the page, and the same four for a
  // ground of the other darkness (a dark band on a light theme, a light
  // panel on a dark one), faded toward the paper.
  semantic: FastrThemeSemantic;
  semanticOnDark: FastrThemeSemantic;
  semanticOnLight: FastrThemeSemantic;
  // The lighter and the darker of paper and ink: the literal inks a custom
  // bg colour picks between.
  lightInk: string;
  darkInk: string;
  chart: FastrThemeChart;
};

export type FastrThemeTokens = FastrThemeSpec & FastrDerivedColors;

const SYSTEM_SANS =
  `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

function googleFonts(spec: string): string {
  return `@import url('https://fonts.googleapis.com/css2?${spec}&display=swap');`;
}

const FASTR_THEME_SPECS: Record<FastrReportTheme, FastrThemeSpec> = {
  default: {
    scheme: "light",
    palette: { paper: "#fcfcfb", ink: "#24292e", accent: "#4e6f94", warm: "#936653" },
    // Inter, not the system stack this theme used to name. A system font is
    // whatever the MACHINE has, and the PDF is printed by a headless Chrome
    // on the instance host whose only face is Liberation: the author's page
    // was set in Segoe UI or SF and the PDF came back in something else, with
    // every line wrapping at a different word. Inter is inlined into the
    // printed document like every other theme's face (inline_theme_fonts.ts),
    // so both sides set the same type. It is also what the app itself uses,
    // and the nearest free relative of the UI faces this theme used to borrow.
    fontImport: googleFonts("family=Inter:wght@400;500;600;700"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    radius: "6px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "56rem",
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
    palette: { paper: "#fafaf8", ink: "#2b2b2b", accent: "#6b7280", warm: "#8c6e63" },
    fontImport: googleFonts("family=Inter:wght@400;500;600;700"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "600",
    headingTracking: "-0.02em",
    headingCase: "none",
    measure: "44rem",
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
    palette: { paper: "#f7f8fa", ink: "#1f2a37", accent: "#3d5a80", warm: "#8e5f48" },
    fontImport: googleFonts("family=Inter:wght@400;600;700;800"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    radius: "8px",
    borderWidth: "1px",
    headingWeight: "800",
    headingTracking: "-0.015em",
    headingCase: "none",
    measure: "56rem",
    extraCss: `
h1 { border-bottom: 3px solid var(--fm-accent); padding-bottom: 0.25em; }
h2 { color: var(--fm-accent-text); }
.fm-card { box-shadow: 0 1px 3px color-mix(in srgb, var(--fm-ink) 8%, transparent); }
/* A consultancy deck's devices: capped tiles, soft shadow, ruled tables. */
.fm-stat { border-top: 4px solid var(--fm-accent); box-shadow: 0 1px 3px color-mix(in srgb, var(--fm-ink) 8%, transparent); }
.fm-figure { background: var(--fm-surface); border-radius: var(--fm-radius); padding: 1.1em; box-shadow: 0 1px 3px color-mix(in srgb, var(--fm-ink) 8%, transparent); }
.fm-callout { box-shadow: 0 1px 3px color-mix(in srgb, var(--fm-ink) 8%, transparent); }
.fm-quote { background: var(--fm-surface); border-left-color: var(--fm-accent); padding: 1em 1.2em; border-radius: var(--fm-radius); }
.fm-steps { box-shadow: 0 1px 3px color-mix(in srgb, var(--fm-ink) 8%, transparent); }
.fm-steps > *::before { color: var(--fm-accent-text); }
thead th { background: var(--fm-accent); color: var(--fm-accent-ground-ink); }
th, td { padding: 0.6em 0.8em; }
`,
  },
  ministry: {
    scheme: "light",
    palette: { paper: "#f7f6f1", ink: "#22302a", accent: "#3e6b58", warm: "#855847" },
    fontImport: googleFonts(
      "family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;600",
    ),
    fontBody: `"Source Sans 3", ${SYSTEM_SANS}`,
    fontHeading: `Merriweather, Georgia, serif`,
    radius: "4px",
    borderWidth: "1px",
    headingWeight: "900",
    headingTracking: "0",
    headingCase: "none",
    measure: "54rem",
    extraCss: `
h1 { text-align: center; }
h2 { color: var(--fm-accent-text); border-bottom: 2px solid var(--fm-border); padding-bottom: 0.25em; }
.fm-stat__value { font-family: var(--fm-font-heading); }
/* Official-document furniture: ruled tables, serif plates. */
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
    palette: { paper: "#f9f6ef", ink: "#2b2620", accent: "#8c6a3f", warm: "#6d332c" },
    fontImport: googleFonts("family=Lora:wght@400;600;700"),
    fontBody: `Lora, Georgia, "Times New Roman", serif`,
    fontHeading: `Lora, Georgia, "Times New Roman", serif`,
    radius: "3px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "0",
    headingCase: "none",
    measure: "48rem",
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
    palette: { paper: "#f6f7f9", ink: "#1e232b", accent: "#4b5d78", warm: "#85515c" },
    fontImport: googleFonts(
      "family=Playfair+Display:wght@700;900&family=Inter:wght@400;600",
    ),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `"Playfair Display", Georgia, serif`,
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "900",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "52rem",
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
`,
  },
  clinical: {
    scheme: "light",
    palette: { paper: "#f9fbfb", ink: "#1f2d33", accent: "#3f7c86", warm: "#96614a" },
    fontImport: googleFonts("family=IBM+Plex+Sans:wght@400;500;600;700"),
    fontBody: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    fontHeading: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    radius: "4px",
    borderWidth: "1px",
    headingWeight: "600",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "56rem",
    extraCss: `
/* A data theme: the table and the stat tile are the primary devices. */
h2 { color: var(--fm-accent-text); }
thead th { background: var(--fm-accent); color: var(--fm-accent-ground-ink); border-bottom: none; }
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
    palette: { paper: "#fbf9f5", ink: "#262421", accent: "#b0774d", warm: "#7f4347" },
    fontImport: googleFonts(
      "family=IBM+Plex+Serif:wght@400;600;700&family=IBM+Plex+Sans:wght@400;600",
    ),
    fontBody: `"IBM Plex Serif", Georgia, serif`,
    fontHeading: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "700",
    headingTracking: "-0.02em",
    headingCase: "none",
    measure: "50rem",
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
`,
  },
  swiss: {
    scheme: "light",
    palette: { paper: "#f9f9f9", ink: "#141414", accent: "#b5493e", warm: "#652e25" },
    fontImport: googleFonts("family=Inter:wght@400;500;700;900"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    radius: "0px",
    borderWidth: "2px",
    headingWeight: "900",
    headingTracking: "-0.03em",
    headingCase: "uppercase",
    measure: "54rem",
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
`,
  },
  monochrome: {
    scheme: "light",
    palette: { paper: "#f4f4f2", ink: "#262626", accent: "#5c5c5a", warm: "#7e6758" },
    fontImport: googleFonts("family=Inter:wght@400;600;800"),
    fontBody: `Inter, ${SYSTEM_SANS}`,
    fontHeading: `Inter, ${SYSTEM_SANS}`,
    radius: "2px",
    borderWidth: "1px",
    headingWeight: "800",
    headingTracking: "-0.02em",
    headingCase: "none",
    measure: "52rem",
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
`,
  },
  bauhaus: {
    scheme: "light",
    palette: { paper: "#f3efe6", ink: "#1c1c1c", accent: "#b6433a", warm: "#6b2b24" },
    fontImport: googleFonts(
      "family=Archivo:wght@700;900&family=Space+Grotesk:wght@400;500;700",
    ),
    fontBody: `"Space Grotesk", ${SYSTEM_SANS}`,
    fontHeading: `Archivo, ${SYSTEM_SANS}`,
    radius: "0px",
    borderWidth: "3px",
    headingWeight: "900",
    headingTracking: "-0.02em",
    headingCase: "uppercase",
    measure: "54rem",
    extraCss: `
h1 { font-size: 2.8em; line-height: 0.95; }
h2 { color: var(--fm-ink); }
.fm-band { border-block: 5px solid var(--fm-ink); }
.fm-stat__value { font-family: var(--fm-font-heading); }
/* Primary blocks, circles and heavy rules — the shapes are the design. */
.fm-stat { border: 3px solid var(--fm-ink); border-top-width: 10px; border-radius: 0; }
.fm-figure { border: 3px solid var(--fm-ink); padding: 1em; }
.fm-figure__caption { font-family: var(--fm-font-heading); text-transform: uppercase; letter-spacing: 0.06em; }
.fm-callout { border: 3px solid var(--fm-ink); border-left-width: 10px; border-radius: 0; }
.fm-quote { border: 3px solid var(--fm-ink); border-left: 10px solid var(--fm-accent); padding: 1em 1.2em; color: var(--fm-ink); }
.fm-steps { border-width: 3px; }
.fm-steps > * { border-bottom-width: 3px; padding-left: 4.4em; }
.fm-steps > *::before { background: var(--fm-accent); color: var(--fm-accent-ground-ink); border-radius: 999px; width: 2em; height: 2em; display: grid; place-items: center; left: 1em; top: 0.85em; }
thead th { background: var(--fm-accent); color: var(--fm-accent-ground-ink); }
th, td { border: 2px solid var(--fm-ink); }
`,
  },
  broadsheet: {
    scheme: "light",
    palette: { paper: "#f7f4ee", ink: "#1c1c1c", accent: "#6e3b36", warm: "#9b684b" },
    fontImport: googleFonts(
      "family=Playfair+Display:wght@700;900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600",
    ),
    fontBody: `"Source Serif 4", Georgia, serif`,
    fontHeading: `"Playfair Display", Georgia, serif`,
    radius: "0px",
    borderWidth: "1px",
    headingWeight: "900",
    headingTracking: "-0.01em",
    headingCase: "none",
    measure: "52rem",
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
`,
  },
};

// Colour-only skin taken from a custom report_styles row (its reference_css
// targets AI-generated class names, not fm-*, so only the palette transfers).
// sRGB mix of two #rrggbb colours, `t` of the way from a to b; a itself when
// either is not a 6-digit hex (a custom page may be any CSS colour).
export function mixFastrColor(a: string, b: string, t: number): string {
  return mixHex(a, b, t) ?? a;
}

// WCAG relative luminance of a #rrggbb colour; undefined otherwise.
export function hexLuminance(v: string): number | undefined {
  const c = parseHex6(v);
  if (!c) return undefined;
  const ch = (n: number) => {
    const x = n / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}

// The hue a caution tier reads as, and the theme's own gold at it: the warm
// pole's chroma and lightness carried to that hue, so Monochrome's warning is
// a whisper of gold and Bauhaus's is a real yellow. A warm pole that is
// already golden (Broadsheet's sepia) would collide, so the gold steps
// lighter to stay a tier of its own.
const CAUTION_HUE = 45;

// Every colour the stylesheet reads, from the five. `scheme` says which way
// the tints run: toward the paper is toward light on a light theme and
// toward dark on a dark one, which is what each derived role wants.
export function deriveFastrThemeColors(
  p: FastrThemePalette,
  scheme: FastrColorScheme,
): FastrDerivedColors {
  const mix = mixFastrColor;
  const light = scheme === "light";
  const lum = (c: string) => hexLuminance(c) ?? (light ? 0 : 1);
  const paperLum = hexLuminance(p.paper) ?? (light ? 1 : 0);
  const inkLum = hexLuminance(p.ink) ?? (light ? 0 : 1);
  // Text on a colour: the paper or the ink, whichever stands further from it.
  const on = (c: string) => Math.abs(lum(c) - paperLum) >= Math.abs(lum(c) - inkLum) ? p.paper : p.ink;
  // The caution tier is the theme's GOLD, no longer the mix of the other two.
  // A mix only made an amber while the pair WAS a red and a green; now that
  // they are the theme's poles it lands wherever the arithmetic falls, a grey
  // for one theme and a magenta for the next. Amber is what a middle light
  // reads as, so warn is built at the caution hue out of the warm pole's own
  // chroma and lightness (the theme's gold, not a stock one) and is lifted
  // clear of that pole when the theme's warm is itself golden.
  const warn = cautionGold(p.warm, p.accent);
  const semantic: FastrThemeSemantic = { info: p.accent, success: p.accent, warning: warn, danger: p.warm };
  const faded: FastrThemeSemantic = {
    info: mix(semantic.info, p.paper, 0.45),
    success: mix(semantic.success, p.paper, 0.45),
    warning: mix(semantic.warning, p.paper, 0.45),
    danger: mix(semantic.danger, p.paper, 0.45),
  };
  return {
    page: p.paper,
    surface: mix(p.paper, p.ink, 0.04),
    surfaceAlt: mix(p.paper, p.ink, 0.08),
    ink: p.ink,
    inkMuted: mix(p.ink, p.paper, 0.38),
    accent: p.accent,
    border: mix(p.paper, p.ink, 0.18),
    grounds: {
      paper: { color: mix(p.paper, p.ink, 0.08), ink: p.ink },
      ink: { color: p.ink, ink: p.paper },
      accent: { color: p.accent, ink: on(p.accent) },
      warm: { color: p.warm, ink: on(p.warm) },
    },
    semantic,
    semanticOnDark: light ? faded : semantic,
    semanticOnLight: light ? semantic : faded,
    lightInk: paperLum >= inkLum ? p.paper : p.ink,
    darkInk: paperLum >= inkLum ? p.ink : p.paper,
    chart: {
      // Two hues, so the cycle is built from their shades and tints: the
      // third series colour used to be the cool pole and is now the gold the
      // caution tier already uses, which keeps six distinct colours without a
      // fifth palette entry.
      series: [
        p.accent,
        p.warm,
        warn,
        mix(p.accent, p.ink, 0.5),
        mix(p.accent, p.paper, 0.45),
        mix(p.warm, p.paper, 0.45),
        mix(p.warm, p.ink, 0.45),
      ],
      neutral: mix(p.ink, p.paper, 0.38),
      good: p.accent,
      bad: p.warm,
      warn,
      ramp: light
        ? [mix(p.accent, p.paper, 0.55), mix(p.accent, p.ink, 0.45)]
        : [mix(p.accent, p.paper, 0.6), p.accent],
    },
  };
}

export const FASTR_THEME_TOKENS: Record<FastrReportTheme, FastrThemeTokens> = Object.fromEntries(
  (Object.keys(FASTR_THEME_SPECS) as FastrReportTheme[]).map((name) => {
    const spec = FASTR_THEME_SPECS[name];
    return [name, { ...spec, ...deriveFastrThemeColors(spec.palette, spec.scheme) }];
  }),
) as Record<FastrReportTheme, FastrThemeTokens>;

export type FastrThemeColorOverride = {
  page: string;
  ink: string;
  accent: string;
};

export function isFastrReportTheme(v: unknown): v is FastrReportTheme {
  return typeof v === "string" &&
    (FASTR_REPORT_THEMES as readonly string[]).includes(v);
}

// What a report hands every figure it embeds (see getStandardSeriesColorFunc
// and the special-chart builders): the theme's chart colours plus the two a
// coverage chart needs, derived from the page the figure actually sits on.
export type FastrChartPalette = FastrThemeChart & {
  // The principal (observed) series line: the document's ink, so it reads on
  // a dark page where the dashboard's black would vanish.
  strong: string;
  // The de-emphasised series behind it: the neutral faded toward the page.
  faint: string;
  // Cell grounds for conditional formatting's traffic lights: good, warn and
  // bad each faded 60% toward the page — the same tint the stock pastels are
  // of the app's red, amber and green — so dark text still reads on them and
  // a table's cells sit on the page rather than glowing off it. `none` is the
  // page itself, for the no-data cell that stock CF paints white.
  cells: { good: string; warn: string; bad: string; none: string };
};

export function fastrChartPalette(
  theme: FastrReportTheme,
  // A creation-time style's colours: its accent leads the series cycle, its
  // ink and page tune the derived pair. Any subset may be given.
  colors?: { accent?: string; page?: string; ink?: string } | null,
): FastrChartPalette {
  const tokens = FASTR_THEME_TOKENS[theme] ?? FASTR_THEME_TOKENS.default;
  const chart = tokens.chart;
  const accent = colors?.accent?.toLowerCase();
  const series = accent
    ? [accent, ...chart.series.filter((c) => c.toLowerCase() !== accent)]
    : chart.series;
  const page = colors?.page ?? tokens.page;
  const ink = colors?.ink ?? tokens.ink;
  const tint = (c: string) => mixHex(c, page, 0.6) ?? c;
  // The good news is the accent, so a custom style's accent carries it: the
  // page's own success colour is re-derived from that accent (derivedFor in
  // report_fastr_css), and a chart that kept the theme's would disagree with
  // the callout beside it. The bad news is the warm pole, which a custom
  // style does not name, so it stays the theme's.
  const good = accent ?? chart.good;
  return {
    ...chart,
    good,
    series,
    strong: ink,
    faint: tint(chart.neutral),
    cells: {
      good: tint(good),
      warn: tint(chart.warn),
      bad: tint(chart.bad),
      none: page,
    },
  };
}

function cautionGold(warm: string, accent: string): string {
  const hsl = hexToHsl(warm);
  if (!hsl) return warm;
  const [h, s, l] = hsl;
  const golden = (v: number) => {
    const dh = Math.abs(v - CAUTION_HUE);
    return Math.min(dh, 360 - dh) < 20;
  };
  // Clear of the warm pole first: Broadsheet's sepia is nearly this hue.
  let lightness = Math.min(0.56, l + (golden(h) ? 0.1 : 0.02));
  // Then clear of the accent, for a theme whose own colour is a gold
  // (Classic). The hue cannot give way here, the caution hue being the whole
  // point, so the gold steps DOWN into a bronze: type still reads on it,
  // which it would not on a paler gold.
  const a = hexToHsl(accent);
  if (a && golden(a[0]) && Math.abs(lightness - a[2]) < 0.12) {
    lightness = Math.max(0.24, a[2] - 0.14);
  }
  return hslToHex(CAUTION_HUE, s * 0.95, lightness);
}

// HSL of a #rrggbb colour as [hue 0-360, saturation 0-1, lightness 0-1];
// undefined when it is not a 6-digit hex.
function hexToHsl(v: string): [number, number, number] | undefined {
  const c = parseHex6(v);
  if (!c) return undefined;
  const [r, g, b] = c.map((n) => n / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  if (h < 0) h += 360;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const k = (n: number) => (n + h / 30) % 12;
  const ch = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [ch(0), ch(8), ch(4)]
    .map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

// sRGB mix of two #rrggbb colours, `t` of the way from a to b; undefined when
// either is not a 6-digit hex (a custom page may be any CSS colour).
function mixHex(a: string, b: string, t: number): string | undefined {
  const pa = parseHex6(a);
  const pb = parseHex6(b);
  if (!pa || !pb) return undefined;
  const ch = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return "#" + [ch(0), ch(1), ch(2)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function parseHex6(v: string): [number, number, number] | undefined {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
