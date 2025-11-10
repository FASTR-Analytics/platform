import type {
  GenericLongFormFetchConfig,
  InstanceConfigFacilityColumns,
  OptionalFacilityColumn,
} from "lib";
import type { CTEManager } from "./cte_manager.ts";
import type { DynamicPeriodColumn } from "./period_helpers.ts";

/**
 * Configuration for building queries (v2)
 */
export interface QueryConfigV2 {
  tableName: string;
  fetchConfig: GenericLongFormFetchConfig;
  queryContext: QueryContext;
  limit: number;
}

/**
 * Result of building a combined query (v2)
 */
export interface CombinedQueryResultV2 {
  query: string;
  whereStatements: string[];
  cteManager: CTEManager;
}

export interface QueryContext {
  hasPeriodId: boolean;
  facilityConfig?: InstanceConfigFacilityColumns;
  enabledFacilityColumns: OptionalFacilityColumn[];
  requestedOptionalFacilityColumns: OptionalFacilityColumn[];
  needsFacilityJoin: boolean;
  neededPeriodColumns: Set<DynamicPeriodColumn>;
  needsPeriodCTE: boolean;
  nonFacilityFilters: GenericLongFormFetchConfig["filters"];
  facilityFilters: GenericLongFormFetchConfig["filters"];
}
