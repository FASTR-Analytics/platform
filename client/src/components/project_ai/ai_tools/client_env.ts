import { AIToolFailure } from "panther";
import type {
  AIToolEnv,
  APIResponseWithData,
  DatasetType,
  DisaggregationLabelConfig,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  PresentationObjectDetail,
  ReplicantOptionsForPresentationObject,
  SlideWithMeta,
} from "lib";
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
import { getSnapshotProjectState } from "~/state/project/t1_store";

// The SPA's injection of the shared AI-tool environment (lib/ai_tools/env.ts),
// bound to ONE project at construction: cache-backed getters over the
// project routes (so chat tool calls share cache entries with the interactive
// UI), plus the SPA-only getters the client tools need — project content
// (PO detail, slides) and figure-shaping helpers (replicant options,
// dimension labels). One env per project, memoized — client code stays keyed
// by projectId and derives the bound env at the lib boundary
// (`clientAIToolEnvFor(projectId)`), so components and helpers that hold only
// a project id never thread an env.
//
// The package behind the module reads is resolved from project T1 AT CALL
// TIME, so a mid-conversation repoint moves the tools to the newly attached
// package (the ruling in lib/ai_tools/tools_modules.ts).
export type ClientAIToolEnv = AIToolEnv & {
  getPODetail: (
    presentationObjectId: string,
  ) => Promise<APIResponseWithData<PresentationObjectDetail>>;
  getSlide: (slideId: string) => Promise<APIResponseWithData<SlideWithMeta>>;
  getReplicantOptions: (
    resultsObjectId: string,
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

function requireAttachedRunId(): string {
  const runId = getSnapshotProjectState().attachedRunId;
  if (runId === null) {
    throw new AIToolFailure("This project has no results package attached.");
  }
  return runId;
}

const envs = new Map<string, ClientAIToolEnv>();

export function clientAIToolEnvFor(projectId: string): ClientAIToolEnv {
  const existing = envs.get(projectId);
  if (existing) return existing;
  const env = createClientAIToolEnv(projectId);
  envs.set(projectId, env);
  return env;
}

function createClientAIToolEnv(projectId: string): ClientAIToolEnv {
  return {
    getItems: async ({ resultsObjectId, fetchConfig, firstPeriodOption }) => {
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
        })
      );
      _PO_ITEMS_CACHE.setPromise(
        newPromise,
        { projectId, resultsObjectId, fetchConfig },
        version,
      );
      return await newPromise;
    },
    getResultsValueInfo: (metricId) =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        projectId,
        metricId,
      ),
    getModuleScript: (moduleId) =>
      serverActions.getRunModuleScript({
        run_id: requireAttachedRunId(),
        module_id: moduleId,
      }),
    getModuleLogs: (moduleId) =>
      serverActions.getRunModuleLogs({
        run_id: requireAttachedRunId(),
        module_id: moduleId,
      }),
    getModuleSettings: (moduleId) =>
      serverActions.getRunModuleWithConfigSelections({
        run_id: requireAttachedRunId(),
        module_id: moduleId,
      }),
    getPODetail: (presentationObjectId) =>
      getPODetailFromCacheorFetch(projectId, presentationObjectId),
    getSlide: (slideId) => getSlideFromCacheOrFetch(projectId, slideId),
    getReplicantOptions: (resultsObjectId, replicateBy, fetchConfig) =>
      getReplicantOptionsFromCacheOrFetch(
        projectId,
        resultsObjectId,
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
