import { createEffect, createMemo, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  EMPTY_HFA_TAXONOMY,
  packageScopesEqual,
  type HfaTaxonomyForAI,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type PackageScope,
  type RunDataset,
} from "lib";
import { AIToolFailure } from "panther";
import { instanceState } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { resolveCopilotScope } from "./ai_views";

// ============================================================================
// The copilot's live (package, scope) binding + authoring context
// ============================================================================
//
// The env's pair is the OPEN product's while an `editing_*` view is active,
// else the instance pin at national scope (D15). Both halves move
// mid-conversation, and the tools array is built exactly ONCE at wrapper setup
// — panther registers `config.tools` into its ToolRegistry at chat
// construction and never re-reads the array. So the tool-aliasing invariant
// (SYSTEM_13 "Tool freshness rests on store aliasing, not reactivity") is what
// keeps the copilot pointed at the right package: this store is RECONCILED IN
// PLACE, so `metrics`, `icehIndicators` and `hfaTaxonomy` keep their object
// identity across a package switch and the arrays captured by the shared
// tool factories stay live. Replacing any of these fields with a fresh
// array/object instead of reconciling would silently freeze the AI's world
// with no error — the same failure the /mcp host avoids by hydrating its
// captured arrays in place.
//
// `scope` is read through `requireCopilotScope()` at CALL time rather than
// captured, because a handler that ran under one product may finish under
// another.

export type CopilotAuthoringContext = {
  // null = nothing to bind to: no product open and no pinned package.
  scope: PackageScope | null;
  modules: InstalledModuleSummary[];
  metrics: MetricWithStatus[];
  datasets: RunDataset[];
  commonIndicators: { id: string; label: string }[];
  icehIndicators: { id: string; label: string; category: string }[];
  hfaTaxonomy: HfaTaxonomyForAI;
};

const EMPTY_CONTEXT: CopilotAuthoringContext = {
  scope: null,
  modules: [],
  metrics: [],
  datasets: [],
  commonIndicators: [],
  icehIndicators: [],
  hfaTaxonomy: structuredClone(EMPTY_HFA_TAXONOMY),
};

const [copilotAuthoringContext, setCopilotAuthoringContext] =
  createStore<CopilotAuthoringContext>(structuredClone(EMPTY_CONTEXT));

export { copilotAuthoringContext };

// The ONE place a tool handler learns which package + scope it is serving.
// Throws rather than returning null: every data tool needs a pair, and the
// failure is anticipated (a fresh instance with nothing generated yet).
export function requireCopilotScope(): PackageScope {
  const scope = copilotAuthoringContext.scope;
  if (scope === null) {
    throw new AIToolFailure(
      "No results package is available. Open a slide deck or report, or ask an instance admin to generate and pin a results package.",
    );
  }
  // A SNAPSHOT, deliberately: the store's own object is reconciled in place,
  // so a caller holding it across an await would silently see the next
  // product's pair. The pair a handler read is the pair it must finish with.
  return { runId: scope.runId, adminArea2: scope.adminArea2 };
}

// Label + generation timestamp of the package the env is currently bound to,
// from T1 `readyPackages`. A product attached to a package that is no longer
// ready has no entry — the run id is the honest fallback rather than a
// fabricated label.
export function describeCopilotPackage(): {
  label: string;
  createdAt: string | null;
} {
  const scope = copilotAuthoringContext.scope;
  if (scope === null) return { label: "(none)", createdAt: null };
  const pkg = instanceState.readyPackages.find((p) => p.id === scope.runId);
  return pkg
    ? { label: pkg.label, createdAt: pkg.createdAt }
    : { label: scope.runId, createdAt: null };
}

export function describeCopilotScope(): string {
  const scope = copilotAuthoringContext.scope;
  if (scope === null) return "none";
  return scope.adminArea2 === null ? "national" : scope.adminArea2;
}

// Mount-time wiring. Two effects, deliberately separate:
//
//  1. the pair + the package's authoring context (immutable per runId, so the
//     T2 cache answers instantly on every revisit);
//  2. the HFA survey rounds, which are instance-wide T1 and therefore NOT in
//     the per-run payload (`composeHfaTaxonomy`'s seam) — an import that adds
//     a round must reach the copilot without refetching every package.
//
// Called from the wrapper so both effects live under its owner and dispose
// with it.
export function mountCopilotAuthoringContext(): void {
  // Referentially stable while the pair is unchanged: the view controller's
  // `current()` returns a FRESH state object on every setView, so without this
  // memo the effect below would re-run (and re-reconcile the whole context) on
  // every navigation within one product. Returning `prev` unchanged is what
  // makes the memo's `===` guard swallow it.
  const stableScope = createMemo<PackageScope | null>((prev) => {
    const next = resolveCopilotScope();
    return prev !== null && next !== null && packageScopesEqual(prev, next)
      ? prev
      : next;
  }, null);

  createEffect(() => {
    const scope = stableScope();
    setCopilotAuthoringContext("scope", scope === null ? null : reconcile(scope));
    if (scope === null) {
      applyEmptyPackage();
      return;
    }
    let stale = false;
    onCleanup(() => {
      stale = true;
    });
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(scope.runId);
      // A slower earlier fetch must never land on top of a newer pair.
      if (stale) return;
      if (!res.success) {
        applyEmptyPackage();
        return;
      }
      const ctx = res.data;
      setCopilotAuthoringContext("modules", reconcile(ctx.modules));
      setCopilotAuthoringContext("metrics", reconcile(ctx.metrics));
      setCopilotAuthoringContext("datasets", reconcile(ctx.datasets));
      setCopilotAuthoringContext(
        "commonIndicators",
        reconcile(ctx.commonIndicators),
      );
      setCopilotAuthoringContext(
        "icehIndicators",
        reconcile(ctx.icehIndicators),
      );
      // A store set with a PLAIN OBJECT merges, and `RunAuthoringContext`'s
      // taxonomy carries no `timePoints` — so this writes the package's six
      // halves and leaves the instance-owned rounds (second effect) alone.
      setCopilotAuthoringContext("hfaTaxonomy", ctx.hfaTaxonomy);
    })();
  });

  createEffect(() => {
    // `id` IS the label: it is the time_point value that appears in data and
    // filters (the label is that table's PK). The .map() is the tracked read.
    const timePoints = instanceState.hfaTimePoints.map((tp) => ({
      id: tp.label,
      label: tp.label,
      periodId: tp.periodId,
    }));
    setCopilotAuthoringContext(
      "hfaTaxonomy",
      "timePoints",
      reconcile(timePoints),
    );
  });
}

function applyEmptyPackage(): void {
  setCopilotAuthoringContext("modules", reconcile([]));
  setCopilotAuthoringContext("metrics", reconcile([]));
  setCopilotAuthoringContext("datasets", reconcile([]));
  setCopilotAuthoringContext("commonIndicators", reconcile([]));
  setCopilotAuthoringContext("icehIndicators", reconcile([]));
  setCopilotAuthoringContext("hfaTaxonomy", {
    categories: [],
    subCategories: [],
    serviceCategories: [],
    variantGroups: [],
    variantItems: [],
    indicators: [],
  });
}
