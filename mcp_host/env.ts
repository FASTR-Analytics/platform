import type { AIToolEnv, ServerActionsType } from "lib";
import { instanceSnapshot } from "./snapshot.ts";

// The headless injection of the shared AI-tool environment (lib/ai_tools/
// env.ts): every getter is a direct call to the server action it fronts —
// the ruling's counterpart to the SPA's cache-backed clientAIToolEnv. All
// backing routes are on the /pat allowlist. Dimension labels come off the
// hydrated instance snapshot at call time (the ready gate runs before any
// tool call, so the snapshot is always hydrated here).
export function createHostAIToolEnv(
  serverActions: ServerActionsType,
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
    getDimensionLabelConfig: () => ({
      adminAreaLabels: instanceSnapshot.adminAreaLabels,
      facilityColumns: instanceSnapshot.facilityColumns,
    }),
  };
}
