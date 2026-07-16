// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PNode, ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PriorIndex } from "../stability.ts";

// The placement-pass architecture (DOC_VIZGRAPH_PLACEMENT.md): a pass is ONE
// quality strategy. It may adjust PNode.y ONLY — never order, layer, or
// size — and must preserve in-layer order, required separation, and
// determinism. Schedules (PlacementPlan) are data, resolved by the stage-4
// runner; the loose-vs-compact taste dial is pass parameters, never
// separate code paths.
export type PassContext = {
  spacing: ResolvedSpacing;
  prior: PriorIndex | undefined;
};

export type PlacementPass = {
  name: string;
  run: (proper: ProperGraph, ctx: PassContext) => void;
};

export type PlacementPlan = PlacementPass[];

// The clearance every pass must keep between two order-adjacent nodes:
// nodeGap plus whatever group-box padding each side reserves (PNode pads —
// M6). With no groups this is exactly nodeGap.
export function requiredGap(
  above: PNode,
  below: PNode,
  spacing: ResolvedSpacing,
): number {
  return spacing.nodeGap + above.padBottom + below.padTop;
}
