import { AIToolFailure, createAITool } from "panther";
import { z } from "zod";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { copilotViewController } from "~/components/copilot/ai_views";
import { formatProductsListForAI } from "./_internal/format_products_list_for_ai";

// The product registry, as the copilot reads and writes it: a product is a
// slide deck or a report, filed in a folder and attached to one results
// package (D3/D16). The lists come from T1 — the instance SSE channel keeps
// them current, so there is no list route to call. `create_report` is the
// copilot's one non-editor write, approval-gated.
export function getClientToolsForProducts() {
  return [
    createAITool({
      name: "get_available_slide_decks",
      description:
        "Get all slide decks, with their IDs, folder, and the results package and scope each serves from.",
      inputSchema: z.object({}),
      handler: async () =>
        formatProductsListForAI(
          instanceState.products,
          "slide_deck",
          instanceState.folders,
          instanceState.readyPackages,
        ),
      inProgressLabel: "Getting available slide decks...",
      completionMessage: "Retrieved slide decks list",
      kind: "read",
    }),

    createAITool({
      name: "get_available_reports",
      description:
        "Get all reports, with their IDs, folder, and the results package and scope each serves from.",
      inputSchema: z.object({}),
      handler: async () =>
        formatProductsListForAI(
          instanceState.products,
          "report",
          instanceState.folders,
          instanceState.readyPackages,
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
        "Create a new report with a label and a markdown body. The report is attached to the instance's pinned results package; the user reattaches it in product settings if they want another one. Use markdown headings, paragraphs, bold/italic, lists, blockquotes, and tables. Do NOT embed raw HTML or figure/image tokens (figures are added later in the report editor). The user opens the report in the editor to review and edit it — never show a report preview in the chat.",
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
            // The server mints the row (label "Untitled report", folder NULL,
            // run_id = the pin) and the label is a separate product-registry
            // write — one id namespace, one authority (D1/D16).
            const createRes = await serverActions.createProduct({
              type: "report",
              folderId: null,
            });
            if (!createRes.success) throw new AIToolFailure(createRes.err);
            const productId = createRes.data.productId;
            // One mark covers all three writes: marks are TTL-scoped and never
            // consumed at drain, and the three `products_upserted` echoes land
            // milliseconds apart.
            copilotViewController.markAIEdit(`product:${productId}`);

            const labelRes = await serverActions.updateProductLabel({
              product_id: productId,
              label: input.label,
            });
            if (!labelRes.success) {
              throw new AIToolFailure(
                `Report created (id: ${productId}) but failed to set its label: ${labelRes.err}`,
              );
            }

            const bodyRes = await serverActions.updateReportBody({
              report_id: productId,
              body: input.markdown,
              expectedLastUpdated: labelRes.data.lastUpdated,
              overwrite: true,
            });
            if (!bodyRes.success) {
              throw new AIToolFailure(
                `Report created (id: ${productId}) but failed to set body: ${bodyRes.err}`,
              );
            }
            return `Created report "${input.label}" (id: ${productId}).`;
          },
        }),
      },
      inProgressLabel: "Creating report...",
      completionMessage: "Created report",
      kind: "write",
    }),
  ];
}
