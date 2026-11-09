// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// Paragraph alignment: `{align=center|right|justify|left}` at the end of a
// paragraph's LAST line sets how that paragraph is aligned. Left is the
// default and is written as no suffix at all. The suffix is the paragraph's
// own (like a figure line's `{width=…}`), so the paragraph keeps its source
// lines and every line number the editor and the PDF key on.
//
// A paragraph here is what the renderer makes one: a run of consecutive
// lines that are not blank, not a heading, list item, quote, table row,
// embed line, `:::` fence or code. The renderer applies the suffix off its
// own tokens (report_fastr_markdown.ts, fm_align); these helpers are the
// same reading over source lines, for the editor and the toolbar.
// =============================================================================

import {
  type FastrAlign,
  scanContainerLines,
} from "./fastr_markdown_blocks.ts";
import { isFastrEmbedLine } from "./fastr_live_regions.ts";

// The suffix on a line: ONE separating space (or the line's start), the
// attribute, trailing space. Only one space is the suffix's own, so a space
// typed in front of it stays the text's. A line that is only the suffix is a
// paragraph's own last line too.
export const FASTR_ALIGN_SUFFIX_RE =
  /(?:^|[ \t])\{align=(left|center|right|justify)\}[ \t]*$/;

// The alignment a line's suffix sets, and where the suffix starts (offset
// into the line, leading space included).
export function fastrAlignSuffixOf(
  text: string,
): { align: FastrAlign; start: number } | undefined {
  const m = FASTR_ALIGN_SUFFIX_RE.exec(text);
  return m === null ? undefined : { align: m[1] as FastrAlign, start: m.index };
}

// A line of paragraph prose, as opposed to a line with a structure of its
// own. Fences and code are the caller's to rule out (scanContainerLines).
export function isFastrProseLine(text: string): boolean {
  if (text.trim().length === 0) return false;
  if (/^\s{0,3}#{1,6}(\s|$)/.test(text)) return false;
  if (/^\s*(?:[-*+]|\d+[.)])\s/.test(text)) return false;
  if (/^\s*>/.test(text)) return false;
  if (/^\s*\|/.test(text)) return false;
  return !isFastrEmbedLine(text);
}

// 0-based [first, last] lines of every paragraph in the document, in order.
export function fastrParagraphRuns(
  lines: Iterable<string>,
): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | undefined;
  let prev = -1;
  for (const { index, text, inCode, fence } of scanContainerLines(lines)) {
    const prose = !inCode && fence === undefined && isFastrProseLine(text);
    if (prose && start === undefined) start = index;
    if (!prose && start !== undefined) {
      runs.push([start, prev]);
      start = undefined;
    }
    prev = index;
  }
  if (start !== undefined) runs.push([start, prev]);
  return runs;
}

// An ATX heading line, which carries its own `{align=…}` at its end.
export const FASTR_HEADING_LINE_RE = /^\s{0,3}#{1,6}(\s|$)/;

// 0-based indexes of every heading line, outside code and fences.
export function fastrHeadingLines(lines: Iterable<string>): number[] {
  const out: number[] = [];
  for (const { index, text, inCode, fence } of scanContainerLines(lines)) {
    if (!inCode && fence === undefined && FASTR_HEADING_LINE_RE.test(text)) {
      out.push(index);
    }
  }
  return out;
}

// Every line of an aligned paragraph, with its paragraph's alignment.
export function fastrParagraphAligns(
  lines: string[],
): Map<number, FastrAlign> {
  const out = new Map<number, FastrAlign>();
  for (const [a, b] of fastrParagraphRuns(lines)) {
    const suffix = fastrAlignSuffixOf(lines[b]);
    if (suffix === undefined) continue;
    for (let i = a; i <= b; i++) out.set(i, suffix.align);
  }
  return out;
}

// The paragraph a 0-based line belongs to, if it is in one.
export function fastrParagraphRunAt(
  lines: string[],
  index: number,
): [number, number] | undefined {
  return fastrParagraphRuns(lines).find(([a, b]) => a <= index && index <= b);
}

// Where text typed at a line's visible end goes on a line that ends in a
// suffix: in front of it, and never inside a heading's `# ` marker (in an
// empty `# {align=center}` the marker's space is not the suffix's).
// Undefined when the line has no suffix.
export function fastrSuffixInsertOffset(text: string): number | undefined {
  const suffix = fastrAlignSuffixOf(text);
  if (suffix === undefined) return undefined;
  const marker = /^\s{0,3}#{1,6}\s?/.exec(text)?.[0].length ?? 0;
  return Math.max(suffix.start, marker);
}

// One typed edit (an insert at `from`, nothing deleted) against a paragraph
// that carries a suffix, rewritten so the suffix stays the paragraph's last
// thing and a split keeps the alignment on both sides:
// - text typed at or after where the suffix starts (the caret at a line's
//   visible end, or after End) goes in front of it;
// - a line break that ends the paragraph above (the caret on a blank start
//   of a line, or a typed blank line) gives that paragraph the suffix too.
// Undefined when the edit stands as typed.
export function fastrAlignAwareInsert(
  doc: string,
  from: number,
  insert: string,
):
  | { at: number; insert: string; extra?: { at: number; insert: string } }
  | undefined {
  const lines = doc.split("\n");
  const starts: number[] = [];
  let off = 0;
  for (const l of lines) {
    starts.push(off);
    off += l.length + 1;
  }
  let cur = 0;
  while (cur + 1 < starts.length && starts[cur + 1] <= from) cur++;
  if (FASTR_HEADING_LINE_RE.test(lines[cur])) {
    // A heading is one line and keeps its suffix: typing at its end goes in
    // front of it, and Enter there opens the next line after it.
    const offset = fastrSuffixInsertOffset(lines[cur]);
    if (offset === undefined) return undefined;
    const edge = starts[cur] + offset;
    if (from < edge) return undefined;
    if (insert.includes("\n")) {
      const end = starts[cur] + lines[cur].length;
      return from === end ? undefined : { at: end, insert };
    }
    const spaced = doc[edge] === "{" && !/\s$/.test(insert)
      ? `${insert} `
      : insert;
    return edge === from && spaced === insert
      ? undefined
      : { at: edge, insert: spaced };
  }
  const isProse = (t: string | undefined) =>
    t !== undefined && isFastrProseLine(t) && !/^\s*(:{3,}|```|~~~)/.test(t);
  if (!isProse(lines[cur])) return undefined;
  let first = cur;
  while (first > 0 && isProse(lines[first - 1])) first--;
  let last = cur;
  while (last + 1 < lines.length && isProse(lines[last + 1])) last++;
  const suffix = fastrAlignSuffixOf(lines[last]);
  if (suffix === undefined) return undefined;
  const suffixText = ` ${lines[last].slice(suffix.start).trim()}`;
  const at = cur === last && from > starts[last] + suffix.start
    ? starts[last] + suffix.start
    : from;
  let text = insert;
  let extra: { at: number; insert: string } | undefined;
  if (insert.includes("\n")) {
    const before = doc.slice(starts[cur], at);
    if (insert.includes("\n\n") && before.trim().length > 0) {
      // A typed blank line mid-paragraph: the text before it is a paragraph
      // of its own now, and keeps the alignment.
      text = suffixText + insert;
    } else if (before.trim().length === 0 && cur > first) {
      // The caret at the start of a line: the break leaves a blank line,
      // which ends the paragraph above it.
      const prev = cur - 1;
      extra = {
        at: starts[prev] + lines[prev].trimEnd().length,
        insert: suffixText,
      };
    }
  }
  // Typed straight in front of a bare `{align=…}` (a suffix alone on its
  // line, at its start): the text needs a space before the brace, or the
  // suffix is no longer one.
  const suffixAt = starts[last] + suffix.start;
  if (
    at === suffixAt && doc[at] === "{" && !/\s$/.test(text)
  ) {
    text = `${text} `;
  }
  if (at === from && text === insert && extra === undefined) return undefined;
  return { at, insert: text, extra };
}
