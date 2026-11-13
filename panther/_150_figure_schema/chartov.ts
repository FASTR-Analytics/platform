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
  zChartOVProportional,
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

export const zChartOVJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  indicatorProp: z.string(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
  uncertainty: zUncertaintyConfig.optional(),
  // strict: a stray value-direction key (tier on OV) must error, not be
  // silently stripped — see validateChartMembership for the rule.
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
  sortIndicatorValues: z.enum(["ascending", "descending", "none"]).optional(),
  yValueAxisLabel: z.string().optional(),
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
  zChartOVDataTransformedObject.refine(
    chartLimitsMatchMembers,
    CHART_LIMITS_LENGTH_MESSAGE,
  );

export const zChartOVData: z.ZodType<ChartOVData> = z.union([
  zChartOVDataJson,
  zChartOVDataTransformed,
]);
