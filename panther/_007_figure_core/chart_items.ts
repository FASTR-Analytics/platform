// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartConnectorInfo,
  ChartSeriesInfo,
  ChartValueInfo,
  DataAxis,
  ItemCoordinate,
  PeriodType,
  PrimitiveItem,
} from "./deps.ts";
import { buildItem, getPeriodIdFromTime, slotCoordinate } from "./deps.ts";
import { subChartItemCoordinates } from "./sub_chart_headers.ts";

// The axes a chart's items are coordinates in. The value slot is the
// indicator axis or, on a timeseries, the period, whose members are the time
// points from timeMin, each named by its period id.
export type ChartItemAxes = {
  pane?: DataAxis;
  tier?: DataAxis;
  lane?: DataAxis;
  series?: DataAxis;
  indicator?: DataAxis;
  period?: { dimension: string; periodType: PeriodType; timeMin: number };
};

export function chartSeriesItem(
  axes: ChartItemAxes,
  info: ChartSeriesInfo,
): PrimitiveItem | undefined {
  return buildItem([
    ...subChartItemCoordinates(axes, info),
    slotCoordinate(axes.series?.dimension, info.seriesHeader),
  ]);
}

export function chartValueItem(
  axes: ChartItemAxes,
  info: ChartValueInfo,
): PrimitiveItem | undefined {
  return buildItem([
    ...subChartItemCoordinates(axes, info),
    slotCoordinate(axes.series?.dimension, info.seriesHeader),
    valueSlotCoordinate(axes, info.i_val),
  ]);
}

export function chartConnectorItem(
  axes: ChartItemAxes,
  info: ChartConnectorInfo,
): PrimitiveItem | undefined {
  return buildItem([
    ...subChartItemCoordinates(axes, info),
    valueSlotCoordinate(axes, info.i_val),
  ]);
}

export function periodCoordinate(
  dimension: string,
  periodId: number,
): ItemCoordinate {
  return [dimension, String(periodId)];
}

function valueSlotCoordinate(
  axes: ChartItemAxes,
  i_val: number,
): ItemCoordinate {
  if (axes.indicator !== undefined) {
    return slotCoordinate(
      axes.indicator.dimension,
      axes.indicator.headers[i_val],
    );
  }
  if (axes.period !== undefined) {
    return periodCoordinate(
      axes.period.dimension,
      getPeriodIdFromTime(axes.period.timeMin + i_val, axes.period.periodType),
    );
  }
  return undefined;
}
