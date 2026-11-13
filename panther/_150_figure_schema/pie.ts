// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  PieData,
  PieDataJson,
  PieDataTransformed,
  PieJsonDataConfig,
} from "./deps.ts";
import {
  type Conforms,
  zDataDimension,
  zJsonArray,
  zMemberSortConfig,
  zValues5D,
} from "./shared.ts";

// The denominator: "sum" normalises by the pie's own total, a number declares
// a fixed envelope.
const zPieTotal = z.union([z.number(), z.literal("sum")]);

export const zPieJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  seriesProp: z.string().optional(),
  indicatorProp: z.string().optional(),
  paneProp: z.string().optional(),
  tierProp: z.string().optional(),
  laneProp: z.string().optional(),
  total: zPieTotal.optional(),
  labelReplacements: z.record(z.string(), z.string()).optional(),
  sort: z
    .object({
      series: zMemberSortConfig.optional(),
      indicator: zMemberSortConfig.optional(),
      pane: zMemberSortConfig.optional(),
      tier: zMemberSortConfig.optional(),
      lane: zMemberSortConfig.optional(),
    })
    .optional(),
  sortSeriesValues: z.enum(["ascending", "descending", "none"]).optional(),
  groupSmallSlices: z
    .object({ threshold: z.number(), label: z.string().optional() })
    .optional(),
});
const _zPieJsonDataConfigConforms: Conforms<
  z.infer<typeof zPieJsonDataConfig>,
  PieJsonDataConfig
> = true;

export const zPieDataJson = z.object({
  jsonArray: zJsonArray,
  jsonDataConfig: zPieJsonDataConfig,
});
const _zPieDataJsonConforms: Conforms<
  z.infer<typeof zPieDataJson>,
  PieDataJson
> = true;

export const zPieDataTransformed = z.object({
  isTransformed: z.literal(true),
  series: zDataDimension.optional(),
  indicator: zDataDimension.optional(),
  pane: zDataDimension.optional(),
  tier: zDataDimension.optional(),
  lane: zDataDimension.optional(),
  // [pane][tier][lane][series][indicator] — the last index is the repeat
  // dimension (length 1 with no indicatorProp).
  values: zValues5D,
  total: zPieTotal,
});
const _zPieDataTransformedConforms: Conforms<
  z.infer<typeof zPieDataTransformed>,
  PieDataTransformed
> = true;

export const zPieData: z.ZodType<PieData> = z.union([
  zPieDataJson,
  zPieDataTransformed,
]);
