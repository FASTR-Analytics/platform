// =============================================================================
// Reports — long-form analytical documents (markdown OR html body + figure/image
// registries). See SYSTEM_12_documents_sharing.md "Reports". Figures/images
// reuse the slide FigureBlock / ImageBlock types verbatim.
//
// Every embed-token read/write goes through the format-aware helpers below —
// the editor's load-time orphan prune deletes registry entries, so no site may
// parse tokens ad hoc.
// =============================================================================

import { z } from "zod";
import type { ImageBlock } from "./slides.ts";
import type { FigureBlock } from "./_figure_bundle.ts";
import { figureBlockSchema, imageBlockSchema } from "./_slide_config.ts";

// ── Format ───────────────────────────────────────────────────────────────────

export const REPORT_FORMATS = ["markdown", "html"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

// ── Config (v1: format only; no per-report styling) ──────────────────────────

export type ReportConfig = {
  // Reserved for future per-report theming / header-footer.
  version?: number;
  // Fixed at creation. Absent ⇒ markdown (reports predate the field).
  format?: ReportFormat;
};

export const reportConfigSchema = z
  .object({
    version: z.number().optional(),
    format: z.enum(REPORT_FORMATS).optional(),
  })
  .passthrough();

export function getStartingConfigForReport(
  format: ReportFormat = "markdown",
): ReportConfig {
  return { version: 1, format };
}

// Total: the stored config is a raw JSON cast on the server, so anything that
// isn't exactly "html" is markdown.
export function getReportFormat(
  config: ReportConfig | null | undefined,
): ReportFormat {
  return config?.format === "html" ? "html" : "markdown";
}

export function getStartingBodyForReport(
  label: string,
  format: ReportFormat,
): string {
  return format === "html"
    ? `<h1>${escapeReportHtml(label)}</h1>\n`
    : `# ${label}\n\n`;
}

// ── HTML text helpers ────────────────────────────────────────────────────────

export function escapeReportHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

// One pass, so "&amp;lt;" decodes to "&lt;" (never double-decoded).
export function decodeReportHtmlEntities(s: string): string {
  return s.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (m: string, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X"
          ? parseInt(e.slice(2), 16)
          : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return NAMED_ENTITIES[e.toLowerCase()] ?? m;
    },
  );
}

// ── Embed registry write-validation ──────────────────────────────────────────
// Reuses the slide figure/image block schemas verbatim — report figures/images
// ARE slides' FigureBlock / ImageBlock (the strict figureBlockSchema — the bundle
// is validated, not z.unknown — same as slides).

export const reportFiguresSchema = z.record(z.string(), figureBlockSchema);
export const reportImagesSchema = z.record(z.string(), imageBlockSchema);

// ── Embed tokens ─────────────────────────────────────────────────────────────
// markdown: ![caption](figure:<id>) / ![caption](image:<id>)
// html:     <img src="figure:<id>" alt="caption"> (other attributes are the
//           author's and are preserved by every rewrite)
// Captions in these APIs are always PLAIN text (decoded); the html builders
// entity-escape on write and the parsers decode on read.

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
// An <img …> tag; quoted attribute values may contain ">".
const HTML_IMG_TAG_RE = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const HTML_ATTR_RE =
  /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const EMBED_SRC_RE = /^(figure|image):(.+)$/;
// The loosest possible reference scan — for the orphan prune only, where
// over-retention is harmless and a miss deletes a registry entry.
const ANY_REF_RE = /(figure|image):([A-Za-z0-9_-]+)/g;

type ImgTagAttr = {
  name: string;
  value: string | undefined;
  // Attribute span within the tag text (name through closing quote).
  start: number;
  end: number;
  // Value span within the tag text (inside the quotes, or the bare value).
  valueStart: number;
  valueEnd: number;
};

// Attributes of one "<img …>" tag text, with offsets for in-place patching.
function scanImgTagAttrs(tag: string): ImgTagAttr[] {
  const attrs: ImgTagAttr[] = [];
  const re = new RegExp(HTML_ATTR_RE.source, "g");
  re.lastIndex = 4; // past "<img"
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = m.index + m[0].length;
    let value: string | undefined;
    let valueStart = end;
    let valueEnd = end;
    if (m[2] !== undefined) {
      value = m[2];
      valueEnd = end - 1;
      valueStart = valueEnd - value.length;
    } else if (m[3] !== undefined) {
      value = m[3];
      valueEnd = end - 1;
      valueStart = valueEnd - value.length;
    } else if (m[4] !== undefined) {
      value = m[4];
      valueStart = end - value.length;
    }
    attrs.push({
      name: m[1].toLowerCase(),
      value,
      start,
      end,
      valueStart,
      valueEnd,
    });
  }
  return attrs;
}

function parseHtmlEmbedTag(
  tag: string,
): { kind: ReportEmbedKind; id: string; caption: string } | undefined {
  const attrs = scanImgTagAttrs(tag);
  const src = attrs.find((a) => a.name === "src")?.value;
  if (src === undefined) return undefined;
  const m = EMBED_SRC_RE.exec(src.trim());
  if (!m) return undefined;
  const alt = attrs.find((a) => a.name === "alt")?.value ?? "";
  return {
    kind: m[1] as ReportEmbedKind,
    id: m[2],
    caption: decodeReportHtmlEntities(alt),
  };
}

// Every embed token in the body, in document order.
export function findReportEmbeds(
  body: string,
  format: ReportFormat,
): ReportEmbedRef[] {
  const out: ReportEmbedRef[] = [];
  if (format === "html") {
    const re = new RegExp(HTML_IMG_TAG_RE.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const parsed = parseHtmlEmbedTag(m[0]);
      if (!parsed) continue;
      out.push({
        ...parsed,
        start: m.index,
        end: m.index + m[0].length,
        raw: m[0],
      });
    }
    return out;
  }
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

// Ids referenced by the body. "any" is the substring scan (both syntaxes and
// anything looser) — use it for the load-time orphan prune.
export function referencedReportEmbedIds(
  body: string,
  format: ReportFormat | "any",
): { figures: Set<string>; images: Set<string> } {
  const figures = new Set<string>();
  const images = new Set<string>();
  if (format === "any") {
    const re = new RegExp(ANY_REF_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      if (m[1] === "figure") figures.add(m[2]);
      else images.add(m[2]);
    }
    return { figures, images };
  }
  for (const ref of findReportEmbeds(body, format)) {
    if (ref.kind === "figure") figures.add(ref.id);
    else images.add(ref.id);
  }
  return { figures, images };
}

// Plain caption text safe for the token: markdown must not contain the
// characters that end the token; both collapse whitespace.
export function sanitizeReportCaption(
  format: ReportFormat,
  caption: string,
): string {
  const base = format === "markdown"
    ? caption.replace(/[[\]\n\r]/g, " ")
    : caption;
  return base.replace(/\s+/g, " ").trim();
}

export function buildReportEmbedToken(
  format: ReportFormat,
  kind: ReportEmbedKind,
  id: string,
  caption: string,
): string {
  const safe = sanitizeReportCaption(format, caption);
  return format === "html"
    ? `<img src="${kind}:${id}" alt="${escapeReportHtml(safe)}">`
    : `![${safe}](${kind}:${id})`;
}

// A line that is exactly one token (after trimming) — the block-widget rule.
export function parseReportEmbedLine(
  line: string,
  format: ReportFormat,
): { kind: ReportEmbedKind; id: string; caption: string } | undefined {
  const t = line.trim();
  if (format === "html") {
    const refs = findReportEmbeds(t, "html");
    if (refs.length !== 1) return undefined;
    const r = refs[0];
    if (r.start !== 0 || r.end !== t.length) return undefined;
    return { kind: r.kind, id: r.id, caption: r.caption };
  }
  const m = MD_LINE_TOKEN_RE.exec(t);
  if (!m) return undefined;
  return { kind: m[2] as ReportEmbedKind, id: m[3], caption: m[1] };
}

// New token text for an existing token: html patches only the src value and
// the alt attribute inside ref.raw (class/style/id/width… survive); markdown
// rebuilds. `caption` is plain text.
export function rewriteReportEmbedToken(
  ref: ReportEmbedRef,
  patch: { id?: string; caption?: string },
  format: ReportFormat,
): string {
  const id = patch.id ?? ref.id;
  const caption = patch.caption ?? ref.caption;
  if (format === "markdown") {
    return buildReportEmbedToken("markdown", ref.kind, id, caption);
  }
  const attrs = scanImgTagAttrs(ref.raw);
  const src = attrs.find((a) => a.name === "src");
  if (!src || src.value === undefined) {
    return buildReportEmbedToken("html", ref.kind, id, caption);
  }
  const alt = attrs.find((a) => a.name === "alt");
  const altText = `alt="${
    escapeReportHtml(sanitizeReportCaption("html", caption))
  }"`;
  // Apply patches right-to-left so earlier offsets stay valid.
  const edits: { start: number; end: number; text: string }[] = [
    { start: src.valueStart, end: src.valueEnd, text: `${ref.kind}:${id}` },
  ];
  if (alt) {
    edits.push({ start: alt.start, end: alt.end, text: altText });
  } else {
    edits.push({ start: src.end, end: src.end, text: ` ${altText}` });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = ref.raw;
  for (const e of edits) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

// Replace every token of (kind, id); the replacer usually wraps
// rewriteReportEmbedToken. Returns the new body and how many were replaced.
export function replaceReportEmbedTokens(
  body: string,
  format: ReportFormat,
  kind: ReportEmbedKind,
  id: string,
  replacer: (ref: ReportEmbedRef) => string,
): { body: string; count: number } {
  const refs = findReportEmbeds(body, format).filter(
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
// The default tag list would otherwise allow form controls, dialog/template/
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

export type ReportGroupingMode = "folders" | "flat";

export type ReportFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

// Cheap, server-computed preview shown on the report list card. Lives on the
// (lightweight) summary so it rides the existing `reports_updated` SSE path — no
// per-card detail fetch. Derived entirely from the body.
export type ReportPreviewLine = { text: string; headingLevel: number }; // 0 = body

export type ReportPreview = {
  lines: ReportPreviewLine[]; // first few body lines, markup stripped, headings flagged
  figureCount: number;
  imageCount: number;
};

// List view
export type ReportSummary = {
  id: string;
  label: string;
  folderId: string | null;
  config: ReportConfig;
  preview: ReportPreview;
  lastUpdated: string;
};

function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // drop image/embed tokens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → link text
    .replace(/[*_`~]/g, "") // emphasis / code markers
    .replace(/\s+/g, " ")
    .trim();
}

const PREVIEW_MAX_LINES = 8;
const PREVIEW_MAX_CHARS = 300;
const PREVIEW_LINE_CHARS = 120;
const HEADING_MARK = " ";

// Best-effort card text for an html body: comments/style/script and embed
// tags dropped, headings flagged, block closes → line breaks, tags stripped,
// entities decoded. Regex is fine here (display only).
function htmlPreviewLines(body: string): ReportPreviewLine[] {
  let s = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(new RegExp(HTML_IMG_TAG_RE.source, "gi"), "")
    .replace(/<h([1-6])\b[^>]*>/gi, (_m, l: string) => `\n${HEADING_MARK}${l}${HEADING_MARK}`)
    .replace(/<\/h[1-6]\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|header|footer|aside|nav|main|li|tr|blockquote|pre|figure|figcaption|dl|dt|dd|details|summary|table|ul|ol)\s*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, "");
  s = decodeReportHtmlEntities(s);
  const lines: ReportPreviewLine[] = [];
  let chars = 0;
  for (const raw of s.split("\n")) {
    if (lines.length >= PREVIEW_MAX_LINES || chars >= PREVIEW_MAX_CHARS) break;
    let headingLevel = 0;
    let text = raw;
    const hm = new RegExp(`^\\s*${HEADING_MARK}([1-6])${HEADING_MARK}`).exec(raw);
    if (hm) {
      headingLevel = Number(hm[1]);
      text = raw.slice(hm[0].length);
    }
    text = text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LINE_CHARS);
    if (!text) continue;
    lines.push({ text, headingLevel });
    chars += text.length;
  }
  return lines;
}

function markdownPreviewLines(body: string): ReportPreviewLine[] {
  const lines: ReportPreviewLine[] = [];
  let chars = 0;
  for (const raw of body.split("\n")) {
    if (lines.length >= PREVIEW_MAX_LINES || chars >= PREVIEW_MAX_CHARS) break;
    if (/^\s*!\[[^\]]*\]\((figure|image):/.test(raw)) continue; // skip embed lines
    const headingMatch = raw.match(/^\s*(#{1,6})\s+(.*)$/);
    const text = stripInlineMarkdown(
      headingMatch ? headingMatch[2] : raw.replace(/^\s*(>|[-*+])\s+/, ""),
    ).slice(0, PREVIEW_LINE_CHARS);
    if (!text) continue;
    lines.push({
      text,
      headingLevel: headingMatch ? headingMatch[1].length : 0,
    });
    chars += text.length;
  }
  return lines;
}

export function buildReportPreview(
  body: string,
  format: ReportFormat = "markdown",
): ReportPreview {
  const refs = findReportEmbeds(body, format);
  const figureCount = refs.filter((r) => r.kind === "figure").length;
  const imageCount = refs.length - figureCount;
  const lines = format === "html"
    ? htmlPreviewLines(body)
    : markdownPreviewLines(body);
  return { lines, figureCount, imageCount };
}

// Editor / render
export type ReportDetail = {
  id: string;
  label: string;
  body: string;
  figures: Record<string, FigureBlock>; // live data figures (slides' FigureBlock)
  images: Record<string, ImageBlock>; // uploaded images (slides' ImageBlock)
  config: ReportConfig;
  lastUpdated: string;
};
