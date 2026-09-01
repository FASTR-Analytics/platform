// =============================================================================
// Report sections & headings — the format-aware structural layer behind the AI
// report tools (rewrite_section, insert_figure.afterHeading, the headings index)
// and the HTML preview's line anchors. Markdown keeps the historical `#`-line
// scan; HTML is parsed ONCE with @lezer/html (error-tolerant LR parser with
// exact source offsets) and everything structural — headings, sections, anchor
// injection, well-formedness — reads that one tree. The wrapper/flat section
// rule is documented at htmlSectionFor below and in SYSTEM_12_documents_sharing.md.
// =============================================================================

import { parser } from "@lezer/html";
import type { SyntaxNode, Tree } from "@lezer/common";
import {
  decodeReportHtmlEntities,
  type ReportFormat,
} from "./types/reports.ts";
import {
  isFastrLeafBlock,
  parseContainerFence,
} from "./fastr_markdown_blocks.ts";

export type ReportSectionMode = "flat" | "wrapper";

export type ReportSectionRange = {
  // [from, to) offsets of the whole section in the body.
  from: number;
  to: number;
  // 1-based, inclusive.
  fromLine: number;
  toLine: number;
  // wrapper: the section is one whole element (wrapperTag) that starts with
  // the heading; flat: a run of siblings from the heading to the next heading
  // of the same or higher level.
  mode: ReportSectionMode;
  wrapperTag?: string;
};

export type ReportHeading = {
  level: number;
  // Decoded, whitespace-collapsed heading text.
  text: string;
  // 1-based line of the heading.
  line: number;
  from: number;
  to: number;
  section: ReportSectionRange;
};

// ── Parse memo ───────────────────────────────────────────────────────────────
// The AI's headings/validation calls tend to hit the same body repeatedly.

let memoBody: string | undefined;
let memoTree: Tree | undefined;

export function parseReportHtml(body: string): Tree {
  if (memoTree && memoBody === body) return memoTree;
  memoTree = parser.parse(body);
  memoBody = body;
  return memoTree;
}

// ── Line index ───────────────────────────────────────────────────────────────

class LineIndex {
  private readonly starts: number[] = [0];
  constructor(text: string) {
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
    }
  }
  // 0-based line containing the offset.
  lineOf(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

// ── Tree helpers ─────────────────────────────────────────────────────────────

const HEADING_TAG_RE = /^h([1-6])$/;

function tagNameOf(el: SyntaxNode, src: string): string | undefined {
  const open = el.firstChild;
  if (!open || (open.name !== "OpenTag" && open.name !== "SelfClosingTag")) {
    return undefined;
  }
  const tn = open.getChild("TagName");
  return tn ? src.slice(tn.from, tn.to).toLowerCase() : undefined;
}

function headingLevelOf(el: SyntaxNode, src: string): number | undefined {
  const name = tagNameOf(el, src);
  if (!name) return undefined;
  const m = HEADING_TAG_RE.exec(name);
  return m ? Number(m[1]) : undefined;
}

function isWhitespaceText(n: SyntaxNode, src: string): boolean {
  return n.name === "Text" && /^\s*$/.test(src.slice(n.from, n.to));
}

function sameNode(a: SyntaxNode, b: SyntaxNode): boolean {
  return a.from === b.from && a.to === b.to && a.name === b.name;
}

// True when `node` (an Element) has a descendant heading of level ≤ `level`
// other than `exclude`.
function containsHeadingLeq(
  node: SyntaxNode,
  level: number,
  exclude: SyntaxNode,
  src: string,
): boolean {
  const c = node.cursor();
  while (c.next()) {
    if (c.from >= node.to) break;
    if (c.name !== "Element") continue;
    const el = c.node;
    if (sameNode(el, exclude)) continue;
    const lvl = headingLevelOf(el, src);
    if (lvl !== undefined && lvl <= level) return true;
  }
  return false;
}

// Nothing but the parent's own open tag, comments and whitespace precede
// `node` inside its parent.
function isLeadingChild(node: SyntaxNode, src: string): boolean {
  for (let s = node.prevSibling; s; s = s.prevSibling) {
    if (
      s.name === "OpenTag" ||
      s.name === "Comment" ||
      s.name === "DoctypeDecl" ||
      s.name === "ProcessingInst" ||
      isWhitespaceText(s, src)
    ) {
      continue;
    }
    return false;
  }
  return true;
}

function headingTextOf(el: SyntaxNode, src: string): string {
  const open = el.firstChild;
  const last = el.lastChild;
  const innerFrom = open ? open.to : el.from;
  const innerTo = last && last.name === "CloseTag" ? last.from : el.to;
  return decodeReportHtmlEntities(
    src.slice(innerFrom, innerTo).replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

type HtmlHeadingInfo = {
  el: SyntaxNode;
  level: number;
  text: string;
  wrapper: SyntaxNode | undefined;
  from: number;
  to: number;
};

// The section of a heading is always a contiguous run of siblings:
//   wrapper — the outermost ancestor (document root excluded) that contains no
//     other heading of level ≤ N AND has nothing but whitespace/comments before
//     the heading's chain (every element on the path down to the heading is its
//     parent's first content child): <section><div class=header><h2> climbs to
//     the section; a <p class=meta> or <span class=badge> before the heading
//     disqualifies the candidate, so content the heading doesn't govern is never
//     swallowed by a rewrite;
//   flat — otherwise, from the heading up to (excluding) the next sibling that
//     is or contains a heading of level ≤ N, or the parent's end, trailing
//     whitespace excluded so the splice keeps inter-section newlines.
function htmlSectionFor(
  el: SyntaxNode,
  level: number,
  src: string,
): Pick<HtmlHeadingInfo, "wrapper" | "from" | "to"> {
  let node = el;
  let wrapper: SyntaxNode | undefined;
  for (;;) {
    const parent = node.parent;
    if (!parent || parent.name !== "Element") break; // document root excluded
    if (!isLeadingChild(node, src)) break;
    if (containsHeadingLeq(parent, level, el, src)) break;
    wrapper = parent;
    node = parent;
  }
  if (wrapper) return { wrapper, from: wrapper.from, to: wrapper.to };
  let to = el.to;
  for (let s = el.nextSibling; s; s = s.nextSibling) {
    if (s.name === "CloseTag") break;
    if (s.name === "Element") {
      const lvl = headingLevelOf(s, src);
      if (
        (lvl !== undefined && lvl <= level) ||
        containsHeadingLeq(s, level, el, src)
      ) {
        break;
      }
      to = s.to;
    } else if (!isWhitespaceText(s, src)) {
      to = s.to;
    }
  }
  return { wrapper: undefined, from: el.from, to };
}

function collectHtmlHeadings(body: string): HtmlHeadingInfo[] {
  const tree = parseReportHtml(body);
  const out: HtmlHeadingInfo[] = [];
  const c = tree.cursor();
  do {
    if (c.name !== "Element") continue;
    const el = c.node;
    const level = headingLevelOf(el, body);
    if (level === undefined) continue;
    out.push({
      el,
      level,
      text: headingTextOf(el, body),
      ...htmlSectionFor(el, level, body),
    });
  } while (c.next());
  return out;
}

// ── Markdown scan (today's `#`-line semantics, unchanged) ────────────────────

const MD_HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const MD_HEADING_LEVEL_RE = /^(#{1,6})\s+/;

function markdownSectionEndLine(
  lines: string[],
  headingLine: number,
  level: number,
  eligible?: boolean[],
): number {
  for (let i = headingLine + 1; i < lines.length; i++) {
    if (eligible && !eligible[i]) continue;
    const m = MD_HEADING_LEVEL_RE.exec(lines[i]);
    if (m && m[1].length <= level) return i;
  }
  return lines.length;
}

// FASTR Markdown only: lines that are neither inside a fenced code block nor
// inside a `:::` container. A heading nested in a tiles grid is decoration, not
// a document section — indexing it would let rewrite_section splice a section
// that starts mid-container and ends outside it, tearing the block apart.
// Plain markdown keeps its historical every-line scan untouched.
export function fastrTopLevelLineMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let codeFence: string | undefined;
  let depth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const cf = /^([`~]{3,})/.exec(trimmed);
    if (codeFence !== undefined) {
      mask.push(false);
      if (cf && trimmed.startsWith(codeFence)) codeFence = undefined;
      continue;
    }
    if (cf) {
      codeFence = cf[1];
      mask.push(false);
      continue;
    }
    const fence = parseContainerFence(line);
    if (fence === undefined) {
      mask.push(depth === 0);
      continue;
    }
    mask.push(false);
    if (fence.kind === "open") {
      if (!isFastrLeafBlock(fence.name)) depth++;
    } else if (depth > 0) {
      depth--;
    }
  }
  return mask;
}

function markdownHeadings(body: string, containerAware: boolean): ReportHeading[] {
  const lines = body.split("\n");
  const eligible = containerAware ? fastrTopLevelLineMask(lines) : undefined;
  const starts: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    starts.push(starts[i] + lines[i].length + 1);
  }
  const out: ReportHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (eligible && !eligible[i]) continue;
    const m = MD_HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    const end = markdownSectionEndLine(lines, i, level, eligible);
    let last = end - 1;
    while (last > i && lines[last].trim() === "") last--;
    out.push({
      level,
      text: m[2].trim(),
      line: i + 1,
      from: starts[i],
      to: starts[i] + lines[i].length,
      section: {
        from: starts[i],
        to: end < lines.length ? starts[end] : body.length,
        fromLine: i + 1,
        toLine: last + 1,
        mode: "flat",
      },
    });
  }
  return out;
}

// ── Public: headings index ───────────────────────────────────────────────────

export function findReportHeadings(
  body: string,
  format: ReportFormat,
): ReportHeading[] {
  if (format !== "html") return markdownHeadings(body, format === "fastr");
  const lines = new LineIndex(body);
  return collectHtmlHeadings(body).map((h) => ({
    level: h.level,
    text: h.text,
    line: lines.lineOf(h.el.from) + 1,
    from: h.el.from,
    to: h.el.to,
    section: {
      from: h.from,
      to: h.to,
      fromLine: lines.lineOf(h.from) + 1,
      toLine: lines.lineOf(Math.max(h.from, h.to - 1)) + 1,
      mode: h.wrapper ? "wrapper" : "flat",
      wrapperTag: h.wrapper ? tagNameOf(h.wrapper, body) : undefined,
    },
  }));
}

function headingMatches(text: string, wanted: string): boolean {
  return text.trim().toLowerCase() === wanted.trim().toLowerCase();
}

// Same ambiguity/occurrence errors as the historical spliceSection.
function pickHeading<T extends { text: string }>(
  headings: T[],
  headingText: string,
  occurrenceIndex: number | undefined,
): { heading: T; count: number } | { error: string } {
  const matches = headings.filter((h) => headingMatches(h.text, headingText));
  if (matches.length === 0) {
    return {
      error:
        `No section with heading "${headingText}" found. Call get_report_editor to see exact headings.`,
    };
  }
  if (matches.length === 1) return { heading: matches[0], count: 1 };
  if (occurrenceIndex === undefined) {
    return {
      error:
        `Multiple sections titled "${headingText}" (${matches.length}). Provide occurrenceIndex (1-${matches.length}).`,
    };
  }
  const chosen = matches[occurrenceIndex - 1];
  if (!chosen) {
    return {
      error:
        `occurrenceIndex ${occurrenceIndex} out of range (1-${matches.length}).`,
    };
  }
  return { heading: chosen, count: matches.length };
}

export function resolveReportSection(
  body: string,
  format: ReportFormat,
  headingText: string,
  occurrenceIndex: number | undefined,
): { from: number; to: number; heading: ReportHeading } | { error: string } {
  const picked = pickHeading(
    findReportHeadings(body, format),
    headingText,
    occurrenceIndex,
  );
  if ("error" in picked) return picked;
  const h = picked.heading;
  return { from: h.section.from, to: h.section.to, heading: h };
}

// First element at the top of a fragment (skipping whitespace/comments), for
// the wrapper-tag check.
function firstTopLevelTag(fragment: string): string | undefined {
  const tree = parser.parse(fragment);
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    if (n.name === "Comment" || isWhitespaceText(n, fragment)) continue;
    if (n.name === "Element") return tagNameOf(n, fragment);
    return undefined;
  }
  return undefined;
}

// Replace the section under `headingText` with `replacement`. Markdown keeps
// the historical line-array algorithm byte-for-byte; html splices the resolved
// [from, to) and, in wrapper mode, insists the replacement starts with the
// wrapper element (or the section's <section>/<div> would silently vanish).
export function spliceReportSection(
  body: string,
  format: ReportFormat,
  headingText: string,
  replacement: string,
  occurrenceIndex: number | undefined,
): { newBody: string } | { error: string } {
  const picked = pickHeading(
    findReportHeadings(body, format),
    headingText,
    occurrenceIndex,
  );
  if ("error" in picked) return picked;
  const h = picked.heading;
  if (format !== "html") {
    const lines = body.split("\n");
    const start = h.line - 1;
    const end = markdownSectionEndLine(
      lines,
      start,
      h.level,
      format === "fastr" ? fastrTopLevelLineMask(lines) : undefined,
    );
    const replLines = replacement.replace(/\n+$/, "").split("\n");
    return {
      newBody: [
        ...lines.slice(0, start),
        ...replLines,
        ...lines.slice(end),
      ].join("\n"),
    };
  }
  const repl = replacement.trimEnd();
  if (h.section.mode === "wrapper") {
    const first = firstTopLevelTag(repl);
    const want = h.section.wrapperTag ?? "?";
    if (first !== want) {
      return {
        error:
          `The section "${h.text}" is its wrapping <${want}> element (lines ${h.section.fromLine}-${h.section.toLine}); newBody replaces that WHOLE element and must therefore start with <${want} …> and end with </${want}>. ` +
          (first
            ? `It starts with <${first}> instead.`
            : "It does not start with an element."),
      };
    }
  }
  return {
    newBody: body.slice(0, h.section.from) + repl + body.slice(h.section.to),
  };
}

// Insert a token line after a heading (or append when no heading is given).
// Markdown = the historical insertFigureToken; html inserts after the heading's
// header block (the child of the wrapper on the path to the heading — never
// INSIDE a <div class="header">), and appends inside a single top-level wrapper.
export function insertAfterReportHeading(
  body: string,
  format: ReportFormat,
  headingText: string | undefined,
  tokenLine: string,
): { newBody: string } | { error: string } {
  const notFound = (h: string) => ({
    error:
      `No section with heading "${h}" found. Call get_report_editor to see exact headings, or omit afterHeading to append at the end.`,
  });
  if (format !== "html") {
    if (headingText) {
      const lines = body.split("\n");
      const eligible = format === "fastr"
        ? fastrTopLevelLineMask(lines)
        : undefined;
      for (let i = 0; i < lines.length; i++) {
        if (eligible && !eligible[i]) continue;
        const m = MD_HEADING_RE.exec(lines[i]);
        if (m && headingMatches(m[2], headingText)) {
          return {
            newBody: [
              ...lines.slice(0, i + 1),
              "",
              tokenLine,
              "",
              ...lines.slice(i + 1),
            ].join("\n"),
          };
        }
      }
      return notFound(headingText);
    }
    return { newBody: `${body.replace(/\n+$/, "")}\n\n${tokenLine}\n` };
  }
  if (headingText) {
    const target = collectHtmlHeadings(body).find((h) =>
      headingMatches(h.text, headingText)
    );
    if (!target) return notFound(headingText);
    let at = target.el.to;
    if (target.wrapper) {
      let node: SyntaxNode = target.el;
      while (node.parent && !sameNode(node.parent, target.wrapper)) {
        node = node.parent;
      }
      at = node.to;
    }
    return {
      newBody: `${body.slice(0, at)}\n${tokenLine}\n${body.slice(at)}`,
    };
  }
  const tree = parseReportHtml(body);
  const topElements: SyntaxNode[] = [];
  for (let n = tree.topNode.firstChild; n; n = n.nextSibling) {
    if (n.name === "Element") topElements.push(n);
    else if (
      n.name === "Comment" || n.name === "DoctypeDecl" ||
      isWhitespaceText(n, body)
    ) {
      continue;
    } else {
      topElements.push(n); // non-whitespace text etc. → not a single wrapper
    }
  }
  if (topElements.length === 1 && topElements[0].name === "Element") {
    const close = topElements[0].lastChild;
    if (close && close.name === "CloseTag") {
      const at = close.from;
      return {
        newBody: `${body.slice(0, at)}\n${tokenLine}\n${body.slice(at)}`,
      };
    }
  }
  return { newBody: `${body.replace(/\n+$/, "")}\n\n${tokenLine}\n` };
}

// ── Line anchors for the HTML preview ────────────────────────────────────────

const ANCHOR_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "div", "section", "article", "header", "footer", "aside", "nav", "main",
  "ul", "ol", "li", "table", "tr", "blockquote", "pre", "figure", "figcaption",
  "hr", "img", "dl", "dt", "dd", "details", "summary",
]);

// Stamp data-line="<0-based line>" on the opening tag of every block element
// that doesn't already carry one. Raw-text (style/script) and comments are
// never touched — they aren't tags in the tree.
export function injectReportHtmlLineAnchors(html: string): string {
  const tree = parseReportHtml(html);
  const lines = new LineIndex(html);
  const inserts: { at: number; text: string }[] = [];
  const c = tree.cursor();
  do {
    if (c.name !== "OpenTag" && c.name !== "SelfClosingTag") continue;
    const tag = c.node;
    const tn = tag.getChild("TagName");
    if (!tn) continue;
    const name = html.slice(tn.from, tn.to).toLowerCase();
    if (!ANCHOR_TAGS.has(name)) continue;
    let has = false;
    for (const a of tag.getChildren("Attribute")) {
      const an = a.getChild("AttributeName");
      if (an && html.slice(an.from, an.to).toLowerCase() === "data-line") {
        has = true;
        break;
      }
    }
    if (has) continue;
    inserts.push({
      at: tn.to,
      text: ` data-line="${lines.lineOf(tag.from)}"`,
    });
  } while (c.next());
  let out = html;
  for (let i = inserts.length - 1; i >= 0; i--) {
    out = out.slice(0, inserts[i].at) + inserts[i].text +
      out.slice(inserts[i].at);
  }
  return out;
}

// ── Well-formedness ──────────────────────────────────────────────────────────
// Lezer flags broken tags (⚠), stray closes (MismatchedCloseTag) and stray "<"
// (IncompleteTag) but NOT unclosed elements — an unclosed <div> is a plain
// Element without a CloseTag — so those are checked explicitly (void elements
// and HTML's optional-end-tag elements excepted).

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "source", "track", "wbr",
]);
const OPTIONAL_END_TAGS = new Set([
  "html", "head", "body", "p", "li", "dt", "dd", "tr", "td", "th", "thead",
  "tbody", "tfoot", "option", "optgroup", "colgroup", "caption",
]);

export type HtmlDefect = {
  // Human message with the line number.
  message: string;
  // Line-free identity (e.g. "unclosed <div>", "stray </span>") — the unit
  // the delta check compares, since an edit shifts the lines of defects below it.
  kind: string;
  from: number;
};

// Every defect in the fragment, in document order.
export function listHtmlDefects(html: string): HtmlDefect[] {
  const tree = parseReportHtml(html);
  const lines = new LineIndex(html);
  const out: HtmlDefect[] = [];
  const c = tree.cursor();
  do {
    const line = lines.lineOf(c.from) + 1;
    if (c.type.isError) {
      out.push({
        kind: "malformed markup",
        message: `malformed markup at line ${line}`,
        from: c.from,
      });
    } else if (c.name === "MismatchedCloseTag") {
      const tn = c.node.getChild("TagName");
      const name = tn ? html.slice(tn.from, tn.to) : "?";
      out.push({
        kind: `stray </${name}>`,
        message: `stray </${name}> at line ${line} (no matching open tag)`,
        from: c.from,
      });
    } else if (c.name === "IncompleteTag" || c.name === "IncompleteCloseTag") {
      out.push({
        kind: `stray "<"`,
        message:
          `stray "<" at line ${line} — write &lt; for a literal less-than sign`,
        from: c.from,
      });
    } else if (c.name === "DoctypeDecl") {
      out.push({
        kind: "<!DOCTYPE>",
        message:
          `<!DOCTYPE> at line ${line} — write body-only markup (no doctype/html/head/body)`,
        from: c.from,
      });
    } else if (c.name === "Element") {
      const el = c.node;
      const open = el.firstChild;
      if (open && open.name === "OpenTag") {
        const tn = open.getChild("TagName");
        const name = tn ? html.slice(tn.from, tn.to).toLowerCase() : "";
        const last = el.lastChild;
        const closed = !!last && last.name === "CloseTag";
        if (!closed && !VOID_TAGS.has(name) && !OPTIONAL_END_TAGS.has(name)) {
          out.push({
            kind: `unclosed <${name}>`,
            message: `unclosed <${name}> opened at line ${line}`,
            from: c.from,
          });
        }
      }
    }
  } while (c.next());
  return out;
}

// undefined when well-formed, else a message naming the first defect.
export function validateHtmlFragment(html: string): string | undefined {
  const defects = listHtmlDefects(html);
  if (defects.length === 0) return undefined;
  const more = defects.length > 1 ? ` (+${defects.length - 1} more)` : "";
  return `HTML is not well-formed: ${defects[0].message}${more}`;
}

export function countHtmlDefects(html: string): number {
  return listHtmlDefects(html).length;
}

// Delta check for in-place edits: the first defect of a KIND that occurs more
// often after the edit than before (a body the user wrote may already carry
// defects; an edit must not add any). undefined when nothing got worse.
export function newHtmlDefect(before: string, after: string): string | undefined {
  const counts = new Map<string, number>();
  for (const d of listHtmlDefects(before)) {
    counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
  }
  for (const d of listHtmlDefects(after)) {
    const left = counts.get(d.kind) ?? 0;
    if (left === 0) return d.message;
    counts.set(d.kind, left - 1);
  }
  return undefined;
}
