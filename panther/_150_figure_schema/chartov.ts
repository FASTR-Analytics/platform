// Copyright 2023-2026, Tim Roberton. MIT license.
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
  chartLimitsMatchMembers,
  type Conforms,
  SECOND_VALUE_AXIS_SERIES_MESSAGE,
  secondValueAxisAssignsSomeSeries,
  zChartOVProportional,
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

export const zChartOVJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  indicatorProp: z.string(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  // strict: a tier key must error, not be silently stripped, because the tier
  // carries the y value axis limits and stays balanced, and the transform
  // reads only the keys of its type.
  membership: z
    .strictObject({
      indicator: zDimensionMembership.optional(),
      lane: zDimensionMembership.optional(),
    })
    .optional(),
  proportional: zChartOVProportional.optional(),
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
  yValueAxisLabel: z.string().optional(),
  secondValueAxis: zSecondValueAxisDataConfig.optional(),
  referenceLines: z.array(zReferenceLineDataConfig).optional(),
  subChartTexts: z.array(zSubChartTextDataConfig).optional(),
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
  indicator: zDataDimension,
  series: zDataDimension.optional(),
  lane: zDataDimension.optional(),
  tier: zDataDimension.optional(),
  pane: zDataDimension.optional(),
  values: zValues5D,
  uncertaintyValues: zChartUncertainty.optional(),
  valueAxisLimits: zChartValueAxisLimits,
  yValueAxisLabel: z.string().optional(),
  secondValueAxis: zSecondValueAxisDataTransformed.optional(),
  referenceLines: z.array(zReferenceLineDataConfig).optional(),
  subChartTexts: z.array(zSubChartTextDataConfig).optional(),
  visibleIndicatorsByPane: zVisibleByPane.optional(),
  visibleLanesByPane: zVisibleByPane.optional(),
  visibleIndicatorsByPaneLane: zVisibleByPaneTierOrLane.optional(),
  proportionalPanes: z.boolean().optional(),
});
const _zChartOVDataTransformedConforms: Conforms<
  z.infer<typeof zChartOVDataTransformedObject>,
  ChartOVDataTransformed
> = true;

export const zChartOVDataTransformed: z.ZodType<ChartOVDataTransformed> =
  zChartOVDataTransformedObject
    .refine(chartLimitsMatchMembers, CHART_LIMITS_LENGTH_MESSAGE)
    .refine(secondValueAxisAssignsSomeSeries, SECOND_VALUE_AXIS_SERIES_MESSAGE);

export const zChartOVData: z.ZodType<ChartOVData> = z.union([
  zChartOVDataJson,
  zChartOVDataTransformed,
]);
