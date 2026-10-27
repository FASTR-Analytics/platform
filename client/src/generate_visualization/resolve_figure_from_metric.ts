import type {
  DatasetType,
  FigureBundle,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
  ResultsValueForVisualization,
} from "lib";
import { figureBundleSchema } from "lib";
import { unwrap } from "solid-js/store";
import { _PO_ITEMS_CACHE } from "~/state/products/t2_figure_data";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { geoJsonFamilyFor, getGeoJsonSync } from "~/state/instance/t2_geojson";
import {
  figureScopeStamp,
  getSnapshotInstanceLocalization,
  resolveScope,
} from "~/state/instance/t1_store";

// Plain-inputs resolver: takes the metric data already resolved by the caller
// (AI adapter in components/products/copilot/slide_ai). No AI types imported here.
//
// It goes at the items cache directly rather than through
// getPresentationObjectItemsFromCacheOrFetch because the caller already holds
// a built fetch config and only a projection of the metric. Same cache entry
// either way: the uniqueness key is `(runId, scopeToken, resultsObjectId,
// fetchConfigHash)`.
export type MetricInputsForBundle = {
  metricId: string;
  resultsObjectId: string;
  resultsValueForViz: ResultsValueForVisualization;
  datasetFamily: DatasetType | undefined;
  fetchConfig: GenericLongFormFetchConfig;
};

export async function resolveFigureBundleFromMetric(
  scope: PackageScope,
  inputs: MetricInputsForBundle,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  const {
    metricId,
    resultsObjectId,
    resultsValueForViz,
    datasetFamily,
    fetchConfig,
  } = inputs;

  const params = { scope: resolveScope(scope), resultsObjectId, fetchConfig };
  const { data, version } = await _PO_ITEMS_CACHE.get(params);

  let itemsHolder;
  if (data) {
    itemsHolder = data;
  } else {
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getRunPresentationObjectItems({
        run_id: scope.runId,
        resultsObjectId,
        fetchConfig,
        scopeId: scope.scopeId,
      })
    );

    _PO_ITEMS_CACHE.setPromise(newPromise, params, version);

    const res = await newPromise;
    if (!res.success) {
      throw new Error(res.err);
    }
    itemsHolder = res.data;
  }

  if (itemsHolder.status !== "ok") {
    throw new Error("No data available or too many items");
  }

  const bundle = makeFigureBundleFromFetchedData(scope, {
    resultsValue: { id: metricId, ...resultsValueForViz, datasetFamily },
    ih: itemsHolder,
    effectiveConfig: config,
  });

  // Validate at construction so the render (buildFigureInputs) and save
  // (slideConfigSchema.parse) paths can never disagree: a schema-invalid bundle
  // fails here, with the exact field named, instead of rendering in the preview
  // and throwing an opaque error only on add-to-deck. Return the original object
  // (not the parsed copy): pure validation, no clone/strip.
  const validation = figureBundleSchema.safeParse(bundle);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    // map(String): a zod issue path can contain symbol keys, which .join()
    // cannot coerce implicitly.
    throw new Error(
      `Invalid figure bundle at "${
        issue.path.map(String).join(".")
      }": ${issue.message}`,
    );
  }
  return bundle;
}

// Non-fetch bundle assembly for callers that already hold fetched items (the
// embedded editor's live preview and coherent-bundle push, the editors' apply
// paths, the preset gallery). `scope` is the pair those items were fetched
// under, passed by the caller rather than read from any ambient store.
export type FetchedPOData = {
  resultsValue: Pick<
    ResultsValue,
    | "id"
    | "formatAs"
    | "valueProps"
    | "valueLabelReplacements"
    | "datasetFamily"
  >;
  ih: Extract<ItemsHolderPresentationObject, { status: "ok" }>;
  effectiveConfig: PresentationObjectConfig;
};

// The one place a FigureBundle that is validated, stored or shared is assembled
// from fetched data.
export function makeFigureBundleFromFetchedData(
  scope: PackageScope,
  data: FetchedPOData,
): FigureBundle {
  const { resultsValue, ih, effectiveConfig } = data;
  const mapLevel = getAdminAreaLevelFromMapConfig(effectiveConfig);
  const geoFamily = geoJsonFamilyFor(resultsValue.datasetFamily);
  const geoJson = mapLevel ? getGeoJsonSync(geoFamily, mapLevel) : undefined;
  // A bundle OWNS the data it carries. Callers hand over the items cache's own
  // row objects (it serves them by reference) and live store objects (the
  // metrics store, a preset config), and a bundle that reaches a Solid store is
  // walked by that store's proxy, which brands the RAW object it reads with a
  // symbol key that cannot be removed. Why that breaks validation, and why the
  // copy belongs here rather than in the schema: "A bundle owns its data" in
  // SYSTEM_10.
  const owned = structuredClone(unwrap({
    config: effectiveConfig,
    items: ih.items,
    resultsValue: {
      formatAs: resultsValue.formatAs,
      valueProps: resultsValue.valueProps,
      valueLabelReplacements: resultsValue.valueLabelReplacements,
    },
    indicatorMetadata: ih.indicatorMetadata,
    dateRange: ih.dateRange,
  }));
  return {
    ...owned,
    // The one field held by reference: `geo.data` is the instance's whole
    // boundary file, megabytes of it, shared by every figure at that level and
    // never read as a record (`geoRefSchema` types it `z.unknown()`), so a copy
    // per bundle build would cost the editor's live preview for nothing.
    geo: mapLevel
      ? (geoJson
        ? { kind: "data" as const, data: geoJson }
        : { kind: "level" as const, level: mapLevel, family: geoFamily })
      : undefined,
    localization: getSnapshotInstanceLocalization(),
    metricId: resultsValue.id,
    scope: figureScopeStamp(scope, ih.scopeToken, resultsValue.datasetFamily),
    snapshotAt: new Date().toISOString(),
    provenance: { runId: scope.runId },
  };
}
