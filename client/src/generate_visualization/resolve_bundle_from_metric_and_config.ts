import type {
  FigureBundle,
  IndicatorMetadata,
  ItemsHolderPresentationObject,
  MetricWithStatus,
  PackageScope,
  PeriodBounds,
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
import { getPresentationObjectItemsFromCacheOrFetch } from "~/state/products/t2_figure_data";

// THE metric-keyed figure resolver (D3): a figure is `{ metricId, config }`
// resolved under its product's PackageScope. Validate the replicant (strict —
// throw with the valid-value list), then re-query items and build a
// FigureBundle stamped with the pair it resolved under.
//
// There is no from-visualization entry point any more: a visualization is not a
// thing you can point at, so every create / edit / update path — the metric
// wizard, a preset, the embedded editor's Apply, the D4 "Update to <package>"
// action, and the AI create/edit tools — comes through here.
export async function resolveBundleFromMetricAndConfig(
  scope: PackageScope,
  metric: MetricWithStatus,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  // AI tool handlers pass live Solid store objects (the authoring context's
  // metrics store, preset configs). Deep-copy to plain data first: Solid stamps
  // symbol keys onto the raw targets, which zod's record parsing surfaces via
  // Reflect.ownKeys and then crashes formatting ("Cannot convert a Symbol value
  // to a string") — unwrap() alone is not enough, the raw objects keep the
  // symbol keys. A bundle destined for storage must also not alias live store
  // objects.
  metric = structuredClone(unwrap(metric));
  config = structuredClone(unwrap(config));

  if (metric.status !== "ready") {
    throw new AIToolFailure(`Metric "${metric.id}" is not ready (status: ${metric.status})`);
  }

  const resFetch = getFetchConfigFromPresentationObjectConfig(metric, config);
  if (!resFetch.success) {
    // Currently unreachable (the callee throws instead of returning
    // {success:false}) — converted anyway, forward-safe. Its LIVE plain-Error
    // surface is get_fetch_config_from_po.ts:47 (missing timeseriesGrouping),
    // which is lib/ code shared with human renders and stays plain Error; the
    // AI tools pre-flight that case before reaching here.
    throw new AIToolFailure(resFetch.err);
  }

  await assertReplicantValid(scope, metric, config);

  return resolveFigureBundleFromMetric(
    scope,
    {
      metricId: metric.id,
      resultsObjectId: metric.resultsObjectId,
      moduleLastRun: "", // matches the current from_metric adapter; provenance is informational
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

// The HUMAN counterpart of the resolver above, and the one every interactive
// figure write goes through: insert, replace, apply-an-edit, and the D4
// "Update to <package>" action.
//
// The two differ in exactly ONE policy, and it is deliberate:
//   • the AI path validates the replicant STRICTLY (assertReplicantValid) so
//     the model gets the valid-value list back instead of a silent default;
//   • this path AUTO-DEFAULTS an unset or no-longer-valid replicant, inside
//     resolveDefaultReplicant, so a human clicking around always sees a figure.
//     D4 makes that the rule for updating a stale figure too: a stored
//     replicant value missing under the new package is defaulted, never thrown.
//
// It returns a reason rather than throwing because its callers show that reason
// in place — on the figure, or beside the block — never in a modal that loses
// track of which figure it was about.
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
    if (itemsRes.data.ih.status !== "ok") {
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
      // The EFFECTIVE config, not the one passed in: it carries the replicant
      // the read auto-defaulted to, so the bundle and its data agree.
      bundle: makeFigureBundleFromFetchedData(scope, {
        resultsValue: metric,
        effectiveConfig: itemsRes.data.config,
        ih: itemsRes.data.ih as FetchedPOData["ih"],
      }),
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// Non-fetch bundle assembly for callers that ALREADY hold fetched items (the
// embedded editor's live preview and its coherent-bundle push, the slide and
// report editors' apply paths, the preset gallery). Avoids re-fetching when the
// data is in hand — the fetch itself went through the same run-keyed items
// cache, so `scope` here is the pair those items were fetched under and must be
// passed by the caller rather than read from any ambient store.
export type FetchedPOData = {
  resultsValue: Pick<
    ResultsValue,
    "id" | "formatAs" | "valueProps" | "valueLabelReplacements" | "datasetFamily"
  >;
  ih: ItemsHolderPresentationObject & {
    status: "ok";
    items: Record<string, string>[];
    indicatorMetadata: IndicatorMetadata[];
    dateRange: PeriodBounds | undefined;
  };
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
    // D4: the pair this bundle resolved under. Stored, compared against the
    // product's current pair for staleness, and read by getRollupRowLabel.
    scope: { adminArea2: scope.adminArea2 },
    snapshotAt: new Date().toISOString(),
    provenance: {
      runId: scope.runId,
      moduleLastRun: ih.moduleLastRun,
      datasetsVersion: ih.datasetsVersion,
    },
  };
}
