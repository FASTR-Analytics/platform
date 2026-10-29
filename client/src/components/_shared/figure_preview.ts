import {
  type FigureUnavailable,
  type PackageScope,
  type PresentationObjectConfig,
  type ResultsValue,
  t3,
} from "lib";
import type { FigureInputs, StateHolder } from "panther";
import { type Accessor, createEffect, createSignal } from "solid-js";
import {
  buildFigureInputs,
  makeFigureBundleFromFetchedData,
} from "~/generate_visualization/mod";
import { getSnapshotInstanceLocalization } from "~/state/instance/t1_store";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/products/t2_figure_data";

// The one fetch-and-build path for a figure that is not a row: a preset
// in the insert-figure wizard, a preset card on the package page.
// It reads through the scope-keyed items cache, so the same (pair, metric,
// config) seen on any surface is one cache entry.
//
// Every caller previews a figure that does not exist yet, so the transient
// bundle stamps the instance localization: the same one the figure would get
// if the user inserted it (SYSTEM_10's preview == capture rule).
export async function fetchFigureInputs(
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): Promise<StateHolder<FigureInputs>> {
  const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
    scope,
    metric,
    config,
  );
  if (!itemsRes.success) {
    return { status: "error", err: itemsRes.err };
  }
  const { ih, config: effectiveConfig } = itemsRes.data;
  if (ih.status !== "ok") {
    return {
      status: "error",
      err: ih.status === "too_many_items"
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
    const bundle = makeFigureBundleFromFetchedData(
      scope,
      {
        resultsValue: metric,
        ih,
        effectiveConfig,
      },
      getSnapshotInstanceLocalization(),
    );
    const built = buildFigureInputs(bundle);
    return built.ok
      ? { status: "ready", data: built.inputs }
      : { status: "error", err: describeFigureUnavailable(built.unavailable) };
  } catch (e) {
    return {
      status: "error",
      err: e instanceof Error ? e.message : "Render error",
    };
  }
}

// The one wording of each unavailable reason, for every surface that shows one.
export function describeFigureUnavailable(reason: FigureUnavailable): string {
  const registry = reason.family.toUpperCase();
  const level = reason.level;
  if (reason.kind === "boundaries_loading") {
    return t3({
      en: "Loading map boundaries...",
      fr: "Chargement des limites de la carte...",
      pt: "A carregar os limites do mapa...",
    });
  }
  if (reason.source === "package") {
    return t3({
      en:
        `This results package was generated without the ${registry} map files at Admin Area ${level}. Regenerate the package to include them.`,
      fr:
        `Ce paquet de résultats a été généré sans les fichiers de carte ${registry} au niveau d'unité administrative ${level}. Régénérez le paquet pour les inclure.`,
      pt:
        `Este pacote de resultados foi gerado sem os ficheiros de mapa ${registry} ao nível de zona administrativa ${level}. Gere o pacote novamente para os incluir.`,
    });
  }
  return t3({
    en:
      `Map files not yet uploaded for the ${registry} registry at Admin Area ${level}`,
    fr:
      `Fichiers de carte pas encore téléversés pour le registre ${registry} au niveau d'unité administrative ${level}`,
    pt:
      `Ficheiros de mapa ainda não carregados para o registo ${registry} ao nível de zona administrativa ${level}`,
  });
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
