import type { ModuleDefinitionJSON } from "lib";
import { presentationObjects } from "./presentation_objects.ts";
import { convertToHfaIndicators, indicators } from "./hfa_indicators.ts";

export const definition = {
  label: "HFA001. Health facility assessment",
  prerequisites: [],
  scriptSource: { type: "local", filename: "./script.R" },
  defaultPresentationObjects: presentationObjects,
  assetsToImport: [],
  dataSources: [
    {
      sourceType: "dataset",
      replacementString: "PROJECT_DATA_HFA",
      datasetType: "hfa",
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
      id: "HFA001_results.csv",
      description: "HFA results table",
      createTableStatementPossibleColumns: {
        facility_id: "TEXT NOT NULL",
        admin_area_4: "TEXT NOT NULL",
        admin_area_3: "TEXT NOT NULL",
        admin_area_2: "TEXT NOT NULL",
        admin_area_1: "TEXT NOT NULL",
        hfa_indicator: "TEXT NOT NULL",
        hfa_category: "TEXT NOT NULL",
        time_point: "INTEGER NOT NULL",
        facility_ownership: "TEXT NOT NULL",
        facility_type: "TEXT NOT NULL",
        facility_custom_1: "TEXT NOT NULL",
        facility_custom_2: "TEXT NOT NULL",
        facility_custom_3: "TEXT NOT NULL",
        facility_custom_4: "TEXT NOT NULL",
        facility_custom_5: "TEXT NOT NULL",
        value: "NUMERIC",
      },
      resultsValues: [
        {
          id: "hfa001-percentage",
          valueProps: ["value"],
          valueFunc: "AVG",
          valueLabelReplacements: {},
          label: "HFA indicators (percentage/proportion) - use for binary indicators",
          requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
          formatAs: "percent",
          periodOptions: [],
        },
        {
          id: "hfa001-average",
          valueProps: ["value"],
          valueFunc: "AVG",
          valueLabelReplacements: {},
          label: "HFA indicators (mean/average value) - use for averaging numeric indicators",
          requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
          formatAs: "number",
          periodOptions: [],
        },
        {
          id: "hfa001-total",
          valueProps: ["value"],
          valueFunc: "SUM",
          valueLabelReplacements: {},
          label: "HFA indicators (total/sum) - use for summing numeric values",
          requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
          formatAs: "number",
          periodOptions: [],
        },
        {
          id: "hfa001-count",
          valueProps: ["value"],
          valueFunc: "COUNT",
          valueLabelReplacements: {},
          label: "HFA indicators (record count) - useful for data quality checks",
          requiredDisaggregationOptions: ["hfa_indicator", "time_point"],
          formatAs: "number",
          periodOptions: [],
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
    configType: "hfa",
    indicators: convertToHfaIndicators(indicators),
  },
} satisfies ModuleDefinitionJSON;
