import type { DisaggregationOption, StructureColumns } from "lib";

// The physical columns a results object may carry that are disaggregation
// options in their own right. Availability is derived from the parquet's
// stamped column set at finalize — never probed at read time.
export const PHYSICAL_DISAGGREGATION_COLUMNS: DisaggregationOption[] = [
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
  "indicator_common_id",
  "denominator",
  "denominator_best_or_survey",
  "source_indicator",
  "target_population",
  "ratio_type",
  "hfa_indicator",
  "hfa_variant_item",
  "hfa_category",
  "hfa_sub_category",
  "hfa_service_category",
  "time_point",
  "iceh_indicator",
  "strat",
  "level",
];

export function getEnabledFacilityDisaggregationOptions(
  facilityConfig: StructureColumns,
): DisaggregationOption[] {
  const facilityOptions: { option: DisaggregationOption; enabled: boolean }[] = [
    { option: "facility_type", enabled: facilityConfig.includeTypes },
    { option: "facility_ownership", enabled: facilityConfig.includeOwnership },
    { option: "facility_custom_1", enabled: facilityConfig.includeCustom1 },
    { option: "facility_custom_2", enabled: facilityConfig.includeCustom2 },
    { option: "facility_custom_3", enabled: facilityConfig.includeCustom3 },
    { option: "facility_custom_4", enabled: facilityConfig.includeCustom4 },
    { option: "facility_custom_5", enabled: facilityConfig.includeCustom5 },
  ];
  return facilityOptions.filter((f) => f.enabled).map((f) => f.option);
}

// The available disaggregation options of a results object, from its column
// set and the family's facility-column config. Facility columns need
// facility_id on the rows (they come from the facilities join); the derived
// period columns follow the physical time column. Ordering is the UI list
// order.
export function deriveAvailableDisaggregationOptions(
  columnNames: Set<string>,
  facilityConfig: StructureColumns | undefined,
): DisaggregationOption[] {
  const out: DisaggregationOption[] = [];
  for (const disOpt of PHYSICAL_DISAGGREGATION_COLUMNS) {
    if (columnNames.has(disOpt)) {
      out.push(disOpt);
    }
  }
  if (columnNames.has("facility_id") && facilityConfig) {
    out.push(...getEnabledFacilityDisaggregationOptions(facilityConfig));
  }
  if (columnNames.has("period_id")) {
    out.push("year", "month", "quarter_id", "period_id");
  } else if (columnNames.has("quarter_id")) {
    out.push("quarter_id", "year");
  } else if (columnNames.has("year")) {
    out.push("year");
  }
  return out;
}
