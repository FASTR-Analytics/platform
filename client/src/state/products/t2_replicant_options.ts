import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PackageScope,
  ReplicantOptionsForPresentationObject,
  hashFetchConfig,
  scopeToken,
} from "lib";
import { createReactiveCache } from "../_infra/reactive_cache";
import { resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";

// The valid values of a figure's replicant dimension, under one PackageScope.
//
// Version key CONSTANT, identity in the UNIQUENESS key: a package is immutable
// and a scope is just another axis of the question, so `(runId, scopeToken)`
// leads the key rather than versioning it (D8 — `runVersionKey` and the
// response-side identity guard both die with it). A response can no longer
// land under a key it does not belong to, because the key already names the
// package and scope it was asked for.
const _REPLICANT_OPTIONS_CACHE = createReactiveCache<
  {
    scope: PackageScope;
    metricId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
  ReplicantOptionsForPresentationObject
>({
  name: "replicant_options",
  uniquenessKeys: (params) => [
    params.scope.runId,
    scopeToken(params.scope.adminArea2),
    params.metricId,
    params.replicateBy,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: () => "immutable",
});

export async function getReplicantOptionsFromCacheOrFetch(
  scope: PackageScope,
  metricId: string,
  replicateBy: DisaggregationOption,
  fetchConfig: GenericLongFormFetchConfig,
): Promise<APIResponseWithData<ReplicantOptionsForPresentationObject>> {
  const params = { scope, metricId, replicateBy, fetchConfig };
  const { data, version } = await _REPLICANT_OPTIONS_CACHE.get(params);

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = resultsValueInfoQueue.enqueue(() =>
    serverActions.getRunReplicantOptions({
      run_id: scope.runId,
      metricId,
      replicateBy,
      fetchConfig,
      adminArea2: scope.adminArea2,
    })
  );

  _REPLICANT_OPTIONS_CACHE.setPromise(newPromise, params, version);

  return await newPromise;
}
