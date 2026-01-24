import type { FigureInputs, FigureMap } from "panther";
import { getPOFigureInputsFromCacheOrFetch } from "~/state/po_cache";
import type { ExtractedFigure } from "./extract_figure_ids";

export async function buildFigureMapForExport(
  projectId: string,
  figures: ExtractedFigure[],
): Promise<FigureMap> {
  const figureMap: FigureMap = new Map();

  await Promise.all(
    figures.map(async (fig) => {
      // Build replicant override if suffix was provided
      const replicateOverride = fig.replicantValue
        ? { selectedReplicantValue: fig.replicantValue }
        : undefined;

      const result = await getPOFigureInputsFromCacheOrFetch(
        projectId,
        fig.uuid,
        replicateOverride,
      );

      if (result.success && result.data) {
        const figureWithScale = resetFigureScale(result.data);
        // Store with both prefixed and bare keys using fullRef (includes :suffix if present)
        figureMap.set(`figure://${fig.fullRef}`, figureWithScale);
        figureMap.set(fig.fullRef, figureWithScale);
      }
    }),
  );

  return figureMap;
}

function resetFigureScale(figure: FigureInputs): FigureInputs {
  return {
    ...figure,
    style: {
      ...figure.style,
      scale: 0.75,
    },
  };
}
