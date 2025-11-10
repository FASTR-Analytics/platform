import { Sql } from "postgres";
import {
  DisaggregationOption,
  PresentationOption,
  ResultsValue,
  ResultsValueDefinition,
  type InstanceConfigFacilityColumns,
  type TranslatableString,
  t2,
  t,
  T,
} from "lib";
import { detectColumnExists, getResultsObjectTableName } from "../utils.ts";

/**
 * ResultsValue Enricher
 *
 * This module enriches ResultsValue definitions with disaggregation options based on
 * what columns are available in the results object table. There are three patterns
 * for how disaggregation columns work:
 *
 * 1. **JOIN-based columns (Facility Columns)**
 *    - Check if `facility_id` exists in the results table
 *    - If yes, `facility_type`, `facility_ownership`, etc. are accessed via JOIN to the facilities table
 *    - These columns exist in the `facilities` table, not the results object table itself
 *
 * 2. **Computed columns (Period Columns)**
 *    - Check if `period_id` exists in the results table
 *    - If yes, `year`, `month`, `quarter_id` are computed dynamically from `period_id` using SQL expressions
 *    - These columns don't physically exist but are generated on-the-fly
 *
 * 3. **Direct columns (Admin & Data-specific Columns)**
 *    - Check if columns physically exist in the results table
 *    - Admin columns: `admin_area_2`, `admin_area_3`, `admin_area_4`
 *    - Data-specific columns: `indicator_common_id`, `denominator`, `ratio_type`,
 *      `hfa_indicator`, `hfa_category`, `time_point`
 *    - These are actual columns stored directly in the table
 *
 * The enricher validates which disaggregation options are actually available before
 * including them, ensuring the client only sees options that will work when querying data.
 */

// Main enrichment function
export async function enrichResultsValue(
  resultsValue: ResultsValueDefinition,
  resultsObjectId: string,
  projectDb: Sql,
  facilityConfig?: InstanceConfigFacilityColumns
): Promise<ResultsValue> {
  // Always build disaggregation options from the simplified format
  // Assuming module definitions now use requiredDisaggregationOptions
  const disaggregationOptions = await buildDisaggregationOptions(
    resultsValue.requiredDisaggregationOptions,
    // resultsValue.customDisaggregationOptions,
    resultsObjectId,
    projectDb,
    facilityConfig,
    resultsValue.autoIncludeFacilityColumns
  );

  // Convert to full ResultsValue
  const enrichedResultsValue: ResultsValue = {
    ...resultsValue,
    disaggregationOptions,
  };

  return enrichedResultsValue;
}

// Metadata for standard disaggregation options
type DisaggregationMetadata = {
  label: TranslatableString;
  allowedPresentationOptions?: PresentationOption[];
};

// Define standard disaggregation metadata
function getDisaggregationMetadata(
  disOpt: DisaggregationOption
): DisaggregationMetadata {
  // Time-based disaggregations - only allow table and chart
  const timeBasedOptions: PresentationOption[] = ["table", "chart"];

  const metadata: Record<string, DisaggregationMetadata> = {
    // Time-based
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

    // Geographic - all presentation options allowed
    admin_area_2: { label: T.FRENCH_UI_STRINGS.admin_area_2 },
    admin_area_3: { label: T.FRENCH_UI_STRINGS.admin_area_3 },
    admin_area_4: { label: T.FRENCH_UI_STRINGS.admin_area_4 },

    // Data-specific
    indicator_common_id: { label: T.FRENCH_UI_STRINGS.indicator },
    denominator: {
      label: T.Visualizations.denominator,
    },
    denominator_best_or_survey: {
      label: T.Visualizations.denominator_best_or_survey,
    },
    source_indicator: {
      label: T.Visualizations.source_indicator,
    },
    target_population: {
      label: T.Visualizations.target_population,
    },
    ratio_type: { label: T.Visualizations.ratio_type },
    hfa_indicator: { label: T.Visualizations.hfa_indicator },
    hfa_category: { label: T.Visualizations.hfa_category },
    time_point: {
      label: T.Visualizations.time_point,
      allowedPresentationOptions: timeBasedOptions,
    },

    // Facility columns (labels will be overridden by facility config)
    facility_type: { label: T.Visualizations.facility_type },
    facility_ownership: { label: T.Visualizations.facility_ownership },
    facility_custom_1: { label: T.Visualizations.facility_custom_1 },
    facility_custom_2: { label: T.Visualizations.facility_custom_2 },
    facility_custom_3: { label: T.Visualizations.facility_custom_3 },
    facility_custom_4: { label: T.Visualizations.facility_custom_4 },
    facility_custom_5: { label: T.Visualizations.facility_custom_5 },
  };

  // Return metadata or default
  return metadata[disOpt] || { label: String(disOpt) };
}

// Build full disaggregation options from required list
async function buildDisaggregationOptions(
  requiredOptions: DisaggregationOption[],
  // customOptions: ResultsValueDefinition["customDisaggregationOptions"] | undefined,
  resultsObjectId: string,
  projectDb: Sql,
  facilityConfig: InstanceConfigFacilityColumns | undefined,
  autoIncludeFacilityColumns: boolean | undefined
): Promise<ResultsValue["disaggregationOptions"]> {
  const disaggregationOptions: ResultsValue["disaggregationOptions"] = [];
  const tableName = getResultsObjectTableName(resultsObjectId);

  ////////////////////////////
  //                        //
  //    Physical columns    //
  //                        //
  ////////////////////////////

  // Columns that must physically exist in the table
  const physicalColumnsToCheck: DisaggregationOption[] = [
    // Admin columns
    "admin_area_2",
    "admin_area_3",
    "admin_area_4",
    // Data-specific columns
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

  // Check physical columns and add if they exist
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

  ////////////////////////////
  //                        //
  //    Facility columns    //
  //                        //
  ////////////////////////////

  // Add facility columns if applicable
  if (autoIncludeFacilityColumns !== false && facilityConfig) {
    // Check if results object table has facility_id column
    const tableName = getResultsObjectTableName(resultsObjectId);
    const hasFacilityId = await detectColumnExists(
      projectDb,
      tableName,
      "facility_id"
    );

    if (hasFacilityId) {
      // Add facility columns based on instance config
      const facilityOptions: {
        option: DisaggregationOption;
        enabled: boolean;
        customLabel?: string;
      }[] = [
        {
          option: "facility_type",
          enabled: facilityConfig.includeTypes,
          customLabel: facilityConfig.labelTypes,
        },
        {
          option: "facility_ownership",
          enabled: facilityConfig.includeOwnership,
          customLabel: facilityConfig.labelOwnership,
        },
        {
          option: "facility_custom_1",
          enabled: facilityConfig.includeCustom1,
          customLabel: facilityConfig.labelCustom1,
        },
        {
          option: "facility_custom_2",
          enabled: facilityConfig.includeCustom2,
          customLabel: facilityConfig.labelCustom2,
        },
        {
          option: "facility_custom_3",
          enabled: facilityConfig.includeCustom3,
          customLabel: facilityConfig.labelCustom3,
        },
        {
          option: "facility_custom_4",
          enabled: facilityConfig.includeCustom4,
          customLabel: facilityConfig.labelCustom4,
        },
        {
          option: "facility_custom_5",
          enabled: facilityConfig.includeCustom5,
          customLabel: facilityConfig.labelCustom5,
        },
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

  ////////////////////////
  //                    //
  //    Time columns    //
  //                    //
  ////////////////////////

  // Check if period_id exists (needed for dynamic period columns)
  const hasPeriodId = await detectColumnExists(
    projectDb,
    tableName,
    "period_id"
  );

  // Period columns (year, month, quarter_id) are dynamically generated from period_id
  const periodDerivedColumns: DisaggregationOption[] = hasPeriodId
    ? ["year", "month", "quarter_id", "period_id"]
    : [];

  // Add period-derived columns if period_id exists
  for (const disOpt of periodDerivedColumns) {
    const metadata = getDisaggregationMetadata(disOpt);
    disaggregationOptions.push({
      value: disOpt,
      label: metadata.label,
      isRequired: requiredOptions.includes(disOpt),
      allowedPresentationOptions: metadata.allowedPresentationOptions,
    });
  }

  // Add any custom options
  // if (customOptions) {
  //   for (const customOpt of customOptions) {
  //     disaggregationOptions.push(customOpt);
  //   }
  // }

  return disaggregationOptions;
}
