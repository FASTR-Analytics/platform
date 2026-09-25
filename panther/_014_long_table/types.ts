// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FiscalYearRule,
  FullPeriodUnit,
  JsonArrayItem,
  PeriodBounds,
  PeriodType,
  PeriodUnit,
} from "./deps.ts";

export type { PeriodBounds };

export const BLANK_SENTINEL = "__BLANK";
export const DEFAULT_ROLLUP_SENTINEL = "__ALL";
export const DEFAULT_SET_DELIMITER = "|";
export const SAMPLE_N_PREFIX = "__n_";

export type LongTableColumnType = "text" | "integer" | "number";

export type LongTableColumn = { name: string; type: LongTableColumnType };

export type LongTableDimension = {
  column: string;
  kind: "category" | "set";
  delimiter?: string;
  caseInsensitive?: boolean;
  rollup?: { sentinel?: string };
};

export type LongTableGrainNames = Partial<
  Record<Exclude<PeriodType, "year-month">, string>
>;

export type LongTableTime = {
  column: string;
  grain: PeriodType;
  fiscalYear?: FiscalYearRule;
  grains?: LongTableGrainNames;
  components?: { month?: string; quarter?: string };
};

export type LongTableSchema = {
  columns: LongTableColumn[];
  values: string[];
  dimensions: LongTableDimension[];
  time?: LongTableTime;
  unitColumn?: string;
};

export type PeriodFilter =
  | { type: "range"; min: number; max: number }
  | { type: "from"; min: number }
  | { type: "last"; n: number; unit: PeriodUnit }
  | { type: "lastFull"; n: number; unit: FullPeriodUnit };

export const ALL_LONG_TABLE_AGGREGATES = [
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "identity",
] as const;
export type LongTableAggregate = (typeof ALL_LONG_TABLE_AGGREGATES)[number];

export type LongTableValue = {
  column: string;
  func: LongTableAggregate;
  as?: string;
};

export type LongTableFilter = { dim: string; values: (string | number)[] };

export type LongTableExpression = { name: string; expr: string };

export type LongTableQuery = {
  values: LongTableValue[];
  groupBy: string[];
  filters: LongTableFilter[];
  periodFilter?: PeriodFilter;
  expressions?: LongTableExpression[];
  rollup?: { dim: string };
  sampleN?: boolean;
};

export type LongTableRow = JsonArrayItem;

export type DerivedDimension =
  & { name: string }
  & (
    | { kind: "grain"; grain: Exclude<PeriodType, "year-month"> }
    | { kind: "component"; component: "month" | "quarter" }
  );

export type DescribedColumn = {
  name: string;
  type: LongTableColumnType | "boolean" | "date" | "timestamp" | "unsupported";
  rawType: string;
  sample?: (string | number)[];
};

export type InferConventions = {
  unitColumn?: string;
  timeColumns?: Record<string, PeriodType>;
};

export type ItemsResult =
  | { status: "ok"; items: LongTableRow[]; periodBounds?: PeriodBounds }
  | { status: "too_many_items"; periodBounds?: PeriodBounds }
  | { status: "no_data" };

export type DimensionValuesResult =
  | { status: "ok"; values: (string | number)[] }
  | { status: "too_many_values" }
  | { status: "no_values" };

// What a name in `groupBy` or a filter resolves to. The time column and the
// derived dimensions are integer categories that never fold.
export type ResolvedDimension =
  | {
    kind: "dimension";
    dimension: LongTableDimension;
    type: LongTableColumnType;
  }
  | { kind: "time"; column: string; grain: PeriodType }
  | { kind: "derived"; derived: DerivedDimension };

// Thrown by every validator here and by the engine's reads before SQL is
// built: the message names the offending field, so a caller can hand it back
// to whoever wrote the query.
export class LongTableValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LongTableValidationError";
  }
}
