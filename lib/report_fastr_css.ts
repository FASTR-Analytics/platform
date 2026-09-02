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

import { cssColorLuminance } from "./fastr_markdown_blocks.ts";
import {
  FASTR_SEMANTIC_COLORS,
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

// Callout kinds and stat deltas mean something, so they are not part of the
// palette — but a fixed light-page set is unreadable on a dark theme, and on a
// dark BAND inside a light theme. One block, emitted at the root from the
// theme's scheme and re-emitted by every rule that establishes a dark ground.
function semanticVarsCss(scheme: "light" | "dark"): string {
  const c = FASTR_SEMANTIC_COLORS[scheme];
  return `  --fm-info: ${c.info};
  --fm-success: ${c.success};
  --fm-warning: ${c.warning};
  --fm-danger: ${c.danger};`;
}

// Grounds that ARE a flat, saturated colour. A hue-named mark on one of them
// would be pale red on saturated red — so on these, a role mark returns to the
// ground's ink. Colour the text, not the panel: if the whole panel is already
// saying "danger", the phrase inside it has nothing left to add.
//
// `accent` and `muted` are deliberately NOT neutralised: their tokens
// (--fm-accent-text, --fm-ink-muted) are re-scoped correctly by every one of
// these grounds already, so they stay useful there.
const MARK_HUE_ROLES = ["danger", "warning", "success", "info"] as const;
const MARK_FLAT_GROUNDS = [
  "fm-tone--danger",
  "fm-tone--warning",
  "fm-tone--success",
  "fm-tone--info",
  "fm-tone--solid",
  "fm-card--accent",
];

function markOnFlatGroundCss(d: string): string {
  const rules = MARK_FLAT_GROUNDS.flatMap((ground) =>
    MARK_HUE_ROLES.map((role) => `${d}.${ground} .fm-mark--${role}`)
  );
  // Emitted AFTER the base rules, so equal specificity resolves our way.
  return `${rules.join(",\n")} { color: var(--fm-ink); }`;
}

// A semantic ground is the same strong colour in every theme: a danger tile is
// a saturated red panel whether the page is white or near-black, so it always
// takes the light-scheme value (all four are dark enough to carry white type)
// rather than flipping with the surrounding ground.
function semanticToneCss(
  d: string,
  name: "danger" | "warning" | "success" | "info",
): string {
  const bg = FASTR_SEMANTIC_COLORS.light[name];
  return `${d}.fm-tone.fm-tone--${name} {
  background: ${bg};
  --fm-ink: #ffffff;
  --fm-accent: #ffffff;
  --fm-accent-text: #ffffff;
  --fm-callout-color: #ffffff;
  --fm-ink-muted: rgba(255, 255, 255, 0.75);
  --fm-border: rgba(255, 255, 255, 0.3);
  --fm-surface: rgba(255, 255, 255, 0.12);
  --fm-surface-alt: rgba(255, 255, 255, 0.18);
${ON_DARK_GROUND}
  color: #ffffff;
}`;
}

const ON_DARK_GROUND = semanticVarsCss("dark");
const ON_LIGHT_GROUND = semanticVarsCss("light");

// An accent is a GROUND colour first; using it as TEXT only works when it
// separates from the surface it sits on. Brutalist's #ffff00 on a near-white
// stat tile is invisible — so the stat value and the default callout rule are
// painted with --fm-accent-text, which falls back to the ink when the accent
// cannot carry text. Computed rather than hand-judged per theme, so it also
// protects future themes and a custom style's colour override.
const MIN_TEXT_SEPARATION = 0.25;

function accentTextFor(accent: string, surface: string, ink: string): string {
  const a = cssColorLuminance(accent);
  const s = cssColorLuminance(surface);
  if (a === undefined || s === undefined) return accent;
  return Math.abs(a - s) < MIN_TEXT_SEPARATION ? ink : accent;
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
  const accentText = accentTextFor(accent, tokens.surfaceAlt, ink);
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
  --fm-tone-dark: ${tokens.toneDark};
  --fm-tone-dark-ink: ${tokens.toneDarkInk};
  --fm-solid-bg: ${accent};
  --fm-inverse-bg: ${ink};
  --fm-accent-text: ${accentText};
  --fm-mark-accent-weight: ${accentText === ink ? "700" : "inherit"};
${semanticVarsCss(tokens.scheme)}
}`;
}

export function buildFastrStructureCss(scope = ""): string {
  const { root, d } = selectors(scope);
  return `
${root} {
  background: var(--fm-page);
  color: var(--fm-ink);
  font-family: var(--fm-font-body);
  /* Full-bleed geometry, defined ONCE: a band cancels the centred column with
     a viewport-width negative margin, then insets its own content back to the
     measure. Print and the scoped picker tiles have no viewport to bleed into,
     so they neutralise the pair here rather than resetting each selector. */
  --fm-bleed-margin: calc(50% - 50vw);
  --fm-bleed-pad: max(1.5rem, calc((100vw - var(--fm-measure)) / 2 + 1.5rem));
  /* REPORT_BASE_CSS pads the page; a masthead cancels that padding to meet the
     top edge, which is what separates a title BLOCK from a large heading. */
  --fm-page-pad-top: 2.5rem;
}
/* The PAGE ground lives on <html>, not <body>: a full-bleed band is a body
   child that escapes the column with a viewport-width negative margin, and
   document-level settings (:::report) are applied to <html> so they cover the
   whole page rather than just the text column. overflow-x on the root absorbs
   the scrollbar width that 100vw would otherwise overflow by. */
${d}body { max-width: var(--fm-measure); background: transparent; }
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
${d}.fm-callout--note { --fm-callout-color: var(--fm-accent-text); }
${d}.fm-callout--info { --fm-callout-color: var(--fm-info); }
${d}.fm-callout--success { --fm-callout-color: var(--fm-success); }
${d}.fm-callout--warning { --fm-callout-color: var(--fm-warning); }
${d}.fm-callout--danger { --fm-callout-color: var(--fm-danger); }

/* ── Inline role marks — [fell 12 points]{.danger} ────────────────────────── */
/* The token is read HERE, on the span, never through a --fm-mark-* alias: a
   --fm-mark-danger: var(--fm-danger) declared on :root would substitute at
   computed-value time and inherit the SUBSTITUTED colour, so re-scoping
   --fm-danger inside a dark band would not move the mark. Reading it on the
   span means every ground rule that re-scopes the semantic tokens already
   works for marks, with no rule of its own. Doubled class for the same reason
   the tones double theirs — a theme's extraCss must not outrank a role. */
/* An accent mark must never be a no-op. In a theme whose accent cannot carry
   text on the page (Brutalist's yellow) or IS the ink (Minimal, Monochrome),
   --fm-accent-text degrades to ink by design — so those themes, and only
   those, mark the phrase with weight instead. */
${d}.fm-mark.fm-mark--accent {
  color: var(--fm-accent-text);
  font-weight: var(--fm-mark-accent-weight, inherit);
}
${d}.fm-mark.fm-mark--muted { color: var(--fm-ink-muted); }
${d}.fm-mark.fm-mark--danger { color: var(--fm-danger); }
${d}.fm-mark.fm-mark--warning { color: var(--fm-warning); }
${d}.fm-mark.fm-mark--success { color: var(--fm-success); }
${d}.fm-mark.fm-mark--info { color: var(--fm-info); }
${markOnFlatGroundCss(d)}

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
/* A grid has no padding, so a tone on the ROW would show only through the gaps.
   Give it room and the ground reads as a panel holding the tiles. */
${d}.fm-tiles.fm-tone, ${d}.fm-tiles.fm-has-bg,
${d}.fm-columns.fm-tone, ${d}.fm-columns.fm-has-bg {
  padding: 1.2em;
  border-radius: var(--fm-radius);
}
${d}.fm-card {
  background: var(--fm-surface);
  border: var(--fm-border-width) solid var(--fm-border);
  border-radius: var(--fm-radius);
  padding: 1em 1.1em;
}
${d}.fm-card > :last-child { margin-bottom: 0; }
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
  color: var(--fm-accent-text);
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
${d}.fm-stat__delta--up {
  color: var(--fm-success);
  background: color-mix(in srgb, var(--fm-success) 16%, transparent);
}
${d}.fm-stat__delta--down {
  color: var(--fm-danger);
  background: color-mix(in srgb, var(--fm-danger) 16%, transparent);
}
${d}.fm-stat__delta--flat {
  color: var(--fm-ink-muted);
  background: color-mix(in srgb, var(--fm-ink) 8%, transparent);
}

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

/* ── Tones: grounds by ROLE ───────────────────────────────────────────────── */
/* A tone re-scopes the ink TOKENS rather than setting color directly, so every
   descendant that reads --fm-ink (headings, muted labels, borders, rules)
   follows the ground automatically. That is also why a dark band re-inks its
   charts: the raster ground probe reads the computed background behind the
   figure, which these rules paint. */
/* The colour must be re-declared here, not just the token: an element inherits
   its parent's COMPUTED colour, which was resolved against the root ink before
   this block re-scoped --fm-ink. Headings re-resolve it (they set colour
   explicitly); paragraphs would otherwise stay dark on a dark band. */
/* Doubled for specificity, like the variants below: this rule re-declares the
   COLOUR (a child inherits its parent's computed colour, so re-scoping the ink
   token alone is not enough) and must outrank a theme's own element rules. */
${d}.fm-tone.fm-tone { background: var(--fm-surface); color: var(--fm-ink); }
${d}.fm-tone.fm-tone--muted { background: var(--fm-surface-alt); }
${d}.fm-tone.fm-tone--accent {
  background: color-mix(in srgb, var(--fm-accent) 12%, var(--fm-page));
}
${d}.fm-tone.fm-tone--solid {
  background: var(--fm-solid-bg);
  --fm-ink: var(--fm-accent-ink);
  --fm-ink-muted: color-mix(in srgb, var(--fm-accent-ink) 72%, transparent);
  --fm-border: color-mix(in srgb, var(--fm-accent-ink) 30%, transparent);
  --fm-accent: var(--fm-accent-ink);
  --fm-accent-text: var(--fm-accent-ink);
  --fm-callout-color: var(--fm-accent-ink);
  --fm-surface: color-mix(in srgb, var(--fm-accent-ink) 14%, transparent);
  --fm-surface-alt: color-mix(in srgb, var(--fm-accent-ink) 20%, transparent);
${ON_DARK_GROUND}
}
${d}.fm-tone.fm-tone--dark {
  background: var(--fm-tone-dark);
  --fm-ink: var(--fm-tone-dark-ink);
  --fm-accent: var(--fm-tone-dark-ink);
  --fm-accent-text: var(--fm-tone-dark-ink);
  --fm-callout-color: var(--fm-tone-dark-ink);
  --fm-ink-muted: color-mix(in srgb, var(--fm-tone-dark-ink) 70%, transparent);
  --fm-border: color-mix(in srgb, var(--fm-tone-dark-ink) 26%, transparent);
  --fm-surface: color-mix(in srgb, var(--fm-tone-dark-ink) 10%, transparent);
  --fm-surface-alt: color-mix(in srgb, var(--fm-tone-dark-ink) 16%, transparent);
${ON_DARK_GROUND}
}
/* Reads --fm-tone-dark and --fm-solid-bg, neither of which it redefines — see
   the structural test guarding that rule. */
${d}.fm-tone.fm-tone--gradient {
  background: linear-gradient(160deg, var(--fm-tone-dark), var(--fm-solid-bg));
  --fm-ink: var(--fm-tone-dark-ink);
  --fm-accent: var(--fm-tone-dark-ink);
  --fm-accent-text: var(--fm-tone-dark-ink);
  --fm-callout-color: var(--fm-tone-dark-ink);
  --fm-ink-muted: color-mix(in srgb, var(--fm-tone-dark-ink) 70%, transparent);
  --fm-border: color-mix(in srgb, var(--fm-tone-dark-ink) 26%, transparent);
  --fm-surface: color-mix(in srgb, var(--fm-tone-dark-ink) 10%, transparent);
  --fm-surface-alt: color-mix(in srgb, var(--fm-tone-dark-ink) 16%, transparent);
${ON_DARK_GROUND}
}
${d}.fm-tone.fm-tone--inverse {
  background: var(--fm-inverse-bg);
  --fm-ink: var(--fm-page);
  --fm-accent: var(--fm-page);
  --fm-accent-text: var(--fm-page);
  --fm-callout-color: var(--fm-page);
  --fm-ink-muted: color-mix(in srgb, var(--fm-page) 70%, transparent);
  --fm-border: color-mix(in srgb, var(--fm-page) 26%, transparent);
  --fm-surface: color-mix(in srgb, var(--fm-page) 10%, transparent);
  --fm-surface-alt: color-mix(in srgb, var(--fm-page) 16%, transparent);
${ON_DARK_GROUND}
}
${semanticToneCss(d, "danger")}
${semanticToneCss(d, "warning")}
${semanticToneCss(d, "success")}
${semanticToneCss(d, "info")}
/* A theme may paint a heading WITH the accent (a highlighter mark). On a ground
   that is already the accent, that renders the heading invisible — so any
   accent ground clears it. Discovered as a blank yellow cover. */
${d}.fm-tone--solid h1, ${d}.fm-tone--solid h2, ${d}.fm-tone--solid h3,
${d}.fm-tone--danger h1, ${d}.fm-tone--warning h1, ${d}.fm-tone--success h1,
${d}.fm-tone--info h1,
${d}.fm-card--accent h1, ${d}.fm-card--accent h2, ${d}.fm-card--accent h3 {
  background: none;
  padding-inline: 0;
}
/* The historical card flag is the old spelling of tone=solid. */
${d}.fm-card--accent {
  background: var(--fm-solid-bg);
  border-color: var(--fm-solid-bg);
  --fm-ink: var(--fm-accent-ink);
  --fm-ink-muted: color-mix(in srgb, var(--fm-accent-ink) 72%, transparent);
  --fm-accent: var(--fm-accent-ink);
  --fm-accent-text: var(--fm-accent-ink);
  --fm-accent-text: var(--fm-accent-ink);
  --fm-callout-color: var(--fm-accent-ink);
  color: var(--fm-accent-ink);
${ON_DARK_GROUND}
}
${d}.fm-card--accent .fm-card__title,
${d}.fm-card--accent a { color: var(--fm-accent-ink); }

/* ── Literal ink (a bg colour's luminance decides it when not given) ──────── */
${d}.fm-ink--light {
  --fm-ink: #ffffff;
  --fm-accent: #ffffff;
  --fm-accent-text: #ffffff;
  --fm-callout-color: #ffffff;
  --fm-ink-muted: rgba(255, 255, 255, 0.72);
  --fm-border: rgba(255, 255, 255, 0.26);
  --fm-surface: rgba(255, 255, 255, 0.10);
  --fm-surface-alt: rgba(255, 255, 255, 0.16);
  color: #ffffff;
${ON_DARK_GROUND}
}
${d}.fm-ink--dark {
  --fm-ink: #111111;
  --fm-accent: #111111;
  --fm-accent-text: #111111;
  --fm-callout-color: #111111;
  --fm-ink-muted: rgba(17, 17, 17, 0.68);
  --fm-border: rgba(17, 17, 17, 0.22);
  --fm-surface: rgba(17, 17, 17, 0.05);
  --fm-surface-alt: rgba(17, 17, 17, 0.09);
  color: #111111;
${ON_LIGHT_GROUND}
}

/* ── Full-bleed sections ──────────────────────────────────────────────────── */
/* The band spans the viewport (its own margins cancel the centred column) and
   then insets its CONTENT back to the column, so text stays aligned with the
   rest of the document while the ground runs edge to edge. */
${d}.fm-band {
  display: block;
  margin: 2.5em var(--fm-bleed-margin);
  padding: 2.5em var(--fm-bleed-pad);
}
${d}.fm-band > :first-child { margin-top: 0; }
/* A ticker strip under a masthead is one device, not two: consecutive bands
   sit flush rather than showing the page between them. */
${d}.fm-band + .fm-band { margin-top: 0; }
${d}.fm-band > :last-child { margin-bottom: 0; }
${d}.fm-cover {
  min-height: min(72vh, 34rem);
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin-top: -2.5rem;
  break-after: page;
}
${d}.fm-cover h1 { font-size: 3em; }
/* Masthead lines: the kicker sits above the title, the dek below a rule. */
${d}.fm-kicker {
  font-family: var(--fm-font-heading);
  font-size: 0.75em;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--fm-ink-muted);
  margin-bottom: 0.9em;
}
${d}.fm-dek {
  margin-top: 1em;
  padding-top: 0.7em;
  border-top: var(--fm-border-width) solid currentColor;
  font-size: 0.95em;
  font-weight: 700;
}

/* ── Steps: a numbered process list ───────────────────────────────────────── */
/* The numbers are a CSS counter, so the author writes plain paragraphs and
   never renumbers by hand when a step is inserted. */
${d}.fm-steps {
  counter-reset: fm-step;
  margin: 1.6em 0;
  border: var(--fm-border-width) solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-surface);
}
${d}.fm-steps > * {
  counter-increment: fm-step;
  position: relative;
  margin: 0;
  padding: 1em 1.2em 1em 4.2em;
  border-bottom: 1px solid var(--fm-border);
}
${d}.fm-steps > :last-child { border-bottom: none; }
${d}.fm-steps > *::before {
  content: counter(fm-step, decimal-leading-zero);
  position: absolute;
  left: 1.2em;
  top: 1em;
  font-family: var(--fm-font-heading);
  font-weight: 700;
  font-size: 0.85em;
  line-height: 1.5;
  color: var(--fm-accent-text);
}

/* ── Masthead ─────────────────────────────────────────────────────────────── */
/* An author who simply writes a top-level heading should still get a title
   block, so the document's OPENING h1 is treated as a masthead. A cover block
   puts its h1 inside the section, so the two can never both apply. Themes that
   want a full-bleed block promote it with the bleed properties; the shared rule
   only gives it room and a rule beneath. */
${d}body > h1:first-child {
  margin-top: 0;
  margin-bottom: 1em;
  padding-bottom: 0.4em;
  border-bottom: var(--fm-border-width) solid var(--fm-border);
}
${d}body > h1:first-child + p { font-size: 1.05em; }

/* ── Image backgrounds (resolved from the image registry at render time) ──── */
${d}.fm-has-bgimage {
  position: relative;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  isolation: isolate;
}
${d}.fm-has-bgimage > * { position: relative; z-index: 1; }
${d}.fm-overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}
${d}.fm-overlay--dark::before { background: rgba(0, 0, 0, 0.55); }
${d}.fm-overlay--light::before { background: rgba(255, 255, 255, 0.72); }

/* ── Figure widths ────────────────────────────────────────────────────────── */
${d}.fm-figure--wide {
  margin-inline: max(-4rem, calc((100% - 100vw) / 2 + 1.5rem));
}
${d}.fm-figure--full {
  margin: 2em var(--fm-bleed-margin);
}
${d}.fm-figure--full .fm-figure__caption {
  padding-inline: var(--fm-bleed-pad);
}

/* ── Document header (:::report) — applied to <html> ──────────────────────── */
${d}.fm-doc--wide { --fm-measure: 74rem; }
${d}.fm-doc--full { --fm-measure: 100rem; }
${scope === "" ? "" : `
/* Scoped context (a picker tile): the viewport is not the page, so nothing may
   bleed to it — the geometry is neutralised at the root and every band, cover
   and full-width figure follows. */
${scope} { --fm-bleed-margin: 0; --fm-bleed-pad: 1.4em; }
${d}.fm-cover { min-height: 0; }
${d}.fm-figure--wide { margin-inline: 0; }
`}
`;
}

// Narrow panes (the split-view preview) and print both need the grids to
// collapse; scoped tiles keep their layout at any size.
// Only for a real document: a band's 100vw would otherwise overflow by the
// scrollbar width, and the page ground has to reach past the text column.
const DOCUMENT_ROOT_CSS = `
html { overflow-x: hidden; }
`;

const RESPONSIVE_CSS = `
@media (max-width: 640px) {
  .fm-tiles, .fm-columns { grid-template-columns: minmax(0, 1fr) !important; }
  .fm-col--span2, .fm-col--span3, .fm-col--span4 { grid-column: auto; }
  .fm-figure--wide { margin-inline: 0; }
}
@media print {
  .fm-card, .fm-callout, .fm-stat, .fm-figure { break-inside: avoid; }
  /* The print box has no viewport to bleed into; keep bands on the page. */
  :root { --fm-bleed-margin: 0; --fm-bleed-pad: 1.5rem; --fm-page-pad-top: 0rem; }
  .fm-cover { min-height: 0; padding-block: 6em; }
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
    // one selector-list per line, which keeps this rewrite honest. The class
    // excludes a NEWLINE as well as a brace: `[^{]` matches newlines, so a
    // comment line swallowed the selector on the line after it and left that
    // rule unscoped — caught by the leak test, invisible in the output.
    : tokens.extraCss.replace(/^([^@\s][^{\n]*)\{/gm, (_m, sel: string) =>
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
    scope === "" ? DOCUMENT_ROOT_CSS : "",
    scope === "" ? RESPONSIVE_CSS : "",
  ].filter((s) => s.trim().length > 0).join("\n");
}

// ── Live-preview editor surface ──────────────────────────────────────────────
// Edit mode paints the EDITOR as the themed document page. The widgets inside
// it are styled by the scoped structure sheet (buildFastrReportCss with the
// same scope); this builder covers the part that sheet cannot reach — the
// editor's own text, which CodeMirror renders as .cm-line divs rather than
// semantic elements. The conceal layer tags lines and spans with cm-fm-*
// classes, and these rules map the theme's tokens onto them, mirroring the
// structure sheet's heading scale so a heading in Edit is the size it will
// print at. Values are token references, so a theme switch re-renders one
// style element and never touches the editor.
export function buildFastrEditorSurfaceCss(scope: string): string {
  const d = `${scope} `;
  const headings = [
    { cls: "cm-fm-h1", size: "2.15em" },
    { cls: "cm-fm-h2", size: "1.55em" },
    { cls: "cm-fm-h3", size: "1.2em" },
    { cls: "cm-fm-h4", size: "1em" },
    { cls: "cm-fm-h5", size: "1em" },
    { cls: "cm-fm-h6", size: "1em" },
  ].map(({ cls, size }) =>
    `${d}.${cls} {
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  letter-spacing: var(--fm-heading-tracking);
  text-transform: var(--fm-heading-case);
  font-size: ${size};
  line-height: 1.3;
}`
  ).join("\n");
  return `${headings}
${d}.cm-fm-code {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  background: var(--fm-surface-alt);
  border-radius: var(--fm-radius);
  padding: 0.05em 0.3em;
}
${d}.cm-fm-link {
  color: var(--fm-accent-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
${d}.cm-fm-bullet { color: var(--fm-accent-text); }
/* The document is the ground; the code-editor affordances step back. */
${d}.cm-cursor, ${d}.cm-dropCursor { border-left-color: var(--fm-ink); }
${d}.cm-activeLine { background: transparent; }
${d}.cm-content ::selection { background: color-mix(in srgb, var(--fm-accent) 25%, transparent); }
${d}.cm-selectionBackground { background: color-mix(in srgb, var(--fm-accent) 25%, transparent) !important; }`;
}
