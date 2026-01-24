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
} from "lib";
import { slideDeckStyle } from "./convert_slide_to_page_inputs";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "./resolve_figure_from_visualization";

/**
 * Convert AI input (blocks[]) to storage format (LayoutNode<ContentBlock>)
 */
export async function convertAiInputToSlide(
  projectId: string,
  slideInput: AiSlideInput
): Promise<Slide> {
  // Cover and section pass through unchanged
  if (slideInput.type === "cover" || slideInput.type === "section") {
    return slideInput as Slide;
  }

  // Content slide - resolve figures and optimize layout
  if (!slideInput.blocks || !Array.isArray(slideInput.blocks)) {
    throw new Error("Content slide must have a 'blocks' array");
  }

  const resolvedBlocks: ContentBlock[] = [];

  for (const block of slideInput.blocks) {
    if (block.type === "text") {
      resolvedBlocks.push(block);
      continue;
    }

    // Handle figure input types
    if (block.type === "from_visualization") {
      const figureBlock = await resolveFigureFromVisualization(projectId, block);
      resolvedBlocks.push(figureBlock);
    } else if (block.type === "from_metric") {
      const figureBlock = await resolveFigureFromMetric(projectId, block);
      resolvedBlocks.push(figureBlock);
    } else if (block.type === "custom") {
      throw new Error("custom figure type not yet implemented");
    }
  }

  // Extract PageContentItems and build ID → source map
  const sourceMap = new Map<string, FigureSource>();
  const itemNodes = resolvedBlocks.map((block) => {
    const pageItem: PageContentItem =
      block.type === "text"
        ? { markdown: block.markdown, autofit: { minScale: 0, maxScale: 1 } }
        : block.figureInputs;

    const node = createItemNode(pageItem);

    // Store figure source metadata by ID
    if (block.type === "figure" && block.source) {
      sourceMap.set(node.id, block.source);
    }

    return node;
  });

  // Optimize layout
  const rc = createCanvasRenderContextBrowser();
  const bounds = new RectCoordsDims([0, 0, 1920, 1080]);

  const optimized = optimizePageLayout(
    rc,
    bounds,
    itemNodes.map((n) => n.data),
    slideDeckStyle,
    undefined,
    undefined  // No constraint - let optimizer decide
  );

  // Restore metadata into optimized layout
  const layoutWithMeta = restoreMetadata(optimized.layout, sourceMap);

  return {
    type: "content",
    heading: slideInput.heading,
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

    const contentBlock: ContentBlock = isText
      ? { type: "text", markdown: pageItem.markdown }
      : { type: "figure", figureInputs: pageItem as any, source };

    return { type: "item", id: node.id, data: contentBlock };
  }

  // Rows/cols - recurse
  return {
    type: node.type,
    id: node.id,
    children: node.children.map((child) => restoreMetadata(child, sourceMap)),
  };
}
