// =============================================================================
// Reports: long-form analytical documents (a FASTR Markdown body plus figure
// and image registries). See SYSTEM_12_documents_sharing.md "Reports".
// Figures/images reuse the slide FigureBlock / ImageBlock types verbatim.
//
// Every embed-token read/write goes through the helpers below: the editor's
// load-time orphan prune deletes registry entries, so no site may parse tokens
// ad hoc.
// =============================================================================

import {
  FASTR_REPORT_TEMPLATES,
  type FastrReportTemplate,
  isFastrReportTemplate,
} from "../fastr_report_templates.ts";
import { z } from "zod";
import {
  FASTR_REPORT_THEMES,
  type FastrReportTheme,
  isFastrReportTheme,
} from "./report_fastr_themes.ts";
import { reportStyleColorsSchema } from "./report_styles.ts";
import type { ImageBlock } from "./slides.ts";
import type { FigureBlock } from "./_figure_bundle.ts";
import { figureBlockSchema, imageBlockSchema } from "./_slide_config.ts";

// ── Format ───────────────────────────────────────────────────────────────────

// Every report is FASTR Markdown: markdown plus the `:::` container blocks
// (lib/fastr_markdown_blocks.ts), rendered through a real theme stylesheet
// (lib/report_fastr_css.ts). Two older formats are retired: plain markdown,
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
  // The template the report was started from (template_modal.tsx, offered
  // after the theme while the body is still the new-report seed). Metadata
  // for the AI, which is told what kind of document it is writing; the body
  // carries the template's skeleton, never a reference to it.
  template?: FastrReportTemplate;
};

// passthrough: a stored config may still carry keys of the retired formats
// (htmlStyle); they ride along untouched.
export const reportConfigSchema = z
  .object({
    version: z.number().optional(),
    format: z.string().optional(),
    customStyle: reportCustomStyleSnapshotSchema.optional(),
    fastrTheme: z.enum(FASTR_REPORT_THEMES).optional(),
    themeChosen: z.boolean().optional(),
    template: z.enum(FASTR_REPORT_TEMPLATES).optional(),
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

// Total, same rationale as isRetiredReportFormat. undefined = no template
// chosen.
export function getFastrReportTemplate(
  config: ReportConfig | null | undefined,
): FastrReportTemplate | undefined {
  const v = config?.template;
  return isFastrReportTemplate(v) ? v : undefined;
}

// A new report starts with just its title.
export function getStartingBodyForReport(label: string): string {
  return `# ${label}\n\n`;
}

// ── HTML text helpers ────────────────────────────────────────────────────────

export function escapeReportHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ── Embed registry write-validation ──────────────────────────────────────────
// Reuses the slide figure/image block schemas verbatim: report figures/images
// ARE slides' FigureBlock / ImageBlock (the strict figureBlockSchema, meaning the bundle
// is validated, not z.unknown, same as slides).

export const reportFiguresSchema = z.record(z.string(), figureBlockSchema);
export const reportImagesSchema = z.record(z.string(), imageBlockSchema);

// ── Embed tokens ─────────────────────────────────────────────────────────────
// ![caption](figure:<id>) / ![caption](image:<id>)
// Captions in these APIs are always PLAIN text.

export type ReportEmbedKind = "figure" | "image";

export type ReportEmbedRef = {
  kind: ReportEmbedKind;
  id: string;
  caption: string;
  // [start, end) offsets of the whole token in the body.
  start: number;
  end: number;
  // The exact token text.
  raw: string;
};

const MD_TOKEN_RE = /!\[([^\]]*)\]\((figure|image):([^)\s]+)\)/g;
const MD_LINE_TOKEN_RE = /^!\[([^\]]*)\]\((figure|image):([^)\s]+)\)$/;
// The loosest possible reference scan, for the orphan prune only, where
// over-retention is harmless and a miss deletes a registry entry.
const ANY_REF_RE = /(figure|image):([A-Za-z0-9_-]+)/g;

// Every embed token in the body, in document order.
export function findReportEmbeds(body: string): ReportEmbedRef[] {
  const out: ReportEmbedRef[] = [];
  const re = new RegExp(MD_TOKEN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({
      kind: m[2] as ReportEmbedKind,
      id: m[3],
      caption: m[1],
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
    });
  }
  return out;
}

// Ids referenced by the body. "any" is the substring scan (the token syntax
// and anything looser): use it for the load-time orphan prune.
export function referencedReportEmbedIds(
  body: string,
  scan: "tokens" | "any" = "tokens",
): { figures: Set<string>; images: Set<string> } {
  const figures = new Set<string>();
  const images = new Set<string>();
  if (scan === "any") {
    const re = new RegExp(ANY_REF_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (m[1] === "figure") figures.add(m[2]);
      else images.add(m[2]);
    }
    return { figures, images };
  }
  for (const ref of findReportEmbeds(body)) {
    if (ref.kind === "figure") figures.add(ref.id);
    else images.add(ref.id);
  }
  return { figures, images };
}

// Plain caption text safe for the token: no character that ends the token,
// whitespace collapsed.
export function sanitizeReportCaption(caption: string): string {
  return caption.replace(/[[\]\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildReportEmbedToken(
  kind: ReportEmbedKind,
  id: string,
  caption: string,
): string {
  return `![${sanitizeReportCaption(caption)}](${kind}:${id})`;
}

// A line that is exactly one token (after trimming): the block-widget rule.
export function parseReportEmbedLine(
  line: string,
): { kind: ReportEmbedKind; id: string; caption: string } | undefined {
  const m = MD_LINE_TOKEN_RE.exec(line.trim());
  if (!m) return undefined;
  return { kind: m[2] as ReportEmbedKind, id: m[3], caption: m[1] };
}

// New token text for an existing token. `caption` is plain text.
export function rewriteReportEmbedToken(
  ref: ReportEmbedRef,
  patch: { id?: string; caption?: string },
): string {
  return buildReportEmbedToken(
    ref.kind,
    patch.id ?? ref.id,
    patch.caption ?? ref.caption,
  );
}

// Replace every token of (kind, id); the replacer usually wraps
// rewriteReportEmbedToken. Returns the new body and how many were replaced.
export function replaceReportEmbedTokens(
  body: string,
  kind: ReportEmbedKind,
  id: string,
  replacer: (ref: ReportEmbedRef) => string,
): { body: string; count: number } {
  const refs = findReportEmbeds(body).filter(
    (r) => r.kind === kind && r.id === id,
  );
  let out = body;
  for (let i = refs.length - 1; i >= 0; i--) {
    const r = refs[i];
    out = out.slice(0, r.start) + replacer(r) + out.slice(r.end);
  }
  return { body: out, count: refs.length };
}

// ── HTML sanitizer config (pure data; the client feeds it to DOMPurify) ──────
// The compiled document is sanitized on its way into the editor's widgets,
// the preview and every export. The default tag list would otherwise allow form controls, dialog/template/
// marquee and (with FORCE_BODY) head/title; the default URI regexp rejects the
// figure:/image: embed schemes. Exercised by server/tests/report_html_sanitize_test.ts.

export const REPORT_PURIFY_CONFIG: {
  FORCE_BODY: boolean;
  FORBID_TAGS: string[];
  ALLOWED_URI_REGEXP: RegExp;
} = {
  FORCE_BODY: true,
  FORBID_TAGS: [
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "option",
    "optgroup",
    "datalist",
    "fieldset",
    "legend",
    "label",
    "output",
    "meter",
    "progress",
    "dialog",
    "template",
    "marquee",
    "meta",
    "link",
    "base",
    "title",
    "head",
    "object",
    "embed",
    "iframe",
    "script",
    "noscript",
  ],
  // DOMPurify's default plus the figure:/image: embed schemes.
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|figure|image):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

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
