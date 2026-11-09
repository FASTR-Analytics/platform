// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// A markdown table row's cells, split the way the renderer splits them
// (markdown-it's escapedSplit): on every pipe not preceded by a backslash. A
// `\|` is text inside its cell, so the island showing cell i edits cell i of
// the render, and a row or column action keeps an escaped pipe in its cell. markdown-it 14 gives inline code no special treatment, so a pipe
// in backticks separates cells there too, and here.

import { parseContainerFence } from "./fastr_markdown_blocks.ts";

// Offsets of the pipes that separate cells.
export function tableRowPipes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "|" && (i === 0 || text[i - 1] !== "\\")) out.push(i);
  }
  return out;
}

// The raw segments between separator pipes, WITH their offsets in the line:
// cellSlices(text)[i].raw.trim() is exactly what the cell island shows. The
// empty segments outside a leading and a trailing pipe are not cells.
export function cellSlices(text: string): { start: number; raw: string }[] {
  const pipes = tableRowPipes(text);
  const out: { start: number; raw: string }[] = [];
  let pos = 0;
  for (const p of pipes) {
    out.push({ start: pos, raw: text.slice(pos, p) });
    pos = p + 1;
  }
  out.push({ start: pos, raw: text.slice(pos) });
  const first = text.length - text.trimStart().length;
  const last = text.trimEnd().length - 1;
  let arr = out;
  if (pipes[0] === first && arr.length > 1) arr = arr.slice(1);
  if (pipes.length > 0 && pipes[pipes.length - 1] === last && arr.length > 1) {
    arr = arr.slice(0, -1);
  }
  return arr;
}

// The trimmed text of each cell.
export function tableRowCells(text: string): string[] {
  return cellSlices(text).map((c) => c.raw.trim());
}

// A pipe row that is not a fence: the heuristic every table helper in the
// editor shares (the caret's table context, the cell menu).
export function isTableRowText(text: string): boolean {
  return text.trim().length > 0 && tableRowPipes(text).length > 0 &&
    parseContainerFence(text) === undefined;
}

// Which cell a column of the row falls in (0-based, clamped to the cells).
export function tableCellIndexAt(text: string, col: number): number {
  const slices = cellSlices(text);
  let idx = 0;
  for (let i = 0; i < slices.length; i++) {
    if (slices[i].start <= col) idx = i;
  }
  return idx;
}

// Typed text bound for a cell: a pipe the author types is text, so it goes
// in escaped; one already escaped stays as it is. Line breaks end a row.
export function escapeCellText(text: string): string {
  return text.replace(/[\r\n]/g, " ").replace(/(?<!\\)\|/g, "\\|");
}
