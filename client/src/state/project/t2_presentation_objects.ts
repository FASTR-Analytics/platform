import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PresentationObjectConfig,
  PresentationObjectDetail,
  ReplicantValueOverride,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  hashFetchConfig,
  t3,
} from "lib";
import { runVersionKey } from "~/state/project/t1_store";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue, resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";
import { FigureInputs, getApiResponseFromGenerator, StateHolder } from "panther";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getReplicantOptionsFromCacheOrFetch } from "./t2_replicant_options";
import { getInstanceLocalization } from "../instance/t1_store";

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
  versionKey: (_params, pds) => runVersionKey(pds),
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
  // Folds the run key: the payload embeds run-derived resultsValue
  // (PLAN_RESULTS_RUNS §2.5), mirroring the server po_detail version hash.
  versionKey: (params, pds) =>
    `${pds.lastUpdated.presentation_objects[params.presentationObjectId] ?? "unknown"}|${runVersionKey(pds)}`,
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
  versionKey: (_params, pds) => runVersionKey(pds),
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

  const ih = readyPoItems.data.ih;
  if (ih.status !== "ok") {
    throw new Error("Should not happen after status checks");
  }

  const mapLevel = getAdminAreaLevelFromMapConfig(readyPoItems.data.config);
  const { resultsValue } = readyPoDetail.data;

  try {
    const fi = buildFigureInputs({
      config: readyPoItems.data.config,
      items: ih.items,
      resultsValue: {
        formatAs: resultsValue.formatAs,
        valueProps: resultsValue.valueProps,
        valueLabelReplacements: resultsValue.valueLabelReplacements,
      },
      indicatorMetadata: ih.indicatorMetadata,
      dateRange: ih.dateRange,
      geo: mapLevel ? { kind: "level", level: mapLevel } : undefined,
      localization: getInstanceLocalization(),
      metricId: resultsValue.id,
      snapshotAt: "",
      provenance: {
        moduleLastRun: ih.moduleLastRun,
        datasetsVersion: ih.datasetsVersion,
      },
    });
    yield { status: "ready" as const, data: fi };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown rendering error";
    if (!msg.startsWith("[INFO]")) {
      console.error("[VIZ] Rendering error:", msg);
    }
    yield {
      status: "error" as const,
      err: msg.startsWith("[INFO]") ? msg : `[INFO] ${msg}`,
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

export type ResolveDefaultReplicantResult =
  | { ok: true; config: PresentationObjectConfig; fetchConfig: GenericLongFormFetchConfig }
  | { ok: false; noValuesFor: DisaggregationOption };

// Resolve the replicant value to actually fetch with. Replicant presets ship with
// `selectedReplicantValue: undefined` (the user picks the category after creation);
// left unresolved, the fetch config filters on the "UNSELECTED" sentinel and returns
// no rows. This defaults an unset/invalid value to the first valid option — matching
// the interactive viz, and deliberately NOT the AI-slide path, which throws on an
// unset value (see slide_ai/resolve_figure_from_metric.ts). Returns a FRESH config
// copy when it changes the value and never mutates the input (the generator passes
// the unwrapped live editor store — see the caller comment below).
export async function resolveDefaultReplicant(
  projectId: string,
  resultsValue: ResultsValue,
  config: PresentationObjectConfig,
  baseFetchConfig: GenericLongFormFetchConfig,
): Promise<ResolveDefaultReplicantResult> {
  const replicateBy = getReplicateByProp(config);
  if (!replicateBy) {
    return { ok: true, config, fetchConfig: baseFetchConfig };
  }
  // Fetch the valid replicant values with the auto-pin EXCLUDED, the same way the
  // selector (ReplicateByOptions) queries them — so both share the single
  // replicant-options cache entry instead of issuing two identical server queries.
  // excludeReplicantFilter drops only the appended pin (the current
  // selectedReplicantValue), KEEPING the user's filterBy; the server honors that
  // filter, so a replicant filtered to a subset returns exactly that subset.
  const optionsFetchConfig = getFetchConfigFromPresentationObjectConfig(
    resultsValue,
    config,
    { excludeReplicantFilter: true },
  );
  if (!optionsFetchConfig.success) {
    return { ok: true, config, fetchConfig: baseFetchConfig };
  }
  const replicantRes = await getReplicantOptionsFromCacheOrFetch(
    projectId,
    resultsValue.resultsObjectId,
    replicateBy,
    optionsFetchConfig.data,
  );
  if (!replicantRes.success || replicantRes.data.status !== "ok") {
    return { ok: true, config, fetchConfig: baseFetchConfig };
  }
  const validValues = replicantRes.data.possibleValues;
  const selected = config.d.selectedReplicantValue;
  if (selected && validValues.some((v) => v.id === selected)) {
    return { ok: true, config, fetchConfig: baseFetchConfig };
  }
  if (validValues.length === 0) {
    return { ok: false, noValuesFor: replicateBy };
  }
  const effectiveConfig: PresentationObjectConfig = {
    ...config,
    d: { ...config.d, selectedReplicantValue: validValues[0].id },
  };
  const newFetchConfig = getFetchConfigFromPresentationObjectConfig(
    resultsValue,
    effectiveConfig,
  );
  return {
    ok: true,
    config: effectiveConfig,
    fetchConfig: newFetchConfig.success ? newFetchConfig.data : baseFetchConfig,
  };
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

  // The auto-selected replicant lives on a COPY yielded to the caller — never
  // mutate the passed-in config: in the editor it is the unwrapped live store,
  // and a raw write would bypass notification and make the user's next click on
  // that same value a no-op (Solid's setter equality guard). resolveDefaultReplicant
  // returns a fresh copy when it defaults the value (see its doc comment).
  const resolvedReplicant = await resolveDefaultReplicant(
    projectId,
    poDetail.resultsValue,
    config,
    resFetchConfig.data,
  );
  if (!resolvedReplicant.ok) {
    yield {
      status: "error",
      err: t3({
        en: `[INFO] No values available for "${resolvedReplicant.noValuesFor}"`,
        fr: `[INFO] Aucune valeur disponible pour "${resolvedReplicant.noValuesFor}"`,
        pt: `[INFO] Nenhum valor disponível para "${resolvedReplicant.noValuesFor}"`,
      }),
    };
    return;
  }
  const effectiveConfig = resolvedReplicant.config;
  const finalFetchConfig = resolvedReplicant.fetchConfig;

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
