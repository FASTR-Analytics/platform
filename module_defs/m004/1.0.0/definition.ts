import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

export const definition = {
  label: "M4. Coverage estimates",
  prerequisites: ["m002"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "OLD_04_module_coverage_estimates.R",
    commit: "main",
  },
  defaultPresentationObjects: presentationObjects,
  assetsToImport: [
    "survey_data_unified.csv",
    "population_estimates_only.csv",
    "ng_province_denominators_corrected.csv",
    "ng_national_denominators_corrected.csv",
    "chmis_national_for_module4.csv",
    "chmis_admin_area_for_module4.csv",
  ],
  dataSources: [
    {
      replacementString: "M2_adjusted_data_national.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data_national.csv",
      moduleId: "m002",
    },
    {
      replacementString: "M2_adjusted_data_admin_area.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data_admin_area.csv",
      moduleId: "m002",
    },
  ],
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  _______                                 __    __                               __                                     __               //
  // /       \                               /  |  /  |                             /  |                                   /  |              //
  // $$$$$$$  |  ______    _______  __    __ $$ | _$$ |_    _______         ______  $$ |____      __   ______    _______  _$$ |_    _______  //
  // $$ |__$$ | /      \  /       |/  |  /  |$$ |/ $$   |  /       |       /      \ $$      \    /  | /      \  /       |/ $$   |  /       | //
  // $$    $$< /$$$$$$  |/$$$$$$$/ $$ |  $$ |$$ |$$$$$$/  /$$$$$$$/       /$$$$$$  |$$$$$$$  |   $$/ /$$$$$$  |/$$$$$$$/ $$$$$$/  /$$$$$$$/  //
  // $$$$$$$  |$$    $$ |$$      \ $$ |  $$ |$$ |  $$ | __$$      \       $$ |  $$ |$$ |  $$ |   /  |$$    $$ |$$ |        $$ | __$$      \  //
  // $$ |  $$ |$$$$$$$$/  $$$$$$  |$$ \__$$ |$$ |  $$ |/  |$$$$$$  |      $$ \__$$ |$$ |__$$ |   $$ |$$$$$$$$/ $$ \_____   $$ |/  |$$$$$$  | //
  // $$ |  $$ |$$       |/     $$/ $$    $$/ $$ |  $$  $$//     $$/       $$    $$/ $$    $$/    $$ |$$       |$$       |  $$  $$//     $$/  //
  // $$/   $$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/    $$$$/ $$$$$$$/         $$$$$$/  $$$$$$$/__   $$ | $$$$$$$/  $$$$$$$/    $$$$/ $$$$$$$/   //
  //                                                                                       /  \__$$ |                                        //
  //                                                                                       $$    $$/                                         //
  //                                                                                        $$$$$$/                                          //
  //                                                                                                                                         //
  /////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  resultsObjects: [
    {
      id: "M4_coverage_estimation.csv",
      description: "Coverage estimates (National)",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
      },
      resultsValues: [
        {
          id: "m4-01-01",
          valueProps: [
            "coverage_original_estimate",
            "coverage_avgsurveyprojection",
            "coverage_cov",
          ],
          valueFunc: "AVG",
          valueLabelReplacements: {
            coverage_original_estimate:
              "Survey-based estimate (when available)",
            coverage_avgsurveyprojection:
              "Projected survey estimate (when survey data is missing)",
            coverage_cov: "Coverage calculated from HMIS data",
          },
          label: "Coverage calculated from HMIS data (National)",
          requiredDisaggregationOptions: ["indicator_common_id", "year"],
          formatAs: "percent",
          periodOptions: ["year"],
        },
      ],
    },
    {
      id: "M4_coverage_estimation_admin_area_2.csv",
      description: "Coverage results (sub-national level)",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        coverage_cov: "NUMERIC",
      },
      resultsValues: [
        {
          id: "m4-02-01",
          valueProps: ["coverage_cov"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            coverage_cov: "Coverage calculated from HMIS data",
          },
          label: "Coverage calculated from HMIS data (Admin Area 2)",
          requiredDisaggregationOptions: [
            "indicator_common_id",
            "admin_area_2",
            "year",
          ],
          formatAs: "percent",
          periodOptions: ["year"],
        },
      ],
    },
    {
      id: "M4_coverage_estimation_admin_area_3.csv",
      description: "Coverage results (sub-national level)",
      createTableStatementPossibleColumns: {
        admin_area_3: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        coverage_cov: "NUMERIC",
      },
      resultsValues: [
        {
          id: "m4-03-01",
          valueProps: ["coverage_cov"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            coverage_cov: "Coverage calculated from HMIS data",
          },
          label: "Coverage calculated from HMIS data (Admin Area 3)",
          requiredDisaggregationOptions: [
            "indicator_common_id",
            "admin_area_3",
            "year",
          ],
          formatAs: "percent",
          periodOptions: ["year"],
        },
      ],
    },
    {
      id: "M4_selected_denominator_per_indicator.csv",
      description: "Selected denominators",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        denominator_national: "TEXT NOT NULL",
        denominator_admin2: "TEXT NOT NULL",
        denominator_admin3: "TEXT NOT NULL",
      },
      resultsValues: [],
    },
  ],
  ////////////////////////////////////////////////////////////////////
  //  _______                                                       //
  // /       \                                                      //
  // $$$$$$$  | ______    ______   ______   _____  ____    _______  //
  // $$ |__$$ |/      \  /      \ /      \ /     \/    \  /       | //
  // $$    $$/ $$$$$$  |/$$$$$$  |$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
  // $$$$$$$/  /    $$ |$$ |  $$/ /    $$ |$$ | $$ | $$ |$$      \  //
  // $$ |     /$$$$$$$ |$$ |     /$$$$$$$ |$$ | $$ | $$ | $$$$$$  | //
  // $$ |     $$    $$ |$$ |     $$    $$ |$$ | $$ | $$ |/     $$/  //
  // $$/       $$$$$$$/ $$/       $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
  //                                                                //
  ////////////////////////////////////////////////////////////////////
  configRequirements: {
    configType: "parameters",
    parameters: [
      {
        description: "Count value to use",
        replacementString: "SELECTED_COUNT_VARIABLE",
        input: {
          inputType: "select",
          options: [
            { value: `count_final_none`, label: "Count (unadjusted)" },
            {
              value: `count_final_outliers`,
              label: "Count (adjusted for outliers)",
            },
            {
              value: `count_final_completeness`,
              label: "Count (adjusted for completeness)",
            },
            {
              value: `count_final_both`,
              label: "Count (adjusted for outliers and completeness)",
            },
          ],
          valueType: "string",
          defaultValue: "count_final_outliers",
        },
      },
      {
        description: "Level to calculate coverage for",
        replacementString: "ANALYSIS_LEVEL",
        input: {
          inputType: "select",
          options: [
            { value: `NATIONAL_ONLY`, label: "National only" },
            {
              value: `NATIONAL_PLUS_AA2`,
              label: "National and admin area 2",
            },
            {
              value: `NATIONAL_PLUS_AA2_AA3`,
              label: "National, admin area 2, and admin area 3",
            },
          ],
          valueType: "string",
          defaultValue: "NATIONAL_PLUS_AA2",
        },
      },
      {
        description: "Pregnancy loss rate",
        replacementString: "PREGNANCY_LOSS_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.03",
        },
      },
      {
        description: "Twin rate",
        replacementString: "TWIN_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.015",
        },
      },
      {
        description: "Stillbirth rate",
        replacementString: "STILLBIRTH_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.02",
        },
      },
      {
        description: "Neonatal mortality rate",
        replacementString: "P1_NMR",
        input: {
          inputType: "number",
          defaultValue: "0.039",
        },
      },
      {
        description: "Postneonatal mortality rate",
        replacementString: "P2_PNMR",
        input: {
          inputType: "number",
          defaultValue: "0.028",
        },
      },
      {
        description: "Infant mortality rate",
        replacementString: "INFANT_MORTALITY_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.067",
        },
      },
      {
        description: "Under 5 mortality rate",
        replacementString: "UNDER5_MORTALITY_RATE",
        input: {
          inputType: "number",
          defaultValue: "0.103",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
