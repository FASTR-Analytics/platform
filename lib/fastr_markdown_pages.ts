// =============================================================================
// FASTR Markdown page layout: which source line each printed page starts on,
// decided from the blocks' heights. Pure, so the editor and the PDF export
// share ONE decision: the editor runs it on CodeMirror's height map after
// every keystroke (live_preview_extension's pageBoxPlugin) and the export
// forces Paged.js to break on exactly the lines the editor chose
// (fastrForcedBreaksCss in report_fastr_paged.ts). The printed page cannot
// then disagree with the page box the author was looking at.
//
// The rules are the paged sheet's: every block keeps whole and moves to the
// next page when it does not fit; a heading travels with the block after
// it; `:::pagebreak` and break=before|after end or start a page; a cover
// with fill=page takes a page alone, a natural cover opens page 1 flush to
// the sheet's top. A block taller than a page starts one and continues at
// the inner boundaries its caller found (paragraphs of a band, rows of a
// table), or, when it offers none, simply runs past the page. A block that
// only its heading precedes on a page continues in place the same way
// rather than move and strand the heading.
// =============================================================================

import { fastrLiveRegions } from "./fastr_live_regions.ts";
import type { FastrPagedResult } from "./report_fastr_paged.ts";

export type FastrLayoutBlock = {
  // 0-based first and last source lines.
  line: number;
  endLine: number;
  // The block's own box, px.
  height: number;
  // Space between the previous block's bottom and this block's top when
  // both sit on one page (blank separator lines, margins), px.
  gap: number;
  // Keep with the block after it.
  heading: boolean;
  // The `:::pagebreak` marker: the page ends after it.
  pagebreak: boolean;
  breakBefore: boolean;
  breakAfter: boolean;
  cover?: "natural" | "fill";
  // Where a block taller than a page may break inside: each candidate's
  // 0-based source line and its top as an offset from the block's top, px,
  // ascending. Absent when the block cannot break (or was not measured).
  inner?: { line: number; top: number }[];
  // What every continuation part of the block adds at its top, px: a
  // table's header rows, repeated on each page it runs on to (print's
  // runner clones the thead; the editor draws the same rows after the seam).
  repeat?: number;
  // What the block may give up when it does not fit the room left on its
  // page, px: a figure's image shrinks (keeping its aspect) down to a
  // floor, and the block then takes exactly the room rather than opening
  // the next page and leaving that room white. Absent for blocks that
  // cannot shrink.
  flex?: number;
  // What stays under the block at the foot of a page when it shrinks to
  // fit, px: the editor's blank separator line after it, which is not
  // content but takes room on the page before the seam.
  tail?: number;
  // A line of space (a second blank line): it travels with the heading
  // above it when that heading moves to the next page.
  space?: boolean;
  // What the block grows by when it OPENS a page, px. Print keeps a block's
  // whole top margin at the top of a page, while the editor's box of a
  // block mid-page keeps only what that margin exceeds the blank separator
  // line by; the difference is the page's, not the block's (the seam before
  // the page carries it), so the block's own height is the same wherever it
  // stands and the layout cannot chase its own seams.
  topExtra?: number;
};

export type FastrLayoutGeometry = {
  // The sheet's height and its margin at the editor's scale, px.
  pageH: number;
  marginPx: number;
  sheetW: number;
  // Room kept free at the foot of every page, px: the editor's measure of a
  // block and print's differ by a pixel or two, and a page that print finds
  // fuller than the editor did would push its last block over.
  safety?: number;
};

// What a page's content may fill: the sheet less both margins; a cover page
// the whole sheet; a page a natural cover opens keeps only its bottom margin.
export function fastrPageArea(
  g: FastrLayoutGeometry,
  page: { cover: boolean; flushTop: boolean },
): number {
  if (page.cover) return g.pageH;
  return g.pageH - (page.flushTop ? 1 : 2) * g.marginPx;
}

export function layoutFastrPages(
  blocks: readonly FastrLayoutBlock[],
  g: FastrLayoutGeometry,
): FastrPagedResult {
  const pages: FastrPagedResult["pages"] = [];
  const splits: FastrPagedResult["splits"] = [];
  const fits: NonNullable<FastrPagedResult["fits"]> = [];
  const safety = g.safety ?? 0;
  if (blocks.length === 0) {
    return { total: 0, sheet: { width: g.sheetW, height: g.pageH }, pages, splits, fits };
  }
  // The height each block was placed at: its own, the room it shrank to, or
  // the last part of one continued across pages.
  const placed = new Map<number, number>();
  // Blocks continued from the page before: the part that opens a page
  // starts at the page's very top, without the extra of a block that
  // begins there.
  const continued = new Set<number>();
  // A cover page keeps no safety: its content is the sheet itself.
  const areaOf = (p: OpenPage) => fastrPageArea(g, p) - (p.cover ? 0 : safety);
  let page = openPage(blocks[0], pages.length === 0);
  let area = areaOf(page);
  let first = 0;
  let used = 0;
  const close = () => {
    pages.push({ ...page, number: pages.length + 1, contentHeight: used });
  };
  const lead = (k: number) => continued.has(k) ? 0 : blocks[k].topExtra ?? 0;
  // What block k adds to the page that block `open` opens: its own box (or
  // the height it was placed at) and the extra of opening the page, or the
  // gap above it and its box.
  const footprint = (k: number, open: number) => {
    const h = placed.get(k) ?? blocks[k].height;
    return k === open ? h + lead(k) : blocks[k].gap + h;
  };
  // What travels with block i when it moves to the next page: the headings
  // directly above it, and the lines of space between them and it. The
  // first of those, or i itself when there are none on this page.
  const keepWith = (i: number) => {
    let j = i;
    let k = i;
    while (k > first && (blocks[k - 1].heading || blocks[k - 1].space)) {
      k--;
      if (blocks[k].heading) j = k;
    }
    return j;
  };
  // Close the page with what stands before block j, open the next page on
  // j, and count blocks j to i - 1 (already placed on the page that closed)
  // onto the new one.
  const reopen = (j: number, i: number) => {
    used = 0;
    for (let k = first; k < j; k++) used += footprint(k, first);
    close();
    page = openPage(blocks[j], false);
    area = areaOf(page);
    first = j;
    used = 0;
    for (let k = j; k < i; k++) used += footprint(k, first);
  };
  // Continue block i at the inner boundaries it offers: each part ends at
  // the last candidate that still fits what is left of its page, and the
  // candidate opens the next page. `before` stands between the page's
  // content so far and the block's top: its gap mid-page, or its extra
  // when it opens the page. A continuation starts at the page's very top.
  const continueInner = (i: number, before: number) => {
    const b = blocks[i];
    const inner = b.inner ?? [];
    splits.push({ line: b.line, page: pages.length + 1 });
    let partTop = 0;
    let extra = before;
    let cut = false;
    // A continuation part (partTop > 0) opens with the block's repeat.
    const head = () => partTop > 0 ? b.repeat ?? 0 : 0;
    while (used + extra + head() + (b.height - partTop) > area) {
      let at: { line: number; top: number } | undefined;
      for (const cand of inner) {
        if (cand.top <= partTop) continue;
        if (used + extra + head() + (cand.top - partTop) > area) break;
        at = cand;
      }
      if (at === undefined) break;
      used += extra + head() + (at.top - partTop);
      close();
      page = { firstLine: at.line, lines: [at.line], cover: false, flushTop: false };
      area = areaOf(page);
      partTop = at.top;
      extra = 0;
      used = 0;
      cut = true;
    }
    if (cut) {
      first = i;
      continued.add(i);
      placed.set(i, head() + (b.height - partTop));
    }
    used += extra + head() + (b.height - partTop);
  };
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (i > first && (b.breakBefore || b.cover !== undefined)) {
      // The page ends above the block. The headings directly above a
      // block that starts a page travel with it: a section's heading
      // introduces the block, and a break under it would strand it.
      const j = b.breakBefore ? keepWith(i) : i;
      if (j > first) reopen(j, i);
    }
    let need = footprint(i, first);
    if (i > first && used + need > area && (b.flex ?? 0) > 0) {
      // Short of room: a figure shrinks to what is left when that keeps it
      // above its floor, and the page is full.
      const room = area - used - b.gap - (b.tail ?? 0);
      if (room >= b.height - (b.flex ?? 0)) {
        placed.set(i, room);
        fits.push({ line: b.line, shrink: b.height - room });
        need = b.gap + room;
      }
    }
    let done = false;
    if (i > first && used + need > area) {
      // Break before this block, taking the headings directly above with it.
      const j = keepWith(i);
      if (j > first) {
        reopen(j, i);
        continue;
      }
      // Nothing but those headings stands before it on this page, so it
      // cannot move without stranding them. A block that can continue at
      // its inner boundaries starts here and does; any other keeps the
      // page and runs past it (it is taller than the page: see below).
      if (b.inner !== undefined && b.inner.length > 0) {
        continueInner(i, b.gap);
        done = true;
      }
    }
    if (!done) {
      if (i === first && b.height + lead(i) > area && b.inner !== undefined && b.inner.length > 0) {
        // Taller than the page it opens: continue at the inner boundaries.
        continueInner(i, lead(i));
      } else {
        used += need;
      }
    }
    // A page ends after a marker, a break=after block or a filling cover.
    // A marker that opens a page (the document's first block, or one
    // right after another break) ends nothing: no page is left empty.
    if ((b.pagebreak && i > first) || b.breakAfter || b.cover === "fill") {
      if (i + 1 < blocks.length) {
        close();
        page = openPage(blocks[i + 1], false);
        area = areaOf(page);
        first = i + 1;
        used = 0;
      }
    }
    i++;
  }
  close();
  return { total: pages.length, sheet: { width: g.sheetW, height: g.pageH }, pages, splits, fits };
}

type OpenPage = { firstLine: number; lines: number[]; cover: boolean; flushTop: boolean };

function openPage(b: FastrLayoutBlock, isFirst: boolean): OpenPage {
  return {
    firstLine: b.line,
    lines: [b.line],
    cover: b.cover === "fill",
    flushTop: isFirst && b.cover === "natural",
  };
}

// The 0-based source lines that open page 2 onward: what the export forces.
export function fastrPageStartLines(result: FastrPagedResult): number[] {
  const out: number[] = [];
  for (const p of result.pages) {
    if (p.number >= 2 && p.firstLine !== undefined) out.push(p.firstLine);
  }
  return out;
}

// Print's height of a block, and for one taller than half a page where it
// may continue on the next page (source lines relative to the block's
// first, tops from the block's top, px).
export type FastrLayoutHint = { height: number; inner?: { rel: number; top: number }[] };

// Print's block heights (FastrPagedResult.blocks, from the runner's layout
// of the whole document at the print column) keyed by each block's source
// text, so the editor can find a block's height wherever the block moves:
// a region's lines from fence to fence, a paragraph's consecutive non-blank
// lines. The same grouping the editor's own block walk uses.
export function fastrLayoutHints(result: FastrPagedResult, body: string): Map<string, FastrLayoutHint> {
  const hints = new Map<string, FastrLayoutHint>();
  if (result.blocks === undefined) return hints;
  const lines = body.split("\n");
  const owner: (readonly [number, number] | undefined)[] = new Array(lines.length).fill(undefined);
  for (const r of fastrLiveRegions(lines)) {
    for (let i = r.startLine; i <= r.endLine && i < lines.length; i++) owner[i] = [r.startLine, r.endLine];
  }
  for (const b of result.blocks) {
    if (b.line < 0 || b.line >= lines.length) continue;
    const r = owner[b.line];
    let from = b.line;
    let to = b.line;
    if (r !== undefined) {
      if (r[0] !== b.line) continue;
      [from, to] = r;
    } else {
      if (lines[b.line].trim().length === 0) continue;
      while (to + 1 < lines.length && owner[to + 1] === undefined && lines[to + 1].trim().length > 0) to++;
    }
    const hint: FastrLayoutHint = { height: b.height };
    if (b.inner !== undefined && b.inner.length > 0) {
      const inner = b.inner.map((c) => ({ rel: c.line - from, top: c.top })).filter((c) => c.rel > 0);
      if (inner.length > 0) hint.inner = inner;
    }
    hints.set(lines.slice(from, to + 1).join("\n"), hint);
  }
  return hints;
}
