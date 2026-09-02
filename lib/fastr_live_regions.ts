// =============================================================================
// Live-preview REGIONS — the block-level units the FASTR editor's Edit mode
// renders as widgets. A region is a contiguous top-level line range: a `:::`
// container (with everything nested inside it), a one-line leaf fence, a
// markdown table, or a lone embed token. Everything between regions is prose,
// which the inline conceal layer owns.
//
// Pure and DOM-free like the rest of the syntax layer, so the mapper is
// Deno-testable and the editor can feed it doc.iterLines() without
// materialising the document as a string.
//
// Table detection is a delimiter-row heuristic, NOT a parse: the editor's
// Lezer tree is commonmark (no Table nodes), and a heuristic in lib/ stays
// testable. It is deliberately conservative — a table markdown-it would accept
// as a paragraph interruption is left as prose. Misdetection is SELF-CORRECTING
// for fidelity: a widget always shows the true render of its source slice
// through the real renderer, so the worst case of a boundary miss is an odd
// collapse edge, never a wrong rendering.
// =============================================================================

import {
  type FastrOpenFence,
  fastrOpenFenceOnLine,
  isFastrLeafBlock,
  scanContainerLines,
} from "./fastr_markdown_blocks.ts";
import { parseReportEmbedLine } from "./types/reports.ts";

export type FastrLiveRegion = {
  kind: "container" | "leaf" | "table" | "embed";
  // 0-based inclusive line indexes.
  startLine: number;
  endLine: number;
  // container/leaf only: the OUTERMOST open fence.
  fence?: FastrOpenFence;
  // container only: no matching close before EOF. The region runs to the end,
  // byte-for-byte the markdown-it block rule's behaviour, so the widget
  // renders exactly what View renders.
  unclosed?: boolean;
};

// `![cap](figure:id){width=wide}` — the width attrs live OUTSIDE the token, so
// strip them before asking the embed parser (whose line form is anchored).
const TRAILING_ATTRS_RE = /\s*\{[^}]*\}\s*$/;

export function isFastrEmbedLine(text: string): boolean {
  return isEmbedLine(text);
}

function isEmbedLine(text: string): boolean {
  const t = text.trim().replace(TRAILING_ATTRS_RE, "");
  return t.length > 0 && parseReportEmbedLine(t, "fastr") !== undefined;
}

// A GFM delimiter row (`| --- | :---: |`), which is what separates "a line
// with pipes in it" from a table. Requires an actual pipe so a bare `---`
// (a thematic break) can never match.
const DELIMITER_ROW_RE = /^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?$/;

function isDelimiterRow(text: string): boolean {
  const t = text.trim();
  return t.includes("|") && DELIMITER_ROW_RE.test(t);
}

export function fastrLiveRegions(lines: Iterable<string>): FastrLiveRegion[] {
  const scanned = [...scanContainerLines(lines)];
  const regions: FastrLiveRegion[] = [];
  let i = 0;
  // Whether a table header may start at the current line: doc start, after a
  // blank line, or straight after another region — never mid-paragraph, so a
  // pipe in prose can't grow a table out of the sentence above it.
  let boundaryBefore = true;
  while (i < scanned.length) {
    const s = scanned[i];
    if (s.inCode) {
      boundaryBefore = false;
      i++;
      continue;
    }
    if (s.fence?.kind === "open") {
      const fence = fastrOpenFenceOnLine(s.text, s.index + 1);
      if (isFastrLeafBlock(s.fence.name)) {
        regions.push({ kind: "leaf", startLine: s.index, endLine: s.index, fence });
        boundaryBefore = true;
        i++;
        continue;
      }
      // Walk to the close that returns this container to depth 0. Leaf fences
      // never change depth — pushing one would mis-nest the whole document.
      let depth = 1;
      let j = i + 1;
      for (; j < scanned.length; j++) {
        const t = scanned[j];
        if (t.inCode || !t.fence) continue;
        if (t.fence.kind === "open") {
          if (!isFastrLeafBlock(t.fence.name)) depth++;
          continue;
        }
        if (--depth === 0) break;
      }
      const unclosed = j >= scanned.length;
      regions.push({
        kind: "container",
        startLine: s.index,
        endLine: unclosed ? scanned.length - 1 : scanned[j].index,
        fence,
        ...(unclosed ? { unclosed: true } : {}),
      });
      boundaryBefore = true;
      i = unclosed ? scanned.length : j + 1;
      continue;
    }
    if (s.fence?.kind === "close") {
      // A stray close with no open block: prose, and not a table boundary.
      boundaryBefore = false;
      i++;
      continue;
    }
    if (isEmbedLine(s.text)) {
      regions.push({ kind: "embed", startLine: s.index, endLine: s.index });
      boundaryBefore = true;
      i++;
      continue;
    }
    const next = scanned[i + 1];
    if (
      boundaryBefore &&
      s.text.includes("|") &&
      s.text.trim().length > 0 &&
      next !== undefined && !next.inCode && next.fence === undefined &&
      isDelimiterRow(next.text)
    ) {
      let j = i + 2;
      while (j < scanned.length) {
        const t = scanned[j];
        if (t.inCode || t.fence !== undefined || t.text.trim().length === 0 ||
          !t.text.includes("|")
        ) break;
        j++;
      }
      regions.push({ kind: "table", startLine: s.index, endLine: j - 1 });
      boundaryBefore = true;
      i = j;
      continue;
    }
    boundaryBefore = s.text.trim().length === 0;
    i++;
  }
  return regions;
}
