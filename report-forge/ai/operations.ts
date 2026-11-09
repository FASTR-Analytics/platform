// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The text operations a model performs on an open document, as pure
// functions: the current body and the model's arguments in, the new body (or
// the message the model should read) out. No DOM and no model client, so
// they run in Deno and under any tool-calling framework. A host with its own
// tool layer calls these; ./tools.ts wraps them as ready-made tools.

import { collapseFastrBlankRuns } from "../engine/fastr_markdown_blocks.ts";
import { formatLineRanges, type SkippedRange } from "../engine/line_ranges.ts";
import {
  findReportHeadings,
  spliceReportSection,
} from "../engine/report_sections.ts";
import {
  checkFastrAuthorStyle,
  checkFastrContainers,
  checkFastrNewLiteralBackgrounds,
  checkFastrRewriteUsesBlocks,
  checkFastrStatPlacement,
  checkReportBodyLength,
  checkReportTokensResolve,
  type ReportEmbedIds,
} from "./validators.ts";

// ── Reading ──────────────────────────────────────────────────────────────────

// The text selection, or the caret when `empty` (lines are 1-based). The
// mounted editor's getSelection returns this shape.
export type ReportTextSelection = {
  empty: boolean;
  fromLine: number;
  toLine: number;
  text: string;
};

// One top-level heading and the section under it: exactly the range a
// section rewrite replaces. Lines are 1-based and inclusive.
export type ReportHeadingEntry = {
  level: number;
  text: string;
  line: number;
  sectionFromLine: number;
  sectionToLine: number;
};

export type ReportReadOptions = {
  selection?: ReportTextSelection;
  // The ids the body may embed, listed for the model.
  embeds?: ReportEmbedIds;
  // The document's name, shown on the title line.
  title?: string;
  // The host's own facts about the document, under the format line.
  headerLines?: readonly string[];
  // The figures section whole, for a host that has more to say about a
  // figure than its id. Replaces the list of figure ids.
  figureLines?: readonly string[];
};

export type ReportTextRead = {
  body: string;
  headings: ReportHeadingEntry[];
  // The user's selection, when text is selected.
  selection: ReportTextSelection | undefined;
  // All of the above as the text a model reads.
  text: string;
};

function headingsIndexLines(headings: ReportHeadingEntry[]): string[] {
  if (headings.length === 0) return [`## Headings: none`];
  return [
    `## Headings (section = what rewrite_section replaces; lines are 1-based)`,
    ...headings.map((h) => {
      const range = h.sectionFromLine === h.sectionToLine
        ? `line ${h.sectionFromLine}`
        : `lines ${h.sectionFromLine}-${h.sectionToLine}`;
      return `- line ${h.line}: ${
        "#".repeat(h.level)
      } ${h.text} → section ${range}`;
    }),
  ];
}

function idList(kind: "figure" | "image", ids: readonly string[]): string {
  return ids.length ? ids.map((id) => `${kind}:${id}`).join(", ") : "none";
}

// The document as a model needs it before editing: the body, where each
// section starts and ends, what it may embed, and what the user has selected.
export function readReportText(
  body: string,
  options: ReportReadOptions = {},
): ReportTextRead {
  const headings = findReportHeadings(body).map((h) => ({
    level: h.level,
    text: h.text,
    line: h.line,
    sectionFromLine: h.section.fromLine,
    sectionToLine: h.section.toLine,
  }));
  const sel = options.selection;
  const selection = sel && !sel.empty ? sel : undefined;
  const embeds = options.embeds ?? { figures: [], images: [] };
  const text = [
    options.title === undefined
      ? `# REPORT EDITOR`
      : `# REPORT EDITOR: ${options.title}`,
    `Format: FASTR Markdown — the theme supplies the design; never write CSS or a <style> block`,
    ...(options.headerLines ?? []),
    ``,
    `## Current body (FASTR Markdown)`,
    body,
    ``,
    ...headingsIndexLines(headings),
    ``,
    ...(options.figureLines ??
      [`## Figures: ${idList("figure", embeds.figures)}`]),
    `## Images: ${idList("image", embeds.images)}`,
    ...(selection
      ? [
        ``,
        `## User's current selection (lines ${selection.fromLine}-${selection.toLine})`,
        selection.text,
      ]
      : [
        `## User's current selection: none (cursor at line ${
          sel?.fromLine ?? 1
        })`,
      ]),
  ].join("\n");
  return { body, headings, selection, text };
}

// ── Editing ──────────────────────────────────────────────────────────────────

// What an edit operation returns. `error` is written for the model. An edit
// that changes nothing is refused with `unchanged` set, so a host can tell
// "nothing to review" from a body that broke a rule.
export type ReportTextEdit =
  | { ok: true; newBody: string; summary: string }
  | { ok: false; error: string; unchanged?: true };

export const REPORT_EDIT_UNCHANGED_MESSAGE =
  "The proposed body is IDENTICAL to the current body — nothing to review, so no accept/reject dialog was shown. Re-read with get_report_editor and propose an actual change.";

// The checks every proposed body passes, in the order a model should hear
// about them, then the no-change test. `wholeBody` adds the check that only
// makes sense for a full rewrite.
function stage(
  currentBody: string,
  newBody: string,
  summary: string,
  embeds: ReportEmbedIds,
  rules: {
    allowLiteralColors: boolean | undefined;
    wholeBody?: { plain: boolean | undefined };
  },
): ReportTextEdit {
  const error = checkReportBodyLength(newBody) ??
    checkFastrContainers(newBody) ??
    checkFastrStatPlacement(newBody) ??
    (rules.wholeBody
      ? checkFastrRewriteUsesBlocks(newBody, rules.wholeBody.plain)
      : undefined) ??
    checkFastrNewLiteralBackgrounds(
      newBody,
      currentBody,
      rules.allowLiteralColors,
    ) ??
    checkFastrAuthorStyle(newBody, currentBody) ??
    checkReportTokensResolve(newBody, embeds, currentBody);
  if (error !== undefined) return { ok: false, error };
  if (newBody === currentBody) {
    return { ok: false, error: REPORT_EDIT_UNCHANGED_MESSAGE, unchanged: true };
  }
  return { ok: true, newBody, summary };
}

export type RewriteReportBodyArgs = {
  body: string;
  allowLiteralColors?: boolean;
  plain?: boolean;
};

// Replace the whole body.
export function rewriteReportBody(
  currentBody: string,
  args: RewriteReportBodyArgs,
  embeds: ReportEmbedIds,
): ReportTextEdit {
  // A run of blank lines is vertical space on the page; a model means
  // nothing by it (collapseFastrBlankRuns).
  const newBody = collapseFastrBlankRuns(args.body);
  return stage(currentBody, newBody, "Rewrite entire report", embeds, {
    allowLiteralColors: args.allowLiteralColors,
    wholeBody: { plain: args.plain },
  });
}

export type RewriteReportSectionArgs = {
  sectionHeading: string;
  newBody: string;
  // 1-based, for a heading that occurs more than once.
  occurrenceIndex?: number;
  allowLiteralColors?: boolean;
};

// Replace one section: the heading line and everything down to the next
// heading of the same or a higher level.
export function rewriteReportSection(
  currentBody: string,
  args: RewriteReportSectionArgs,
  embeds: ReportEmbedIds,
): ReportTextEdit {
  const spliced = spliceReportSection(
    currentBody,
    args.sectionHeading,
    collapseFastrBlankRuns(args.newBody),
    args.occurrenceIndex,
  );
  if ("error" in spliced) return { ok: false, error: spliced.error };
  return stage(
    currentBody,
    spliced.newBody,
    `Rewrite section "${args.sectionHeading}"`,
    embeds,
    { allowLiteralColors: args.allowLiteralColors },
  );
}

export type ReplaceReportTextArgs = {
  oldText: string;
  newText: string;
  // 1-based, for text that occurs more than once.
  occurrenceIndex?: number;
  allowLiteralColors?: boolean;
};

// Where a replacement goes: the one verbatim occurrence of oldText, or the
// occurrenceIndex-th (1-based) when it occurs more than once.
type Occurrence =
  | { pos: number }
  | { missing: true }
  | { empty: true }
  | { ambiguous: number }
  | { outOfRange: number };

function findOccurrence(
  body: string,
  oldText: string,
  occurrenceIndex: number | undefined,
): Occurrence {
  if (oldText === "") return { empty: true };
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const idx = body.indexOf(oldText, from);
    if (idx < 0) break;
    positions.push(idx);
    from = idx + oldText.length;
  }
  if (positions.length === 0) return { missing: true };
  if (positions.length === 1) return { pos: positions[0] };
  if (occurrenceIndex === undefined) return { ambiguous: positions.length };
  const chosen = positions[occurrenceIndex - 1];
  return chosen === undefined
    ? { outOfRange: positions.length }
    : { pos: chosen };
}

// Replace one verbatim occurrence of oldText with newText.
export function replaceReportText(
  currentBody: string,
  args: ReplaceReportTextArgs,
  embeds: ReportEmbedIds,
): ReportTextEdit {
  const { oldText, occurrenceIndex } = args;
  const at = findOccurrence(currentBody, oldText, occurrenceIndex);
  if ("empty" in at) {
    return { ok: false, error: "oldText must not be empty." };
  }
  if ("missing" in at) {
    return {
      ok: false,
      error:
        "oldText was not found verbatim. Call get_report_editor to see the exact current text (whitespace and markup must match).",
    };
  }
  if ("ambiguous" in at) {
    return {
      ok: false,
      error:
        `oldText occurs ${at.ambiguous} times. Provide occurrenceIndex (1-${at.ambiguous}), or include more surrounding text to make it unique.`,
    };
  }
  if ("outOfRange" in at) {
    return {
      ok: false,
      error:
        `occurrenceIndex ${occurrenceIndex} out of range (1-${at.outOfRange}).`,
    };
  }
  const newBody = currentBody.slice(0, at.pos) + args.newText +
    currentBody.slice(at.pos + oldText.length);
  return stage(currentBody, newBody, "Replace text", embeds, {
    allowLiteralColors: args.allowLiteralColors,
  });
}

export type ReportDraftEdit = {
  oldText: string;
  newText: string;
  // 1-based, for text that occurs more than once.
  occurrenceIndex?: number;
};

// A held draft, fixed in place: each edit replaces one verbatim occurrence in
// the draft as the edits before it left it, all or none. A host that holds a
// whole-report draft it could not propose (its pages had problems) has the
// model fix it this way rather than write the whole body again. Only the
// text is changed here: the edited draft goes through rewriteReportBody's
// checks like any whole body.
export function applyReportDraftEdits(
  draft: string,
  edits: readonly ReportDraftEdit[],
): { ok: true; body: string } | { ok: false; error: string } {
  let body = draft;
  for (const [i, e] of edits.entries()) {
    const n = `Edit ${i + 1}`;
    const at = findOccurrence(body, e.oldText, e.occurrenceIndex);
    const error = "empty" in at
      ? `${n}: oldText must not be empty.`
      : "missing" in at
      ? `${n}: oldText was not found verbatim in the held draft, as the edits before it left it (whitespace and markup must match).`
      : "ambiguous" in at
      ? `${n}: oldText occurs ${at.ambiguous} times in the draft. Give occurrenceIndex (1-${at.ambiguous}), or include more surrounding text.`
      : "outOfRange" in at
      ? `${n}: occurrenceIndex ${e.occurrenceIndex} out of range (1-${at.outOfRange}).`
      : undefined;
    if (error !== undefined || !("pos" in at)) {
      return { ok: false, error: `${error} No edit was applied.` };
    }
    body = body.slice(0, at.pos) + e.newText +
      body.slice(at.pos + e.oldText.length);
  }
  return { ok: true, body };
}

// ── After an accept ──────────────────────────────────────────────────────────

// Appended to what the model reads after an ACCEPTED edit, when the
// accept-time rebase skipped changes that collided with a collaborator's
// concurrent edits: the model must know its edit only partly applied, and
// where.
export function reportSkippedNote(
  skipped: readonly SkippedRange[] | undefined,
): string {
  if (!skipped || skipped.length === 0) return "";
  return ` NOTE: the proposed change(s) at line(s) ${
    formatLineRanges(skipped)
  } were NOT applied — a collaborator edited that text while the proposal was open. Re-read the report (get_report_editor) before retrying those parts.`;
}
