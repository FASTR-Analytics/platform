// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  JsonArray,
  LegendItem,
  Measured,
  MeasuredSurrounds,
  MeasuredText,
  MergedTableStyle,
  RectCoordsDims,
} from "./deps.ts";

export type TableInputs = FigureInputsBase & {
  // tableType: "table"; // Keep for backward compatibility
  tableData: TableData;
};

// Backward compatibility alias

export type TableData = TableDataJson | TableDataTransformed;

///////////////
//           //
//    Csv    //
//           //
///////////////

// export type TableDataCsv = {
//   csv: Csv<string | number>;
//   csvDataConfig: TableDataConfigCsv;
// };

// export type TableDataConfigCsv = {
//   colGroups?: ColGroupAsNumbersOrStrings[];
//   rowGroups?: ColGroupAsNumbersOrStrings[];
// };

////////////////
//            //
//    Json    //
//            //
////////////////

export type TableDataJson = {
  jsonArray: JsonArray;
  jsonDataConfig: TableJsonDataConfig;
};

export type TableJsonDataConfig = {
  valueProps: string[];
  colProp?: string | "--v";
  rowProp?: string | "--v";
  colGroupProp?: string | "--v";
  rowGroupProp?: string | "--v";
  //
  sortHeaders?: boolean | string[]; // true = alphabetical, string array = custom order
  labelReplacementsBeforeSorting?: Record<string, string>;
  labelReplacementsAfterSorting?: Record<string, string>;
};

///////////////////////
//                   //
//    Transformed    //
//                   //
///////////////////////

export type TableDataTransformed = {
  isTransformed: true;
  colGroups: ColGroup[];
  rowGroups: RowGroup[];
  aoa: (string | number)[][];
};

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

// export function isTableDataCsv(d: TableData): d is TableDataCsv {
//   return (d as TableDataCsv).csv !== undefined;
// }

export function isTableDataJson(d: TableData): d is TableDataJson {
  return (d as TableDataJson).jsonArray !== undefined;
}

export function isTableDataTransformed(
  d: TableData,
): d is TableDataTransformed {
  return (d as TableDataTransformed).isTransformed === true;
}

export type ColGroup = {
  label: string | undefined;
  cols: ColGroupCol[];
};

export type ColGroupCol = {
  label: string | undefined;
  index: number;
};

export type RowGroup = {
  label: string | undefined;
  rows: RowGroupRow[];
};

export type RowGroupRow = {
  label: string | undefined;
  index: number;
};

export type TableHeightInfo = {
  ideal: number;
  max?: number;
  min?: number;
};

///////////////////////////////////////////////////////////////////////////////////////////////////////
//  __       __                                                                  __                   //
// /  \     /  |                                                                /  |                  //
// $$  \   /$$ |  ______    ______    _______  __    __   ______    ______    ____$$ |                //
// $$$  \ /$$$ | /      \  /      \  /       |/  |  /  | /      \  /      \  /    $$ |                //
// $$$$  /$$$$ |/$$$$$$  | $$$$$$  |/$$$$$$$/ $$ |  $$ |/$$$$$$  |/$$$$$$  |/$$$$$$$ |                //
// $$ $$ $$/$$ |$$    $$ | /    $$ |$$      \ $$ |  $$ |$$ |  $$/ $$    $$ |$$ |  $$ |                //
// $$ |$$$/ $$ |$$$$$$$$/ /$$$$$$$ | $$$$$$  |$$ \__$$ |$$ |      $$$$$$$$/  $$ \__$$ |                //
// $$ | $/  $$ |$$       |$$    $$ |/     $$/ $$    $$/ $$ |      $$       |$$    $$ |                //
// $$/      $$/  $$$$$$$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/        $$$$$$$/  $$$$$$$$/                 //
//                                                                                                     //
///////////////////////////////////////////////////////////////////////////////////////////////////////

export type RowHeaderInfo = {
  mText: MeasuredText | undefined;
  label: string | undefined;
  index: number | "group-header";
};

export type ColGroupHeaderInfo = {
  mText: MeasuredText | undefined;
  colGroupInnerWidth: number;
};

export type ColHeaderInfo = {
  mText: MeasuredText | undefined;
  index: number | undefined;
};

export type TableMeasuredInfo = {
  contentRcd: RectCoordsDims;
  rowCellPaddingT: number;
  rowCellPaddingB: number;
  maxY: number;
  finalContentH: number;
  hasColGroupHeaders: boolean;
  hasColHeaders: boolean;
  colGroupHeaderInfos: ColGroupHeaderInfo[];
  colHeaderInfos: ColHeaderInfo[];
  colGroupHeaderMaxHeight: number;
  colGroupHeadersInnerY: number;
  firstCellX: number;
  colHeaderMaxHeight: number;
  colInnerWidth: number;
  colHeadersInnerY: number;
  firstCellY: number;
  rowHeaderInfos: RowHeaderInfo[];
  hasRowHeaders: boolean;
  hasRowGroupHeaders: boolean;
  rowHeadersInnerX: number;
  cellTextHeight: number;
  colGroupHeaderAxisY: number;
  extraTopPaddingForRowsAndAllHeaders: number;
  extraBottomPaddingForRowsAndAllHeaders: number;
};

export type MeasuredTable = Measured<TableInputs> & {
  // Measured state
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  measuredInfo: TableMeasuredInfo;
  // Computed data
  transformedData: TableDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedTableStyle: MergedTableStyle;
  // Display data
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legendItemsOrLabels?: LegendItem[] | string[];
};
