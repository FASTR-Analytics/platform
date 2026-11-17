// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getDimensionMembers, z } from "./deps.ts";
import type {
  ChartValueAxisLimits,
  ChartValueAxisLimitsEntry,
  ChartValueAxisPaneLimits,
  DataDimension,
  DimensionMember,
  DimensionMembership,
  JsonArray,
  JsonArrayItem,
  MemberSortConfig,
  MemberSortFunc,
  PeriodType,
  UncertaintyConfig,
} from "./deps.ts";

// Compile-time conformance check binding each schema to its hand-written type
// (the _010_* types remain the single source of truth). A type change the
// schema does not track fails `deno task typecheck`. Mutual assignability
// rather than strict identity: identity distinguishes intersection types
// (e.g. ChartValueAxisPaneLimits) from their flattened object equivalents.
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

export const zChartUncertainty = z.object({
  ub: zValues5D,
  lb: zValues5D,
});

export const zDimensionMember = z.object({
  id: z.string(),
  label: z.string(),
});
const _zDimensionMemberConforms: Conforms<
  z.infer<typeof zDimensionMember>,
  DimensionMember
> = true;

export const zDimensionMembers = z.array(zDimensionMember);

export const zDataDimension = z.object({
  name: z.string(),
  members: zDimensionMembers,
});
const _zDataDimensionConforms: Conforms<
  z.infer<typeof zDataDimension>,
  DataDimension
> = true;

const zMemberSortFunc = z.custom<MemberSortFunc>(
  (v) => typeof v === "function",
);

export const zMemberSortConfig: z.ZodType<MemberSortConfig> = z.union([
  zMemberSortFunc,
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
    peMemberId: z.string(),
    ubMemberId: z.string(),
    lbMemberId: z.string(),
  }),
  z.object({
    ubValueProps: z.array(z.string()),
    lbValueProps: z.array(z.string()),
  }),
]);

export const zDimensionMembership = z.enum(["balanced", "unbalanced"]);
const _zDimensionMembershipConforms: Conforms<
  z.infer<typeof zDimensionMembership>,
  DimensionMembership
> = true;

// Per-pane masks (global indices; array order is the slot order) on the
// transformed-data types (indicators, tiers, or lanes).
export const zVisibleByPane = z.array(z.array(z.number()));

// Per-(pane, tier or lane) visible indicator subsets for proportional layout,
// indexed [pane][global tier or lane index][visible global indicator indices].
export const zVisibleByPaneTierOrLane = z.array(zVisibleByPane);

// Proportional (ragged-table) layout configs. strict: a stray key must error,
// not be silently stripped — see validateChartProportional for the rule
// (panes implies the tier-or-lane key; { lanes: false, panes: true } is
// rejected there).
export const zChartOVProportional = z.strictObject({
  lanes: z.boolean().optional(),
  panes: z.boolean().optional(),
});

export const zChartOHProportional = z.strictObject({
  tiers: z.boolean().optional(),
  panes: z.boolean().optional(),
});

export const zPeriodType = z.enum(["year-month", "year-quarter", "year"]);
const _zPeriodTypeConforms: Conforms<z.infer<typeof zPeriodType>, PeriodType> =
  true;

export const zChartValueAxisLimitsEntry = z.object({
  valueMin: z.number(),
  valueMax: z.number(),
});
const _zChartValueAxisLimitsEntryConforms: Conforms<
  z.infer<typeof zChartValueAxisLimitsEntry>,
  ChartValueAxisLimitsEntry
> = true;

export const zChartValueAxisPaneLimits = z.object({
  valueMin: z.number(),
  valueMax: z.number(),
  tierLimits: z.array(zChartValueAxisLimitsEntry),
  laneLimits: z.array(zChartValueAxisLimitsEntry),
});
const _zChartValueAxisPaneLimitsConforms: Conforms<
  z.infer<typeof zChartValueAxisPaneLimits>,
  ChartValueAxisPaneLimits
> = true;

export const zChartValueAxisLimits = z.object({
  paneLimits: z.array(zChartValueAxisPaneLimits),
});
const _zChartValueAxisLimitsConforms: Conforms<
  z.infer<typeof zChartValueAxisLimits>,
  ChartValueAxisLimits
> = true;

// Mirrors the malformed-limits condition in the consumer migration gate
// (pre-2026 blobs stored truncated tierLimits, e.g. length 1 on a 3-tier
// chart): every per-pane tierLimits/laneLimits array must match the member
// counts, so those blobs fail and trigger the upgrader.
export function chartLimitsMatchMembers(d: {
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
  valueAxisLimits: ChartValueAxisLimits;
}): boolean {
  return (
    d.valueAxisLimits.paneLimits.length ===
      getDimensionMembers(d.pane).length &&
    d.valueAxisLimits.paneLimits.every(
      (p) =>
        p.tierLimits.length === getDimensionMembers(d.tier).length &&
        p.laneLimits.length === getDimensionMembers(d.lane).length,
    )
  );
}

export const CHART_LIMITS_LENGTH_MESSAGE =
  "valueAxisLimits pane/tier/lane lengths must match members";

// Present-and-object, nothing more — for deliberately unvalidated members.
// The validator must reject undefined: a validator accepting undefined would
// make a missing key pass, so ANY object would match the containing member.
export function zAnyPresentObject<T>(): z.ZodType<T> {
  return z.custom<T>((v) => typeof v === "object" && v !== null);
}
