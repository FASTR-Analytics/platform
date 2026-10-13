// =============================================================================
// Report sections & headings: the structural layer behind the AI report tools
// (rewrite_section, insert_figure.afterHeading, the headings index). A section
// is a `#` heading line and everything down to the next heading of the same or
// a higher level, counted only on lines outside code fences and `:::`
// containers (fastrTopLevelLineMask).
// =============================================================================

import {
  isFastrLeafBlock,
  scanContainerLines,
} from "./fastr_markdown_blocks.ts";

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

const MD_HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const MD_HEADING_LEVEL_RE = /^(#{1,6})\s+/;

function markdownSectionEndLine(
  lines: string[],
  headingLine: number,
  level: number,
  eligible: boolean[],
): number {
  for (let i = headingLine + 1; i < lines.length; i++) {
    if (!eligible[i]) continue;
    const m = MD_HEADING_LEVEL_RE.exec(lines[i]);
    if (m && m[1].length <= level) return i;
  }
  return lines.length;
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

// Every top-level heading of the body, in document order.
export function findReportHeadings(body: string): ReportHeading[] {
  const lines = body.split("\n");
  const eligible = fastrTopLevelLineMask(lines);
  const starts: number[] = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    starts.push(starts[i] + lines[i].length + 1);
  }
  const out: ReportHeading[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!eligible[i]) continue;
    const m = MD_HEADING_RE.exec(lines[i]);
    if (!m) continue;
    const level = m[1].length;
    const end = markdownSectionEndLine(lines, i, level, eligible);
    let last = end - 1;
    while (last > i && lines[last].trim() === "") last--;
    out.push({
      level,
      text: m[2].trim(),
      line: i + 1,
      from: starts[i],
      to: starts[i] + lines[i].length,
      section: {
        from: starts[i],
        to: end < lines.length ? starts[end] : body.length,
        fromLine: i + 1,
        toLine: last + 1,
      },
    });
  }
  return out;
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

// Replace the section under `headingText` with `replacement`.
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
  const h = picked.heading;
  const lines = body.split("\n");
  const start = h.line - 1;
  const end = markdownSectionEndLine(
    lines,
    start,
    h.level,
    fastrTopLevelLineMask(lines),
  );
  const replLines = replacement.replace(/\n+$/, "").split("\n");
  return {
    newBody: [
      ...lines.slice(0, start),
      ...replLines,
      ...lines.slice(end),
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
  const lines = body.split("\n");
  const eligible = fastrTopLevelLineMask(lines);
  for (let i = 0; i < lines.length; i++) {
    if (!eligible[i]) continue;
    const m = MD_HEADING_RE.exec(lines[i]);
    if (m && headingMatches(m[2], headingText)) {
      return {
        newBody: [
          ...lines.slice(0, i + 1),
          "",
          tokenLine,
          "",
          ...lines.slice(i + 1),
        ].join("\n"),
      };
    }
  }
  return {
    error:
      `No section with heading "${headingText}" found. Call get_report_editor to see exact headings, or omit afterHeading to append at the end.`,
  };
}
