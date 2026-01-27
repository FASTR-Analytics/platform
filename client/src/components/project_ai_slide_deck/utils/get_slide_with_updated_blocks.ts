import type { Slide, ContentBlock, AiContentBlockInput } from "lib";
import type { LayoutNode } from "panther";
import { resolveFigureFromVisualization } from "./resolve_figure_from_visualization";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";

export async function getSlideWithUpdatedBlocks(
  projectId: string,
  currentSlide: Slide,
  updates: Array<{ blockId: string; newContent: AiContentBlockInput }>
): Promise<Slide> {
  if (currentSlide.type !== "content") {
    throw new Error("Can only update blocks on content slides");
  }

  // Build update map with resolved content
  const updateMap = new Map<string, ContentBlock>();

  for (const update of updates) {
    if (update.newContent.type === "text") {
      updateMap.set(update.blockId, update.newContent);
    } else if (update.newContent.type === "from_visualization") {
      try {
        const figureBlock = await resolveFigureFromVisualization(projectId, update.newContent);
        updateMap.set(update.blockId, figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to resolve visualization "${update.newContent.visualizationId}"${
            update.newContent.replicant ? ` with replicant "${update.newContent.replicant}"` : ''
          }. Check that the visualization exists and the replicant is valid. Original error: ${errMsg}`
        );
      }
    } else if (update.newContent.type === "from_metric") {
      try {
        const figureBlock = await resolveFigureFromMetric(projectId, update.newContent);
        updateMap.set(update.blockId, figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to create figure from metric "${update.newContent.metricQuery.metricId}". Check that the metric exists and parameters are valid. Original error: ${errMsg}`
        );
      }
    } else {
      throw new Error("Custom figures not yet supported");
    }
  }

  // Walk layout tree and apply updates
  function updateLayoutNode(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
    if (node.type === "item") {
      const updatedBlock = updateMap.get(node.id);
      return {
        type: "item",
        id: node.id,
        data: updatedBlock || node.data,
      };
    }

    // Rows/cols - recurse
    return {
      type: node.type,
      id: node.id,
      children: node.children.map(updateLayoutNode),
    };
  }

  return {
    ...currentSlide,
    layout: updateLayoutNode(currentSlide.layout),
  };
}
