import type { RunCatalogItem } from "lib";

// The prune rule set (PLAN_PRUNE §0): one rule today. A new rule is one
// more member here and one more branch in `planPrune` — the modal renders
// whatever the plan says.
export type PruneRule = "not_in_use";

export type KeepReason = "pinned" | "generating" | "in_use";

export type PrunePlan = {
  delete: RunCatalogItem[];
  keep: { run: RunCatalogItem; reason: KeepReason }[];
};

// Pure: what the guard in deleteRunCatalogRow will accept, derived from the
// same T1 facts the sidebar shows. Newest first, matching the sidebar.
export function planPrune(
  rule: PruneRule,
  catalog: RunCatalogItem[],
  pinnedRunId: string | null,
): PrunePlan {
  const sorted = [...catalog].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const plan: PrunePlan = { delete: [], keep: [] };
  for (const run of sorted) {
    const reason = keepReason(rule, run, pinnedRunId);
    if (reason === null) {
      plan.delete.push(run);
    } else {
      plan.keep.push({ run, reason });
    }
  }
  return plan;
}

function keepReason(
  rule: PruneRule,
  run: RunCatalogItem,
  pinnedRunId: string | null,
): KeepReason | null {
  switch (rule) {
    case "not_in_use":
      if (run.status === "generating") return "generating";
      if (run.id === pinnedRunId) return "pinned";
      if (run.attachedProjects.length > 0) return "in_use";
      return null;
  }
}
