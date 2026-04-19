import { z } from "zod";
import { Sql } from "postgres";
import {
  DisaggregationOption,
  type PeriodOption,
  ResultsValue,
  disaggregationOption,
  getDisaggregationAllowedPresentationOptions,
  metricAIDescriptionStored,
  postAggregationExpression,
  type InstanceConfigFacilityColumns,
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
  facilityConfig?: InstanceConfigFacilityColumns,
): Promise<ResultsValue> {
  const resultsObjectId = dbMetric.results_object_id;

  const disaggregationOptions = await buildDisaggregationOptions(
    z.array(disaggregationOption).parse(JSON.parse(dbMetric.required_disaggregation_options)),
    resultsObjectId,
    projectDb,
    facilityConfig,
  );

  const enrichedMetric: ResultsValue = {
    id: dbMetric.id,
    resultsObjectId,
    valueProps: z.array(z.string()).parse(JSON.parse(dbMetric.value_props)),
    valueFunc: dbMetric.value_func as ResultsValue["valueFunc"],
    postAggregationExpression: dbMetric.post_aggregation_expression
      ? postAggregationExpression.parse(JSON.parse(dbMetric.post_aggregation_expression))
      : undefined,
    valueLabelReplacements: dbMetric.value_label_replacements
      ? z.record(z.string(), z.string()).parse(JSON.parse(dbMetric.value_label_replacements))
      : undefined,
    label: dbMetric.label,
    variantLabel: dbMetric.variant_label ?? undefined,
    formatAs: dbMetric.format_as as "percent" | "number",
    disaggregationOptions,
    mostGranularTimePeriodColumnInResultsFile: inferMostGranularTimePeriodColumn(disaggregationOptions),
    aiDescription: dbMetric.ai_description
      ? metricAIDescriptionStored.parse(JSON.parse(dbMetric.ai_description))
      : undefined,
    importantNotes: dbMetric.important_notes ?? undefined,
  };

  return enrichedMetric;
}

async function buildDisaggregationOptions(
  requiredOptions: DisaggregationOption[],
  resultsObjectId: string,
  projectDb: Sql,
  facilityConfig: InstanceConfigFacilityColumns | undefined,
): Promise<ResultsValue["disaggregationOptions"]> {
  const out: ResultsValue["disaggregationOptions"] = [];
  const tableName = getResultsObjectTableName(resultsObjectId);

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
    if (await detectColumnExists(projectDb, tableName, disOpt)) {
      out.push({
        value: disOpt,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(disOpt),
      });
    }
  }

  if (facilityConfig) {
    const hasFacilityId = await detectColumnExists(projectDb, tableName, "facility_id");
    if (hasFacilityId) {
      const facilityOptions: { option: DisaggregationOption; enabled: boolean }[] = [
        { option: "facility_type", enabled: facilityConfig.includeTypes },
        { option: "facility_ownership", enabled: facilityConfig.includeOwnership },
        { option: "facility_custom_1", enabled: facilityConfig.includeCustom1 },
        { option: "facility_custom_2", enabled: facilityConfig.includeCustom2 },
        { option: "facility_custom_3", enabled: facilityConfig.includeCustom3 },
        { option: "facility_custom_4", enabled: facilityConfig.includeCustom4 },
        { option: "facility_custom_5", enabled: facilityConfig.includeCustom5 },
      ];
      for (const f of facilityOptions) {
        if (!f.enabled) continue;
        out.push({
          value: f.option,
          isRequired: requiredOptions.includes(f.option),
          allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(f.option),
        });
      }
    }
  }

  const hasPeriodId = await detectColumnExists(projectDb, tableName, "period_id");
  if (hasPeriodId) {
    for (const disOpt of ["year", "month", "quarter_id", "period_id"] as DisaggregationOption[]) {
      out.push({
        value: disOpt,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(disOpt),
      });
    }
  } else if (await detectColumnExists(projectDb, tableName, "quarter_id")) {
    for (const disOpt of ["quarter_id", "year"] as DisaggregationOption[]) {
      out.push({
        value: disOpt,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(disOpt),
      });
    }
  } else if (await detectColumnExists(projectDb, tableName, "year")) {
    out.push({
      value: "year",
      isRequired: requiredOptions.includes("year"),
      allowedPresentationOptions: getDisaggregationAllowedPresentationOptions("year"),
    });
  }

  return out;
}

function inferMostGranularTimePeriodColumn(
  disaggregationOptions: ResultsValue["disaggregationOptions"],
): PeriodOption | undefined {
  const disOpts = disaggregationOptions.map((d) => d.value);
  if (disOpts.includes("period_id")) return "period_id";
  if (disOpts.includes("quarter_id")) return "quarter_id";
  if (disOpts.includes("year")) return "year";
  return undefined;
}
