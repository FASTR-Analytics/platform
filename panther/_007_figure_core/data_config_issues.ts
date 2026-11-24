// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  _GLOBAL_MAX_YEAR_FOR_PERIODS,
  _GLOBAL_MIN_YEAR_FOR_PERIODS,
  getPeriodTypeFromValue,
  getValidNumberOrUndefined,
  isBlankValue,
  type PeriodType,
} from "./deps.ts";
import {
  type ChartOVOrOHProportional,
  getDimensionId,
} from "./common_data_transform.ts";
import {
  isRowBasedUncertainty,
  type JsonArray,
  type JsonArrayItem,
  type UncertaintyConfig,
} from "./types.ts";

export type DataConfigIssueCode =
  | "no-rows"
  | "no-value-props"
  | "column-not-in-rows"
  | "column-named-twice"
  | "value-props-not-split"
  | "bound-props-length"
  | "member-not-in-rows"
  | "not-a-number"
  | "negative-value"
  | "not-a-period"
  | "every-row-blank"
  | "two-rows-one-value"
  | "proportional-conflict";

export type DataConfigIssue = {
  code: DataConfigIssueCode;
  // The field in the data config, as a zod issue's path; [] for the rows or
  // the config as a whole.
  path: (string | number)[];
  message: string;
};

export class DataConfigError extends Error {
  readonly issues: DataConfigIssue[];

  constructor(issues: DataConfigIssue[]) {
    super(issues.map((issue) => issue.message).join("\n"));
    this.name = "DataConfigError";
    this.issues = issues;
  }
}

export function assertNoDataConfigIssues(issues: DataConfigIssue[]): void {
  if (issues.length > 0) {
    throw new DataConfigError(issues);
  }
}

// A field of a data config and the column it names, or "--v" for a dimension
// prop that splits by the value props.
export type DataConfigField = {
  path: (string | number)[];
  column: string;
};

export type IndexedRow = { index: number; row: JsonArrayItem };

export function indexRows(jsonArray: JsonArray): IndexedRow[] {
  return jsonArray.map((row, index) => ({ index, row }));
}

export function getRowColumns(rows: JsonArrayItem[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      columns.add(key);
    }
  }
  return [...columns];
}

export function getDimensionFields(
  dimensionProps: Record<string, string | undefined>,
): DataConfigField[] {
  return Object.entries(dimensionProps).flatMap(([key, column]) =>
    column === undefined ? [] : [{ path: [key], column }]
  );
}

export function getValuePropFields(valueProps: string[]): DataConfigField[] {
  return valueProps.map((column, i) => ({ path: ["valueProps", i], column }));
}

// The fields whose cells a rule reads: one field for each column some row
// holds, so a column two fields name is read once.
export function getReadFields(
  fields: DataConfigField[],
  held: Set<string>,
): DataConfigField[] {
  const read = new Set<string>();
  return fields.filter((field) => {
    if (!held.has(field.column) || read.has(field.column)) {
      return false;
    }
    read.add(field.column);
    return true;
  });
}

export function getColumnDimensionFields(
  dimensionFields: DataConfigField[],
): DataConfigField[] {
  return dimensionFields.filter((field) => field.column !== "--v");
}

///////////////////////////////////////////////////////////////////////////////
// The rules every figure's check composes
///////////////////////////////////////////////////////////////////////////////

// With a split field, the rows are refused only because the split has no
// member: a map draws its areas from its geography with no rows.
export function getNoRowsIssues(
  jsonArray: JsonArray,
  splitField?: DataConfigField,
): DataConfigIssue[] {
  if (jsonArray.length > 0) {
    return [];
  }
  return [{
    code: "no-rows",
    path: [],
    message: splitField === undefined
      ? "There are no rows to draw."
      : `There are no rows, so ${
        formatPath(splitField.path)
      } has no member to lay out.`,
  }];
}

export function getNoValuePropsIssues(valueProps: string[]): DataConfigIssue[] {
  return valueProps.length === 0
    ? [{
      code: "no-value-props",
      path: ["valueProps"],
      message:
        "valueProps names no column, and a figure draws at least one value column.",
    }]
    : [];
}

// A field that names a column no row holds is a misspelling, never a column
// of blanks.
export function getColumnNotInRowsIssues(
  fields: DataConfigField[],
  columns: string[],
): DataConfigIssue[] {
  const held = new Set(columns);
  const heldText = columns.length === 0
    ? "The rows hold no column."
    : `The rows hold ${listWithAnd(columns.map(quote))}.`;
  return fields.filter((field) => !held.has(field.column)).map((field) => ({
    code: "column-not-in-rows",
    path: field.path,
    message: `${formatPath(field.path)} names column ${
      quote(field.column)
    }, which no row holds. ${heldText}`,
  }));
}

// Each dimension is named from its prop, so two props never name one column,
// and one prop at most splits by the value props.
export function getDimensionNamedTwiceIssues(
  dimensionFields: DataConfigField[],
): DataConfigIssue[] {
  const issues: DataConfigIssue[] = [];
  const firstByColumn = new Map<string, DataConfigField>();
  for (const field of dimensionFields) {
    const first = firstByColumn.get(field.column);
    if (first === undefined) {
      firstByColumn.set(field.column, field);
      continue;
    }
    const later = formatPath(field.path);
    const earlier = formatPath(first.path);
    issues.push({
      code: "column-named-twice",
      path: field.path,
      message: field.column === "--v"
        ? `${later} is "--v", as ${earlier} is, and one prop splits by valueProps.`
        : `${later} names column ${
          quote(field.column)
        }, which ${earlier} names too.`,
    });
  }
  return issues;
}

export function getValuePropNamedTwiceIssues(
  valueProps: string[],
): DataConfigIssue[] {
  return valueProps.flatMap((column, i) => {
    const first = valueProps.indexOf(column);
    return first === i ? [] : [{
      code: "column-named-twice" as const,
      path: ["valueProps", i],
      message: `valueProps[${i}] names column ${
        quote(column)
      }, which valueProps[${first}] names too.`,
    }];
  });
}

export function getValuePropsNotSplitIssues(
  valueProps: string[],
  dimensionProps: Record<string, string | undefined>,
): DataConfigIssue[] {
  const splits = Object.values(dimensionProps).some((prop) => prop === "--v");
  return splits || valueProps.length < 2 ? [] : [{
    code: "value-props-not-split",
    path: ["valueProps"],
    message: `valueProps names ${valueProps.length} columns, so one of ${
      listWithOr(Object.keys(dimensionProps))
    } must be "--v" to split them.`,
  }];
}

export function isNumberCell(value: unknown): boolean {
  return isBlankValue(value) || getValidNumberOrUndefined(value) !== undefined;
}

export function getNotANumberIssues(
  rows: IndexedRow[],
  field: DataConfigField,
): DataConfigIssue[] {
  const cells = getCells(rows, field.column).filter((cell) =>
    !isNumberCell(cell.value)
  );
  return cells.length === 0 ? [] : [{
    code: "not-a-number",
    path: field.path,
    message: `${formatPath(field.path)} names column ${
      quote(field.column)
    }, and ${countCells(cells.length, "is not a number", "are not numbers")}: ${
      describeCells(cells)
    }.`,
  }];
}

export function getNegativeValueIssues(
  rows: IndexedRow[],
  field: DataConfigField,
): DataConfigIssue[] {
  const cells = getCells(rows, field.column).filter((cell) =>
    (getValidNumberOrUndefined(cell.value) ?? 0) < 0
  );
  return cells.length === 0 ? [] : [{
    code: "negative-value",
    path: field.path,
    message: `${formatPath(field.path)} names column ${
      quote(field.column)
    }, and ${
      cells.length === 1
        ? "1 of its values is below zero"
        : `${cells.length} of its values are below zero`
    }, which a pie cannot draw: ${describeCells(cells)}.`,
  }];
}

const PERIOD_FORMAT: Record<PeriodType, string> = {
  "year":
    `a year from ${_GLOBAL_MIN_YEAR_FOR_PERIODS} to ${_GLOBAL_MAX_YEAR_FOR_PERIODS}, such as 2024`,
  "year-quarter": "YYYYQ, such as 20241",
  "year-month": "YYYYMM, such as 202403",
};

export function isPeriodCell(value: unknown, periodType: PeriodType): boolean {
  return (typeof value === "number" || typeof value === "string") &&
    getPeriodTypeFromValue(value) === periodType;
}

// A blank period leaves its row out, so only a cell that holds something is
// read as a period.
export function getNotAPeriodIssues(
  rows: IndexedRow[],
  field: DataConfigField,
  periodType: PeriodType,
): DataConfigIssue[] {
  const cells = getCells(rows, field.column).filter((cell) =>
    !isBlankValue(cell.value) && !isPeriodCell(cell.value, periodType)
  );
  const describe = (value: unknown) => {
    const other = typeof value === "number" || typeof value === "string"
      ? getPeriodTypeFromValue(value)
      : undefined;
    return other === undefined
      ? formatCell(value)
      : `${formatCell(value)} (a ${other} period)`;
  };
  return cells.length === 0 ? [] : [{
    code: "not-a-period",
    path: field.path,
    message: `${formatPath(field.path)} names column ${
      quote(field.column)
    }, and ${
      countCells(
        cells.length,
        `is not a ${periodType} period`,
        `are not ${periodType} periods`,
      )
    } (${PERIOD_FORMAT[periodType]}): ${describeCells(cells, describe)}.`,
  }];
}

// Under periodProp "--v", each value column's name is its period.
export function getValuePropNotAPeriodIssues(
  valueProps: string[],
  periodType: PeriodType,
): DataConfigIssue[] {
  return valueProps.flatMap((valueProp, i) =>
    isPeriodCell(valueProp, periodType) ? [] : [{
      code: "not-a-period" as const,
      path: ["valueProps", i],
      message: `valueProps[${i}] is ${
        quote(valueProp)
      }, which is not a ${periodType} period (${
        PERIOD_FORMAT[periodType]
      }), and periodProp "--v" reads each value column's name as its period.`,
    }]
  );
}

// A row whose period or map area is blank is left out; with every row left
// out there is nothing to place, or for a split map no member to lay out.
export function getEveryRowBlankIssues(
  rows: IndexedRow[],
  isLeftOut: (row: JsonArrayItem) => boolean,
  field: DataConfigField,
  what: "period" | "map area",
  splitField?: DataConfigField,
): DataConfigIssue[] {
  if (rows.length === 0 || rows.some(({ row }) => !isLeftOut(row))) {
    return [];
  }
  const consequence = splitField === undefined
    ? ""
    : `, so ${formatPath(splitField.path)} has no member to lay out`;
  return [{
    code: "every-row-blank",
    path: field.path,
    message: `${formatPath(field.path)} names column ${
      quote(field.column)
    }, which is blank in every row, and a row with a blank ${what} is left out${consequence}.`,
  }];
}

// One row per value, whatever its cells hold: a row's key is its member id
// under each key field, so two rows with one key give the same values.
export function getTwoRowsOneValueIssues(
  rows: IndexedRow[],
  keyFields: DataConfigField[],
  namedColumns: Set<string>,
  rowsLabel: string | undefined,
): DataConfigIssue[] {
  const firstByKey = new Map<string, IndexedRow>();
  let pair: [IndexedRow, IndexedRow] | undefined;
  let nRepeated = 0;
  for (const indexed of rows) {
    const key = JSON.stringify(
      keyFields.map((field) => getDimensionId(indexed.row, field.column)),
    );
    const first = firstByKey.get(key);
    if (first === undefined) {
      firstByKey.set(key, indexed);
      continue;
    }
    nRepeated++;
    pair ??= [first, indexed];
  }
  if (pair === undefined) {
    return [];
  }
  const [a, b] = pair;
  const given = keyFields.length === 0
    ? "give every value, since no prop splits the rows"
    : `both hold ${
      listWithAnd(keyFields.map((field) =>
        `${formatCell(a.row[field.column])} in ${quote(field.column)} (${
          formatPath(field.path)
        })`
      ))
    }`;
  const differing = getRowColumns([a.row, b.row]).filter((column) =>
    !namedColumns.has(column) && !isSameCell(a.row[column], b.row[column])
  );
  const differ = differing.length === 0
    ? "and hold the same cells in every other column"
    : `and differ in ${differing.length === 1 ? "column" : "columns"} ${
      listWithAnd(differing.map(quote))
    }, which no field names`;
  const counted = rowsLabel === undefined
    ? nRepeated === 1
      ? "Two rows give one value."
      : `${nRepeated} rows give a value an earlier row gives.`
    : nRepeated === 1
    ? `Two of the ${rowsLabel} give one value.`
    : `${nRepeated} of the ${rowsLabel} give a value an earlier one gives.`;
  return [{
    code: "two-rows-one-value",
    path: [],
    message: `${counted} Rows ${a.index} and ${b.index} ${given}, ${differ}.`,
  }];
}

export function getProportionalConflictIssues(
  proportional: ChartOVOrOHProportional | undefined,
  tierOrLaneKey: "tiers" | "lanes",
): DataConfigIssue[] {
  return proportional?.panes === true && proportional[tierOrLaneKey] === false
    ? [{
      code: "proportional-conflict",
      path: ["proportional", "panes"],
      message:
        `proportional.panes is true, which needs proportional.${tierOrLaneKey}, and proportional.${tierOrLaneKey} is false.`,
    }]
    : [];
}

///////////////////////////////////////////////////////////////////////////////
// Uncertainty
///////////////////////////////////////////////////////////////////////////////

type UncertaintyMemberKey = "peMemberId" | "ubMemberId" | "lbMemberId";

const UNCERTAINTY_MEMBER_KEYS: UncertaintyMemberKey[] = [
  "peMemberId",
  "ubMemberId",
  "lbMemberId",
];

type RowBasedUncertainty = Extract<
  UncertaintyConfig,
  { uncertaintyProp: string }
>;

export function getUncertaintyMemberId(
  row: JsonArrayItem,
  uncertaintyProp: string,
): string {
  return String(row[uncertaintyProp]);
}

export function getUncertaintyColumnFields(
  uncertainty: UncertaintyConfig | undefined,
): DataConfigField[] {
  if (uncertainty === undefined) {
    return [];
  }
  if (isRowBasedUncertainty(uncertainty)) {
    return [{
      path: ["uncertainty", "uncertaintyProp"],
      column: uncertainty.uncertaintyProp,
    }];
  }
  return getBoundFields(uncertainty);
}

function getBoundFields(
  uncertainty: { ubValueProps: string[]; lbValueProps: string[] },
): DataConfigField[] {
  return (["ubValueProps", "lbValueProps"] as const).flatMap((key) =>
    uncertainty[key].map((column, i) => ({
      path: ["uncertainty", key, i],
      column,
    }))
  );
}

// What an uncertainty config gets wrong without its rows: a bound list that
// does not pair with valueProps, and an uncertaintyProp that is a dimension.
export function getUncertaintyConfigIssues(
  uncertainty: UncertaintyConfig | undefined,
  valueProps: string[],
  dimensionFields: DataConfigField[],
): DataConfigIssue[] {
  if (uncertainty === undefined) {
    return [];
  }
  if (isRowBasedUncertainty(uncertainty)) {
    const dimension = dimensionFields.find((field) =>
      field.column === uncertainty.uncertaintyProp
    );
    return dimension === undefined ? [] : [{
      code: "column-named-twice",
      path: ["uncertainty", "uncertaintyProp"],
      message: `uncertainty.uncertaintyProp names column ${
        quote(uncertainty.uncertaintyProp)
      }, which ${formatPath(dimension.path)} splits by.`,
    }];
  }
  return (["ubValueProps", "lbValueProps"] as const).flatMap((key) => {
    const n = uncertainty[key].length;
    return n === valueProps.length ? [] : [{
      code: "bound-props-length" as const,
      path: ["uncertainty", key],
      message: `uncertainty.${key} names ${
        countOf(n, "column", "columns")
      } and valueProps names ${valueProps.length}, and each value column needs its bound column, in the same order.`,
    }];
  });
}

const N_MEMBERS_NAMED = 10;

export function getMemberNotInRowsIssues(
  rows: IndexedRow[],
  uncertainty: RowBasedUncertainty,
): DataConfigIssue[] {
  const prop = uncertainty.uncertaintyProp;
  const held = [
    ...new Set(
      rows.filter(({ row }) => !isBlankValue(row[prop])).map(({ row }) =>
        getUncertaintyMemberId(row, prop)
      ),
    ),
  ];
  const heldSet = new Set(held);
  const named = held.slice(0, N_MEMBERS_NAMED).map(quote);
  const nMore = held.length - named.length;
  const heldText = held.length === 0
    ? "Its cells are blank."
    : `Its cells hold ${
      nMore > 0 ? `${named.join(", ")} and ${nMore} more` : listWithAnd(named)
    }.`;
  return UNCERTAINTY_MEMBER_KEYS.filter((key) => !heldSet.has(uncertainty[key]))
    .map((key) => ({
      code: "member-not-in-rows",
      path: ["uncertainty", key],
      message: `uncertainty.${key} is ${
        quote(uncertainty[key])
      }, which no row's ${quote(prop)} cell holds. ${heldText}`,
    }));
}

function getRowsByUncertaintyMember(
  rows: IndexedRow[],
  uncertainty: UncertaintyConfig | undefined,
): { rows: IndexedRow[]; label: string | undefined }[] {
  if (uncertainty === undefined || !isRowBasedUncertainty(uncertainty)) {
    return [{ rows, label: undefined }];
  }
  const prop = uncertainty.uncertaintyProp;
  return UNCERTAINTY_MEMBER_KEYS.map((key) => ({
    rows: rows.filter(({ row }) =>
      getUncertaintyMemberId(row, prop) === uncertainty[key]
    ),
    label: `rows whose ${quote(prop)} is ${quote(uncertainty[key])}`,
  }));
}

///////////////////////////////////////////////////////////////////////////////
// The figures with value props
///////////////////////////////////////////////////////////////////////////////

// Every issue of the dimension props, the value props and the uncertainty
// that chart-ov, chart-oh, the timeseries and the pie share; the rows a
// figure leaves out (isPlaced false) give no value. The rows can be keyed
// when every dimension prop splits them by a column of its own, and with
// uncertainty in rows its member column is held and is no dimension.
export function getValuePropsDataConfigIssues(
  jsonArray: JsonArray,
  config: {
    valueProps: string[];
    dimensionProps: Record<string, string | undefined>;
    uncertainty?: UncertaintyConfig;
  },
  isPlaced: (row: JsonArrayItem) => boolean,
): DataConfigIssue[] {
  const { valueProps, dimensionProps, uncertainty } = config;
  const dimensionFields = getDimensionFields(dimensionProps);
  const dimensionNamedTwice = getDimensionNamedTwiceIssues(dimensionFields);
  const uncertaintyConfigIssues = getUncertaintyConfigIssues(
    uncertainty,
    valueProps,
    dimensionFields,
  );
  const issues = [
    ...getNoValuePropsIssues(valueProps),
    ...dimensionNamedTwice,
    ...getValuePropNamedTwiceIssues(valueProps),
    ...getValuePropsNotSplitIssues(valueProps, dimensionProps),
    ...uncertaintyConfigIssues,
  ];
  if (jsonArray.length === 0) {
    return issues;
  }
  const rows = indexRows(jsonArray);
  const columns = getRowColumns(jsonArray);
  const held = new Set(columns);
  const columnDimensionFields = getColumnDimensionFields(dimensionFields);
  const valueFields = getValuePropFields(valueProps);
  issues.push(
    ...getColumnNotInRowsIssues(
      [
        ...columnDimensionFields,
        ...valueFields,
        ...getUncertaintyColumnFields(uncertainty),
      ],
      columns,
    ),
  );
  const rowBased = uncertainty !== undefined &&
      isRowBasedUncertainty(uncertainty)
    ? uncertainty
    : undefined;
  if (rowBased !== undefined && held.has(rowBased.uncertaintyProp)) {
    issues.push(...getMemberNotInRowsIssues(rows, rowBased));
  }
  const numberFields = uncertainty !== undefined &&
      !isRowBasedUncertainty(uncertainty)
    ? [...valueFields, ...getBoundFields(uncertainty)]
    : valueFields;
  for (const field of getReadFields(numberFields, held)) {
    issues.push(...getNotANumberIssues(rows, field));
  }
  const canKeyRows =
    columnDimensionFields.every((field) => held.has(field.column)) &&
    dimensionNamedTwice.length === 0 &&
    (rowBased === undefined ||
      (held.has(rowBased.uncertaintyProp) &&
        uncertaintyConfigIssues.length === 0));
  if (canKeyRows) {
    const namedColumns = getNamedColumns(config);
    const placedRows = rows.filter(({ row }) => isPlaced(row));
    for (
      const { rows: memberRows, label } of getRowsByUncertaintyMember(
        placedRows,
        uncertainty,
      )
    ) {
      issues.push(
        ...getTwoRowsOneValueIssues(
          memberRows,
          columnDimensionFields,
          namedColumns,
          label,
        ),
      );
    }
  }
  return issues;
}

// Every column a field of the data config names, so a pair of rows is told
// apart by the columns no field names.
function getNamedColumns(
  config: {
    valueProps: string[];
    dimensionProps: Record<string, string | undefined>;
    uncertainty?: UncertaintyConfig;
  },
): Set<string> {
  return new Set([
    ...config.valueProps,
    ...getDimensionFields(config.dimensionProps).map((field) => field.column),
    ...getUncertaintyColumnFields(config.uncertainty).map((field) =>
      field.column
    ),
  ]);
}

///////////////////////////////////////////////////////////////////////////////
// Message helpers
///////////////////////////////////////////////////////////////////////////////

const N_CELLS_NAMED = 3;

type Cell = { index: number; value: unknown };

function getCells(rows: IndexedRow[], column: string): Cell[] {
  return rows.map(({ index, row }) => ({ index, value: row[column] }));
}

function formatPath(path: (string | number)[]): string {
  return path.map((part, i) =>
    typeof part === "number" ? `[${part}]` : i === 0 ? part : `.${part}`
  ).join("");
}

function quote(text: string): string {
  return JSON.stringify(text);
}

function formatCell(value: unknown): string {
  if (isBlankValue(value)) {
    return "a blank";
  }
  return typeof value === "number" ? String(value) : quote(String(value));
}

function isSameCell(a: unknown, b: unknown): boolean {
  if (isBlankValue(a) || isBlankValue(b)) {
    return isBlankValue(a) && isBlankValue(b);
  }
  return String(a) === String(b);
}

function listWithAnd(items: string[]): string {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function listWithOr(items: string[]): string {
  return items.length <= 1
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

function countOf(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function countCells(n: number, isWhat: string, areWhat: string): string {
  return n === 1 ? `1 of its cells ${isWhat}` : `${n} of its cells ${areWhat}`;
}

function describeCells(
  cells: Cell[],
  describe: (value: unknown) => string = formatCell,
): string {
  const named = cells.slice(0, N_CELLS_NAMED).map((cell) =>
    `${describe(cell.value)} in row ${cell.index}`
  );
  const nMore = cells.length - named.length;
  return nMore > 0
    ? `${named.join(", ")} and ${nMore} more`
    : listWithAnd(named);
}
