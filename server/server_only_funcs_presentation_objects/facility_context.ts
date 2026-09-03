import {
  GenericLongFormFetchConfig,
  type DatasetType,
  type DisaggregationOption,
  type OptionalFacilityColumn,
} from "lib";
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

// The facility-column slice of the query context: the fetch config's
// facility-column requests and filters, split against the family's enabled
// optional facility columns (the manifest's per-family structure schema,
// resolved by run_read's context builder).
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
