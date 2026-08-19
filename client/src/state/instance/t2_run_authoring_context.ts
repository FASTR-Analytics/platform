import type {
  APIResponseWithData,
  HfaTaxonomyForAI,
  RunAuthoringContext,
} from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";
import { instanceState } from "./t1_store";

// Everything an author needs FROM a package — modules, metrics (with status),
// datasets, the indicator vocabularies, the HFA taxonomy and the presets —
// keyed by runId alone. Immutable-by-identity like `t2_runs.ts`: it is a pure
// function of the run directory, and a ready run dir never changes, so the
// version key is a constant and nothing ever invalidates an entry (D7). Every
// product attached to the same package shares the one entry.
//
// It deliberately carries NO scope: scope changes what a figure QUERY returns,
// never what exists to author against. And no HFA time points — those are
// instance-wide T1 (`hfaTimePoints`), composed in by the consumer rather than
// frozen into an immutable per-run payload.
//
// Bump the name whenever RunAuthoringContext changes shape (CLAUDE.md: a
// cached payload's shape change needs a prefix bump).
const _RUN_AUTHORING_CONTEXT_CACHE = createReactiveCache<
  { runId: string },
  RunAuthoringContext
>({
  name: "run_authoring_context",
  uniquenessKeys: (params) => [params.runId],
  versionKey: () => "immutable",
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

// The full taxonomy the copilot answers HFA questions from: the package's own
// half plus the instance's survey rounds (§2.5). The seam is deliberate — HFA
// rounds are instance-wide T1, so an import that adds a round updates every
// package's taxonomy at once instead of stranding it inside immutable payloads.
// `id` IS the label: it is the time_point value that appears in data and
// filters (the label is that table's PK).
//
// A LIVE read of `hfaTimePoints` — call it inside the tracking scope that
// renders or sends the taxonomy, not before an await.
export function composeHfaTaxonomy(
  context: RunAuthoringContext,
): HfaTaxonomyForAI {
  return {
    ...context.hfaTaxonomy,
    timePoints: instanceState.hfaTimePoints.map((tp) => ({
      id: tp.label,
      label: tp.label,
      periodId: tp.periodId,
    })),
  };
}
