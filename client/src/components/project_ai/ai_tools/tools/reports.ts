import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import type { ReportSummary } from "lib";
import { serverActions } from "~/server_actions";

// Project content: the project's reports (SPA-only). create_report is the
// copilot's one non-editor write — approval-gated.
function formatReportsListForAI(reports: ReportSummary[]): string {
  if (reports.length === 0) return "No reports exist yet.";
  return reports.map((r) => `- ${r.label} (id: ${r.id})`).join("\n");
}

export function getClientToolsForReports(
  projectId: string,
  reports: ReportSummary[],
) {
  return [
    createAITool({
      name: "get_available_reports",
      description: "Get a list of all reports with their IDs and labels.",
      inputSchema: z.object({}),
      handler: async () => formatReportsListForAI(reports),
      inProgressLabel: "Getting available reports...",
      completionMessage: "Retrieved reports list",
      kind: "read",
    }),

    createAITool({
      name: "get_report",
      description:
        "Get the full markdown body and the embedded figure/image ids of a report. Call this before discussing or editing an existing report.",
      inputSchema: z.object({ reportId: z.string() }),
      handler: async (input) => {
        const res = await serverActions.getReportDetail({
          projectId,
          report_id: input.reportId,
        });
        if (!res.success) throw new AIToolFailure(res.err);
        const figureIds = Object.keys(res.data.figures);
        const imageIds = Object.keys(res.data.images);
        return [
          `# Report: ${res.data.label} (id: ${res.data.id})`,
          ``,
          `## Body (markdown)`,
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
    }),

    createAITool({
      name: "create_report",
      description:
        "Create a new report with a label and a markdown body. Use markdown headings, paragraphs, bold/italic, lists, blockquotes, and tables. Do NOT embed raw HTML or figure/image tokens (figures are added later in the report editor). The user opens the report in the editor to review and edit it — never show a report preview in the chat.",
      inputSchema: z.object({
        label: z.string(),
        markdown: z.string(),
      }),
      approval: {
        propose: (input) => ({
          preview: {
            title: `Create report "${input.label}"`,
            changes: [
              { label: "Label", after: input.label },
              {
                label: "Body",
                after: `${
                  input.markdown.split(/\s+/).filter(Boolean).length
                } words of markdown`,
              },
            ],
            // The body that would actually commit — consent must be to the
            // content, not to a word count.
            diff: { before: "", after: input.markdown },
          },
          commit: async () => {
            const createRes = await serverActions.createReport({
              projectId,
              label: input.label,
              folderId: null,
            });
            if (!createRes.success) throw new AIToolFailure(createRes.err);
            const bodyRes = await serverActions.updateReportBody({
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
        }),
      },
      inProgressLabel: "Creating report...",
      completionMessage: "Created report",
      kind: "write",
    }),
  ];
}
