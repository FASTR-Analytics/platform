import { AiContentBlockInputSchema, MAX_CONTENT_BLOCKS, type MetricWithStatus } from "lib";
import { createAITool } from "panther";
import { reconcile } from "solid-js/store";
import { unwrap } from "solid-js/store";
import { z } from "zod";
import type { AIContext } from "~/components/project_ai/types";
import { validateNoMarkdownTables } from "../validators/content_validators";
import { simplifySlideForAI } from "~/components/slide_deck/slide_ai/extract_blocks_from_layout";
import { getSlideWithUpdatedBlocks } from "~/components/slide_deck/slide_ai/get_slide_with_updated_blocks";

export function getToolsForSlideEditor(
  projectId: string,
  getAIContext: () => AIContext,
  metrics: MetricWithStatus[],
) {
  return [
    createAITool({
      name: "get_slide_editor",
      description:
        "Get the current content and structure of the slide being edited. Shows live state from the editor (including unsaved changes). ALWAYS call this first when starting to help with a slide.",
      inputSchema: z.object({}),
      handler: async () => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_slide") {
          throw new Error("This tool is only available when editing a slide");
        }

        const slide = ctx.getTempSlide();
        const simplified = await simplifySlideForAI(projectId, slide);

        const lines: string[] = [];
        lines.push("# SLIDE EDITOR");
        lines.push("=".repeat(80));
        lines.push("");
        lines.push(`**Slide ID:** ${ctx.slideId}`);
        lines.push(`**Slide type:** ${ctx.slideType}`);
        lines.push(`**Deck:** ${ctx.deckLabel}`);
        lines.push("");
        lines.push("## CURRENT CONTENT");
        lines.push("=".repeat(50));
        lines.push("");
        lines.push(JSON.stringify(simplified, null, 2));

        return lines.join("\n");
      },
      inProgressLabel: "Getting slide...",
      completionMessage: "Retrieved slide",
    }),
    createAITool({
      name: "update_slide_editor",
      description:
        "Update the slide content. Only provide fields you want to change. Changes are LOCAL (preview only) until user clicks Save. Use get_slide_editor first to see current state and block IDs.",
      inputSchema: z.object({
        title: z.string().optional().describe("Cover slide: main title"),
        subtitle: z.string().optional().describe("Cover slide: subtitle"),
        presenter: z.string().optional().describe("Cover slide: presenter name"),
        date: z.string().optional().describe("Cover slide: date text"),
        sectionTitle: z.string().optional().describe("Section slide: section title"),
        sectionSubtitle: z.string().optional().describe("Section slide: section subtitle"),
        header: z.string().optional().describe("Content slide: header text at top of slide"),
        blockUpdates: z
          .array(
            z.object({
              blockId: z.string().describe("Block ID from get_slide_editor"),
              newContent: AiContentBlockInputSchema,
            }),
          )
          .optional()
          .describe(
            `Content slide: update specific blocks by ID. Max ${MAX_CONTENT_BLOCKS} blocks. No markdown tables - use from_metric with chartType='table' instead.`,
          ),
      }),
      handler: async (input) => {
        const ctx = getAIContext();
        if (ctx.mode !== "editing_slide") {
          throw new Error("This tool is only available when editing a slide");
        }

        const currentSlide = unwrap(ctx.getTempSlide());
        const changes: string[] = [];

        if (currentSlide.type === "cover") {
          const updated = { ...currentSlide };
          if (input.title !== undefined) {
            updated.title = input.title;
            changes.push("title");
          }
          if (input.subtitle !== undefined) {
            updated.subtitle = input.subtitle;
            changes.push("subtitle");
          }
          if (input.presenter !== undefined) {
            updated.presenter = input.presenter;
            changes.push("presenter");
          }
          if (input.date !== undefined) {
            updated.date = input.date;
            changes.push("date");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (currentSlide.type === "section") {
          const updated = { ...currentSlide };
          if (input.sectionTitle !== undefined) {
            updated.sectionTitle = input.sectionTitle;
            changes.push("sectionTitle");
          }
          if (input.sectionSubtitle !== undefined) {
            updated.sectionSubtitle = input.sectionSubtitle;
            changes.push("sectionSubtitle");
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (currentSlide.type === "content") {
          let updated = { ...currentSlide };
          if (input.header !== undefined) {
            updated.header = input.header;
            changes.push("header");
          }
          if (input.blockUpdates && input.blockUpdates.length > 0) {
            for (const bu of input.blockUpdates) {
              if (bu.newContent.type === "text") {
                validateNoMarkdownTables(bu.newContent.markdown);
              }
            }
            updated = (await getSlideWithUpdatedBlocks(
              projectId,
              updated,
              input.blockUpdates,
              metrics,
            )) as typeof updated;
            changes.push(`${input.blockUpdates.length} block(s)`);
          }
          if (changes.length > 0) {
            ctx.setTempSlide(reconcile(updated));
          }
        }

        if (changes.length === 0) {
          return "No changes specified. Make sure you're providing fields appropriate for this slide type.";
        }

        return `Updated ${changes.join(", ")}. The preview will update automatically. User must click "Save" to persist changes.`;
      },
      inProgressLabel: "Updating slide...",
      completionMessage: (input) => {
        const changeCount = Object.keys(input).filter(
          (k) => input[k as keyof typeof input] !== undefined,
        ).length;
        return `Updated ${changeCount} field(s)`;
      },
    }),
  ];
}
