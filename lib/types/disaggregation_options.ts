export const ALL_DISAGGREGATION_OPTIONS = [
  "indicator_common_id",
  "admin_area_2",
  "admin_area_3",
  "admin_area_4",
  "year",
  "month",
  "quarter_id",
  "period_id",
  "denominator",
  "denominator_best_or_survey",
  "source_indicator",
  "target_population",
  "ratio_type",
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
  "hfa_indicator",
  // Immediately after hfa_indicator deliberately: starting-config slot
  // assignment follows list order, so this yields the headline
  // indicator-row × item-col default for the variants metric.
  "hfa_variant_item",
  "hfa_category",
  "hfa_sub_category",
  "hfa_service_category",
  "time_point",
  "iceh_indicator",
  "strat",
  "level",
] as const;

export type DisaggregationOption = (typeof ALL_DISAGGREGATION_OPTIONS)[number];

// The dimensions whose values are indicator ids — the ids IndicatorMetadata
// keys on, and so the only ones that can carry a per-indicator `format_as`.
// Every other dimension (areas, facility attributes, HFA categories, periods)
// names something the format never varies by.
export const INDICATOR_DISAGGREGATION_OPTIONS = [
  "indicator_common_id",
  "hfa_indicator",
  "iceh_indicator",
] as const satisfies readonly DisaggregationOption[];
