import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import type { ProductSummary } from "lib";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { createLabelledProduct } from "../create_labelled_product";

// Instance products of type report (SPA-only), read from instance T1 at call
// time so the list is never frozen at tool construction. create_report is
// the copilot's one non-editor write: approval-gated.
function formatReportsListForAI(reports: ProductSummary[]): string {
  if (reports.length === 0) return "No reports exist yet.";
  return reports.map((r) => `- ${r.label} (id: ${r.id})`).join("\n");
}

export function getClientToolsForReports() {
  return [
    createAITool({
      name: "get_available_reports",
      description: "Get a list of all reports with their IDs and labels.",
      inputSchema: z.object({}),
      handler: async () =>
        formatReportsListForAI(
          instanceState.products.filter((p) => p.type === "report"),
        ),
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
          product_id: input.reportId,
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
            // The body that would actually commit: consent must be to the
            // content, not to a word count.
            diff: { before: "", after: input.markdown },
          },
          commit: async () => {
            const createRes = await createLabelledProduct("report", input.label);
            if (!createRes.success) throw new AIToolFailure(createRes.err);
            const bodyRes = await serverActions.updateReportBody({
              product_id: createRes.data.productId,
              body: input.markdown,
              expectedLastUpdated: createRes.data.lastUpdated,
              overwrite: true,
            });
            if (!bodyRes.success) {
              throw new AIToolFailure(
                `Report created (id: ${createRes.data.productId}) but failed to set body: ${bodyRes.err}`,
              );
            }
            return `Created report "${input.label}" (id: ${createRes.data.productId}).`;
          },
        }),
      },
      inProgressLabel: "Creating report...",
      completionMessage: "Created report",
      kind: "write",
    }),
  ];
}
