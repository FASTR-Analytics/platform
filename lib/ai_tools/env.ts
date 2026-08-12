import type {
  APIResponseWithData,
  DatasetType,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PeriodOption,
  PresentationObjectDetail,
  ReplicantOptionsForPresentationObject,
  ResultsValueInfoForPresentationObject,
  SlideWithMeta,
} from "../types/mod.ts";
import type { DisaggregationLabelConfig } from "../disaggregation_labels.ts";
import type { ServerActionsType } from "../api-routes/server-action-types.ts";

// The injected environment for the shared AI tools (ruling in
// REVIEW_MCP_HOST_ARCHITECTURE.md §RULING): one tool definition AND one
// handler, consumed by the SPA chat and the headless MCP host alike. The SPA
// injects cache-backed getters (reactive caches + request queues); the host
// injects direct server-action fetches. Everything else the tools need is
// reachable through serverActions.
export type AIToolEnv = {
  serverActions: ServerActionsType;
  getItems: (params: {
    projectId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    firstPeriodOption: PeriodOption | undefined;
  }) => Promise<APIResponseWithData<ItemsHolderPresentationObject>>;
  getPODetail: (
    projectId: string,
    presentationObjectId: string,
  ) => Promise<APIResponseWithData<PresentationObjectDetail>>;
  getResultsValueInfo: (
    projectId: string,
    metricId: string,
  ) => Promise<APIResponseWithData<ResultsValueInfoForPresentationObject>>;
  getSlide: (
    projectId: string,
    slideId: string,
  ) => Promise<APIResponseWithData<SlideWithMeta>>;
  getReplicantOptions: (
    projectId: string,
    resultsObjectId: string,
    replicateBy: DisaggregationOption,
    fetchConfig: GenericLongFormFetchConfig,
  ) => Promise<APIResponseWithData<ReplicantOptionsForPresentationObject>>;
  // Instance-level dimension display labels (admin-area names, facility
  // columns). The SPA reads its instance store; the host reads its hydrated
  // snapshot. Facility-column labels are per family — pass the results
  // value's datasetFamily; undefined/iceh yields the generic defaults.
  getDimensionLabelConfig: (
    family: DatasetType | undefined,
  ) => DisaggregationLabelConfig;
};
