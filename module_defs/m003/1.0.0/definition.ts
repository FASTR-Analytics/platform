import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

export const definition = {
  label: "M3. Service utilization",
  prerequisites: ["m001", "m002"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "03_module_service_utilization.R",
    commit: "main",
  },
  defaultPresentationObjects: presentationObjects,
  assetsToImport: [],
  dataSources: [
    {
      sourceType: "dataset",
      replacementString: "PROJECT_DATA_HMIS",
      datasetType: "hmis",
    },
    {
      replacementString: "M1_output_outliers.csv",
      sourceType: "results_object",
      resultsObjectId: "M1_output_outliers.csv",
      moduleId: "m001",
    },
    {
      replacementString: "M2_adjusted_data_admin_area.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data_admin_area.csv",
      moduleId: "m002",
    },
    {
      replacementString: "M2_adjusted_data.csv",
      sourceType: "results_object",
      resultsObjectId: "M2_adjusted_data.csv",
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
      id: "M3_service_utilization.csv",
      description:
        "Service utilization data with adjusted volumes for all adjustment scenarios",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        count_final_none: "NUMERIC",
        count_final_outliers: "NUMERIC",
        count_final_completeness: "NUMERIC",
        count_final_both: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_1.csv",
      description: "National-level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_2.csv",
      description: "Admin area 2 level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_3.csv",
      description: "Admin area 3 level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_disruptions_analysis_admin_area_4.csv",
      description: "Admin area 4 level disruption analysis results",
      createTableStatementPossibleColumns: {
        admin_area_2: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        count_sum: "NUMERIC",
        count_expect_sum: "NUMERIC",
        count_expected_if_above_diff_threshold: "NUMERIC",
      },
    },
    {
      id: "M3_chartout.csv",
      description: "Control chart analysis results with tagged anomalies",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_1.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 1)",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_2.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 2)",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_3.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 3)",
    },
    {
      id: "M3_all_indicators_shortfalls_admin_area_4.csv",
      description:
        "Shortfall and surplus calculations for all indicators (Admin area 4)",
    },
  ],
  /////////////////////////////////////////////////////////////////////////
  //  __       __              __                __                      //
  // /  \     /  |            /  |              /  |                     //
  // $$  \   /$$ |  ______   _$$ |_     ______  $$/   _______   _______  //
  // $$$  \ /$$$ | /      \ / $$   |   /      \ /  | /       | /       | //
  // $$$$  /$$$$ |/$$$$$$  |$$$$$$/   /$$$$$$  |$$ |/$$$$$$$/ /$$$$$$$/  //
  // $$ $$ $$/$$ |$$    $$ |  $$ | __ $$ |  $$/ $$ |$$ |      $$      \  //
  // $$ |$$$/ $$ |$$$$$$$$/   $$ |/  |$$ |      $$ |$$ \_____  $$$$$$  | //
  // $$ | $/  $$ |$$       |  $$  $$/ $$ |      $$ |$$       |/     $$/  //
  // $$/      $$/  $$$$$$$/    $$$$/  $$/       $$/  $$$$$$$/ $$$$$$$/   //
  //                                                                     //
  /////////////////////////////////////////////////////////////////////////
  metrics: [
    {
      id: "m3-01-01",
      resultsObjectId: "M3_service_utilization.csv",
      valueProps: [
        "count_final_none",
        "count_final_outliers",
        "count_final_completeness",
        "count_final_both",
      ],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_final_none: "Number of services reported",
        count_final_outliers: "Number of services after outlier adjustment",
        count_final_completeness:
          "Number of services after completeness adjustment",
        count_final_both:
          "Number of services after both outlier and completeness adjustment",
      },
      label: "Number of services reported, by adjustment type",
      requiredDisaggregationOptions: ["indicator_common_id"],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-02-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_1.csv",
      label: "Actual vs expected service volume",
      variantLabel: "National",
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: ["indicator_common_id"],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-02-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_1.csv",
      label: "Difference between actual and expected service volume",
      variantLabel: "National",
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: ["indicator_common_id"],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-03-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_2.csv",
      label: "Actual vs expected service volume",
      variantLabel: "Admin area 2",
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
      ],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-03-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_2.csv",
      label: "Difference between actual and expected service volume",
      variantLabel: "Admin area 2",
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_2",
      ],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-04-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_3.csv",
      label: "Actual vs expected service volume",
      variantLabel: "Admin area 3",
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
      ],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-04-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_3.csv",
      label: "Difference between actual and expected service volume",
      variantLabel: "Admin area 3",
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_3",
      ],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-05-01",
      resultsObjectId: "M3_disruptions_analysis_admin_area_4.csv",
      label: "Actual vs expected service volume",
      variantLabel: "Admin area 4",
      valueProps: ["count_sum", "count_expected_if_above_diff_threshold"],
      valueFunc: "SUM",
      valueLabelReplacements: {
        count_sum: "Actual service volume",
        count_expected_if_above_diff_threshold: "Expected service volume",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_4",
      ],
      formatAs: "number",
      periodOptions: ["period_id", "quarter_id", "year"],
    },
    {
      id: "m3-05-02",
      resultsObjectId: "M3_disruptions_analysis_admin_area_4.csv",
      label: "Difference between actual and expected service volume",
      variantLabel: "Admin area 4",
      valueProps: ["pct_diff"],
      valueFunc: "identity",
      valueLabelReplacements: {
        pct_diff: "Percent difference",
      },
      postAggregationExpression: {
        ingredientValues: [
          { prop: "count_sum", func: "SUM" },
          { prop: "count_expect_sum", func: "SUM" },
        ],
        expression:
          "pct_diff = (count_sum - count_expect_sum)/count_expect_sum",
      },
      requiredDisaggregationOptions: [
        "indicator_common_id",
        "admin_area_4",
      ],
      formatAs: "percent",
      periodOptions: ["period_id", "quarter_id", "year"],
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
        description: "Count variable to use for modeling",
        replacementString: "SELECTEDCOUNT",
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
        description: "Count variable to use for visualization",
        replacementString: "VISUALIZATIONCOUNT",
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
        description: "Run district-level model (admin_area_3)",
        replacementString: "RUN_DISTRICT_MODEL",
        input: {
          inputType: "select",
          options: [
            { value: `TRUE`, label: "Yes" },
            { value: `FALSE`, label: "No" },
          ],
          valueType: "number",
          defaultValue: "FALSE",
        },
      },
      {
        description: "Run admin_area_4 analysis",
        replacementString: "RUN_ADMIN_AREA_4_ANALYSIS",
        input: {
          inputType: "select",
          options: [
            { value: `TRUE`, label: "Yes" },
            { value: `FALSE`, label: "No" },
          ],
          valueType: "number",
          defaultValue: "FALSE",
        },
      },
      {
        description: "Threshold for MAD-based control limits",
        replacementString: "MADS_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "1.5",
        },
      },
      {
        description: "Smoothing window (k)",
        replacementString: "SMOOTH_K",
        input: {
          inputType: "number",
          defaultValue: "7",
        },
      },
      {
        description: "Dip threshold (proportion of expected)",
        replacementString: "DIP_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "0.9",
        },
      },
      {
        description: "Difference percent threshold for visualization",
        replacementString: "DIFFPERCENT",
        input: {
          inputType: "number",
          defaultValue: "10",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
