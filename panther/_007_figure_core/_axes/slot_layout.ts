// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function computeTotalGridLineStrokeWidth(
  nSlots: number,
  nTiersOrLanes: number,
  centered: boolean,
  gsw: number,
): number {
  return centered ? 0 : gsw * (nSlots + nTiersOrLanes);
}

export function computeSlotExtent(
  extent: number,
  nSlots: number,
  centered: boolean,
  gsw: number,
): number {
  return (extent - computeTotalGridLineStrokeWidth(nSlots, 1, centered, gsw)) /
    Math.max(1, nSlots);
}
