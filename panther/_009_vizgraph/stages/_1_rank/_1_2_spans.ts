// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import type { GraphIndex } from "../../_internal/graph_index.ts";
import type { RegionIndex, ResolvedSpan } from "../../_internal/regions.ts";
import type { LayoutWarning } from "../../types_geometry.ts";
import type { RankResult } from "./_1_1_rank.ts";

// Step 1.2: span claims resolved against the layers. Each lane / span
// group takes the contiguous layer-index range of its members, then keeps
// its claim only if (1) every node in that range is a member (exclusive
// along the flow axis — otherwise a lane box would lie) and (2) it is
// nested-or-disjoint against every earlier survivor (spans form a laminar
// family). Violations are warnings, never throws; a dropped claim leaves
// the drawing exactly as it would be without it. Lanes listed out of flow
// order keep their claims and warn.
export const spansStep: PipelineStep = {
  id: "1.2",
  name: "spans",
  when: (state) => state.regions.spans.length > 0,
  run: (state) => {
    state.spans = resolveSpans(
      state.regions,
      state.rank!,
      state.index,
      state.warnings,
    );
  },
};

export function resolveSpans(
  regions: RegionIndex,
  rank: RankResult,
  index: GraphIndex,
  warnings: LayoutWarning[],
): ResolvedSpan[] {
  const resolved: ResolvedSpan[] = [];
  for (const region of regions.spans) {
    const layers = region.memberIds
      .map((id) => rank.layerIndexByNodeId.get(id))
      .filter((layer): layer is number => layer !== undefined);
    if (layers.length === 0) {
      continue;
    }
    const fromLayerIndex = Math.min(...layers);
    const toLayerIndex = Math.max(...layers);
    const members = new Set(region.memberIds);
    const intruders: string[] = [];
    for (const nodeId of index.nodeById.keys()) {
      const layer = rank.layerIndexByNodeId.get(nodeId)!;
      if (
        layer >= fromLayerIndex && layer <= toLayerIndex && !members.has(nodeId)
      ) {
        intruders.push(nodeId);
      }
    }
    if (intruders.length > 0) {
      warnings.push({
        code: "span-violated",
        message:
          `${region.source} "${region.id}" claims layers ${fromLayerIndex}–${toLayerIndex} but non-members sit there; the claim is dropped`,
        ids: [region.id, ...intruders.sort()],
      });
      continue;
    }
    const clash = resolved.find((other) =>
      !(other.toLayerIndex < fromLayerIndex ||
        other.fromLayerIndex > toLayerIndex ||
        (other.fromLayerIndex <= fromLayerIndex &&
          other.toLayerIndex >= toLayerIndex) ||
        (fromLayerIndex <= other.fromLayerIndex &&
          toLayerIndex >= other.toLayerIndex))
    );
    if (clash !== undefined) {
      warnings.push({
        code: "span-violated",
        message:
          `${region.source} "${region.id}" overlaps "${clash.region.id}" without nesting; the claim is dropped`,
        ids: [region.id, clash.region.id],
      });
      continue;
    }
    resolved.push({ region, fromLayerIndex, toLayerIndex });
  }
  const lanes = resolved.filter((span) => span.region.source === "lane");
  for (let i = 1; i < lanes.length; i++) {
    if (lanes[i].fromLayerIndex < lanes[i - 1].fromLayerIndex) {
      warnings.push({
        code: "lane-order",
        message: `lane "${lanes[i].region.id}" is listed after "${
          lanes[i - 1].region.id
        }" but its layers come first`,
        ids: [lanes[i - 1].region.id, lanes[i].region.id],
      });
    }
  }
  return resolved;
}
