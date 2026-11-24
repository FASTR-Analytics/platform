// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataDimension, DimensionMember, ItemCoordinate } from "./deps.ts";
import { itemCoordinate } from "./deps.ts";
import type { SubChartMemberIds } from "./types.ts";

export type SubChartDimensions = {
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
};

// The pane, tier and lane members one sub-chart sits in, each undefined when
// its prop is not given.
export type SubChartMembers = {
  paneMember: DimensionMember | undefined;
  tierMember: DimensionMember | undefined;
  laneMember: DimensionMember | undefined;
};

export function getSubChartMembers(
  data: SubChartDimensions,
  indices: { i_pane: number; i_tier: number; i_lane: number },
): SubChartMembers {
  return {
    paneMember: data.pane?.members[indices.i_pane],
    tierMember: data.tier?.members[indices.i_tier],
    laneMember: data.lane?.members[indices.i_lane],
  };
}

export function namesSubChart(
  memberIds: SubChartMemberIds,
  members: SubChartMembers,
): boolean {
  const names = (
    ids: string[] | undefined,
    member: DimensionMember | undefined,
  ) => ids === undefined || member === undefined || ids.includes(member.id);
  return names(memberIds.paneMemberIds, members.paneMember) &&
    names(memberIds.tierMemberIds, members.tierMember) &&
    names(memberIds.laneMemberIds, members.laneMember);
}

export function subChartItemCoordinates(
  data: SubChartDimensions,
  members: SubChartMembers,
): ItemCoordinate[] {
  return [
    itemCoordinate(data.pane?.name, members.paneMember),
    itemCoordinate(data.tier?.name, members.tierMember),
    itemCoordinate(data.lane?.name, members.laneMember),
  ];
}
