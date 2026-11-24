// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ScatterData,
  ScatterDataJson,
  ScatterDataTransformed,
  ScatterJsonDataConfig,
  ScatterReferenceLineDataConfig,
} from "./deps.ts";
import {
  type Conforms,
  type ConformsExactly,
  SCATTER_LIMITS_LENGTH_MESSAGE,
  scatterLimitsMatchMembers,
  zChartValueAxisLimits,
  zDataDimension,
  zJsonArray,
  zMemberSortConfig,
  zReferenceLineShape,
  zSubChartTextDataConfig,
  zValues5D,
} from "./shared.ts";

export const zScatterReferenceLineDataConfig = z.strictObject({
  ...zReferenceLineShape,
  valueAxis: z.enum(["x", "y"]),
});
const _zScatterReferenceLineDataConfigConforms: ConformsExactly<
  z.infer<typeof zScatterReferenceLineDataConfig>,
  ScatterReferenceLineDataConfig
> = true;

export const zScatterJsonDataConfig = z.object({
  xValueProp: z.string(),
  yValueProp: z.string(),
  indicatorProp: z.string().optional(),
  seriesProp: z.string().optional(),
  laneProp: z.string().optional(),
  tierProp: z.string().optional(),
  paneProp: z.string().optional(),
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
  xValueAxisLabel: z.string().optional(),
  yValueAxisLabel: z.string().optional(),
  referenceLines: z.array(zScatterReferenceLineDataConfig).optional(),
  subChartTexts: z.array(zSubChartTextDataConfig).optional(),
});
const _zScatterJsonDataConfigConforms: Conforms<
  z.infer<typeof zScatterJsonDataConfig>,
  ScatterJsonDataConfig
> = true;

export const zScatterDataJson = z.object({
  jsonArray: zJsonArray,
  jsonDataConfig: zScatterJsonDataConfig,
});
const _zScatterDataJsonConforms: Conforms<
  z.infer<typeof zScatterDataJson>,
  ScatterDataJson
> = true;

const zScatterDataTransformedObject = z.object({
  isTransformed: z.literal(true),
  indicator: zDataDimension.optional(),
  series: zDataDimension.optional(),
  lane: zDataDimension.optional(),
  tier: zDataDimension.optional(),
  pane: zDataDimension.optional(),
  xValues: zValues5D,
  yValues: zValues5D,
  xValueAxisLimits: zChartValueAxisLimits,
  yValueAxisLimits: zChartValueAxisLimits,
  xValueAxisLabel: z.string().optional(),
  yValueAxisLabel: z.string().optional(),
  referenceLines: z.array(zScatterReferenceLineDataConfig).optional(),
  subChartTexts: z.array(zSubChartTextDataConfig).optional(),
});
const _zScatterDataTransformedConforms: Conforms<
  z.infer<typeof zScatterDataTransformedObject>,
  ScatterDataTransformed
> = true;

export const zScatterDataTransformed: z.ZodType<ScatterDataTransformed> =
  zScatterDataTransformedObject.refine(
    scatterLimitsMatchMembers,
    SCATTER_LIMITS_LENGTH_MESSAGE,
  );

export const zScatterData: z.ZodType<ScatterData> = z.union([
  zScatterDataJson,
  zScatterDataTransformed,
]);
