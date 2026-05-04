import {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ReplicantValueOverride,
  ResultsValueInfoForPresentationObject,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  hashFetchConfig,
  t3,
} from "lib";
import { getModuleIdForMetric, getModuleIdForResultsObject } from "~/state/project/t1_store";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue, resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";
import { FigureInputs, StateHolder, type GeoJSONFeatureCollection } from "panther";
import { getFigureInputsFromPresentationObject } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getGeoJsonSync } from "../instance/t2_geojson";
import { getReplicantOptionsFromCacheOrFetch } from "./t2_replicant_options";

export const _METRIC_INFO_CACHE = createReactiveCache<
  {
    projectId: string;
    metricId: string;
  },
  ResultsValueInfoForPresentationObject
>({
  name: "metric_info",
  uniquenessKeys: (params) => [
    params.projectId,
    params.metricId,
  ],
  versionKey: (params, pds) => pds.moduleLastRun[getModuleIdForMetric(params.metricId)] ?? "unknown",
});

export const _PO_DETAIL_CACHE = createReactiveCache<
  {
    projectId: string;
    presentationObjectId: string;
  },
  PresentationObjectDetail
>({
  name: "po_detail",
  uniquenessKeys: (params) => [params.projectId, params.presentationObjectId],
  versionKey: (params, pds) =>
    pds.lastUpdated.presentation_objects[params.presentationObjectId] ?? "unknown",
});

export const _PO_ITEMS_CACHE = createReactiveCache<
  {
    projectId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
  ItemsHolderPresentationObject
>({
  name: "po_items",
  uniquenessKeys: (params) => [
    params.projectId,
    params.resultsObjectId,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: (params, pds) =>
    pds.moduleLastRun[getModuleIdForResultsObject(params.resultsObjectId)] ?? "unknown",
});

export async function getResultsValueInfoForPresentationObjectFromCacheOrFetch(
  projectId: string,
  metricId: string,
) {
  const { data, version } = await _METRIC_INFO_CACHE.get({
    projectId,
    metricId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = resultsValueInfoQueue.enqueue(() =>
    serverActions.getResultsValueInfoForPresentationObject({
      projectId,
      metricId: metricId,
    })
  );

  _METRIC_INFO_CACHE.setPromise(
    newPromise,
    {
      projectId,
      metricId,
    },
    version,
  );

  const result = await newPromise;
  return result;
}

export async function* getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
  projectId: string,
  presentationObjectId: string,
  replicateOverride: ReplicantValueOverride | undefined,
): AsyncGenerator<StateHolder<FigureInputs>> {
  yield { status: "loading" };
  const iterPoDetail = getPODetailFromCacheorFetch_AsyncGenderator(
    projectId,
    presentationObjectId,
  );
  let readyPoDetail;
  for await (const resPoDetail of iterPoDetail) {
    if (resPoDetail.status === "error") {
      yield resPoDetail;
      return;
    }
    if (resPoDetail.status === "ready") {
      readyPoDetail = resPoDetail;
      break;
    }
  }
  if (!readyPoDetail) {
    throw new Error("Should not happen");
  }
  const configWithReplicateOverride: PresentationObjectConfig = structuredClone(
    readyPoDetail.data.config,
  );
  if (replicateOverride?.additionalScale) {
    configWithReplicateOverride.s.scale =
      configWithReplicateOverride.s.scale * replicateOverride.additionalScale;
  }
  const replicateBy = getReplicateByProp(configWithReplicateOverride);
  if (
    replicateBy &&
    replicateOverride &&
    replicateOverride.selectedReplicantValue
  ) {
    configWithReplicateOverride.d.selectedReplicantValue =
      replicateOverride.selectedReplicantValue;
  }
  if (replicateOverride?.hideFigureCaption) {
    configWithReplicateOverride.t.caption = "";
  }
  if (replicateOverride?.hideFigureSubCaption) {
    configWithReplicateOverride.t.subCaption = "";
  }
  if (replicateOverride?.hideFigureFootnote) {
    configWithReplicateOverride.t.footnote = "";
  }

  const iterPoItems = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
    projectId,
    readyPoDetail.data,
    configWithReplicateOverride,
  );
  let readyPoItems;
  for await (const resPoItems of iterPoItems) {
    if (resPoItems.status === "error") {
      yield resPoItems;
      return;
    }
    if (resPoItems.status === "ready") {
      readyPoItems = resPoItems;
      break;
    }
  }
  if (!readyPoItems) {
    throw new Error("Should not happen");
  }

  if (readyPoItems.data.ih.status === "too_many_items") {
    yield {
      status: "error",
      err: "[INFO] Too many data points selected. Please add filters or reduce disaggregation options to view fewer than 20,000 data points.",
    };
    return;
  }

  if (readyPoItems.data.ih.status === "no_data_available") {
    yield {
      status: "error",
      err: "[INFO] No data available with current filter selection.",
    };
    return;
  }

  let geoJson: GeoJSONFeatureCollection | undefined;
  const mapLevel = getAdminAreaLevelFromMapConfig(readyPoItems.data.config);
  if (mapLevel) {
    geoJson = getGeoJsonSync(mapLevel);
  }

  try {
    const figureInputs = getFigureInputsFromPresentationObject(
      readyPoDetail.data.resultsValue,
      readyPoItems.data.ih,
      readyPoItems.data.config,
      geoJson,
    );
    yield figureInputs;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown rendering error";
    console.error("[VIZ] Rendering error:", msg);
    yield {
      status: "error" as const,
      err: `[INFO] ${msg}`,
    };
  }
}

export async function getPOFigureInputsFromCacheOrFetch(
  projectId: string,
  presentationObjectId: string,
  replicateOverride: ReplicantValueOverride | undefined,
): Promise<APIResponseWithData<FigureInputs>> {
  const iter = getPOFigureInputsFromCacheOrFetch_AsyncGenerator(
    projectId,
    presentationObjectId,
    replicateOverride,
  );
  const arr: StateHolder<FigureInputs>[] = [];
  for await (const y of iter) {
    arr.push(y);
  }
  const last = arr.at(-1);
  if (!last) {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "loading") {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "error") {
    return { success: false, err: last.err };
  }
  return { success: true, data: last.data };
}

async function* getPODetailFromCacheorFetch_AsyncGenderator(
  projectId: string,
  presentationObjectId: string,
): AsyncGenerator<StateHolder<PresentationObjectDetail>> {
  const { data, version, isInflight } = await _PO_DETAIL_CACHE.get({
    projectId,
    presentationObjectId,
  });

  if (data) {
    yield {
      status: "ready",
      data,
    };
    return;
  }

  yield {
    status: "loading",
  };

  const newPromise = serverActions.getPresentationObjectDetail({
    projectId,
    po_id: presentationObjectId,
  });

  _PO_DETAIL_CACHE.setPromise(
    newPromise,
    {
      projectId,
      presentationObjectId,
    },
    version,
  );

  const res = await newPromise;
  if (res.success === false) {
    yield {
      status: "error",
      err: res.err,
    };
    return;
  }
  yield {
    status: "ready",
    data: res.data,
  };
}

export async function getPODetailFromCacheorFetch(
  projectId: string,
  presentationObjectId: string,
): Promise<APIResponseWithData<PresentationObjectDetail>> {
  const iter = getPODetailFromCacheorFetch_AsyncGenderator(
    projectId,
    presentationObjectId,
  );
  const arr: StateHolder<PresentationObjectDetail>[] = [];
  for await (const y of iter) {
    arr.push(y);
  }
  const last = arr.at(-1);
  if (!last) {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "loading") {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "error") {
    return { success: false, err: last.err };
  }
  if (last.status !== "ready") {
    return { success: false, err: "Should not be possible" };
  }
  return { success: true, data: last.data };
}

export async function* getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
  projectId: string,
  poDetail: PresentationObjectDetail,
  config: PresentationObjectConfig,
): AsyncGenerator<
  StateHolder<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>
> {
  const resResultsValueInfo =
    await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      poDetail.projectId,
      poDetail.resultsValue.id,
    );
  if (resResultsValueInfo.success === false) {
    yield {
      status: "error",
      err: resResultsValueInfo.err,
    };
    return;
  }
  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
    poDetail.resultsValue,
    config,
  );
  if (resFetchConfig.success === false) {
    yield {
      status: "error",
      err: resFetchConfig.err,
    };
    return;
  }

  const replicateBy = getReplicateByProp(config);
  let finalFetchConfig = resFetchConfig.data;
  if (replicateBy) {
    const replicantRes = await getReplicantOptionsFromCacheOrFetch(
      projectId,
      poDetail.resultsValue.resultsObjectId,
      replicateBy,
      resFetchConfig.data,
    );
    if (replicantRes.success && replicantRes.data.status === "ok") {
      const validValues = replicantRes.data.possibleValues;
      const selected = config.d.selectedReplicantValue;
      if (!selected || !validValues.includes(selected)) {
        if (validValues.length === 0) {
          yield {
            status: "error",
            err: t3({
              en: `[INFO] No values available for "${replicateBy}"`,
              fr: `[INFO] Aucune valeur disponible pour "${replicateBy}"`,
            }),
          };
          return;
        }
        config.d.selectedReplicantValue = validValues[0];
        const newFetchConfig = getFetchConfigFromPresentationObjectConfig(
          poDetail.resultsValue,
          config,
        );
        if (newFetchConfig.success) {
          finalFetchConfig = newFetchConfig.data;
        }
      }
    }
  }

  const { data, version, isInflight } = await _PO_ITEMS_CACHE.get({
    projectId,
    resultsObjectId: poDetail.resultsValue.resultsObjectId,
    fetchConfig: finalFetchConfig,
  });

  if (data) {
    yield {
      status: "ready",
      data: { ih: data, config },
    };
    return;
  }

  yield {
    status: "loading",
  };

  const newPromise = poItemsQueue.enqueue(() =>
    serverActions.getPresentationObjectItems({
      projectId,
      resultsObjectId: poDetail.resultsValue.resultsObjectId,
      fetchConfig: finalFetchConfig,
      firstPeriodOption: poDetail.resultsValue.mostGranularTimePeriodColumnInResultsFile,
    })
  );

  _PO_ITEMS_CACHE.setPromise(
    newPromise,
    {
      projectId,
      resultsObjectId: poDetail.resultsValue.resultsObjectId,
      fetchConfig: finalFetchConfig,
    },
    version,
  );

  const res = await newPromise;
  if (res.success === false) {
    yield { status: "error", err: res.err };
    return;
  }

  yield {
    status: "ready",
    data: { ih: res.data, config },
  };
}

export async function getPresentationObjectItemsFromCacheOrFetch(
  projectId: string,
  poDetail: PresentationObjectDetail,
  config: PresentationObjectConfig,
): Promise<
  APIResponseWithData<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>
> {
  const iter = getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(
    projectId,
    poDetail,
    config,
  );
  const arr: StateHolder<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>[] = [];
  for await (const y of iter) {
    arr.push(y);
  }
  const last = arr.at(-1);
  if (!last) {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "loading") {
    return { success: false, err: "Should not be possible" };
  }
  if (last.status === "error") {
    return { success: false, err: last.err };
  }
  return { success: true, data: last.data };
}
