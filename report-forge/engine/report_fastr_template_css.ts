// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// The page templates' compositions (`:::page{layout=…}`, fastr_page_templates
// .ts): one grid per layout, painted only with the theme's tokens and tones,
// so a re-theme restyles every template and a toned page stays readable.
// Part of the structure sheet (report_fastr_css.ts), so the editor, print and
// the .html export all draw one composition.
//
// A template is exactly its page's content area tall (--fm-page-area, which
// the editor and the paged sheet both set, less FASTR_TEMPLATE_SLACK_PX), and
// each of its areas clips: a template never grows past its page, and an area
// that holds more than it can show is OVERFULL, which the editor marks and
// the page map reports (fastrTemplateOverflow), rather than shrunk to fit.
//
// The icons a stat or card carries are masks drawn in currentColor, so a body
// never holds an SVG and the sanitizer is untouched.
// =============================================================================

import { FASTR_TEMPLATE_SLACK_PX } from "./fastr_markdown_blocks.ts";
import { FASTR_ICONS, type FastrIcon } from "./fastr_page_templates.ts";

// Stroked on a 24 viewBox, Tabler's grammar (round caps and joins, 2px).
const ICON_PATHS: Record<FastrIcon, string[]> = {
  alert: [
    "M12 9v4",
    "M12 17h.01",
    "M10.4 3.9l-8 13.9a1.8 1.8 0 0 0 1.6 2.7h16a1.8 1.8 0 0 0 1.6 -2.7l-8 -13.9a1.8 1.8 0 0 0 -3.2 0z",
  ],
  baby: [
    "M12 3a4 4 0 1 0 0 8a4 4 0 0 0 0 -8z",
    "M10 7h.01",
    "M14 7h.01",
    "M6 21v-3a6 6 0 0 1 12 0v3",
    "M9 15l-3 -2",
    "M15 15l3 -2",
  ],
  calendar: [
    "M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z",
    "M16 3v4",
    "M8 3v4",
    "M4 11h16",
  ],
  chart: ["M3 3v18h18", "M7 15l4 -5l3 3l5 -6"],
  check: ["M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18z", "M8 12l3 3l5 -6"],
  clinic: ["M3 21h18", "M5 21v-12l7 -5l7 5v12", "M12 10v6", "M9 13h6"],
  clipboard: [
    "M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2",
    "M9 3h6v4h-6z",
    "M9 12h6",
    "M9 16h4",
  ],
  database: [
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3 -8 3s-8 -1.3 -8 -3s3.6 -3 8 -3z",
    "M4 6v6c0 1.7 3.6 3 8 3s8 -1.3 8 -3v-6",
    "M4 12v6c0 1.7 3.6 3 8 3s8 -1.3 8 -3v-6",
  ],
  droplet: ["M12 3l5.7 6.2a7 7 0 1 1 -11.4 0z"],
  globe: [
    "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0 -18z",
    "M3.6 9h16.8",
    "M3.6 15h16.8",
    "M12 3a15 15 0 0 1 0 18",
    "M12 3a15 15 0 0 0 0 18",
  ],
  heart: ["M19.5 12.6l-7.5 7.4l-7.5 -7.4a5 5 0 1 1 7.5 -6.6a5 5 0 1 1 7.5 6.6"],
  map: ["M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3z", "M9 4v13", "M15 7v13"],
  money: [
    "M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z",
    "M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z",
    "M6 12h.01",
    "M18 12h.01",
  ],
  people: [
    "M9 4a3 3 0 1 0 0 6a3 3 0 0 0 0 -6z",
    "M3 20v-1a5 5 0 0 1 10 0v1",
    "M16 5a3 3 0 0 1 0 5.8",
    "M18 14.2a5 5 0 0 1 3 4.8v1",
  ],
  phone: [
    "M7 4a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z",
    "M11 18h2",
  ],
  pill: [
    "M4.5 12.5l8 -8a4.9 4.9 0 0 1 7 7l-8 8a4.9 4.9 0 0 1 -7 -7",
    "M8.5 8.5l7 7",
  ],
  shield: [
    "M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3",
    "M9 12l2 2l4 -4",
  ],
  stethoscope: [
    "M6 4h-1a2 2 0 0 0 -2 2v3.5a5.5 5.5 0 0 0 11 0v-3.5a2 2 0 0 0 -2 -2h-1",
    "M8 15a6 6 0 1 0 12 0v-3",
    "M11 3v2",
    "M6 3v2",
    "M20 10a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z",
  ],
  truck: [
    "M7 17a2 2 0 1 0 0 4a2 2 0 0 0 0 -4z",
    "M17 17a2 2 0 1 0 0 4a2 2 0 0 0 0 -4z",
    "M5 19h-2v-14h11v14m-5 0h6m4 0h2v-6h-8m0 -5h5l3 5",
  ],
  vaccine: [
    "M17 3l4 4",
    "M19 5l-4.5 4.5",
    "M11.5 6.5l6 6",
    "M16.5 11.5l-6.5 6.5h-4v-4l6.5 -6.5",
    "M7.5 12.5l1.5 1.5",
    "M10.5 9.5l1.5 1.5",
    "M3 21l3 -3",
  ],
};

function iconDataUri(paths: readonly string[]): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${
      paths.map((p) => `<path d='${p}'/>`).join("")
    }</svg>`;
  return `url("data:image/svg+xml,${
    svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")
  }")`;
}

export function buildFastrIconCss(d: string): string {
  return `/* ── Icons (icon= on a stat or a card) ────────────────────────────────────── */
${d}.fm-icon {
  display: inline-block;
  width: 1.6em;
  height: 1.6em;
  background: currentColor;
  -webkit-mask: var(--fm-icon) center / contain no-repeat;
  mask: var(--fm-icon) center / contain no-repeat;
}
${d}.fm-stat > .fm-icon, ${d}.fm-card > .fm-icon {
  display: block;
  margin-bottom: 0.5em;
  color: var(--fm-accent-text);
}
${
    FASTR_ICONS.map((name) =>
      `${d}.fm-icon--${name} { --fm-icon: ${iconDataUri(ICON_PATHS[name])}; }`
    ).join("\n")
  }
`;
}

// A media slot's photo: cropped to the area the layout gives it, so a
// portrait photo and a landscape one fill the same box.
function photoRule(d: string, layout: string, share: number): string {
  return `${d}.fm-tpl--${layout} .fm-tpl-slot--media img {
  display: block;
  width: 100%;
  max-width: none;
  height: calc(var(--fm-page-area, 245mm) * ${share});
  max-height: none;
  object-fit: cover;
}`;
}

export function buildFastrTemplateCss(d: string): string {
  return `/* ── Page templates (:::page) ─────────────────────────────────────────────── */
${d}.fm-tpl {
  display: grid;
  box-sizing: border-box;
  height: calc(var(--fm-page-area, 245mm) - ${FASTR_TEMPLATE_SLACK_PX}px);
  margin: 0;
  --fm-mt: 0;
  --fm-mb: 0;
  padding: var(--fm-tpl-pad, 0);
  gap: 1.2em 2em;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  overflow: hidden;
  position: relative;
}
/* A ground needs room inside it where no page is painted under it (the .html
   export); the editor and print paint the whole sheet and zero this. */
${d}.fm-tpl.fm-tone, ${d}.fm-tpl.fm-has-bg, ${d}.fm-tpl.fm-has-bgimage {
  --fm-tpl-pad: 2em;
}
${d}.fm-tpl > * { min-width: 0; min-height: 0; overflow: hidden; margin: 0; }
${d}.fm-tpl-main > :first-child, ${d}.fm-tpl-slot > :first-child { margin-top: 0; }
${d}.fm-tpl-main > :last-child, ${d}.fm-tpl-slot > :last-child { margin-bottom: 0; }
${d}.fm-tpl > .fm-kicker { grid-area: kicker; margin: 0; }
${d}.fm-tpl-main { grid-area: main; }
${d}.fm-tpl-slot--media { grid-area: media; }
${d}.fm-tpl-slot--empty { display: none; }
${d}.fm-tpl-slot .fm-figure { margin: 0; }
${d}.fm-tpl-slot .fm-figure__caption { font-size: calc(0.75em / var(--fm-fit-caption, 1)); }
${d}.fm-tpl-slot__title {
  font-family: var(--fm-font-heading);
  font-weight: 700;
  font-size: 1.05em;
  margin-bottom: 0.7em;
}
${d}.fm-tpl-slot__label {
  font-family: var(--fm-font-heading);
  font-size: 0.75em;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--fm-ink-muted);
  margin-bottom: 0.6em;
}
/* Stats in a template are the layout's, not tiles: no panel of their own. */
${d}.fm-tpl-slot > .fm-stat {
  margin: 0;
  background: none;
  padding: 0;
  border: none;
  border-radius: 0;
  box-shadow: none;
}
/* A photo is the area's, not a framed figure. */
${d}.fm-tpl-slot--media .fm-figure {
  border: none;
  padding: 0;
  background: none;
  box-shadow: none;
  border-radius: 0;
}

/* story: the headline in a gutter column beside a rule, the prose to its
   right, a photo across the page. */
${d}.fm-tpl--story {
  grid-template-columns: minmax(0, 0.4fr) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr) auto auto minmax(0, 1fr) auto;
  grid-template-areas:
    ".      main"
    "kicker main"
    "side   main"
    ".      main"
    "media  media";
  column-gap: 0;
  row-gap: 0;
}
${d}.fm-tpl--story.fm-tpl--media-top {
  grid-template-rows: auto minmax(0, 1fr) auto auto minmax(0, 1fr);
  grid-template-areas:
    "media  media"
    ".      main"
    "kicker main"
    "side   main"
    ".      main";
}
${d}.fm-tpl--story > .fm-kicker { padding-right: calc(1.6em * var(--fm-fit-kicker, 1)); color: var(--fm-ink); }
${d}.fm-tpl--story .fm-tpl-slot--side { grid-area: side; padding-right: 1.6em; }
${d}.fm-tpl--story .fm-tpl-slot--side::before {
  content: "";
  display: block;
  height: 0.45em;
  width: 80%;
  background: var(--fm-accent);
  margin-bottom: 0.9em;
}
${d}.fm-tpl--story .fm-tpl-slot--side :is(h1, h2, h3) {
  margin: 0;
  color: var(--fm-accent-text);
  line-height: calc(1.15 * var(--fm-h-fit, 1));
}
${d}.fm-tpl--story .fm-tpl-main {
  border-left: var(--fm-border-width) solid var(--fm-accent);
  padding: 1.5em 0 1.5em calc(1.8em - var(--fm-border-give, 0px));
  align-self: stretch;
}
${d}.fm-tpl--story .fm-tpl-slot--media { margin-top: 1.4em; }
${d}.fm-tpl--story.fm-tpl--media-top .fm-tpl-slot--media { margin: 0 0 1.4em; }
${photoRule(d, "story", 0.4)}

/* summary: a heading and standfirst, the headline totals under gradient
   caps, a heavy rule, then the breakdown on heavy bars. The headline totals
   are set at hero size in the middle of the page and the breakdown stands on
   its foot, so the space between them is the layout's, not a page left
   unfinished. */
${d}.fm-tpl--summary {
  grid-template-rows: auto auto minmax(min-content, 1fr) auto;
  grid-template-areas: "kicker" "main" "headline" "breakdown";
  row-gap: 1.8em;
}
${d}.fm-tpl--summary .fm-tpl-main {
  border-top: 0.2em solid var(--fm-accent);
  padding-top: 1em;
}
${d}.fm-tpl--summary .fm-tpl-main :is(h1, h2) { margin: 0 0 calc(0.4em * var(--fm-h-fit, 1)); color: var(--fm-accent-text); }
${d}.fm-tpl--summary .fm-tpl-slot--headline {
  grid-area: headline;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  align-content: center;
  gap: 1em;
  text-align: center;
}
${d}.fm-tpl--summary .fm-tpl-slot--headline > .fm-stat::before {
  content: "";
  display: block;
  height: 1.1em;
  margin-bottom: 1em;
  border-radius: min(var(--fm-radius), 0.3em);
  background: linear-gradient(90deg, color-mix(in srgb, var(--fm-accent-ground) 70%, var(--fm-page)), var(--fm-accent-ground));
}
${d}.fm-tpl--summary .fm-tpl-slot--headline > .fm-stat:nth-child(2)::before {
  background: linear-gradient(90deg, var(--fm-accent-ground), color-mix(in srgb, var(--fm-accent-ground) 55%, var(--fm-ink-ground)));
}
${d}.fm-tpl--summary .fm-tpl-slot--headline > .fm-stat:nth-child(3)::before {
  background: linear-gradient(90deg, color-mix(in srgb, var(--fm-accent-ground) 55%, var(--fm-ink-ground)), var(--fm-ink-ground));
}
/* Hero size, but never wider than its column: a stat is its own container,
   so a longer value sets smaller rather than running into its neighbour. */
${d}.fm-tpl--summary .fm-tpl-slot--headline > .fm-stat { container-type: inline-size; }
${d}.fm-tpl--summary .fm-tpl-slot--headline .fm-stat__value { font-size: calc(min(4.8em, 25cqi) / var(--fm-fit-stat-value, 1)); white-space: nowrap; }
${d}.fm-tpl--summary .fm-tpl-slot--headline .fm-stat__label {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--fm-ink);
}
${d}.fm-tpl--summary .fm-tpl-slot--breakdown {
  grid-area: breakdown;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-content: start;
  gap: 1.6em 1.2em;
  border-top: 0.7em solid var(--fm-ink-ground);
  padding-top: 1.2em;
}
${d}.fm-tpl--summary .fm-tpl-slot--breakdown > .fm-tpl-slot__title { grid-column: 1 / -1; margin: 0; }
${d}.fm-tpl--summary .fm-tpl-slot--breakdown > .fm-stat {
  display: flex;
  flex-direction: column;
  border-bottom: 0.5em solid var(--fm-ink);
  padding-bottom: 0.5em;
}
${d}.fm-tpl--summary .fm-tpl-slot--breakdown .fm-stat__label {
  order: -1;
  margin: 0 0 calc(0.35em * var(--fm-fit-stat-label, 1));
  padding-bottom: calc(0.3em * var(--fm-fit-stat-label, 1) - var(--fm-border-give, 0px));
  border-bottom: var(--fm-border-width) solid var(--fm-border);
  text-transform: uppercase;
  color: var(--fm-ink);
}
${d}.fm-tpl--summary .fm-tpl-slot--breakdown .fm-stat__value { font-size: calc(2.1em / var(--fm-fit-stat-value, 1)); color: var(--fm-ink); }

/* findings: numbered findings in two columns, the number warm when the
   finding's lead is marked as bad news. The rows share what the page has
   left over, so the findings stand on a grid down to its foot rather than
   all at its top; a row is never shorter than its findings (a track of
   minmax(0, 1fr) clipped a long one under the next row's rule), and
   findings that need more than the page run past it, which the page map
   reports as OVERFULL. */
${d}.fm-tpl--findings {
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "kicker" "main" "items";
  row-gap: 1.6em;
}
${d}.fm-tpl--findings > .fm-kicker { color: var(--fm-accent-text); }
${d}.fm-tpl--findings .fm-tpl-main :is(h1, h2) { margin: 0; font-size: calc(2em / var(--fm-h-fit, 1)); }
${d}.fm-tpl--findings .fm-tpl-slot--items {
  grid-area: items;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(min-content, 1fr);
  gap: 2.4em 2.4em;
  font-size: 1.12em;
  counter-reset: fm-finding;
}
${d}.fm-tpl--findings .fm-tpl-slot--items > p {
  margin: 0;
  counter-increment: fm-finding;
  border-top: 0.15em solid var(--fm-ink);
  padding-top: 0.6em;
}
${d}.fm-tpl--findings .fm-tpl-slot--items > p::before {
  content: counter(fm-finding);
  display: block;
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  font-size: 2.8em;
  line-height: 1;
  margin-bottom: 0.15em;
  color: var(--fm-accent-text);
}
${d}.fm-tpl--findings .fm-tpl-slot--items > p:has(.fm-mark--danger)::before { color: var(--fm-danger); }
${d}.fm-tpl--findings .fm-tpl-slot--items > p > strong:first-child {
  display: block;
  font-family: var(--fm-font-heading);
  font-size: 1.12em;
  margin-bottom: 0.3em;
}

/* exec: the headline numbers stacked in a sidebar on a ground, the summary
   and its next steps beside them. */
${d}.fm-tpl--exec {
  grid-template-columns: minmax(0, 0.5fr) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas: "side kicker" "side main";
  column-gap: 2.2em;
  row-gap: 0;
}
${d}.fm-tpl--exec > .fm-kicker { color: var(--fm-accent-text); margin-bottom: calc(0.6em * var(--fm-fit-kicker, 1)); }
/* A slot on a ground (tone=) is an inset panel: the theme's corners, as
   every other panel in the report has. */
${d}.fm-tpl-slot.fm-tone { border-radius: var(--fm-radius); }
${d}.fm-tpl--exec .fm-tpl-slot--side {
  grid-area: side;
  padding: 2em 1.6em;
  display: flex;
  flex-direction: column;
  gap: 2.2em;
}
${d}.fm-tpl--exec .fm-tpl-slot--side .fm-stat__value { font-size: calc(2.8em / var(--fm-fit-stat-value, 1)); color: inherit; }
${d}.fm-tpl--exec .fm-tpl-slot--side .fm-stat__label { color: inherit; opacity: 0.85; }
${d}.fm-tpl--exec .fm-tpl-main :is(h1, h2) { margin-top: 0; }

/* opener: a large section number, the title and a line or two; an optional
   photo across the foot. */
${d}.fm-tpl--opener {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas: "number" "main" "." "media";
  row-gap: 1em;
}
${d}.fm-tpl--opener .fm-tpl__number {
  grid-area: number;
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  font-size: 9em;
  line-height: 0.9;
  letter-spacing: -0.03em;
  color: var(--fm-accent-text);
  margin-top: 0.4em;
}
${d}.fm-tpl--opener .fm-tpl-main :is(h1, h2) { font-size: calc(3.2em / var(--fm-h-fit, 1)); margin: 0 0 calc(0.3em * var(--fm-h-fit, 1)); line-height: calc(1.05 * var(--fm-h-fit, 1)); }
${d}.fm-tpl--opener .fm-tpl-main p { font-size: 1.2em; max-width: 30em; }
${photoRule(d, "opener", 0.32)}
${d}.fm-tpl:not(.fm-tpl--opener) .fm-tpl__number { display: none; }

/* back: everything at the foot of the page under an accent rule. */
${d}.fm-tpl--back {
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-areas: "kicker" "." "main";
}
${d}.fm-tpl--back::before {
  content: "";
  position: absolute;
  top: var(--fm-tpl-pad, 0);
  left: var(--fm-tpl-pad, 0);
  width: 30%;
  height: 0.25em;
  background: var(--fm-accent);
}
${d}.fm-tpl--back .fm-tpl-main {
  font-size: 0.9em;
  border-top: var(--fm-border-width) solid var(--fm-border);
  padding-top: calc(1.2em - var(--fm-border-give, 0px));
}
${d}.fm-tpl--back .fm-tpl-main .fm-logos { margin: 0 0 1.4em; }
${d}.fm-tpl--back .fm-tpl-main p:last-child { font-size: 0.85em; color: var(--fm-ink-muted); }

/* boxed: two columns of running prose over a boxed aside and its notes. */
${d}.fm-tpl--boxed {
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  grid-template-areas: "kicker" "main" "box" "notes";
  row-gap: 1.4em;
}
${d}.fm-tpl--boxed .fm-tpl-main { column-count: 2; column-gap: 1.8em; }
${d}.fm-tpl--boxed .fm-tpl-main :is(h1, h2, h3) { column-span: all; margin-top: 0; color: var(--fm-accent-text); }
${d}.fm-tpl--boxed .fm-tpl-slot--box {
  grid-area: box;
  background: var(--fm-surface-alt);
  border-radius: var(--fm-radius);
  padding: 1.4em 1.6em;
  column-count: 2;
  column-gap: 1.8em;
  font-size: 0.92em;
}
${d}.fm-tpl--boxed .fm-tpl-slot--box > .fm-tpl-slot__title {
  column-span: all;
  padding-bottom: calc(0.5em - var(--fm-border-give, 0px));
  border-bottom: var(--fm-border-width) solid var(--fm-border);
}
${d}.fm-tpl--boxed .fm-tpl-slot--notes { grid-area: notes; font-size: 0.78em; color: var(--fm-ink-muted); }

/* targets: a board of cards, each goal's figure set large, a rule and where
   the country stands today at its foot. */
${d}.fm-tpl--targets {
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "kicker" "main" "cards";
  row-gap: 1.4em;
}
${d}.fm-tpl--targets .fm-tpl-main :is(h1, h2) { margin: 0 0 calc(0.3em * var(--fm-h-fit, 1)); font-size: calc(2.2em / var(--fm-h-fit, 1)); }
${d}.fm-tpl--targets .fm-tpl-slot--cards {
  grid-area: cards;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 0.9em;
}
${d}.fm-tpl--targets .fm-card {
  margin: 0;
  background: none;
  border: 0.1em solid color-mix(in srgb, currentColor 70%, transparent);
  border-radius: var(--fm-radius);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  font-size: 0.9em;
}
${d}.fm-tpl--targets .fm-card__title {
  font-size: calc(0.85em / var(--fm-fit-card-title, 1));
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
${d}.fm-tpl--targets .fm-card p strong {
  font-family: var(--fm-font-heading);
  font-size: 2em;
  line-height: 1.05;
}
${d}.fm-card__progress {
  margin-top: auto;
  padding-top: 0.6em;
}
${d}.fm-card__progress-label {
  font-size: 0.72em;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-bottom: var(--fm-border-width) solid currentColor;
  padding-bottom: calc(0.25em - var(--fm-border-give, 0px));
}
${d}.fm-card__progress-value {
  text-align: right;
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  font-size: 1.3em;
  margin-top: 0.15em;
}

/* compare: two halves on contrasting grounds, the change on the seam. Each
   half's few lines sit centred on its ground, level with the change, so the
   grounds read as a poster rather than a page stopped half way. Both halves
   clear the disc on the seam. */
${d}.fm-tpl--compare {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "kicker kicker" "main main" "left right";
  column-gap: 0;
  row-gap: 1.2em;
}
${d}.fm-tpl--compare .fm-tpl-main :is(h1, h2) { margin-top: 0; }
${d}.fm-tpl--compare .fm-tpl-slot--left { grid-area: left; }
${d}.fm-tpl--compare .fm-tpl-slot--right { grid-area: right; }
${d}.fm-tpl--compare .fm-tpl-slot--left, ${d}.fm-tpl--compare .fm-tpl-slot--right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2.4em 2em;
}
${d}.fm-tpl--compare .fm-tpl-slot--left { padding-right: 3.4em; }
/* The halves meet at the seam: only their outer corners round. */
${d}.fm-tpl--compare .fm-tpl-slot--left.fm-tone { border-radius: var(--fm-radius) 0 0 var(--fm-radius); }
${d}.fm-tpl--compare .fm-tpl-slot--right.fm-tone { border-radius: 0 var(--fm-radius) var(--fm-radius) 0; }
${d}.fm-tpl--compare .fm-tpl-slot--right { padding-left: 3.4em; }
${d}.fm-tpl--compare .fm-tpl-slot .fm-stat__value { font-size: calc(4.2em / var(--fm-fit-stat-value, 1)); color: inherit; }
${d}.fm-tpl--compare .fm-tpl-slot .fm-stat__label { color: inherit; font-size: calc(1em / var(--fm-fit-stat-label, 1)); margin-bottom: calc(1.2em * var(--fm-fit-stat-label, 1)); }
${d}.fm-tpl--compare .fm-tpl-slot .fm-tpl-slot__label { color: inherit; opacity: 0.8; }
${d}.fm-tpl--compare .fm-tpl__delta {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  width: 5.6em;
  height: 5.6em;
  border-radius: calc(var(--fm-radius) * 999);
  display: grid;
  place-items: center;
  background: var(--fm-page);
  color: var(--fm-accent-text);
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  font-size: 1.1em;
  box-shadow: 0 0.1em 0.5em color-mix(in srgb, var(--fm-ink) 25%, transparent);
}
${d}.fm-tpl:not(.fm-tpl--compare) .fm-tpl__delta { display: none; }

/* timeline: milestones alternating either side of a spine, spread down
   its whole length. */
${d}.fm-tpl--timeline {
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "kicker" "main" "events";
  row-gap: 1.6em;
}
${d}.fm-tpl--timeline .fm-tpl-main :is(h1, h2) { margin: 0; }
${d}.fm-tpl--timeline .fm-tpl-slot--events {
  grid-area: events;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 1.4em;
  font-size: 1.1em;
}
${d}.fm-tpl--timeline .fm-tpl-slot--events::before {
  content: "";
  position: absolute;
  left: calc(50% - 0.1em);
  top: 0;
  bottom: 0;
  width: 0.2em;
  background: var(--fm-accent);
}
${d}.fm-tpl--timeline .fm-tpl-slot--events > p { position: relative; margin: 0; width: 44%; }
${d}.fm-tpl--timeline .fm-tpl-slot--events > p:nth-child(odd) { text-align: right; }
${d}.fm-tpl--timeline .fm-tpl-slot--events > p:nth-child(even) { margin-left: 56%; }
${d}.fm-tpl--timeline .fm-tpl-slot--events > p::after {
  content: "";
  position: absolute;
  top: 0.3em;
  width: 0.9em;
  height: 0.9em;
  border-radius: calc(var(--fm-radius) * 999);
  background: var(--fm-accent);
  border: 0.2em solid var(--fm-page);
}
${d}.fm-tpl--timeline .fm-tpl-slot--events > p:nth-child(odd)::after { right: calc(-6% / 0.44 - 0.65em); }
${d}.fm-tpl--timeline .fm-tpl-slot--events > p:nth-child(even)::after { left: calc(-6% / 0.44 - 0.65em); }
${d}.fm-tpl--timeline .fm-tpl-slot--events > p:has(.fm-mark--danger)::after { background: var(--fm-danger); }
${d}.fm-tpl--timeline .fm-tpl-slot--events > p > strong:first-child {
  display: block;
  font-family: var(--fm-font-heading);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fm-accent-text);
}

/* voices: a photo, a pull quote on a card over its lower edge, context. */
${d}.fm-tpl--voices {
  grid-template-rows: auto auto auto minmax(0, 1fr);
  grid-template-areas: "kicker" "media" "quote" "main";
  row-gap: 0;
}
${photoRule(d, "voices", 0.5)}
${d}.fm-tpl--voices .fm-tpl-slot--quote {
  grid-area: quote;
  position: relative;
  z-index: 1;
  margin: -4.5em 7% 1.6em;
  padding: 1.6em 1.8em 1.4em;
  background: var(--fm-page);
  border-radius: var(--fm-radius);
  font-family: var(--fm-font-heading);
  font-size: 1.35em;
  line-height: 1.3;
  box-shadow: 0 0.1em 0.6em color-mix(in srgb, var(--fm-ink) 18%, transparent);
}
${d}.fm-tpl--voices .fm-tpl-slot--empty + .fm-tpl-slot--quote,
${d}.fm-tpl--voices .fm-tpl-slot--quote:first-child {
  margin-top: 0;
}
${d}.fm-tpl--voices .fm-tpl-slot--quote::before {
  content: "\\201C";
  display: block;
  font-size: 2.6em;
  line-height: 0.6;
  color: var(--fm-accent-text);
}
${d}.fm-tpl--voices .fm-tpl-slot--quote > p {
  font-size: calc(1em / var(--fm-fit-quote, 1));
  line-height: calc(1.3 * var(--fm-fit-quote, 1));
}
${d}.fm-tpl--voices .fm-tpl-slot--quote .fm-quote__cite {
  display: block;
  margin-top: calc(0.8em * var(--fm-fit-cite, 1));
  font-family: var(--fm-font-body);
  font-size: calc(0.55em / var(--fm-fit-cite, 1));
  line-height: calc(1.3 * var(--fm-fit-cite, 1));
  font-style: normal;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--fm-accent-text);
}
${d}.fm-tpl--voices .fm-tpl-slot--media .fm-figure__caption { display: none; }
${d}.fm-tpl--voices .fm-tpl-main { max-width: 34em; }

/* spotlight: the prose in a column; beside it a short paragraph, then a
   panel (the portrait and the quote, both on the accent ground) running to
   the sheet's right edge. The template reaches the edge through the bleed
   margin, and the right column's padding brings its text back to the
   measure, as a band does. */
${d}.fm-tpl--spotlight {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "main top" "main media" "main quote";
  column-gap: 2.2em;
  row-gap: 0;
  margin-right: var(--fm-bleed-margin);
  --fm-tpl-fill: main;
}
${d}.fm-tpl--spotlight .fm-tpl-main :is(h1, h2) { margin-top: 0; }
/* The panel starts a fifth of the way down at least, as a short paragraph
   above it would otherwise lift it to the top and leave its foot empty. */
${d}.fm-tpl--spotlight .fm-tpl-slot--top {
  grid-area: top;
  min-height: calc(var(--fm-page-area, 245mm) * 0.2);
  box-sizing: border-box;
  padding: 0 var(--fm-bleed-pad) 2em 0;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--media {
  padding: 2.6em var(--fm-bleed-pad) 0 2.4em;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--media img {
  display: block;
  width: 64%;
  max-width: none;
  height: auto;
  max-height: none;
  aspect-ratio: 1;
  margin: 0 auto;
  border-radius: calc(var(--fm-radius) * 999);
  object-fit: cover;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--media .fm-figure__caption { display: none; }
/* The editor's Add photo box, where the portrait will stand: a dashed
   circle inside the panel, which stays one ground. */
${d}.fm-tpl--spotlight .fm-tpl-slot--empty.fm-tpl-slot--media {
  min-height: 0;
  border: none;
  border-radius: 0;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--empty.fm-tpl-slot--media::after {
  display: grid;
  place-items: center;
  width: 64%;
  aspect-ratio: 1;
  border: 2px dashed currentColor;
  border-radius: calc(var(--fm-radius) * 999);
  opacity: 0.85;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--quote {
  grid-area: quote;
  padding: 2.4em var(--fm-bleed-pad) 2.4em 2.4em;
  font-family: var(--fm-font-heading);
  font-weight: var(--fm-heading-weight);
  font-size: 1.5em;
  line-height: 1.25;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--quote::before {
  content: "\\201C";
  display: block;
  font-size: 2.2em;
  line-height: 0.7;
  margin-bottom: 0.1em;
}
${d}.fm-tpl--spotlight .fm-tpl-slot--quote > p {
  font-size: calc(1em / var(--fm-fit-quote, 1));
  line-height: calc(1.25 * var(--fm-fit-quote, 1));
}
${d}.fm-tpl--spotlight .fm-tpl-slot--quote .fm-quote__cite {
  display: block;
  margin-top: calc(1.2em * var(--fm-fit-cite, 1));
  font-family: var(--fm-font-body);
  font-size: calc(0.55em / var(--fm-fit-cite, 1));
  font-style: normal;
  font-weight: 700;
  line-height: calc(1.4 * var(--fm-fit-cite, 1));
}

/* feature: the heading, a bold lead and the prose in a column; the photo
   fills the rest of the page, out to the sheet's right edge. */
${d}.fm-tpl--feature {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas: "kicker media" "main media";
  column-gap: 2.4em;
  row-gap: 0;
  margin-right: var(--fm-bleed-margin);
  --fm-tpl-fill: main;
}
${d}.fm-tpl--feature > .fm-kicker { margin-bottom: calc(0.8em * var(--fm-fit-kicker, 1)); }
${d}.fm-tpl--feature .fm-tpl-main :is(h1, h2) { margin-top: 0; }
${d}.fm-tpl--feature .fm-tpl-slot--media .fm-figure { height: 100%; }
${d}.fm-tpl--feature .fm-tpl-slot--media img {
  display: block;
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  object-fit: cover;
}
${d}.fm-tpl--feature .fm-tpl-slot--media .fm-figure__caption { display: none; }

/* profile: a map and a column of facts under the district's name. */
${d}.fm-tpl--profile {
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "kicker kicker" "main main" "map facts";
  row-gap: 1.2em;
}
${d}.fm-tpl--profile > .fm-kicker { color: var(--fm-accent-text); }
${d}.fm-tpl--profile .fm-tpl-main :is(h1, h2) {
  margin: 0 0 calc(0.4em * var(--fm-h-fit, 1));
  font-size: calc(2.4em / var(--fm-h-fit, 1));
  padding-bottom: calc(0.3em * var(--fm-h-fit, 1));
  border-bottom: calc(0.08em * var(--fm-h-fit, 1)) solid var(--fm-ink);
}
${d}.fm-tpl--profile .fm-tpl-slot--map { grid-area: map; }
${d}.fm-tpl--profile .fm-tpl-slot--map img { width: 100%; height: auto; max-height: 100%; object-fit: contain; }
${d}.fm-tpl--profile .fm-tpl-slot--facts {
  grid-area: facts;
  display: flex;
  flex-direction: column;
  gap: 1.4em;
}
${d}.fm-tpl--profile .fm-tpl-slot--facts > .fm-stat {
  border-bottom: var(--fm-border-width) solid var(--fm-border);
  padding-bottom: calc(0.7em - var(--fm-border-give, 0px));
  display: flex;
  flex-direction: column;
}
${d}.fm-tpl--profile .fm-tpl-slot--facts .fm-stat__label {
  order: -1;
  margin: 0 0 calc(0.2em * var(--fm-fit-stat-label, 1));
  font-size: calc(0.72em / var(--fm-fit-stat-label, 1));
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
${d}.fm-tpl--profile .fm-tpl-slot--facts .fm-stat__value { font-size: calc(2.4em / var(--fm-fit-stat-value, 1)); }
${d}.fm-tpl--profile .fm-tpl-slot--facts .fm-stat__delta { align-self: flex-start; }

/* method: short panels in a grid, the citation at the foot. */
${d}.fm-tpl--method {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas: "kicker" "main" "panels" "cite";
  row-gap: 1.4em;
  --fm-tpl-fill: panels;
}
${d}.fm-tpl--method .fm-tpl-main :is(h1, h2) { margin: 0; }
${d}.fm-tpl--method .fm-tpl-slot--panels {
  grid-area: panels;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  gap: 1.8em 2.2em;
}
${d}.fm-tpl--method .fm-card { margin: 0; background: none; border: none; padding: 0; font-size: 0.95em; }
${d}.fm-tpl--method .fm-card__title { font-size: calc(1.1em / var(--fm-fit-card-title, 1)); }
${d}.fm-tpl--method .fm-tpl-slot--cite {
  grid-area: cite;
  background: var(--fm-page);
  border-radius: var(--fm-radius);
  padding: 1.1em 1.3em;
  font-size: 0.88em;
}

/* ladder: results stacked as full-width bars stepping from the accent to
   the ink, each with an icon disc rising from its foot. */
${d}.fm-tpl--ladder {
  grid-template-rows: auto auto minmax(0, 1fr);
  grid-template-areas: "kicker" "main" "rows";
  row-gap: 1.4em;
}
${d}.fm-tpl--ladder > .fm-kicker { color: var(--fm-accent-text); }
${d}.fm-tpl--ladder .fm-tpl-main {
  border-bottom: 0.25em solid var(--fm-accent);
  padding-bottom: 0.8em;
}
${d}.fm-tpl--ladder .fm-tpl-main :is(h1, h2) { margin: 0 0 calc(0.3em * var(--fm-h-fit, 1)); text-transform: uppercase; }
${d}.fm-tpl--ladder .fm-tpl-slot--rows {
  grid-area: rows;
  display: grid;
  grid-auto-rows: minmax(0, 1fr);
  gap: 0.4em;
}
${d}.fm-tpl--ladder .fm-tpl-slot--rows > .fm-stat {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 24% minmax(0, 1fr) minmax(0, 0.8fr);
  grid-template-areas: "icon value label";
  align-items: center;
  column-gap: 1.2em;
  padding: 0 1.4em 0 0;
  border-radius: var(--fm-radius);
  color: var(--fm-ink-ground-ink);
  background: color-mix(in srgb, var(--fm-accent-ground) var(--fm-rung, 100%), var(--fm-ink-ground));
}
${d}.fm-tpl--ladder .fm-tpl-slot--rows > .fm-stat:nth-child(2) { --fm-rung: 78%; }
${d}.fm-tpl--ladder .fm-tpl-slot--rows > .fm-stat:nth-child(3) { --fm-rung: 56%; }
${d}.fm-tpl--ladder .fm-tpl-slot--rows > .fm-stat:nth-child(4) { --fm-rung: 34%; }
${d}.fm-tpl--ladder .fm-tpl-slot--rows > .fm-stat:nth-child(5) { --fm-rung: 14%; }
${d}.fm-tpl--ladder .fm-tpl-slot--rows > .fm-stat:nth-child(6) { --fm-rung: 0%; }
${d}.fm-tpl--ladder .fm-tpl-slot--rows .fm-icon {
  grid-area: icon;
  align-self: end;
  justify-self: center;
  width: 3.6em;
  height: 3.6em;
  margin: 0 0 -0.6em;
  padding: 0.9em;
  border-radius: calc(var(--fm-radius) * 999);
  box-sizing: content-box;
  color: var(--fm-ink-ground);
  background: var(--fm-page);
  -webkit-mask: none;
  mask: none;
  position: relative;
}
${d}.fm-tpl--ladder .fm-tpl-slot--rows .fm-icon::after {
  content: "";
  position: absolute;
  inset: 0.9em;
  background: currentColor;
  -webkit-mask: var(--fm-icon) center / contain no-repeat;
  mask: var(--fm-icon) center / contain no-repeat;
}
${d}.fm-tpl--ladder .fm-tpl-slot--rows .fm-stat__value {
  grid-area: value;
  font-size: calc(3em / var(--fm-fit-stat-value, 1));
  text-align: right;
  color: inherit;
}
${d}.fm-tpl--ladder .fm-tpl-slot--rows .fm-stat__label {
  grid-area: label;
  margin: 0;
  font-size: calc(0.95em / var(--fm-fit-stat-label, 1));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: inherit;
}

/* scorecard: a table whose cells fill with the status their mark names. The
   table takes the page down to the notes, its rows sharing the height. */
${d}.fm-tpl--scorecard {
  grid-template-rows: auto auto minmax(min-content, 1fr) auto;
  grid-template-areas: "kicker" "main" "table" "notes";
  row-gap: 1.2em;
}
${d}.fm-tpl--scorecard .fm-tpl-main :is(h1, h2) { margin: 0 0 calc(0.3em * var(--fm-h-fit, 1)); }
${d}.fm-tpl--scorecard .fm-tpl-slot--table { grid-area: table; }
${d}.fm-tpl--scorecard .fm-tpl-slot--notes { grid-area: notes; font-size: 0.82em; color: var(--fm-ink-muted); }
${d}.fm-tpl--scorecard table { width: 100%; height: 100%; margin: 0; border-collapse: separate; border-spacing: 0.2em; font-size: 1.1em; }
${d}.fm-tpl--scorecard td, ${d}.fm-tpl--scorecard th { padding: 0.55em 0.7em; border: none; vertical-align: middle; }
${d}.fm-tpl--scorecard th { padding: calc(0.55em * var(--fm-fit-th, 1)) calc(0.7em * var(--fm-fit-th, 1)); }
${d}.fm-tpl--scorecard td:has(> .fm-mark--success) { background: color-mix(in srgb, var(--fm-success) 22%, transparent); }
${d}.fm-tpl--scorecard td:has(> .fm-mark--warning) { background: color-mix(in srgb, var(--fm-warning) 22%, transparent); }
${d}.fm-tpl--scorecard td:has(> .fm-mark--danger) { background: color-mix(in srgb, var(--fm-danger) 22%, transparent); }
${d}.fm-tpl--scorecard td:has(> .fm-mark--info) { background: color-mix(in srgb, var(--fm-info) 22%, transparent); }
${d}.fm-tpl--scorecard td > .fm-mark { font-weight: 700; }
`;
}

// A page template's area that holds more than it shows: its source line (the
// template's), the area (`main` or a slot's name) and the px it is over by.
export type FastrTemplateOverfull = { line: number; area: string; px: number };

// The areas of one rendered template that hold more than they show: an area
// clipped inside its grid track, or one an auto track pushed past the
// template's own foot. The editor runs it on its widget and print's runner
// on each page (its source is embedded in the runner as
// FASTR_TEMPLATE_OVERFLOW_JS), so both report the same areas. Self-contained
// for that reason: it may name nothing outside itself.
export function fastrTemplateOverflow(
  tpl: Element,
): { area: string; px: number }[] {
  const out: { area: string; px: number }[] = [];
  const foot = tpl.getBoundingClientRect().bottom;
  for (let i = 0; i < tpl.children.length; i++) {
    const kid = tpl.children[i] as HTMLElement;
    // An empty area prints nothing; the editor draws it as a box to fill.
    if (kid.classList.contains("fm-tpl-slot--empty")) continue;
    const m = /\bfm-tpl-slot--([a-z0-9-]+)\b/.exec(kid.className);
    const area = kid.classList.contains("fm-tpl-main")
      ? "main"
      : m !== null && m[1] !== "empty"
      ? m[1]
      : undefined;
    if (area === undefined) continue;
    // Clipped is a child box running past the area's content edge. Not the
    // area's scrollHeight: that counts a theme's decoration drawn in a
    // heading's margin (a pseudo-element rule) and a text run's font box
    // past its line height, neither of which hides a word. An absolutely
    // placed child is decoration too.
    const box = kid.getBoundingClientRect();
    const style = getComputedStyle(kid);
    const inner = box.bottom - parseFloat(style.paddingBottom) -
      parseFloat(style.borderBottomWidth);
    let low = inner;
    for (let j = 0; j < kid.children.length; j++) {
      const child = kid.children[j];
      const placed = getComputedStyle(child).position;
      if (placed === "absolute" || placed === "fixed") continue;
      const r = child.getBoundingClientRect();
      if (r.height > 0 || r.width > 0) low = Math.max(low, r.bottom);
    }
    const px = Math.max(low - inner, box.bottom - foot, 0);
    if (px > 2) out.push({ area, px: Math.round(px) });
  }
  return out;
}
export const FASTR_TEMPLATE_OVERFLOW_JS =
  `(${fastrTemplateOverflow.toString()})`;

// How far down its page a rendered template's content reaches, as a share of
// the template's height. A layout whose words sit in areas a ground or a
// photo stretches to the foot declares those areas (--fm-tpl-fill: main, or
// slot names such as `panels`): it is held to the lowest foot of their
// content, whatever stands beside it and whatever its ground, since a photo
// or a painted panel says nothing about the hole under the words. Otherwise
// a template on a ground of its own is a ground edge to edge, so it is full;
// so is one waiting on its photo (an empty media slot prints nothing, and
// the user fills it, not the author); and an area painted with a background
// counts to its foot, any other to its lowest child. A half-empty template
// reads as a page someone forgot to finish, which is the reason it is
// measured.
// Self-contained like fastrTemplateOverflow: print's runner embeds its
// source (FASTR_TEMPLATE_FILL_JS).
export function fastrTemplateFill(tpl: Element): number {
  const box = tpl.getBoundingClientRect();
  if (box.height <= 0) return 1;
  const declared = getComputedStyle(tpl).getPropertyValue("--fm-tpl-fill")
    .trim().split(/\s+/).filter((n) => n.length > 0);
  let own: number | undefined = undefined;
  for (const name of declared) {
    const area = tpl.querySelector(
      name === "main"
        ? ":scope > .fm-tpl-main"
        : `:scope > .fm-tpl-slot--${name}`,
    );
    if (area === null || area.classList.contains("fm-tpl-slot--empty")) {
      continue;
    }
    own = Math.max(own ?? box.top, area.getBoundingClientRect().top);
    for (let j = 0; j < area.children.length; j++) {
      const r = area.children[j].getBoundingClientRect();
      if (r.height > 0) own = Math.max(own, r.bottom);
    }
  }
  if (own !== undefined) return Math.min(1, (own - box.top) / box.height);
  if (/\bfm-(tone|has-bg|has-bgimage)\b/.test(tpl.className)) return 1;
  if (tpl.querySelector(".fm-tpl-slot--empty.fm-tpl-slot--media") !== null) {
    return 1;
  }
  let reach = box.top;
  for (let i = 0; i < tpl.children.length; i++) {
    const kid = tpl.children[i];
    // As in fastrTemplateOverflow: an empty area prints nothing.
    if (kid.classList.contains("fm-tpl-slot--empty")) continue;
    const rect = kid.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const style = getComputedStyle(kid);
    const painted = style.backgroundImage !== "none" ||
      !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(style.backgroundColor);
    if (painted || kid.children.length === 0) {
      reach = Math.max(reach, rect.bottom);
      continue;
    }
    for (let j = 0; j < kid.children.length; j++) {
      const r = kid.children[j].getBoundingClientRect();
      if (r.height > 0) reach = Math.max(reach, r.bottom);
    }
  }
  return Math.min(1, (reach - box.top) / box.height);
}
export const FASTR_TEMPLATE_FILL_JS = `(${fastrTemplateFill.toString()})`;

// The Insert menu's page-template thumbnails: each layout's real example
// under the toolbar's scoped sheet, on an A4-shaped tile whose height stands
// in for the page area, shrunk by a small font-size (the sheet is em
// throughout). An empty photo slot shows as a panel, as a photo would.
export const FASTR_TEMPLATE_TILE_PX = { width: 92, height: 130 } as const;
export function buildFastrTemplateTileCss(scope: string): string {
  const d = `${scope}.fm-tpl-tile`;
  return `
${d} {
  position: relative;
  width: ${FASTR_TEMPLATE_TILE_PX.width}px;
  height: ${FASTR_TEMPLATE_TILE_PX.height}px;
  overflow: hidden;
  font-size: 2.3px;
  line-height: 1.4;
  border-radius: 3px;
  background: var(--fm-page);
  color: var(--fm-ink);
  font-family: var(--fm-font-body);
  pointer-events: none;
  --fm-page-area: ${FASTR_TEMPLATE_TILE_PX.height - 16}px;
}
${d} .fm-tpl {
  position: absolute;
  inset: 0;
  height: 100%;
  padding: 8px 9px;
}
${d} .fm-tpl-slot--empty.fm-tpl-slot--media {
  display: block;
  height: calc(var(--fm-page-area) * 0.32);
  background: var(--fm-surface-alt);
}
/* Where the layout's photo fills a column, so does its stand-in; where it
   is a portrait on a panel, the stand-in is a disc on the panel. */
${d} .fm-tpl--feature .fm-tpl-slot--empty.fm-tpl-slot--media { height: auto; }
${d} .fm-tpl--spotlight .fm-tpl-slot--empty.fm-tpl-slot--media {
  height: calc(var(--fm-page-area) * 0.22);
  background: radial-gradient(circle closest-side, color-mix(in srgb, currentColor 35%, transparent) 70%, transparent 72%), var(--fm-accent-ground);
}
`;
}
