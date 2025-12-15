import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

export const definition = {
  label: "M6. Coverage estimates ~ new, part 2",
  prerequisites: ["m005"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "06_module_coverage_estimates_part2.R",
    commit: "main",
  },
  defaultPresentationObjects: presentationObjects,
  assetsToImport: [],
  dataSources: [
    {
      replacementString: "M4_combined_results_national.csv",
      sourceType: "results_object",
      resultsObjectId: "M4_combined_results_national.csv",
      moduleId: "m005",
    },
    {
      replacementString: "M4_combined_results_admin2.csv",
      sourceType: "results_object",
      resultsObjectId: "M4_combined_results_admin2.csv",
      moduleId: "m005",
    },
    {
      replacementString: "M4_combined_results_admin3.csv",
      sourceType: "results_object",
      resultsObjectId: "M4_combined_results_admin3.csv",
      moduleId: "m005",
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
      id: "M5_coverage_estimation_national.csv",
      description: "Coverage estimates (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator: "TEXT NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
        survey_raw_source: "TEXT",
        survey_raw_source_detail: "TEXT",
      },
      resultsValues: [
        {
          id: "m6-01-01",
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
      id: "M5_coverage_estimation_admin2.csv",
      description: "Coverage results (Admin area 2)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator: "TEXT NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
        survey_raw_source: "TEXT",
        survey_raw_source_detail: "TEXT",
      },
      resultsValues: [
        {
          id: "m6-02-01",
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
          label: "Coverage calculated from HMIS data (Admin area 2) - Survey, coverage, projection values",
          requiredDisaggregationOptions: [
            "indicator_common_id",
            "admin_area_2",
            "year",
          ],
          formatAs: "percent",
          periodOptions: ["year"],
        },
        {
          id: "m6-02-02",
          valueProps: [
            "coverage_cov",
          ],
          valueFunc: "AVG",
          valueLabelReplacements: {
            coverage_cov: "Coverage calculated from HMIS data",
          },
          label: "Coverage calculated from HMIS data (Admin area 2) - Coverage value only",
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
      id: "M5_coverage_estimation_admin3.csv",
      description: "Coverage results (Admin area 3)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator: "TEXT NOT NULL",
        coverage_original_estimate: "NUMERIC",
        coverage_avgsurveyprojection: "NUMERIC",
        coverage_cov: "NUMERIC",
        survey_raw_source: "TEXT",
        survey_raw_source_detail: "TEXT",
      },
      resultsValues: [
        {
          id: "m6-03-01",
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
          label: "Coverage calculated from HMIS data (Admin area 3) - Survey, coverage, projection values",
          requiredDisaggregationOptions: [
            "indicator_common_id",
            "admin_area_3",
            "year",
          ],
          formatAs: "percent",
          periodOptions: ["year"],
        },
        {
          id: "m6-03-02",
          valueProps: [
            "coverage_cov",
          ],
          valueFunc: "AVG",
          valueLabelReplacements: {
            coverage_cov: "Coverage calculated from HMIS data",
          },
          label: "Coverage calculated from HMIS data (Admin area 3) - Coverage value only",
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
    // {
    //   id: "M5_coverage_estimation_admin2_simplified.csv",
    //   description: "Selected denominators",
    //   createTableStatementPossibleColumns: {
    //     indicator_common_id: "TEXT NOT NULL",
    //     denominator: "TEXT NOT NULL",
    //   },
    //   resultsValues: [],
    // },
    // {
    //   id: "M5_coverage_estimation_admin3_simplified.csv",
    //   description: "Selected denominators",
    //   createTableStatementPossibleColumns: {
    //     indicator_common_id: "TEXT NOT NULL",
    //     denominator: "TEXT NOT NULL",
    //   },
    //   resultsValues: [],
    // },
    // {
    //   id: "M4_selected_denominator_per_indicator.csv",
    //   description: "Selected denominators",
    //   createTableStatementPossibleColumns: {
    //     indicator_common_id: "TEXT NOT NULL",
    //     denominator: "TEXT NOT NULL",
    //   },
    //   resultsValues: [],
    // },
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
        description: "DENOM_ANC1",
        replacementString: "DENOM_ANC1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },
            ...[
              "danc1_pregnancy",
              "ddelivery_pregnancy",
              "dbcg_pregnancy",
              "dlivebirths_pregnancy",
              "dwpp_pregnancy",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_ANC4",
        replacementString: "DENOM_ANC4",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_pregnancy",
              "ddelivery_pregnancy",
              "dbcg_pregnancy",
              "dlivebirths_pregnancy",
              "dwpp_pregnancy",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },

      {
        description: "DENOM_DELIVERY",
        replacementString: "DENOM_DELIVERY",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_BCG",
        replacementString: "DENOM_BCG",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_SBA",
        replacementString: "DENOM_SBA",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PNC1_MOTHER",
        replacementString: "DENOM_PNC1_MOTHER",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PNC1",
        replacementString: "DENOM_PNC1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_livebirth",
              "ddelivery_livebirth",
              "dbcg_livebirth",
              "dlivebirths_livebirth",
              "dwpp_livebirth",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PENTA1",
        replacementString: "DENOM_PENTA1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PENTA2",
        replacementString: "DENOM_PENTA2",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_PENTA3",
        replacementString: "DENOM_PENTA3",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_OPV1",
        replacementString: "DENOM_OPV1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_OPV2",
        replacementString: "DENOM_OPV2",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_OPV3",
        replacementString: "DENOM_OPV3",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_dpt",
              "ddelivery_dpt",
              "dpenta1_dpt",
              "dbcg_dpt",
              "dlivebirths_dpt",
              "dwpp_dpt",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_MEASLES1",
        replacementString: "DENOM_MEASLES1",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_measles1",
              "ddelivery_measles1",
              "dpenta1_measles1",
              "dbcg_measles1",
              "dlivebirths_measles1",
              "dwpp_measles1",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_MEASLES2",
        replacementString: "DENOM_MEASLES2",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[
              "danc1_measles2",
              "ddelivery_measles2",
              "dpenta1_measles2",
              "dbcg_measles2",
              "dlivebirths_measles2",
              "dwpp_measles2",
            ].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },

      {
        description: "DENOM_VITA",
        replacementString: "DENOM_VITA",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
      {
        description: "DENOM_FULLIMM",
        replacementString: "DENOM_FULLIMM",
        input: {
          inputType: "select",
          options: [
            { value: `best`, label: "Best" },

            ...[].map((v) => ({ value: v, label: v })),
          ],
          valueType: "string",
          defaultValue: "best",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
