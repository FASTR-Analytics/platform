import type {
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
}
