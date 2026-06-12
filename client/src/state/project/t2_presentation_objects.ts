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
import { getModuleIdForMetric, getModuleIdForResultsObject, moduleDataVersionKey } from "~/state/project/t1_store";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue, resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";
import { FigureInputs, getApiResponseFromGenerator, StateHolder, type GeoJSONFeatureCollection } from "panther";
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
  versionKey: (params, pds) =>
    moduleDataVersionKey(pds, getModuleIdForMetric(params.metricId)),
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
    moduleDataVersionKey(pds, getModuleIdForResultsObject(params.resultsObjectId)),
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
  return getApiResponseFromGenerator(
    getPOFigureInputsFromCacheOrFetch_AsyncGenerator(projectId, presentationObjectId, replicateOverride)
  );
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
  return getApiResponseFromGenerator(
    getPODetailFromCacheorFetch_AsyncGenderator(projectId, presentationObjectId)
  );
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
  // The auto-selected replicant lives on a COPY yielded to the caller — never
  // mutate the passed-in config: in the editor it is the unwrapped live store,
  // and a raw write would bypass notification and make the user's next click on
  // that same value a no-op (Solid's setter equality guard).
  let effectiveConfig = config;
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
      if (!selected || !validValues.some(v => v.id === selected)) {
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
        effectiveConfig = {
          ...config,
          d: { ...config.d, selectedReplicantValue: validValues[0].id },
        };
        const newFetchConfig = getFetchConfigFromPresentationObjectConfig(
          poDetail.resultsValue,
          effectiveConfig,
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
      data: { ih: data, config: effectiveConfig },
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
    data: { ih: res.data, config: effectiveConfig },
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
  return getApiResponseFromGenerator(
    getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(projectId, poDetail, config)
  );
}
