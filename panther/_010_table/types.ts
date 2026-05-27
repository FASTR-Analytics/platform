// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  HeaderSortConfig,
  JsonArray,
  LegendInput,
  LegendItem,
  Measured,
  MeasuredSurrounds,
  MeasuredText,
  MergedTableStyle,
  Primitive,
  RectCoordsDims,
  TableCellInfo,
  TableCellStyle,
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
  labelReplacements?: Record<string, string>;
  sort?: {
    colGroup?: HeaderSortConfig;
    col?: HeaderSortConfig;
    rowGroup?: HeaderSortConfig;
    row?: HeaderSortConfig;
  };
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
  id: string | undefined;
  label: string | undefined;
  cols: ColGroupCol[];
};

export type ColGroupCol = {
  id: string | undefined;
  label: string | undefined;
  index: number;
};

export type RowGroup = {
  id: string | undefined;
  label: string | undefined;
  rows: RowGroupRow[];
};

export type RowGroupRow = {
  id: string | undefined;
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
  id: string | undefined;
  label: string | undefined;
  index: number | "group-header";
};

export type MeasuredCellInfo = {
  mText: MeasuredText;
  cellStyle: TableCellStyle;
  cellInfo: TableCellInfo;
};

export type MeasuredRowInfo = {
  rowHeaderInfo: RowHeaderInfo;
  cells: MeasuredCellInfo[];
  rowContentHeight: number;
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
  firstCellYUnadjusted: number;
  measuredRows: MeasuredRowInfo[];
  hasRowHeaders: boolean;
  hasRowGroupHeaders: boolean;
  rowHeadersInnerX: number;
  colGroupHeaderAxisY: number;
  extraTopPaddingForRowsAndAllHeaders: number;
  extraBottomPaddingForRowsAndAllHeaders: number;
};

export type MeasuredTable = Measured<TableInputs> & {
  // Measured state
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  measuredInfo: TableMeasuredInfo;
  primitives: Primitive[];
  // Computed data
  transformedData: TableDataTransformed;
  customFigureStyle: CustomFigureStyle;
  mergedTableStyle: MergedTableStyle;
  columnMinMax: Map<number, { min: number; max: number }>;
  // Display data
  caption?: string;
  subCaption?: string;
  footnote?: string | string[];
  legend?: LegendInput;
};
