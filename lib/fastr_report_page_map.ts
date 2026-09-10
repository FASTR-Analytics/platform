// =============================================================================
// The page map an AI reads after writing a FASTR Markdown report: what landed
// on each printed page, how full the page is, and what went wrong (a page
// left short by a block that moved whole to the next, a last page that is a
// stub). The layout comes from the paged runner (report_fastr_paged.ts) via
// the client's paginator; this turns its pages and block heights into text
// the model can act on with the format's page budget (fastr_markdown_spec.ts).
// =============================================================================

import { fastrLiveRegions, type FastrLiveRegion } from "./fastr_live_regions.ts";
import {
  FASTR_PAGE_MARGIN_MM,
  fastrSheetMm,
  readFastrDocumentSettings,
} from "./fastr_markdown_blocks.ts";
import { fastrPageArea } from "./fastr_markdown_pages.ts";
import type { FastrPagedResult } from "./report_fastr_paged.ts";

const PX_PER_MM = 96 / 25.4;
// A page (not the last) filled under this share is short; a last page under
// this share is a stub.
export const FASTR_PAGE_SHORT_SHARE = 0.75;
export const FASTR_PAGE_STUB_SHARE = 0.4;

type MapBlock = { line: number; height: number; label: string };

export function fastrPageMapText(result: FastrPagedResult, body: string): string {
  if (result.total === 0 || result.blocks === undefined) {
    return "The report has no pages yet (an empty body, or the layout did not run).";
  }
  const settings = readFastrDocumentSettings(body);
  const [, sheetHmm] = fastrSheetMm(settings.page);
  const geometry = {
    pageH: Math.round(sheetHmm * PX_PER_MM),
    marginPx: Math.round(FASTR_PAGE_MARGIN_MM[settings.page.margin] * PX_PER_MM),
    sheetW: result.sheet.width,
  };
  const lines = body.split("\n");
  const regions = fastrLiveRegions(lines);
  const owner: (FastrLiveRegion | undefined)[] = new Array(lines.length).fill(undefined);
  for (const r of regions) {
    for (let i = r.startLine; i <= r.endLine && i < lines.length; i++) owner[i] = r;
  }
  const blocks: MapBlock[] = result.blocks
    .filter((b) => b.line >= 0 && b.line < lines.length)
    .map((b) => ({ line: b.line, height: b.height, label: labelOf(b.line, lines, owner) }))
    .sort((a, b) => a.line - b.line);
  const pages = result.pages;
  const out: string[] = [];
  const problems: string[] = [];
  const pct = (px: number, area: number) => Math.round(100 * px / area);
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const next = pages[i + 1];
    const from = page.firstLine ?? 0;
    const to = next?.firstLine ?? lines.length;
    const area = fastrPageArea(geometry, { cover: page.cover, flushTop: page.flushTop });
    const fill = pct(page.contentHeight, area);
    const last = next === undefined;
    const own = blocks.filter((b) => b.line >= from && b.line < to);
    // Runs of blank lines read as one.
    const rows: string[] = [];
    let blanks = 0;
    let blankPx = 0;
    const flushBlanks = () => {
      if (blanks === 0) return;
      rows.push(`  ${String(pct(blankPx, area)).padStart(3)}%  blank line${blanks > 1 ? `s x${blanks}` : ""}`);
      blanks = 0;
      blankPx = 0;
    };
    for (const b of own) {
      if (b.label === "blank line") {
        blanks++;
        blankPx += b.height;
        continue;
      }
      flushBlanks();
      rows.push(`  ${String(pct(b.height, area)).padStart(3)}%  ${b.label}`);
    }
    flushBlanks();
    // The shares are the blocks' own boxes; the rest of the fill is the
    // space between them, shown so the column adds up.
    const boxes = own.reduce((sum, b) => sum + b.height, 0);
    if (own.length > 0 && page.contentHeight - boxes > area * 0.005) {
      rows.push(`  ${String(pct(page.contentHeight - boxes, area)).padStart(3)}%  spacing between blocks`);
    }
    let note = "";
    if (!last && fill < 100 * FASTR_PAGE_SHORT_SHARE) {
      const at = next !== undefined ? blocks.findIndex((b) => b.line === next.firstLine) : -1;
      const culprit = at >= 0 ? blocks[at] : undefined;
      // A heading moves for the block after it: name that block.
      const kept = culprit !== undefined && /^(section )?heading /.test(culprit.label) ? blocks[at + 1] : undefined;
      const why = culprit !== undefined
        ? kept !== undefined
          ? `the next block did not fit and moved whole to page ${page.number + 1}: ${kept.label} (${
            pct(kept.height, area)
          }%), with the ${culprit.label} above it`
          : `the next block did not fit and moved whole to page ${page.number + 1}: ${culprit.label} (${
            pct(culprit.height, area)
          }%)`
        : `the next page starts inside a block`;
      note = `, SHORT: ${why}`;
      problems.push(
        `Page ${page.number} is ${fill}% full: ${why}. Move prose or a smaller block across the boundary, trim, or split the section so the page fills.`,
      );
    }
    if (last && pages.length > 1 && fill < 100 * FASTR_PAGE_STUB_SHARE) {
      note = `, STUB`;
      problems.push(
        `Page ${page.number} (the last) is ${fill}% full with ${own.length} block${
          own.length === 1 ? "" : "s"
        }: a stub. Give it the closing section, or fold its blocks into page ${page.number - 1} by trimming there.`,
      );
    }
    out.push(`Page ${page.number} of ${pages.length}${last ? " (last)" : ""}: ${fill}% full${note}`);
    out.push(...rows);
  }
  out.push("");
  if (problems.length === 0) {
    out.push("Every page is set: none but the last is short, and the last is not a stub.");
  } else {
    out.push("Problems:");
    for (const p of problems) out.push(`- ${p}`);
  }
  return out.join("\n");
}

// One line naming a block for the model, from its source.
function labelOf(line: number, lines: string[], owner: (FastrLiveRegion | undefined)[]): string {
  const r = owner[line];
  if (r !== undefined && r.startLine === line) return regionLabel(r, lines);
  const text = lines[line] ?? "";
  if (text.trim().length === 0) return "blank line";
  const h = /^(#{1,6})\s+(.*)$/.exec(text);
  if (h) return `${h[1].length === 1 ? "section heading" : "heading"} "${clip(strip(h[2]), 60)}"`;
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(text)) {
    let n = line;
    let items = 0;
    while (n < lines.length && lines[n].trim().length > 0 && owner[n] === undefined) {
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[n])) items++;
      n++;
    }
    return `list (${items} item${items === 1 ? "" : "s"})`;
  }
  if (/^\s*>/.test(text)) return `quote "${clip(strip(text.replace(/^\s*>\s?/, "")), 40)}"`;
  if (/^\s*(```|~~~)/.test(text)) return "code block";
  let n = line;
  let words = 0;
  while (n < lines.length && lines[n].trim().length > 0 && owner[n] === undefined) {
    words += lines[n].trim().split(/\s+/).length;
    n++;
  }
  return `paragraph "${clip(strip(text), 44)}" (${words} words)`;
}

function regionLabel(r: FastrLiveRegion, lines: string[]): string {
  const inner = lines.slice(r.startLine + 1, r.endLine);
  if (r.kind === "table") return `table (${Math.max(0, r.endLine - r.startLine - 1)} rows)`;
  if (r.kind === "embed") {
    const m = /!\[([^\]]*)\]\((figure|image):/.exec(lines[r.startLine] ?? "");
    return m ? `${m[2]} "${clip(m[1], 50)}"` : "figure";
  }
  const name = r.fence?.name ?? "block";
  const attrs = r.fence?.attrs ?? {};
  const title = typeof attrs["title"] === "string" ? attrs["title"] : undefined;
  switch (name) {
    case "cover": {
      const h = inner.find((l) => /^#\s/.test(l));
      return `cover "${clip(strip(h?.replace(/^#\s+/, "") ?? ""), 50)}"`;
    }
    case "tiles": {
      const stats = inner.filter((l) => /^:::stat\b/.test(l)).length;
      const cards = inner.filter((l) => /^:::card\b/.test(l)).length;
      return `tiles (${stats > 0 ? `${stats} stats` : `${cards} cards`})`;
    }
    case "columns": {
      const cols = inner.filter((l) => /^:::col\b/.test(l)).length;
      return `columns (${cols})`;
    }
    case "steps": {
      const items = paragraphs(inner);
      return `steps (${items} step${items === 1 ? "" : "s"})`;
    }
    case "callout":
      return `callout${title ? ` "${clip(title, 40)}"` : ""} (${prose(inner)} words)`;
    case "band":
      return `band "${clip(strip(inner.find((l) => l.trim().length > 0) ?? ""), 50)}" (${prose(inner)} words)`;
    case "quote":
      return `quote block (${prose(inner)} words)`;
    case "contents":
      return "contents";
    case "pagebreak":
      return "page break";
    case "stat":
      return "stat";
    default:
      return `${name} block (${prose(inner)} words)`;
  }
}

function paragraphs(inner: string[]): number {
  let n = 0;
  let open = false;
  for (const l of inner) {
    const blank = l.trim().length === 0 || /^:::/.test(l);
    if (!blank && !open) n++;
    open = !blank;
  }
  return n;
}
function prose(inner: string[]): number {
  let words = 0;
  for (const l of inner) if (!/^:::/.test(l)) words += l.trim().length === 0 ? 0 : l.trim().split(/\s+/).length;
  return words;
}
function strip(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|`/g, "")
    .trim();
}
function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
