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
    extraCss: "",
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
.fm-callout { border-left-width: 2px; }
.fm-card { box-shadow: none; }
h2 { padding-bottom: 0.3em; border-bottom: 1px solid var(--fm-border); }
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
.fm-card { box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
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
h2 { color: var(--fm-accent); }
.fm-stat__value { font-family: var(--fm-font-heading); }
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
.fm-quote { font-style: italic; }
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
table thead th { background: var(--fm-surface-alt); }
table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--fm-surface) 55%, transparent); }
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
h1 { border-top: 4px solid var(--fm-ink); border-bottom: 1px solid var(--fm-ink); padding: 0.35em 0; }
.fm-callout__title { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.78em; }
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
h1 { font-size: 3em; line-height: 0.95; }
.fm-card, .fm-callout { border-width: var(--fm-border-width); }
.fm-stat__value { font-size: 2.6em; letter-spacing: -0.04em; }
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
.fm-card, .fm-callout { border-style: dashed; }
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
h2 { text-align: center; }
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
h2 { text-align: center; border-bottom: 1px solid var(--fm-accent); padding-bottom: 0.3em; }
.fm-band { border-block: 1px solid var(--fm-accent); }
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
.fm-card, .fm-callout { border-radius: 0; }
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
.fm-card { box-shadow: 5px 5px 0 var(--fm-ink); }
.fm-callout { border-left-width: 8px; border-radius: 0; }
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
