// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import type { RegionIndex, ResolvedZone } from "../../_internal/regions.ts";
import type { RankResult } from "./_1_1_rank.ts";

// Step 1.3: zone claims resolved against the layers. Each zone group takes
// the contiguous layer-index range of its members.
// Nothing can be violated here — membership is the nesting tree (nested or
// disjoint by construction); the cross-axis territory is settled by the
// coherent ordering (step 3.2) and the zone-reserve placement pass. A zone
// with no visible member (folded away, or memberless) claims nothing.
export const zonesStep: PipelineStep = {
  id: "1.3",
  name: "zones",
  when: (state) => state.regions.zones.length > 0,
  run: (state) => {
    state.zones = resolveZones(state.regions, state.rank!);
  },
};

export function resolveZones(
  regions: RegionIndex,
  rank: RankResult,
): ResolvedZone[] {
  const resolved: ResolvedZone[] = [];
  for (const region of regions.zones) {
    const layers = region.memberIds
      .map((id) => rank.layerIndexByNodeId.get(id))
      .filter((layer): layer is number => layer !== undefined);
    if (layers.length === 0) {
      continue;
    }
    resolved.push({
      region,
      fromLayerIndex: Math.min(...layers),
      toLayerIndex: Math.max(...layers),
    });
  }
  return resolved;
}
