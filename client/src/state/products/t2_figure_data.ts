import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PackageScope,
  PresentationObjectConfig,
  ReplicantValueOverride,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  hashFetchConfig,
  scopeToken,
  t3,
} from "lib";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue, resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";
import { FigureInputs, getApiResponseFromGenerator, StateHolder } from "panther";
import { buildFigureInputs } from "~/generate_visualization/mod";
import { getAdminAreaLevelFromMapConfig } from "~/generate_visualization/get_admin_area_level_from_config";
import { getReplicantOptionsFromCacheOrFetch } from "./t2_replicant_options";
import { getSnapshotInstanceLocalization } from "../instance/t1_store";
import { geoJsonFamilyFor } from "../instance/t2_geojson";

// The DATA behind a figure: the metric's queryable shape (`metric_info`) and
// its rows (`po_items`), read under one PackageScope. Every figure surface
// shares these entries — a figure embedded in a slide or report, a preset in
// the Explore gallery, the editor's live preview — because a figure is just
// `{ metricId, config }` resolved under its product's pair (D3/D7), and the
// pair is all the server needs.
//
// Version key CONSTANT, identity in the UNIQUENESS key: a package is
// immutable, so `(runId, scopeToken)` leads the key instead of versioning it.
// That is what lets an embedded figure, a preset and Explore hit the same
// entry, and it retires the response-side identity guard (D8) — a late
// response can no longer land under a key belonging to a different package or
// scope, because the key already names both.

export const _METRIC_INFO_CACHE = createReactiveCache<
  {
    scope: PackageScope;
    metricId: string;
  },
  ResultsValueInfoForPresentationObject
>({
  name: "metric_info",
  uniquenessKeys: (params) => [
    params.scope.runId,
    scopeToken(params.scope.adminArea2),
    params.metricId,
  ],
  versionKey: () => "immutable",
  // A transient possible-values failure arrives as a per-dimension `error`
  // status inside a successful payload; freezing it would pin the effective-
  // format resolver's "cannot enumerate" fallback forever (the entry is never
  // invalidated).
  shouldStore: (data) =>
    !Object.values(data.disaggregationPossibleValues).some(
      (s) => s.status === "error",
    ),
});

export const _PO_ITEMS_CACHE = createReactiveCache<
  {
    scope: PackageScope;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
  ItemsHolderPresentationObject
>({
  name: "po_items",
  uniquenessKeys: (params) => [
    params.scope.runId,
    scopeToken(params.scope.adminArea2),
    params.resultsObjectId,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: () => "immutable",
});

export async function getResultsValueInfoForPresentationObjectFromCacheOrFetch(
  scope: PackageScope,
  metricId: string,
): Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>> {
  const params = { scope, metricId };
  const { data, version } = await _METRIC_INFO_CACHE.get(params);

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = resultsValueInfoQueue.enqueue(() =>
    serverActions.getRunResultsValueInfo({
      run_id: scope.runId,
      metricId,
      adminArea2: scope.adminArea2,
    })
  );

  _METRIC_INFO_CACHE.setPromise(newPromise, params, version);

  return await newPromise;
}

export type ResolveDefaultReplicantResult =
  | { ok: true; config: PresentationObjectConfig; fetchConfig: GenericLongFormFetchConfig }
  | { ok: false; noValuesFor: DisaggregationOption };

// Resolve the replicant value to actually fetch with. Replicant presets ship with
// `selectedReplicantValue: undefined` (the user picks the category after creation);
// left unresolved, the fetch config filters on the "UNSELECTED" sentinel and returns
// no rows. This defaults an unset/invalid value to the first valid option — matching
// the interactive figure, and deliberately NOT the AI path, which throws on an
// unset value (see slide_ai/resolve_figure_from_metric.ts). Returns a FRESH config
// copy when it changes the value and never mutates the input (the generator passes
// the unwrapped live editor store — see the caller comment below).
export async function resolveDefaultReplicant(
  scope: PackageScope,
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
    scope,
    resultsValue.id,
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
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): AsyncGenerator<
  StateHolder<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>
> {
  const resResultsValueInfo =
    await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      scope,
      metric.id,
    );
  if (resResultsValueInfo.success === false) {
    yield {
      status: "error",
      err: resResultsValueInfo.err,
    };
    return;
  }
  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
    metric,
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
  //
  // The mirror-image constraint also holds: the ALIASING is load-bearing. The
  // yielded holder's config shares `s`/`t` (and unchanged sub-objects) BY
  // REFERENCE with the live editor store, and the editor's style panel relies
  // on that — its child memo re-reads `config.s` reactively without a refetch.
  // Inserting a structuredClone or schema re-parse into this pass-through would
  // silently freeze style/caption editing (the memo would rebuild from a dead
  // snapshot). Copy-on-write only, never deep-copy.
  const resolvedReplicant = await resolveDefaultReplicant(
    scope,
    metric,
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

  const params = {
    scope,
    resultsObjectId: metric.resultsObjectId,
    fetchConfig: finalFetchConfig,
  };
  const { data, version } = await _PO_ITEMS_CACHE.get(params);

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
    serverActions.getRunPresentationObjectItems({
      run_id: scope.runId,
      resultsObjectId: metric.resultsObjectId,
      fetchConfig: finalFetchConfig,
      adminArea2: scope.adminArea2,
    })
  );

  _PO_ITEMS_CACHE.setPromise(newPromise, params, version);

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
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
): Promise<
  APIResponseWithData<{
    ih: ItemsHolderPresentationObject;
    config: PresentationObjectConfig;
  }>
> {
  return getApiResponseFromGenerator(
    getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(scope, metric, config)
  );
}

// Rows → renderable FigureInputs, for every surface that shows a figure
// WITHOUT the editor: slide/report figure blocks, the Explore gallery, preset
// previews, thumbnails. The caller supplies the metric (from the product run's
// authoring context) and the config; there is no per-id detail read behind
// this any more — a figure is not a row (D3).
export async function* getFigureInputsFromCacheOrFetch_AsyncGenerator(
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
  replicateOverride: ReplicantValueOverride | undefined,
): AsyncGenerator<StateHolder<FigureInputs>> {
  yield { status: "loading" };

  const configWithReplicateOverride: PresentationObjectConfig =
    structuredClone(config);
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
    scope,
    metric,
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

  try {
    const fi = buildFigureInputs({
      config: readyPoItems.data.config,
      items: ih.items,
      resultsValue: {
        formatAs: metric.formatAs,
        valueProps: metric.valueProps,
        valueLabelReplacements: metric.valueLabelReplacements,
      },
      indicatorMetadata: ih.indicatorMetadata,
      dateRange: ih.dateRange,
      geo: mapLevel
        ? {
          kind: "level",
          level: mapLevel,
          family: geoJsonFamilyFor(metric.datasetFamily),
        }
        : undefined,
      localization: getSnapshotInstanceLocalization(),
      metricId: metric.id,
      // The pair this render resolved under (D4). Live data, not a stored
      // bundle — `snapshotAt: ""` marks it as never persisted — but the pair
      // is what `getRollupRowLabel` reads to label the roll-up row, so it is
      // as load-bearing here as in a stored figure.
      scope: { adminArea2: scope.adminArea2 },
      snapshotAt: "",
      provenance: {
        runId: scope.runId,
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

export async function getFigureInputsFromCacheOrFetch(
  scope: PackageScope,
  metric: ResultsValue,
  config: PresentationObjectConfig,
  replicateOverride: ReplicantValueOverride | undefined,
): Promise<APIResponseWithData<FigureInputs>> {
  return getApiResponseFromGenerator(
    getFigureInputsFromCacheOrFetch_AsyncGenerator(
      scope,
      metric,
      config,
      replicateOverride,
    )
  );
}
