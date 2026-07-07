// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ProperGraph } from "../_internal/pipeline_types.ts";
import type { PriorIndex } from "../stability.ts";
import type { ResolvedSpacing } from "../types_options.ts";
import type { PassContext, PlacementPlan } from "../placement/types.ts";
import { seedStack } from "../placement/seed.ts";
import { attachSweeps } from "../placement/attach.ts";
import { symmetricFinish } from "../placement/symmetric.ts";
import { layerBalance } from "../placement/balance.ts";
import { straighten } from "../placement/straighten.ts";

// Stage 4: y-placement as a SCHEDULE of quality passes — this file is a thin
// runner; the strategies, their contract, and the catalog live in
// placement/ + DOC_VIZGRAPH_PLACEMENT.md. Brandes-Köpf (M7) lands as an
// alternative schedule behind coordinateMode. x is assigned in stage 5:
// per-layer column x needs each gutter's packed track count (columns
// reserve width for track bundles), which needs final y.
const BUDGE_PLAN: PlacementPlan = [
  seedStack(),
  attachSweeps(),
  symmetricFinish(),
  layerBalance(),
  straighten(),
];

export function coordsStage(
  proper: ProperGraph,
  spacing: ResolvedSpacing,
  prior: PriorIndex | undefined,
): void {
  const ctx: PassContext = { spacing, prior };
  for (const pass of BUDGE_PLAN) {
    pass.run(proper, ctx);
  }
  normalizeY(proper);
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
