// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ChartScaleAxisLimits,
  ChartScaleAxisLimitsEntry,
  ChartScaleAxisPaneLimits,
  HeaderItem,
  HeaderSortConfig,
  HeaderSortFunc,
  JsonArray,
  JsonArrayItem,
  PeriodType,
  UncertaintyConfig,
} from "./deps.ts";

// Compile-time conformance check binding each schema to its hand-written type
// (the _010_* types remain the single source of truth). A type change the
// schema does not track fails `deno task typecheck`. Mutual assignability
// rather than strict identity: identity distinguishes intersection types
// (e.g. ChartScaleAxisPaneLimits) from their flattened object equivalents.
export type Conforms<A, B> = [A] extends [B] ? [B] extends [A] ? true
  : false
  : false;

// Stored figureInputs blobs are JSON round-tripped: `undefined` array elements
// become `null`, and `key: undefined` props are dropped. These leaves accept
// null/absent at runtime while staying bound to the hand-written
// `... | undefined` types, so current-shape stored rows never fail the gate.
export const zValueCell: z.ZodType<number | undefined> = z.custom<
  number | undefined
>(
  (v) => typeof v === "number" || v === undefined || v === null,
);

export const zMaybeString: z.ZodType<string | undefined> = z.custom<
  string | undefined
>(
  (v) => typeof v === "string" || v === undefined || v === null,
);

export const zValues5D: z.ZodType<(number | undefined)[][][][][]> = z.array(
  z.array(z.array(z.array(z.array(zValueCell)))),
);

export const zChartBounds = z.object({
  ub: zValues5D,
  lb: zValues5D,
});

export const zHeaderItem = z.object({
  id: z.string(),
  label: z.string(),
});
const _zHeaderItemConforms: Conforms<z.infer<typeof zHeaderItem>, HeaderItem> =
  true;

export const zHeaderItems = z.array(zHeaderItem);

const zHeaderSortFunc = z.custom<HeaderSortFunc>(
  (v) => typeof v === "function",
);

export const zHeaderSortConfig: z.ZodType<HeaderSortConfig> = z.union([
  zHeaderSortFunc,
  z.literal("by-label"),
  z.literal("by-id"),
  z.object({ byIdOrder: z.array(z.string()) }),
  z.object({ byLabelOrder: z.array(z.string()) }),
  z.object({
    base: z.union([z.literal("by-label"), z.literal("by-id")]).optional(),
    first: z.array(z.string()).optional(),
    last: z.array(z.string()).optional(),
  }),
]);

export const zJsonArrayItem: z.ZodType<JsonArrayItem> = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.undefined(), z.null()]),
);

export const zJsonArray: z.ZodType<JsonArray> = z.array(zJsonArrayItem);

export const zUncertaintyConfig: z.ZodType<UncertaintyConfig> = z.union([
  z.object({
    uncertaintyProp: z.string(),
    peValue: z.string(),
    ubValue: z.string(),
    lbValue: z.string(),
  }),
  z.object({
    ubValueProps: z.array(z.string()),
    lbValueProps: z.array(z.string()),
  }),
]);

export const zPeriodType = z.enum(["year-month", "year-quarter", "year"]);
const _zPeriodTypeConforms: Conforms<z.infer<typeof zPeriodType>, PeriodType> =
  true;

export const zChartScaleAxisLimitsEntry = z.object({
  valueMin: z.number(),
  valueMax: z.number(),
});
const _zChartScaleAxisLimitsEntryConforms: Conforms<
  z.infer<typeof zChartScaleAxisLimitsEntry>,
  ChartScaleAxisLimitsEntry
> = true;

export const zChartScaleAxisPaneLimits = z.object({
  valueMin: z.number(),
  valueMax: z.number(),
  tierLimits: z.array(zChartScaleAxisLimitsEntry),
  laneLimits: z.array(zChartScaleAxisLimitsEntry),
});
const _zChartScaleAxisPaneLimitsConforms: Conforms<
  z.infer<typeof zChartScaleAxisPaneLimits>,
  ChartScaleAxisPaneLimits
> = true;

export const zChartScaleAxisLimits = z.object({
  paneLimits: z.array(zChartScaleAxisPaneLimits),
});
const _zChartScaleAxisLimitsConforms: Conforms<
  z.infer<typeof zChartScaleAxisLimits>,
  ChartScaleAxisLimits
> = true;

// Mirrors the malformed-limits condition in the consumer migration gate
// (pre-2026 blobs stored truncated tierLimits, e.g. length 1 on a 3-tier
// chart): every per-pane tierLimits/laneLimits array must match the header
// counts, so those blobs fail and trigger the upgrader.
export function chartLimitsMatchHeaders(d: {
  paneHeaders: HeaderItem[];
  tierHeaders: HeaderItem[];
  laneHeaders: HeaderItem[];
  scaleAxisLimits: ChartScaleAxisLimits;
}): boolean {
  return (
    d.scaleAxisLimits.paneLimits.length === d.paneHeaders.length &&
    d.scaleAxisLimits.paneLimits.every(
      (p) =>
        p.tierLimits.length === d.tierHeaders.length &&
        p.laneLimits.length === d.laneHeaders.length,
    )
  );
}

export const CHART_LIMITS_LENGTH_MESSAGE =
  "scaleAxisLimits pane/tier/lane lengths must match headers";

// Present-and-object, nothing more — for deliberately unvalidated members.
// The validator must reject undefined: a validator accepting undefined would
// make a missing key pass, so ANY object would match the containing member.
export function zAnyPresentObject<T>(): z.ZodType<T> {
  return z.custom<T>((v) => typeof v === "object" && v !== null);
}
