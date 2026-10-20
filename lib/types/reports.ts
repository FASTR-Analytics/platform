// =============================================================================
// Reports: long-form analytical documents (a FASTR Markdown body plus figure
// and image registries). See SYSTEM_12_documents_sharing.md "Reports".
// Figures/images reuse the slide FigureBlock / ImageBlock types verbatim.
//
// The body's own helpers (embed tokens, the sanitizer config) are the report
// engine's: report-forge/engine/embeds.ts.
// =============================================================================

import { z } from "zod";
import {
  type FastrReportTheme,
  isFastrReportTheme,
} from "../../report-forge/engine/report_fastr_themes.ts";
// For its side effect: the `legacy` theme is the platform's own and exists
// only once this has run. The schemas below validate against the engine's
// registry, so the registration must come first; importing it here makes that
// true for every caller. See the file's own note.
import "../report_legacy_theme.ts";
import { reportStyleColorsSchema } from "./report_styles.ts";
import type { ImageBlock } from "./slides.ts";
import type { FigureBlock } from "./_figure_bundle.ts";
import { figureBlockSchema, imageBlockSchema } from "./_slide_config.ts";

// ── Format ───────────────────────────────────────────────────────────────────

// Every report is FASTR Markdown: markdown plus the `:::` container blocks
// (report-forge/engine/fastr_markdown_blocks.ts), rendered through a real
// theme stylesheet (report-forge/engine/report_fastr_css.ts). Two older formats are retired: plain markdown,
// which the reports data transform converts on boot, and html, whose body
// cannot be converted. A report still stored as html opens to a notice
// instead of an editor (isRetiredReportFormat).
export const REPORT_FORMAT = "fastr";
const RETIRED_REPORT_FORMATS: readonly string[] = ["html"];

// ── Config ───────────────────────────────────────────────────────────────────

// Snapshot of a custom style taken at creation (live ref + snapshot fallback:
// the id resolves the live library brief while the style exists and is visible
// to the project; otherwise this copy keeps working).
export type ReportCustomStyleSnapshot = {
  id: string;
  label: string;
  brief: string;
  referenceCss?: string | null;
  colors?: { page: string; ink: string; accent: string } | null;
};

const reportCustomStyleSnapshotSchema = z.object({
  id: z.string(),
  label: z.string(),
  brief: z.string(),
  referenceCss: z.string().nullable().optional(),
  colors: reportStyleColorsSchema.nullable().optional(),
});

export type ReportConfig = {
  // Reserved for future per-report theming / header-footer.
  version?: number;
  // "fastr" on every live report. Kept as a stored string so a report still
  // on a retired format can be told apart (isRetiredReportFormat).
  format?: string;
  // Fixed at creation. Only its colors are used: they override the theme's
  // palette (see getReportCustomStyle callers).
  customStyle?: ReportCustomStyleSnapshot;
  // Changeable at any time: a FASTR Markdown body carries no CSS, so
  // re-theming can never invalidate it.
  fastrTheme?: FastrReportTheme;
  // False ONLY on a report minted since the theme modal existed and never
  // answered: the editor opens the modal once on that report and sets it
  // true. Absent on every older report, so none of them is interrupted by a
  // modal about a choice they were never offered.
  themeChosen?: boolean;
};

// A theme id the engine knows: its ten built-ins plus `legacy`
// (report_legacy_theme.ts). The themes are a registry, not a closed list, so
// this is a membership test instead of an enum. It must keep REJECTING an
// unknown id: that failure is what routes a report on a retired theme into
// the reports data transform (Block 3).
export const fastrReportThemeSchema = z.string().refine(isFastrReportTheme, {
  message: "Unknown report theme",
});

// passthrough: a stored config may still carry keys of retired features (the
// html format's htmlStyle, the starting template's `template`); they ride
// along untouched and nothing reads them.
export const reportConfigSchema = z
  .object({
    version: z.number().optional(),
    format: z.string().optional(),
    customStyle: reportCustomStyleSnapshotSchema.optional(),
    fastrTheme: fastrReportThemeSchema.optional(),
    themeChosen: z.boolean().optional(),
  })
  .passthrough();

export function getStartingConfigForReport(
  customStyle?: ReportCustomStyleSnapshot,
  fastrTheme: FastrReportTheme = "default",
): ReportConfig {
  return customStyle
    ? {
      version: 1,
      format: REPORT_FORMAT,
      fastrTheme,
      customStyle,
      themeChosen: false,
    }
    : { version: 1, format: REPORT_FORMAT, fastrTheme, themeChosen: false };
}

// Whether the report is stored in a format that no longer has an editor.
// Total: the stored config is a raw JSON cast on the server.
export function isRetiredReportFormat(
  config: ReportConfig | null | undefined,
): boolean {
  const v = config?.format;
  return typeof v === "string" && RETIRED_REPORT_FORMATS.includes(v);
}

// Total, same rationale as isRetiredReportFormat. undefined = no custom style.
export function getReportCustomStyle(
  config: ReportConfig | null | undefined,
): ReportCustomStyleSnapshot | undefined {
  const c = config?.customStyle;
  return c && typeof c.id === "string" && typeof c.brief === "string"
    ? c
    : undefined;
}

// Total, same rationale as isRetiredReportFormat.
export function getFastrReportTheme(
  config: ReportConfig | null | undefined,
): FastrReportTheme {
  const v = config?.fastrTheme;
  return isFastrReportTheme(v) ? v : "default";
}

// A new report starts with just its title.
export function getStartingBodyForReport(label: string): string {
  return `# ${label}\n\n`;
}

// Whether a report still holds nothing anyone wrote: a body that is empty or
// a single title line (whatever the title now says), with no figure or image.
// The AI starts such a report with questions and an outline, and leaving one
// just created offers to delete it.
export function isUntouchedReport(r: {
  body: string;
  figures: Record<string, unknown>;
  images: Record<string, unknown>;
}): boolean {
  const text = r.body.trim();
  return (text.length === 0 || /^#\s[^\n]*$/.test(text)) &&
    Object.keys(r.figures).length === 0 &&
    Object.keys(r.images).length === 0;
}

// ── Embed registry write-validation ──────────────────────────────────────────
// Reuses the slide figure/image block schemas verbatim: report figures/images
// ARE slides' FigureBlock / ImageBlock (the strict figureBlockSchema, meaning the bundle
// is validated, not z.unknown, same as slides).

export const reportFiguresSchema = z.record(z.string(), figureBlockSchema);
export const reportImagesSchema = z.record(z.string(), imageBlockSchema);

// ── Public types ─────────────────────────────────────────────────────────────

export type ReportDetail = {
  id: string;
  label: string;
  body: string;
  figures: Record<string, FigureBlock>; // live data figures (slides' FigureBlock)
  images: Record<string, ImageBlock>; // uploaded images (slides' ImageBlock)
  config: ReportConfig;
  lastUpdated: string;
};
