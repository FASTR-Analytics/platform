// Shared definitions for the admin-area roll-up ("National" / total) row feature.
// The server query builder and the client (gate + display) both depend on these,
// so they live in lib/ and use no panther UI surface.
//
// The collapse level is chosen by getRollupAdminLevel / getEffectiveRollupLevel
// (in get_fetch_config_from_po.ts) — see the doc comment there for the contract.

import type { PostAggregationExpression, ValueFunc } from "./types/_metric_installed.ts";

export const ADMIN_LEVELS = [
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

// Sentinel value placed in the collapsed admin column to mark the roll-up row.
// The top/bottom position is a display preference handled entirely client-side
// (getRollupAwareSort) — it never changes the SQL or the sentinel.
export const ROLLUP_SENTINEL = "__NATIONAL";
// Emitted by a previous release for position "bottom"; kept for one release so
// stored FigureInputs grids containing it still render. Nothing new emits it.
export const LEGACY_ROLLUP_SENTINEL = "zzNATIONAL";
// The ids display code matches/pins on (current + render-compat legacy).
export const ROLLUP_PIN_IDS = [ROLLUP_SENTINEL, LEGACY_ROLLUP_SENTINEL];

export function isAdminLevel(disOpt: string): disOpt is AdminLevel {
  return (ADMIN_LEVELS as readonly string[]).includes(disOpt);
}

// The metric fields rollup eligibility is decided from. hasFacilityLevelRows
// is derived at enrichment time (results table has a facility_id column) and
// may be absent on stale cached ResultsValue objects — absence reads as false.
export type RollupEligibilityInputs = {
  valueFunc: ValueFunc;
  postAggregationExpression?: PostAggregationExpression | null;
  hasFacilityLevelRows?: boolean;
};

// The roll-up re-aggregates a metric's rows across admin areas, so it is only
// offered when that re-aggregation is meaningful:
// - additive value funcs (SUM/COUNT);
// - identity values whose ratio is recomputed after the union via a
//   post-aggregation expression;
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
    rv.valueFunc === "SUM" ||
    rv.valueFunc === "COUNT" ||
    (rv.valueFunc === "AVG" && rv.hasFacilityLevelRows === true)
  );
}
