// Copyright 2023-2026, Tim Roberton. MIT license.
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
  chartLimitsMatchMembers,
  type Conforms,
  SECOND_VALUE_AXIS_SERIES_MESSAGE,
  secondValueAxisAssignsSomeSeries,
  zChartOHProportional,
  zChartUncertainty,
  zChartValueAxisLimits,
  zDataDimension,
  zDimensionMembership,
  zJsonArray,
  zMemberSortConfig,
  zReferenceLineDataConfig,
  zSecondValueAxisDataConfig,
  zSecondValueAxisDataTransformed,
  zSubChartTextDataConfig,
  zUncertaintyConfig,
  zValues5D,
  zVisibleByPane,
  zVisibleByPaneTierOrLane,
} from "./shared.ts";
import { zValueSort } from "./leaves.ts";

export const zChartOHJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  indicatorProp: z.string(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  // strict: a lane key must error, not be silently stripped, because the lane
  // carries the x value axis limits and stays balanced, and the transform
  // reads only the keys of its type.
  membership: z
    .strictObject({
      indicator: zDimensionMembership.optional(),
      tier: zDimensionMembership.optional(),
    })
    .optional(),
  proportional: zChartOHProportional.optional(),
  labelReplacements: z.record(z.string(), z.string()).optional(),
  sort: z
    .object({
      indicator: zMemberSortConfig.optional(),
      series: zMemberSortConfig.optional(),
      lane: zMemberSortConfig.optional(),
      tier: zMemberSortConfig.optional(),
      pane: zMemberSortConfig.optional(),
    })
    .optional(),
  sortIndicatorValues: zValueSort.optional(),
  xValueAxisLabel: z.string().optional(),
  secondValueAxis: zSecondValueAxisDataConfig.optional(),
  referenceLines: z.array(zReferenceLineDataConfig).optional(),
  subChartTexts: z.array(zSubChartTextDataConfig).optional(),
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
  indicator: zDataDimension,
  series: zDataDimension.optional(),
  lane: zDataDimension.optional(),
  tier: zDataDimension.optional(),
  pane: zDataDimension.optional(),
  values: zValues5D,
  uncertaintyValues: zChartUncertainty.optional(),
  valueAxisLimits: zChartValueAxisLimits,
  xValueAxisLabel: z.string().optional(),
  secondValueAxis: zSecondValueAxisDataTransformed.optional(),
  referenceLines: z.array(zReferenceLineDataConfig).optional(),
  subChartTexts: z.array(zSubChartTextDataConfig).optional(),
  visibleIndicatorsByPane: zVisibleByPane.optional(),
  visibleTiersByPane: zVisibleByPane.optional(),
  visibleIndicatorsByPaneTier: zVisibleByPaneTierOrLane.optional(),
  proportionalPanes: z.boolean().optional(),
});
const _zChartOHDataTransformedConforms: Conforms<
  z.infer<typeof zChartOHDataTransformedObject>,
  ChartOHDataTransformed
> = true;

export const zChartOHDataTransformed: z.ZodType<ChartOHDataTransformed> =
  zChartOHDataTransformedObject
    .refine(chartLimitsMatchMembers, CHART_LIMITS_LENGTH_MESSAGE)
    .refine(secondValueAxisAssignsSomeSeries, SECOND_VALUE_AXIS_SERIES_MESSAGE);

export const zChartOHData: z.ZodType<ChartOHData> = z.union([
  zChartOHDataJson,
  zChartOHDataTransformed,
]);
