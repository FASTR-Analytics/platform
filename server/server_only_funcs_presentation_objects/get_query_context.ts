import { Sql } from "postgres";
import { getFacilityColumnsConfig } from "../db/instance/config.ts";
import { detectColumnExists, detectHasPeriodId } from "../db/mod.ts";
import {
  GenericLongFormFetchConfig,
  getCalendar,
  getEnabledOptionalFacilityColumns,
  throwIfErrWithData,
  type DatasetType,
  type OptionalFacilityColumn,
} from "lib";
import { detectNeededPeriodColumns, needsPeriodCTEFor } from "./period_helpers.ts";
import type { QueryContext } from "./types.ts";

export function facilitiesTableForFamily(
  family: DatasetType | undefined,
): string {
  if (family === "hmis") return "facilities_hmis";
  if (family === "hfa") return "facilities_hfa";
  throw new Error(
    `No facilities table for dataset family "${
      family ?? "unknown"
    }" — facility joins are only valid for HMIS/HFA modules`,
  );
}

// The facility-column slice of the query context, shared by the Postgres
// builder below and the manifest-based builder in server/run_query/ so the
// two cannot drift.
export function computeFacilityContext(
  fetchConfig: GenericLongFormFetchConfig,
  enabledFacilityColumns: OptionalFacilityColumn[],
): Pick<
  QueryContext,
  | "requestedOptionalFacilityColumns"
  | "needsFacilityJoin"
  | "facilityFilters"
  | "nonFacilityFilters"
> {
  // Filter requested columns against enabled columns.
  // Sources (groupBys, filters[].col) are DisaggregationOption which excludes
  // "facility_name" — so the intersection can only yield disagg-eligible facility columns.
  type DisaggFacilityColumn = Exclude<OptionalFacilityColumn, "facility_name">;
  const requestedOptionalFacilityColumns: DisaggFacilityColumn[] = [
    ...new Set([
      ...fetchConfig.groupBys.filter((col): col is DisaggFacilityColumn =>
        enabledFacilityColumns.includes(col as OptionalFacilityColumn)
      ),
      ...fetchConfig.filters
        .map((f) => f.disOpt)
        .filter((col): col is DisaggFacilityColumn =>
          enabledFacilityColumns.includes(col as OptionalFacilityColumn)
        ),
    ])
  ];

  const facilityFilters = fetchConfig.filters.filter((filter) =>
    enabledFacilityColumns.includes(filter.disOpt as OptionalFacilityColumn)
  );

  const nonFacilityFilters = fetchConfig.filters.filter(
    (filter) =>
      !enabledFacilityColumns.includes(filter.disOpt as OptionalFacilityColumn)
  );

  return {
    requestedOptionalFacilityColumns,
    needsFacilityJoin: requestedOptionalFacilityColumns.length > 0,
    facilityFilters,
    nonFacilityFilters,
  };
}

export async function buildQueryContext(
  mainDb: Sql,
  projectDb: Sql,
  tableName: string,
  fetchConfig: GenericLongFormFetchConfig,
  datasetFamily: DatasetType | undefined,
): Promise<QueryContext> {
  // Get facility config first (always, to know what's enabled)
  const resFacilityConfig = await getFacilityColumnsConfig(mainDb);
  throwIfErrWithData(resFacilityConfig);
  const facilityConfig = resFacilityConfig.data;

  const enabledFacilityColumns =
    getEnabledOptionalFacilityColumns(facilityConfig);

  const facilityContext = computeFacilityContext(
    fetchConfig,
    enabledFacilityColumns,
  );

  // Check which time column exists in the table
  const hasPeriodId = await detectHasPeriodId(projectDb, tableName);
  const hasQuarterId = !hasPeriodId && await detectColumnExists(projectDb, tableName, "quarter_id");
  const calendar = getCalendar();
  const neededPeriodColumns = detectNeededPeriodColumns(fetchConfig);
  const needsPeriodCTE = needsPeriodCTEFor({
    hasPeriodId,
    hasQuarterId,
    neededPeriodColumns,
    calendar,
  });

  return {
    datasetFamily,
    hasPeriodId,
    hasQuarterId,
    calendar,
    facilityConfig,
    enabledFacilityColumns,
    ...facilityContext,
    needsPeriodCTE,
    neededPeriodColumns,
  };
}
