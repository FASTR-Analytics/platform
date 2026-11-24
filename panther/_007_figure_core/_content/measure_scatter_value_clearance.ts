// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { OverhangClearance } from "../types.ts";
import type { ValueAxisReach } from "./content_generation_types.ts";

export type ScatterValueAxisReach = ValueAxisReach & { fraction: number };

const MAX_SOLVE_ROUNDS = 64;
const SETTLED = 1e-9;

// A point at fraction f of the range, reaching l toward the start side and r
// toward the end side, stays inside an extent W when
// cs + (W - cs - ce) f >= l and ce + (W - cs - ce)(1 - f) >= r. Each side is
// solved with the other held and the two are taken in turn: each step only
// raises a side, since each side's bound grows with the other, so the turns
// settle on the least clearance that holds every point, or, where no
// clearance does, stop at the extent, which the caller's clamp then bounds.
// A point off the range is drawn off the sub-chart and holds no side.
export function measureScatterValueClearance(
  extent: number,
  from: OverhangClearance,
  reaches: ScatterValueAxisReach[],
): OverhangClearance {
  const onRange = reaches.filter((r) => r.fraction >= 0 && r.fraction <= 1);
  const startFor = (end: number) =>
    onRange.reduce(
      (start, r) =>
        r.fraction >= 1 ? start : Math.max(
          start,
          (r.startExtent - (extent - end) * r.fraction) / (1 - r.fraction),
        ),
      from.start,
    );
  const endFor = (start: number) =>
    onRange.reduce(
      (end, r) =>
        r.fraction <= 0 ? end : Math.max(
          end,
          (r.endExtent - (extent - start) * (1 - r.fraction)) / r.fraction,
        ),
      from.end,
    );
  let start = Math.min(extent, startFor(from.end));
  let end = Math.min(extent, endFor(start));
  for (let round = 0; round < MAX_SOLVE_ROUNDS; round++) {
    const nextStart = Math.min(extent, startFor(end));
    const nextEnd = Math.min(extent, endFor(nextStart));
    const settled = nextStart - start <= SETTLED && nextEnd - end <= SETTLED;
    start = nextStart;
    end = nextEnd;
    if (settled) {
      break;
    }
  }
  return { start, end };
}
