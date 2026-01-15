// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv } from "./deps.ts";
import type {
  AggregateFunction,
  OrderDirection,
  OrderSpec,
  WhereFilter,
  WherePredicate,
} from "./types.ts";

type AggregateSpec = {
  col: string;
  func: AggregateFunction;
  outputCol: string;
};

type GroupKey = (string | number | boolean | null)[];

export class QueryBuilder<T> {
  private csv: Csv<T>;
  private whereFilters: Array<WhereFilter | WherePredicate<T>> = [];
  private groupByCols: string[] = [];
  private aggregateSpecs: AggregateSpec[] = [];
  private orderBySpecs: OrderSpec[] = [];

  constructor(csv: Csv<T>) {
    this.csv = csv;
  }

  where(
    filterOrPredicate: WhereFilter | WherePredicate<T>,
  ): QueryBuilder<T> {
    this.whereFilters.push(filterOrPredicate);
    return this;
  }

  // Note: groupBy always produces Csv<string> results (both keys and aggregates are stringified)
  // Without aggregates, acts like SELECT DISTINCT on the specified columns
  groupBy(cols: string[]): QueryBuilder<T> {
    if (this.groupByCols.length > 0) {
      throw new Error("groupBy() can only be called once");
    }
    if (cols.length === 0) {
      throw new Error("groupBy() requires at least one column");
    }
    this.groupByCols = cols;
    return this;
  }

  sum(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "SUM",
      outputCol: outputCol ?? `${col}_sum`,
    });
    return this;
  }

  avg(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "AVG",
      outputCol: outputCol ?? `${col}_avg`,
    });
    return this;
  }

  count(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "COUNT",
      outputCol: outputCol ?? `${col}_count`,
    });
    return this;
  }

  min(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "MIN",
      outputCol: outputCol ?? `${col}_min`,
    });
    return this;
  }

  max(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "MAX",
      outputCol: outputCol ?? `${col}_max`,
    });
    return this;
  }

  median(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "MEDIAN",
      outputCol: outputCol ?? `${col}_median`,
    });
    return this;
  }

  countDistinct(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "COUNT_DISTINCT",
      outputCol: outputCol ?? `${col}_distinct`,
    });
    return this;
  }

  first(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "FIRST",
      outputCol: outputCol ?? `${col}_first`,
    });
    return this;
  }

  last(col: string, outputCol?: string): QueryBuilder<T> {
    this.aggregateSpecs.push({
      col,
      func: "LAST",
      outputCol: outputCol ?? `${col}_last`,
    });
    return this;
  }

  orderBy(
    col: string | OrderSpec[],
    direction: OrderDirection = "asc",
  ): QueryBuilder<T> {
    if (this.orderBySpecs.length > 0) {
      throw new Error("orderBy() can only be called once");
    }
    if (Array.isArray(col)) {
      if (col.length === 0) {
        throw new Error("orderBy() requires at least one column");
      }
      this.orderBySpecs = col;
    } else {
      this.orderBySpecs = [{ col, dir: direction }];
    }
    return this;
  }

  execute(): Csv<T> {
    if (this.aggregateSpecs.length > 0 && this.groupByCols.length === 0) {
      throw new Error(
        "Aggregate functions require groupBy() to be called first",
      );
    }

    let result = this.csv;

    if (this.whereFilters.length > 0) {
      result = this.applyWhereFilters(result);
    }

    if (this.groupByCols.length > 0) {
      result = this.applyGroupBy(result);
    }

    if (this.orderBySpecs.length > 0) {
      result = this.applyOrderBy(result);
    }

    return result;
  }

  private applyWhereFilters(csv: Csv<T>): Csv<T> {
    const colHeaders = csv.colHeaders;

    return csv.selectRows((row, i) => {
      for (const filter of this.whereFilters) {
        if (typeof filter === "function") {
          if (!filter(row, i)) {
            return false;
          }
        } else {
          for (const [colName, allowedValues] of Object.entries(filter)) {
            const colIndex = colHeaders.indexOf(colName);
            if (colIndex === -1) {
              throw new Error(`Column not found: ${colName}`);
            }

            const cellValue = row[colIndex];
            const stringValue = String(cellValue);
            const numberValue = Number(cellValue);

            const matchesAny = allowedValues.some((allowed) => {
              if (typeof allowed === "number") {
                return numberValue === allowed;
              }
              return stringValue === String(allowed);
            });

            if (!matchesAny) {
              return false;
            }
          }
        }
      }
      return true;
    });
  }

  private applyGroupBy(csv: Csv<T>): Csv<T> {
    const colHeaders = csv.colHeaders;

    const groupByIndexes = this.groupByCols.map((col) => {
      const idx = colHeaders.indexOf(col);
      if (idx === -1) {
        throw new Error(`Group by column not found: ${col}`);
      }
      return idx;
    });

    const groups = new Map<string, { keyValues: GroupKey; rows: T[][] }>();

    for (let i = 0; i < csv.nRows; i++) {
      const row = csv.aoa[i];
      const keyValues: GroupKey = groupByIndexes.map((idx) => {
        const val = row[idx];
        if (val === null || val === undefined) return null;
        if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
          return val;
        }
        return String(val);
      });
      const groupKey = JSON.stringify(keyValues);

      if (!groups.has(groupKey)) {
        groups.set(groupKey, { keyValues, rows: [] });
      }
      groups.get(groupKey)!.rows.push(row);
    }

    const resultRows: string[][] = [];
    const resultColHeaders: string[] = [
      ...this.groupByCols,
      ...this.aggregateSpecs.map((spec) => spec.outputCol),
    ];

    for (const { keyValues, rows: groupRows } of groups.values()) {
      const aggregatedValues = this.aggregateSpecs.map((spec) => {
        const colIdx = colHeaders.indexOf(spec.col);
        if (colIdx === -1) {
          throw new Error(`Aggregate column not found: ${spec.col}`);
        }

        if (spec.func === "COUNT") {
          return String(groupRows.length);
        }

        if (spec.func === "COUNT_DISTINCT") {
          const uniqueValues = new Set(groupRows.map((row) => String(row[colIdx])));
          return String(uniqueValues.size);
        }

        if (spec.func === "FIRST") {
          return groupRows.length > 0 ? String(groupRows[0][colIdx]) : "";
        }

        if (spec.func === "LAST") {
          return groupRows.length > 0 ? String(groupRows[groupRows.length - 1][colIdx]) : "";
        }

        const numericValues = groupRows
          .map((row) => Number(row[colIdx]))
          .filter((v) => !isNaN(v));

        switch (spec.func) {
          case "SUM":
            return String(numericValues.reduce((a, b) => a + b, 0));
          case "AVG":
            if (numericValues.length === 0) {
              throw new Error(`Cannot compute AVG on empty set for column "${spec.col}"`);
            }
            return String(numericValues.reduce((a, b) => a + b, 0) / numericValues.length);
          case "MIN":
            if (numericValues.length === 0) {
              throw new Error(`Cannot compute MIN on empty set for column "${spec.col}"`);
            }
            return String(Math.min(...numericValues));
          case "MAX":
            if (numericValues.length === 0) {
              throw new Error(`Cannot compute MAX on empty set for column "${spec.col}"`);
            }
            return String(Math.max(...numericValues));
          case "MEDIAN":
            if (numericValues.length === 0) {
              throw new Error(`Cannot compute MEDIAN on empty set for column "${spec.col}"`);
            }
            const sorted = [...numericValues].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 === 0
              ? (sorted[mid - 1] + sorted[mid]) / 2
              : sorted[mid];
            return String(median);
        }
      });

      const keyStrings = keyValues.map((v) => (v === null ? "" : String(v)));
      resultRows.push([...keyStrings, ...aggregatedValues]);
    }

    return new Csv({
      aoa: resultRows,
      colHeaders: resultColHeaders,
    }) as unknown as Csv<T>;
  }

  private applyOrderBy(csv: Csv<T>): Csv<T> {
    if (this.orderBySpecs.length === 0) {
      return csv;
    }

    const colHeaders = csv.colHeaders;
    const specs = this.orderBySpecs.map((spec) => {
      const colIdx = colHeaders.indexOf(spec.col);
      if (colIdx === -1) {
        throw new Error(`Order by column not found: ${spec.col}`);
      }
      return { colIdx, dir: spec.dir ?? "asc" };
    });

    const indexes = Array.from({ length: csv.nRows }, (_, i) => i);
    indexes.sort((a, b) => {
      for (const { colIdx, dir } of specs) {
        const aVal = csv.aoa[a][colIdx];
        const bVal = csv.aoa[b][colIdx];

        const aNum = Number(aVal);
        const bNum = Number(bVal);

        let cmp: number;
        if (!isNaN(aNum) && !isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }

        if (cmp !== 0) {
          return dir === "asc" ? cmp : -cmp;
        }
      }
      return 0;
    });

    return csv.selectRows(indexes);
  }
}

export function query<T>(csv: Csv<T>): QueryBuilder<T> {
  return new QueryBuilder(csv);
}
