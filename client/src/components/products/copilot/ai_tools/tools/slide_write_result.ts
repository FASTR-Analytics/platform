import type { FigureBundle, MetricWithStatus, Slide } from "lib";
import type { ClientAIToolEnv } from "~/components/instance/copilot/mod.ts";
import {
  formatFigureConfigForAI,
  readFigureMetricForAI,
} from "../../_shared/mod.ts";
import {
  describeSlideBlocks,
  describeSlideOverflow,
  extractBlocksFromLayout,
} from "../../slide_ai/mod.ts";

export function figureBlockIds(slide: Slide): string[] {
  return slide.type === "content"
    ? extractBlocksFromLayout(slide.layout)
      .filter(({ block }) => block.type === "figure")
      .map(({ id }) => id)
    : [];
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
// the write has landed would report a landed write as failed. The slide's ID
// comes with the sentence, since a created slide has none before the write.
export async function prepareSlideWriteResult(
  env: ClientAIToolEnv,
  metrics: MetricWithStatus[],
  slide: Slide,
  overflow: boolean,
  builtFigureIds: readonly string[],
): Promise<(slideId: string, done: string) => string> {
  if (slide.type !== "content") return (_slideId, done) => done;
  const figures = await Promise.all(
    extractBlocksFromLayout(slide.layout).flatMap(({ id, block }) =>
      builtFigureIds.includes(id) && block.type === "figure" && block.bundle
        ? [describeBuiltFigure(env, metrics, id, block.bundle)]
        : []
    ),
  );
  const blocks = describeSlideBlocks(slide.layout);
  return (slideId, done) =>
    [
      done,
      ...blocks,
      describeSlideOverflow(`Slide ${slideId}`, overflow),
      ...figures,
    ].join("\n");
}
