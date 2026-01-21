import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ReplicantOptionsForPresentationObject,
} from "lib";
import { _REPLICANT_OPTIONS_CACHE } from "./caches/visualizations";
import { resultsValueInfoQueue } from "~/utils/request_queue";
import { serverActions } from "~/server_actions";

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
