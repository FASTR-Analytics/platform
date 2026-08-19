import {
  type DisaggregationOption,
  type PeriodOption,
  type ResultsValue,
  type StructureColumns,
} from "lib";

// The disaggregation columns a results object can physically carry, and the
// two derivations every reader shares. Single source of the probe list — the
// run-manifest availability derivation (server/runs/) gates on exactly these
// columns.

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

export function inferMostGranularTimePeriodColumn(
  disaggregationOptions: ResultsValue["disaggregationOptions"],
): PeriodOption | undefined {
  const disOpts = disaggregationOptions.map((d) => d.value);
  if (disOpts.includes("period_id")) return "period_id";
  if (disOpts.includes("quarter_id")) return "quarter_id";
  if (disOpts.includes("year")) return "year";
  return undefined;
}
