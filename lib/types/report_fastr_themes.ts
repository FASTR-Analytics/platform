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
] as const;
export type FastrReportTheme = (typeof FASTR_REPORT_THEMES)[number];

export type FastrThemeTokens = {
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
    extraCss: "",
  },
  minimal: {
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
    extraCss: `
.fm-callout { border-left-width: 2px; }
.fm-card { box-shadow: none; }
h2 { padding-bottom: 0.3em; border-bottom: 1px solid var(--fm-border); }
`,
  },
  corporate: {
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
    extraCss: `
h1 { border-bottom: 3px solid var(--fm-accent); padding-bottom: 0.25em; }
.fm-card { box-shadow: 0 1px 3px rgba(18, 35, 59, 0.08); }
`,
  },
  ministry: {
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
    extraCss: `
h1 { text-align: center; }
h2 { color: var(--fm-accent); }
.fm-stat__value { font-family: var(--fm-font-heading); }
`,
  },
  classic: {
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
    extraCss: `
body { line-height: 1.7; }
.fm-quote { font-style: italic; }
`,
  },
  executive: {
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
    extraCss: `
h1 { font-size: 2.6em; }
h2 { border-bottom: 1px solid var(--fm-accent); padding-bottom: 0.2em; }
.fm-stat__value { font-family: var(--fm-font-heading); }
`,
  },
  clinical: {
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
    extraCss: `
table thead th { background: var(--fm-surface-alt); }
table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--fm-surface) 55%, transparent); }
`,
  },
  editorial: {
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
    extraCss: `
h1 { border-top: 4px solid var(--fm-ink); border-bottom: 1px solid var(--fm-ink); padding: 0.35em 0; }
.fm-callout__title { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.78em; }
`,
  },
  swiss: {
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
    extraCss: `
h1 { font-size: 3em; line-height: 0.95; }
.fm-card, .fm-callout { border-width: var(--fm-border-width); }
.fm-stat__value { font-size: 2.6em; letter-spacing: -0.04em; }
`,
  },
  monochrome: {
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
    extraCss: `
.fm-callout { background: var(--fm-surface); border-left-color: var(--fm-ink); }
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
