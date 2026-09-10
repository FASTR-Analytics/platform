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
// with fill=page takes page 1 alone, a natural cover opens page 1 flush to
// the sheet's top. A block taller than a page starts one and continues at
// the inner boundaries its caller found (paragraphs of a band, rows of a
// table), or, when it offers none, simply runs past the page.
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
  const safety = g.safety ?? 0;
  if (blocks.length === 0) {
    return { total: 0, sheet: { width: g.sheetW, height: g.pageH }, pages, splits };
  }
  let page = openPage(blocks[0], pages.length === 0);
  let area = fastrPageArea(g, page) - safety;
  let first = 0;
  let used = 0;
  const close = () => {
    pages.push({ ...page, number: pages.length + 1, contentHeight: used });
  };
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (i > first && (b.breakBefore || b.cover !== undefined)) {
      close();
      page = openPage(b, false);
      area = fastrPageArea(g, page) - safety;
      first = i;
      used = 0;
    }
    const need = (i === first ? 0 : b.gap) + b.height;
    if (i > first && used + need > area) {
      // Break before this block, taking a heading directly above with it.
      // A page that would be left with nothing keeps the block instead (it
      // is taller than the page: see below).
      let j = i;
      while (j > first && blocks[j - 1].heading) j--;
      if (j > first) {
        close();
        page = openPage(blocks[j], false);
        area = fastrPageArea(g, page) - safety;
        first = j;
        used = 0;
        for (let k = j; k < i; k++) used += (k === first ? 0 : blocks[k].gap) + blocks[k].height;
        continue;
      }
    }
    if (i === first && b.height > area && b.inner !== undefined && b.inner.length > 0) {
      // Taller than the page: continue at the inner boundaries. Each part
      // ends at the last candidate that still fits it, and the candidate
      // opens the next page.
      splits.push({ line: b.line, page: pages.length + 1 });
      let partTop = 0;
      while (b.height - partTop > area) {
        let cut: { line: number; top: number } | undefined;
        for (const cand of b.inner) {
          if (cand.top <= partTop) continue;
          if (cand.top - partTop > area) break;
          cut = cand;
        }
        if (cut === undefined) break;
        used = cut.top - partTop;
        close();
        page = { firstLine: cut.line, lines: [cut.line], cover: false, flushTop: false };
        area = fastrPageArea(g, page) - safety;
        partTop = cut.top;
      }
      used = b.height - partTop;
    } else {
      used += need;
    }
    if (b.pagebreak || b.breakAfter || b.cover === "fill") {
      if (i + 1 < blocks.length) {
        close();
        page = openPage(blocks[i + 1], false);
        area = fastrPageArea(g, page) - safety;
        first = i + 1;
        used = 0;
      }
    }
    i++;
  }
  close();
  return { total: pages.length, sheet: { width: g.sheetW, height: g.pageH }, pages, splits };
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

// Print's block heights (FastrPagedResult.blocks, from the runner's layout
// of the whole document at the print column) keyed by each block's source
// text, so the editor can find a block's height wherever the block moves:
// a region's lines from fence to fence, a paragraph's consecutive non-blank
// lines. The same grouping the editor's own block walk uses.
export function fastrLayoutHints(result: FastrPagedResult, body: string): Map<string, number> {
  const hints = new Map<string, number>();
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
    hints.set(lines.slice(from, to + 1).join("\n"), b.height);
  }
  return hints;
}
