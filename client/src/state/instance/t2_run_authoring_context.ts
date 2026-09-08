import type { APIResponseWithData, RunAuthoringContext } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// Everything an author needs FROM a package (modules, metrics with status,
// datasets, indicator vocabularies, the HFA taxonomy, the presets), keyed by
// runId alone. Immutable-by-identity like `t2_runs.ts`: it is a pure function
// of the run directory and a ready run dir never changes, so the version key
// is a constant and nothing ever invalidates an entry (PLAN_PRODUCTS_RESTRUCTURE
// D7). Every product attached to the same package shares the one entry. Bump
// the name whenever RunAuthoringContext changes shape (CLAUDE.md: a cached
// payload's shape change needs a prefix bump).
const _RUN_AUTHORING_CONTEXT_CACHE = createReactiveCache<
  { runId: string },
  RunAuthoringContext
>({
  name: "run_authoring_context",
  uniquenessKeys: (params) => [params.runId],
  versionKey: () => "immutable",
  pdsNotRequired: true,
});

export async function getRunAuthoringContextFromCacheOrFetch(
  runId: string,
): Promise<APIResponseWithData<RunAuthoringContext>> {
  const { data, version } = await _RUN_AUTHORING_CONTEXT_CACHE.get({ runId });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getRunAuthoringContext({ run_id: runId });
  _RUN_AUTHORING_CONTEXT_CACHE.setPromise(promise, { runId }, version);
  return await promise;
}
