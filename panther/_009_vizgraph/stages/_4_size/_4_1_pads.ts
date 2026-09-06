// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  GroupRuns,
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
// Nested groups accumulate. The runs themselves are recorded on the proper
// graph (groupRuns) with each group's own box insets, for the zone
// machinery: a run's first member is also the first member of every
// nested run it belongs to, so a group's box top sits Σ(pad + header) over
// the member's chain up to that group above it.
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
  const contribution = (groupId: string, layerIdx: number): number => {
    const group = groupIndex.groupById.get(groupId)!;
    const headerH = firstLayerByGroupId.get(groupId) === layerIdx
      ? group.label?.h ?? 0
      : 0;
    return spacing.groupPad + headerH;
  };
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
      run.first.padTop += contribution(groupId, layerIdx);
      run.last.padBottom += spacing.groupPad;
    }
    for (const [groupId, run] of runs) {
      let insetTop = 0;
      for (const id of groupIndex.chainByNodeId.get(run.first.id) ?? []) {
        insetTop += contribution(id, layerIdx);
        if (id === groupId) {
          break;
        }
      }
      let insetBottom = 0;
      for (const id of groupIndex.chainByNodeId.get(run.last.id) ?? []) {
        insetBottom += spacing.groupPad;
        if (id === groupId) {
          break;
        }
      }
      let record: GroupRuns | undefined = proper.groupRuns.get(groupId);
      if (record === undefined) {
        record = {
          firstLayerIndex: firstLayerByGroupId.get(groupId)!,
          byLayer: new Map(),
        };
        proper.groupRuns.set(groupId, record);
      }
      record.byLayer.set(layerIdx, {
        first: run.first,
        last: run.last,
        insetTop,
        insetBottom,
      });
    }
  });
}
