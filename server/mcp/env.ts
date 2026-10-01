import { type AIToolEnv, ALL_DATA_SCOPE_ID, type ServerActionsType } from "lib";

// The /mcp injection of the shared AI-tool environment (lib/ai_tools/env.ts),
// bound to ONE results package: the instance's pinned package, resolved per
// call by the context cache, under the "All data" scope (/mcp has no
// product to take a scope from, and no tool schema accepts one; the SPA
// copilot binds one pair per product mount instead, see D15). Every
// getter is the run-keyed instance route it fronts (D7), dispatched
// in-process through the headless middleware chain (the transport's
// fetchImpl), so the caller's credential is re-judged on every read; the
// approval this surface requires is also judged at the door
// (context_cache.ts).
export function createMcpAIToolEnv(
  serverActions: ServerActionsType,
  runId: string,
): AIToolEnv {
  return {
    getItems: ({ resultsObjectId, fetchConfig }) =>
      serverActions.getRunPresentationObjectItems({
        run_id: runId,
        resultsObjectId,
        fetchConfig,
        scopeId: ALL_DATA_SCOPE_ID,
      }),
    getResultsValueInfo: (metricId) =>
      serverActions.getRunResultsValueInfo({
        run_id: runId,
        metricId,
        scopeId: ALL_DATA_SCOPE_ID,
      }),
  };
}
