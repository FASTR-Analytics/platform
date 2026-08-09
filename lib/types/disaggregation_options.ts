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
  "hfa_category",
  "hfa_sub_category",
  "hfa_service_category",
  "time_point",
  "iceh_indicator",
  "strat",
  "level",
] as const;

export type DisaggregationOption = (typeof ALL_DISAGGREGATION_OPTIONS)[number];

// The period-VALUED display columns. Distinct from `periodOption`
// (_metric_installed.ts), the queryable period formats: `month` is not a
// format — it is a derived, zero-padded text column (see
// PERIOD_COLUMN_EXPRESSIONS). Typed ReadonlySet<string> because consumers test
// arbitrary display props ("--v", facility columns), but the literals are
// compiler-checked against the enum above.
export const PERIOD_DISAGGREGATION_OPTIONS: ReadonlySet<string> = new Set(
  ["year", "month", "quarter_id", "period_id"] satisfies DisaggregationOption[],
);
