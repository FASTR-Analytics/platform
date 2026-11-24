// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutNodeNeed, LayoutOverflowCause } from "./types.ts";

// Both lengths are sums of fractional measurements, added in orders that round
// a few units in the last place apart, so content that exactly fills its
// bounds can sum to just above them. A sum of n lengths rounds by at most
// n × 2^-53 of it, so one part in 10^9 of the available length forgives any
// rounding and no content: on a page 1414 high it is 0.0000014 of a design
// unit.
export function isOverflow(need: number, available: number): boolean {
  return need > available + 1e-9 * Math.max(1, available);
}

export function layoutOverflowCause(
  axis: LayoutOverflowCause["axis"],
  need: number,
  available: number,
  availableAlone: number,
  neededBy: LayoutNodeNeed[],
): LayoutOverflowCause {
  return {
    axis,
    need,
    available,
    availableAlone,
    neededBy,
    fault: neededBy.some((part) => isOverflow(part.needAlone, availableAlone))
      ? "part"
      : "arrangement",
  };
}
