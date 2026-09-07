// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { GroupRun, ProperGraph } from "../_internal/pipeline_types.ts";
import type { ResolvedZone } from "../_internal/regions.ts";

// Zone geometry shared by the zone-reserve pass, void-bound, and the [7]
// rect derivation: a zone's reserved interval is the
// hull of its per-layer member runs, each run padded by the group's box
// insets — the same insets step 4.1 reserved as PNode pads, so the interval
// IS the group's box on the cross axis. A rect zone reserves its header row
// in EVERY spanned layer (the rectangle's header sits over the whole box),
// a hug zone only in its first layer (the strip that carries the label).
export type ZoneInterval = {
  zone: ResolvedZone;
  top: number;
  bottom: number;
};

export function zoneInsets(
  zone: ResolvedZone,
  run: GroupRun,
  layerIndex: number,
  firstLayerIndex: number,
): { top: number; bottom: number } {
  const header = zone.region.shape === "rect" && layerIndex !== firstLayerIndex
    ? zone.region.headerH
    : 0;
  return { top: run.insetTop + header, bottom: run.insetBottom };
}

export function zoneIntervals(proper: ProperGraph): ZoneInterval[] {
  const intervals: ZoneInterval[] = [];
  for (const zone of proper.zones) {
    const runs = proper.groupRuns.get(zone.region.id);
    if (runs === undefined) {
      continue;
    }
    let top = Infinity;
    let bottom = -Infinity;
    for (const [layerIndex, run] of runs.byLayer) {
      const insets = zoneInsets(zone, run, layerIndex, runs.firstLayerIndex);
      top = Math.min(top, run.first.y - insets.top);
      bottom = Math.max(bottom, run.last.y + run.last.h + insets.bottom);
    }
    if (top === Infinity) {
      continue;
    }
    intervals.push({ zone, top, bottom });
  }
  return intervals;
}

// Coherent-unit comparison: negative when `a` sorts above `b` in every
// layer (by the sibling ranks step 3.2 recorded at the first depth where
// their chains diverge), positive when below, 0 when nested (no order).
export function compareCoherent(
  proper: ProperGraph,
  a: string,
  b: string,
): number {
  const pa = [...(proper.groupChainById.get(a) ?? [a])].reverse();
  const pb = [...(proper.groupChainById.get(b) ?? [b])].reverse();
  for (let depth = 0; depth < Math.min(pa.length, pb.length); depth++) {
    if (pa[depth] !== pb[depth]) {
      return (proper.coherentRank.get(pa[depth]) ?? 0) -
        (proper.coherentRank.get(pb[depth]) ?? 0);
    }
  }
  return 0;
}
