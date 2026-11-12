import type { ContentSlide, FigureBundle, MetricWithStatus, Slide } from "lib";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import {
  formatFigureConfigForAI,
  readFigureMetricForAI,
} from "../../_shared/mod.ts";
import {
  describeSlideBlocks,
  extractBlocksFromLayout,
} from "../../slide_ai/mod.ts";

export function figureBlockIds(slide: Slide): string[] {
  return slide.type === "content"
    ? extractBlocksFromLayout(slide.layout)
      .filter(({ block }) => block.type === "figure")
      .map(({ id }) => id)
    : [];
}

// Text blocks autofit, so a page that overflows overflows on its figures: they
// are both the cause named and the fix offered. A fit is said as plainly, so a
// model that just applied the fix is told it worked.
function describePageFit(slide: ContentSlide, overflow: boolean): string {
  if (!overflow) return "Page: the layout fits the page.";
  const sentence = "Page: the layout overflows the page.";
  const figureIds = figureBlockIds(slide);
  if (figureIds.length === 0) return sentence;
  return `${sentence} Figure block(s) ${
    figureIds.join(", ")
  }: filter the indicator dimension to the indicators this slide names, or choose a preset with fewer rows, then update_figure.`;
}

async function describeBuiltFigure(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
  blockId: string,
  bundle: FigureBundle,
): Promise<string> {
  const { lines, metric, config } = readFigureMetricForAI(metrics, bundle);
  return [
    `Figure ${blockId}:`,
    ...lines,
    await formatFigureConfigForAI(env, metric, config, bundle.dateRange),
  ].join("\n");
}

// The contract is PROTOCOL_APP_AI_TOOLS.md "The round budget".
//
// Called BEFORE the write, and the function it returns after it, with the
// sentence: formatting a figure's config reads the package, and a throw once
// the write has landed would report a landed write as failed.
export async function prepareSlideWriteResult(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
  slide: Slide,
  overflow: boolean,
  builtFigureIds: readonly string[],
): Promise<(done: string) => string> {
  if (slide.type !== "content") return (done) => done;
  const figures = await Promise.all(
    extractBlocksFromLayout(slide.layout).flatMap(({ id, block }) =>
      builtFigureIds.includes(id) && block.type === "figure" && block.bundle
        ? [describeBuiltFigure(env, metrics, id, block.bundle)]
        : []
    ),
  );
  const left = [
    ...describeSlideBlocks(slide.layout),
    describePageFit(slide, overflow),
    ...figures,
  ];
  return (done) => [done, ...left].join("\n");
}
