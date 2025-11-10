import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

export const definition = {
  label: "M1. Data quality assessment",
  prerequisites: [],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "01_module_data_quality_assessment.R",
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
      id: "M1_output_outliers.csv",
      description:
        "Detailed facility-level data with identified outliers and adjusted volumes",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        outlier_flag: "INTEGER NOT NULL",
      },
      resultsValues: [
        {
          id: "m1-01-00",
          valueProps: ["facility_id"],
          valueFunc: "COUNT",
          valueLabelReplacements: {},
          label: "Number of records",
          requiredDisaggregationOptions: [],
          formatAs: "number",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
        {
          id: "m1-01-01",
          valueProps: ["outlier_flag"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            outlier_flag: "Binary variable indicating whether this an outlier",
          },
          label: "Proportion of outliers",
          requiredDisaggregationOptions: [],
          formatAs: "percent",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
      ],
    },
    {
      id: "M1_output_completeness.csv",
      description:
        "Facility-level completeness data in a detailed long format, including reported and expected months",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        completeness_flag: "INTEGER NOT NULL",
      },
      resultsValues: [
        {
          id: "m1-02-02",
          valueProps: ["completeness_flag"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            completeness_flag:
              "Binary variable indicating whether the facility meets criteria",
          },
          label: "Proportion of completed records",
          requiredDisaggregationOptions: [],
          formatAs: "percent",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
      ],
    },
    {
      id: "M1_output_consistency_geo.csv",
      description: "District-level consistency results",
      createTableStatementPossibleColumns: {
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        ratio_type: "TEXT NOT NULL",
        sconsistency: "INTEGER",
      },
      resultsValues: [
        {
          id: "m1-03-01",
          valueProps: ["sconsistency"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            ratio_type: "Type of ratio being assessed",
            pair_anc: "ANC1 is larger than ANC4",
            pair_delivery: "Delivery is approximately equal to BCG",
            pair_pnc: "Delivery is larger than PNC1",
            pair_penta: "Penta 1 is larger than Penta 3",
          },
          label:
            "Proportion of sub-national areas meeting consistency criteria",
          requiredDisaggregationOptions: ["ratio_type"],
          formatAs: "percent",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
      ],
    },
    {
      id: "M1_output_dqa.csv",
      description: "Facility-level results from DQA analysis",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        quarter_id: "INTEGER NOT NULL",
        year: "INTEGER NOT NULL",
        dqa_mean: "NUMERIC NOT NULL",
        dqa_score: "NUMERIC NOT NULL",
      },
      resultsValues: [
        {
          id: "m1-04-01",
          valueProps: ["dqa_score"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            dqa_score: "Binary variable indicating adequate data quality",
          },
          label: "Proportion of facilities with adequate data quality",
          requiredDisaggregationOptions: [],
          formatAs: "percent",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
        {
          id: "m1-04-02",
          valueProps: ["dqa_mean"],
          valueFunc: "AVG",
          valueLabelReplacements: {
            dqa_mean: "Data quality score across facilities",
          },
          label: "Average data quality score across facilities",

          requiredDisaggregationOptions: [],
          formatAs: "percent",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
      ],
    },
    {
      id: "M1_output_outlier_list.csv",
      description: "Outlier list",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        admin_area_1: "TEXT NOT NULL",
        period_id: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        count: "NUMERIC NOT NULL",
      },
      resultsValues: [
        {
          id: "m1-05-01",
          valueProps: ["count"],
          valueFunc: "SUM",
          valueLabelReplacements: {
            dqa_score: "Indicator outliers",
          },
          label: "Indicator outliers",
          requiredDisaggregationOptions: [],
          formatAs: "number",
          periodOptions: ["period_id", "quarter_id", "year"],
        },
      ],
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
        description: "Proportion threshold for outlier detection",
        replacementString: "OUTLIER_PROPORTION_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "0.8",
        },
      },
      {
        description: "Minimum count threshold for consideration",
        replacementString: "MINIMUM_COUNT_THRESHOLD",
        input: {
          inputType: "number",
          defaultValue: "100",
        },
      },
      {
        description: "Number of MADs",
        replacementString: "MADS",
        input: {
          inputType: "number",
          defaultValue: "10",
        },
      },
      {
        description: "Indicators subjected to DQA",
        replacementString: "DQA_INDICATORS",
        input: {
          inputType: "select",
          options: [
            { value: `c("anc1", "penta1", "opd")`, label: "anc1, penta1, opd" },
            { value: `c("anc1", "penta1")`, label: "anc1, penta1" },
            { value: `c("anc1", "opd")`, label: "anc1, opd" },
            { value: `c("penta1", "opd")`, label: "penta1, opd" },
            { value: `c("anc1")`, label: "anc1" },
            { value: `c("penta1")`, label: "penta1" },
            { value: `c("opd")`, label: "opd" },
          ],
          valueType: "number",
          defaultValue: `c("anc1", "penta1", "opd")`,
        },
      },
      {
        description: "Consistency pairs used",
        replacementString: "CONSISTENCY_PAIRS_USED",
        input: {
          inputType: "select",
          options: [
            {
              value: `c("penta", "anc", "delivery", "malaria")`,
              label: "penta, anc, delivery, malaria",
            },
            {
              value: `c("penta", "anc", "delivery")`,
              label: "penta, anc, delivery",
            },
            { value: `c("penta", "anc")`, label: "penta, anc" },
            { value: `c("penta", "delivery")`, label: "penta, delivery" },
            { value: `c("anc", "delivery")`, label: "anc, delivery" },
            { value: `c("anc")`, label: "anc" },
            { value: `c("delivery")`, label: "delivery" },
            { value: `c("penta")`, label: "penta" },
            { value: `c("malaria")`, label: "malaria" },
          ],
          valueType: "number",
          defaultValue: `c("penta", "anc", "delivery")`,
        },
      },
      {
        description:
          "Admin level used to join facilities to corresponding geo-consistency",
        replacementString: "GEOLEVEL",
        input: {
          inputType: "select",
          options: [
            { value: `admin_area_2`, label: "admin_area_2" },
            { value: `admin_area_3`, label: "admin_area_3" },
            { value: `admin_area_4`, label: "admin_area_4" },
          ],
          valueType: "string",
          defaultValue: "admin_area_3",
        },
      },
    ],
  },
} satisfies ModuleDefinitionJSON;
