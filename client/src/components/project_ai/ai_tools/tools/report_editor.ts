import { createAITool } from "panther";
import { z } from "zod";
import type { AIContext } from "~/components/project_ai/types";
import { resolveFigureFromVisualization } from "~/components/slide_deck/slide_ai/resolve_figure_from_visualization";
import {
  validateReportBodyLength,
  validateReportTokensResolve,
} from "../validators/report_validators";

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
        return [
          `# REPORT EDITOR: ${ctx.reportLabel}`,
          ``,
          `## Current body (markdown)`,
          ctx.getBody(),
          ``,
          `## Figures: ${figIds.length ? figIds.map((id) => `figure:${id}`).join(", ") : "none"}`,
          `## Images: ${imgIds.length ? imgIds.map((id) => `image:${id}`).join(", ") : "none"}`,
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
        ctx.proposeEdit({
          newBody: input.markdown,
          summary: "Rewrite entire report",
        });
        return "Staged a full report rewrite. The user will review the diff and accept or reject.";
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
        ctx.proposeEdit({
          newBody: result.newBody,
          summary: `Rewrite section "${input.sectionHeading}"`,
        });
        return "Staged a section rewrite. The user will review the diff and accept or reject.";
      },
      inProgressLabel: "Proposing section rewrite...",
      completionMessage: "Proposed section rewrite (awaiting accept/reject)",
    }),

    createAITool({
      name: "insert_figure",
      description:
        "Propose inserting a live data figure from a saved visualization. Provide a visualizationId (from get_available_visualizations). Optionally place it after a heading (afterHeading) and give a caption. The user reviews a diff; on accept the figure is added to the report and its token inserted.",
      inputSchema: z.object({
        visualizationId: z.string(),
        caption: z.string().optional(),
        afterHeading: z.string().optional(),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_report") {
          throw new Error("This tool is only available when editing a report");
        }
        const figureBlock = await resolveFigureFromVisualization(projectId, {
          type: "from_visualization",
          visualizationId: input.visualizationId,
        });
        const id = crypto.randomUUID();
        // Strip chars that would break the single-line ![caption](src) token.
        const caption = (input.caption ?? "")
          .replace(/[[\]\n\r]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const token = `![${caption}](figure:${id})`;
        const newBody = insertFigureToken(
          ctx.getBody(),
          token,
          input.afterHeading,
        );
        ctx.proposeEdit({
          newBody,
          addFigures: { [id]: figureBlock },
          summary: caption ? `Insert figure: ${caption}` : "Insert figure",
        });
        return `Staged inserting a figure (id ${id}). The user will review the diff and accept or reject.`;
      },
      inProgressLabel: "Preparing figure...",
      completionMessage: "Proposed figure insert (awaiting accept/reject)",
    }),
  ];
}
