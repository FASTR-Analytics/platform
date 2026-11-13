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
  zChartOHProportional,
  zChartUncertainty,
  zChartValueAxisLimits,
  zDataDimension,
  zDimensionMembership,
  zJsonArray,
  zMemberSortConfig,
  zUncertaintyConfig,
  zValues5D,
  zVisibleByPane,
  zVisibleByPaneTierOrLane,
} from "./shared.ts";

export const zChartOHJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  indicatorProp: z.string(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  // strict: a stray value-direction key (lane on OH) must error, not be
  // silently stripped — see validateChartMembership for the rule.
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
  sortIndicatorValues: z.enum(["ascending", "descending", "none"]).optional(),
  xValueAxisLabel: z.string().optional(),
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
  zChartOHDataTransformedObject.refine(
    chartLimitsMatchMembers,
    CHART_LIMITS_LENGTH_MESSAGE,
  );

export const zChartOHData: z.ZodType<ChartOHData> = z.union([
  zChartOHDataJson,
  zChartOHDataTransformed,
]);
