// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ChartOHData,
  ChartOHDataJson,
  ChartOHDataTransformed,
  ChartOHJsonDataConfig,
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
  zUncertaintyConfig,
  zValues5D,
} from "./shared.ts";

export const zChartOHJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  indicatorProp: z.string(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  labelReplacements: z.record(z.string(), z.string()).optional(),
  sort: z
    .object({
      indicator: zHeaderSortConfig.optional(),
      series: zHeaderSortConfig.optional(),
      lane: zHeaderSortConfig.optional(),
      tier: zHeaderSortConfig.optional(),
      pane: zHeaderSortConfig.optional(),
    })
    .optional(),
  sortIndicatorValues: z.enum(["ascending", "descending", "none"]).optional(),
  xScaleAxisLabel: z.string().optional(),
});
const _zChartOHJsonDataConfigConforms: Conforms<
  z.infer<typeof zChartOHJsonDataConfig>,
  ChartOHJsonDataConfig
> = true;

export const zChartOHDataJson = z.object({
  jsonArray: zJsonArray,
  jsonDataConfig: zChartOHJsonDataConfig,
});
const _zChartOHDataJsonConforms: Conforms<
  z.infer<typeof zChartOHDataJson>,
  ChartOHDataJson
> = true;

const zChartOHDataTransformedObject = z.object({
  isTransformed: z.literal(true),
  indicatorHeaders: zHeaderItems,
  seriesHeaders: zHeaderItems,
  laneHeaders: zHeaderItems,
  tierHeaders: zHeaderItems,
  paneHeaders: zHeaderItems,
  values: zValues5D,
  bounds: zChartBounds.optional(),
  scaleAxisLimits: zChartScaleAxisLimits,
  xScaleAxisLabel: z.string().optional(),
});
const _zChartOHDataTransformedConforms: Conforms<
  z.infer<typeof zChartOHDataTransformedObject>,
  ChartOHDataTransformed
> = true;

export const zChartOHDataTransformed: z.ZodType<ChartOHDataTransformed> =
  zChartOHDataTransformedObject.refine(
    chartLimitsMatchHeaders,
    CHART_LIMITS_LENGTH_MESSAGE,
  );

export const zChartOHData: z.ZodType<ChartOHData> = z.union([
  zChartOHDataJson,
  zChartOHDataTransformed,
]);
