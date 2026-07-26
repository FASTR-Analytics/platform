import type {
  DatasetType,
  GenericLongFormFetchConfig,
  InstanceConfigFacilityColumns,
  OptionalFacilityColumn,
} from "lib";
import type { DynamicPeriodColumn } from "./period_helpers.ts";

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
  // (btrim, and a text sentinel in the CASE result), and disaggregation
  // columns are not reliably text — module authors declare the type, so
  // `time_point` is integer in one instance here and text in another.
  textColumns: ReadonlySet<string>;
}
