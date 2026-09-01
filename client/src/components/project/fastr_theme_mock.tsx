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
`;

// One scoped copy of the real sheet per theme, plus one per custom style
// (skinned by its stored palette). Mounted once by the picker.
export function FastrThemeMockStyles(p: { customStyles: ReportCustomStyle[] }) {
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
        <div class="fm-card fm-card--accent">
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
      <div class="fm-band fm-tone fm-tone--dark">
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
