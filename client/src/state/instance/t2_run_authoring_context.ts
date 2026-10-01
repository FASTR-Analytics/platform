import type {
  APIResponseWithData,
  ResolvedPackageScope,
  RunAuthoringContext,
} from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";
import { answersKeyedScope } from "./t1_store";

// Everything an author needs FROM a package under a scope (modules, metrics
// with status, datasets, indicator vocabularies, the HFA taxonomy, the
// presets), keyed by `(runId, definitionHash)`. Immutable-by-identity like
// `t2_runs.ts`: it is a pure function of the run directory and the scope
// definition, and a ready run dir never changes, so the version key is a
// constant and nothing ever invalidates an entry (PLAN_PRODUCTS_RESTRUCTURE
// D7). Every product attached to the same package under the same definition
// shares the one entry. Bump the name whenever RunAuthoringContext changes
// shape (CLAUDE.md: a cached payload's shape change needs a prefix bump).
// The caller resolves the pair (resolveScope) inside its own reactive scope,
// so an edit to the scope's definition re-reads.
const _RUN_AUTHORING_CONTEXT_CACHE = createReactiveCache<
  { scope: ResolvedPackageScope },
  RunAuthoringContext
>({
  name: "run_authoring_context_v4",
  uniquenessKeys: (params) => [
    params.scope.runId,
    params.scope.definitionHash,
  ],
  versionKey: () => "immutable",
  shouldStore: answersKeyedScope,
});

export async function getRunAuthoringContextFromCacheOrFetch(
  scope: ResolvedPackageScope,
): Promise<APIResponseWithData<RunAuthoringContext>> {
  const params = { scope };
  const { data, version } = await _RUN_AUTHORING_CONTEXT_CACHE.get(params);
  if (data) return { success: true, data } as const;

  const promise = serverActions.getRunAuthoringContext({
    run_id: scope.runId,
    scopeId: scope.scopeId,
  });
  _RUN_AUTHORING_CONTEXT_CACHE.setPromise(promise, params, version);
  return await promise;
}
