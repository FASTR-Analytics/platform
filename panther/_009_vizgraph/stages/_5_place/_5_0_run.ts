// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { GraphModel } from "../../types_model.ts";
import type { LayoutOptions, ResolvedSpacing } from "../../types_options.ts";
import type { PassContext, PlacementPlan } from "../../placement/types.ts";
import { seedStack } from "../../placement/seed.ts";
import { attachSweeps } from "../../placement/attach.ts";
import { symmetricFinish } from "../../placement/symmetric.ts";
import { layerBalance } from "../../placement/balance.ts";
import { straighten } from "../../placement/straighten.ts";
import { compaction } from "../../placement/compact.ts";
import { adoptIsolates } from "../../placement/adopt_isolates.ts";
import { brandesKoepf } from "../../placement/brandes_koepf.ts";
import { voidBound } from "../../placement/void_bound.ts";

// Stage 5: y-placement as a SCHEDULE of quality passes — this file is a thin
// runner; the strategies, their contract, and the catalog live in
// placement/ + DOC_VIZGRAPH_PLACEMENT.md. x is assigned in stage 6:
// per-layer column x needs each gutter's packed track count (columns
// reserve width for track bundles), which needs final y.
const BUDGE_PLAN: PlacementPlan = [
  seedStack(),
  attachSweeps(),
  symmetricFinish(),
  layerBalance(),
  straighten(),
  compaction(),
  adoptIsolates(),
  voidBound(),
];

// coordinateMode selects the schedule (M7): the default budge plan, or
// Brandes-Köpf + adopt-isolates (BK never sees same-layer edges, so
// same-layer-only isolates still need adopting). constraints.align biases
// BK's alignment choice; hints.align follows at lower precedence. Both
// schedules end on void-bound: the whitespace invariant is a property of
// the drawing, not of a coordinate strategy.
export function resolvePlan(
  model: GraphModel,
  options: LayoutOptions | undefined,
): PlacementPlan {
  if (options?.coordinateMode === "brandes-koepf") {
    const alignClasses = [
      ...(model.constraints?.align ?? []),
      ...(model.hints?.align ?? []),
    ];
    return [brandesKoepf({ alignClasses }), adoptIsolates(), voidBound()];
  }
  return BUDGE_PLAN;
}

// The stage-5 sequence: the resolved schedule's passes in order, then the
// origin normalization — ONE definition, two executors. The registry
// (placeSteps) numbers it dynamically per schedule (`5.1 seed-stack` …
// under budge; `5.1 brandes-koepf` … under BK; normalize always last);
// placeStage runs the same sequence unobserved for step 4.3's re-entries.
function sequence(plan: PlacementPlan): PlacementPlan {
  return [...plan, {
    name: "normalize",
    run: (proper) => normalizeY(proper),
  }];
}

export function placeSteps(plan: PlacementPlan): PipelineStep[] {
  return sequence(plan).map((pass, i) => ({
    id: `5.${i + 1}`,
    name: pass.name,
    run: (state) => pass.run(state.proper!, { spacing: state.spacing }),
  }));
}

export function placeStage(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
  plan: PlacementPlan,
): void {
  const ctx: PassContext = { spacing };
  for (const pass of sequence(plan)) {
    pass.run(proper, ctx);
  }
}

function normalizeY(proper: ProperGraph): void {
  const all = proper.layers.flat();
  if (all.length === 0) {
    return;
  }
  const minY = Math.min(...all.map((p) => p.y));
  for (const pnode of all) {
    pnode.y -= minY;
  }
}
