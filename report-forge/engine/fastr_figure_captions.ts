// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// Figure conventions: numbered captions, captions above the figure, and a
// source line under it, the way a ministry bulletin sets its charts and
// tables ("Figure 3 : …" over the chart, "Source : DHIS2 SNIS" under it).
//
// Document-wide, they are attributes of the `:::report` header:
//
//   :::report{figures=numbered captions=above source="DHIS2 SNIS"}
//
// and per figure, attributes of the embed line's `{…}` block:
//
//   ![Couverture vaccinale](figure:<id>){source="PEV" as=table}
//
// `as=table` counts the figure in the table sequence ("Tableau N") rather
// than the figure one; a native markdown table takes a caption from a
// `Table: <caption>` line directly above it, and is counted there too. The
// two sequences run separately, as a bulletin numbers them.
//
// The numbers are the compiler's (report_fastr_markdown.ts, fm_figures),
// which counts in document order; fastrFigureNumbers reads them back from one
// parse, so the editor, print and Word can never number a figure differently.
// =============================================================================

import {
  type FastrContainerAttrs,
  fastrReportHeaderAttrs,
} from "./fastr_markdown_blocks.ts";
import { t3 } from "./i18n.ts";

export type FastrFigureSettings = {
  // `figures=numbered`: each captioned figure and table carries its number.
  numbered: boolean;
  // `captions=above`: the caption opens the figure, as a title over it.
  above: boolean;
  // `source="…"`: the line under every figure that does not say otherwise.
  source: string | undefined;
};

export type FastrCaptionKind = "figure" | "table";

// Where an editor slice starts counting: the numbers taken before it.
export type FastrFigureCounters = { figure: number; table: number };

// What a renderer of a SLICE of the document needs to set its figures as the
// whole document does: the document's settings and where its counts start.
// Absent, the renderer reads the settings from the source it was given and
// counts from 1 (a whole document).
export type FastrFigureRenderContext = {
  settings: FastrFigureSettings;
  first: FastrFigureCounters;
};

// What the compiler decided for one figure or captioned table, kept on its
// opening token (`meta.fmCaption`) for the Word export and the number index.
export type FastrCaptionMeta = {
  kind: FastrCaptionKind;
  // Undefined when the document does not number its figures, or the figure
  // has no caption (an uncaptioned figure is decoration and takes no number).
  n: number | undefined;
  caption: string;
  above: boolean;
  source: string | undefined;
};

export const FASTR_NO_FIGURE_SETTINGS: FastrFigureSettings = {
  numbered: false,
  above: false,
  source: undefined,
};

// A native table's caption: `Table: <caption>` on the line directly above the
// table's header row. The keyword is syntax, not prose, so it is the same in
// every language; the label it prints is translated.
export const FASTR_TABLE_CAPTION_RE = /^\s*Table:[ \t]+(\S.*?)\s*$/;

export function readFastrFigureSettings(body: string): FastrFigureSettings {
  const attrs = fastrReportHeaderAttrs(body);
  if (attrs === undefined) return FASTR_NO_FIGURE_SETTINGS;
  return fastrFigureSettingsOf(attrs);
}

export function fastrFigureSettingsOf(
  attrs: FastrContainerAttrs,
): FastrFigureSettings {
  const source = attrs["source"];
  return {
    numbered: attrs["figures"] === "numbered",
    above: attrs["captions"] === "above",
    source: typeof source === "string" && source.trim().length > 0 &&
        source.trim() !== "none"
      ? source.trim()
      : undefined,
  };
}

// One figure's source line: its own `source=`, else the document's, except
// where it says `source=none`. An image takes only its own: a photograph or a
// logo is not the document's data.
export function fastrFigureSource(
  attrs: FastrContainerAttrs,
  settings: FastrFigureSettings,
  embedKind: "figure" | "image",
): string | undefined {
  const own = attrs["source"];
  if (own === "none") return undefined;
  if (typeof own === "string" && own.trim().length > 0) return own.trim();
  return embedKind === "figure" ? settings.source : undefined;
}

export function fastrCaptionKindOf(
  attrs: FastrContainerAttrs,
): FastrCaptionKind {
  return attrs["as"] === "table" ? "table" : "figure";
}

// "Figure 3 :" — French sets a no-break space before its colon.
export function fastrCaptionLabel(kind: FastrCaptionKind, n: number): string {
  const word = kind === "table"
    ? t3({ en: "Table", fr: "Tableau", pt: "Tabela" })
    : t3({ en: "Figure", fr: "Figure", pt: "Figura" });
  return `${word} ${n}${t3({ en: ":", fr: "\u00a0:", pt: ":" })}`;
}

export function fastrSourceLabel(): string {
  return t3({ en: "Source:", fr: "Source\u00a0:", pt: "Fonte:" });
}

// A stable key for a render context, for a widget's equality test.
export function fastrFigureContextKey(
  ctx: FastrFigureRenderContext | undefined,
): string {
  if (ctx === undefined) return "";
  const s = ctx.settings;
  return [
    s.numbered ? 1 : 0,
    s.above ? 1 : 0,
    s.source ?? "",
    ctx.first.figure,
    ctx.first.table,
  ].join("\u0001");
}
