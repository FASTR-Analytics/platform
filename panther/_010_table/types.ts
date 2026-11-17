// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  JsonArray,
  LegendInput,
  Measured,
  MeasuredSurrounds,
  MeasuredText,
  MemberSortConfig,
  MergedTableStyle,
  Primitive,
  RectCoordsDims,
  TableCellInfo,
  TableCellStyle,
  TableHeaderSampleN,
  TableHeaderStyle,
  ValueRange,
} from "./deps.ts";

export type TableInputs = FigureInputsBase & {
  figureType: "table";
  data: TableData;
  // "equal" (or omitted) divides available width evenly across columns. A
  // number is an absolute width in DU, scaled by fitScale like any other
  // authored size. "auto" measures content to size the column. Positional,
  // in final (post-sort) column order.
  columnWidths?: "equal" | (number | "auto")[];
};

export type TableData = TableDataJson | TableDataTransformed;

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
    colGroup?: MemberSortConfig;
    col?: MemberSortConfig;
    rowGroup?: MemberSortConfig;
    row?: MemberSortConfig;
  };
  // Rows with these raw header ids are excluded from the per-column live
  // min/max passed to cell style funcs (e.g. so a total/roll-up row does not
  // stretch auto color-scale domains). Header sampleN digests additionally
  // apply this on BOTH sides (perpendicular exclusion) — see TableHeaderSampleN.
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
  // An absent dimension is one column (or row) without a header.
  cols?: TableColDataDimensions;
  rows?: TableRowDataDimensions;
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
  rowGroupSampleN: (TableHeaderSampleN | undefined)[]; // by row group position
  colGroupSampleN: (TableHeaderSampleN | undefined)[]; // by col group position
};

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export function isTableDataJson(d: TableData): d is TableDataJson {
  return (d as TableDataJson).jsonArray !== undefined;
}

export function isTableDataTransformed(
  d: TableData,
): d is TableDataTransformed {
  return (d as TableDataTransformed).isTransformed === true;
}

// A table side names its dimension and, when it is grouped, its group
// dimension. A group's id and label are undefined exactly when groupDimension
// is absent, which leaves one group. A member's label is undefined when it
// shows no header (a positional row).
export type TableColDataDimensions = {
  dimension: string;
  groupDimension?: string;
  groups: ColGroup[];
};

export type TableRowDataDimensions = {
  dimension: string;
  groupDimension?: string;
  groups: RowGroup[];
};

export type ColGroup = {
  id: string | undefined;
  label: string | undefined;
  cols: ColGroupCol[];
};

export type ColGroupCol = {
  id: string;
  label: string | undefined;
  index: number;
};

export type RowGroup = {
  id: string | undefined;
  label: string | undefined;
  rows: RowGroupRow[];
};

export type RowGroupRow = {
  id: string;
  label: string | undefined;
  index: number;
};

// The groups a table lays out. An absent dimension is one group holding one member
// with no header, so its member has no id.
export type LaidOutColGroup = {
  id: string | undefined;
  label: string | undefined;
  cols: { id: string | undefined; label: string | undefined; index: number }[];
};

export type LaidOutRowGroup = {
  id: string | undefined;
  label: string | undefined;
  rows: { id: string | undefined; label: string | undefined; index: number }[];
};

export function tableColGroups(d: TableDataTransformed): LaidOutColGroup[] {
  return d.cols?.groups ?? [{
    id: undefined,
    label: undefined,
    cols: [{ id: undefined, label: undefined, index: 0 }],
  }];
}

export function tableRowGroups(d: TableDataTransformed): LaidOutRowGroup[] {
  return d.rows?.groups ?? [{
    id: undefined,
    label: undefined,
    rows: [{ id: undefined, label: undefined, index: 0 }],
  }];
}

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
  id: string | undefined;
  label: string | undefined;
  index: number;
  headerStyle: TableHeaderStyle;
};

export type TableMeasuredInfo = {
  bodyRcd: RectCoordsDims;
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
  colGroupHeaderGridLineY: number;
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
  mergedStyle: MergedTableStyle;
  columnMinMax: Map<number, ValueRange>;
  // Display data
  title?: string;
  subtitle?: string;
  footnote?: string | string[];
  legend?: LegendInput;
};
