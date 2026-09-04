// =============================================================================
// The editor toolbar's text operations, as pure functions over a string.
//
// DOM-free and CodeMirror-free on purpose: the toolbar is the first UI in this
// app that rewrites report source programmatically, and every one of these
// rules (where a delimiter goes relative to whitespace, which lines a heading
// may touch, how a list renumbers) is the kind of thing that is settled by a
// test in a second and by clicking around for ten minutes. Living in lib/ is
// what makes that possible — server/tests/ cannot import from client/src.
//
// Every function returns changes with PRE-TRANSACTION offsets, disjoint and
// ascending, so the caller dispatches them as ONE CodeMirror transaction. That
// is also what makes them safe under collaboration: one transaction becomes a
// minimal set of Y.Text ops that merge with peers.
// =============================================================================

import {
  fastrContainerStackUpTo,
  type FastrInkRole,
  type FastrMarkAttrs,
  isEmptyFastrMarkAttrs,
  isFastrLeafBlock,
  parseContainerFence,
  parseFastrMarkAttrs,
  sameFastrMarkAttrs,
  scanContainerLines,
  serializeFastrMarkAttrs,
  updateContainerFenceLine,
} from "./fastr_markdown_blocks.ts";
import type { FastrCoverLayout } from "./fastr_markdown_blocks.ts";
import { isFastrEmbedLine } from "./fastr_live_regions.ts";

export type TextEdit = { from: number; to: number; insert: string };

export type EditResult = {
  changes: TextEdit[];
  selection?: { anchor: number; head?: number };
};

const NONE: EditResult = { changes: [] };

// ── Line helpers ─────────────────────────────────────────────────────────────

type DocLine = { from: number; to: number; text: string };

function lineAt(doc: string, pos: number): DocLine {
  const from = doc.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
  const nl = doc.indexOf("\n", pos);
  const to = nl === -1 ? doc.length : nl;
  return { from, to, text: doc.slice(from, to) };
}

// Every line the selection touches, in document order.
function linesInRange(doc: string, from: number, to: number): DocLine[] {
  const out: DocLine[] = [];
  let pos = lineAt(doc, from).from;
  const end = lineAt(doc, to).to;
  while (pos <= end) {
    const line = lineAt(doc, pos);
    out.push(line);
    if (line.to >= doc.length) break;
    pos = line.to + 1;
  }
  return out;
}

const CODE_FENCE_RE = /^\s*([`~]{3,})/;

// The word under a caret, for inline actions invoked with nothing selected —
// the word-processor convention (bold with no selection bolds the word).
// Returns undefined on lines where inserting inline syntax would BREAK
// structure rather than style text: fences (the caret is parked on one
// whenever a block's chrome was clicked), code, and embed lines. That refusal
// replaced the old `[]{…}` / `****` insert-at-caret, which under always-
// concealed markers left invisible atomic junk — and, on a fence line,
// corrupted the block outright.
const WORD_CH_RE = /[\p{L}\p{N}_'’%-]/u;

// A line's structural prefix — indentation, `>` quote markers, a heading or
// list marker, a task checkbox — which inline styling must never wrap. In the
// editor those markers are hidden, so Home / triple-click / select-all drag
// them into the selection unseen, and `[# Title]{size=18}` is no longer a
// heading, `**- item**` no longer a list item.
const LINE_PREFIX_RE =
  /^\s*(?:>\s?)*(?:#{1,6}\s+|(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?)?/;

function linePrefixLength(text: string): number {
  return LINE_PREFIX_RE.exec(text)?.[0].length ?? 0;
}

function wordAround(
  doc: string,
  pos: number,
): { from: number; to: number } | undefined {
  const line = lineAt(doc, pos);
  if (protectedLines(doc, [line]).size > 0) return undefined;
  if (isFastrEmbedLine(line.text)) return undefined;
  const rel = pos - line.from;
  // Inside the marker itself (`1.` of an ordered item) there is no word.
  if (rel < linePrefixLength(line.text)) return undefined;
  let start = rel;
  while (start > 0 && WORD_CH_RE.test(line.text[start - 1])) start--;
  let end = rel;
  while (end < line.text.length && WORD_CH_RE.test(line.text[end])) end++;
  // At least one letter or digit — `---` in a table delimiter row is not a
  // word, and neither is a run of punctuation.
  if (!/[\p{L}\p{N}]/u.test(line.text.slice(start, end))) return undefined;
  return { from: line.from + start, to: line.from + end };
}

// Lines a block-level action must leave alone: a `:::` fence (prefixing one
// with `#` or `- ` breaks the container outright) and anything inside a fenced
// code block, where markdown syntax is content.
function protectedLines(doc: string, lines: DocLine[]): Set<number> {
  const skip = new Set<number>();
  let fence: string | undefined;
  // Keyed by line start offset, which is what the caller has.
  let pos = 0;
  for (const text of doc.split("\n")) {
    const cf = CODE_FENCE_RE.exec(text);
    let isProtected = false;
    if (fence !== undefined) {
      isProtected = true;
      if (cf && text.trim().startsWith(fence)) fence = undefined;
    } else if (cf) {
      fence = cf[1];
      isProtected = true;
    } else if (parseContainerFence(text) !== undefined) {
      isProtected = true;
    }
    if (isProtected) skip.add(pos);
    pos += text.length + 1;
  }
  return new Set(lines.filter((l) => skip.has(l.from)).map((l) => l.from));
}

// ── Inline delimiters (bold, italic, code) ───────────────────────────────────

// Unwrap wins over wrap, in this order: the delimiters sit just outside the
// selection (the common case after a previous wrap left the text selected),
// then inside it (a double-click that swallowed them), then — with no
// selection — an enclosing pair anywhere on the caret's line.
export function toggleInlineDelimiters(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
): EditResult {
  if (doc.slice(from - before.length, from) === before &&
    doc.slice(to, to + after.length) === after
  ) {
    return {
      changes: [
        { from: from - before.length, to: from, insert: "" },
        { from: to, to: to + after.length, insert: "" },
      ],
      selection: { anchor: from - before.length, head: to - before.length },
    };
  }

  const sel = doc.slice(from, to);
  if (
    sel.length >= before.length + after.length &&
    sel.startsWith(before) && sel.endsWith(after)
  ) {
    return {
      changes: [
        { from, to: from + before.length, insert: "" },
        { from: to - after.length, to, insert: "" },
      ],
      selection: { anchor: from, head: to - before.length - after.length },
    };
  }

  if (from === to) {
    const line = lineAt(doc, from);
    const kind = before === "**" ? "strong" : before === "*" ? "em" : "code";
    const rel = from - line.from;
    const enclosing = inlineSpansOf(line.text)
      .filter((s) => s.kind === kind && rel >= s.from && rel <= s.to)
      .sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
    if (enclosing) {
      return {
        changes: [
          {
            from: line.from + enclosing.from,
            to: line.from + enclosing.from + enclosing.openLen,
            insert: "",
          },
          {
            from: line.from + enclosing.to - enclosing.closeLen,
            to: line.from + enclosing.to,
            insert: "",
          },
        ],
      };
    }
    // Nothing to unwrap — wrap the word under the caret (the word-processor
    // convention), or nothing: an inserted bare pair was invisible atomic
    // junk under always-concealed markers, and on a fence line it broke the
    // block (wordAround refuses structural lines for the same reason).
    const word = wordAround(doc, from);
    if (!word) return NONE;
    return {
      changes: [
        { from: word.from, to: word.from, insert: before },
        { from: word.to, to: word.to, insert: after },
      ],
      // Keep the word selected so a second click unwraps it.
      selection: {
        anchor: word.from + before.length,
        head: word.to + before.length,
      },
    };
  }

  // `** bold **` does not render as bold, and a double-click routinely takes
  // the trailing space with it — so the delimiters go INSIDE the whitespace;
  // and per line, past each line's marker, split at table pipes (the same
  // slicing the mark edits use), so a heading stays a heading and a row a row.
  const slices = selectionLineSlices(doc, from, to);
  if (slices.length === 0) return NONE;
  const only = slices.length === 1 ? slices[0] : undefined;
  return {
    changes: slices.flatMap((s) => [
      { from: s.from, to: s.from, insert: before },
      { from: s.to, to: s.to, insert: after },
    ]),
    // Keep the text selected so a second click unwraps it.
    selection: only === undefined ? undefined : {
      anchor: only.from + before.length,
      head: only.to + before.length,
    },
  };
}

// ── Inline marks (`[phrase]{.danger}` / `[phrase]{size=12}`) ─────────────────

const MARK_CLOSE_RE = /^\}\{([^}]*)\}/;

// Both mark attributes go through one patcher: role and size share the
// `[text]{…}` wrapper, so setting either must PRESERVE the other, and the
// wrapper only comes off when the patch leaves no attribute at all.
function setMarkAttrsEdit(
  doc: string,
  from: number,
  to: number,
  apply: (current: FastrMarkAttrs) => FastrMarkAttrs,
): EditResult {
  const existing = findEnclosingMark(doc, from, to);
  if (existing) {
    const next = apply(existing.attrs);
    if (isEmptyFastrMarkAttrs(next)) {
      return {
        changes: [
          { from: existing.from, to: existing.from + 1, insert: "" },
          { from: existing.textEnd, to: existing.to, insert: "" },
        ],
        selection: { anchor: existing.from, head: existing.textEnd - 1 },
      };
    }
    return {
      changes: [
        {
          from: existing.textEnd,
          to: existing.to,
          insert: `]${serializeFastrMarkAttrs(next)}`,
        },
      ],
    };
  }
  // No selection: act on the word under the caret. A selection: act on each
  // line's trimmed, non-structural slice. Every slice goes through the
  // SEGMENT rewrite below, never a blind wrap — a range that overlaps
  // existing marks would otherwise NEST them (`[ab[cd]{size=10}efg]{size=12}`),
  // which nothing can render.
  const word = from === to ? wordAround(doc, from) : undefined;
  const slices = from === to
    ? (word ? [word] : [])
    : selectionLineSlices(doc, from, to);
  const changes: TextEdit[] = [];
  let only: TextEdit | undefined;
  let lastEnd = -1;
  for (const slice of slices) {
    const edit = rewriteRangeMarks(doc, slice.from, slice.to, apply);
    if (!edit) continue;
    // Two slices can absorb the SAME mark (a pipe inside a mark's label sits
    // in two pipe-split slices) — the second rewrite would overlap the first,
    // so it is dropped rather than dispatched as an invalid changeset.
    if (edit.from < lastEnd) continue;
    lastEnd = edit.to;
    changes.push(edit);
    only = changes.length === 1 ? edit : undefined;
  }
  if (changes.length === 0) return NONE;
  return {
    changes,
    // Single slice: keep the rewritten stretch selected, so a second click
    // patches or unwraps it (a full-span selection counts as enclosed).
    // Multiple slices: let the editor map the old selection through.
    selection: only === undefined
      ? undefined
      : { anchor: only.from, head: only.from + only.insert.length },
  };
}

// One line-local range rebuilt as FLAT mark segments: existing marks the
// range cuts into are absorbed whole, each segment (plain text or a mark's
// label) gets `apply` over its own current attrs, and neighbours that end up
// with identical attrs merge. This is what makes "size the whole phrase" over
// a partly-sized phrase produce ONE mark — and lets a mark keep its role while
// a size sweeps across it, as flat adjacent marks rather than nesting.
function rewriteRangeMarks(
  doc: string,
  from: number,
  to: number,
  apply: (current: FastrMarkAttrs) => FastrMarkAttrs,
): TextEdit | undefined {
  const line = lineAt(doc, from);
  const spans = markSpans(line.text).map((s) => ({
    attrs: s.attrs,
    from: line.from + s.from,
    textEnd: line.from + s.textEnd,
    to: line.from + s.to,
  }));
  let a = from;
  let b = Math.min(to, line.to);
  for (const s of spans) {
    if (s.from < b && s.to > a) {
      a = Math.min(a, s.from);
      b = Math.max(b, s.to);
    }
  }
  type Segment = { label: string; attrs: FastrMarkAttrs };
  const segments: Segment[] = [];
  let pos = a;
  for (const s of spans) {
    if (s.from >= b || s.to <= a) continue;
    if (s.from > pos) {
      segments.push({ label: doc.slice(pos, s.from), attrs: apply({}) });
    }
    segments.push({
      label: doc.slice(s.from + 1, s.textEnd),
      attrs: apply(s.attrs),
    });
    pos = s.to;
  }
  if (pos < b) segments.push({ label: doc.slice(pos, b), attrs: apply({}) });
  const merged: Segment[] = [];
  for (const seg of segments) {
    if (seg.label.length === 0) continue;
    const prev = merged[merged.length - 1];
    if (prev !== undefined && sameFastrMarkAttrs(prev.attrs, seg.attrs)) {
      prev.label += seg.label;
    } else {
      merged.push({ label: seg.label, attrs: seg.attrs });
    }
  }
  const insert = merged.map((seg) =>
    isEmptyFastrMarkAttrs(seg.attrs)
      ? seg.label
      : `[${seg.label}]${serializeFastrMarkAttrs(seg.attrs)}`
  ).join("");
  // A rewrite that changes nothing must not dispatch — it would churn the
  // undo history and emit Y.Text ops into everyone else's session.
  return insert === doc.slice(a, b) ? undefined : { from: a, to: b, insert };
}

// The per-line pieces of a selection an inline action may touch: each line's
// intersection with the selection past the line's structural prefix,
// whitespace-trimmed, skipping structural lines (fences, code, embeds) and
// slices with no letter or digit (a table delimiter row's dashes must never
// be wrapped). A slice containing `|` is
// split at the pipes — a mark label swallowing a pipe would change a table
// row's cell structure, and in prose the split just yields adjacent marks
// that render identically.
function selectionLineSlices(
  doc: string,
  from: number,
  to: number,
): { from: number; to: number }[] {
  const lines = linesInRange(doc, from, to);
  const skip = protectedLines(doc, lines);
  const out: { from: number; to: number }[] = [];
  const push = (a: number, b: number) => {
    const t = trimmedRange(doc, a, b);
    if (!t) return;
    if (!/[\p{L}\p{N}]/u.test(doc.slice(t.from, t.to))) return;
    out.push(t);
  };
  for (const line of lines) {
    if (skip.has(line.from) || isFastrEmbedLine(line.text)) continue;
    const a = Math.max(from, line.from + linePrefixLength(line.text));
    const b = Math.min(to, line.to);
    if (a >= b) continue;
    const raw = doc.slice(a, b);
    if (raw.includes("|")) {
      let start = a;
      for (const part of raw.split("|")) {
        push(start, start + part.length);
        start += part.length + 1;
      }
    } else {
      push(a, b);
    }
  }
  return out;
}

// A selection with its flanking whitespace shaved off (delimiters belong
// inside the whitespace); undefined when nothing remains.
function trimmedRange(
  doc: string,
  from: number,
  to: number,
): { from: number; to: number } | undefined {
  const sel = doc.slice(from, to);
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const innerFrom = from + lead;
  const innerTo = to - trail;
  return innerFrom >= innerTo ? undefined : { from: innerFrom, to: innerTo };
}

// Passing undefined removes the role; the wrapper survives if a size remains.
export function setInlineRoleEdit(
  doc: string,
  from: number,
  to: number,
  role: FastrInkRole | undefined,
): EditResult {
  // A role and a literal colour are one choice (the toolbar's panel offers
  // both): setting either drops the other, and clearing clears both.
  return setMarkAttrsEdit(doc, from, to, (cur) => {
    const { color: _drop, ...rest } = cur;
    return { ...rest, role };
  });
}

// `[phrase]{color=#c62828}` — a literal colour, validated by the mark parser
// on the way back in; undefined clears it (and any role).
export function setInlineColorEdit(
  doc: string,
  from: number,
  to: number,
  color: string | undefined,
): EditResult {
  return setMarkAttrsEdit(doc, from, to, (cur) => {
    const { role: _role, color: _color, ...rest } = cur;
    return color === undefined ? rest : { ...rest, color };
  });
}

// `[phrase]{underline}` on or off; the wrapper survives if a role or size
// remains.
export function setInlineUnderlineEdit(
  doc: string,
  from: number,
  to: number,
  on: boolean,
): EditResult {
  return setMarkAttrsEdit(doc, from, to, (cur) => {
    const { underline: _drop, ...rest } = cur;
    return on ? { ...rest, underline: true } : rest;
  });
}

// `[phrase]{size=12}` — points. Passing undefined removes the size; the
// wrapper survives if a role remains.
export function setInlineSizeEdit(
  doc: string,
  from: number,
  to: number,
  size: number | undefined,
): EditResult {
  return setMarkAttrsEdit(doc, from, to, (cur) => ({ ...cur, size }));
}

type FoundMark = {
  attrs: FastrMarkAttrs;
  // `[` position.
  from: number;
  // Position of the `]`.
  textEnd: number;
  // One past the closing `}`.
  to: number;
};

// The mark enclosing the range, searched within the caret's own line — a mark
// never spans lines, so there is no reason to scan the document.
function findEnclosingMark(
  doc: string,
  from: number,
  to: number,
): FoundMark | undefined {
  const line = lineAt(doc, from);
  if (to > line.to) return undefined;
  const relFrom = from - line.from;
  const relTo = to - line.from;
  const found = markSpans(line.text).find(
    (s) => relFrom >= s.from && relTo <= s.to,
  );
  if (!found) return undefined;
  return {
    attrs: found.attrs,
    from: line.from + found.from,
    textEnd: line.from + found.textEnd,
    to: line.from + found.to,
  };
}

type MarkSpan = {
  attrs: FastrMarkAttrs;
  from: number;
  textEnd: number;
  to: number;
};

function markSpans(lineText: string): MarkSpan[] {
  const out: MarkSpan[] = [];
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] !== "[") continue;
    const close = lineText.indexOf("]", i + 1);
    if (close === -1) continue;
    // MARK_CLOSE_RE is anchored on the `}` that closes the label's `]`, so
    // prepend one to keep the expression shaped like the renderer's rule.
    const m = MARK_CLOSE_RE.exec("}" + lineText.slice(close + 1));
    const attrs = m ? parseFastrMarkAttrs(m[1]) : undefined;
    if (!m || !attrs) continue;
    // One past the closing `}`: `]` plus `{…}`, less the borrowed `}`.
    out.push({ attrs, from: i, textEnd: close, to: close + m[0].length });
  }
  return out;
}

// ── Line-level actions ───────────────────────────────────────────────────────

const HEADING_RE = /^(\s*)(#{1,6})\s+/;
const BULLET_RE = /^(\s*)([-*+])\s+/;
const ORDERED_RE = /^(\s*)(\d+)\.\s+/;
const QUOTE_RE = /^(\s*)>\s?/;

// 0 clears to a paragraph; 1–6 set that level. Applies to every line the
// selection touches, skipping fences and code.
export function setHeadingLevelEdit(
  doc: string,
  from: number,
  to: number,
  level: number,
): EditResult {
  const lines = linesInRange(doc, from, to);
  const skip = protectedLines(doc, lines);
  const changes: TextEdit[] = [];
  for (const line of lines) {
    if (skip.has(line.from) || line.text.trim().length === 0) continue;
    const m = HEADING_RE.exec(line.text);
    const indent = m ? m[1] : /^\s*/.exec(line.text)![0];
    const bodyFrom = line.from + (m ? m[0].length : indent.length);
    const prefix = level === 0 ? indent : `${indent}${"#".repeat(level)} `;
    if (doc.slice(line.from, bodyFrom) === prefix) continue;
    changes.push({ from: line.from, to: bodyFrom, insert: prefix });
  }
  return { changes };
}

// Toggles off only when EVERY non-blank line already carries the prefix —
// otherwise a mixed selection would half-clear, which is never what was meant.
export function toggleLinePrefixEdit(
  doc: string,
  from: number,
  to: number,
  kind: "bullet" | "ordered" | "quote",
): EditResult {
  const lines = linesInRange(doc, from, to);
  const skip = protectedLines(doc, lines);
  const live = lines.filter(
    (l) => !skip.has(l.from) && l.text.trim().length > 0,
  );
  if (live.length === 0) return NONE;

  const re = kind === "bullet" ? BULLET_RE : kind === "ordered" ? ORDERED_RE : QUOTE_RE;
  const allPrefixed = live.every((l) => re.test(l.text));
  const changes: TextEdit[] = [];
  let n = 0;
  for (const line of live) {
    const m = re.exec(line.text);
    const indent = /^\s*/.exec(line.text)![0];
    const bodyFrom = line.from + (m ? m[0].length : indent.length);
    n++;
    const prefix = allPrefixed
      ? indent
      : kind === "bullet"
      ? `${indent}- `
      : kind === "ordered"
      // Renumber from the top of the selection rather than trusting whatever
      // digits were there: markdown would renumber anyway, and a 1./1./1. list
      // in the source is confusing to edit.
      ? `${indent}${n}. `
      : `${indent}> `;
    if (doc.slice(line.from, bodyFrom) === prefix) continue;
    changes.push({ from: line.from, to: bodyFrom, insert: prefix });
  }
  return { changes };
}

// ── Insertions ───────────────────────────────────────────────────────────────

export function insertLinkEdit(
  doc: string,
  from: number,
  to: number,
): EditResult {
  const text = doc.slice(from, to);
  if (text.length === 0) {
    return {
      changes: [{ from, to, insert: "[](https://)" }],
      selection: { anchor: from + 1 },
    };
  }
  return {
    changes: [{ from, to, insert: `[${text}](https://)` }],
    // Select the placeholder URL, so typing replaces it.
    selection: { anchor: from + text.length + 3, head: from + text.length + 11 },
  };
}

// ── Table cell actions (the cell's right-click menu) ─────────────────────────
// Structural edits on a markdown table, addressed by the clicked cell: the
// Google Docs set. Rows are 0-based WITHIN the table (0 = header, 1 = the
// delimiter row, 2+ = body). Returns the rebuilt table lines, or undefined
// when the action does not apply (deleting the header, deleting the last
// column) — the caller hides those menu items, this is the backstop.

export type TableCellAction =
  | "insertRowAbove"
  | "insertRowBelow"
  | "insertColLeft"
  | "insertColRight"
  | "deleteRow"
  | "deleteCol";

function tableRowCells(text: string): string[] {
  const inner = text.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function tableRowLine(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

export function applyTableCellAction(
  tableLines: string[],
  rowRel: number,
  cellIndex: number,
  action: TableCellAction,
  // What an inserted column's HEADER cell says (the caller localizes it);
  // body cells always arrive empty.
  newColumnHeader = "",
): string[] | undefined {
  if (tableLines.length < 2) return undefined;
  const rows = tableLines.map(tableRowCells);
  const cols = rows[0].length;
  const emptyRow = () => Array.from({ length: cols }, () => "");

  switch (action) {
    case "insertRowAbove": {
      // Above the header or the delimiter means "first body row".
      const at = Math.max(rowRel, 2);
      rows.splice(at, 0, emptyRow());
      break;
    }
    case "insertRowBelow": {
      const at = rowRel <= 1 ? 2 : rowRel + 1;
      rows.splice(at, 0, emptyRow());
      break;
    }
    case "deleteRow": {
      if (rowRel <= 1 || rowRel >= rows.length) return undefined;
      rows.splice(rowRel, 1);
      break;
    }
    case "insertColLeft":
    case "insertColRight": {
      const at = Math.max(
        0,
        Math.min(cols, action === "insertColLeft" ? cellIndex : cellIndex + 1),
      );
      rows.forEach((cells, r) => {
        const fill = r === 1 ? "---" : r === 0 ? newColumnHeader : "";
        while (cells.length < at) cells.push(r === 1 ? "---" : "");
        cells.splice(at, 0, fill);
      });
      break;
    }
    case "deleteCol": {
      if (cols <= 1) return undefined;
      rows.forEach((cells) => {
        if (cellIndex < cells.length) cells.splice(cellIndex, 1);
      });
      break;
    }
  }
  return rows.map(tableRowLine);
}

// ── Tiles (stat + card grids) ────────────────────────────────────────────────

export const TILES_MAX_COLS = 4;

// A grid of `cols` stat tiles — the Insert menu's picker writes this, the
// way the table picker writes tableSnippet. Each tile starts with a visible
// value and a numbered label so a fresh grid is never an invisible box.
export function statTilesSnippet(cols: number, label = "Stat"): string {
  const c = Math.max(1, Math.min(TILES_MAX_COLS, cols));
  const tiles = Array.from(
    { length: c },
    (_, i) => `:::stat{value="0" label="${label} ${i + 1}"}`,
  );
  return [`:::tiles{cols=${c}}`, ...tiles, ":::"].join("\n");
}

// `:::columns{cols=N}` with N `:::col` blocks, each holding one body line.
export function columnsSnippet(cols: number, body = "Text"): string {
  const c = Math.max(1, Math.min(TILES_MAX_COLS, cols));
  const columns = Array.from({ length: c }, () => `:::col\n${body}\n:::`);
  return [`:::columns{cols=${c}}`, ...columns, ":::"].join("\n");
}

// The same grid of `cols` cards, each titled and holding one body line.
export function cardTilesSnippet(
  cols: number,
  title = "Card",
  body = "Text",
): string {
  const c = Math.max(1, Math.min(TILES_MAX_COLS, cols));
  const cards = Array.from(
    { length: c },
    (_, i) => `:::card{title="${title} ${i + 1}"}\n${body}\n:::`,
  );
  return [`:::tiles{cols=${c}}`, ...cards, ":::"].join("\n");
}

export type TilesChildAction =
  | "insertBefore"
  | "insertAfter"
  | "delete"
  | { cols: number };

export type TilesChildInfo = {
  kind: "stat" | "card" | "col";
  // The child block's own lines, 1-based inclusive (a stat is one line; a
  // card or col runs to its closing fence).
  from1: number;
  to1: number;
  // Present only when the child's DIRECT parent is its grid — `:::tiles` for
  // a stat or card, `:::columns` for a col — since only then are columns
  // managed.
  grid:
    | { line1: number; endLine1: number; cols: number; count: number }
    | undefined;
};

// Where a container opened at `openIdx` closes (0-based, inclusive); a leaf
// is its own line, an unclosed container runs to the end.
function containerEndIdx(lines: string[], openIdx: number): number {
  const open = parseContainerFence(lines[openIdx]);
  if (!open || open.kind !== "open" || isFastrLeafBlock(open.name)) {
    return openIdx;
  }
  let depth = 0;
  for (const { index, inCode, fence } of scanContainerLines(lines.slice(openIdx))) {
    if (inCode || !fence) continue;
    if (fence.kind === "open") {
      if (fence.name !== "stat") depth++;
      continue;
    }
    depth--;
    if (depth === 0) return openIdx + index;
  }
  return lines.length - 1;
}

// What a right-click on a stat tile, a card or a column can know.
export function tilesChildInfo(
  doc: string,
  line1: number,
): TilesChildInfo | undefined {
  const lines = doc.split("\n");
  const text = lines[line1 - 1];
  const fence = text === undefined ? undefined : parseContainerFence(text);
  if (!fence || fence.kind !== "open") return undefined;
  if (fence.name !== "stat" && fence.name !== "card" && fence.name !== "col") {
    return undefined;
  }
  const kind = fence.name;
  const to1 = containerEndIdx(lines, line1 - 1) + 1;
  const stack = fastrContainerStackUpTo(lines.slice(0, line1 - 1));
  const parent = stack[stack.length - 1];
  const gridName = kind === "col" ? "columns" : "tiles";
  if (!parent || parent.name !== gridName) {
    return { kind, from1: line1, to1, grid: undefined };
  }
  // The grid's extent and its DIRECT children (fences opening at depth 1).
  let depth = 0;
  let count = 0;
  let endLine1 = lines.length;
  for (const { index, inCode, fence: f } of scanContainerLines(lines.slice(parent.line - 1))) {
    if (inCode || !f) continue;
    if (f.kind === "open") {
      if (depth === 1) count++;
      if (f.name !== "stat") depth++;
      continue;
    }
    depth--;
    if (depth === 0) {
      endLine1 = parent.line + index;
      break;
    }
  }
  const colsAttr = parent.attrs["cols"];
  // The renderers' defaults: three tiles across, two columns.
  const cols = typeof colsAttr === "string" && /^[1-9]$/.test(colsAttr)
    ? Number(colsAttr)
    : kind === "col"
    ? 2
    : 3;
  return {
    kind,
    from1: line1,
    to1,
    grid: { line1: parent.line, endLine1, cols, count },
  };
}

// The new sibling's text: a stat's label, a card's title, and the body line
// a new card or column starts with.
export type TilesChildLabels = { tile: string; card: string; body: string };

// Add, remove or re-column the siblings around a stat tile or card. Inside a
// grid the column count FOLLOWS the child count while it fits (three + one =
// four columns, not a lonely fourth wrapping onto a second row); past four it
// is left alone and the grid wraps. Deleting the last child removes the grid.
export function applyTilesChildAction(
  doc: string,
  line1: number,
  action: TilesChildAction,
  labels: TilesChildLabels = { tile: "New tile", card: "New card", body: "Text" },
): EditResult {
  const info = tilesChildInfo(doc, line1);
  if (!info) return NONE;
  const tiles = info.grid;
  if (typeof action === "object") {
    if (!tiles) return NONE;
    const patched = patchCols(doc, tiles.line1, action.cols);
    return patched ? { changes: [patched] } : NONE;
  }
  const first = lineAt(doc, lineStart(doc, info.from1));
  const last = lineAt(doc, lineStart(doc, info.to1));
  const sibling = info.kind === "stat"
    ? `:::stat{value="0" label="${labels.tile}"}`
    : info.kind === "card"
    ? `:::card{title="${labels.card}"}\n${labels.body}\n:::`
    : `:::col\n${labels.body}\n:::`;
  const changes: TextEdit[] = [];
  const nextCount = tiles ? tiles.count + (action === "delete" ? -1 : 1) : undefined;
  if (tiles && nextCount === 0) {
    const from = lineStart(doc, tiles.line1);
    const end = lineAt(doc, lineStart(doc, tiles.endLine1)).to;
    return { changes: [{ from, to: Math.min(end + 1, doc.length), insert: "" }] };
  }
  if (tiles && nextCount !== undefined && nextCount <= TILES_MAX_COLS) {
    const patched = patchCols(doc, tiles.line1, nextCount);
    if (patched) changes.push(patched);
  }
  if (action === "insertBefore") {
    changes.push({ from: first.from, to: first.from, insert: `${sibling}\n` });
  } else if (action === "insertAfter") {
    changes.push({ from: last.to, to: last.to, insert: `\n${sibling}` });
  } else {
    changes.push({ from: first.from, to: Math.min(last.to + 1, doc.length), insert: "" });
  }
  return { changes };
}

function lineStart(doc: string, line1: number): number {
  let pos = 0;
  for (let n = 1; n < line1; n++) {
    const nl = doc.indexOf("\n", pos);
    if (nl === -1) return doc.length;
    pos = nl + 1;
  }
  return pos;
}

function patchCols(doc: string, tilesLine1: number, cols: number): TextEdit | undefined {
  const line = lineAt(doc, lineStart(doc, tilesLine1));
  const next = updateContainerFenceLine(line.text, {
    cols: String(Math.max(1, Math.min(TILES_MAX_COLS, cols))),
  });
  if (next === undefined || next === line.text) return undefined;
  return { from: line.from, to: line.to, insert: next };
}

// ── Cover presets ────────────────────────────────────────────────────────────

// What the Insert menu's cover picker offers: one tile per layout, each on
// the ground that shows the composition best. The layout and the tone stay
// independently editable afterwards (the block segment's Layout and
// Background controls).
export type FastrCoverPreset = { layout: FastrCoverLayout; tone: string };

export const FASTR_COVER_PRESETS: readonly FastrCoverPreset[] = [
  { layout: "classic", tone: "dark" },
  { layout: "centered", tone: "gradient" },
  { layout: "poster", tone: "solid" },
  { layout: "spine", tone: "muted" },
  { layout: "frame", tone: "default" },
  { layout: "split", tone: "inverse" },
  { layout: "minimal", tone: "default" },
  { layout: "block", tone: "default" },
];

export type CoverSnippetText = { kicker: string; title: string; sub: string };

// The cover a preset inserts (and the markup its thumbnail renders). Classic
// and the default tone are the renderer's fallbacks, so they are left off
// the fence rather than written as noise.
export function coverSnippet(
  preset: FastrCoverPreset,
  text: CoverSnippetText,
): string {
  const attrs = [
    preset.tone === "default" ? "" : `tone=${preset.tone}`,
    preset.layout === "classic" ? "" : `layout=${preset.layout}`,
    `kicker="${text.kicker.replace(/"/g, "'")}"`,
    `sub="${text.sub.replace(/"/g, "'")}"`,
  ].filter((a) => a.length > 0).join(" ");
  return `:::cover{${attrs}}\n# ${text.title}\n:::`;
}

// ── Steps (a numbered process list) ──────────────────────────────────────────

// The Insert picker offers up to this many steps at once.
export const STEPS_MAX_PICK = 8;

// `:::steps` holding `count` blank-separated one-line paragraphs. The renderer
// numbers every direct child of the block, so a paragraph IS a step and the
// author never writes a number.
export function stepsSnippet(count: number, label = "Step"): string {
  const c = Math.max(1, Math.min(STEPS_MAX_PICK, count));
  const steps = Array.from({ length: c }, (_, i) => `${label} ${i + 1}`);
  return [":::steps", steps.join("\n\n"), ":::"].join("\n");
}

export type StepsChildAction = "insertBefore" | "insertAfter" | "delete";

export type StepsChildInfo = {
  // The step's own lines, 1-based inclusive: a paragraph's run of non-blank
  // lines, a one-line heading or embed, or a nested block's whole extent.
  from1: number;
  to1: number;
  // The enclosing `:::steps` block — endLine1 is its closing fence, or the
  // last line of the document when the block is unclosed (the block rule).
  block: { line1: number; endLine1: number };
};

// A heading or an embed line is always a block of its own, so a step's run of
// lines never crosses one.
function isOneLineBlock(text: string): boolean {
  return /^#{1,6}\s/.test(text) || isFastrEmbedLine(text);
}

// What a right-click (or Enter) on a step can know: the step's extent and its
// block. A step is a DIRECT child of `:::steps` — its paragraph lines up to
// the next blank line, or a nested block from its fence to its close. Lines
// inside a nested block, the fences and blank lines are not steps.
export function stepsChildInfo(
  doc: string,
  line1: number,
): StepsChildInfo | undefined {
  const lines = doc.split("\n");
  const idx = line1 - 1;
  const text = lines[idx];
  if (text === undefined || text.trim().length === 0) return undefined;
  const stack = fastrContainerStackUpTo(lines.slice(0, idx));
  const parent = stack[stack.length - 1];
  if (!parent || parent.name !== "steps") return undefined;
  const fence = parseContainerFence(text);
  if (fence && fence.kind !== "open") return undefined;
  const openIdx = parent.line - 1;
  const closeIdx = containerEndIdx(lines, openIdx);
  const block = { line1: parent.line, endLine1: closeIdx + 1 };
  if (fence) {
    return { from1: line1, to1: containerEndIdx(lines, idx) + 1, block };
  }
  const hasClose = closeIdx > openIdx &&
    parseContainerFence(lines[closeIdx])?.kind === "close";
  const interiorEnd = hasClose ? closeIdx - 1 : closeIdx;
  const joins = (t: string) =>
    t.trim().length > 0 && parseContainerFence(t) === undefined &&
    !isOneLineBlock(t);
  let from = idx;
  let to = idx;
  if (!isOneLineBlock(text)) {
    while (from - 1 > openIdx && joins(lines[from - 1])) from--;
    while (to + 1 <= interiorEnd && joins(lines[to + 1])) to++;
  }
  return { from1: from + 1, to1: to + 1, block };
}

// Add a step either side of this one, or remove it. A new step is a labelled
// paragraph kept blank-separated from its neighbours; deleting takes ONE
// adjacent blank line with the step so the survivors stay separated, and
// deleting the only step removes the block.
export function applyStepsChildAction(
  doc: string,
  line1: number,
  action: StepsChildAction,
  label = "New step",
): EditResult {
  const info = stepsChildInfo(doc, line1);
  if (!info) return NONE;
  const first = lineAt(doc, lineStart(doc, info.from1));
  const last = lineAt(doc, lineStart(doc, info.to1));
  if (action === "insertBefore") {
    return { changes: [{ from: first.from, to: first.from, insert: `${label}\n\n` }] };
  }
  if (action === "insertAfter") {
    return { changes: [{ from: last.to, to: last.to, insert: `\n\n${label}` }] };
  }
  const lines = doc.split("\n");
  const openIdx = info.block.line1 - 1;
  const closeIdx = info.block.endLine1 - 1;
  const hasClose = closeIdx > openIdx &&
    parseContainerFence(lines[closeIdx])?.kind === "close";
  const interiorEnd = hasClose ? closeIdx - 1 : closeIdx;
  let others = false;
  for (let i = openIdx + 1; i <= interiorEnd; i++) {
    if (i >= info.from1 - 1 && i <= info.to1 - 1) continue;
    if (lines[i].trim().length > 0) {
      others = true;
      break;
    }
  }
  if (!others) {
    const from = lineStart(doc, info.block.line1);
    const end = lineAt(doc, lineStart(doc, info.block.endLine1)).to;
    return { changes: [{ from, to: Math.min(end + 1, doc.length), insert: "" }] };
  }
  let from = first.from;
  let to = Math.min(last.to + 1, doc.length);
  const nextIdx = info.to1;
  const prevIdx = info.from1 - 2;
  if (nextIdx <= interiorEnd && lines[nextIdx].trim().length === 0) {
    to = Math.min(lineAt(doc, lineStart(doc, nextIdx + 1)).to + 1, doc.length);
  } else if (prevIdx > openIdx && lines[prevIdx].trim().length === 0) {
    const blank = lineStart(doc, prevIdx + 1);
    // The last line of an unclosed block has no newline after it to take, so
    // take the one before the blank line instead.
    from = last.to >= doc.length ? blank - 1 : blank;
  }
  return { changes: [{ from, to, insert: "" }] };
}

export function tableSnippet(cols: number, rows: number): string {
  const c = Math.max(1, Math.min(6, cols));
  const r = Math.max(1, Math.min(20, rows));
  const header = `| ${Array.from({ length: c }, (_, i) => `Column ${i + 1}`).join(" | ")} |`;
  const rule = `| ${Array.from({ length: c }, () => "---").join(" | ")} |`;
  const body = Array.from(
    { length: r },
    () => `| ${Array.from({ length: c }, () => " ").join(" | ")} |`,
  );
  return [header, rule, ...body].join("\n");
}

// ── Toolbar active state ─────────────────────────────────────────────────────

export type InlineMarkState = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  role: FastrInkRole | undefined;
  color: string | undefined;
  // Points, from an enclosing `[x]{size=N}` mark; undefined = theme size.
  size: number | undefined;
  underline: boolean;
  // 0 = paragraph.
  headingLevel: number;
  list: "bullet" | "ordered" | undefined;
};

// Line-local by design: this runs on EVERY cursor move, so it must never take
// the whole document. `from`/`to` are offsets within `lineText`.
export function inlineMarkStateAt(
  lineText: string,
  from: number,
  to: number,
): InlineMarkState {
  const heading = HEADING_RE.exec(lineText);
  const mark = markSpans(lineText).find((s) => from >= s.from && to <= s.to);
  const spans = inlineSpansOf(lineText);
  const encloses = (s: InlineSpan) => from >= s.from && to <= s.to;
  return {
    bold: spans.some((s) => s.kind === "strong" && encloses(s)),
    italic: spans.some((s) => s.kind === "em" && encloses(s)),
    code: spans.some((s) => s.kind === "code" && encloses(s)),
    role: mark?.attrs.role,
    color: mark?.attrs.color,
    size: mark?.attrs.size,
    underline: mark?.attrs.underline === true,
    headingLevel: heading ? heading[2].length : 0,
    list: BULLET_RE.test(lineText)
      ? "bullet"
      : ORDERED_RE.test(lineText)
      ? "ordered"
      : undefined,
  };
}

// An emphasis or code span on one line, delimiters INCLUDED: `from` is the
// first delimiter char, `to` one past the last, openLen/closeLen the delimiter
// widths (so an unwrap knows exactly what to remove).
type InlineSpan = {
  kind: "strong" | "em" | "code";
  from: number;
  to: number;
  openLen: number;
  closeLen: number;
};

// CommonMark's delimiter-run pairing, on one line, without the punctuation
// and rule-of-three refinements: runs of `*`/`_` that can open (not followed
// by whitespace) or close (not preceded by it), a closer matched to the
// nearest open run of the same char, consuming TWO delimiters when both sides
// have two (strong) and one otherwise (em). That is why `***x***` is em
// around strong, why `**a *b* c**` nests, and why a lone `**` earlier on the
// line never pairs with a later `*` — the "nearest delimiter anywhere" search
// this replaced reported bold for the caret in `*italic*` whenever `**bold**`
// sat somewhere before it. Code spans come first; their interiors are literal.
function inlineSpansOf(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  const CODE_RE = /(`+)(.+?)\1/g;
  let cm: RegExpExecArray | null;
  while ((cm = CODE_RE.exec(line)) !== null) {
    spans.push({
      kind: "code",
      from: cm.index,
      to: cm.index + cm[0].length,
      openLen: cm[1].length,
      closeLen: cm[1].length,
    });
  }
  const inCode = (i: number) =>
    spans.some((s) => s.kind === "code" && i >= s.from && i < s.to);
  type Run = {
    pos: number;
    ch: string;
    canOpen: boolean;
    canClose: boolean;
    remaining: number;
    used: number;
  };
  const runs: Run[] = [];
  for (let i = 0; i < line.length;) {
    const ch = line[i];
    if ((ch !== "*" && ch !== "_") || inCode(i) || line[i - 1] === "\\") {
      i++;
      continue;
    }
    let j = i;
    while (line[j] === ch) j++;
    const prev = i > 0 ? line[i - 1] : " ";
    const next = j < line.length ? line[j] : " ";
    runs.push({
      pos: i,
      ch,
      canOpen: !/\s/.test(next),
      canClose: !/\s/.test(prev),
      remaining: j - i,
      used: 0,
    });
    i = j;
  }
  const openers: Run[] = [];
  for (const run of runs) {
    if (run.canClose) {
      while (run.remaining > 0) {
        let oi = openers.length - 1;
        while (oi >= 0 && openers[oi].ch !== run.ch) oi--;
        if (oi < 0) break;
        const opener = openers[oi];
        const use = opener.remaining >= 2 && run.remaining >= 2 ? 2 : 1;
        // An opener spends delimiters from its RIGHT end, a closer from its
        // LEFT — so `***x***` pairs the inner two as strong, the outer as em.
        const openFrom = opener.pos + opener.remaining - use;
        const closeFrom = run.pos + run.used;
        spans.push({
          kind: use === 2 ? "strong" : "em",
          from: openFrom,
          to: closeFrom + use,
          openLen: use,
          closeLen: use,
        });
        opener.remaining -= use;
        run.remaining -= use;
        run.used += use;
        // Openers above the matched one can never pair now; an exhausted
        // opener leaves too.
        openers.length = opener.remaining === 0 ? oi : oi + 1;
      }
    }
    if (run.remaining > 0 && run.canOpen) openers.push(run);
  }
  return spans;
}

