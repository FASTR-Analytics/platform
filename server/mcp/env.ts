import type { AIToolEnv, ServerActionsType } from "lib";

// The /mcp injection of the shared AI-tool environment (lib/ai_tools/env.ts),
// bound to ONE results package — the instance's pinned package, resolved per
// call by the context cache — at national scope. Every getter is the
// run-keyed instance route it fronts (S8 "one core, two lenses"), dispatched
// in-process through the headless middleware chain (the transport's
// fetchImpl), so the caller's instance `can_view_data` is judged on every
// read.
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
      }),
    getResultsValueInfo: (metricId) =>
      serverActions.getRunResultsValueInfo({ run_id: runId, metricId }),
  };
}
