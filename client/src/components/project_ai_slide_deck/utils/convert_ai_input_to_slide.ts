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
import { generateUniqueBlockId } from "~/utils/id_generation";

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
        const figureBlock = await resolveFigureFromMetric(projectId, block);
        resolvedBlocks.push(figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to create figure from metric "${block.metricId}". Check that the metric exists and parameters are valid. Original error: ${errMsg}`
        );
      }
    } else if (block.type === "custom") {
      throw new Error("custom figure type not yet implemented");
    }
  }

  // Extract PageContentItems and build ID → source map
  const sourceMap = new Map<string, FigureSource>();
  const itemNodes = resolvedBlocks.map((block) => {
    let pageItem: PageContentItem;
    if (block.type === "text") {
      pageItem = { markdown: block.markdown, autofit: { minScale: 0, maxScale: 1 } };
    } else if (block.type === "placeholder") {
      pageItem = { spacer: true };
    } else {
      pageItem = block.figureInputs;
    }

    const node = createItemNode(pageItem);

    // Override panther UUID with short ID
    const shortId = generateUniqueBlockId();
    const nodeWithShortId = { ...node, id: shortId };

    // Store figure source metadata by short ID
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
    itemNodes.map((n) => n.data),
    slideDeckStyle,
    undefined,
    undefined  // No constraint - let optimizer decide
  );

  // Reassign short IDs to optimized layout (optimizer creates new row/col nodes with UUIDs)
  const layoutWithShortIds = reassignLayoutIds(optimized.layout, sourceMap);

  // Restore metadata into layout
  const layoutWithMeta = restoreMetadata(layoutWithShortIds, sourceMap);

  return {
    type: "content",
    heading: slideInput.heading,
    layout: layoutWithMeta,
  };
}

/**
 * Reassign short IDs to all nodes in layout tree (after optimization creates UUID nodes)
 */
function reassignLayoutIds(
  node: LayoutNode<PageContentItem>,
  sourceMap: Map<string, FigureSource>
): LayoutNode<PageContentItem> {
  const oldId = node.id;
  const newId = generateUniqueBlockId();

  // Transfer source metadata from old to new ID
  const source = sourceMap.get(oldId);
  if (source) {
    sourceMap.delete(oldId);
    sourceMap.set(newId, source);
  }

  if (node.type === "item") {
    return { ...node, id: newId };
  }

  return {
    ...node,
    id: newId,
    children: node.children.map((child) => reassignLayoutIds(child, sourceMap)),
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
