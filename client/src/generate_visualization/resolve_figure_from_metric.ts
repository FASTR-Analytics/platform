import type {
  FigureBundle,
  GenericLongFormFetchConfig,
  PeriodOption,
  PresentationObjectConfig,
  ResultsValueForVisualization,
} from "lib";
import { figureBundleSchema } from "lib";
import { _PO_ITEMS_CACHE } from "~/state/project/t2_presentation_objects";
import { serverActions } from "~/server_actions";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { getAdminAreaLevelFromMapConfig } from "./get_admin_area_level_from_config";
import { getGeoJsonSync } from "~/state/instance/t2_geojson";
import { getInstanceLocalization } from "~/state/instance/t1_store";

// Plain-inputs resolver: takes the metric data already resolved by the caller
// (AI adapter in slide_deck/slide_ai). No AI types imported here.
export type MetricInputsForBundle = {
  metricId: string;
  resultsObjectId: string;
  mostGranularTimePeriodColumnInResultsFile: PeriodOption | undefined;
  moduleLastRun: string;
  resultsValueForViz: ResultsValueForVisualization;
  fetchConfig: GenericLongFormFetchConfig;
};

export async function resolveFigureBundleFromMetric(
  projectId: string,
  inputs: MetricInputsForBundle,
  config: PresentationObjectConfig,
): Promise<FigureBundle> {
  const { metricId, resultsObjectId, mostGranularTimePeriodColumnInResultsFile, moduleLastRun, resultsValueForViz, fetchConfig } = inputs;

  const { data, version } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId,
    fetchConfig,
  });

  let itemsHolder;
  if (data) {
    itemsHolder = data;
  } else {
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId,
        fetchConfig,
        firstPeriodOption: mostGranularTimePeriodColumnInResultsFile,
      }),
    );

    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      { projectId, resultsObjectId, fetchConfig },
      version,
    );

    const res = await newPromise;
    if (!res.success) {
      throw new Error(res.err);
    }
    itemsHolder = res.data;
  }

  if (itemsHolder.status !== "ok") {
    throw new Error("No data available or too many items");
  }

  const mapLevel = getAdminAreaLevelFromMapConfig(config);
  let geo: FigureBundle["geo"];
  if (mapLevel) {
    const geoJson = getGeoJsonSync(mapLevel);
    geo = geoJson ? { kind: "data", data: geoJson } : { kind: "level", level: mapLevel };
  }

  const bundle: FigureBundle = {
    config,
    items: itemsHolder.items,
    resultsValue: resultsValueForViz,
    indicatorMetadata: itemsHolder.indicatorMetadata,
    dateRange: itemsHolder.dateRange,
    geo,
    localization: getInstanceLocalization(),
    metricId,
    snapshotAt: new Date().toISOString(),
    provenance: {
      moduleLastRun,
      datasetsVersion: itemsHolder.datasetsVersion,
    },
  };

  // Validate at construction so the render (buildFigureInputs) and save
  // (slideConfigSchema.parse) paths can never disagree: a schema-invalid bundle
  // fails here, with the exact field named, instead of rendering in the preview
  // and throwing an opaque error only on add-to-deck. Return the original object
  // (not the parsed copy) — pure validation, no clone/strip.
  const validation = figureBundleSchema.safeParse(bundle);
  if (!validation.success) {
    const issue = validation.error.issues[0];
    // map(String): a zod issue path can contain symbol keys, which .join()
    // cannot coerce implicitly.
    throw new Error(
      `Invalid figure bundle at "${issue.path.map(String).join(".")}": ${issue.message}`,
    );
  }
  return bundle;
}
