import { periodFilterHasBounds, inferPeriodFormatFromValue, type ContentBlock, type MetricWithStatus, type Slide } from "lib";
import type { LayoutNode } from "panther";
import { getDataFromConfig } from "~/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai";
import { formatFigureConfigForAI } from "~/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai";
import { layoutNodeToStructure, type LayoutStructure } from "./layout_spec_helpers";

export type BlockWithId = {
  id: string;
  block: ContentBlock;
};

export function extractBlocksFromLayout(
  layout: LayoutNode<ContentBlock>
): BlockWithId[] {
  const blocks: BlockWithId[] = [];

  function traverse(node: LayoutNode<ContentBlock>) {
    if (node.type === "item") {
      blocks.push({
        id: node.id,
        block: node.data,
      });
    } else {
      // Rows or cols - recurse
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(layout);
  return blocks;
}

export type SimplifiedSlide =
  | { type: "cover"; title?: string; subtitle?: string; presenter?: string; date?: string }
  | { type: "section"; sectionTitle: string; sectionSubtitle?: string }
  | {
      type: "content";
      header?: string;
      blocks: Array<{ id: string; summary: string }>;
      _layout: { description: string; structure: LayoutStructure | null };
    };

export async function simplifySlideForAI(projectId: string, slide: Slide, metrics?: MetricWithStatus[]): Promise<SimplifiedSlide> {
  if (slide.type === "cover") {
    return {
      type: "cover",
      title: slide.title,
      subtitle: slide.subtitle,
      presenter: slide.presenter,
      date: slide.date,
    };
  }

  if (slide.type === "section") {
    return {
      type: "section",
      sectionTitle: slide.sectionTitle,
      sectionSubtitle: slide.sectionSubtitle,
    };
  }

  // Content slide - extract blocks with IDs and fetch data for figures
  const blocks = extractBlocksFromLayout(slide.layout);
  const simplifiedBlocks = await Promise.all(
    blocks.map(async ({ id, block }) => {
      if (block.type === "text") {
        return {
          id,
          summary: `Text: ${block.markdown}`,
        };
      } else if (block.type === "image") {
        return { id, summary: `Image: ${block.imgFile}` };
      } else {
        // Figure block
        if (block.bundle) {
          const bundle = block.bundle;
          const metric = (metrics ?? []).find((m) => m.id === bundle.metricId);
          let cfg: string;
          try {
            cfg = await formatFigureConfigForAI(projectId, metric, bundle.config);
          } catch (err) {
            cfg = `Figure (metric: ${bundle.metricId}, type: ${bundle.config.d.type}) — config unavailable: ${err}`;
          }
          let data: string;
          try {
            data = await getDataFromConfig(
              projectId,
              bundle.metricId,
              metrics ?? [],
              bundle.config,
            );
          } catch (err) {
            data = `(data unavailable: ${err})`;
          }
          let periodBanner = "";
          const pf = bundle.config.d.periodFilter;
          if (pf && periodFilterHasBounds(pf)) {
            const fmt = inferPeriodFormatFromValue(pf.min) ?? "unknown";
            periodBanner = `⚠️ THIS FIGURE IS FILTERED TO ${fmt} FROM ${pf.min} TO ${pf.max}. Any text describing this figure MUST reference this exact period — not a broader range from get_metric_data.\n\n`;
          }
          return { id, summary: `${periodBanner}Figure\n${cfg}\n\n${data}` };
        } else {
          return { id, summary: "Figure (no data)" };
        }
      }
    })
  );

  return {
    type: "content",
    header: slide.header,
    blocks: simplifiedBlocks,
    _layout: layoutNodeToStructure(slide.layout),
  };
}
