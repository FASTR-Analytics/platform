// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Geometry } from "./types_geometry.ts";

// Prior-geometry matching for sticky relayout (PLAN_VIZGRAPH.md §4
// guarantee 3): everything is keyed by caller ids, so matching is a lookup.
// Prior center-y drives both the stage-3 order seed and the stage-4 initial
// stack; nodes absent from the prior fall back to their model seeding.
export type PriorIndex = {
  centerYByNodeId: Map<string, number>;
};

export function buildPriorIndex(
  prior: Geometry | undefined,
): PriorIndex | undefined {
  if (prior === undefined) {
    return undefined;
  }
  const centerYByNodeId = new Map<string, number>();
  for (const [id, node] of Object.entries(prior.nodes)) {
    centerYByNodeId.set(id, node.y + node.h / 2);
  }
  return { centerYByNodeId };
}
