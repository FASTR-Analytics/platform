// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  HeaderSortConfig,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MeasuredText,
  MergedTableStyle,
  Primitive,
  RectCoordsDims,
  TableCellInfo,
  TableCellStyle,
  TableHeaderSampleN,
  TableHeaderStyle,
} from "./deps.ts";

export type TableInputs = FigureInputsBase & {
  figureType: "table";
  data: TableData;
  // "equal" (or omitted) divides available width evenly across columns,
  // exactly as before this field existed. A number is an absolute width in
  // DU, scaled by fitScale like any other authored size. "auto" measures
  // content to size the column. Positional, in final (post-sort) column
  // order.
  columnWidths?: "equal" | (number | "auto")[];
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
  // Rows with these raw header ids are excluded from the per-column live
  // min/max passed to cell style funcs (e.g. so a total/roll-up row does not
  // stretch auto color-scale domains). Header sampleN digests additionally
  // apply this on BOTH axes (perpendicular exclusion) — see TableHeaderSampleN.
  liveDomainExcludeIds?: string[];
  // Maps each valueProp to the prop holding its sample size (n). Explicit map,
  // no naming magic; per-value entries cover multi-value / --v tables.
  nProps?: Record<string, string>;
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
  liveDomainExcludeIds?: string[];
  // Sample sizes, same orientation and final sorted index space as aoa.
  // Optional-additive: hand-authored / pre-transformed data stays valid.
  nMatrix?: (number | undefined)[][];
};

// Output of resolveTableHeaders: labels resolved through the header
// textFormatters plus per-header sampleN digests. Render and export share this
// one computation. `data` is always a NEW object (never the caller's input —
// pre-transformed inputs are rebuilt, not passed through). sampleN arrays are
// SPARSE lookups keyed by item index / group position: index into them (an
// absent entry reads undefined); do not iterate or use .length — with no
// nMatrix they are empty.
export type ResolvedTableHeaders = {
  data: TableDataTransformed;
  rowSampleN: (TableHeaderSampleN | undefined)[]; // by row.index
  colSampleN: (TableHeaderSampleN | undefined)[]; // by col.index
  rowGroupSampleN: (TableHeaderSampleN | undefined)[]; // by rowGroups position
  colGroupSampleN: (TableHeaderSampleN | undefined)[]; // by colGroups position
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
  headerStyle: TableHeaderStyle;
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
  headerStyle: TableHeaderStyle;
};

export type ColHeaderInfo = {
  mText: MeasuredText | undefined;
  index: number;
  headerStyle: TableHeaderStyle;
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
  colInnerWidths: number[];
  colHeadersInnerY: number;
  firstCellY: number;
  measuredRows: MeasuredRowInfo[];
  hasRowHeaders: boolean;
  hasRowGroupHeaders: boolean;
  rowHeadersInnerX: number;
  colGroupHeaderAxisY: number;
  extraTopPaddingForRows: number;
  extraBottomPaddingForRows: number;
};

export type MeasuredTable = Measured<TableInputs> & {
  // Measured state
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  measuredInfo: TableMeasuredInfo;
  primitives: Primitive[];
  // Computed data. transformedData is RESOLVED: header labels have been
  // through the header textFormatters (resolveTableHeaders), so it reproduces
  // exactly what renders.
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
