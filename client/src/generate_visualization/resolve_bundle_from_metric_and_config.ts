import type {
  FigureBundle,
  ItemsHolderPresentationObject,
  MetricWithStatus,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import { getFetchConfigFromPresentationObjectConfig, t3 } from "lib";
import { AIToolFailure } from "panther";
import { unwrap } from "solid-js/store";
import { assertReplicantValid } from "./assert_replicant_valid";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { resolveFigureBundleFromMetric } from "./resolve_figure_from_metric";
import { geoJsonFamilyFor, getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getSnapshotInstanceLocalization } from "~/state/instance/t1_store";
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/project/t2_presentation_objects";

// Unified figure resolver: given a metric + a full config, validate the
// replicant (strict, throw with the valid-value list, matching the from_metric
// policy), then re-query items and build a FigureBundle stamped with the pair
// it resolved under. Slide-agnostic: used by the from_metric create path and
// the update_figure edit path. Re-resolution keys off the metric (the bundle
// stores `metricId`), never the source viz.
//
// `scope` is the container's pair. It is undefined only when the project has
// no package to resolve under, which is an AI-facing failure like an unready
// metric, so it is refused here rather than at every AI call site.
export async function resolveBundleFromMetricAndConfig(
  projectId: string,
  scope: PackageScope | undefined,
  metric: MetricWithStatus,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  if (scope === undefined) {
    throw new AIToolFailure("No results package is attached to this project");
  }

  // AI tool handlers pass live Solid store objects (the metrics store, preset
  // configs). Deep-copy to plain data first: Solid stamps symbol keys onto the
  // raw targets, which zod's record parsing surfaces via Reflect.ownKeys and
  // then crashes formatting ("Cannot convert a Symbol value to a string"):
  // unwrap() alone is not enough, the raw objects keep the symbol keys. A
  // bundle destined for storage must also not alias live store objects.
  metric = structuredClone(unwrap(metric));
  config = structuredClone(unwrap(config));

  if (metric.status !== "ready") {
    throw new AIToolFailure(`Metric "${metric.id}" is not ready (status: ${metric.status})`);
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
  await assertReplicantValid(projectId, metric, config);

  return resolveFigureBundleFromMetric(
    projectId,
    scope,
    {
      metricId: metric.id,
      resultsObjectId: metric.resultsObjectId,
      mostGranularTimePeriodColumnInResultsFile: metric.mostGranularTimePeriodColumnInResultsFile,
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
}

// The human counterpart of the resolver above: the D4 "Update to <package>"
// action goes through here. The two differ in exactly one policy: the AI path
// validates the replicant strictly so the model gets the valid-value list
// back, while this path auto-defaults an unset or no-longer-valid replicant
// inside the items read (resolveDefaultReplicant), which D4 makes the rule
// for updating a stale figure: a stored replicant value missing under the new
// package is defaulted, never thrown on. It returns a reason rather than
// throwing because its callers show that reason on the figure itself.
export type ResolveFigureResult =
  | { ok: true; bundle: FigureBundle }
  | { ok: false; reason: string };

export async function resolveFigureBundleInteractively(
  projectId: string,
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): Promise<ResolveFigureResult> {
  try {
    const itemsRes = await getPresentationObjectItemsFromCacheOrFetch(
      projectId,
      { projectId, resultsValue: metric },
      config,
    );
    if (!itemsRes.success) {
      return { ok: false, reason: itemsRes.err };
    }
    const ih = itemsRes.data.ih;
    if (ih.status !== "ok") {
      return {
        ok: false,
        reason: t3({
          en: "No data available for this figure with the current package, scope and filters.",
          fr: "Aucune donnée disponible pour cette figure avec le package, la portée et les filtres actuels.",
          pt: "Não há dados disponíveis para esta figura com o pacote, âmbito e filtros atuais.",
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

// Non-fetch bundle assembly for callers that already hold fetched items (the
// embedded editor's live preview and coherent-bundle push, the editors' apply
// paths, the preset gallery). `scope` is the pair those items were fetched
// under, passed by the caller rather than read from any ambient store.
export type FetchedPOData = {
  resultsValue: Pick<
    ResultsValue,
    "id" | "formatAs" | "valueProps" | "valueLabelReplacements" | "datasetFamily"
  >;
  ih: Extract<ItemsHolderPresentationObject, { status: "ok" }>;
  effectiveConfig: PresentationObjectConfig;
};

export function makeFigureBundleFromFetchedData(
  scope: PackageScope,
  data: FetchedPOData,
): FigureBundle {
  const { resultsValue, ih, effectiveConfig } = data;
  const mapLevel = getAdminAreaLevelFromMapConfig(effectiveConfig);
  const geoFamily = geoJsonFamilyFor(resultsValue.datasetFamily);
  const geoJson = mapLevel ? getGeoJsonSync(geoFamily, mapLevel) : undefined;
  return {
    config: effectiveConfig,
    items: ih.items,
    resultsValue: {
      formatAs: resultsValue.formatAs,
      valueProps: resultsValue.valueProps,
      valueLabelReplacements: resultsValue.valueLabelReplacements,
    },
    indicatorMetadata: ih.indicatorMetadata,
    dateRange: ih.dateRange,
    geo: mapLevel
      ? (geoJson
        ? { kind: "data" as const, data: geoJson }
        : { kind: "level" as const, level: mapLevel, family: geoFamily })
      : undefined,
    localization: getSnapshotInstanceLocalization(),
    metricId: resultsValue.id,
    scope: { adminArea2: scope.adminArea2 },
    snapshotAt: new Date().toISOString(),
    provenance: { runId: scope.runId },
  };
}
