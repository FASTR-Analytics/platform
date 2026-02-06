import { createItemNode, type PageInputs, type PageContentItem, type ItemLayoutNode } from "panther";
import { FIGURE_AUTOFIT, MAX_CONTENT_BLOCKS, MARKDOWN_AUTOFIT, type AiContentBlockInput, type AiContentSlideInput, type MetricWithStatus } from "lib";
import { getMetricStaticData } from "lib";
import { slideDeckStyle } from "../slide_deck/utils/convert_slide_to_page_inputs";
import { resolveFigureFromMetric } from "../slide_deck/utils/resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "../slide_deck/utils/resolve_figure_from_visualization";
import { getStyleFromPresentationObject } from "~/generate_visualization/get_style_from_po";

// Async: resolves figures from server, returns PageInputs ready for rendering
export async function convertWhiteboardInputToPageInputs(
  projectId: string,
  input: AiContentSlideInput,
  metrics: MetricWithStatus[],
): Promise<PageInputs> {
  const items: ItemLayoutNode<PageContentItem>[] = [];

  // ==========================================================================
  // TODO: TEMPORARY WORKAROUND - The panther optimizer only supports 4 items
  // max. We limit to MAX_CONTENT_BLOCKS for better layouts. The tool handler
  // should reject requests with too many blocks before reaching here, but this
  // is a safety fallback.
  // Better solution: Use layoutType: "explicit" with auto-generated layout.
  // ==========================================================================
  let blocksToProcess = input.blocks;
  if (input.blocks.length > MAX_CONTENT_BLOCKS) {
    console.warn(
      `[convert_whiteboard_input] Optimizer only supports ${MAX_CONTENT_BLOCKS} items, ` +
      `but received ${input.blocks.length}. Truncating to first ${MAX_CONTENT_BLOCKS} blocks.`
    );
    blocksToProcess = input.blocks.slice(0, MAX_CONTENT_BLOCKS);
  }

  for (const block of blocksToProcess) {
    const pageItem = await resolveBlockToPageContentItem(projectId, block, metrics);
    if (pageItem) {
      items.push(createItemNode(pageItem));
    }
  }

  return {
    type: "freeform",
    header: input.heading,
    content: {
      layoutType: "optimize",
      items,
    },
    style: slideDeckStyle,
  };
}

async function resolveBlockToPageContentItem(
  projectId: string,
  block: AiContentBlockInput,
  metrics: MetricWithStatus[],
): Promise<PageContentItem | null> {
  if (block.type === "text") {
    return {
      markdown: block.markdown,
      autofit: MARKDOWN_AUTOFIT,
      style: {
        text: {
          base: { fontSize: 60 },
        },
      },
    };
  }

  if (block.type === "from_visualization") {
    const figureBlock = await resolveFigureFromVisualization(projectId, block);
    if (figureBlock.source?.type === "from_data") {
      const { formatAs } = getMetricStaticData(figureBlock.source.metricId);
      const style = getStyleFromPresentationObject(figureBlock.source.config, formatAs);
      return { ...figureBlock.figureInputs, autofit: FIGURE_AUTOFIT, style };
    }
    return { ...figureBlock.figureInputs, autofit: FIGURE_AUTOFIT };
  }

  if (block.type === "from_metric") {
    const figureBlock = await resolveFigureFromMetric(projectId, block, metrics);
    if (figureBlock.source?.type === "from_data") {
      const { formatAs } = getMetricStaticData(figureBlock.source.metricId);
      const style = getStyleFromPresentationObject(figureBlock.source.config, formatAs);
      return { ...figureBlock.figureInputs, autofit: FIGURE_AUTOFIT, style };
    }
    return { ...figureBlock.figureInputs, autofit: FIGURE_AUTOFIT };
  }

  // if (block.type === "custom") {
    throw new Error("Bad input figure type");
  // }

}
