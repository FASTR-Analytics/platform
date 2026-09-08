import type { PackageScope, RunAuthoringContext } from "lib";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { projectPackageScope } from "~/state/project/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";

// What a figure container needs to judge and update its figures (D4): the
// live (package, scope) pair and that package's authoring context. The pair
// is a memo with pair equality, so a reattach or scope change re-keys the
// context and lights the badges without a remount, while unrelated project
// store writes do not. Both accessors read undefined while the project has
// no package. Until step 7a the container is the project.
export function createProjectAuthoringScope(): {
  scope: () => PackageScope | undefined;
  authoringContext: () => RunAuthoringContext | undefined;
} {
  const scope = createMemo<PackageScope | undefined>(
    projectPackageScope,
    undefined,
    { equals: (a, b) => a?.runId === b?.runId && a?.adminArea2 === b?.adminArea2 },
  );
  const [authoringContext, setAuthoringContext] = createSignal<
    RunAuthoringContext | undefined
  >();
  createEffect(() => {
    const runId = scope()?.runId;
    setAuthoringContext(undefined);
    if (!runId) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(runId);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });
  return { scope, authoringContext };
}
