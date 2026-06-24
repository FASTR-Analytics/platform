import type { Slide, ContentBlock, AiContentBlockInput, MetricWithStatus } from "lib";
import type { LayoutNode } from "panther";
import { resolveFigureFromVisualization } from "./resolve_figure_from_visualization";
import { resolveFigureFromMetric } from "./resolve_figure_from_metric";

export async function getSlideWithUpdatedBlocks(
  projectId: string,
  currentSlide: Slide,
  updates: Array<{ blockId: string; newContent: AiContentBlockInput }>,
  metrics: MetricWithStatus[],
): Promise<Slide> {
  if (currentSlide.type !== "content") {
    throw new Error("Can only update blocks on content slides");
  }

  // Validate block IDs exist in layout
  function collectItemIds(node: LayoutNode<ContentBlock>): string[] {
    if (node.type === "item") return [node.id];
    return node.children.flatMap(collectItemIds);
  }
  const layoutIds = collectItemIds(currentSlide.layout);
  const unknownIds = updates.filter(u => !layoutIds.includes(u.blockId)).map(u => u.blockId);
  if (unknownIds.length > 0) {
    throw new Error(`Block ID(s) not found in slide: ${unknownIds.join(", ")}. Available block IDs: ${layoutIds.join(", ")}. Use get_slide to see current block IDs.`);
  }

  // Existing blocks by id, so an edit preserves fields the AI's input schema
  // cannot express — e.g. a text block's user-set style. Without this, the
  // whole-block replace below silently drops textSize/textBackground on every
  // text edit.
  const existingById = new Map<string, ContentBlock>();
  function collectBlocks(node: LayoutNode<ContentBlock>): void {
    if (node.type === "item") {
      existingById.set(node.id, node.data);
      return;
    }
    node.children.forEach(collectBlocks);
  }
  collectBlocks(currentSlide.layout);

  // Build update map with resolved content
  const updateMap = new Map<string, ContentBlock>();

  for (const update of updates) {
    if (update.newContent.type === "text") {
      const existing = existingById.get(update.blockId);
      const style = existing?.type === "text" ? existing.style : undefined;
      updateMap.set(
        update.blockId,
        style ? { ...update.newContent, style } : update.newContent,
      );
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
        const figureBlock = await resolveFigureFromMetric(projectId, update.newContent, metrics);
        updateMap.set(update.blockId, figureBlock);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Failed to create figure from metric "${update.newContent.metricId}" with preset "${update.newContent.vizPresetId}": ${errMsg}`
        );
      }
    } else {
      throw new Error("Custom figures not yet supported");
    }
  }

  // Walk layout tree and apply updates. Spread-and-override so node-level
  // overrides (style, alignV, minH, maxH) survive — reconstructing from a fixed
  // field list would silently drop them.
  function updateLayoutNode(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
    if (node.type === "item") {
      const updatedBlock = updateMap.get(node.id);
      return updatedBlock ? { ...node, data: updatedBlock } : node;
    }
    return { ...node, children: node.children.map(updateLayoutNode) };
  }

  return {
    ...currentSlide,
    layout: updateLayoutNode(currentSlide.layout),
  };
}
