// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ChartOVData,
  ChartOVDataJson,
  ChartOVDataTransformed,
  ChartOVJsonDataConfig,
} from "./deps.ts";
import {
  CHART_LIMITS_LENGTH_MESSAGE,
  chartLimitsMatchHeaders,
  type Conforms,
  zAxisMembership,
  zChartBounds,
  zChartProportional,
  zChartScaleAxisLimits,
  zHeaderItems,
  zHeaderSortConfig,
  zJsonArray,
  zUncertaintyConfig,
  zValues5D,
  zVisibleByPane,
  zVisibleByPaneBand,
} from "./shared.ts";

export const zChartOVJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  indicatorProp: z.string(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  // strict: a stray scale-direction key (tier on OV) must error, not be
  // silently stripped — see validateChartMembership for the rule.
  membership: z
    .strictObject({
      indicator: zAxisMembership.optional(),
      lane: zAxisMembership.optional(),
    })
    .optional(),
  proportional: zChartProportional.optional(),
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
  yScaleAxisLabel: z.string().optional(),
});
const _zChartOVJsonDataConfigConforms: Conforms<
  z.infer<typeof zChartOVJsonDataConfig>,
  ChartOVJsonDataConfig
> = true;

export const zChartOVDataJson = z.object({
  jsonArray: zJsonArray,
  jsonDataConfig: zChartOVJsonDataConfig,
});
const _zChartOVDataJsonConforms: Conforms<
  z.infer<typeof zChartOVDataJson>,
  ChartOVDataJson
> = true;

const zChartOVDataTransformedObject = z.object({
  isTransformed: z.literal(true),
  indicatorHeaders: zHeaderItems,
  seriesHeaders: zHeaderItems,
  laneHeaders: zHeaderItems,
  tierHeaders: zHeaderItems,
  paneHeaders: zHeaderItems,
  values: zValues5D,
  bounds: zChartBounds.optional(),
  scaleAxisLimits: zChartScaleAxisLimits,
  yScaleAxisLabel: z.string().optional(),
  visibleIndicatorsByPane: zVisibleByPane.optional(),
  visibleLanesByPane: zVisibleByPane.optional(),
  visibleIndicatorsByPaneBand: zVisibleByPaneBand.optional(),
  proportionalPanes: z.boolean().optional(),
});
const _zChartOVDataTransformedConforms: Conforms<
  z.infer<typeof zChartOVDataTransformedObject>,
  ChartOVDataTransformed
> = true;

export const zChartOVDataTransformed: z.ZodType<ChartOVDataTransformed> =
  zChartOVDataTransformedObject.refine(
    chartLimitsMatchHeaders,
    CHART_LIMITS_LENGTH_MESSAGE,
  );

export const zChartOVData: z.ZodType<ChartOVData> = z.union([
  zChartOVDataJson,
  zChartOVDataTransformed,
]);
