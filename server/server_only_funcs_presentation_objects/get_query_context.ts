import { Sql } from "postgres";
import { getStructureSchemaForDatasetFamily } from "../db/instance/config.ts";
import {
  detectColumnExists,
  detectHasPeriodId,
  getTextColumnNames,
} from "../db/mod.ts";
import {
  GenericLongFormFetchConfig,
  getCalendar,
  getEnabledOptionalFacilityColumns,
  throwIfErrWithData,
  type DatasetType,
  type DisaggregationOption,
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
  // Sources (groupBys, filters[].disOpt) are DisaggregationOption, which does
  // not include "facility_name" — that column is import/display metadata
  // (toggled by includeNames, supplied by DHIS2), never a grouping dimension.
  // Deriving the intersection rather than naming the excluded member keeps this
  // honest if either union changes.
  type DisaggFacilityColumn = Extract<
    OptionalFacilityColumn,
    DisaggregationOption
  >;
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
  // The FAMILY's schema decides what's enabled (iceh/undefined → none)
  const structureSchema = await getStructureSchemaForDatasetFamily(
    mainDb,
    datasetFamily,
  );

  const enabledFacilityColumns = structureSchema
    ? getEnabledOptionalFacilityColumns(structureSchema)
    : [];

  const facilityContext = computeFacilityContext(
    fetchConfig,
    enabledFacilityColumns,
  );

  // Check which time column exists in the table
  const hasPeriodId = await detectHasPeriodId(projectDb, tableName);
  const hasQuarterId = !hasPeriodId && await detectColumnExists(projectDb, tableName, "quarter_id");
  const hasFacilityId = await detectColumnExists(
    projectDb,
    tableName,
    "facility_id",
  );
  const calendar = getCalendar();
  const neededPeriodColumns = detectNeededPeriodColumns(fetchConfig);
  const needsPeriodCTE = needsPeriodCTEFor({
    hasPeriodId,
    hasQuarterId,
    neededPeriodColumns,
    calendar,
  });

  // Both sides of the join: a facility column reaches the query as `f.<col>`,
  // and its type lives in the facilities table, not the results table.
  const textColumns = await getTextColumnNames(projectDb, tableName);
  if (facilityContext.needsFacilityJoin) {
    const facilityTextColumns = await getTextColumnNames(
      projectDb,
      facilitiesTableForFamily(datasetFamily),
    );
    for (const col of facilityTextColumns) {
      textColumns.add(col);
    }
  }

  return {
    textColumns,
    datasetFamily,
    hasPeriodId,
    hasQuarterId,
    hasFacilityId,
    calendar,
    enabledFacilityColumns,
    ...facilityContext,
    needsPeriodCTE,
    neededPeriodColumns,
  };
}
