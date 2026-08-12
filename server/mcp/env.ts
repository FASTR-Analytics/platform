import type { AIToolEnv, InstanceState, ServerActionsType } from "lib";

// The server-side injection of the shared AI-tool environment — the
// createHostAIToolEnv shape (mcp_host/env.ts), recreated for the /mcp
// endpoint (PLAN_112 step 4): every getter is a direct call to the server
// action it fronts, and those actions dispatch in-process through the PAT
// middleware chain (the transport's fetchImpl). Dimension labels come off the
// instance state the context cache resolved for this principal.
export function createMcpAIToolEnv(
  serverActions: ServerActionsType,
  instanceState: InstanceState,
): AIToolEnv {
  return {
    serverActions,
    getItems: (
      { projectId, resultsObjectId, fetchConfig, firstPeriodOption },
    ) =>
      serverActions.getPresentationObjectItems({
        projectId,
        resultsObjectId,
        fetchConfig,
        firstPeriodOption,
      }),
    getPODetail: (projectId, presentationObjectId) =>
      serverActions.getPresentationObjectDetail({
        projectId,
        po_id: presentationObjectId,
      }),
    getResultsValueInfo: (projectId, metricId) =>
      serverActions.getResultsValueInfoForPresentationObject({
        projectId,
        metricId,
      }),
    getSlide: (projectId, slideId) =>
      serverActions.getSlide({ projectId, slide_id: slideId }),
    getReplicantOptions: (
      projectId,
      resultsObjectId,
      replicateBy,
      fetchConfig,
    ) =>
      serverActions.getReplicantOptions({
        projectId,
        resultsObjectId,
        replicateBy,
        fetchConfig,
      }),
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
