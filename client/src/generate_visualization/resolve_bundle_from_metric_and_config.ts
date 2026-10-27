import type {
  DatasetType,
  FigureBundle,
  MetricWithStatus,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import { getFetchConfigFromPresentationObjectConfig, t3 } from "lib";
import { AIToolFailure } from "panther";
import { unwrap } from "solid-js/store";
import { assertReplicantValid } from "./assert_replicant_valid";
import { buildFigureInputs } from "./build_figure_inputs";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import {
  makeFigureBundleFromFetchedData,
  resolveFigureBundleFromMetric,
} from "./resolve_figure_from_metric";
import {
  geoJsonFamilyFor,
  getGeoJsonSync,
  preloadGeoJson,
} from "~/state/instance/t2_geojson";
import { getSnapshotInstanceState } from "~/state/instance/t1_store";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/products/t2_figure_data";

// Unified figure resolver: given a metric + a full config, validate the
// replicant (strict, throw with the valid-value list, matching the from_metric
// policy), then re-query items and build a FigureBundle stamped with the pair
// it resolved under. Slide-agnostic: used by the from_metric create path and
// the update_figure edit path. Re-resolution keys off the metric (the bundle
// stores `metricId`), never the source viz.
//
// `scope` is the container's pair. It is undefined only when the container
// has no package to resolve under, which is an AI-facing failure like an
// unready metric, so it is refused here rather than at every AI call site.
export async function resolveBundleFromMetricAndConfig(
  scope: PackageScope | undefined,
  metric: MetricWithStatus,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  if (scope === undefined) {
    throw new AIToolFailure("No results package to resolve under");
  }

  // AI tool handlers pass live Solid store objects (the metrics store, preset
  // configs), and everything below reads this metric and config as plain data.
  // Why a proxy or a symbol-branded object is not plain data, and why unwrap()
  // alone is not enough: "A bundle owns its data" in SYSTEM_10.
  metric = structuredClone(unwrap(metric));
  config = structuredClone(unwrap(config));

  if (metric.status !== "ready") {
    throw new AIToolFailure(
      `Metric "${metric.id}" is not ready (status: ${metric.status})`,
    );
  }

  const resFetch = getFetchConfigFromPresentationObjectConfig(metric, config);
  if (!resFetch.success) {
    // Currently unreachable (the callee throws instead of returning
    // {success:false}): converted anyway, forward-safe. Its LIVE plain-Error
    // surface is get_fetch_config_from_po.ts:47 (missing timeseriesGrouping),
    // which is lib/ code shared with human renders and stays plain Error; the
    // AI tools pre-flight that case before reaching here.
    throw new AIToolFailure(resFetch.err);
  }

  // Strict replicant validation (shared with the from_visualization AI path).
  await assertReplicantValid(scope, metric, config);
  await assertMapBoundariesAvailable(metric.datasetFamily, config);

  const bundle = await resolveFigureBundleFromMetric(
    scope,
    {
      metricId: metric.id,
      resultsObjectId: metric.resultsObjectId,
      resultsValueForViz: {
        formatAs: metric.formatAs,
        valueProps: metric.valueProps,
        valueLabelReplacements: metric.valueLabelReplacements,
      },
      datasetFamily: metric.datasetFamily,
      fetchConfig: resFetch.data,
    },
    config,
  );
  assertBundleRenders(bundle);
  return bundle;
}

// A map draws the boundary file the instance holds for the figure's registry
// at the figure's level. The sync cache is empty until the preload lands, so
// the instance's map list decides, and a listed file is awaited into the
// cache so the bundle embeds its geometry.
async function assertMapBoundariesAvailable(
  datasetFamily: DatasetType | undefined,
  config: PresentationObjectConfig,
): Promise<void> {
  const level = getAdminAreaLevelFromMapConfig(config);
  if (level === undefined) return;
  const family = geoJsonFamilyFor(datasetFamily);
  const maps = getSnapshotInstanceState().geojsonMaps.filter((m) =>
    m.family === family
  );
  const map = maps.find((m) => m.adminAreaLevel === level);
  const registry = family.toUpperCase();
  if (map === undefined) {
    const levels = maps
      .map((m) => m.adminAreaLevel)
      .toSorted((a, b) => a - b)
      .map((l) => `admin_area_${l}`);
    throw new AIToolFailure(
      `No boundary map file is uploaded for the ${registry} registry at admin_area_${level}, so this map cannot render. ` +
        (levels.length > 0
          ? `Map files exist at ${
            levels.join(", ")
          }: use one of those levels, or a table.`
          : "This registry has no map files: use a table."),
    );
  }
  await preloadGeoJson([map]);
  if (getGeoJsonSync(family, level) === undefined) {
    throw new AIToolFailure(
      `The ${registry} boundary map at admin_area_${level} could not be loaded, so this map cannot render.`,
    );
  }
}

// The renderer's own derivation, run before the commit: a bundle it rejects
// would otherwise be stored, shown as "could not be displayed", and reported
// as a success.
function assertBundleRenders(bundle: FigureBundle): void {
  try {
    buildFigureInputs(bundle);
  } catch (e) {
    throw new AIToolFailure(
      `The figure cannot be rendered: ${
        e instanceof Error ? e.message : String(e)
      } No changes were applied.`,
    );
  }
}

// The human counterpart of the resolver above: a stale figure's "Update to
// <package>" action goes through here. The two differ in exactly one policy:
// the AI path validates the replicant strictly so the model gets the
// valid-value list back, while this path auto-defaults an unset or
// no-longer-valid replicant inside the items read (resolveDefaultReplicant),
// which is the rule for updating a stale figure: a stored replicant value
// missing under the new package is defaulted, never thrown on. It returns a
// reason rather than throwing because its callers show that reason on the
// figure itself.
export type ResolveFigureResult =
  | { ok: true; bundle: FigureBundle }
  | { ok: false; reason: string };

export async function resolveFigureBundleInteractively(
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): Promise<ResolveFigureResult> {
  try {
    const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
      scope,
      metric,
      config,
    );
    if (!itemsRes.success) {
      return { ok: false, reason: itemsRes.err };
    }
    const ih = itemsRes.data.ih;
    if (ih.status === "too_many_items") {
      return {
        ok: false,
        reason: t3({
          en:
            "This visualization asks for too many data points under the current package, scope and filters. Narrow its filters or disaggregations.",
          fr:
            "Cette visualisation demande trop de points de données avec le paquet, la portée et les filtres actuels. Réduisez ses filtres ou ses désagrégations.",
          pt:
            "Esta visualização pede demasiados pontos de dados com o pacote, âmbito e filtros atuais. Reduza os seus filtros ou desagregações.",
        }),
      };
    }
    if (ih.status !== "ok") {
      return {
        ok: false,
        reason: t3({
          en:
            "No data available for this visualization with the current package, scope and filters.",
          fr:
            "Aucune donnée disponible pour cette visualisation avec le paquet, la portée et les filtres actuels.",
          pt:
            "Não há dados disponíveis para esta visualização com o pacote, âmbito e filtros atuais.",
        }),
      };
    }
    return {
      ok: true,
      // The effective config, not the one passed in: it carries the replicant
      // the read auto-defaulted to, so the bundle and its data agree.
      bundle: makeFigureBundleFromFetchedData(scope, {
        resultsValue: metric,
        effectiveConfig: itemsRes.data.config,
        ih,
      }),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
