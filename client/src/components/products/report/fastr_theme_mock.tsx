import {
  buildFastrReportCss,
  FASTR_REPORT_THEMES,
  fastrAllFontImportsCss,
  type FastrReportTheme,
  type ReportCustomStyle,
  t3,
} from "lib";
import { Show } from "solid-js";

// Creation-picker tiles for FASTR Markdown themes. Unlike the html style tiles
// — hand-authored impressions, because the real output is AI-written and
// unknowable — these render the ACTUAL theme stylesheet over the ACTUAL fm-*
// markup, scoped to the tile. What you see is what the report will be.
//
// The scale trick: the sheet is written in em throughout, so a small root
// font-size on the tile shrinks the whole design proportionally.

const TILE_FONT_PX = 4.6;

function scopeFor(theme: FastrReportTheme): string {
  return `fmt-${theme}`;
}

function customScopeFor(styleId: string): string {
  return `fmt-c-${styleId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const TILE_SHELL_CSS = `
.fmt-tile {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid var(--color-base-300);
  pointer-events: none;
  padding: 2.2em 2.4em;
  line-height: 1.5;
}
.fmt-tile > :last-child { margin-bottom: 0; }
.fmt-tile .fmt-bar {
  display: block;
  height: 0.5em;
  margin: 0.45em 0;
  border-radius: 1px;
  background: var(--fm-border);
}
.fmt-tile .fm-callout .fmt-bar { background: var(--fm-ink-muted); opacity: 0.35; }
/* Template thumbnails: a portrait page, the template's real body under the
   chosen theme, the first page's worth showing (as a word processor's
   template gallery does). A cover keeps a band's height rather than the
   sheet's, so a little of what follows it shows too. */
.fmt-page {
  aspect-ratio: 210 / 297;
  overflow: hidden;
  border-radius: 4px;
  border: 1px solid var(--color-base-300);
  pointer-events: none;
  padding: 0 3em 2em;
  line-height: 1.5;
}
.fmt-page > :first-child:not(.fm-cover) { margin-top: 3em; }
/* The theme sheet's own cover rules (a rem min-height, a bleed margin that
   pulls the band into the page padding) are scoped as tightly as these, so
   the tile's must win outright. */
.fmt-page.fmt-page .fm-cover {
  min-height: 0 !important;
  margin-top: 0 !important;
  padding-top: 6em !important;
  padding-bottom: 6em !important;
}
.fmt-page--empty { display: flex; align-items: center; justify-content: center; }
`;

// One scoped copy of the real sheet per theme, plus one per custom style
// (skinned by its stored palette). Mounted once by the picker.
// Only a style's id and palette matter here, so a report's stored style
// snapshot serves as well as a library row.
export function FastrThemeMockStyles(p: {
  customStyles: Pick<ReportCustomStyle, "id" | "colors">[];
}) {
  return (
    <style>
      {[
        // @import must lead the sheet or the browser drops it.
        fastrAllFontImportsCss(),
        TILE_SHELL_CSS,
        ...FASTR_REPORT_THEMES.map((t) =>
          buildFastrReportCss(t, undefined, `.${scopeFor(t)}`, {
            omitFontImport: true,
          })
        ),
        ...p.customStyles.map((s) =>
          buildFastrReportCss(
            "default",
            s.colors ?? undefined,
            `.${customScopeFor(s.id)}`,
            { omitFontImport: true },
          )
        ),
      ].join("\n")}
    </style>
  );
}

// Real markup, greeked where the words would not survive the scale.
function MockContent() {
  return (
    <>
      <h1>{t3({ en: "Report", fr: "Rapport", pt: "Relatório" })}</h1>
      <i class="fmt-bar" style={{ width: "94%" }} />
      <i class="fmt-bar" style={{ width: "76%" }} />
      <div class="fm-callout fm-callout--note">
        <div class="fm-callout__title">
          {t3({ en: "Key finding", fr: "Constat", pt: "Conclusão" })}
        </div>
        <i class="fmt-bar" style={{ width: "88%" }} />
      </div>
      <div class="fm-tiles fm-tiles--3">
        <div class="fm-stat">
          <div class="fm-stat__value">64%</div>
          <div class="fm-stat__label">
            {t3({ en: "Coverage", fr: "Couverture", pt: "Cobertura" })}
          </div>
        </div>
        <div class="fm-card">
          <i class="fmt-bar" style={{ width: "90%" }} />
          <i class="fmt-bar" style={{ width: "70%" }} />
        </div>
        <div class="fm-card fm-tone fm-tone--accent">
          <i class="fmt-bar" style={{ width: "80%" }} />
          <i class="fmt-bar" style={{ width: "55%" }} />
        </div>
      </div>
      {/* An h2 earns its place: the themes differ most in heading treatment
          (Swiss uppercase, Ministry green, Editorial rules). */}
      <h2>{t3({ en: "Findings", fr: "Constats", pt: "Constatações" })}</h2>
      <i class="fmt-bar" style={{ width: "96%" }} />
      <i class="fmt-bar" style={{ width: "88%" }} />
      {/* The theme's own dark ground — the thing a full-width band paints, and
          the clearest difference between one theme's dark and another's. */}
      <div class="fm-band fm-tone fm-tone--ink">
        <i class="fmt-bar" style={{ width: "70%" }} />
        <i class="fmt-bar" style={{ width: "48%" }} />
      </div>
    </>
  );
}

export function FastrThemeMock(p: { theme: FastrReportTheme }) {
  return (
    <div
      class={`fmt-tile ${scopeFor(p.theme)}`}
      style={{ "font-size": `${TILE_FONT_PX}px` }}
      aria-hidden="true"
    >
      <MockContent />
    </div>
  );
}

export function FastrCustomThemeMock(p: { style: ReportCustomStyle }) {
  return (
    <Show
      when={p.style.colors}
      fallback={<FastrThemeMock theme="default" />}
    >
      <div
        class={`fmt-tile ${customScopeFor(p.style.id)}`}
        style={{ "font-size": `${TILE_FONT_PX}px` }}
        aria-hidden="true"
      >
        <MockContent />
      </div>
    </Show>
  );
}

// The scope class a mock renders under: the theme's sheet, or a custom
// style's palette over the default one.
export function fastrMockScopeClass(
  theme: FastrReportTheme,
  customStyleId?: string,
): string {
  return customStyleId === undefined ? scopeFor(theme) : customScopeFor(customStyleId);
}

// A template's first page: its real body rendered through the report's own
// renderer under the mock sheet of the chosen look (FastrThemeMockStyles must
// be mounted, with the custom style when there is one). `html` is the
// sanitized render; undefined draws the blank page.
export function FastrTemplateMock(p: { scopeClass: string; html: string | undefined }) {
  return (
    <Show
      when={p.html !== undefined && p.html.trim().length > 0}
      fallback={
        <div
          class={`fmt-page fmt-page--empty ${p.scopeClass}`}
          style={{ "font-size": "3.6px" }}
          aria-hidden="true"
        >
          <span class="text-base-content-muted font-light" style={{ "font-size": "40px" }}>+</span>
        </div>
      }
    >
      <div
        class={`fmt-page ${p.scopeClass}`}
        style={{ "font-size": "3.6px" }}
        aria-hidden="true"
        innerHTML={p.html}
      />
    </Show>
  );
}
