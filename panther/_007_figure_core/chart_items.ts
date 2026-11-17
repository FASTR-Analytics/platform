// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ChartConnectorInfo,
  ChartSeriesInfo,
  ChartValueInfo,
  DataDimension,
  ItemCoordinate,
  PeriodType,
  PrimitiveItem,
} from "./deps.ts";
import { buildItem, getPeriodIdFromTime, itemCoordinate } from "./deps.ts";
import { subChartItemCoordinates } from "./sub_chart_members.ts";

// The dimensions a chart's items are coordinates in. The value index runs
// along the indicator dimension or, on a timeseries, the period, whose members are the time
// points from timeMin, each named by its period id.
export type ChartItemDataDimensions = {
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
  series?: DataDimension;
  indicator?: DataDimension;
  period?: { name: string; periodType: PeriodType; timeMin: number };
};

export function chartSeriesItem(
  dimensions: ChartItemDataDimensions,
  info: ChartSeriesInfo,
): PrimitiveItem | undefined {
  return buildItem([
    ...subChartItemCoordinates(dimensions, info),
    itemCoordinate(dimensions.series?.name, info.seriesMember),
  ]);
}

export function chartValueItem(
  dimensions: ChartItemDataDimensions,
  info: ChartValueInfo,
): PrimitiveItem | undefined {
  return buildItem([
    ...subChartItemCoordinates(dimensions, info),
    itemCoordinate(dimensions.series?.name, info.seriesMember),
    valueIndexCoordinate(dimensions, info.i_value),
  ]);
}

export function chartConnectorItem(
  dimensions: ChartItemDataDimensions,
  info: ChartConnectorInfo,
): PrimitiveItem | undefined {
  return buildItem([
    ...subChartItemCoordinates(dimensions, info),
    valueIndexCoordinate(dimensions, info.i_value),
  ]);
}

export function periodCoordinate(
  dimension: string,
  periodId: number,
): ItemCoordinate {
  return [dimension, String(periodId)];
}

function valueIndexCoordinate(
  dimensions: ChartItemDataDimensions,
  i_value: number,
): ItemCoordinate {
  if (dimensions.indicator !== undefined) {
    return itemCoordinate(
      dimensions.indicator.name,
      dimensions.indicator.members[i_value],
    );
  }
  if (dimensions.period !== undefined) {
    return periodCoordinate(
      dimensions.period.name,
      getPeriodIdFromTime(
        dimensions.period.timeMin + i_value,
        dimensions.period.periodType,
      ),
    );
  }
  return undefined;
}
