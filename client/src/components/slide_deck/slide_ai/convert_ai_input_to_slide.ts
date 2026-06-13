import {
  optimizePageLayout,
  createCanvasRenderContextBrowser,
  RectCoordsDims,
  createItemNode,
  loadFontsWithTimeout,
  type LayoutNode,
  type OptimizerConfig,
  type PageContentItem,
} from "panther";
import type {
  Slide,
  ContentBlock,
  FigureBundle,
  AiSlideInput,
  MetricWithStatus,
  SlideDeckConfig,
} from "lib";
import { slideConfigSchema, getAllSlideFontVariants, PAGE_HEIGHT_DU, PAGE_WIDTH_DU } from "lib";
import { buildStyleForSlide } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "./resolve_figure_from_visualization";
import { createIdGeneratorForLayout } from "~/components/slide_deck/_id_generation";

/**
 * Convert AI input (blocks[]) to storage format (LayoutNode<ContentBlock>)
 */
export async function convertAiInputToSlide(
  projectId: string,
  slideInput: AiSlideInput,
  metrics: MetricWithStatus[],
  deckConfig: SlideDeckConfig,
): Promise<Slide> {
  // Cover and section pass through unchanged
  if (slideInput.type === "cover" || slideInput.type === "section") {
    return slideConfigSchema.parse(slideInput) as Slide;
  }

  // Content slide - resolve figures and optimize layout
  if (!slideInput.blocks || !Array.isArray(slideInput.blocks)) {
    console.error("Invalid blocks:", JSON.stringify(slideInput, null, 2));
    throw new Error(
      `Content slide must have a 'blocks' array. Received: ${typeof slideInput.blocks}`,
    );
  }

  const resolvedBlocks: ContentBlock[] = [];

  for (const block of slideInput.blocks) {
    if (block.type === "text") {
      resolvedBlocks.push(block);
      continue;
    }

    // Handle figure input types
    if (block.type === "from_visualization") {
      try {
        const figureBlock = await resolveFigureFromVisualization(
          projectId,
          block,
        );
        resolvedBlocks.push(figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to resolve visualization "${block.visualizationId}"${
            block.replicant ? ` with replicant "${block.replicant}"` : ""
          }. Check that the visualization exists and the replicant is valid. Original error: ${errMsg}`,
        );
      }
    } else if (block.type === "from_metric") {
      try {
        const figureBlock = await resolveFigureFromMetric(
          projectId,
          block,
          metrics,
        );
        resolvedBlocks.push(figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to create figure from metric "${block.metricId}" with preset "${block.vizPresetId}": ${errMsg}`,
        );
      }
      // } else if (block.type === "custom") {
    } else {
      throw new Error("Bad input figure type");
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
  const fontFamily = deckConfig.fontFamily ?? "International Inter";
  const fonts = getAllSlideFontVariants(fontFamily);
  await loadFontsWithTimeout(fonts);

  // Optimize layout
  const rc = createCanvasRenderContextBrowser();
  // Optimize at the canonical render frame so "fits at layout" == "fits at render".
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

  return slideConfigSchema.parse({
    type: "content",
    header: slideInput.header,
    layout: layoutWithMeta,
  }) as Slide;
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
