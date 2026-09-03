import { AIToolFailure, createAITool } from "@timroberton/panther";
import { z } from "zod";
import {
  FASTR_REPORT_THEMES,
  getReportFormat,
  type ReportSummary,
} from "../types/mod.ts";
import {
  listFastrContainerDefects,
  listFastrLiteralBackgrounds,
} from "../fastr_markdown_blocks.ts";
import { FASTR_MD_SYNTAX_DOC } from "../fastr_markdown_spec.ts";
import type { AIToolEnv } from "./env.ts";

function formatReportsListForAI(reports: ReportSummary[]): string {
  if (reports.length === 0) return "No reports exist yet.";
  return reports
    .map((r) => `- ${r.label} (id: ${r.id}, format: ${getReportFormat(r.config)})`)
    .join("\n");
}

export function getSharedToolsForReports(
  env: AIToolEnv,
  projectId: string,
  reports: ReportSummary[],
) {
  return [
    createAITool({
      name: "get_available_reports",
      description:
        "Get a list of all reports with their IDs, labels and body format (markdown, fastr or html).",
      inputSchema: z.object({}),
      handler: async () => formatReportsListForAI(reports),
      inProgressLabel: "Getting available reports...",
      completionMessage: "Retrieved reports list",
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "get_report",
      description:
        "Get the full body (markdown, fastr or html — the header states which) and the embedded figure/image ids of a report. Call this before discussing or editing an existing report.",
      inputSchema: z.object({ reportId: z.string() }),
      handler: async (input) => {
        const res = await env.serverActions.getReportDetail({
          projectId,
          report_id: input.reportId,
        });
        if (!res.success) throw new AIToolFailure(res.err);
        const figureIds = Object.keys(res.data.figures);
        const imageIds = Object.keys(res.data.images);
        const format = getReportFormat(res.data.config);
        return [
          `# Report: ${res.data.label} (id: ${res.data.id}, format: ${format})`,
          ``,
          `## Body (${format})`,
          res.data.body,
          ``,
          `## Figures: ${
            figureIds.length
              ? figureIds.map((id) => `figure:${id}`).join(", ")
              : "none"
          }`,
          `## Images: ${
            imageIds.length
              ? imageIds.map((id) => `image:${id}`).join(", ")
              : "none"
          }`,
        ].join("\n");
      },
      inProgressLabel: "Reading report...",
      completionMessage: "Read report",
      kind: "read",
      headless: true,
    }),

    createAITool({
      name: "create_report",
      // The syntax doc rides the description so the model has the blocks in
      // context wherever the tool is callable (chat in any view, MCP host) —
      // without it the model writes plain markdown, which is valid FASTR
      // Markdown but wastes the format.
      description:
        `Create a new report written in FASTR Markdown (the platform's designed document format; the format is fixed at creation). The user opens the report in the editor to review and edit it — never show a report preview in the chat. The new report has no figures or images yet, so do NOT write embed tokens like ![...](figure:...) — the user inserts live figures later in the report editor.

${FASTR_MD_SYNTAX_DOC}`,
      inputSchema: z.object({
        label: z.string(),
        markdown: z.string().describe("The report body, in FASTR Markdown."),
        theme: z.enum(FASTR_REPORT_THEMES).optional().describe(
          "Starting visual theme. Omit for the default; set one only when the user asks for a particular look. The user can switch themes at any time in the editor.",
        ),
        allowLiteralColors: z.boolean().optional().describe(
          "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, literal bg= values are rejected — use tones, which follow the theme.",
        ),
      }),
      approval: {
        propose: (input) => {
          const defects = listFastrContainerDefects(input.markdown);
          if (defects.length > 0) {
            const shown = defects
              .slice(0, 5)
              .map((d) => `line ${d.line}: ${d.message}`)
              .join("\n");
            return {
              invalid: `The proposed body has ${defects.length} block problem${
                defects.length === 1 ? "" : "s"
              }:\n${shown}\nEvery \`:::\` block except \`stat\` and \`report\` must be closed by a bare \`:::\` line, and block names must be ones the format defines. Fix and re-propose.`,
            };
          }
          if (
            /\]\((figure|image):/.test(input.markdown) ||
            listFastrLiteralBackgrounds(input.markdown).some((l) =>
              l.value.startsWith("image:")
            )
          ) {
            return {
              invalid:
                "The report is new, so no figure or image ids exist yet — remove the figure/image embed tokens and any bg=image: backgrounds. The user inserts live figures later in the report editor.",
            };
          }
          const literals = listFastrLiteralBackgrounds(input.markdown);
          if (literals.length > 0 && !input.allowLiteralColors) {
            const shown = literals
              .slice(0, 5)
              .map((l) => `line ${l.line}: bg=${l.value}`)
              .join("\n");
            return {
              invalid:
                `The body uses ${literals.length} literal background colour${
                  literals.length === 1 ? "" : "s"
                }:\n${shown}\nLiterals do not follow a theme switch — replace them with tones (tone=muted|accent|solid|dark|inverse|gradient|danger|warning|success|info), which each theme maps to its own palette. Only if the user explicitly asked for these exact colours, re-propose unchanged with allowLiteralColors: true.`,
            };
          }
          return {
            preview: {
              title: `Create report "${input.label}"`,
              changes: [
                { label: "Label", after: input.label },
                {
                  label: "Body",
                  after: `${
                    input.markdown.split(/\s+/).filter(Boolean).length
                  } words of FASTR Markdown`,
                },
                ...(input.theme ? [{ label: "Theme", after: input.theme }] : []),
              ],
              // The body that would actually commit — consent must be to the
              // content, not to a word count.
              diff: { before: "", after: input.markdown },
            },
            commit: async () => {
              const createRes = await env.serverActions.createReport({
                projectId,
                label: input.label,
                folderId: null,
                format: "fastr",
                fastrTheme: input.theme,
              });
              if (!createRes.success) throw new AIToolFailure(createRes.err);
              const bodyRes = await env.serverActions.updateReportBody({
                projectId,
                report_id: createRes.data.reportId,
                body: input.markdown,
                expectedLastUpdated: createRes.data.lastUpdated,
                overwrite: true,
              });
              if (!bodyRes.success) {
                throw new AIToolFailure(
                  `Report created (id: ${createRes.data.reportId}) but failed to set body: ${bodyRes.err}`,
                );
              }
              return `Created report "${input.label}" (id: ${createRes.data.reportId}).`;
            },
          };
        },
      },
      inProgressLabel: "Creating report...",
      completionMessage: "Created report",
      kind: "write",
      headless: true,
    }),
  ];
}
