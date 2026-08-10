import type {
  DatasetType,
  GenericLongFormFetchConfig,
  InstanceCalendar,
  InstanceConfigFacilityColumns,
  OptionalFacilityColumn,
} from "lib";
import type { DynamicPeriodColumn } from "./period_helpers.ts";

// The engine seam (PLAN_RESULTS_RUNS §2.4): cores build one SQL string and
// execute it through this; the Postgres wrapper passes projectDb.unsafe, the
// runs wrapper passes the DuckDB-over-parquet executor.
export type SqlRowsExecutor = (
  sql: string,
) => Promise<Record<string, unknown>[]>;

/**
 * Configuration for building queries
 */
export interface QueryConfig {
  tableName: string;
  fetchConfig: GenericLongFormFetchConfig;
  queryContext: QueryContext;
  limit: number;
}

export interface QueryContext {
  datasetFamily: DatasetType | undefined;
  hasPeriodId: boolean;
  hasQuarterId: boolean;
  calendar: InstanceCalendar;
  // Whether the results table has facility_id, i.e. its rows are raw facility
  // observations rather than pre-aggregated area summaries. Gates the sample-n
  // aggregate (buildAggregateColumns) and the AVG roll-up eligibility check.
  hasFacilityId: boolean;
  facilityConfig?: InstanceConfigFacilityColumns;
  enabledFacilityColumns: OptionalFacilityColumn[];
  requestedOptionalFacilityColumns: OptionalFacilityColumn[];
  needsFacilityJoin: boolean;
  neededPeriodColumns: Set<DynamicPeriodColumn>;
  needsPeriodCTE: boolean;
  nonFacilityFilters: GenericLongFormFetchConfig["filters"];
  facilityFilters: GenericLongFormFetchConfig["filters"];
  // TEXT-typed columns across the results table AND the joined facilities
  // table, by bare column name. Gates the blank fold: its SQL is text-only
  // (trim, and a text sentinel in the CASE result), and disaggregation
  // columns are not reliably text — module authors declare the type, so
  // `time_point` is integer in one instance here and text in another.
  textColumns: ReadonlySet<string>;
}
