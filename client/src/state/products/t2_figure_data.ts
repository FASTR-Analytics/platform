import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  getFetchConfigFromPresentationObjectConfig,
  getReplicateByProp,
  hashFetchConfig,
  scopeToken,
  t3,
} from "lib";
import { getApiResponseFromGenerator, StateHolder } from "panther";
import { createReactiveCache } from "../_infra/reactive_cache";
import { poItemsQueue, resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";
import { getReplicantOptionsFromCacheOrFetch } from "./t2_replicant_options";

// The DATA behind a figure, read under one PackageScope through the run-keyed
// mount (PLAN_PRODUCTS_RESTRUCTURE D7): the metric's queryable shape
// (`metric_info`) and its rows (`po_items`). A figure is `{ metricId, config }`
// resolved under its container's pair (D3), so every surface that shows one
// (a preset preview, an embedded figure, the Explore page) shares these
// entries. Version key CONSTANT, identity in the UNIQUENESS key: a package is
// immutable, so `(runId, scopeToken)` leads the key instead of versioning it,
// and a late response cannot land under a key belonging to another package
// or scope. The project-keyed twins in `state/project/` stay until 9a.

export const _METRIC_INFO_CACHE = createReactiveCache<
  { scope: PackageScope; metricId: string },
  ResultsValueInfoForPresentationObject
>({
  name: "run_metric_info",
  uniquenessKeys: (params) => [
    params.scope.runId,
    scopeToken(params.scope.adminArea2),
    params.metricId,
  ],
  versionKey: () => "immutable",
  pdsNotRequired: true,
  // A transient possible-values failure arrives as a per-dimension `error`
  // status inside a successful payload; with a constant version, freezing it
  // would pin the effective-format resolver's "cannot enumerate" fallback for
  // good.
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
  name: "run_po_items",
  uniquenessKeys: (params) => [
    params.scope.runId,
    scopeToken(params.scope.adminArea2),
    params.resultsObjectId,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: () => "immutable",
  pdsNotRequired: true,
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

// Resolve the replicant value to actually fetch with. Replicant presets ship
// with `selectedReplicantValue: undefined` (the user picks the category after
// insertion); left unresolved, the fetch config filters on the "UNSELECTED"
// sentinel and returns no rows. This defaults an unset or invalid value to the
// first valid option, matching the interactive figure and deliberately NOT the
// AI path, which throws on an unset value (assert_replicant_valid.ts). Returns
// a FRESH config copy when it changes the value and never mutates the input:
// the generator below passes the unwrapped live editor store.
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
  // The valid values with the auto-pin EXCLUDED, the same way the selector
  // (ReplicateByOptions) queries them, so both share one cache entry.
  // excludeReplicantFilter drops only the appended pin, KEEPING the user's
  // filterBy, which the server honors.
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
    yield { status: "error", err: resResultsValueInfo.err };
    return;
  }
  const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
    metric,
    config,
  );
  if (resFetchConfig.success === false) {
    yield { status: "error", err: resFetchConfig.err };
    return;
  }

  // The auto-selected replicant lives on a COPY yielded to the caller: never
  // mutate the passed-in config. In the editor it is the unwrapped live
  // store, and a raw write would bypass notification and make the user's
  // next click on that same value a no-op (Solid's setter equality guard).
  // The mirror-image constraint also holds: the ALIASING is load-bearing.
  // The yielded config shares `s`/`t` (and unchanged sub-objects) BY
  // REFERENCE with the live editor store, whose style panel re-reads
  // `config.s` reactively without a refetch. Copy-on-write only, never
  // deep-copy.
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
    yield { status: "ready", data: { ih: data, config: effectiveConfig } };
    return;
  }

  yield { status: "loading" };

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
  yield { status: "ready", data: { ih: res.data, config: effectiveConfig } };
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
    getPresentationObjectItemsFromCacheOrFetch_AsyncGenerator(scope, metric, config),
  );
}
