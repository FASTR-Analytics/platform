import {
  createCanvasRenderContextBrowser,
  type ItemLayoutNode,
  type LayoutNode,
  loadFontsWithTimeout,
  optimizePageLayout,
  type OptimizerConfig,
  type PageContentItem,
  RectCoordsDims,
} from "panther";
import type {
  AiSlideInput,
  ContentBlock,
  MetricWithStatus,
  PackageScope,
  Slide,
  SlideDeckConfig,
} from "lib";
import {
  getAllSlideFontVariants,
  getSlideDeckThemeSpec,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  slideConfigSchema,
} from "lib";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";
import { createIdGeneratorForLayout } from "~/components/products/_shared/mod.ts";

/**
 * Convert AI input (blocks[]) to storage format (LayoutNode<ContentBlock>).
 *
 * Figures resolve under the caller's PackageScope: the deck the slide is
 * destined for.
 *
 * The optimizer is fed through the renderer's own path: the provisional slide
 * goes through convertSlideToPageInputs, and the optimizer gets that page's
 * chrome, style and items. `overflow` is therefore the flag the deck's canvas
 * badges, which a caller that writes the slide for the model reports: the
 * model cannot see the badge.
 */
export async function convertAiInputToSlide(
  scope: PackageScope,
  slideInput: AiSlideInput,
  metrics: MetricWithStatus[],
  deckConfig: SlideDeckConfig,
): Promise<{ slide: Slide; overflow: boolean }> {
  // Cover and section pass through unchanged
  if (slideInput.type === "cover" || slideInput.type === "section") {
    return {
      slide: slideConfigSchema.parse(slideInput) as Slide,
      overflow: false,
    };
  }

  // Content slide - resolve figures and optimize layout
  if (!slideInput.blocks || !Array.isArray(slideInput.blocks)) {
    console.error("Invalid blocks:", JSON.stringify(slideInput, null, 2));
    throw new Error(
      `Content slide must have a 'blocks' array. Received: ${typeof slideInput
        .blocks}`,
    );
  }

  const resolvedBlocks: ContentBlock[] = [];

  for (const block of slideInput.blocks) {
    if (block.type === "text") {
      resolvedBlocks.push(block);
      continue;
    }

    try {
      const figureBlock = await resolveFigureFromMetric(scope, block, metrics);
      resolvedBlocks.push(figureBlock);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to create figure from metric "${block.metricId}" with preset "${block.vizPresetId}": ${errMsg}`,
      );
    }
  }

  const generateId = createIdGeneratorForLayout();
  const blocksById = new Map(
    resolvedBlocks.map((block) => [generateId(), block] as const),
  );
  const provisional = slideConfigSchema.parse({
    type: "content",
    header: slideInput.header,
    layout: {
      type: "rows",
      id: generateId(),
      children: [...blocksById].map(([id, data]) => ({
        type: "item",
        id,
        data,
      })),
    },
  }) as Slide;

  const fontFamily = getSlideDeckThemeSpec(deckConfig.theme).fontFamily;
  await loadFontsWithTimeout(getAllSlideFontVariants(fontFamily));

  const res = await convertSlideToPageInputs(
    provisional,
    undefined,
    deckConfig,
  );
  if (!res.success) throw new Error(res.err);
  const page = res.data;
  if (page.type !== "freeform") {
    throw new Error(`Content slide converted to a ${page.type} page`);
  }

  const result = optimizePageLayout(
    createCanvasRenderContextBrowser(),
    new RectCoordsDims([0, 0, PAGE_WIDTH_DU, PAGE_HEIGHT_DU]),
    leafItems(page.content),
    page,
    page.style,
    getOptimizerConfig(slideInput.layoutPreference, resolvedBlocks.length),
  );

  return {
    slide: slideConfigSchema.parse({
      type: "content",
      header: slideInput.header,
      layout: restoreBlocks(result.best.layout, blocksById),
    }) as Slide,
    overflow: result.best.score.overflow === 1,
  };
}

function leafItems(
  node: LayoutNode<PageContentItem>,
): ItemLayoutNode<PageContentItem>[] {
  return node.type === "item" ? [node] : node.children.flatMap(leafItems);
}

function restoreBlocks(
  node: LayoutNode<PageContentItem>,
  blocksById: Map<string, ContentBlock>,
): LayoutNode<ContentBlock> {
  if (node.type === "item") {
    const data = blocksById.get(node.id);
    if (!data) throw new Error(`Optimized layout lost block ${node.id}`);
    return { type: "item", id: node.id, span: node.span, data };
  }

  return {
    type: node.type,
    id: node.id,
    span: node.span,
    children: node.children.map((child) => restoreBlocks(child, blocksById)),
  };
}

function getOptimizerConfig(
  layoutPreference: "cols" | "rows" | undefined,
  blockCount: number,
): OptimizerConfig | undefined {
  if (blockCount === 2 && layoutPreference) {
    return { constraint: { type: layoutPreference } };
  }
  return undefined;
}
