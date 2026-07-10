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
  facilityConfig?: InstanceConfigFacilityColumns;
  enabledFacilityColumns: OptionalFacilityColumn[];
  requestedOptionalFacilityColumns: OptionalFacilityColumn[];
  needsFacilityJoin: boolean;
  neededPeriodColumns: Set<DynamicPeriodColumn>;
  needsPeriodCTE: boolean;
  nonFacilityFilters: GenericLongFormFetchConfig["filters"];
  facilityFilters: GenericLongFormFetchConfig["filters"];
}
