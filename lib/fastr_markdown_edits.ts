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
  type FastrInkRole,
  isFastrInkRole,
  parseContainerFence,
} from "./fastr_markdown_blocks.ts";

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
    const open = line.text.lastIndexOf(before, from - line.from - 1);
    const close = line.text.indexOf(after, from - line.from);
    if (open !== -1 && close !== -1 && open + before.length <= close) {
      return {
        changes: [
          { from: line.from + open, to: line.from + open + before.length, insert: "" },
          { from: line.from + close, to: line.from + close + after.length, insert: "" },
        ],
      };
    }
    // Nothing to unwrap — open a pair and put the caret between them.
    return {
      changes: [{ from, to, insert: before + after }],
      selection: { anchor: from + before.length },
    };
  }

  // `** bold **` does not render as bold, and a double-click routinely takes
  // the trailing space with it — so the delimiters go INSIDE the whitespace.
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const innerFrom = from + lead;
  const innerTo = to - trail;
  if (innerFrom >= innerTo) {
    return {
      changes: [{ from, to, insert: before + after }],
      selection: { anchor: from + before.length },
    };
  }
  return {
    changes: [
      { from: innerFrom, to: innerFrom, insert: before },
      { from: innerTo, to: innerTo, insert: after },
    ],
    // Keep the text selected so a second click unwraps it.
    selection: {
      anchor: innerFrom + before.length,
      head: innerTo + before.length,
    },
  };
}

// ── Role marks ───────────────────────────────────────────────────────────────

const ROLE_CLOSE_RE = /^\}\{\.([a-z][a-z0-9-]*)\}/;

// `[phrase]{.danger}`. Passing undefined removes the mark around the caret or
// selection; picking a different role rewrites the existing one in place.
export function setInlineRoleEdit(
  doc: string,
  from: number,
  to: number,
  role: FastrInkRole | undefined,
): EditResult {
  const existing = findEnclosingRole(doc, from, to);
  if (existing) {
    if (role === undefined) {
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
        { from: existing.textEnd, to: existing.to, insert: `]{.${role}}` },
      ],
    };
  }
  if (role === undefined) return NONE;
  if (from === to) {
    return {
      changes: [{ from, to, insert: `[]{.${role}}` }],
      selection: { anchor: from + 1 },
    };
  }
  const sel = doc.slice(from, to);
  const lead = sel.length - sel.trimStart().length;
  const trail = sel.length - sel.trimEnd().length;
  const innerFrom = from + lead;
  const innerTo = to - trail;
  if (innerFrom >= innerTo) {
    return {
      changes: [{ from, to, insert: `[]{.${role}}` }],
      selection: { anchor: from + 1 },
    };
  }
  return {
    changes: [
      { from: innerFrom, to: innerFrom, insert: "[" },
      { from: innerTo, to: innerTo, insert: `]{.${role}}` },
    ],
    selection: { anchor: innerFrom + 1, head: innerTo + 1 },
  };
}

type FoundRole = {
  role: FastrInkRole;
  // `[` position.
  from: number;
  // Position of the `]`.
  textEnd: number;
  // One past the closing `}`.
  to: number;
};

// The mark enclosing the range, searched within the caret's own line — a mark
// never spans lines, so there is no reason to scan the document.
function findEnclosingRole(
  doc: string,
  from: number,
  to: number,
): FoundRole | undefined {
  const line = lineAt(doc, from);
  if (to > line.to) return undefined;
  const relFrom = from - line.from;
  const relTo = to - line.from;
  for (let i = 0; i < line.text.length; i++) {
    if (line.text[i] !== "[") continue;
    const close = line.text.indexOf("]", i + 1);
    if (close === -1) continue;
    // ROLE_CLOSE_RE is anchored on the `}` that closes the label's `]`, so
    // prepend one to reuse the same expression the renderer's rule uses.
    const m = ROLE_CLOSE_RE.exec("}" + line.text.slice(close + 1));
    if (!m || !isFastrInkRole(m[1])) continue;
    // One past the closing `}`: `]` plus `{.role}`, less the borrowed `}`.
    const end = close + m[0].length;
    if (relFrom < i || relTo > end) continue;
    return {
      role: m[1],
      from: line.from + i,
      textEnd: line.from + close,
      to: line.from + end,
    };
  }
  return undefined;
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
  return {
    bold: wrappedBy(lineText, from, to, "**"),
    italic: wrappedBy(lineText, from, to, "*") &&
      !wrappedBy(lineText, from, to, "**"),
    code: wrappedBy(lineText, from, to, "`"),
    role: roleAt(lineText, from, to),
    headingLevel: heading ? heading[2].length : 0,
    list: BULLET_RE.test(lineText)
      ? "bullet"
      : ORDERED_RE.test(lineText)
      ? "ordered"
      : undefined,
  };
}

function wrappedBy(
  line: string,
  from: number,
  to: number,
  delim: string,
): boolean {
  const open = line.lastIndexOf(delim, Math.max(0, from - 1));
  if (open === -1) return false;
  const close = line.indexOf(delim, Math.max(to, open + delim.length));
  return close !== -1 && close >= to;
}

function roleAt(
  line: string,
  from: number,
  to: number,
): FastrInkRole | undefined {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== "[") continue;
    const close = line.indexOf("]", i + 1);
    if (close === -1) continue;
    const m = ROLE_CLOSE_RE.exec("}" + line.slice(close + 1));
    if (!m || !isFastrInkRole(m[1])) continue;
    const end = close + m[0].length;
    if (from >= i && to <= end) return m[1];
  }
  return undefined;
}
