import type {
  ContentSlide,
  CoverSlide,
  MetricWithStatus,
  SectionSlide,
  Slide,
  SlideDeckConfig,
} from "lib";
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
import {
  describeSlideOverflow,
  measureSlideOverflow,
} from "./measure_slide_overflow.ts";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";

// A slide's own settings as stored; a content slide's layout is replaced by
// its blocks and their arrangement. A content slide's `page` comes first so
// that whether it overflows the page is read before its blocks.
export type SimplifiedSlide =
  | CoverSlide
  | SectionSlide
  | { page: string } & Omit<ContentSlide, "layout"> & {
    blocks: Array<{ id: string; summary: string }>;
    _layout: { description: string; structure: LayoutStructure | null };
  };

export async function simplifySlideForAI(
  env: ClientAIToolEnv,
  slideId: string,
  slide: Slide,
  metrics: MetricWithStatus[],
  deckConfig: SlideDeckConfig,
): Promise<SimplifiedSlide> {
  if (slide.type === "cover" || slide.type === "section") return slide;

  const { layout, ...settings } = slide;
  const blocks = extractBlocksFromLayout(layout);
  const [simplifiedBlocks, overflow] = await Promise.all([
    Promise.all(blocks.map(async ({ id, block }) => {
      if (block.type === "text") {
        const background = block.style?.textBackground;
        return {
          id,
          summary: background
            ? `Text (textBackground: ${background}): ${block.markdown}`
            : `Text: ${block.markdown}`,
        };
      } else if (block.type === "image") {
        return {
          id,
          summary: `Image: ${
            JSON.stringify({ imgFile: block.imgFile, style: block.style })
          }`,
        };
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
    page: describeSlideOverflow(slideId, overflow),
    ...settings,
    blocks: simplifiedBlocks,
    _layout: layoutNodeToStructure(layout),
  };
}
