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
import { instanceState, resolveScope } from "~/state/instance/t1_store";

// The SPA's injection of the shared AI-tool environment (lib/ai_tools/env.ts):
// cache-backed getters over the run-keyed package routes (so chat tool calls
// share cache entries with the interactive UI), plus the SPA-only getters the
// client tools need: module internals (script, logs, settings), product
// content (slides) and figure-shaping helpers (replicant options, dimension
// labels).
//
// One env per inner tool set, built for the pair the call's view shows
// (bind_package_tools.ts): the package tools the chat registers are outer
// tools bound per call, so a reattach or rescope changes the env at the next
// call with no remount. No run id crosses the tool seam and none appears in
// a tool schema.

// The run-keyed reads of how a package was produced. What a package contains
// is a function of the run id alone, so these bind by run id (no scope) and
// answer for a package that is still generating or has failed.
export type ModuleInternalsEnv = {
  getModuleScript: (
    moduleId: string,
  ) => Promise<APIResponseWithData<{ script: string }>>;
  getModuleLogs: (
    moduleId: string,
  ) => Promise<APIResponseWithData<{ logs: string }>>;
  getModuleSettings: (
    moduleId: string,
  ) => Promise<APIResponseWithData<InstalledModuleWithConfigSelections>>;
};

export type ClientAIToolEnv = AIToolEnv & ModuleInternalsEnv & {
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

export function createModuleInternalsEnv(runId: string): ModuleInternalsEnv {
  return {
    getModuleScript: (moduleId) =>
      serverActions.getRunModuleScript({ run_id: runId, module_id: moduleId }),
    getModuleLogs: (moduleId) =>
      serverActions.getRunModuleLogs({ run_id: runId, module_id: moduleId }),
    getModuleSettings: (moduleId) =>
      serverActions.getRunModuleWithConfigSelections({
        run_id: runId,
        module_id: moduleId,
      }),
  };
}

export function createCopilotAIToolEnv(scope: PackageScope): ClientAIToolEnv {
  return {
    ...createModuleInternalsEnv(scope.runId),
    getItems: async ({ resultsObjectId, fetchConfig }) => {
      const params = {
        scope: resolveScope(scope),
        resultsObjectId,
        fetchConfig,
      };
      const { data, version } = await _PO_ITEMS_CACHE.get(params);
      if (data) {
        return { success: true, data };
      }
      const newPromise = poItemsQueue.enqueue(() =>
        serverActions.getRunPresentationObjectItems({
          run_id: scope.runId,
          resultsObjectId,
          fetchConfig,
          scopeId: scope.scopeId,
        })
      );
      _PO_ITEMS_CACHE.setPromise(newPromise, params, version);
      return await newPromise;
    },
    getResultsValueInfo: (metricId) =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(scope, metricId),
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
