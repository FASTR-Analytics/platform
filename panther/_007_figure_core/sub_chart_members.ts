// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataDimension, DimensionMember, ItemCoordinate } from "./deps.ts";
import { itemCoordinate } from "./deps.ts";

// The pane, tier and lane members one sub-chart sits in, each undefined when
// its prop is not given.
export type SubChartMembers = {
  paneMember: DimensionMember | undefined;
  tierMember: DimensionMember | undefined;
  laneMember: DimensionMember | undefined;
};

export function getSubChartMembers(
  data: { pane?: DataDimension; tier?: DataDimension; lane?: DataDimension },
  indices: { i_pane: number; i_tier: number; i_lane: number },
): SubChartMembers {
  return {
    paneMember: data.pane?.members[indices.i_pane],
    tierMember: data.tier?.members[indices.i_tier],
    laneMember: data.lane?.members[indices.i_lane],
  };
}

export function subChartItemCoordinates(
  data: { pane?: DataDimension; tier?: DataDimension; lane?: DataDimension },
  members: SubChartMembers,
): ItemCoordinate[] {
  return [
    itemCoordinate(data.pane?.name, members.paneMember),
    itemCoordinate(data.tier?.name, members.tierMember),
    itemCoordinate(data.lane?.name, members.laneMember),
  ];
}
