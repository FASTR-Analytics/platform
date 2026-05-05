import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ReplicantOptionsForPresentationObject,
  hashFetchConfig,
} from "lib";
import { getModuleIdForResultsObject } from "~/state/project/t1_store";
import { createReactiveCache } from "../_infra/reactive_cache";
import { resultsValueInfoQueue } from "~/state/_infra/request_queue";
import { serverActions } from "~/server_actions";

export const _REPLICANT_OPTIONS_CACHE = createReactiveCache<
  {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
  ReplicantOptionsForPresentationObject
>({
  name: "replicant_options",
  uniquenessKeys: (params) => [
    params.projectId,
    params.resultsObjectId,
    params.replicateBy,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: (params, pds) => pds.moduleLastRun[getModuleIdForResultsObject(params.resultsObjectId)] ?? "unknown",
});

export async function getReplicantOptionsFromCacheOrFetch(
  projectId: string,
  resultsObjectId: string,
  replicateBy: DisaggregationOption,
  fetchConfig: GenericLongFormFetchConfig,
): Promise<APIResponseWithData<ReplicantOptionsForPresentationObject>> {
  const { data, version } = await _REPLICANT_OPTIONS_CACHE.get({
    projectId,
    resultsObjectId,
    replicateBy,
    fetchConfig,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = resultsValueInfoQueue.enqueue(() =>
    serverActions.getReplicantOptions({
      projectId,
      resultsObjectId,
      replicateBy,
      fetchConfig,
    })
  );

  _REPLICANT_OPTIONS_CACHE.setPromise(
    newPromise,
    {
      projectId,
      resultsObjectId,
      replicateBy,
      fetchConfig,
    },
    version,
  );

  return await newPromise;
}
