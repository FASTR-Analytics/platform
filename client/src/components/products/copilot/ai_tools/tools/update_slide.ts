import {
  type AiSlideUpdate,
  AiSlideUpdateSchema,
  type ContentBlock,
  type ContentSlide,
  COPILOT_TOOL_VIEWS,
  type LayoutSpec,
  type MetricWithStatus,
  type PackageScope,
  type Slide,
} from "lib";
import { AIToolFailure, createAITool, type LayoutNode } from "panther";
import { z } from "zod";
import {
  type ClientAIToolEnv,
  copilotViews,
} from "~/components/instance/copilot/mod.ts";
import { createIdGeneratorForLayout } from "~/components/products/_shared/mod.ts";
import {
  assertImageAsset,
  assertSplitImageAsset,
  validateMaxContentBlocks,
  validateNoMarkdownTables,
  validateSlideTotalWordCount,
} from "../../_shared/mod.ts";
import { slidesLabel } from "./tool_labels.ts";
import {
  buildLayoutFromSpec,
  extractBlocksFromLayout,
  getSlideWithUpdatedBlocks,
  measureSlideOverflow,
  normalizeSpans,
  resolveFigureFromMetric,
} from "../../slide_ai/mod.ts";
import {
  readSlideTarget,
  slideTargetOutcome,
  writeSlideTarget,
} from "./slide_target.ts";
import { prepareSlideWriteResult } from "./slide_write_result.ts";

type AppliedUpdate = {
  slide: Slide;
  changes: string[];
  removedBlocks: { id: string; type: string }[];
  // The figure blocks the update built: the model sent a metric and a preset
  // for each, so their configs go back in the result.
  builtFigureIds: string[];
};

export function createUpdateSlideTool(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
) {
  return createAITool({
    viewRegistry: copilotViews,
    name: "update_slide",
    description:
      "Change a slide in place, keeping everything not named: a cover's title, subtitle, presenter or date, each one's size, bold and italic, and its logos; a section's title or subtitle, and each one's size, bold and italic; a content slide's header, sub-header, date, footer, header and footer logos, side panel (split), its blocks (blockUpdates) or its layout (layoutChange). get_slides shows a slide's settings as stored. Give the slideId and an `update` whose `type` matches the slide's type, with only the fields to change. A block ID comes from get_slides or from the result of the write that made the block. A from_metric block needs get_metric_data first. To tweak an existing figure use update_figure; to rebuild a slide or change its type use replace_slide. An edit to the open slide shows on its canvas at once and saves automatically; an edit to any other slide is saved immediately.",
    inputSchema: z.object({
      slideId: z.string().describe(
        "Slide ID (3-char alphanumeric, e.g. 'a3k'). Get these from get_deck.",
      ),
      // Under a key: panther's createAITool (and Anthropic's input_schema
      // contract) requires the top-level schema to be an object.
      update: AiSlideUpdateSchema,
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
      const overflow = applied.slide.type === "content"
        ? await measureSlideOverflow(
          applied.slide,
          view.context.getDeckConfig(),
        )
        : false;
      const result = await prepareSlideWriteResult(
        env,
        metrics,
        applied.slide,
        overflow,
        applied.builtFigureIds,
      );
      await writeSlideTarget(view, target, applied.slide);
      const removed = applied.removedBlocks.length === 0
        ? ""
        : ` Removed blocks: ${
          applied.removedBlocks.map((b) => `${b.id} (${b.type})`).join(", ")
        }.`;
      return result(
        `Updated ${
          applied.changes.join(", ")
        } in slide ${input.slideId}.${removed} ${slideTargetOutcome(target)}`,
      );
    },
    inProgressLabel: `Updating ${slidesLabel(1)}...`,
    completionMessage: `Updated ${slidesLabel(1)}`,
  });
}

async function applySlideUpdate(
  scope: PackageScope,
  slide: Slide,
  u: AiSlideUpdate,
  metrics: MetricWithStatus[],
): Promise<AppliedUpdate> {
  if (slide.type === "cover" && u.type === "cover") {
    const { type: _type, ...fields } = u;
    return {
      slide: { ...slide, ...fields },
      changes: Object.keys(fields),
      removedBlocks: [],
      builtFigureIds: [],
    };
  }
  if (slide.type === "section" && u.type === "section") {
    const { type: _type, ...fields } = u;
    return {
      slide: { ...slide, ...fields },
      changes: Object.keys(fields),
      removedBlocks: [],
      builtFigureIds: [],
    };
  }
  if (slide.type === "content" && u.type === "content") {
    const { type: _type, blockUpdates, layoutChange, split, ...fields } = u;
    let updated: ContentSlide = { ...slide, ...fields };
    const changes = Object.keys(fields);
    let removedBlocks: AppliedUpdate["removedBlocks"] = [];
    const builtFigureIds: string[] = [];
    if (split === null) {
      const { split: _removed, ...rest } = updated;
      updated = rest;
      changes.push("split");
    } else if (split !== undefined) {
      assertSplitImageAsset(split);
      updated = { ...updated, split };
      changes.push("split");
    }
    if (blockUpdates && blockUpdates.length > 0) {
      for (const bu of blockUpdates) {
        if (bu.newContent.type === "text") {
          validateNoMarkdownTables(bu.newContent.markdown);
        }
      }
      updated = await getSlideWithUpdatedBlocks(
        scope,
        updated,
        blockUpdates,
        metrics,
      ) as ContentSlide;
      builtFigureIds.push(
        ...blockUpdates
          .filter((bu) => bu.newContent.type === "from_metric")
          .map((bu) => bu.blockId),
      );
      changes.push(`${blockUpdates.length} block(s)`);
    }
    if (layoutChange) {
      const resolved = await resolveLayoutSpec(
        scope,
        updated.layout,
        layoutChange.layout,
        metrics,
      );
      updated = { ...updated, layout: resolved.layout };
      removedBlocks = resolved.removedBlocks;
      builtFigureIds.push(...resolved.builtFigureIds);
      changes.push("layout");
    }
    if (blockUpdates || layoutChange) {
      validateSlideTotalWordCount(
        extractBlocksFromLayout(updated.layout).flatMap(({ block }) =>
          block.type === "text" ? [block.markdown] : []
        ),
      );
    }
    return { slide: updated, changes, removedBlocks, builtFigureIds };
  }
  throw new AIToolFailure(
    `This is a "${slide.type}" slide, but the update was for a "${u.type}" slide. No changes were applied. Use get_slides to see the slide's type.`,
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
  builtFigureIds: string[];
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
        }. Use get_slides to see current block IDs.`,
      );
    }
    named.add(cell.block);
  }
  validateMaxContentBlocks(spec.flat().length);

  const spans = normalizeSpans(spec);
  const generateId = createIdGeneratorForLayout(layout);
  const builtFigureIds: string[] = [];
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
      } else if (cell.block.type === "image") {
        assertImageAsset(cell.block.imgFile);
        resolvedRow.push({ id: generateId(), block: cell.block, span });
      } else {
        const id = generateId();
        builtFigureIds.push(id);
        resolvedRow.push({
          id,
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
    builtFigureIds,
  };
}
