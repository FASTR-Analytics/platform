// Copyright 2023-2026, Tim Roberton. MIT license.
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
  chartLimitsMatchMembers,
  type Conforms,
  zChartUncertainty,
  zChartValueAxisLimits,
  zDataDimension,
  zJsonArray,
  zMemberSortConfig,
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
      series: zMemberSortConfig.optional(),
      lane: zMemberSortConfig.optional(),
      tier: zMemberSortConfig.optional(),
      pane: zMemberSortConfig.optional(),
    })
    .optional(),
  yValueAxisLabel: z.string().optional(),
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
  period: z.object({
    name: z.string(),
    periodType: zPeriodType,
    timeMin: z.number(),
    nTimePoints: z.number(),
    nBlankRows: z.number(),
  }),
  series: zDataDimension.optional(),
  lane: zDataDimension.optional(),
  tier: zDataDimension.optional(),
  pane: zDataDimension.optional(),
  values: zValues5D,
  uncertaintyValues: zChartUncertainty.optional(),
  valueAxisLimits: zChartValueAxisLimits,
  yValueAxisLabel: z.string().optional(),
});
const _zTimeseriesDataTransformedConforms: Conforms<
  z.infer<typeof zTimeseriesDataTransformedObject>,
  TimeseriesDataTransformed
> = true;

export const zTimeseriesDataTransformed: z.ZodType<TimeseriesDataTransformed> =
  zTimeseriesDataTransformedObject.refine(
    chartLimitsMatchMembers,
    CHART_LIMITS_LENGTH_MESSAGE,
  );

export const zTimeseriesData: z.ZodType<TimeseriesData> = z.union([
  zTimeseriesDataJson,
  zTimeseriesDataTransformed,
]);
