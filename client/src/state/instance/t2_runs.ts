import type { RunDetail } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// What a READY results package contains (per-module settings + files), keyed
// by runId alone. Immutable-by-identity like `products/t2_images.ts`: a ready
// run dir never changes and `ready` is terminal, so the version key is a
// constant and nothing ever invalidates an entry — a deleted run's entry is
// simply never read again. Bump the name whenever RunDetail changes shape
// (CLAUDE.md: a cached payload's shape change needs a prefix bump).
const _RUN_DETAIL_CACHE = createReactiveCache<{ runId: string }, RunDetail>({
  name: "run_detail",
  uniquenessKeys: (params) => [params.runId],
  versionKey: () => "immutable",
});

export async function getRunDetailFromCacheOrFetch(runId: string) {
  const { data, version } = await _RUN_DETAIL_CACHE.get({ runId });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getRunDetail({ run_id: runId });
  _RUN_DETAIL_CACHE.setPromise(promise, { runId }, version);
  return await promise;
}
