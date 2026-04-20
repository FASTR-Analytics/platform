import { Sql } from "postgres";
import { getFacilityColumnsConfig } from "../db/instance/config.ts";
import { detectColumnExists, detectHasPeriodId } from "../db/mod.ts";
import {
  GenericLongFormFetchConfig,
  getEnabledOptionalFacilityColumns,
  throwIfErrWithData,
  type OptionalFacilityColumn,
} from "lib";
import { detectNeededPeriodColumns } from "./period_helpers.ts";
import type { QueryContext } from "./types.ts";

export async function buildQueryContext(
  mainDb: Sql,
  projectDb: Sql,
  tableName: string,
  fetchConfig: GenericLongFormFetchConfig
): Promise<QueryContext> {
  // Get facility config first (always, to know what's enabled)
  const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
  throwIfErrWithData(resFacilityConfig);
  const facilityConfig = resFacilityConfig.data;

  const enabledFacilityColumns =
    getEnabledOptionalFacilityColumns(facilityConfig);

  // NOW filter requested columns against enabled columns.
  // Sources (groupBys, filters[].col) are DisaggregationOption which excludes
  // "facility_name" — so the intersection can only yield disagg-eligible facility columns.
  type DisaggFacilityColumn = Exclude<OptionalFacilityColumn, "facility_name">;
  const requestedOptionalFacilityColumns: DisaggFacilityColumn[] = [
    ...new Set([
      ...fetchConfig.groupBys.filter((col): col is DisaggFacilityColumn =>
        enabledFacilityColumns.includes(col as OptionalFacilityColumn)
      ),
      ...fetchConfig.filters
        .map((f) => f.col)
        .filter((col): col is DisaggFacilityColumn =>
          enabledFacilityColumns.includes(col as OptionalFacilityColumn)
        ),
    ])
  ];

  const needsFacilityJoin = requestedOptionalFacilityColumns.length > 0;

  // Check which time column exists in the table
  const hasPeriodId = await detectHasPeriodId(projectDb, tableName);
  const hasQuarterId = !hasPeriodId && await detectColumnExists(projectDb, tableName, "quarter_id");
  const neededPeriodColumns = detectNeededPeriodColumns(fetchConfig);
  const needsPeriodCTE =
    (hasPeriodId && neededPeriodColumns.size > 0) ||
    (hasQuarterId && neededPeriodColumns.has("year"));

  const facilityFilters = fetchConfig.filters.filter((filter) =>
    enabledFacilityColumns.includes(filter.col as OptionalFacilityColumn)
  );

  const nonFacilityFilters = fetchConfig.filters.filter(
    (filter) =>
      !enabledFacilityColumns.includes(filter.col as OptionalFacilityColumn)
  );

  return {
    hasPeriodId,
    hasQuarterId,
    facilityConfig,
    enabledFacilityColumns,
    requestedOptionalFacilityColumns,
    needsFacilityJoin,
    neededPeriodColumns,
    needsPeriodCTE,
    nonFacilityFilters,
    facilityFilters,
  };
}
