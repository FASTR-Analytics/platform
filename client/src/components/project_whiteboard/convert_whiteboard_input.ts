import { createItemNode, type PageInputs, type PageContentItem, type ItemLayoutNode } from "panther";
import type { AiContentSlideInput } from "lib";
import { getMetricStaticData } from "lib";
import { slideDeckStyle } from "../project_ai_slide_deck/utils/convert_slide_to_page_inputs";
import { resolveFigureFromMetric } from "../project_ai_slide_deck/utils/resolve_figure_from_metric";
import { resolveFigureFromVisualization } from "../project_ai_slide_deck/utils/resolve_figure_from_visualization";
import { getStyleFromPresentationObject } from "~/generate_visualization/get_style_from_po";

// Async: resolves figures from server, returns PageInputs ready for rendering
export async function convertWhiteboardInputToPageInputs(
  projectId: string,
  input: AiContentSlideInput
): Promise<PageInputs> {
  const items: ItemLayoutNode<PageContentItem>[] = [];

  for (const block of input.blocks) {
    const pageItem = await resolveBlockToPageContentItem(projectId, block);
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
  block: AiContentSlideInput["blocks"][number]
): Promise<PageContentItem | null> {
  if (block.type === "text") {
    return {
      markdown: block.markdown,
      autofit: { minScale: 0, maxScale: 1 },
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
      return { ...figureBlock.figureInputs, style };
    }
    return figureBlock.figureInputs;
  }

  if (block.type === "from_metric") {
    const figureBlock = await resolveFigureFromMetric(projectId, block);
    if (figureBlock.source?.type === "from_data") {
      const { formatAs } = getMetricStaticData(figureBlock.source.metricId);
      const style = getStyleFromPresentationObject(figureBlock.source.config, formatAs);
      return { ...figureBlock.figureInputs, style };
    }
    return figureBlock.figureInputs;
  }

  if (block.type === "custom") {
    throw new Error("custom figure type not yet implemented");
  }

  return null;
}
