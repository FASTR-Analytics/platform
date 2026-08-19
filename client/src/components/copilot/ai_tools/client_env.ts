import type {
  AIToolEnv,
  APIResponseWithData,
  DatasetType,
  DisaggregationLabelConfig,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  InstalledModuleWithConfigSelections,
  ReplicantOptionsForPresentationObject,
  SlideWithMeta,
} from "lib";
import { serverActions } from "~/server_actions";
import {
  _PO_ITEMS_CACHE,
  getResultsValueInfoForPresentationObjectFromCacheOrFetch,
} from "~/state/products/t2_figure_data";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { getReplicantOptionsFromCacheOrFetch } from "~/state/products/t2_replicant_options";
import { poItemsQueue } from "~/state/_infra/request_queue";
import { instanceState } from "~/state/instance/t1_store";
import { requireCopilotScope } from "../authoring_context";

// The SPA's injection of the shared AI-tool environment (lib/ai_tools/env.ts):
// cache-backed getters over the run-keyed package routes (so chat tool calls
// share cache entries with the interactive UI), plus the SPA-only getters the
// client tools need — module internals (script, logs, settings), product
// content (slides) and figure-shaping helpers (replicant options, dimension
// labels).
//
// ONE env, because there is ONE copilot mount. The (package, scope) pair is
// NOT captured at construction: it is read from `requireCopilotScope()` inside
// every getter, so a call that lands after the user opened a product on
// another package serves that package. That is the SPA's whole reason for the
// source header on the shared tools — the pair can differ between two calls of
// one conversation. No run id crosses the seam and none appears in a schema.
export type ClientAIToolEnv = AIToolEnv & {
  getModuleScript: (
    moduleId: string,
  ) => Promise<APIResponseWithData<{ script: string }>>;
  getModuleLogs: (
    moduleId: string,
  ) => Promise<APIResponseWithData<{ logs: string }>>;
  getModuleSettings: (
    moduleId: string,
  ) => Promise<APIResponseWithData<InstalledModuleWithConfigSelections>>;
  getSlide: (slideId: string) => Promise<APIResponseWithData<SlideWithMeta>>;
  getReplicantOptions: (
    metricId: string,
    replicateBy: DisaggregationOption,
    fetchConfig: GenericLongFormFetchConfig,
  ) => Promise<APIResponseWithData<ReplicantOptionsForPresentationObject>>;
  // Instance-level dimension display labels (admin-area names, facility
  // columns). Facility-column labels are per family — pass the results
  // value's datasetFamily; undefined/iceh yields the generic defaults.
  getDimensionLabelConfig: (
    family: DatasetType | undefined,
  ) => DisaggregationLabelConfig;
};

export const copilotAIToolEnv: ClientAIToolEnv = {
  getItems: async ({ resultsObjectId, fetchConfig }) => {
    const scope = requireCopilotScope();
    const params = { scope, resultsObjectId, fetchConfig };
    const { data, version } = await _PO_ITEMS_CACHE.get(params);
    if (data) {
      return { success: true, data };
    }
    const newPromise = poItemsQueue.enqueue(() =>
      serverActions.getRunPresentationObjectItems({
        run_id: scope.runId,
        resultsObjectId,
        fetchConfig,
        adminArea2: scope.adminArea2,
      })
    );
    _PO_ITEMS_CACHE.setPromise(newPromise, params, version);
    return await newPromise;
  },
  getResultsValueInfo: (metricId) =>
    getResultsValueInfoForPresentationObjectFromCacheOrFetch(
      requireCopilotScope(),
      metricId,
    ),
  getModuleScript: (moduleId) =>
    serverActions.getRunModuleScript({
      run_id: requireCopilotScope().runId,
      module_id: moduleId,
    }),
  getModuleLogs: (moduleId) =>
    serverActions.getRunModuleLogs({
      run_id: requireCopilotScope().runId,
      module_id: moduleId,
    }),
  getModuleSettings: (moduleId) =>
    serverActions.getRunModuleWithConfigSelections({
      run_id: requireCopilotScope().runId,
      module_id: moduleId,
    }),
  getSlide: (slideId) => getSlideFromCacheOrFetch(slideId),
  getReplicantOptions: (metricId, replicateBy, fetchConfig) =>
    getReplicantOptionsFromCacheOrFetch(
      requireCopilotScope(),
      metricId,
      replicateBy,
      fetchConfig,
    ),
  getDimensionLabelConfig: (family) => ({
    adminAreaLabels: instanceState.adminAreaLabels,
    facilityColumns: family === "hmis"
      ? instanceState.structureSchemaHmis ?? undefined
      : family === "hfa"
      ? instanceState.structureSchemaHfa ?? undefined
      : undefined,
  }),
};
