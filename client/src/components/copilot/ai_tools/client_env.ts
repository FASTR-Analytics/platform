import type {
  AIToolEnv,
  APIResponseWithData,
  DatasetType,
  DisaggregationLabelConfig,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  InstalledModuleWithConfigSelections,
  PackageScope,
  RunReplicantOptions,
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

// The SPA's injection of the shared AI-tool environment (lib/ai_tools/env.ts):
// cache-backed getters over the run-keyed package routes (so chat tool calls
// share cache entries with the interactive UI), plus the SPA-only getters the
// client tools need: module internals (script, logs, settings), product
// content (slides) and figure-shaping helpers (replicant options, dimension
// labels).
//
// One env per copilot mount, bound to the open product's (package, scope)
// pair for the mount's life (PLAN_PRODUCTS_RESTRUCTURE D15): a reattach
// remounts the copilot with a new env. No run id crosses the tool seam and
// none appears in a tool schema.
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
  getSlide: (
    productId: string,
    slideId: string,
  ) => Promise<APIResponseWithData<SlideWithMeta>>;
  getReplicantOptions: (
    metricId: string,
    replicateBy: DisaggregationOption,
    fetchConfig: GenericLongFormFetchConfig,
  ) => Promise<APIResponseWithData<RunReplicantOptions>>;
  // Instance-level dimension display labels (admin-area names, facility
  // columns). Facility-column labels are per family: pass the results value's
  // datasetFamily; undefined/iceh yields the generic defaults.
  getDimensionLabelConfig: (
    family: DatasetType | undefined,
  ) => DisaggregationLabelConfig;
};

export function createCopilotAIToolEnv(scope: PackageScope): ClientAIToolEnv {
  return {
    // `firstPeriodOption` is dropped on the way through, as it is at /mcp: the
    // run-keyed read derives the metric's finest physical time column from
    // the package manifest itself, so the caller's hint is redundant here.
    getItems: async ({ resultsObjectId, fetchConfig }) => {
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
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(scope, metricId),
    getModuleScript: (moduleId) =>
      serverActions.getRunModuleScript({
        run_id: scope.runId,
        module_id: moduleId,
      }),
    getModuleLogs: (moduleId) =>
      serverActions.getRunModuleLogs({
        run_id: scope.runId,
        module_id: moduleId,
      }),
    getModuleSettings: (moduleId) =>
      serverActions.getRunModuleWithConfigSelections({
        run_id: scope.runId,
        module_id: moduleId,
      }),
    getSlide: (productId, slideId) =>
      getSlideFromCacheOrFetch(productId, slideId),
    getReplicantOptions: (metricId, replicateBy, fetchConfig) =>
      getReplicantOptionsFromCacheOrFetch(
        scope,
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
}
