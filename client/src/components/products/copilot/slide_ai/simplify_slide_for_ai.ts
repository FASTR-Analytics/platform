import type { MetricWithStatus, Slide, SlideDeckConfig } from "lib";
import { getDataFromConfig } from "lib";
import {
  formatFigureConfigForAI,
  readFigureMetricForAI,
} from "../_shared/mod.ts";
import {
  extractBlocksFromLayout,
  layoutNodeToStructure,
  type LayoutStructure,
} from "./layout_structure.ts";
import { measureSlideOverflow } from "./measure_slide_overflow.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";

export type SimplifiedSlide =
  | {
    type: "cover";
    title?: string;
    subtitle?: string;
    presenter?: string;
    date?: string;
  }
  | { type: "section"; sectionTitle: string; sectionSubtitle?: string }
  | {
    type: "content";
    header?: string;
    blocks: Array<{ id: string; summary: string }>;
    _layout: { description: string; structure: LayoutStructure | null };
    // Whether the layout overflows its page, as the deck's canvas badges it.
    overflow: boolean;
  };

export async function simplifySlideForAI(
  env: ClientAIToolEnv,
  slide: Slide,
  metrics: MetricWithStatus[],
  deckConfig: SlideDeckConfig,
): Promise<SimplifiedSlide> {
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
  const [simplifiedBlocks, overflow] = await Promise.all([
    Promise.all(blocks.map(async ({ id, block }) => {
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
          const { lines, metric, config } = readFigureMetricForAI(
            metrics,
            bundle,
          );
          const metricId = metric?.id ?? bundle.metricId;
          let cfg: string;
          try {
            cfg = await formatFigureConfigForAI(
              env,
              metric,
              config,
              bundle.dateRange,
            );
          } catch (err) {
            cfg =
              `Figure (metric: ${metricId}, type: ${config.d.type}) — config unavailable: ${err}`;
          }
          let data: string;
          try {
            data = await getDataFromConfig(
              env,
              metricId,
              metrics,
              config,
            );
          } catch (err) {
            data = `(data unavailable: ${err})`;
          }
          return {
            id,
            summary: ["Figure", ...lines, cfg, "", data].join("\n"),
          };
        } else {
          return { id, summary: "Figure (no data)" };
        }
      }
    })),
    measureSlideOverflow(slide, deckConfig),
  ]);

  return {
    type: "content",
    header: slide.header,
    blocks: simplifiedBlocks,
    _layout: layoutNodeToStructure(slide.layout),
    overflow,
  };
}
