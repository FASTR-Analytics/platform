import { Sql } from "postgres";
import {
  DisaggregationOption,
  type PeriodOption,
  PresentationOption,
  ResultsValue,
  type InstanceConfigFacilityColumns,
  type TranslatableString,
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
    periodOptions: inferPeriodOptions(disaggregationOptions),
    aiDescription: dbMetric.ai_description
      ? parseJsonOrThrow(dbMetric.ai_description)
      : undefined,
    importantNotes: dbMetric.important_notes ?? undefined,
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
      label: { en: "Year/Month", fr: "Année/Mois" },
      allowedPresentationOptions: timeBasedOptions,
    },
    quarter_id: {
      label: { en: "Year/Quarter", fr: "Année/Trimestre" },
      allowedPresentationOptions: timeBasedOptions,
    },
    year: {
      label: { en: "Year", fr: "Année" },
      allowedPresentationOptions: timeBasedOptions,
    },
    month: {
      label: { en: "Month", fr: "Mois" },
      allowedPresentationOptions: timeBasedOptions,
    },
    admin_area_2: { label: { en: "Admin area 2", fr: "Unité administrative 2" } },
    admin_area_3: { label: { en: "Admin area 3", fr: "Unité administrative 3" } },
    admin_area_4: { label: { en: "Admin area 4", fr: "Unité administrative 4" } },
    indicator_common_id: { label: { en: "Indicator", fr: "Indicateur" } },
    denominator: { label: { en: "Denominator", fr: "Denominator" } },
    denominator_best_or_survey: { label: { en: "Denominator (best or survey)", fr: "Denominator (best or survey)" } },
    source_indicator: { label: { en: "Source indicator", fr: "Source indicator" } },
    target_population: { label: { en: "Target population", fr: "Target population" } },
    ratio_type: { label: { en: "Ratio type", fr: "Type de ratio" } },
    hfa_indicator: { label: { en: "HFA indicator", fr: "HFA indicator" } },
    hfa_category: { label: { en: "HFA category", fr: "HFA category" } },
    time_point: {
      label: { en: "Time point", fr: "Time point" },
      allowedPresentationOptions: timeBasedOptions,
    },
    facility_type: { label: { en: "Facility type", fr: "Facility type" } },
    facility_ownership: { label: { en: "Facility ownership", fr: "Facility ownership" } },
    facility_custom_1: { label: { en: "Facility custom 1", fr: "Facility custom 1" } },
    facility_custom_2: { label: { en: "Facility custom 2", fr: "Facility custom 2" } },
    facility_custom_3: { label: { en: "Facility custom 3", fr: "Facility custom 3" } },
    facility_custom_4: { label: { en: "Facility custom 4", fr: "Facility custom 4" } },
    facility_custom_5: { label: { en: "Facility custom 5", fr: "Facility custom 5" } },
  };

  return metadata[disOpt] || { label: { en: String(disOpt), fr: String(disOpt) } };
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
            label: facilityOpt.customLabel ? { en: facilityOpt.customLabel, fr: facilityOpt.customLabel } : metadata.label,
            isRequired: requiredOptions.includes(facilityOpt.option),
            allowedPresentationOptions: metadata.allowedPresentationOptions,
          });
        }
      }
    }
  }

  // Time columns
  const hasPeriodId = await detectColumnExists(projectDb, tableName, "period_id");
  if (hasPeriodId) {
    const periodDerivedColumns: DisaggregationOption[] = ["year", "month", "quarter_id", "period_id"];
    for (const disOpt of periodDerivedColumns) {
      const metadata = getDisaggregationMetadata(disOpt);
      disaggregationOptions.push({
        value: disOpt,
        label: metadata.label,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: metadata.allowedPresentationOptions,
      });
    }
  } else {
    const hasQuarterId = await detectColumnExists(projectDb, tableName, "quarter_id");
    if (hasQuarterId) {
      for (const disOpt of ["quarter_id", "year"] as DisaggregationOption[]) {
        const metadata = getDisaggregationMetadata(disOpt);
        disaggregationOptions.push({
          value: disOpt,
          label: metadata.label,
          isRequired: requiredOptions.includes(disOpt),
          allowedPresentationOptions: metadata.allowedPresentationOptions,
        });
      }
    } else {
      const hasYear = await detectColumnExists(projectDb, tableName, "year");
      if (hasYear) {
        const metadata = getDisaggregationMetadata("year");
        disaggregationOptions.push({
          value: "year",
          label: metadata.label,
          isRequired: requiredOptions.includes("year"),
          allowedPresentationOptions: metadata.allowedPresentationOptions,
        });
      }
    }
  }

  return disaggregationOptions;
}

function inferPeriodOptions(disaggregationOptions: ResultsValue["disaggregationOptions"]): PeriodOption[] {
  const disOpts = disaggregationOptions.map(d => d.value);
  if (disOpts.includes("period_id")) return ["period_id"];
  if (disOpts.includes("quarter_id")) return ["quarter_id"];
  if (disOpts.includes("year")) return ["year"];
  return [];
}
