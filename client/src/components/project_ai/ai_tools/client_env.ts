import type { AIToolEnv } from "lib";
import { serverActions } from "~/server_actions";
import {
  _PO_ITEMS_CACHE,
  getPODetailFromCacheorFetch,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/project/t2_presentation_objects";
import { getSlideFromCacheOrFetch } from "~/state/project/t2_slides";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/project/t2_replicant_options";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { instanceState } from "~/state/instance/t1_store";

// The SPA's injection of the shared AI-tool environment (lib/ai_tools/env.ts):
// cache-backed getters over the reactive caches + request queues, so chat tool
// calls share cache entries with the interactive UI. The headless MCP host
// injects direct server-action fetches instead.
export const clientAIToolEnv: AIToolEnv = {
  serverActions,
  getItems: async (
    { projectId, resultsObjectId, fetchConfig, firstPeriodOption },
  ) => {
    const { data, version } = await _PO_ITEMS_CACHE.get({
      projectId,
      resultsObjectId,
      fetchConfig,
    });
    if (data) {
      return { success: true, data };
    }
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId,
        fetchConfig,
        firstPeriodOption,
      }),
    );
    _PO_ITEMS_CACHE.setPromise(
      newPromise,
      { projectId, resultsObjectId, fetchConfig },
      version,
    );
    return await newPromise;
  },
  getPODetail: getPODetailFromCacheorFetch,
  getResultsValueInfo: getResultsValueInfoForPresentationObjectFromCacheOrFetch,
  getSlide: getSlideFromCacheOrFetch,
  getReplicantOptions: getReplicantOptionsFromCacheOrFetch,
  getDimensionLabelConfig: (family) => ({
    adminAreaLabels: instanceState.adminAreaLabels,
    facilityColumns: family === "hmis"
      ? instanceState.structureSchemaHmis ?? undefined
      : family === "hfa"
      ? instanceState.structureSchemaHfa ?? undefined
      : undefined,
  }),
};
