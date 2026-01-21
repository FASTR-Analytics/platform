import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

const _VALUE_LABELS = {
  best: "Best",
  survey: "Survey",
  danc1_birth:
    "Estimated number of total births (live + stillbirths) derived from HMIS data on ANC 1st visits.",
  danc1_delivery:
    "Estimated number of deliveries derived from HMIS data on ANC 1st visits.",
  danc1_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on ANC 1st visits.",
  danc1_livebirth:
    "Estimated number of live births derived from HMIS data on ANC 1st visits.",
  danc1_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on ANC 1st visits.",
  danc1_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on ANC 1st visits.",
  danc1_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on ANC 1st visits.",
  dbcg_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on BCG doses.",
  dbcg_livebirth:
    "Estimated number of live births derived from HMIS data on BCG doses.",
  dbcg_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on BCG doses.",
  ddelivery_birth:
    "Estimated number of total births (live + stillbirths) derived from HMIS data on institutional deliveries.",
  ddelivery_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on institutional deliveries.",
  ddelivery_livebirth:
    "Estimated number of live births derived from HMIS data on institutional deliveries.",
  ddelivery_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on institutional deliveries.",
  ddelivery_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on institutional deliveries.",
  ddelivery_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on institutional deliveries.",
  dlivebirths_birth:
    "Estimated number of total births (live + stillbirths) derived from HMIS data on live births.",
  dlivebirths_delivery:
    "Estimated number of deliveries derived from HMIS data on live births.",
  dlivebirths_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on live births.",
  dlivebirths_livebirth:
    "Estimated number of live births derived from HMIS data on live births.",
  dlivebirths_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on live births.",
  dlivebirths_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on live births.",
  dlivebirths_pregnancy:
    "Estimated number of pregnancies derived from HMIS data on live births.",
  dpenta1_dpt:
    "Estimated number of infants eligible for DPT1 derived from HMIS data on Penta-1 doses.",
  dpenta1_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) derived from HMIS data on Penta-1 doses.",
  dpenta1_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) derived from HMIS data on Penta-1 doses.",
  dwpp_dpt:
    "Estimated number of infants eligible for DPT1 based on UN WPP estimates.",
  dwpp_livebirth: "Estimated number of live births based on UN WPP estimates.",
  dwpp_measles1:
    "Estimated number of children eligible for measles dose 1 (MCV1) based on UN WPP estimates.",
  dwpp_measles2:
    "Estimated number of children eligible for measles dose 2 (MCV2) based on UN WPP estimates.",
  dwpp_pregnancy: "Estimated number of pregnancies based on UN WPP estimates.",

  source_anc1: "HMIS data on ANC 1st visits",
  source_delivery: "HMIS data on institutional deliveries",
  source_bcg: "HMIS data on BCG doses",
  source_penta1: "HMIS data on Penta-1 doses",
  source_wpp: "UN WPP estimates",
  source_livebirths: "HMIS data on live births",
  target_pregnancy: "Pregnancies",
  target_delivery: "Deliveries",
  target_birth: "Total births (live + stillbirths)",
  target_livebirth: "Live births",
  target_dpt: "Infants eligible for DPT1",
  target_measles1: "Children eligible for measles dose 1 (MCV1)",
  target_measles2: "Children eligible for measles dose 2 (MCV2)",
  target_vitaminA:
    "Children aged 6-59 months eligible for Vitamin A supplementation",
  target_fully_immunized:
    "Children under 1 year eligible for full immunization",
};

export const definition = {
  label: "M5. Coverage estimates ~ new, part 1",
  prerequisites: ["m002"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "05_module_coverage_estimates_part1.R",
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
      id: "M5_denominators_national.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        denominator: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
        source_indicator: "TEXT",
        target_population: "TEXT",
      },
    },
    {
      id: "M5_denominators_admin2.csv",
      description: "Selected denominators (Admin area 2)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        denominator: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
        source_indicator: "TEXT",
        target_population: "TEXT",
      },
    },
    {
      id: "M5_denominators_admin3.csv",
      description: "Selected denominators (Admin area 3)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        denominator: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
        source_indicator: "TEXT",
        target_population: "TEXT",
      },
    },
    {
      id: "M5_combined_results_national.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator_best_or_survey: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M5_combined_results_admin2.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator_best_or_survey: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M5_combined_results_admin3.csv",
      description: "Selected denominators (National)",
      createTableStatementPossibleColumns: {
        admin_area_1: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        year: "INTEGER NOT NULL",
        indicator_common_id: "TEXT NOT NULL",
        denominator_best_or_survey: "TEXT NOT NULL",
        value: "NUMERIC NOT NULL",
      },
    },
    {
      id: "M5_selected_denominator_per_indicator.csv",
      description: "Selected denominators",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        denominator_national: "TEXT NOT NULL",
        denominator_admin2: "TEXT NOT NULL",
        denominator_admin3: "TEXT NOT NULL",
      },
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
      id: "m4a-01-01",
      resultsObjectId: "M5_denominators_national.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Denominator values",
      variantLabel: "National",
      requiredDisaggregationOptions: ["denominator", "year"],
      formatAs: "number",
      periodOptions: ["year"],
    },
    {
      id: "m4a-01-02",
      resultsObjectId: "M5_denominators_admin2.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Denominator values",
      variantLabel: "Admin area 2",
      requiredDisaggregationOptions: [
        "denominator",
        "admin_area_2",
        "year",
      ],
      formatAs: "number",
      periodOptions: ["year"],
    },
    {
      id: "m4a-01-03",
      resultsObjectId: "M5_denominators_admin3.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Denominator values",
      variantLabel: "Admin area 3",
      requiredDisaggregationOptions: [
        "denominator",
        "admin_area_3",
        "year",
      ],
      formatAs: "number",
      periodOptions: ["year"],
    },
    {
      id: "m4a-02-01",
      resultsObjectId: "M5_combined_results_national.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Coverage estimated with different denominators",
      variantLabel: "National",
      requiredDisaggregationOptions: [
        "denominator_best_or_survey",
        "indicator_common_id",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
    },
    {
      id: "m4a-02-02",
      resultsObjectId: "M5_combined_results_admin2.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Coverage estimated with different denominators",
      variantLabel: "Admin area 2",
      requiredDisaggregationOptions: [
        "denominator_best_or_survey",
        "admin_area_2",
        "indicator_common_id",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
    },
    {
      id: "m4a-02-03",
      resultsObjectId: "M5_combined_results_admin3.csv",
      valueProps: ["value"],
      valueFunc: "AVG",
      valueLabelReplacements: _VALUE_LABELS,
      label: "Coverage estimated with different denominators",
      variantLabel: "Admin area 3",
      requiredDisaggregationOptions: [
        "denominator_best_or_survey",
        "admin_area_3",
        "indicator_common_id",
        "year",
      ],
      formatAs: "percent",
      periodOptions: ["year"],
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
