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

// The dimensions whose values are indicator ids: the ids IndicatorMetadata
// keys on, and so the only ones that can carry a per-indicator `format_as`.
// Every other dimension (areas, facility attributes, HFA categories, periods)
// names something the format never varies by.
export const INDICATOR_DISAGGREGATION_OPTIONS = [
  "indicator_common_id",
  "hfa_indicator",
  "iceh_indicator",
] as const satisfies readonly DisaggregationOption[];

export function isIndicatorDisaggregationOption(
  disOpt: DisaggregationOption,
): boolean {
  return (INDICATOR_DISAGGREGATION_OPTIONS as readonly string[]).includes(
    disOpt,
  );
}

// The dimensions whose values are ids of the package catalog, which stamps
// each with the instance's own order (HFA indicators in workbook order, the
// HFA taxonomies in their reorderable order, ICEH strata in ICEH_STRAT_INFO
// order): the axes that sort by that order rather than by label.
export const CATALOG_ORDERED_DISAGGREGATION_OPTIONS: ReadonlySet<string> =
  new Set(
    [
      "indicator_common_id",
      "hfa_indicator",
      "hfa_variant_item",
      "hfa_category",
      "hfa_sub_category",
      "iceh_indicator",
      "strat",
    ] satisfies DisaggregationOption[],
  );
// Disaggregation options that are FILTER-ONLY: valid in `filters`, never in
// `groupBys` (nor client `disaggregateBy` slots). Grouping by a many-to-many
// dimension would double-count or expose raw composite groups.
// Enforced: validateFetchConfig (server boundary), validateFigureConfigEdit
// (the copilot's figure edits) and validateFigureConfig (`filterOnlyLaidOut`);
// excluded by groupedDims, startingFigureConfig, changeFigureType and the
// client disaggregation pickers.
export const FILTER_ONLY_DISAGGREGATION_OPTIONS: ReadonlySet<string> = new Set(
  ["hfa_service_category"] satisfies DisaggregationOption[],
);

// The period-VALUED display columns. Distinct from `periodOption`
// (period_options.ts), the queryable period formats: `month` is not a
// format: it is a derived, zero-padded text column (see
// PERIOD_COLUMN_EXPRESSIONS). Typed ReadonlySet<string> because consumers test
// arbitrary display props ("--v", facility columns), but the literals are
// compiler-checked against the enum above.
export const PERIOD_DISAGGREGATION_OPTIONS: ReadonlySet<string> = new Set(
  ["year", "month", "quarter_id", "period_id"] satisfies DisaggregationOption[],
);
