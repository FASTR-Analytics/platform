// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { slotHeaders, z } from "./deps.ts";
import type {
  AxisMembership,
  ChartScaleAxisLimits,
  ChartScaleAxisLimitsEntry,
  ChartScaleAxisPaneLimits,
  DataAxis,
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

type DeepRequired<T> = T extends (infer U)[] ? DeepRequired<U>[]
  : T extends object
    ? { [K in keyof T]-?: DeepRequired<Exclude<T[K], undefined>> }
  : T;

// Conforms passes an optional field present on one side only, which is how a
// wire contract grows. A twin that lacks a field its type gained then keeps
// the typecheck green while a strict parse refuses the field and a closed
// output schema forbids it. Comparing the two with every field made required,
// at every depth, closes that.
export type ConformsExactly<A, B> = Conforms<A, B> extends true
  ? Conforms<DeepRequired<A>, DeepRequired<B>>
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

export const zDataAxis = z.object({
  dimension: z.string(),
  headers: zHeaderItems,
});
const _zDataAxisConforms: Conforms<z.infer<typeof zDataAxis>, DataAxis> = true;

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

// An absent cell is `.optional()` rather than `z.undefined()` in the union:
// the two parse alike, but z.toJSONSchema refuses `undefined`, and _114
// serializes every op output schema into the catalog and MCP tools/list.
export const zJsonArrayItem: z.ZodType<JsonArrayItem> = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.null()]).optional(),
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

export const zAxisMembership = z.enum(["balanced", "unbalanced"]);
const _zAxisMembershipConforms: Conforms<
  z.infer<typeof zAxisMembership>,
  AxisMembership
> = true;

// Per-pane masks (global indices; array order is the slot order) on the
// transformed-data types (indicators, tiers, or lanes).
export const zVisibleByPane = z.array(z.array(z.number()));

// Per-(pane, band) visible indicator subsets for proportional band layout,
// indexed [pane][global band index][visible global indicator indices].
export const zVisibleByPaneBand = z.array(zVisibleByPane);

// Proportional (ragged-table) layout config. strict: a stray key must error,
// not be silently stripped — see validateChartProportional for the rule
// (panes implies bands; { bands: false, panes: true } is rejected there).
export const zChartProportional = z.strictObject({
  bands: z.boolean().optional(),
  panes: z.boolean().optional(),
});

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
  pane?: DataAxis;
  tier?: DataAxis;
  lane?: DataAxis;
  scaleAxisLimits: ChartScaleAxisLimits;
}): boolean {
  return (
    d.scaleAxisLimits.paneLimits.length === slotHeaders(d.pane).length &&
    d.scaleAxisLimits.paneLimits.every(
      (p) =>
        p.tierLimits.length === slotHeaders(d.tier).length &&
        p.laneLimits.length === slotHeaders(d.lane).length,
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
