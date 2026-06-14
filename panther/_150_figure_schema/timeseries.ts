// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  TimeseriesData,
  TimeseriesDataJson,
  TimeseriesDataTransformed,
  TimeseriesJsonDataConfig,
} from "./deps.ts";
import {
  CHART_LIMITS_LENGTH_MESSAGE,
  chartLimitsMatchHeaders,
  type Conforms,
  zChartBounds,
  zChartScaleAxisLimits,
  zHeaderItems,
  zHeaderSortConfig,
  zJsonArray,
  zPeriodType,
  zUncertaintyConfig,
  zValues5D,
} from "./shared.ts";

export const zTimeseriesJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  periodProp: z.string(),
  periodType: zPeriodType,
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  labelReplacements: z.record(z.string(), z.string()).optional(),
  sort: z
    .object({
      series: zHeaderSortConfig.optional(),
      lane: zHeaderSortConfig.optional(),
      tier: zHeaderSortConfig.optional(),
      pane: zHeaderSortConfig.optional(),
    })
    .optional(),
  yScaleAxisLabel: z.string().optional(),
});
const _zTimeseriesJsonDataConfigConforms: Conforms<
  z.infer<typeof zTimeseriesJsonDataConfig>,
  TimeseriesJsonDataConfig
> = true;

export const zTimeseriesDataJson = z.object({
  jsonArray: zJsonArray,
  jsonDataConfig: zTimeseriesJsonDataConfig,
});
const _zTimeseriesDataJsonConforms: Conforms<
  z.infer<typeof zTimeseriesDataJson>,
  TimeseriesDataJson
> = true;

const zTimeseriesDataTransformedObject = z.object({
  isTransformed: z.literal(true),
  periodType: zPeriodType,
  timeMin: z.number(),
  timeMax: z.number(),
  nTimePoints: z.number(),
  seriesHeaders: zHeaderItems,
  laneHeaders: zHeaderItems,
  tierHeaders: zHeaderItems,
  paneHeaders: zHeaderItems,
  values: zValues5D,
  bounds: zChartBounds.optional(),
  scaleAxisLimits: zChartScaleAxisLimits,
  yScaleAxisLabel: z.string().optional(),
});
const _zTimeseriesDataTransformedConforms: Conforms<
  z.infer<typeof zTimeseriesDataTransformedObject>,
  TimeseriesDataTransformed
> = true;

export const zTimeseriesDataTransformed: z.ZodType<TimeseriesDataTransformed> =
  zTimeseriesDataTransformedObject.refine(
    chartLimitsMatchHeaders,
    CHART_LIMITS_LENGTH_MESSAGE,
  );

export const zTimeseriesData: z.ZodType<TimeseriesData> = z.union([
  zTimeseriesDataJson,
  zTimeseriesDataTransformed,
]);
