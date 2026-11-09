// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// The page map an AI reads after writing a FASTR Markdown report: what landed
// on each printed page, how full the page is, and what went wrong (a page
// left short by a block that moved whole to the next, a last page that is a
// stub). The layout comes from the paged runner (report_fastr_paged.ts) via
// the client's paginator; this turns its pages and block heights into text
// the model can act on with the format's page budget (fastr_markdown_spec.ts).
// =============================================================================

import {
  type FastrLiveRegion,
  fastrLiveRegions,
} from "./fastr_live_regions.ts";
import {
  fastrFigureWidthOfLine,
  fastrPageMarginPx,
  fastrSheetPx,
  readFastrDocumentSettings,
} from "./fastr_markdown_blocks.ts";
import { findReportEmbeds } from "./embeds.ts";
import { fastrPageArea } from "./fastr_markdown_pages.ts";
import { fastrPageTemplate } from "./fastr_page_templates.ts";
import type { FastrPagedResult } from "./report_fastr_paged.ts";
import {
  fastrBodyLinePx,
  type FastrReportTheme,
  fastrThemeTokens,
} from "./report_fastr_themes.ts";

// A page (not the last) filled under this share is short; a last page under
// this share is a stub.
export const FASTR_PAGE_SHORT_SHARE = 0.75;
export const FASTR_PAGE_STUB_SHARE = 0.4;
// A page that ends at a break (or before a page template, which takes the
// next page whole) filled under this share leaves a hole the break made.
// Designed reports leave at most about a third of a page empty, and only at
// a chapter's end, so the bar is lower than a flowing page's.
export const FASTR_PAGE_BREAK_SHORT_SHARE = 0.65;
// The page before a page template is held to a flowing page's bar: a report
// leans on templates, so the page before one is an ordinary page of it, and
// a third of it white before each template read as gaps (Nick, 2026-11-02).
export const FASTR_PAGE_BEFORE_TEMPLATE_SHORT_SHARE = FASTR_PAGE_SHORT_SHARE;
// A page (not the last) filled under this share is a hole no draft may keep:
// its problem carries FASTR_PAGE_MUST_FIX, which a host's waiver
// (rewrite_report's acceptPageProblems) does not cover.
export const FASTR_PAGE_HOLE_SHARE = 0.5;
export const FASTR_PAGE_MUST_FIX = "MUST FIX";
// A page of running prose alone (no figure, table or block) filled to this
// share reads as a wall of text, in a report that uses blocks at all.
export const FASTR_PLAIN_PAGE_SHARE = 0.6;
// A band turns the argument in a sentence or two; past this many words it
// holds a paragraph of analysis, which is a callout's job.
export const FASTR_BAND_MAX_WORDS = 40;
// A findings page with fewer findings than this spreads them down the page
// with a third of it gaps.
export const FASTR_FINDINGS_MIN_ITEMS = 5;
// A paragraph this many words or longer printed twice (a citation on the
// method page and again on the back page) is flagged.
export const FASTR_REPEATED_MIN_WORDS = 8;
// A page template whose content reaches less than this share down its page
// (fastrTemplateFill) is flagged.
export const FASTR_TEMPLATE_FILL_SHARE = 0.75;
// A figure caption longer than this many words is flagged: a caption is a
// line that states the finding, and the chart under it already carries its
// own title, measure, period and notes.
export const FASTR_CAPTION_MAX_WORDS = 20;
// A section (the run under one heading) with fewer words of running prose
// than this per figure is flagged: a chart between two sentences reads as a
// caption, not an analysis. Designed reports give a chart a few paragraphs.
export const FASTR_FIGURE_MIN_PROSE_WORDS = 120;
// A page that ends with a heading and at most this many paragraphs or lists,
// together no more than this share of the page, before the figure, table or
// page template they introduce opens the next page, ends on a stranded
// opening.
export const FASTR_OPENING_MAX_BLOCKS = 2;
export const FASTR_OPENING_MAX_SHARE = 0.3;

type MapBlock = { line: number; height: number; label: string };

export function fastrPageMapText(
  result: FastrPagedResult,
  body: string,
  // The report's theme: its body line turns an overfull area's px into lines.
  theme?: FastrReportTheme,
): string {
  const linePx = fastrBodyLinePx(
    theme === undefined ? {} : fastrThemeTokens(theme),
  );
  if (result.total === 0 || result.blocks === undefined) {
    return "The report has no pages yet (an empty body, or the layout did not run).";
  }
  const settings = readFastrDocumentSettings(body);
  const [, sheetH] = fastrSheetPx(settings.page);
  const geometry = {
    pageH: sheetH,
    marginPx: fastrPageMarginPx(settings.page.margin),
    sheetW: result.sheet.width,
  };
  const lines = body.split("\n");
  const regions = fastrLiveRegions(lines);
  const owner: (FastrLiveRegion | undefined)[] = new Array(lines.length).fill(
    undefined,
  );
  for (const r of regions) {
    for (let i = r.startLine; i <= r.endLine && i < lines.length; i++) {
      owner[i] = r;
    }
  }
  const blocks: MapBlock[] = result.blocks
    .filter((b) => b.line >= 0 && b.line < lines.length)
    .map((b) => ({
      line: b.line,
      height: b.height,
      label: labelOf(b.line, lines, owner),
    }))
    .sort((a, b) => a.line - b.line);
  const pages = result.pages;
  const out: string[] = [];
  const problems: string[] = [];
  const pct = (px: number, area: number) => Math.round(100 * px / area);
  // A short page's problem, marked when the page is a hole.
  const shortProblem = (fill: number, text: string) =>
    fill < 100 * FASTR_PAGE_HOLE_SHARE
      ? `${FASTR_PAGE_MUST_FIX}: ${text} A page more than half empty cannot be waived.`
      : text;
  // A plain document (the user asked for no blocks) is not held to the
  // checks that ask for blocks.
  const designed = regions.some((r) =>
    r.fence !== undefined && r.fence.name !== "report"
  );
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const next = pages[i + 1];
    const from = page.firstLine ?? 0;
    const to = next?.firstLine ?? lines.length;
    const area = fastrPageArea(geometry, {
      cover: page.cover,
      flushTop: page.flushTop,
    });
    const fill = pct(page.contentHeight, area);
    const last = next === undefined;
    const own = blocks.filter((b) => b.line >= from && b.line < to);
    // Runs of blank lines read as one.
    const rows: string[] = [];
    let blanks = 0;
    let blankPx = 0;
    const flushBlanks = () => {
      if (blanks === 0) return;
      rows.push(
        `  ${String(pct(blankPx, area)).padStart(3)}%  blank line${
          blanks > 1 ? `s x${blanks}` : ""
        }`,
      );
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
      rows.push(
        `  ${
          String(pct(page.contentHeight - boxes, area)).padStart(3)
        }%  spacing between blocks`,
      );
    }
    let note = "";
    // A page that ends at a break, or before a page template (which takes
    // the next page alone), ends there because the author put it there, so
    // its foot is the break's doing rather than the paginator's.
    const beforeTemplate = next !== undefined &&
      opensTemplate(lines, owner, next.firstLine);
    // The contents is a page of its own too: the page before it stops
    // where it starts, and its own page is as full as its list.
    const beforeContents = next !== undefined &&
      opensContents(lines, owner, next.firstLine);
    const byBreak = endsAtPageBreak(lines, from, to) || beforeTemplate ||
      beforeContents;
    const template = opensTemplate(lines, owner, page.firstLine) ||
      opensContents(lines, owner, page.firstLine);
    if (byBreak) note = ", ends at a page break";
    // Whether the page holds a section's own start, or only what the section
    // overran the page before by.
    const opensFresh = i === 0 || template || pages[i - 1].cover ||
      endsAtPageBreak(lines, pages[i - 1].firstLine ?? 0, from) ||
      opensTemplate(lines, owner, pages[i - 1].firstLine) ||
      opensContents(lines, owner, pages[i - 1].firstLine) ||
      own.find((b) => b.label !== "blank line")?.label.startsWith(
          "section heading ",
        ) === true;
    if (
      !last && byBreak && !template &&
      fill <
        100 *
          (beforeTemplate
            ? FASTR_PAGE_BEFORE_TEMPLATE_SHORT_SHARE
            : FASTR_PAGE_BREAK_SHORT_SHARE)
    ) {
      const what = own.filter((b) => b.label !== "blank line").map((b) =>
        b.label
      );
      if (!opensFresh) {
        note += ", SPILL";
        problems.push(shortProblem(
          fill,
          `Page ${page.number} is ${fill}% full with only the end of the section from page ${
            page.number - 1
          } (${what.join(", ")}), then ${
            beforeTemplate
              ? "a page template, which takes the next page whole"
              : "a page break"
          }: the section ran past its page by a little and left this page nearly empty. ${
            beforeTemplate
              ? "Move the template where a page ends anyway (straight after a full-page cover, or last)"
              : "Drop the break so the next section follows on this page"
          }, or trim the section so it ends on page ${page.number - 1}.`,
        ));
      } else if (beforeContents) {
        note += ", SHORT";
        problems.push(shortProblem(
          fill,
          `Page ${page.number} is ${fill}% full: the contents after it takes the next page whole, so this page stops where it is. Put the contents straight after the cover (or first, when there is no cover), so no page stops short before it.`,
        ));
      } else if (beforeTemplate) {
        note += ", SHORT";
        problems.push(shortProblem(
          fill,
          `Page ${page.number} is ${fill}% full: the page template after it takes the next page whole, so this page stops where it is. Fill it from its own sections (end the section on its callout or steps, or carry a paragraph across from the section before), or move the template to where a page ends anyway (straight after a full-page cover or another template, or as the last page). Never fill it with a section written only to fill it.`,
        ));
      } else {
        note += ", SHORT";
        problems.push(shortProblem(
          fill,
          `Page ${page.number} is ${fill}% full: the page break after it leaves the rest of the page empty. Drop the break and let the next section follow on this page (sections share pages; keep a break only for a chapter turn in a long report), or fill the page.`,
        ));
      }
    }
    if (!last && !byBreak && !template && fill < 100 * FASTR_PAGE_SHORT_SHARE) {
      const at = next !== undefined
        ? blocks.findIndex((b) => b.line === next.firstLine)
        : -1;
      const culprit = at >= 0 ? blocks[at] : undefined;
      // A heading moves for the block after it: name that block.
      const kept =
        culprit !== undefined && /^(section )?heading /.test(culprit.label)
          ? blocks[at + 1]
          : undefined;
      const why = culprit !== undefined
        ? kept !== undefined
          ? `the next block did not fit and moved whole to page ${
            page.number + 1
          }: ${kept.label} (${
            pct(kept.height, area)
          }%), with the ${culprit.label} above it`
          : `the next block did not fit and moved whole to page ${
            page.number + 1
          }: ${culprit.label} (${pct(culprit.height, area)}%)`
        : `the next page starts inside a block`;
      note = `, SHORT: ${why}`;
      problems.push(shortProblem(
        fill,
        `Page ${page.number} is ${fill}% full: ${why}. Move prose or a smaller block across the boundary (a section's paragraphs that read a tall figure can stand above it, so the figure opens the next page under them), trim, or split the section so the page fills.`,
      ));
    }
    // A heading as the page's last block: the page ends under it (a page
    // break or a break=after follows), and the heading is cut off from
    // what it introduces.
    const tail = own[own.length - 1];
    if (
      !last && tail !== undefined && /^(section )?heading /.test(tail.label)
    ) {
      note += `, STRANDED: ${tail.label}`;
      problems.push(
        `Page ${page.number} ends with the ${tail.label}: a page break stands between it and its section. Move the break above the heading.`,
      );
    }
    // A section's opening at the page's foot: its heading and a short
    // lead-in end the page, and the figure, table or page template they
    // introduce opens the next one, with the hole it left between them.
    const printed = own.filter((b) => b.label !== "blank line");
    let lead = -1;
    for (let k = printed.length - 1; k >= 0; k--) {
      if (/^(section )?heading /.test(printed[k].label)) {
        lead = k;
        break;
      }
    }
    const opening = lead >= 0 ? printed.slice(lead) : [];
    const introduced = next === undefined
      ? undefined
      : blocks.find((b) =>
        b.line >= (next.firstLine ?? 0) && b.label !== "blank line"
      );
    if (
      !last && !template && opening.length >= 2 &&
      opening.length <= 1 + FASTR_OPENING_MAX_BLOCKS &&
      opening.slice(1).every((b) => /^(paragraph|list) /.test(b.label)) &&
      pct(opening.reduce((sum, b) => sum + b.height, 0), area) <=
        100 * FASTR_OPENING_MAX_SHARE &&
      introduced !== undefined &&
      /^(figure "|image "|table \(|page template )/.test(introduced.label)
    ) {
      note += `, STRANDED OPENING: ${opening[0].label}`;
      problems.push(
        introduced.label.startsWith("page template ")
          ? `Page ${page.number} ends with the ${
            opening[0].label
          } and its lead-in, then the ${introduced.label} opens page ${
            page.number + 1
          } under its own heading: this section is a heading and a paragraph cut off at the foot of the page. A page template's heading is its section's, so drop this heading and fold the lead-in into the template's main text, or into the section before.`
          : `Page ${page.number} ends with the ${
            opening[0].label
          } and its lead-in, and the ${introduced.label} they introduce opens page ${
            page.number + 1
          }: the reader meets the heading at the foot of one page and what it introduces on the next. Give the opening more of the section's prose so it fills this page before the ${
            introduced.label.split(" ")[0]
          }, or trim the page above so the ${
            introduced.label.split(" ")[0]
          } fits under its opening.`,
      );
    }
    // A section's closing block that missed the foot of its page: it opens
    // this page alone, above the next section's heading, cut off from the
    // section it closes.
    const BLOCK_LABEL = /^(callout|band |quote block|steps |columns |tiles )/;
    if (
      i > 0 && !template && !opensFresh && printed.length >= 2 &&
      BLOCK_LABEL.test(printed[0].label) &&
      /^(section )?heading /.test(printed[1].label)
    ) {
      note += `, DETACHED: ${printed[0].label}`;
      problems.push(
        `Page ${page.number} opens with the ${
          printed[0].label
        } that closes the section on page ${page.number - 1}, alone above the ${
          printed[1].label
        }: it missed the foot of its page and now sits cut off from its section. Move it up between that section's paragraphs, so the section ends on prose (a paragraph runs on across pages), or trim page ${
          page.number - 1
        } so it fits there.`,
      );
    }
    // A page of nothing but running prose, in a report built from blocks:
    // a wall of text between designed pages.
    const proseOnly = printed.length > 0 &&
      printed.every((b) =>
        /^(paragraph|list|(section )?heading) /.test(b.label)
      );
    const prosePct = pct(printed.reduce((sum, b) => sum + b.height, 0), area);
    if (
      designed && !last && !template && !page.cover && proseOnly &&
      prosePct >= 100 * FASTR_PLAIN_PAGE_SHARE
    ) {
      note += ", PLAIN";
      problems.push(
        `Page ${page.number} is ${prosePct}% running prose with no figure, table or block: a wall of text between designed pages. Give it a block from its section (a callout for the caveat or the key finding, columns for a two-sided point, steps for actions) or its figure, moving prose across the page boundary to make room.`,
      );
    }
    // A band as the last thing before a page template: its ground stops
    // where its text does, and the page goes white under it.
    const lastPrinted = printed[printed.length - 1];
    if (
      !last && beforeTemplate && lastPrinted !== undefined &&
      lastPrinted.label.startsWith("band ")
    ) {
      note += ", BAND BEFORE TEMPLATE";
      problems.push(
        `Page ${page.number} ends on the ${lastPrinted.label}, then the page template takes the next page: the band floats with the page white beneath it. End the section on prose, a callout or its steps instead.`,
      );
    }
    // A page template's area that holds more than it shows: the reader
    // never sees the rest, so it is the first thing to fix.
    for (const o of page.overfull ?? []) {
      const rows = Math.max(1, Math.round(o.px / linePx));
      const where = o.area === "main" ? "main text" : `\`${o.area}\` slot`;
      note += `, OVERFULL: ${where}`;
      problems.push(
        `Page ${page.number} is a page template whose ${where} holds about ${rows} line${
          rows === 1 ? "" : "s"
        } more than it shows, which the reader never sees. Trim it, or move the rest out of the template.`,
      );
    }
    // A page template whose content stops part way down: the rest of the
    // page prints empty, which reads as a page left unfinished.
    if (
      template && page.templateFill !== undefined &&
      page.templateFill < FASTR_TEMPLATE_FILL_SHARE
    ) {
      const reach = Math.round(page.templateFill * 100);
      note += `, UNDERFILLED: the template's content reaches ${reach}% down`;
      problems.push(
        `Page ${page.number} is a page template whose content reaches only ${reach}% down its page, and the rest prints empty. Give it what its layout is built for (get_page_template lists each slot and how many items it takes; a map or chart slot left empty is the usual gap), or, when there is no more to say, write the content as ordinary blocks in the flow instead of a template.`,
      );
    }
    // A last page that a break opened holds a whole section of its own,
    // which is not a stub however short it is; nor is a page template.
    const ownSection = template || i > 0 &&
        endsAtPageBreak(lines, pages[i - 1].firstLine ?? 0, from) &&
        own.some((b) => b.label.startsWith("section heading "));
    if (
      last && pages.length > 1 && !ownSection &&
      fill < 100 * FASTR_PAGE_STUB_SHARE
    ) {
      note = `, STUB`;
      problems.push(
        `Page ${page.number} (the last) is ${fill}% full with ${own.length} block${
          own.length === 1 ? "" : "s"
        }: a stub. Give it the closing section, or fold its blocks into page ${
          page.number - 1
        } by trimming there.`,
      );
    }
    out.push(
      `Page ${page.number} of ${pages.length}${
        last ? " (last)" : ""
      }: ${fill}% full${note}`,
    );
    out.push(...rows);
  }
  // Two figures with nothing between them: the reader gets two charts and no
  // reading of the first.
  const pageOf = (line: number) => {
    let n = 1;
    for (const p of pages) if ((p.firstLine ?? 0) <= line) n = p.number;
    return n;
  };
  const solid = blocks.filter((b) => b.label !== "blank line");
  for (let k = 1; k < solid.length; k++) {
    const [a, b] = [solid[k - 1], solid[k]];
    if (a.label.startsWith('figure "') && b.label.startsWith('figure "')) {
      problems.push(
        `Page ${
          pageOf(b.line)
        }: two figures stand back to back (${a.label}, then ${b.label}). Put the paragraph that reads the first between them.`,
      );
    }
  }
  for (const e of findReportEmbeds(body)) {
    if (e.kind !== "figure") continue;
    const words = e.caption.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= FASTR_CAPTION_MAX_WORDS) continue;
    const line = body.slice(0, e.start).split("\n").length - 1;
    problems.push(
      `Page ${pageOf(line)}: the caption of figure "${
        words.slice(0, 8).join(" ")
      }…" is ${words.length} words. A caption is one line (up to about ${FASTR_CAPTION_MAX_WORDS} words) that states the finding; the chart already shows its title, measure, period and notes, and the numbers belong in the paragraph that reads it.`,
    );
  }
  for (const r of regions) {
    if (r.kind !== "embed") continue;
    const text = lines[r.startLine] ?? "";
    if (!/\]\(figure:/.test(text)) continue;
    if (fastrFigureWidthOfLine(text) !== "small") continue;
    problems.push(
      `Page ${pageOf(r.startLine)}, SMALL: ${
        regionLabel(r, lines)
      } is set {width=small}, half the column; its labels are too small to read in print. Take the width off so it runs the column, and if the page then runs over, move prose across the page boundary rather than shrinking the chart.`,
    );
  }
  // A steps block of one step: lines with no blank line between them run
  // together as a single numbered step, so a list of actions prints as one.
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*:::steps\b/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== ":::") end++;
    const inner = lines.slice(i + 1, end);
    if (paragraphs(inner) !== 1) continue;
    const rows = inner.filter((l) => l.trim().length > 0).length;
    problems.push(
      `Page ${pageOf(i)}: a steps block holds one step${
        rows > 1 ? ` of ${rows} lines` : ""
      }. Each step is a paragraph, so lines with no blank line between them print as one step under a single number. Put a blank line between the steps, or write a single point as a paragraph.`,
    );
  }
  for (const s of fastrProseRuns(lines, owner)) {
    if (s.figures === 0) continue;
    if (s.words >= FASTR_FIGURE_MIN_PROSE_WORDS * s.figures) continue;
    problems.push(
      `Page ${pageOf(s.line)}, THIN: ${
        s.heading === undefined ? "the opening" : `section "${s.heading}"`
      } holds ${
        s.figures === 1 ? "a figure" : `${s.figures} figures`
      } and ${s.words} words of prose. Each chart needs the paragraphs that read it, about ${FASTR_FIGURE_MIN_PROSE_WORDS} words or more: the finding first, then what the chart shows, the exceptions and what drives them, and what it means for the reader, from the figure's data. Write them; do not shrink the chart to make room.`,
    );
  }
  for (const r of regions) {
    const name = r.fence?.name;
    if (name === "band") {
      const words = prose(lines.slice(r.startLine + 1, r.endLine));
      if (words <= FASTR_BAND_MAX_WORDS) continue;
      problems.push(
        `Page ${pageOf(r.startLine)}, LONG BAND: ${
          regionLabel(r, lines)
        } holds a paragraph of analysis. A band turns the argument in a sentence or two (up to about ${FASTR_BAND_MAX_WORDS} words); the analysis and its numbers belong in a callout or the section's prose.`,
      );
    } else if (
      name === "page" && r.fence?.attrs?.["layout"] === "findings"
    ) {
      const items = slotParagraphs(lines, r, "items");
      if (items >= FASTR_FINDINGS_MIN_ITEMS) continue;
      problems.push(
        `Page ${
          pageOf(r.startLine)
        }, SPARSE: the findings page holds ${items} finding${
          items === 1 ? "" : "s"
        }, which the layout spreads down the page with a third of it gaps. Give it ${FASTR_FINDINGS_MIN_ITEMS} or 6, each a bold lead sentence and two sentences of support, or write the findings as ordinary blocks in the flow.`,
      );
    }
  }
  for (const [text, at] of repeatedParagraphs(lines)) {
    problems.push(
      `Pages ${pageOf(at[0])} and ${pageOf(at[1])}, REPEATED: "${
        clip(text, 60)
      }" is printed twice. Keep it once: a report that closes on a back page carries the citation there, and its method page leaves the cite slot out.`,
    );
  }
  out.push("");
  if (problems.length === 0) {
    out.push(
      "Every page is set: none but the last is short, and the last is not a stub.",
    );
  } else {
    out.push("Problems:");
    for (const p of problems) out.push(`- ${p}`);
  }
  return out.join("\n");
}

// Whether the page that opens on `line` opens with a page template.
function opensTemplate(
  lines: string[],
  owner: (FastrLiveRegion | undefined)[],
  line: number | undefined,
): boolean {
  if (line === undefined) return false;
  const r = owner[line];
  return r !== undefined && r.startLine === line && r.fence?.name === "page" &&
    (lines[line] ?? "").trim().startsWith(":::page");
}

// Whether the page opening on `line` opens with the contents block.
function opensContents(
  lines: string[],
  owner: (FastrLiveRegion | undefined)[],
  line: number | undefined,
): boolean {
  if (line === undefined) return false;
  const r = owner[line];
  return r !== undefined && r.startLine === line &&
    r.fence?.name === "contents" &&
    (lines[line] ?? "").trim().startsWith(":::contents");
}

// Whether the page's last line with anything on it is a `:::pagebreak`.
function endsAtPageBreak(lines: string[], from: number, to: number): boolean {
  for (let i = to - 1; i >= from; i--) {
    const t = (lines[i] ?? "").trim();
    if (t.length === 0) continue;
    return /^:::pagebreak\b/.test(t);
  }
  return false;
}

// One line naming a block for the model, from its source.
function labelOf(
  line: number,
  lines: string[],
  owner: (FastrLiveRegion | undefined)[],
): string {
  const r = owner[line];
  if (r !== undefined && r.startLine === line) return regionLabel(r, lines);
  const text = lines[line] ?? "";
  if (text.trim().length === 0) return "blank line";
  const h = /^(#{1,6})\s+(.*)$/.exec(text);
  if (h) {
    return `${h[1].length === 1 ? "section heading" : "heading"} "${
      clip(strip(h[2]), 60)
    }"`;
  }
  if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(text)) {
    let n = line;
    let items = 0;
    while (
      n < lines.length && lines[n].trim().length > 0 && owner[n] === undefined
    ) {
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(lines[n])) items++;
      n++;
    }
    return `list (${items} item${items === 1 ? "" : "s"})`;
  }
  if (/^\s*>/.test(text)) {
    return `quote "${clip(strip(text.replace(/^\s*>\s?/, "")), 40)}"`;
  }
  if (/^\s*(```|~~~)/.test(text)) return "code block";
  let n = line;
  let words = 0;
  while (
    n < lines.length && lines[n].trim().length > 0 && owner[n] === undefined
  ) {
    words += lines[n].trim().split(/\s+/).length;
    n++;
  }
  return `paragraph "${clip(strip(text), 44)}" (${words} words)`;
}

function regionLabel(r: FastrLiveRegion, lines: string[]): string {
  const inner = lines.slice(r.startLine + 1, r.endLine);
  if (r.kind === "table") {
    return `table (${Math.max(0, r.endLine - r.startLine - 1)} rows)`;
  }
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
      return `callout${title ? ` "${clip(title, 40)}"` : ""} (${
        prose(inner)
      } words)`;
    case "band":
      return `band "${
        clip(strip(inner.find((l) => l.trim().length > 0) ?? ""), 50)
      }" (${prose(inner)} words)`;
    case "quote":
      return `quote block (${prose(inner)} words)`;
    case "contents":
      return "contents";
    case "pagebreak":
      return "page break";
    case "stat":
      return "stat";
    case "logos":
      return "logos row";
    case "page": {
      const layout = typeof attrs["layout"] === "string" ? attrs["layout"] : "";
      const label = fastrPageTemplate(layout)?.label ?? layout;
      const h = inner.find((l) => /^#{1,6}\s/.test(l));
      return `page template ${layout} (${label})${
        h ? ` "${clip(strip(h.replace(/^#{1,6}\s+/, "")), 50)}"` : ""
      }`;
    }
    default:
      return `${name} block (${prose(inner)} words)`;
  }
}

// The body cut at every top-level heading and every block that takes a page
// of its own (a cover, a page template): each run's top-level figures and
// the words of its running prose (paragraphs, lists and quotes outside any
// block; headings, captions, tables and blocks do not read a chart).
function fastrProseRuns(
  lines: string[],
  owner: (FastrLiveRegion | undefined)[],
): { line: number; heading?: string; figures: number; words: number }[] {
  const runs: {
    line: number;
    heading?: string;
    figures: number;
    words: number;
  }[] = [{ line: 0, figures: 0, words: 0 }];
  for (let i = 0; i < lines.length; i++) {
    const r = owner[i];
    const text = lines[i] ?? "";
    if (r !== undefined) {
      if (r.startLine !== i) continue;
      const name = r.fence?.name;
      if (name === "page" || name === "cover") {
        runs.push({ line: i, figures: 0, words: 0 });
      } else if (r.kind === "embed" && /\]\(figure:/.test(text)) {
        runs[runs.length - 1].figures++;
      }
      continue;
    }
    const h = /^#{1,6}\s+(.*)$/.exec(text);
    if (h) {
      runs.push({
        line: i,
        heading: clip(strip(h[1]), 60),
        figures: 0,
        words: 0,
      });
      continue;
    }
    const t = strip(text.replace(/^\s*(?:[-*+>]|\d+[.)])\s+/, ""));
    if (t.length > 0) runs[runs.length - 1].words += t.split(/\s+/).length;
  }
  return runs;
}

// The paragraphs in a page template's slot, by the slot's name.
function slotParagraphs(
  lines: string[],
  page: FastrLiveRegion,
  slot: string,
): number {
  const open = new RegExp(`^:::slot\\{[^}]*\\bname=["']?${slot}\\b`);
  for (let i = page.startLine + 1; i < page.endLine; i++) {
    if (!open.test(lines[i].trim())) continue;
    let end = i + 1;
    while (end < page.endLine && lines[end].trim() !== ":::") end++;
    return paragraphs(lines.slice(i + 1, end));
  }
  return 0;
}

// Paragraphs of FASTR_REPEATED_MIN_WORDS or more that the body prints twice,
// by their text, with the lines of their first two appearances. Fence,
// heading, table and embed lines are not paragraph text.
function repeatedParagraphs(lines: string[]): [string, [number, number]][] {
  const seen = new Map<string, number>();
  const found: [string, [number, number]][] = [];
  let start = -1;
  let text: string[] = [];
  const flush = () => {
    if (start < 0) return;
    const shown = strip(text.join(" "));
    // A citation reads the same with or without its label.
    const key = shown.toLowerCase().replace(/\s+/g, " ")
      .replace(/^suggested citation:\s*/, "");
    if (key.split(" ").length >= FASTR_REPEATED_MIN_WORDS) {
      const first = seen.get(key);
      if (first === undefined) seen.set(key, start);
      else if (!found.some(([t]) => t === shown)) {
        found.push([shown, [first, start]]);
      }
    }
    start = -1;
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.length === 0 || /^(:::|#{1,6}\s|\||!\[)/.test(t)) {
      flush();
      continue;
    }
    if (start < 0) start = i;
    text.push(t);
  }
  flush();
  return found;
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
  for (const l of inner) {
    if (!/^:::/.test(l)) {
      words += l.trim().length === 0 ? 0 : l.trim().split(/\s+/).length;
    }
  }
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
