// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DataAxis, HeaderItem, ItemCoordinate } from "./deps.ts";
import { slotCoordinate } from "./deps.ts";

// The headers of the slots one sub-chart sits in; an unsplit slot's is
// undefined.
export type SubChartHeaders = {
  paneHeader: HeaderItem | undefined;
  tierHeader: HeaderItem | undefined;
  laneHeader: HeaderItem | undefined;
};

export function getSubChartHeaders(
  data: { pane?: DataAxis; tier?: DataAxis; lane?: DataAxis },
  indices: { paneIndex: number; tierIndex: number; laneIndex: number },
): SubChartHeaders {
  return {
    paneHeader: data.pane?.headers[indices.paneIndex],
    tierHeader: data.tier?.headers[indices.tierIndex],
    laneHeader: data.lane?.headers[indices.laneIndex],
  };
}

export function subChartItemCoordinates(
  data: { pane?: DataAxis; tier?: DataAxis; lane?: DataAxis },
  headers: SubChartHeaders,
): ItemCoordinate[] {
  return [
    slotCoordinate(data.pane?.dimension, headers.paneHeader),
    slotCoordinate(data.tier?.dimension, headers.tierHeader),
    slotCoordinate(data.lane?.dimension, headers.laneHeader),
  ];
}
