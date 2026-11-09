// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// =============================================================================
// Report sections & headings: the structural layer behind the AI report tools
// (rewrite_section, insert_figure.afterHeading, the headings index). A section
// is a heading and everything down to the next heading of the same or a higher
// level, counting only the headings the renderer draws outside every `:::`
// container, list and quote (topLevelHeadings).
// =============================================================================

import {
  isFastrLeafBlock,
  scanContainerLines,
} from "./fastr_markdown_blocks.ts";
import {
  fastrSectionHeadings,
  parseFastrMarkdownBlocks,
} from "./report_fastr_markdown.ts";
import { FASTR_ALIGN_SUFFIX_RE } from "./fastr_paragraph_align.ts";

export type ReportSectionRange = {
  // [from, to) offsets of the whole section in the body.
  from: number;
  to: number;
  // 1-based, inclusive.
  fromLine: number;
  toLine: number;
};

export type ReportHeading = {
  level: number;
  // Whitespace-trimmed heading text.
  text: string;
  // 1-based line of the heading.
  line: number;
  from: number;
  to: number;
  section: ReportSectionRange;
};

// ── Heading scan ─────────────────────────────────────────────────────────────

// A top-level heading as the renderer reads it: 0-based first line and one
// past its last (a setext heading's underline is its own line), and the line
// its section starts on: its own, or the `:::page` of the template it heads.
type TopHeading = {
  level: number;
  text: string;
  from: number;
  to: number;
  start: number;
};

// Every section heading (fastrSectionHeadings: outside every block, list and
// quote, or heading a page template), off the renderer's own
// tokens (parseFastrMarkdownBlocks), so the index agrees with the drawn document: a
// setext or indented heading counts, `## Title ##` is "Title", and a `## `
// line inside raw html or a code fence is not a heading. A lone CR becomes a
// space first: markdown-it reads one as a line break, split("\n") does not.
function topLevelHeadings(body: string): TopHeading[] {
  const out: TopHeading[] = [];
  const tokens = parseFastrMarkdownBlocks(body.replace(/\r(?!\n)/g, " "));
  for (const { index: i, pageLine } of fastrSectionHeadings(tokens)) {
    const t = tokens[i];
    if (t.map === null) continue;
    const inline = tokens[i + 1];
    out.push({
      level: Number(t.tag.slice(1)),
      // A heading's own `{align=…}` is not part of its text.
      text: (inline?.type === "inline" ? inline.content : "")
        .replace(FASTR_ALIGN_SUFFIX_RE, "")
        .split("\n").map((l) => l.trim()).join(" ").trim(),
      from: t.map[0],
      to: t.map[1],
      start: pageLine ?? t.map[0],
    });
  }
  return out;
}

// Lines that are neither inside a fenced code block nor inside a `:::`
// container. A heading nested in a tiles grid is decoration, not a document
// section: indexing it would let rewrite_section splice a section that starts
// mid-container and ends outside it, tearing the block apart.
export function fastrTopLevelLineMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let depth = 0;
  // One entry per line, so the scanner must yield every line, including the
  // code-fence lines themselves, which are never eligible.
  for (const { inCode, fence } of scanContainerLines(lines)) {
    if (inCode) {
      mask.push(false);
      continue;
    }
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

// Every top-level heading of the body, in document order. A section runs to
// the next heading of the same or a higher level.
export function findReportHeadings(body: string): ReportHeading[] {
  const lines = body.split("\n");
  const starts: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    starts.push(starts[i] + lines[i].length + 1);
  }
  const heads = topLevelHeadings(body);
  return heads.map((h, k) => {
    const next = heads.slice(k + 1).find((n) => n.level <= h.level);
    const end = next === undefined ? lines.length : next.start;
    let last = end - 1;
    while (last >= h.to && lines[last].trim() === "") last--;
    return {
      level: h.level,
      text: h.text,
      line: h.from + 1,
      from: starts[h.from],
      to: starts[h.to - 1] + lines[h.to - 1].length,
      section: {
        from: starts[h.start],
        to: end < lines.length ? starts[end] : body.length,
        fromLine: h.start + 1,
        toLine: last + 1,
      },
    };
  });
}

function headingMatches(text: string, wanted: string): boolean {
  return text.trim().toLowerCase() === wanted.trim().toLowerCase();
}

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
  headingText: string,
  occurrenceIndex: number | undefined,
): { from: number; to: number; heading: ReportHeading } | { error: string } {
  const picked = pickHeading(
    findReportHeadings(body),
    headingText,
    occurrenceIndex,
  );
  if ("error" in picked) return picked;
  const h = picked.heading;
  return { from: h.section.from, to: h.section.to, heading: h };
}

// Replace the section under `headingText` with `replacement`. The section's
// content goes; the blank lines that separate it from the next heading, and
// the body's final newline, are not the section's to lose. A CRLF body keeps
// its line endings.
export function spliceReportSection(
  body: string,
  headingText: string,
  replacement: string,
  occurrenceIndex: number | undefined,
): { newBody: string } | { error: string } {
  const picked = pickHeading(
    findReportHeadings(body),
    headingText,
    occurrenceIndex,
  );
  if ("error" in picked) return picked;
  const { section } = picked.heading;
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = body.split("\n");
  const replLines = replacement.replace(/(\r?\n)+$/, "").split(/\r?\n/)
    .map((l) => eol === "\r\n" ? `${l}\r` : l);
  // A CRLF body's last line has no \r of its own; nor may the replacement's
  // when it lands there.
  const after = lines.slice(section.toLine);
  if (after.length === 0 && eol === "\r\n") {
    replLines[replLines.length - 1] = replLines[replLines.length - 1]
      .slice(0, -1);
  }
  return {
    newBody: [
      ...lines.slice(0, section.fromLine - 1),
      ...replLines,
      ...after,
    ].join("\n"),
  };
}

// Insert a token line after a heading (or append when no heading is given).
export function insertAfterReportHeading(
  body: string,
  headingText: string | undefined,
  tokenLine: string,
): { newBody: string } | { error: string } {
  if (!headingText) {
    return { newBody: `${body.replace(/\n+$/, "")}\n\n${tokenLine}\n` };
  }
  const heading = findReportHeadings(body).find((h) =>
    headingMatches(h.text, headingText)
  );
  if (heading !== undefined) {
    const lines = body.split("\n");
    // After the heading's last line: a setext heading's underline.
    const at = body.slice(0, heading.to).split("\n").length;
    return {
      newBody: [
        ...lines.slice(0, at),
        "",
        tokenLine,
        "",
        ...lines.slice(at),
      ].join("\n"),
    };
  }
  return {
    error:
      `No section with heading "${headingText}" found. Call get_report_editor to see exact headings, or omit afterHeading to append at the end.`,
  };
}
