import { Sql } from "postgres";
import {
  DisaggregationOption,
  PresentationOption,
  ResultsValue,
  type InstanceConfigFacilityColumns,
  type TranslatableString,
  t2,
  T,
  parseJsonOrThrow,
} from "lib";
import { detectColumnExists, getResultsObjectTableName } from "../utils.ts";
import { DBMetric } from "./_project_database_types.ts";

/**
 * Metric Enricher
 *
 * Converts a DBMetric from the database into a full ResultsValue with enriched
 * disaggregation options based on what columns are available in the results object table.
 */

export async function enrichMetric(
  dbMetric: DBMetric,
  projectDb: Sql,
  facilityConfig?: InstanceConfigFacilityColumns
): Promise<ResultsValue> {
  const resultsObjectId = dbMetric.results_object_id;

  const disaggregationOptions = await buildDisaggregationOptions(
    parseJsonOrThrow<DisaggregationOption[]>(dbMetric.required_disaggregation_options),
    resultsObjectId,
    projectDb,
    facilityConfig,
  );

  const enrichedMetric: ResultsValue = {
    id: dbMetric.id,
    resultsObjectId,
    valueProps: parseJsonOrThrow<string[]>(dbMetric.value_props),
    valueFunc: dbMetric.value_func as ResultsValue["valueFunc"],
    postAggregationExpression: dbMetric.post_aggregation_expression
      ? parseJsonOrThrow(dbMetric.post_aggregation_expression)
      : undefined,
    valueLabelReplacements: dbMetric.value_label_replacements
      ? parseJsonOrThrow(dbMetric.value_label_replacements)
      : undefined,
    label: dbMetric.label,
    variantLabel: dbMetric.variant_label ?? undefined,
    formatAs: dbMetric.format_as as "percent" | "number",
    disaggregationOptions,
    periodOptions: parseJsonOrThrow(dbMetric.period_options),
    aiDescription: dbMetric.ai_description
      ? parseJsonOrThrow(dbMetric.ai_description)
      : undefined,
  };

  return enrichedMetric;
}

type DisaggregationMetadata = {
  label: TranslatableString;
  allowedPresentationOptions?: PresentationOption[];
};

function getDisaggregationMetadata(
  disOpt: DisaggregationOption
): DisaggregationMetadata {
  const timeBasedOptions: PresentationOption[] = ["table", "chart"];

  const metadata: Record<string, DisaggregationMetadata> = {
    period_id: {
      label: T.Visualizations.year_month,
      allowedPresentationOptions: timeBasedOptions,
    },
    quarter_id: {
      label: T.Visualizations.year_quarter,
      allowedPresentationOptions: timeBasedOptions,
    },
    year: {
      label: T.Visualizations.year,
      allowedPresentationOptions: timeBasedOptions,
    },
    month: {
      label: T.Visualizations.month,
      allowedPresentationOptions: timeBasedOptions,
    },
    admin_area_2: { label: T.FRENCH_UI_STRINGS.admin_area_2 },
    admin_area_3: { label: T.FRENCH_UI_STRINGS.admin_area_3 },
    admin_area_4: { label: T.FRENCH_UI_STRINGS.admin_area_4 },
    indicator_common_id: { label: T.FRENCH_UI_STRINGS.indicator },
    denominator: { label: T.Visualizations.denominator },
    denominator_best_or_survey: { label: T.Visualizations.denominator_best_or_survey },
    source_indicator: { label: T.Visualizations.source_indicator },
    target_population: { label: T.Visualizations.target_population },
    ratio_type: { label: T.Visualizations.ratio_type },
    hfa_indicator: { label: T.Visualizations.hfa_indicator },
    hfa_category: { label: T.Visualizations.hfa_category },
    time_point: {
      label: T.Visualizations.time_point,
      allowedPresentationOptions: timeBasedOptions,
    },
    facility_type: { label: T.Visualizations.facility_type },
    facility_ownership: { label: T.Visualizations.facility_ownership },
    facility_custom_1: { label: T.Visualizations.facility_custom_1 },
    facility_custom_2: { label: T.Visualizations.facility_custom_2 },
    facility_custom_3: { label: T.Visualizations.facility_custom_3 },
    facility_custom_4: { label: T.Visualizations.facility_custom_4 },
    facility_custom_5: { label: T.Visualizations.facility_custom_5 },
  };

  return metadata[disOpt] || { label: String(disOpt) };
}

async function buildDisaggregationOptions(
  requiredOptions: DisaggregationOption[],
  resultsObjectId: string,
  projectDb: Sql,
  facilityConfig: InstanceConfigFacilityColumns | undefined,
): Promise<ResultsValue["disaggregationOptions"]> {
  const disaggregationOptions: ResultsValue["disaggregationOptions"] = [];
  const tableName = getResultsObjectTableName(resultsObjectId);

  // Physical columns
  const physicalColumnsToCheck: DisaggregationOption[] = [
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
    "hfa_category",
    "time_point",
  ];

  for (const disOpt of physicalColumnsToCheck) {
    const exists = await detectColumnExists(projectDb, tableName, disOpt);
    if (exists) {
      const metadata = getDisaggregationMetadata(disOpt);
      disaggregationOptions.push({
        value: disOpt,
        label: metadata.label,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: metadata.allowedPresentationOptions,
      });
    }
  }

  // Facility columns
  if (facilityConfig) {
    const hasFacilityId = await detectColumnExists(projectDb, tableName, "facility_id");

    if (hasFacilityId) {
      const facilityOptions: {
        option: DisaggregationOption;
        enabled: boolean;
        customLabel?: string;
      }[] = [
        { option: "facility_type", enabled: facilityConfig.includeTypes, customLabel: facilityConfig.labelTypes },
        { option: "facility_ownership", enabled: facilityConfig.includeOwnership, customLabel: facilityConfig.labelOwnership },
        { option: "facility_custom_1", enabled: facilityConfig.includeCustom1, customLabel: facilityConfig.labelCustom1 },
        { option: "facility_custom_2", enabled: facilityConfig.includeCustom2, customLabel: facilityConfig.labelCustom2 },
        { option: "facility_custom_3", enabled: facilityConfig.includeCustom3, customLabel: facilityConfig.labelCustom3 },
        { option: "facility_custom_4", enabled: facilityConfig.includeCustom4, customLabel: facilityConfig.labelCustom4 },
        { option: "facility_custom_5", enabled: facilityConfig.includeCustom5, customLabel: facilityConfig.labelCustom5 },
      ];

      for (const facilityOpt of facilityOptions) {
        if (facilityOpt.enabled) {
          const metadata = getDisaggregationMetadata(facilityOpt.option);
          disaggregationOptions.push({
            value: facilityOpt.option,
            label: facilityOpt.customLabel || metadata.label,
            isRequired: requiredOptions.includes(facilityOpt.option),
            allowedPresentationOptions: metadata.allowedPresentationOptions,
          });
        }
      }
    }
  }

  // Time columns
  const hasPeriodId = await detectColumnExists(projectDb, tableName, "period_id");
  const periodDerivedColumns: DisaggregationOption[] = hasPeriodId
    ? ["year", "month", "quarter_id", "period_id"]
    : [];

  for (const disOpt of periodDerivedColumns) {
    const metadata = getDisaggregationMetadata(disOpt);
    disaggregationOptions.push({
      value: disOpt,
      label: metadata.label,
      isRequired: requiredOptions.includes(disOpt),
      allowedPresentationOptions: metadata.allowedPresentationOptions,
    });
  }

  return disaggregationOptions;
}
