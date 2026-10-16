import {
  AiContentBlockInputSchema,
  type ContentBlock,
  type ContentSlide,
  COPILOT_TOOL_VIEWS,
  type LayoutSpec,
  LayoutSpecSchema,
  MAX_CONTENT_BLOCKS,
  type MetricWithStatus,
  type PackageScope,
  type Slide,
} from "lib";
import { AIToolFailure, createAITool, type LayoutNode } from "panther";
import { z } from "zod";
import { copilotViews } from "~/components/instance/copilot/mod.ts";
import { createIdGeneratorForLayout } from "~/components/products/_shared/mod.ts";
import {
  validateMaxContentBlocks,
  validateNoMarkdownTables,
  validateSlideTotalWordCount,
} from "../../_shared/mod.ts";
import {
  buildLayoutFromSpec,
  extractBlocksFromLayout,
  getSlideWithUpdatedBlocks,
  normalizeSpans,
  resolveFigureFromMetric,
} from "../../slide_ai/mod.ts";
import {
  readSlideTarget,
  slideTargetOutcome,
  writeSlideTarget,
} from "./slide_target.ts";

// Mirrors the Slide storage union, so a field aimed at the wrong slide type
// is unrepresentable in the tool call. The union sits under a key because
// panther's createAITool (and Anthropic's input_schema contract) requires the
// top-level schema to be an object.
const SlideUpdateSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("cover"),
      title: z.string().optional().describe("Main title"),
      subtitle: z.string().optional().describe("Subtitle"),
      presenter: z.string().optional().describe("Presenter name"),
      date: z.string().optional().describe("Date text"),
    }),
    z.object({
      type: z.literal("section"),
      sectionTitle: z.string().optional().describe("Section title"),
      sectionSubtitle: z.string().optional().describe("Section subtitle"),
    }),
    z.object({
      type: z.literal("content"),
      header: z.string().optional().describe("Header text at top of slide"),
      blockUpdates: z
        .array(
          z.object({
            blockId: z.string().describe("Block ID from get_slide"),
            newContent: AiContentBlockInputSchema,
          }),
        )
        .optional()
        .describe(
          `REPLACE specific blocks by ID with new content. Max ${MAX_CONTENT_BLOCKS} blocks. Use this to swap a block for a DIFFERENT figure (a different metric or a different chart type) or to change a text block. To merely TWEAK an existing figure (e.g. its replicant, filters, captions), use update_figure instead: replacing a figure block here REBUILDS it from scratch and DISCARDS any prior edits. No markdown tables: use a from_metric block with a table-type preset (vizPresetId) instead. Mutually exclusive with layoutChange.`,
        ),
      layoutChange: z
        .object({ layout: LayoutSpecSchema })
        .optional()
        .describe(
          "Restructure the layout: add, remove or rearrange blocks, or change their spans. The layout names ALL blocks that will be on the slide: an existing block it does not name is REMOVED. Name existing blocks by ID to keep them; give inline content for new ones. Prefer balanced spans (e.g. 6+6 or 8+4) unless the user asks for specific proportions. Mutually exclusive with blockUpdates.",
        ),
    }),
  ])
  .describe("Per-type update. `type` must match the slide's type.");

type SlideUpdate = z.infer<typeof SlideUpdateSchema>;

type AppliedUpdate = {
  slide: Slide;
  changes: string[];
  removedBlocks: { id: string; type: string }[];
};

export function createUpdateSlideTool(metrics: MetricWithStatus[]) {
  return createAITool({
    viewRegistry: copilotViews,
    name: "update_slide",
    description:
      "Change a slide in place, keeping everything not named: a cover's title, subtitle, presenter or date; a section's title or subtitle; a content slide's header, its blocks (blockUpdates) or its layout (layoutChange). Give the slideId and an `update` whose `type` matches the slide's type, with only the fields to change. Call get_slide first for the slide's type and block IDs. A from_metric block needs get_metric_data first. To tweak an existing figure use update_figure; to rebuild a slide or change its type use replace_slide. An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      update: SlideUpdateSchema,
    }),
    availableIn: COPILOT_TOOL_VIEWS.update_slide,
    kind: "write",
    handler: async (input, view) => {
      const u = input.update;
      if (u.type === "content" && u.blockUpdates && u.layoutChange) {
        throw new AIToolFailure(
          "Cannot use both blockUpdates and layoutChange. Use blockUpdates to change block content, or layoutChange to change layout structure.",
        );
      }
      const target = await readSlideTarget(view, input.slideId);
      const applied = await applySlideUpdate(
        view.context.getScope(),
        target.slide,
        u,
        metrics,
      );
      if (applied.changes.length === 0) {
        return "No changes specified. Make sure you're providing fields appropriate for this slide type.";
      }
      await writeSlideTarget(view, target, applied.slide);
      const removed = applied.removedBlocks.length === 0
        ? ""
        : ` Removed blocks: ${
          applied.removedBlocks.map((b) => `${b.id} (${b.type})`).join(", ")
        }.`;
      return `Updated ${
        applied.changes.join(", ")
      } in slide ${input.slideId}.${removed} ${slideTargetOutcome(target)}`;
    },
    inProgressLabel: (input) => `Updating slide ${input.slideId}...`,
    completionMessage: (input) => `Updated slide ${input.slideId}`,
  });
}

async function applySlideUpdate(
  scope: PackageScope,
  slide: Slide,
  u: SlideUpdate,
  metrics: MetricWithStatus[],
): Promise<AppliedUpdate> {
  if (slide.type === "cover" && u.type === "cover") {
    const { type: _type, ...fields } = u;
    return {
      slide: { ...slide, ...fields },
      changes: Object.keys(fields),
      removedBlocks: [],
    };
  }
  if (slide.type === "section" && u.type === "section") {
    const { type: _type, ...fields } = u;
    return {
      slide: { ...slide, ...fields },
      changes: Object.keys(fields),
      removedBlocks: [],
    };
  }
  if (slide.type === "content" && u.type === "content") {
    let updated: ContentSlide = slide;
    const changes: string[] = [];
    let removedBlocks: AppliedUpdate["removedBlocks"] = [];
    if (u.header !== undefined) {
      updated = { ...updated, header: u.header };
      changes.push("header");
    }
    if (u.blockUpdates && u.blockUpdates.length > 0) {
      for (const bu of u.blockUpdates) {
        if (bu.newContent.type === "text") {
          validateNoMarkdownTables(bu.newContent.markdown);
        }
      }
      updated = await getSlideWithUpdatedBlocks(
        scope,
        updated,
        u.blockUpdates,
        metrics,
      ) as ContentSlide;
      changes.push(`${u.blockUpdates.length} block(s)`);
    }
    if (u.layoutChange) {
      const resolved = await resolveLayoutSpec(
        scope,
        updated.layout,
        u.layoutChange.layout,
        metrics,
      );
      updated = { ...updated, layout: resolved.layout };
      removedBlocks = resolved.removedBlocks;
      changes.push("layout");
    }
    if (changes.some((c) => c !== "header")) {
      validateSlideTotalWordCount(
        extractBlocksFromLayout(updated.layout).flatMap(({ block }) =>
          block.type === "text" ? [block.markdown] : []
        ),
      );
    }
    return { slide: updated, changes, removedBlocks };
  }
  throw new AIToolFailure(
    `This is a "${slide.type}" slide, but the update was for a "${u.type}" slide. No changes were applied. Use get_slide to see the slide's type.`,
  );
}

// The layout a spec names: existing blocks by id, new blocks resolved from
// their inline content, spans normalised to the 12-column grid. Every block
// the spec leaves out is removed, and reported.
async function resolveLayoutSpec(
  scope: PackageScope,
  layout: LayoutNode<ContentBlock>,
  spec: LayoutSpec,
  metrics: MetricWithStatus[],
): Promise<{
  layout: LayoutNode<ContentBlock>;
  removedBlocks: AppliedUpdate["removedBlocks"];
}> {
  const existing = new Map(
    extractBlocksFromLayout(layout).map(({ id, block }) => [id, block]),
  );
  const named = new Set<string>();
  for (const cell of spec.flat()) {
    if (typeof cell.block !== "string") continue;
    if (named.has(cell.block)) {
      throw new AIToolFailure(
        `Duplicate block ID "${cell.block}". Each block can only appear once in the layout.`,
      );
    }
    if (!existing.has(cell.block)) {
      throw new AIToolFailure(
        `Block ID "${cell.block}" not found in slide. Available block IDs: ${
          [...existing.keys()].join(", ")
        }. Use get_slide to see current block IDs.`,
      );
    }
    named.add(cell.block);
  }
  validateMaxContentBlocks(spec.flat().length);

  const spans = normalizeSpans(spec);
  const generateId = createIdGeneratorForLayout(layout);
  const rows: { id: string; block: ContentBlock; span: number }[][] = [];
  for (const [r, row] of spec.entries()) {
    const resolvedRow: { id: string; block: ContentBlock; span: number }[] = [];
    for (const [c, cell] of row.entries()) {
      const span = spans[r][c];
      if (typeof cell.block === "string") {
        resolvedRow.push({
          id: cell.block,
          block: existing.get(cell.block)!,
          span,
        });
      } else if (cell.block.type === "text") {
        validateNoMarkdownTables(cell.block.markdown);
        resolvedRow.push({ id: generateId(), block: cell.block, span });
      } else {
        resolvedRow.push({
          id: generateId(),
          block: await resolveFigureFromMetric(scope, cell.block, metrics),
          span,
        });
      }
    }
    rows.push(resolvedRow);
  }

  return {
    layout: buildLayoutFromSpec(rows),
    removedBlocks: [...existing]
      .filter(([id]) => !named.has(id))
      .map(([id, block]) => ({ id, type: block.type })),
  };
}
