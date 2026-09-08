import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PackageScope,
  RunReplicantOptions,
  hashFetchConfig,
  scopeToken,
} from "lib";
import { createReactiveCache } from "../_infra/reactive_cache";
import { resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";

// The valid values of a figure's replicant dimension, read under one
// PackageScope through the run-keyed mount (PLAN_PRODUCTS_RESTRUCTURE D7).
// Version key CONSTANT, identity in the UNIQUENESS key: a package is
// immutable and the scope is another axis of the question, so
// `(runId, scopeToken)` leads the key instead of versioning it, and a
// response cannot land under a key belonging to another package or scope.
// The project-keyed twin in `state/project/` stays until 9a.
const _REPLICANT_OPTIONS_CACHE = createReactiveCache<
  {
    scope: PackageScope;
    metricId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
  RunReplicantOptions
>({
  name: "run_replicant_options",
  uniquenessKeys: (params) => [
    params.scope.runId,
    scopeToken(params.scope.adminArea2),
    params.metricId,
    params.replicateBy,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: () => "immutable",
  pdsNotRequired: true,
});

export async function getReplicantOptionsFromCacheOrFetch(
  scope: PackageScope,
  metricId: string,
  replicateBy: DisaggregationOption,
  fetchConfig: GenericLongFormFetchConfig,
): Promise<APIResponseWithData<RunReplicantOptions>> {
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
