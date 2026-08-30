// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  PNode,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { GroupIndex } from "../../transform/derive.ts";
import type { ResolvedSpacing } from "../../types_options.ts";

// Step 4.1 — group pads, after ordering: the first member of each group's
// per-layer run reserves the group inset, the last reserves the inset below —
// placement passes keep that clearance (PNode pads), so derived boxes never
// collide with neighboring nodes or sibling boxes. The label header row is
// reserved ONLY in the group's first (top-left) spanned layer — the strip
// that carries the label; every other layer's run gets the bare inset.
// Nested groups accumulate.
export const padsStep: PipelineStep = {
  id: "4.1",
  name: "pads",
  run: (state) =>
    assignGroupPads(state.proper!, state.groupIndex, state.spacing),
};

export function assignGroupPads(
  proper: ProperGraph,
  groupIndex: GroupIndex,
  spacing: ResolvedSpacing,
): void {
  if (groupIndex.groupById.size === 0) {
    return;
  }
  const firstLayerByGroupId = new Map<string, number>();
  proper.layers.forEach((layer, layerIdx) => {
    for (const pnode of layer) {
      if (pnode.isDummy) {
        continue;
      }
      for (const groupId of groupIndex.chainByNodeId.get(pnode.id) ?? []) {
        if (!firstLayerByGroupId.has(groupId)) {
          firstLayerByGroupId.set(groupId, layerIdx);
        }
      }
    }
  });
  proper.layers.forEach((layer, layerIdx) => {
    const runs = new Map<string, { first: PNode; last: PNode }>();
    for (const pnode of layer) {
      if (pnode.isDummy) {
        continue;
      }
      for (const groupId of groupIndex.chainByNodeId.get(pnode.id) ?? []) {
        const run = runs.get(groupId);
        if (run === undefined) {
          runs.set(groupId, { first: pnode, last: pnode });
        } else {
          if (pnode.order < run.first.order) {
            run.first = pnode;
          }
          if (pnode.order > run.last.order) {
            run.last = pnode;
          }
        }
      }
    }
    for (const [groupId, run] of runs) {
      const group = groupIndex.groupById.get(groupId)!;
      const headerH = firstLayerByGroupId.get(groupId) === layerIdx
        ? group.label?.h ?? 0
        : 0;
      run.first.padTop += spacing.groupPad + headerH;
      run.last.padBottom += spacing.groupPad;
    }
  });
}
