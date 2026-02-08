import {
  optimizePageLayout,
  createCanvasRenderContextBrowser,
  RectCoordsDims,
  createItemNode,
  type LayoutNode,
  type PageContentItem,
} from "panther";
import type {
  Slide,
  ContentBlock,
  FigureSource,
  AiSlideInput,
  MetricWithStatus,
  SlideDeckConfig,
} from "lib";
import { FIGURE_AUTOFIT, MARKDOWN_AUTOFIT } from "lib";
import { buildStyleForSlide } from "../slide_rendering/convert_slide_to_page_inputs";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "./resolve_figure_from_visualization";
import { createIdGeneratorForLayout } from "~/utils/id_generation";

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
    return slideInput as Slide;
  }

  // Content slide - resolve figures and optimize layout
  if (!slideInput.blocks || !Array.isArray(slideInput.blocks)) {
    console.error("Invalid blocks:", JSON.stringify(slideInput, null, 2));
    throw new Error(`Content slide must have a 'blocks' array. Received: ${typeof slideInput.blocks}`);
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
        const figureBlock = await resolveFigureFromVisualization(projectId, block);
        resolvedBlocks.push(figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to resolve visualization "${block.visualizationId}"${
            block.replicant ? ` with replicant "${block.replicant}"` : ''
          }. Check that the visualization exists and the replicant is valid. Original error: ${errMsg}`
        );
      }
    } else if (block.type === "from_metric") {
      try {
        const figureBlock = await resolveFigureFromMetric(projectId, block, metrics);
        resolvedBlocks.push(figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to create figure from metric "${block.metricQuery.metricId}". Check that the metric exists and parameters are valid. Original error: ${errMsg}`
        );
      }
    // } else if (block.type === "custom") {
    } else {
      throw new Error("Bad input figure type");
    }
  }

  // Extract PageContentItems and build ID → source map
  const sourceMap = new Map<string, FigureSource>();
  const generateId = createIdGeneratorForLayout();
  const itemNodes = resolvedBlocks.map((block) => {
    let pageItem: PageContentItem;
    if (block.type === "text") {
      pageItem = { markdown: block.markdown, autofit: MARKDOWN_AUTOFIT };
    } else if (block.type === "image") {
      pageItem = { spacer: true };
    } else if (block.figureInputs) {
      pageItem = { ...block.figureInputs, autofit: FIGURE_AUTOFIT };
    } else {
      pageItem = { spacer: true };
    }

    const node = createItemNode(pageItem);

    const shortId = generateId();
    const nodeWithShortId = { ...node, id: shortId };

    if (block.type === "figure" && block.source) {
      sourceMap.set(shortId, block.source);
    }

    return nodeWithShortId;
  });

  // Optimize layout
  const rc = createCanvasRenderContextBrowser();
  const bounds = new RectCoordsDims([0, 0, 1920, 1080]);

  const optimized = optimizePageLayout(
    rc,
    bounds,
    itemNodes,
    buildStyleForSlide({ type: "content", header: slideInput.header, layout: { type: "item", id: "tmp", data: { type: "text", markdown: "" } } }, deckConfig),
    undefined,
    undefined,
  );

  // Restore metadata into layout (IDs are preserved by optimizer)
  const layoutWithMeta = restoreMetadata(optimized.layout, sourceMap);

  return {
    type: "content",
    header: slideInput.header,
    layout: layoutWithMeta,
  };
}

/**
 * Restore source metadata into layout tree after optimization
 */
function restoreMetadata(
  node: LayoutNode<PageContentItem>,
  sourceMap: Map<string, FigureSource>
): LayoutNode<ContentBlock> {
  if (node.type === "item") {
    const pageItem = node.data;
    const source = sourceMap.get(node.id);

    // Determine if text or figure
    const isText = "markdown" in pageItem;

    let contentBlock: ContentBlock;
    if (isText) {
      contentBlock = { type: "text", markdown: pageItem.markdown };
    } else {
      const { autofit, ...figureInputs } = pageItem as any;
      contentBlock = { type: "figure", figureInputs, source };
    }

    return { type: "item", id: node.id, span: node.span, data: contentBlock };
  }

  // Rows/cols - recurse, preserving span
  return {
    type: node.type,
    id: node.id,
    span: node.span,
    children: node.children.map((child) => restoreMetadata(child, sourceMap)),
  };
}
