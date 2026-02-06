import type { InstalledModuleSummary, MetricWithStatus } from "lib";
import { getToolsForMethodologyDocs } from "./ai_tools/tools/methodology_docs";
import { getToolsForMetrics } from "./ai_tools/tools/metrics";
import { getToolsForModules } from "./ai_tools/tools/modules";
import { getToolsForSlides } from "./ai_tools/tools/slides";
import { getToolsForVizEditor,  } from "./ai_tools/tools/visualization_editor";
import { getToolsForVisualizations } from "./ai_tools/tools/visualizations";
import type { AIContext, DraftContent } from "./types";

type BuildToolsParams = {
  projectId: string;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  aiContext: () => AIContext;
  setDraftContent: (content: DraftContent) => void;
};

export function buildToolsForContext(params: BuildToolsParams) {
  const { projectId, modules, metrics, aiContext, setDraftContent } = params;

  return [
    // Base data tools - always available
    ...getToolsForMetrics(projectId, metrics),
    ...getToolsForModules(projectId, modules, metrics),
    ...getToolsForVisualizations(projectId),
    ...getToolsForMethodologyDocs(),

    // Mode-specific tools - check mode in handler
    ...getToolsForSlides(projectId, aiContext, metrics),
    ...getToolsForVizEditor(projectId, aiContext),
    // ...getDraftTools(projectId, metrics, setDraftContent, aiContext),
  ];
}

// function getDraftTools(
//   projectId: string,
//   metrics: MetricWithStatus[],
//   setDraftContent: (content: DraftContent) => void,
//   getAIContext: () => AIContext
// ) {
//   return [
//     createAITool({
//       name: "show_draft_slide",
//       description:
//         "Show a draft slide preview in the chat. The user can then choose to add it to a slide deck. Use this to propose slide content during exploration or when the user asks for slide ideas. Supports text blocks, from_visualization (reference saved viz), and from_metric (create chart from data). Max 6 content blocks. No markdown tables - use from_metric with chartType='table' instead.",
//       inputSchema: z.object({
//         heading: z.string().describe("Slide heading/title"),
//         blocks: z
//           .array(AiContentBlockInputSchema)
//           .describe("Content blocks for the slide (max 6)"),
//       }),
//       handler: async (input) => {
//         const ctx = getAIContext();
//         if (!ctx.mode.startsWith("viewing_")) {
//           throw new Error("Draft tools are only available in default mode. Switch to a specific deck to add slides directly.");
//         }

//         validateMaxContentBlocks(input.blocks.length);
//         for (const block of input.blocks) {
//           if (block.type === "text") {
//             validateNoMarkdownTables(block.markdown);
//           }
//         }

//         const slideInput: AiContentSlideInput = {
//           type: "content",
//           heading: input.heading,
//           blocks: input.blocks,
//         };

//         setDraftContent({ type: "slide", input: slideInput });

//         return { success: true, message: "Draft slide shown. User can add to deck." };
//       },
//       inProgressLabel: "Creating draft slide...",
//       completionMessage: () => "Draft slide ready",
//     }),

//     createAITool({
//       name: "show_draft_viz",
//       description:
//         "Show a draft visualization preview in the chat. The user can then choose to save it as a visualization. Use this when the user asks to see data visualized during exploration. Supports from_metric blocks only (since we're creating a new viz, not referencing existing ones).",
//       inputSchema: z.object({
//         heading: z.string().describe("Title for the visualization"),
//         blocks: z
//           .array(AiContentBlockInputSchema)
//           .max(1)
//           .describe("Single content block for the visualization"),
//       }),
//       handler: async (input) => {
//         const ctx = getAIContext();
//         if (!ctx.mode.startsWith("viewing_")) {
//           throw new Error("Draft tools are only available in default mode.");
//         }

//         if (input.blocks.length !== 1) {
//           throw new Error("Draft viz must have exactly one content block");
//         }

//         const slideInput: AiContentSlideInput = {
//           type: "content",
//           heading: input.heading,
//           blocks: input.blocks,
//         };

//         setDraftContent({ type: "viz", input: slideInput });

//         return { success: true, message: "Draft visualization shown. User can save it." };
//       },
//       inProgressLabel: "Creating draft visualization...",
//       completionMessage: () => "Draft visualization ready",
//     }),

//     createAITool({
//       name: "clear_draft",
//       description: "Clear the current draft preview from the chat.",
//       inputSchema: z.object({}),
//       handler: async () => {
//         const ctx = getAIContext();
//         if (!ctx.mode.startsWith("viewing_")) {
//           throw new Error("Draft tools are only available in default mode.");
//         }

//         setDraftContent(null);
//         return { success: true };
//       },
//       inProgressLabel: "Clearing draft...",
//       completionMessage: () => "Draft cleared",
//     }),
//   ];
// }
