import type { AIToolEnv, ServerActionsType } from "lib";

// The /mcp injection of the shared AI-tool environment (lib/ai_tools/env.ts),
// bound to ONE results package — the instance's pinned package, resolved per
// call by the context cache — at national scope. Every getter is the
// run-keyed instance route it fronts (S8 "one core, two lenses"), dispatched
// in-process through the headless middleware chain (the transport's
// fetchImpl), so the caller's credential is re-judged on every read. The
// `can_view_data` bit this surface requires is judged at the door
// (context_cache.ts), not by these routes.
export function createMcpAIToolEnv(
  serverActions: ServerActionsType,
  runId: string,
): AIToolEnv {
  // National scope: adminArea2 null. /mcp has no product to take a scope
  // from, and no tool schema accepts one (D15 — the pin at national scope is
  // this surface's whole (package, scope) pair).
  return {
    getItems: ({ resultsObjectId, fetchConfig }) =>
      serverActions.getRunPresentationObjectItems({
        run_id: runId,
        resultsObjectId,
        fetchConfig,
        adminArea2: null,
      }),
    getResultsValueInfo: (metricId) =>
      serverActions.getRunResultsValueInfo({
        run_id: runId,
        metricId,
        adminArea2: null,
      }),
  };
}
