// Shared definitions for the roll-up ("National" / "All facilities") row
// feature. The server query builder and the client (gate + display) both
// depend on these, so they live in lib/ and use no panther UI surface.
//
// The collapsed dimension is chosen by getRollupDimension /
// getEffectiveRollupDimension (in get_fetch_config_from_po.ts) — see the doc
// comment there for the contract.

import type {
  CatalogExpressionEvaluation,
  PostAggregationExpression,
  ValueFunc,
} from "./types/_metric_installed.ts";

export const ADMIN_LEVELS = [
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

// The facility columns the roll-up may collapse. Together with ADMIN_LEVELS
// this is the WHOLE roll-up whitelist, and the boundary is semantic, not
// pragmatic: a roll-up re-aggregates rows ACROSS the collapsed dimension's
// values, which is only meaningful for dimensions that PARTITION the unit of
// observation (facilities). Admin areas and facility attributes do; indicator
// dimensions would sum different indicators, time_point would pool survey
// rounds, hfa_service_category is multi-membership. Do not widen this list
// without that argument holding.
export const FACILITY_ROLLUP_COLUMNS = [
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
] as const;

export const ROLLUP_DIMENSIONS = [
  ...ADMIN_LEVELS,
  ...FACILITY_ROLLUP_COLUMNS,
] as const;

export type RollupDimension = (typeof ROLLUP_DIMENSIONS)[number];

// Sentinel value placed in the collapsed admin column to mark the roll-up row.
// The top/bottom position is a display preference handled entirely client-side
// (getRollupAwareSort) — it never changes the SQL or the sentinel.
export const ROLLUP_SENTINEL = "__NATIONAL";
// Emitted by a previous release for position "bottom"; kept for one release so
// stored bundle item grids containing it still render. Nothing new emits it.
export const LEGACY_ROLLUP_SENTINEL = "zzNATIONAL";
// Sentinel for a collapsed FACILITY column. Distinct from ROLLUP_SENTINEL so a
// future simultaneous admin+facility roll-up can mark each column with its own
// sentinel; same collision exposure as BLANK_SENTINEL, accepted on the same
// grounds.
export const ALL_FACILITIES_SENTINEL = "__ALL_FACILITIES";
// The ids display code matches/pins on (current + render-compat legacy).
export const ROLLUP_PIN_IDS = [
  ROLLUP_SENTINEL,
  LEGACY_ROLLUP_SENTINEL,
  ALL_FACILITIES_SENTINEL,
];

export function isAdminLevel(disOpt: string): disOpt is AdminLevel {
  return (ADMIN_LEVELS as readonly string[]).includes(disOpt);
}

export function isRollupDimension(disOpt: string): disOpt is RollupDimension {
  return (ROLLUP_DIMENSIONS as readonly string[]).includes(disOpt);
}

// The sentinel the roll-up row carries in the collapsed column — interpolated
// into SQL by buildRollupQuery and matched client-side via ROLLUP_PIN_IDS.
export function rollupSentinelForDimension(dim: RollupDimension): string {
  return isAdminLevel(dim) ? ROLLUP_SENTINEL : ALL_FACILITIES_SENTINEL;
}

// The metric fields rollup eligibility is decided from. hasFacilityLevelRows
// is derived at enrichment time (results table has a facility_id column) and
// may be absent on stale cached ResultsValue objects — absence reads as false.
export type RollupEligibilityInputs = {
  valueFunc: ValueFunc;
  postAggregationExpression?: PostAggregationExpression | null;
  catalogExpressionEvaluation?: CatalogExpressionEvaluation | null;
  hasFacilityLevelRows?: boolean;
};

// The roll-up re-aggregates a metric's rows across the collapsed dimension's
// values, so it is only offered when that re-aggregation is meaningful:
// - additive value funcs (SUM/COUNT);
// - identity values whose ratio is recomputed after the union — either via a
//   metric-wide post-aggregation expression, or, for a catalog-evaluated
//   metric, via each row's own indicator expression over its summed
//   ingredients (PLAN_1a §1.6). Both are the same case: the ingredients are
//   additive, so the roll-up row's formula is applied to correctly summed
//   parts rather than averaging finished ratios;
// - AVG over FACILITY-LEVEL rows (raw observations — re-averaging over any
//   collapsed scope is the correctly weighted statistic).
// Excluded: bare identity (pre-aggregated percentages/rates), AVG over
// pre-aggregated area rows (re-averaging gives a population-blind mean), and
// MIN/MAX. Whether rows are observations or area summaries is exactly the
// presence of facility_id on the results table.
export function isRollupEligibleResultsValue(
  rv: RollupEligibilityInputs,
): boolean {
  return (
    !!rv.postAggregationExpression ||
    !!rv.catalogExpressionEvaluation ||
    rv.valueFunc === "SUM" ||
    rv.valueFunc === "COUNT" ||
    (rv.valueFunc === "AVG" && rv.hasFacilityLevelRows === true)
  );
}
