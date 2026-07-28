// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
  zHeaderItems,
  zHeaderSortConfig,
  zJsonArray,
  zValues5D,
} from "./shared.ts";

// The denominator: "sum" normalises by the cell's own total, a number declares
// a fixed envelope.
const zPieTotal = z.union([z.number(), z.literal("sum")]);

export const zPieJsonDataConfig = z.object({
  valueProps: z.array(z.string()),
  seriesProp: z.string().optional(),
  paneProp: z.string().optional(),
  tierProp: z.string().optional(),
  laneProp: z.string().optional(),
  total: zPieTotal.optional(),
  labelReplacements: z.record(z.string(), z.string()).optional(),
  sort: z
    .object({
      series: zHeaderSortConfig.optional(),
      pane: zHeaderSortConfig.optional(),
      tier: zHeaderSortConfig.optional(),
      lane: zHeaderSortConfig.optional(),
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
  seriesHeaders: zHeaderItems,
  paneHeaders: zHeaderItems,
  tierHeaders: zHeaderItems,
  laneHeaders: zHeaderItems,
  // [pane][tier][lane][series][value] — the value axis is length 1 for v1, but
  // the nesting is stored, so concentric rings stay a non-breaking change.
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
