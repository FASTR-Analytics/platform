import {
  t3,
  type PackageScope,
  type PresentationObjectConfig,
  type ResultsValue,
} from "lib";
import type { FigureInputs, StateHolder } from "panther";
import { createEffect, createSignal, type Accessor } from "solid-js";
import {
  buildFigureInputs,
  makeFigureBundleFromFetchedData,
} from "~/generate_visualization/mod";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/products/t2_figure_data";

// The one fetch-and-build path for a figure that is not a row (D6): a preset
// in the insert-figure wizard, a default visualization on the package page.
// It reads through the scope-keyed items cache, so the same (pair, metric,
// config) seen on any surface is one cache entry.
export async function fetchFigureInputs(
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): Promise<StateHolder<FigureInputs>> {
  const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(scope, metric, config);
  if (!itemsRes.success) {
    return { status: "error", err: itemsRes.err };
  }
  const { ih, config: effectiveConfig } = itemsRes.data;
  if (ih.status !== "ok") {
    return {
      status: "error",
      err:
        ih.status === "too_many_items"
          ? t3({
              en: "Too many data points",
              fr: "Trop de points de données",
              pt: "Demasiados pontos de dados",
            })
          : t3({
              en: "No data available",
              fr: "Aucune donnée disponible",
              pt: "Nenhum dado disponível",
            }),
    };
  }

  try {
    const bundle = makeFigureBundleFromFetchedData(scope, {
      resultsValue: metric,
      ih,
      effectiveConfig,
    });
    return { status: "ready", data: buildFigureInputs(bundle) };
  } catch (e) {
    return {
      status: "error",
      err: e instanceof Error ? e.message : "Render error",
    };
  }
}

export type FigurePreviewSource = {
  scope: PackageScope;
  metric: ResultsValue;
  config: PresentationObjectConfig;
};

// Tracks the source and refetches on any change; a superseded fetch is
// dropped by the version counter so a fast scope switch never paints stale.
export function createFigurePreview(
  source: () => FigurePreviewSource,
): Accessor<StateHolder<FigureInputs>> {
  const [state, setState] = createSignal<StateHolder<FigureInputs>>({
    status: "loading",
  });
  let version = 0;

  createEffect(() => {
    const { scope, metric, config } = source();
    const thisVersion = ++version;
    setState({ status: "loading" });

    fetchFigureInputs(scope, metric, config).then(
      (result) => {
        if (version === thisVersion) setState(result);
      },
      (err) => {
        if (version === thisVersion) {
          setState({
            status: "error",
            err: err instanceof Error ? err.message : "Error",
          });
        }
      },
    );
  });

  return state;
}
