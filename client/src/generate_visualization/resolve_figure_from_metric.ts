import type {
  FigureBundle,
  GenericLongFormFetchConfig,
  PeriodOption,
  PresentationObjectConfig,
  ResultsValueForVisualization,
} from "lib";
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

  return {
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
}
