import { createAITool } from "panther";
import { z } from "zod";
import { AiFigureBlockInputSchema, type MetricWithStatus } from "lib";
import type { AIContext } from "~/components/project_ai/types";
import { resolveFigureFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";
import { resolveFigureFromMetric } from "~/components/slide_deck/slide_ai/resolve_figure_from_metric";
import {
  validateReportBodyLength,
  validateReportTokensResolve,
} from "../validators/report_validators";

// Strip chars that would break the single-line ![caption](src) token.
function sanitizeCaption(s: string): string {
  return s.replace(/[[\]\n\r]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Replace a heading-bounded section (heading line → next heading of same-or-
// higher level, or EOF) with newMarkdown. Addresses by heading text; ambiguous
// headings require occurrenceIndex (PLAN_REPORTS.md §10.4).
function spliceSection(
  body: string,
  headingText: string,
  newMarkdown: string,
  occurrenceIndex: number | undefined,
): { newBody: string } | { error: string } {
  const lines = body.split("\n");
  const matches: { line: number; level: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (m && m[2].trim().toLowerCase() === headingText.trim().toLowerCase()) {
      matches.push({ line: i, level: m[1].length });
    }
  }
  if (matches.length === 0) {
    return {
      error:
        `No section with heading "${headingText}" found. Call get_report_editor to see exact headings.`,
    };
  }
  let chosen: { line: number; level: number };
  if (matches.length === 1) {
    chosen = matches[0];
  } else {
    if (occurrenceIndex === undefined) {
      return {
        error:
          `Multiple sections titled "${headingText}" (${matches.length}). Provide occurrenceIndex (1-${matches.length}).`,
      };
    }
    const c = matches[occurrenceIndex - 1];
    if (!c) {
      return {
        error: `occurrenceIndex ${occurrenceIndex} out of range (1-${matches.length}).`,
      };
    }
    chosen = c;
  }
  let end = lines.length;
  for (let i = chosen.line + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= chosen.level) {
      end = i;
      break;
    }
  }
  const replacement = newMarkdown.replace(/\n+$/, "").split("\n");
  const newLines = [
    ...lines.slice(0, chosen.line),
    ...replacement,
    ...lines.slice(end),
  ];
  return { newBody: newLines.join("\n") };
}

// Replace one verbatim occurrence of oldText with newText. Ambiguous matches
// require occurrenceIndex (1-based), same convention as spliceSection.
function replaceTextOccurrence(
  body: string,
  oldText: string,
  newText: string,
  occurrenceIndex: number | undefined,
): { newBody: string } | { error: string } {
  if (oldText === "") {
    return { error: "oldText must not be empty." };
  }
  const positions: number[] = [];
  let from = 0;
  for (;;) {
    const idx = body.indexOf(oldText, from);
    if (idx < 0) break;
    positions.push(idx);
    from = idx + oldText.length;
  }
  if (positions.length === 0) {
    return {
      error:
        "oldText was not found verbatim. Call get_report_editor to see the exact current text (whitespace and markdown must match).",
    };
  }
  let pos: number;
  if (positions.length === 1) {
    pos = positions[0];
  } else {
    if (occurrenceIndex === undefined) {
      return {
        error:
          `oldText occurs ${positions.length} times. Provide occurrenceIndex (1-${positions.length}), or include more surrounding text to make it unique.`,
      };
    }
    const p = positions[occurrenceIndex - 1];
    if (p === undefined) {
      return {
        error: `occurrenceIndex ${occurrenceIndex} out of range (1-${positions.length}).`,
      };
    }
    pos = p;
  }
  const newBody = body.slice(0, pos) + newText + body.slice(pos + oldText.length);
  return { newBody };
}

function insertFigureToken(
  body: string,
  token: string,
  afterHeading: string | undefined,
): string {
  if (afterHeading) {
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
      if (m && m[2].trim().toLowerCase() === afterHeading.trim().toLowerCase()) {
        const newLines = [
          ...lines.slice(0, i + 1),
          "",
          token,
          "",
          ...lines.slice(i + 1),
        ];
        return newLines.join("\n");
      }
    }
    // Heading not found — fall through to append at end.
  }
  const trimmed = body.replace(/\n+$/, "");
  return `${trimmed}\n\n${token}\n`;
}

export function getToolsForReportEditor(
  projectId: string,
  getAIContext: () => AIContext,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      name: "get_report_editor",
      description:
        "Get the current markdown body and embedded figure/image ids of the report being edited (live editor state, including unsaved changes). ALWAYS call this first before proposing edits.",
      inputSchema: z.object({}),
      handler: async () => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const figIds = Object.keys(ctx.getFigures());
        const imgIds = Object.keys(ctx.getImages());
        const sel = ctx.getSelection();
        const selectionSection = sel && !sel.empty
          ? [
            ``,
            `## User's current selection (lines ${sel.fromLine}-${sel.toLine})`,
            sel.text,
          ]
          : [`## User's current selection: none (cursor at line ${sel?.fromLine ?? 1})`];
        return [
          `# REPORT EDITOR: ${ctx.reportLabel}`,
          ``,
          `## Current body (markdown)`,
          ctx.getBody(),
          ``,
          `## Figures: ${figIds.length ? figIds.map((id) => `figure:${id}`).join(", ") : "none"}`,
          `## Images: ${imgIds.length ? imgIds.map((id) => `image:${id}`).join(", ") : "none"}`,
          ...selectionSection,
        ].join("\n");
      },
      inProgressLabel: "Reading report editor...",
      completionMessage: "Read report editor",
    }),

    createAITool({
      name: "rewrite_report",
      description:
        "Propose a full rewrite of the report body. The user reviews a diff and accepts or rejects — nothing is applied silently. Keep all existing figure/image tokens you want to retain; you may only reference figure/image ids that already exist. No raw HTML.",
      inputSchema: z.object({ markdown: z.string() }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        validateReportBodyLength(input.markdown);
        validateReportTokensResolve(
          input.markdown,
          ctx.getFigures(),
          ctx.getImages(),
        );
        const { accepted } = await ctx.proposeEdit({
          newBody: input.markdown,
          summary: "Rewrite entire report",
        });
        if (!accepted) {
          throw new Error(
            "The user REJECTED the rewrite; the report is unchanged. Do not retry unless asked.",
          );
        }
        return "The user ACCEPTED the rewrite; it is now applied to the report.";
      },
      inProgressLabel: "Proposing rewrite...",
      completionMessage: "Proposed rewrite (awaiting accept/reject)",
    }),

    createAITool({
      name: "rewrite_section",
      description:
        "Propose rewriting one heading-bounded section (from its heading to the next heading of the same or higher level). Address by exact heading text; if the heading is not unique, pass occurrenceIndex (1-based). newMarkdown must include the section heading. The user reviews a diff.",
      inputSchema: z.object({
        sectionHeading: z.string(),
        newMarkdown: z.string(),
        occurrenceIndex: z.number().int().positive().optional(),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const result = spliceSection(
          ctx.getBody(),
          input.sectionHeading,
          input.newMarkdown,
          input.occurrenceIndex,
        );
        if ("error" in result) {
          throw new Error(result.error);
        }
        validateReportBodyLength(result.newBody);
        validateReportTokensResolve(
          result.newBody,
          ctx.getFigures(),
          ctx.getImages(),
        );
        const { accepted } = await ctx.proposeEdit({
          newBody: result.newBody,
          summary: `Rewrite section "${input.sectionHeading}"`,
        });
        if (!accepted) {
          throw new Error(
            `The user REJECTED the rewrite of section "${input.sectionHeading}"; the report is unchanged. Do not retry unless asked.`,
          );
        }
        return `The user ACCEPTED the rewrite of section "${input.sectionHeading}"; it is now applied.`;
      },
      inProgressLabel: "Proposing section rewrite...",
      completionMessage: "Proposed section rewrite (awaiting accept/reject)",
    }),

    createAITool({
      name: "replace_text",
      description:
        "Propose a targeted edit: replace an exact run of text (oldText) with newText. oldText must match the current body VERBATIM (whitespace and markdown included) and occur exactly once — if it appears multiple times, pass occurrenceIndex (1-based) or include more surrounding text to make it unique. Use this for small/sentence-level edits, or to act on the user's current selection. Keep any figure/image tokens you intend to retain. The user reviews a diff and accepts or rejects — nothing is applied silently.",
      inputSchema: z.object({
        oldText: z.string(),
        newText: z.string(),
        occurrenceIndex: z.number().int().positive().optional(),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const result = replaceTextOccurrence(
          ctx.getBody(),
          input.oldText,
          input.newText,
          input.occurrenceIndex,
        );
        if ("error" in result) {
          throw new Error(result.error);
        }
        validateReportBodyLength(result.newBody);
        validateReportTokensResolve(
          result.newBody,
          ctx.getFigures(),
          ctx.getImages(),
        );
        const { accepted } = await ctx.proposeEdit({
          newBody: result.newBody,
          summary: "Replace text",
        });
        if (!accepted) {
          throw new Error(
            "The user REJECTED the edit; the report is unchanged. Do not retry unless asked.",
          );
        }
        return "The user ACCEPTED the edit; it is now applied to the report.";
      },
      inProgressLabel: "Proposing edit...",
      completionMessage: "Proposed edit (awaiting accept/reject)",
    }),

    createAITool({
      name: "insert_figure",
      description:
        "Propose inserting a live data figure. The `figure` is either a `from_visualization` block (clone a saved visualization by id — get ids from get_available_visualizations) or a `from_metric` block (build a NEW chart from a metric + preset — get metricIds/presets from get_available_metrics), exactly like slide figures. Optionally place it after a heading (afterHeading) and give a caption. The user reviews a diff; on accept the figure is added to the report and its token inserted.",
      inputSchema: z.object({
        figure: AiFigureBlockInputSchema,
        caption: z.string().optional(),
        afterHeading: z.string().optional(),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const figureBlock = input.figure.type === "from_visualization"
          ? await resolveFigureFromVisualization(projectId, input.figure)
          : await resolveFigureFromMetric(projectId, input.figure, metrics);
        const id = crypto.randomUUID();
        const caption = sanitizeCaption(input.caption ?? "");
        const token = `![${caption}](figure:${id})`;
        const newBody = insertFigureToken(
          ctx.getBody(),
          token,
          input.afterHeading,
        );
        const { accepted } = await ctx.proposeEdit({
          newBody,
          addFigures: { [id]: figureBlock },
          summary: caption ? `Insert figure: ${caption}` : "Insert figure",
        });
        if (!accepted) {
          throw new Error(
            `The user REJECTED the figure insert; the report is unchanged. Do not retry unless asked.`,
          );
        }
        return `The user ACCEPTED the figure insert (id ${id}); it is now in the report.`;
      },
      inProgressLabel: "Preparing figure...",
      completionMessage: "Proposed figure insert (awaiting accept/reject)",
    }),

    createAITool({
      name: "replace_figure",
      description:
        "Propose replacing the chart behind an existing report figure. figureId is one of the figure:<id> tokens (from get_report_editor). The replacement `figure` is the same slide-style union as insert_figure (from_visualization to clone a saved viz, or from_metric to build a new chart). The caption is kept unless you pass a new `caption`. The token is swapped in place, so the user reviews a diff and accepts or rejects.",
      inputSchema: z.object({
        figureId: z.string(),
        figure: AiFigureBlockInputSchema,
        caption: z.string().optional(),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        if (!ctx.getFigures()[input.figureId]) {
          throw new Error(
            `No figure with id "${input.figureId}" in this report. Call get_report_editor to see figure ids.`,
          );
        }
        const tokenRe = new RegExp(
          `(!\\[)([^\\]]*)(\\]\\(figure:)${escapeRegExp(input.figureId)}(\\))`,
          "g",
        );
        if (!tokenRe.test(ctx.getBody())) {
          throw new Error(
            `Figure "${input.figureId}" is registered but its token isn't in the body. Call get_report_editor.`,
          );
        }
        const figureBlock = input.figure.type === "from_visualization"
          ? await resolveFigureFromVisualization(projectId, input.figure)
          : await resolveFigureFromMetric(projectId, input.figure, metrics);
        const newId = crypto.randomUUID();
        const overrideCaption = input.caption !== undefined
          ? sanitizeCaption(input.caption)
          : undefined;
        // Swap every token for this figure id (preserving each caption unless
        // overridden) to a fresh id pointing at the new figure block.
        const newBody = ctx.getBody().replace(
          new RegExp(
            `(!\\[)([^\\]]*)(\\]\\(figure:)${escapeRegExp(input.figureId)}(\\))`,
            "g",
          ),
          (_m, p1, cap, p3, p4) =>
            `${p1}${overrideCaption ?? cap}${p3}${newId}${p4}`,
        );
        validateReportBodyLength(newBody);
        validateReportTokensResolve(
          newBody,
          { ...ctx.getFigures(), [newId]: figureBlock },
          ctx.getImages(),
        );
        const { accepted } = await ctx.proposeEdit({
          newBody,
          addFigures: { [newId]: figureBlock },
          summary: "Replace figure",
        });
        if (!accepted) {
          throw new Error(
            `The user REJECTED the figure replacement; the report is unchanged. Do not retry unless asked.`,
          );
        }
        return `The user ACCEPTED the figure replacement (new id ${newId}); it is now in the report.`;
      },
      inProgressLabel: "Preparing figure...",
      completionMessage: "Proposed figure replacement (awaiting accept/reject)",
    }),
  ];
}
