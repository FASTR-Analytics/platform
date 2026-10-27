import {
  createCanvasRenderContextBrowser,
  createItemNode,
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
  FigureBundle,
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
import { buildStyleForSlide } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";
import { createIdGeneratorForLayout } from "~/components/products/_shared/mod.ts";

/**
 * Convert AI input (blocks[]) to storage format (LayoutNode<ContentBlock>).
 *
 * Figures resolve under the caller's PackageScope: the deck the slide is
 * destined for.
 *
 * `overflow` is the page-level overflow the optimizer scored for the layout it
 * kept, which a caller that writes the slide for the model reports: the model
 * cannot see the canvas badge. It is sound and incomplete. The optimizer scores
 * the whole page box while the render gives the layout the page minus its
 * header and footer, so a layout it calls overflowing overflows at render too,
 * and one the header's height pushes over the edge scores 0.
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

  // Extract PageContentItems and build ID → bundle map
  const bundleMap = new Map<string, FigureBundle | undefined>();
  const generateId = createIdGeneratorForLayout();
  const itemNodes = resolvedBlocks.map((block) => {
    let pageItem: PageContentItem;
    if (block.type === "text") {
      pageItem = { markdown: block.markdown };
    } else if (block.type === "image") {
      pageItem = { spacer: true };
    } else if (block.bundle) {
      try {
        pageItem = buildFigureInputs(block.bundle) as PageContentItem;
      } catch {
        pageItem = { spacer: true };
      }
    } else {
      pageItem = { spacer: true };
    }

    const node = createItemNode(pageItem);
    const shortId = generateId();
    const nodeWithShortId = { ...node, id: shortId };

    if (block.type === "figure") {
      bundleMap.set(shortId, block.bundle);
    }

    return nodeWithShortId;
  });

  // Build style and load fonts before layout optimization
  const pageStyle = buildStyleForSlide(
    {
      type: "content",
      header: slideInput.header,
      layout: { type: "item", id: "tmp", data: { type: "text", markdown: "" } },
    },
    deckConfig,
  );
  const fontFamily = getSlideDeckThemeSpec(deckConfig.theme).fontFamily;
  const fonts = getAllSlideFontVariants(fontFamily);
  await loadFontsWithTimeout(fonts);

  // Optimize layout
  const rc = createCanvasRenderContextBrowser();
  // The canonical render frame, so text and figures are measured at the size
  // they are drawn. The box is still the whole page: the render gives the
  // layout the page minus its header and footer.
  const bounds = new RectCoordsDims([
    0,
    0,
    PAGE_WIDTH_DU,
    PAGE_HEIGHT_DU,
  ]);

  const result = optimizePageLayout(
    rc,
    bounds,
    itemNodes,
    pageStyle,
    getOptimizerConfig(slideInput.layoutPreference, resolvedBlocks.length),
  );

  const layoutWithMeta = restoreMetadata(result.best.layout, bundleMap);

  return {
    slide: slideConfigSchema.parse({
      type: "content",
      header: slideInput.header,
      layout: layoutWithMeta,
    }) as Slide,
    overflow: result.best.score.overflow === 1,
  };
}

type BundleMap = Map<string, FigureBundle | undefined>;

function restoreMetadata(
  node: LayoutNode<PageContentItem>,
  bundleMap: BundleMap,
): LayoutNode<ContentBlock> {
  if (node.type === "item") {
    const pageItem = node.data;
    const isText = "markdown" in pageItem;
    let contentBlock: ContentBlock;
    if (isText) {
      contentBlock = { type: "text", markdown: pageItem.markdown };
    } else {
      contentBlock = {
        type: "figure",
        bundle: bundleMap.get(node.id),
      };
    }
    return { type: "item", id: node.id, span: node.span, data: contentBlock };
  }

  return {
    type: node.type,
    id: node.id,
    span: node.span,
    children: node.children.map((child) => restoreMetadata(child, bundleMap)),
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
