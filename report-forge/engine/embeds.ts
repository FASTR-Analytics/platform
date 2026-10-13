// =============================================================================
// The body's embed tokens and the sanitizer config: the parts of a document
// that are not markdown.
//
// Every embed-token read/write goes through the helpers below. A host's
// orphan prune deletes registry entries based on what they find, so no site
// may parse tokens ad hoc.
// =============================================================================

// ── HTML text helpers ────────────────────────────────────────────────────────

export function escapeReportHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

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
// figure:/image: embed schemes.

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
