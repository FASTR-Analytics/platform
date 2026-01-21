import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";

export const definition = {
  label: "M2. Data quality adjustments",
  prerequisites: ["m001"],
  scriptSource: {
    type: "github",
    owner: "FASTR-Analytics",
    repo: "modules",
    path: "02_module_data_quality_adjustments.R",
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
      replacementString: "M1_output_completeness.csv",
      sourceType: "results_object",
      resultsObjectId: "M1_output_completeness.csv",
      moduleId: "m001",
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
      id: "M2_adjusted_data.csv",
      description:
        "Dataset including facility-level adjusted volumes for all adjustment scenarios",
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
      id: "M2_adjusted_data_admin_area.csv",
      description:
        "Dataset including admin-level adjusted volumes for all adjustment scenarios",
    },
    {
      id: "M2_adjusted_data_national.csv",
      description:
        "Dataset including national-level adjusted volumes for all adjustment scenarios",
    },
    {
      id: "M2_low_volume_exclusions.csv",
      description:
        "Tracks indicators potentially excluded from adjustment due to low volume",
      createTableStatementPossibleColumns: {
        indicator_common_id: "TEXT NOT NULL",
        low_volume_exclude: "TEXT NOT NULL",
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
  metrics: [{
    id: "m2-01-01",
    resultsObjectId: "M2_adjusted_data.csv",
    label: "Percent change in volume due to outlier adjustment",
    valueProps: ["pct_change"],
    valueFunc: "identity",
    valueLabelReplacements: {
      pct_change: "Percent change",
    },
    postAggregationExpression: {
      ingredientValues: [
        { prop: "count_final_none", func: "SUM" },
        { prop: "count_final_outliers", func: "SUM" },
      ],
      expression:
        "pct_change = ABS(count_final_none-count_final_outliers)/count_final_none",
    },
    requiredDisaggregationOptions: [],
    formatAs: "percent",
    periodOptions: ["period_id", "quarter_id", "year"],
  }, {
    id: "m2-01-02",
    resultsObjectId: "M2_adjusted_data.csv",
    label: "Percent change in volume due to completeness adjustment",
    valueProps: ["pct_change"],
    valueFunc: "identity",
    valueLabelReplacements: {
      pct_change: "Percent change",
    },
    postAggregationExpression: {
      ingredientValues: [
        { prop: "count_final_none", func: "SUM" },
        { prop: "count_final_completeness", func: "SUM" },
      ],
      expression:
        "pct_change = ABS(count_final_none-count_final_completeness)/count_final_none",
    },
    requiredDisaggregationOptions: [],
    formatAs: "percent",
    periodOptions: ["period_id", "quarter_id", "year"],
  }, {
    id: "m2-01-03",
    resultsObjectId: "M2_adjusted_data.csv",
    label:
      "Percent change in volume due to both outlier and completeness adjustment",
    valueProps: ["pct_change"],
    valueFunc: "identity",
    valueLabelReplacements: {
      pct_change: "Percent change",
    },
    postAggregationExpression: {
      ingredientValues: [
        { prop: "count_final_none", func: "SUM" },
        { prop: "count_final_both", func: "SUM" },
      ],
      expression:
        "pct_change = ABS(count_final_none-count_final_both)/count_final_none",
    },
    requiredDisaggregationOptions: [],
    formatAs: "percent",
    periodOptions: ["period_id", "quarter_id", "year"],
  }],
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
    configType: "none",
  },
} satisfies ModuleDefinitionJSON;
