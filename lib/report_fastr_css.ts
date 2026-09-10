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
  FASTR_GROUNDS,
  type FastrGround,
  deriveFastrThemeColors,
  FASTR_THEME_TOKENS,
  type FastrDerivedColors,
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
// The four status roles point at the set for a ground of the given
// darkness: the theme emits both sets (--fm-<role>-light, --fm-<role>-dark,
// see buildFastrThemeVarsCss), the page reads its own, and every rule that
// changes a ground's darkness re-points them (ON_DARK_GROUND, ON_LIGHT_GROUND).
const SEMANTIC_ROLES = ["info", "success", "warning", "danger"] as const;
function semanticVarsCss(ground: "light" | "dark"): string {
  return SEMANTIC_ROLES.map((r) => `  --fm-${r}: var(--fm-${r}-${ground});`).join("\n");
}

// Grounds that ARE one of the theme's three hues. A hue-named mark on one of
// them would be pale red on red, so on these a role mark returns to the
// ground's ink. Colour the text, not the panel: if the whole panel is already
// saying "danger", the phrase inside it has nothing left to add.
//
// `accent` and `muted` are deliberately NOT neutralised: their tokens
// (--fm-accent-text, --fm-ink-muted) are re-scoped correctly by every one of
// these grounds already, so they stay useful there.
const MARK_HUE_ROLES = ["danger", "warning", "success", "info"] as const;
const MARK_FLAT_GROUNDS = ["fm-tone--accent", "fm-tone--warm", "fm-tone--cool"];

function markOnFlatGroundCss(d: string): string {
  const rules = MARK_FLAT_GROUNDS.flatMap((ground) =>
    MARK_HUE_ROLES.map((role) => `${d}.${ground} .fm-mark--${role}`)
  );
  // Emitted AFTER the base rules, so equal specificity resolves our way.
  return `${rules.join(",\n")} { color: var(--fm-ink); }`;
}

const ON_DARK_GROUND = semanticVarsCss("dark");
const ON_LIGHT_GROUND = semanticVarsCss("light");

// One tone: a palette colour as a panel (--fm-<tone>-ground) with the paper
// or the ink as its type, whichever stands further from it
// (--fm-<tone>-ground-ink): white on a light theme's brick, the dark paper on
// a dark theme's light coral. The rule paints the ground AND re-scopes the
// ink tokens, so descendants follow; muted ink, rules and surfaces are that
// ink at an opacity, which reads on any ground. Inside a coloured ground the
// accent is the ground's ink too (an accent on the accent has nothing left to
// add); the paper ground is the page again, so its accent returns. Doubled
// class for specificity: it must outrank a theme's own element rules.
function toneRuleCss(
  d: string,
  tone: FastrGround,
  onPaper: { accent: string; accentText: string } | undefined,
  dark: boolean,
): string {
  const ink = `var(--fm-${tone}-ground-ink)`;
  const accent = onPaper?.accent ?? ink;
  const accentText = onPaper?.accentText ?? ink;
  return `${d}.fm-tone.fm-tone--${tone} {
  background: var(--fm-${tone}-ground);
  --fm-ink: ${ink};
  --fm-accent: ${accent};
  --fm-accent-text: ${accentText};
  --fm-callout-color: ${accent};
  --fm-ink-muted: color-mix(in srgb, ${ink} 72%, transparent);
  --fm-border: color-mix(in srgb, ${ink} 26%, transparent);
  --fm-surface: color-mix(in srgb, ${ink} 10%, transparent);
  --fm-surface-alt: color-mix(in srgb, ${ink} 16%, transparent);
${dark ? ON_DARK_GROUND : ON_LIGHT_GROUND}
  color: ${ink};
}`;
}

// The five tone rules, emitted PER THEME rather than with the structure:
// which status set reads inside a ground depends on how dark the theme
// paints it (the ink ground is dark on a light theme and light on a dark
// one), and only the theme knows. Emitted after the structure so a tone
// outranks the block grounds it overrides.
export function buildFastrToneCss(
  tokens: FastrThemeTokens,
  scope = "",
  colors?: FastrThemeColorOverride,
): string {
  const { d } = selectors(scope);
  const c = derivedFor(tokens, colors);
  const accentText = accentTextFor(c.accent, c.surfaceAlt, c.ink);
  return FASTR_GROUNDS.map((tone) =>
    toneRuleCss(
      d,
      tone,
      tone === "paper" ? { accent: "var(--fm-accent-ground)", accentText } : undefined,
      c.grounds[tone].ink === c.lightInk,
    )
  ).join("\n");
}

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

// The derived set a custom style's colours give: the three overrides take
// the place of the theme's paper, ink and accent and everything is mixed
// again from the five (so a dark custom page gets a light muted ink and dark
// surfaces, not the light theme's). A colour that is not a 6-digit hex
// cannot be mixed: then only the three vars change and the theme's derived
// colours stand, as before.
const HEX6 = /^#[0-9a-f]{6}$/i;
function derivedFor(
  tokens: FastrThemeTokens,
  colors?: FastrThemeColorOverride,
): FastrDerivedColors & { scheme: "light" | "dark" } {
  if (!colors) return tokens;
  if ([colors.page, colors.ink, colors.accent].every((c) => HEX6.test(c))) {
    const lum = cssColorLuminance(colors.page);
    const scheme = lum !== undefined && lum < 0.5 ? "dark" : "light";
    return {
      ...deriveFastrThemeColors(
        { ...tokens.palette, paper: colors.page, ink: colors.ink, accent: colors.accent },
        scheme,
      ),
      scheme,
    };
  }
  return { ...tokens, page: colors.page, ink: colors.ink, accent: colors.accent };
}

export function buildFastrThemeVarsCss(
  tokens: FastrThemeTokens,
  scope = "",
  colors?: FastrThemeColorOverride,
): string {
  const { vars } = selectors(scope);
  const c = derivedFor(tokens, colors);
  const { page, ink, accent } = c;
  const accentText = accentTextFor(accent, c.surfaceAlt, ink);
  const roles = SEMANTIC_ROLES.map((r) =>
    `  --fm-${r}-light: ${c.semanticOnLight[r]};
  --fm-${r}-dark: ${c.semanticOnDark[r]};`
  ).join("\n");
  // The five tones' panels and their type. Unlike --fm-ink and --fm-accent,
  // which are the CURRENT ink and accent inside whatever ground, these never
  // re-scope, so a rule can name the accent ground from inside an ink band.
  const grounds = FASTR_GROUNDS.map((g) =>
    `  --fm-${g}-ground: ${c.grounds[g].color};
  --fm-${g}-ground-ink: ${c.grounds[g].ink};`
  ).join("\n");
  return `${vars} {
  --fm-page: ${page};
  --fm-paper: ${page};
  --fm-warm: ${tokens.palette.warm};
  --fm-cool: ${tokens.palette.cool};
  --fm-light-ink: ${c.lightInk};
  --fm-dark-ink: ${c.darkInk};
  --fm-surface: ${c.surface};
  --fm-surface-alt: ${c.surfaceAlt};
  --fm-ink: ${ink};
  --fm-ink-muted: ${c.inkMuted};
  --fm-accent: ${accent};
  --fm-border: ${c.border};
  --fm-radius: ${tokens.radius};
  --fm-border-width: ${tokens.borderWidth};
  --fm-font-body: ${tokens.fontBody};
  --fm-font-heading: ${tokens.fontHeading};
  --fm-heading-weight: ${tokens.headingWeight};
  --fm-heading-tracking: ${tokens.headingTracking};
  --fm-heading-case: ${tokens.headingCase};
  --fm-measure: ${tokens.measure};
  --fm-callout-color: ${accent};
${grounds}
  --fm-accent-text: ${accentText};
  --fm-mark-accent-weight: ${accentText === ink ? "700" : "inherit"};
${roles}
${semanticVarsCss(c.scheme)}
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
/* A blank source line beyond the paragraph separator (report_fastr_markdown's
   fm_spaces): one line of the body's height, empty, exactly the height the
   editor gives that line, so Enter moves the page the same way on both. */
${d}.fm-space { height: 1lh; margin: 0; }
${d}a { color: var(--fm-accent); }
${d}strong { font-weight: 700; }
${d}ul, ${d}ol { margin: 0 0 1em; --fm-mt: 0px; --fm-mb: 1em; padding-left: 1.4em; }
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
${d}table { width: 100%; margin: 0 0 1.4em; --fm-mt: 0px; --fm-mb: 1.4em; font-size: 0.94em; }
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
  --fm-mt: 1.4em;
  --fm-mb: 1.4em;
  padding: 0.2em 0 0.2em 1.1em;
  border-left: 3px solid var(--fm-border);
  color: var(--fm-ink-muted);
}

/* ── Figures (an embed on its own line becomes a captioned figure) ────────── */
${d}.fm-figure { margin: 1.6em 0; --fm-mt: 1.6em; --fm-mb: 1.6em; }
/* A figure is capped at a share of the page's content area (--fm-page-area,
   set by the paged sheet and by the editor's page boxes; a browser window
   falls back to its own height): a tall chart at full column width used to
   take two thirds of a page, so it could only ever sit alone with its
   heading and the page above it was left half empty. Capped, it narrows and
   centres, and two figures or a figure and its prose share a page. */
${d}.fm-figure img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: calc(var(--fm-page-area, 100vh) * 0.42);
  margin-inline: auto;
}
/* The editor's stand-in while a figure renders (report_html.ts): the same
   cap, so the page flow does not move when the raster replaces it. */
${d}.fm-figure .report-embed-pending { max-height: calc(var(--fm-page-area, 100vh) * 0.42); }
${d}.fm-figure__caption {
  margin-top: 0.5em;
  font-size: 0.85em;
  color: var(--fm-ink-muted);
  line-height: 1.4;
}

/* ── Callouts ─────────────────────────────────────────────────────────────── */
${d}.fm-callout {
  margin: 1.5em 0;
  --fm-mt: 1.5em;
  --fm-mb: 1.5em;
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
${d}.fm-mark.fm-mark--hl { padding: 0.05em 0.2em; border-radius: 3px; }
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
  --fm-mt: 1.6em;
  --fm-mb: 1.6em;
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
  /* A card on its own in the flow keeps its distance like a callout; in a
     tiles grid the gap is the grid's. The editor shows a card as a widget
     with a blank line and 0.2em of box gap on each side, which is this. */
  margin: 1.2em 0;
  --fm-mt: 1.2em;
  --fm-mb: 1.2em;
  background: var(--fm-surface);
  border: var(--fm-border-width) solid var(--fm-border);
  border-radius: var(--fm-radius);
  padding: 1em 1.1em;
}
${d}.fm-tiles > .fm-card { margin: 0; }
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
  --fm-mt: 1.2em;
  --fm-mb: 1.2em;
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
  --fm-mt: 1.6em;
  --fm-mb: 1.6em;
  align-items: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
${d}.fm-columns--1 { grid-template-columns: minmax(0, 1fr); }
${d}.fm-columns--2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
${d}.fm-columns--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
${d}.fm-columns--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
${d}.fm-col > :last-child { margin-bottom: 0; }
/* A toned or painted column is a panel: text flush with a coloured edge reads
   as a mistake, so it takes the same inset a toned grid does, and its first
   block sits at the top of the panel rather than under its own margin. */
${d}.fm-col.fm-tone, ${d}.fm-col.fm-has-bg {
  padding: 1em 1.2em;
  border-radius: var(--fm-radius);
}
${d}.fm-col.fm-tone > :first-child, ${d}.fm-col.fm-has-bg > :first-child { margin-top: 0; }
${d}.fm-col--span2 { grid-column: span 2; }
${d}.fm-col--span3 { grid-column: span 3; }
${d}.fm-col--span4 { grid-column: span 4; }

/* ── Pull quote ───────────────────────────────────────────────────────────── */
${d}.fm-quote {
  margin: 1.8em 0;
  --fm-mt: 1.8em;
  --fm-mb: 1.8em;
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
${d}.fm-tone.fm-tone { background: var(--fm-paper-ground); color: var(--fm-ink); }
/* The tone rules themselves are per theme: buildFastrToneCss. */
/* A theme may paint a heading WITH the accent (a highlighter mark). On a ground
   that is already a hue, that renders the heading invisible or garish, so the
   three hue grounds clear it. Discovered as a blank yellow cover. */
${d}.fm-tone--accent h1, ${d}.fm-tone--accent h2, ${d}.fm-tone--accent h3,
${d}.fm-tone--warm h1, ${d}.fm-tone--warm h2, ${d}.fm-tone--warm h3,
${d}.fm-tone--cool h1, ${d}.fm-tone--cool h2, ${d}.fm-tone--cool h3 {
  background: none;
  padding-inline: 0;
}

/* ── Literal ink (a bg colour's luminance decides it when not given) ──────── */
${d}.fm-ink--light {
  --fm-ink: var(--fm-light-ink);
  --fm-accent: var(--fm-light-ink);
  --fm-accent-text: var(--fm-light-ink);
  --fm-callout-color: var(--fm-light-ink);
  --fm-ink-muted: color-mix(in srgb, var(--fm-light-ink) 72%, transparent);
  --fm-border: color-mix(in srgb, var(--fm-light-ink) 26%, transparent);
  --fm-surface: color-mix(in srgb, var(--fm-light-ink) 10%, transparent);
  --fm-surface-alt: color-mix(in srgb, var(--fm-light-ink) 16%, transparent);
  color: var(--fm-light-ink);
${ON_DARK_GROUND}
}
${d}.fm-ink--dark {
  --fm-ink: var(--fm-dark-ink);
  --fm-accent: var(--fm-dark-ink);
  --fm-accent-text: var(--fm-dark-ink);
  --fm-callout-color: var(--fm-dark-ink);
  --fm-ink-muted: color-mix(in srgb, var(--fm-dark-ink) 68%, transparent);
  --fm-border: color-mix(in srgb, var(--fm-dark-ink) 22%, transparent);
  --fm-surface: color-mix(in srgb, var(--fm-dark-ink) 5%, transparent);
  --fm-surface-alt: color-mix(in srgb, var(--fm-dark-ink) 9%, transparent);
  color: var(--fm-dark-ink);
${ON_LIGHT_GROUND}
}

/* ── Full-bleed sections ──────────────────────────────────────────────────── */
/* The band spans the viewport (its own margins cancel the centred column) and
   then insets its CONTENT back to the column, so text stays aligned with the
   rest of the document while the ground runs edge to edge. */
${d}.fm-band {
  display: block;
  margin: 2.5em var(--fm-bleed-margin);
  --fm-mt: 2.5em;
  --fm-mb: 2.5em;
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
}
/* fill=page: a title page of its own; the report continues on the next. */
${d}.fm-cover.fm-cover--fill { break-after: page; }
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

/* ── Cover layouts (layout=) ──────────────────────────────────────────────── */
/* The layout is the cover's COMPOSITION; the tone is its ground, so every
   layout works on every tone. Each keeps the masthead lines as DIRECT children
   of the cover (the editor's kicker/dek islands depend on that) and is written
   in em, so the Insert menu's thumbnails shrink it faithfully. Two classes
   outrank a theme's own .fm-cover { text-align } whatever the sheet order. */

${d}.fm-cover.fm-cover--poster h1, ${d}.fm-cover.fm-cover--spine h1,
${d}.fm-cover.fm-cover--split h1, ${d}.fm-cover.fm-cover--minimal h1,
${d}.fm-cover.fm-cover--block h1 { text-align: left; }
${d}.fm-cover.fm-cover--centered h1, ${d}.fm-cover.fm-cover--frame h1 {
  text-align: center;
}

/* Centred: everything on the axis; the sub's rule becomes a short centred bar. */
${d}.fm-cover.fm-cover--centered {
  align-items: center;
  text-align: center;
}
${d}.fm-cover.fm-cover--centered h1 { font-size: 3.6em; max-width: 14em; }
${d}.fm-cover.fm-cover--centered .fm-dek {
  border-top: none;
  padding-top: 0;
  max-width: 34em;
}
${d}.fm-cover.fm-cover--centered .fm-dek::before {
  content: "";
  display: block;
  width: 3em;
  height: 0.2em;
  margin: 0 auto 1em;
  background: currentColor;
}

/* Poster: an accent bar at the head, the title set huge and pushed to the foot. */
${d}.fm-cover.fm-cover--poster {
  justify-content: flex-end;
  text-align: left;
}
${d}.fm-cover.fm-cover--poster::before {
  content: "";
  display: block;
  width: 5em;
  height: 0.6em;
  margin-bottom: auto;
  background: var(--fm-accent);
}
${d}.fm-cover.fm-cover--poster h1 {
  font-size: 4.4em;
  line-height: 0.98;
  letter-spacing: -0.02em;
  max-width: 11em;
  margin-top: 0.4em;
}
${d}.fm-cover.fm-cover--poster .fm-dek { max-width: 40em; }

/* Spine: a bound edge — an accent rule down the whole left side, the text
   hanging off it. The rule sits OUTSIDE the column so the text stays aligned. */
${d}.fm-cover.fm-cover--spine {
  text-align: left;
  border-left: 0.6em solid var(--fm-accent);
  padding-left: calc(var(--fm-bleed-pad) - 0.6em);
}
${d}.fm-cover.fm-cover--spine .fm-kicker { color: var(--fm-accent-text); }
${d}.fm-cover.fm-cover--spine .fm-dek {
  border-top: none;
  padding-top: 0;
  border-left: 0.15em solid currentColor;
  padding-left: 1em;
  max-width: 36em;
}

/* Frame: a double hairline rule inset from the edges, the words centred in
   it — the printed report cover. The frame follows the theme's rule weight. */
${d}.fm-cover.fm-cover--frame {
  position: relative;
  align-items: center;
  text-align: center;
  padding-block: 4.5em;
}
${d}.fm-cover.fm-cover--frame::before {
  content: "";
  position: absolute;
  inset: 1.4em max(1.4em, calc(var(--fm-bleed-pad) - 1.6em));
  border: var(--fm-border-width) solid currentColor;
  outline: var(--fm-border-width) solid currentColor;
  outline-offset: 0.35em;
  pointer-events: none;
}
${d}.fm-cover.fm-cover--frame h1 { max-width: 14em; }
${d}.fm-cover.fm-cover--frame .fm-dek {
  border-top: none;
  padding-top: 0;
  font-size: 0.8em;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  max-width: 34em;
}

/* Split: the kicker across the head, then the title left and the sub right
   on a vertical rule, both at the foot — an editorial spread. */
${d}.fm-cover.fm-cover--split {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  column-gap: 3em;
  align-items: end;
  align-content: space-between;
  text-align: left;
}
${d}.fm-cover.fm-cover--split .fm-kicker {
  grid-column: 1 / -1;
  align-self: start;
  margin-bottom: 3em;
}
${d}.fm-cover.fm-cover--split h1 {
  grid-column: 1;
  margin: 0;
  font-size: 3.4em;
  line-height: 1.02;
}
${d}.fm-cover.fm-cover--split > p { grid-column: 1; }
${d}.fm-cover.fm-cover--split .fm-dek {
  grid-column: 2;
  margin-top: 0;
  border-top: none;
  padding-top: 0;
  border-left: var(--fm-border-width) solid currentColor;
  padding-left: 1.2em;
  font-weight: 400;
}

/* Minimal: top-set and quiet — a smaller title, the sub in muted ink, a
   hairline foot instead of a ground. */
${d}.fm-cover.fm-cover--minimal {
  justify-content: flex-start;
  text-align: left;
  padding-top: 5em;
  border-bottom: var(--fm-border-width) solid var(--fm-border);
}
${d}.fm-cover.fm-cover--minimal h1 { font-size: 2.6em; max-width: 18em; }
${d}.fm-cover.fm-cover--minimal .fm-kicker { color: var(--fm-accent-text); }
${d}.fm-cover.fm-cover--minimal .fm-dek {
  border-top: none;
  padding-top: 0;
  font-weight: 400;
  color: var(--fm-ink-muted);
  max-width: 36em;
}

/* Block: the title set as a solid block of the accent. On the accent ground
   the block would vanish into it, so that tone keeps the plain title. */
${d}.fm-cover.fm-cover--block { text-align: left; }
${d}.fm-cover.fm-cover--block:not(.fm-tone--accent) h1 {
  align-self: flex-start;
  background: var(--fm-accent-ground);
  color: var(--fm-accent-ground-ink);
  padding: 0.18em 0.45em;
  max-width: 14em;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
${d}.fm-cover.fm-cover--block .fm-dek { max-width: 36em; }

/* ── Steps: a numbered process list ───────────────────────────────────────── */
/* The numbers are a CSS counter, so the author writes plain paragraphs and
   never renumbers by hand when a step is inserted. */
${d}.fm-steps {
  counter-reset: fm-step;
  margin: 1.6em 0;
  --fm-mt: 1.6em;
  --fm-mb: 1.6em;
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

/* ── Numbered sections (report numbering=sections) ────────────────────────── */
/* Only TOP-LEVEL headings are numbered: a heading inside a block is not a
   document section (the format's own rule), so a band or a card can hold one
   without disturbing the sequence. The counters live on the document root,
   which is where readFastrDocumentSettings puts the class. */
${d}.fm-doc--numbered { counter-reset: fm-sec 0; }
${d}.fm-doc--numbered body > h2 {
  counter-increment: fm-sec;
  counter-reset: fm-sub 0;
}
${d}.fm-doc--numbered body > h2::before {
  content: counter(fm-sec) ". ";
  color: var(--fm-accent-text);
}
${d}.fm-doc--numbered body > h3 { counter-increment: fm-sub; }
${d}.fm-doc--numbered body > h3::before {
  content: counter(fm-sec) "." counter(fm-sub) " ";
  color: var(--fm-accent-text);
}

/* ── Table of contents ────────────────────────────────────────────────────── */
/* The list is the document's own outline (the renderer fills it in), so the
   only job here is to make it read as a contents page: a quiet panel, the
   levels stepped by indent, the entries as plain ink rather than links. */
${d}.fm-toc {
  display: block;
  margin: 1.6em 0;
  --fm-mt: 1.6em;
  --fm-mb: 1.6em;
  padding: 1.2em 1.4em;
  border: var(--fm-border-width) solid var(--fm-border);
  border-radius: var(--fm-radius);
  background: var(--fm-surface);
}
${d}.fm-toc__title {
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  letter-spacing: var(--fm-heading-tracking);
  text-transform: var(--fm-heading-case);
  font-size: 0.85em;
  margin-bottom: 0.7em;
  color: var(--fm-accent-text);
}
${d}.fm-toc__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
${d}.fm-toc__item {
  margin: 0;
  padding: 0.25em 0;
  border-bottom: 1px solid var(--fm-border);
}
${d}.fm-toc__item:last-child { border-bottom: none; }
${d}.fm-toc__item--2 { padding-left: 1.2em; }
${d}.fm-toc__item--3 { padding-left: 2.4em; font-size: 0.95em; }
${d}.fm-toc__item--4, ${d}.fm-toc__item--5, ${d}.fm-toc__item--6 {
  padding-left: 3.6em;
  font-size: 0.95em;
}
${d}.fm-toc__item a {
  color: var(--fm-ink);
  text-decoration: none;
  border-bottom: none;
}
${d}.fm-toc__item a:hover { color: var(--fm-accent-text); }
${d}.fm-toc__empty {
  color: var(--fm-ink-muted);
  font-style: italic;
}

/* A top-level h1 is deliberately NOT special: the title page is :::cover's
   job, and an opening # heading is just a heading. The only concession is
   standard typography — the document's first element drops its top margin.
   :where() keeps the rule at zero specificity so a first-child cover/band
   still wins with its own negative bleed margin. */
${d}body > :where(:first-child) { margin-top: 0; }

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

/* ── Page break (:::pagebreak) ────────────────────────────────────────────── */
/* Nothing on screen: the paged sheet (report_fastr_paged.ts) ends the page
   there, and the editor draws its own labelled divider. */
${d}.fm-pagebreak { display: block; height: 0; margin: 0; padding: 0; overflow: hidden; }

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

// The Insert menu's cover thumbnails: real fm-cover markup under the toolbar's
// scoped sheet, shrunk by a small font-size (the sheet is em throughout) and
// made to FILL a fixed tile — under a scope the cover has no page to bleed
// into and no height, and the tile is its page.
export function buildFastrCoverTileCss(scope: string): string {
  // The tile element carries BOTH the scope class and fm-cover-tile, so these
  // are compound selectors on one element, not descendant ones.
  const d = `${scope}.fm-cover-tile`;
  return `
${d} {
  position: relative;
  height: 0;
  padding-bottom: 75%;
  overflow: hidden;
  font-size: 5px;
  line-height: 1.4;
  border-radius: 4px;
  background: var(--fm-page);
  color: var(--fm-ink);
  font-family: var(--fm-font-body);
  pointer-events: none;
}
${d} .fm-cover {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 2.4em 2.6em;
  break-after: auto;
}
${d} .fm-cover.fm-cover--spine { padding-left: 2em; }
${d} .fm-cover.fm-cover--frame::before { inset: 1.2em; }
${d} .fm-cover.fm-cover--minimal { padding-top: 3em; }
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
`;

// The BROWSER's own print of the HTML download. Never part of a paged
// document (buildFastrPagedCss owns its breaks): Paged.js applies print
// rules while it lays the pages out, and Chrome applies them again when it
// prints the finished pages, so a rule that changes a size here would move
// content off pages that are already fixed.
const BROWSER_PRINT_CSS = `
@media print {
  .fm-card, .fm-callout, .fm-stat, .fm-figure { break-inside: avoid; }
  /* The print box has no viewport to bleed into; keep bands on the page. */
  :root { --fm-bleed-margin: 0; --fm-bleed-pad: 1.5rem; }
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
  opts?: { omitFontImport?: boolean; omitPrintRules?: boolean },
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
    buildFastrToneCss(tokens, scope, colors),
    extra,
    scope === "" ? DOCUMENT_ROOT_CSS : "",
    scope === "" ? RESPONSIVE_CSS : "",
    scope === "" && !opts?.omitPrintRules ? BROWSER_PRINT_CSS : "",
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
// Revealed-box geometry, in PIXELS: the layer that draws the boxes computes
// rectangles, and the padding rules below are emitted from the same numbers so
// the box and the lines it sits behind cannot drift apart.
export const FM_BOX_GAP = 16;
export const FM_BOX_PAD_BOTTOM = 10;
export const FM_BOX_INSET = 14;
// The sheet's horizontal page padding (the preview body's 1.5rem), shared with
// the box layer so blocks sit inside the page edge exactly as in View.
export const FM_PAGE_PAD_X = 24;

export function buildFastrEditorSurfaceCss(scope: string): string {
  const d = `${scope} `;
  // The SHEET: the page ground lives on the content column only — the pane
  // around it stays app chrome, exactly like View's bounded page. The scope
  // root's own structure background is overridden back to transparent (this
  // sheet is appended last, so the tie resolves here).
  const sheet = `${scope} { background: transparent; }
/* The SHEET is the scroller: the printed sheet at 96dpi (the host sets
   --fm-sheet, 794px for A4, and --fm-measure so the column below is the
   printed column, 1:1, so lines wrap here exactly as they wrap in print),
   centered, painted with the page ground.
   The ground must live HERE and not on .cm-content: the box layer draws at
   negative z, and an in-flow element's background would paint OVER it —
   a scroller's own background paints below its negative-z children. */
${d}.cm-scroller {
  background: var(--fm-page);
  /* The scroller is a flex item: without an explicit width, auto margins
     would shrink it to fit content. */
  width: 100%;
  max-width: var(--fm-sheet, 896px);
  margin-inline: auto;
  /* The centering theme pads the scroller right to align the column past the
     app's floating sidebar. On the SHEET that padding would shrink the content
     area and paint the ground under the sidebar — neutralise it and take the
     same final position by shifting the centred sheet left by half the pad
     (the host mirrors the pad into --fm-center-pad). */
  padding-right: 0 !important;
  position: relative;
  left: calc(var(--fm-center-pad, 0px) / -2);
}
${d}.cm-content {
  background: transparent;
  box-sizing: border-box;
  width: 100%;
  /* The base editor theme caps the writing column at 56rem; on the sheet the
     column is the measure, owned by the padding formula below — a wide/full
     document must outgrow that cap. */
  max-width: none;
  /* View's bleed-pad formula, with the sheet standing in for the viewport:
     % resolves against the scroller, so narrow windows match View too. The
     column is therefore --fm-measure less 48px; the host sets the var
     accordingly. */
  padding: 0 max(24px, calc((100% - var(--fm-measure)) / 2 + 24px)) 4rem;
}
/* No line insets: the base theme's 6px/2px would narrow the text by 8px
   against print, and against the rendered blocks beside it. */
${d}.cm-line { padding-left: 0; padding-right: 0; }
/* buildFastrReportCss neutralises all bleed under a scope (a picker tile has
   no page to bleed into). The editor DOES have a page — the sheet — so these
   later rules re-aim the two bleed properties at the sheet's edges: a band or
   cover runs edge to edge of the sheet and its text returns to the measure,
   View's exact geometry with the sheet standing in for the viewport. */
${scope} {
  --fm-bleed-margin: calc((var(--fm-measure) - var(--fm-sheet, 896px)) / 2 - 24px);
  --fm-bleed-pad: calc((var(--fm-sheet, 896px) - var(--fm-measure)) / 2 + 24px);
}
/* A cover's height is print's: 34rem at the 16px root, in px so the editor
   and the layout frame agree whatever their roots and viewports (the screen
   sheet's 72vh cap would make it depend on the window). With fill=page it
   fills its page: the host sets --fm-page-h to the printed page's height. */
${d}.fm-cover { min-height: 544px; }
${d}.fm-cover.fm-cover--fill { min-height: var(--fm-page-h, 544px); }
${d}.fm-figure--wide {
  margin-inline: max(-4rem, calc((100% - var(--fm-sheet, 896px)) / 2 + 1.5rem));
}
`;
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
  line-height: 1.2;
}`
  ).join("\n");
  return `${sheet}
${headings}
${d}.cm-fm-code {
  font-family: ui-monospace, monospace;
  font-size: 0.9em;
  background: var(--fm-surface-alt);
  border-radius: var(--fm-radius);
  padding: 0.05em 0.3em;
}
/* The markdown highlight style underlines anything Lezer tokenizes as a
   link — including bare [bracketed text] the renderer leaves literal. Only
   REAL links (given cm-fm-link by the conceal layer) may underline. */
${d}.cm-line * { text-decoration: none; }
${d}.cm-line .cm-fm-link, ${d}.cm-fm-link {
  color: var(--fm-accent-text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
${d}.cm-fm-bullet { color: var(--fm-ink); }
/* A revealed region keeps LOOKING like the block while its source is edited:
   the lines carry the block's ground (a tone class, a callout accent, or the
   default surface wash) and the fence lines drop to dimmed syntax. Only
   layout-free sheet classes are reused per line — never the structural block
   classes, whose margins would repeat on every line. */
/* The revealed box model: the LAYER draws each block's box with the block's
   real sheet classes (borders, radius, shadow — the preview's own look); the
   lines only inset their text into it. Backgrounds live on the box, not the
   lines, so nothing ever paints over a border. */
${d}.cm-fm-revealed-first { padding-top: 0.35rem; }
${d}.cm-fm-revealed-last { padding-bottom: 0.35rem; }
${d}.cm-fm-d1, ${d}.cm-fm-d2, ${d}.cm-fm-d3, ${d}.cm-fm-d4 { padding-inline: 0.9rem; }
${d}.cm-fm-d2 { padding-inline: calc(0.9rem + ${FM_BOX_INSET}px); }
${d}.cm-fm-d3 { padding-inline: calc(0.9rem + ${FM_BOX_INSET * 2}px); }
${d}.cm-fm-d4 { padding-inline: calc(0.9rem + ${FM_BOX_INSET * 3}px); }
${d}.cm-fm-quote-line { font-style: italic; font-size: 1.1em; }
/* View's vertical rhythm, rebuilt from line boxes: a blank source line stands
   in for the 1em paragraph margin (a full text line would run ~60% taller),
   headings carry their margins as PADDING (line decorations may never carry
   margins), and list lines take the ul indent. */
${d}.cm-fm-blank { font-size: 0.65em; }
${d}.cm-content { --fm-separator: calc(0.65 * 1lh); }
/* Further blank lines in a run are lines of space in the document (the
   renderer's .fm-space, one line tall), so they keep their full height. */
${d}.cm-fm-space { font-size: 1em; }
/* Print's list items carry 0.25em margins that collapse to one between
   items (and into the paragraph margins at the list's ends): the second
   item onward takes that as padding, so a list stands the same height. */
${d}.cm-fm-li + .cm-fm-li { padding-top: 0.25em; }
/* View's document opens flush with its first block: leading blank lines are
   not content there, and the body first-child rule drops its top margin (a cover
   even pulls itself up). The editor's page must open the same way, or every
   report starts with a strip of bare page ground above its cover. */
${d}.cm-line.cm-fm-lead { height: 0; font-size: 0; line-height: 0; overflow: hidden; }
${d}.cm-line.cm-fm-first { padding-top: 0 !important; margin-top: 0 !important; }
/* Section numbers on the editor's own heading lines (the rendered document
   uses a CSS counter; a cm-line is not a real heading). */
${d}.cm-fm-secnum { color: var(--fm-accent-text); }
/* A peer's caret inside a rendered block — the same bar, dot and name flag
   yCollab draws in a paragraph (its .cm-ySelectionCaret), positioned by the
   presence plugin since the text layer cannot reach into a widget. */
${d}.fm-peer-caret {
  position: absolute;
  width: 2px;
  margin-left: -1px;
  pointer-events: auto;
  z-index: 4;
}
${d}.fm-peer-caret::before {
  content: "";
  position: absolute;
  left: -2px;
  top: -3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: inherit;
}
${d}.fm-peer-caret::after {
  content: "";
  position: absolute;
  left: -6px;
  right: -6px;
  top: -8px;
  bottom: 0;
}
${d}.fm-peer-caret__name {
  position: absolute;
  left: -1px;
  bottom: 100%;
  padding: 1px 4px;
  border-radius: 3px 3px 3px 0;
  font: 11px/1.3 system-ui, sans-serif;
  color: #fff;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  pointer-events: none;
}
${d}.fm-peer-caret:hover > .fm-peer-caret__name { opacity: 1; }
/* CodeMirror's find panel is app chrome sitting on a themed document sheet:
   give it the app's own surface rather than letting the report's typography
   reach it. */
${d}.cm-panels {
  background: #ffffff;
  color: #111111;
  border-color: rgba(17, 17, 17, 0.15);
  font-family: system-ui, sans-serif;
  font-size: 13px;
}
${d}.cm-panels input, ${d}.cm-panels button, ${d}.cm-panels label {
  font-family: inherit;
  font-size: 12px;
}
${d}.cm-panels .cm-textfield {
  border: 1px solid rgba(17, 17, 17, 0.2);
  border-radius: 4px;
  padding: 2px 6px;
}
${d}.cm-panels .cm-button {
  border-radius: 4px;
  background-image: none;
  background: rgba(17, 17, 17, 0.06);
  border: 1px solid rgba(17, 17, 17, 0.12);
}
/* Two classes: the general first-child clamp below is a later rule of equal
   weight, and would otherwise win the tie. The first block of the document
   has no top margin in print either (the paged sheet's title rule). */
${d}.fm-live-region.fm-live-region--first > .fm-peer-layer + :not(.fm-page-gutter, .fm-page-split),
${d}.fm-live-region.fm-live-region--first > .fm-page-gutter--inner + :not(.fm-page-split),
${d}.fm-live-region.fm-live-region--first > .fm-page-split + * { margin-top: 0 !important; }
/* Widgets render REAL html inside .cm-content, which is white-space:pre-wrap
   (CodeMirror needs it for the text). Inherited into a widget, every newline
   the renderer emits between tags becomes a phantom line box — two extra
   lines in every callout, one after every grid. Rendered content collapses
   whitespace exactly like the preview does. */
${d}.fm-live-region, ${d}.cm-fm-chrome { white-space: normal; }
/* Print's heading margins (1.8em above, 0.6em below, in the heading's own
   em) less the blank source line on each side of a heading (16px, the
   paragraph separator), so the editor's heading stands where print's does
   and the page flow measures the same page. */
${d}.cm-fm-h1 { padding-top: 0; padding-bottom: 0.13em; }
/* Most themes rule an h2 with a 0.25em padding under it; the editor line
   cannot take a theme's own heading rules, so that one is mirrored here. */
${d}.cm-fm-h2 { padding-top: 1.15em; padding-bottom: 0.25em; }
${d}.cm-fm-h3 { padding-top: 0.96em; padding-bottom: 0; }
${d}.cm-fm-h4, ${d}.cm-fm-h5, ${d}.cm-fm-h6 { padding-top: 0.8em; padding-bottom: 0; }
/* Beside a line of space the whole margin stands (see the widget rule),
   with a page seam widget between the space and the heading all the same:
   a seam changes no line's box (the page layout depends on it, see the
   widget rule). */
${d}.cm-fm-space + .cm-fm-h2, ${d}.cm-fm-space + .cm-fm-h3, ${d}.cm-fm-space + .cm-fm-h4,
${d}.cm-fm-space + .cm-fm-h5, ${d}.cm-fm-space + .cm-fm-h6,
${d}.cm-fm-space + .cm-fm-page-gutter + .cm-fm-h2, ${d}.cm-fm-space + .cm-fm-page-gutter + .cm-fm-h3,
${d}.cm-fm-space + .cm-fm-page-gutter + .cm-fm-h4, ${d}.cm-fm-space + .cm-fm-page-gutter + .cm-fm-h5,
${d}.cm-fm-space + .cm-fm-page-gutter + .cm-fm-h6 { padding-top: 1.8em; }
${d}.cm-fm-h1:has(+ .cm-fm-space), ${d}.cm-fm-h3:has(+ .cm-fm-space),
${d}.cm-fm-h4:has(+ .cm-fm-space), ${d}.cm-fm-h5:has(+ .cm-fm-space), ${d}.cm-fm-h6:has(+ .cm-fm-space) { padding-bottom: 0.6em; }
${d}.cm-fm-h2:has(+ .cm-fm-space) { padding-bottom: 0.85em; }
${d}.cm-fm-li { padding-left: 1.4em; }
/* A plain markdown blockquote takes the theme's own blockquote treatment —
   the host retargets those rules onto this class, margins neutralised. */
/* A concealed role mark's label can sit inside what Lezer tokenized as a
   shortcut-reference link; the highlight style's underline is noise there. */
${d}.fm-mark { text-decoration: none !important; }
/* …except an explicit underline mark, which must survive that strip (and
   the heading strip the host adds) at the same strength. */
${d}.fm-mark.fm-mark--u { text-decoration: underline !important; text-underline-offset: 2px; }
${d}.fm-mark.fm-mark--hl { padding: 0.05em 0.2em; border-radius: 3px; }
/* Syntax hidden inside an ACTIVE text island (the leading heading marker,
   role-mark wrappers): display:none keeps it out of the visual flow while
   textContent still carries it, so a commit round-trips byte-identically. */
${d}.cm-fm-island-syntax { display: none; }
/* The box layer carries a NEGATIVE z-index (CodeMirror's below-text layers
   all do). A negative-z child only paints above its ancestor's background
   when that ancestor is a stacking context — isolate the scroller so the
   boxes can never fall behind the page ground. */
${d}.cm-scroller { isolation: isolate; }
${d}.cm-fm-box {
  position: absolute;
  box-sizing: border-box;
  pointer-events: none;
  /* The structural classes carry flow margins; an absolutely positioned box
     must not let them shift it off its measured rectangle. Important, because
     the retargeted theme rules land later in the sheet. */
  margin: 0 !important;
}
/* A collapsed widget's render carries the preview's own block margins
   (--fm-mt/--fm-mb, declared by each block's rule in the structure sheet);
   the editor ALSO spends a blank source line on that seam, the paragraph
   separator (--fm-separator, the blank line's own height), so the widget
   keeps only what its margin exceeds the separator by, or blocks drift
   twice as far apart in Edit as in print. Next to a line of SPACE (a second
   blank line) the whole margin stands: print collapses a margin into the
   neighbouring margin, never into a space.
   The clamp addresses the block's first CONTENT child: the child after the
   peer layer, or after the page seam and the "continues" flag that stand
   before it when the block opens a page or runs past one. Its margin is the
   same wherever the block stands, seam or no seam. The page layout takes
   every block's box from the height map, and a seam that changed the box
   would make the layout that placed it find another height and move it
   away, then back, every frame (the flicker of 2026-09-10). Print keeps a
   block's whole top margin at the top of a page: what the clamp takes off
   is the SEAM's there, as its padding-bottom (pageBoxPlugin writes it), so
   the page reads as print's and the block's box does not change. */
${d}.fm-live-region > .fm-peer-layer + :not(.fm-page-gutter, .fm-page-split),
${d}.fm-live-region > .fm-page-gutter--inner + :not(.fm-page-split),
${d}.fm-live-region > .fm-page-split + * {
  margin-top: max(0px, calc(var(--fm-mt, 0px) - var(--fm-separator))) !important;
}
${d}.fm-live-region > *:last-child {
  margin-bottom: max(0px, calc(var(--fm-mb, 0px) - var(--fm-separator))) !important;
}
${d}.cm-fm-space + .fm-live-region > .fm-peer-layer + :not(.fm-page-gutter, .fm-page-split),
${d}.cm-fm-space + .cm-fm-page-gutter + .fm-live-region > .fm-peer-layer + :not(.fm-page-gutter, .fm-page-split),
${d}.cm-fm-space + .fm-live-region > .fm-page-gutter--inner + :not(.fm-page-split),
${d}.cm-fm-space + .fm-live-region > .fm-page-split + * { margin-top: var(--fm-mt, 0px) !important; }
${d}.fm-live-region:has(+ .cm-fm-space) > *:last-child { margin-bottom: var(--fm-mb, 0px) !important; }
/* The seam and the flag inside a widget are chrome, not the block: no
   margin of their own. */
${d}.fm-live-region > .fm-page-gutter--inner, ${d}.fm-live-region > .fm-page-split { margin-top: 0 !important; }
/* The peer layer (carets, presence) sits first in every widget and covers
   it; it is not content, so the clamp above addresses the child after it. */
${d}.fm-peer-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
}
/* GAP above the box is page-side; the extra 8px is interior headroom so the
   title clears the box's own top border (the box starts at +GAP exactly). */
${d}.cm-fm-chrome-open { padding-top: ${FM_BOX_GAP + 8}px; padding-bottom: 0.2rem; }
${d}.cm-fm-chrome-cap {
  height: ${FM_BOX_PAD_BOTTOM}px;
  padding-bottom: ${FM_BOX_GAP}px;
  box-sizing: content-box;
}
/* Chrome widgets replace the fence lines entirely: the block's real header
   (title bar, kicker) on the block's own ground, and a thin end cap. The
   syntax never shows in Edit mode — attrs are toolbar territory. */
${d}.cm-fm-chrome { cursor: pointer; }
/* An in-place text editor keeps its element's rendered box; the dotted
   underline marks the editable surface, as on the labels. */
${d}.cm-fm-text-edit { cursor: text; }
${d}.cm-fm-text-edit:hover { text-decoration: underline dotted; text-underline-offset: 3px; }
${d}.cm-fm-text-edit:focus { outline: 1px dashed var(--fm-accent-text); outline-offset: 2px; text-decoration: none; }
/* No ring on the active region: blocks look exactly as View renders them even
   with the caret inside (the class still drives ghost placeholders). */
/* Click-to-edit labels in chrome: a text cursor and a quiet dotted underline
   on hover say "this is editable"; an empty label shows its placeholder so a
   cleared title can always be brought back. */
${d}.cm-fm-attr { cursor: text; }
${d}.cm-fm-attr:hover { text-decoration: underline dotted; text-underline-offset: 3px; }
${d}.cm-fm-attr:focus {
  outline: none;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
${d}.cm-fm-attr:empty::before {
  content: attr(data-placeholder);
  color: var(--fm-ink-muted);
  font-style: italic;
}
/* ── Page boxes ─────────────────────────────────────────────────────────── */
/* The paginator says where each printed page starts; the editor draws the
   seam there: the ending page's running footer, then a strip of app chrome
   running edge to edge of the sheet (the bleed vars), then the next page
   begins. Inside a rendered block the same element is injected before the
   child that starts the page; between plain lines it is a block widget. */
${d}.fm-page-gutter {
  display: block;
  /* No block margins: the seam's padding-top is the page filler, measured
     exactly (pageBoxPlugin), so nothing else may add to the page's height. */
  margin: 0 var(--fm-bleed-margin);
  padding: 0;
  font-family: var(--fm-font-body);
  font-weight: 400;
  font-style: normal;
  text-transform: none;
  letter-spacing: 0;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;
  user-select: none;
}
/* The printed page's bottom margin (--fm-page-margin: 18mm at the sheet's
   scale, set by the host), with the running footer sitting in it as the
   PDF's margin box does. A page's content area is the sheet less its top
   and bottom margins, exactly as in print, so the editor and the paginator
   agree on what fits on a page. */
${d}.fm-page-gutter__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  box-sizing: border-box;
  height: var(--fm-page-margin, 77px);
  padding: 0 var(--fm-bleed-pad);
  font-size: 0.7em;
  color: var(--fm-ink-muted);
  font-variant-numeric: tabular-nums;
}
/* The gap between two sheets: app chrome, with the sheets' edges shadowed. */
${d}.fm-page-gutter__band {
  display: block;
  height: 28px;
  background: var(--color-base-200, #e5e7eb);
  box-shadow: inset 0 8px 8px -8px rgba(0, 0, 0, 0.35), inset 0 -8px 8px -8px rgba(0, 0, 0, 0.35);
}
/* The next page's top margin. Before the document's first line too, when
   page 1 is not a cover (a cover has no margins). */
${d}.fm-page-gutter__head {
  display: block;
  height: var(--fm-page-margin, 77px);
}
${d}.cm-fm-page-head { display: block; }
/* A seam INSIDE a rendered block (a callout, band or steps block that
   continues on the next page, or one that opens a page): centred on the
   block's content box, which sits centred on the sheet, and as wide as the
   sheet, painted with the DOCUMENT's ground (--fm-page-ground, the tone or
   colour the :::report line sets, put on the scroller by the editor's
   ground plugin; the theme's page colour when there is none) so the
   block's box visibly stops above it and resumes below, as print draws
   it. It must not read as one of the block's children: no padding, border,
   counter or generated number. */
${d}.fm-page-gutter--inner {
  position: relative;
  left: 50%;
  width: var(--fm-sheet, 794px);
  /* The estimate; pageBoxPlugin measures the strip against the sheet and
     writes the exact margin and width inline (a block's own left border
     puts its content box off centre). */
  margin: 0 0 0 calc(-0.5 * var(--fm-sheet, 794px));
  padding-left: 0 !important;
  padding-right: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: var(--fm-page-ground, var(--fm-page));
  color: var(--fm-ink-muted);
  counter-increment: none !important;
  z-index: 1;
}
${d}.fm-page-gutter--inner::before, ${d}.fm-page-gutter--inner::after { content: none !important; }
/* Between plain lines the gutter is a block widget: no line box of its own,
   the same seam geometry as inside a block. After the last line, the last
   page's foot and filler. */
${d}.cm-fm-page-gutter, ${d}.cm-fm-page-end { display: block; }
/* A :::pagebreak line: invisible on the page, a labelled rule in the editor
   so the author can see where they forced a break (and delete it). */
${d}.fm-pagebreak.fm-pagebreak--editor {
  display: flex;
  align-items: center;
  gap: 0.8em;
  height: auto;
  margin: 0.6em 0;
  overflow: visible;
  color: var(--fm-ink-muted);
  font-family: var(--fm-font-body);
  font-size: 0.7em;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
${d}.fm-pagebreak.fm-pagebreak--editor::before, ${d}.fm-pagebreak.fm-pagebreak--editor::after {
  content: "";
  flex: 1;
  border-top: 1px dashed var(--fm-ink-muted);
}
/* A block the paginator had to split because it is taller than a page. */
${d}.fm-page-split {
  display: inline-block;
  margin: 0 0 0.4em;
  padding: 0.15em 0.6em;
  border-radius: 999px;
  background: var(--fm-warning, #b45309);
  color: #ffffff;
  font-family: var(--fm-font-body);
  font-size: 0.68em;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  pointer-events: none;
  user-select: none;
}
${d}.cm-line.cm-fm-split { box-shadow: inset 3px 0 0 var(--fm-warning, #b45309); }
/* The document is the ground; the code-editor affordances step back. */
${d}.cm-cursor, ${d}.cm-dropCursor { border-left-color: var(--fm-ink); }
${d}.cm-activeLine { background: transparent; }
${d}.cm-content ::selection { background: color-mix(in srgb, var(--fm-accent) 25%, transparent); }
${d}.cm-selectionBackground { background: color-mix(in srgb, var(--fm-accent) 25%, transparent) !important; }`;
}
