// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv } from "./deps.ts";
import type {
  AggregateFunction,
  OrderDirection,
  WhereFilter,
  WherePredicate,
} from "./types.ts";

type AggregateSpec = {
  col: string;
  func: AggregateFunction;
  outputCol: string;
};

export class QueryBuilder<T> {
  private csv: Csv<T>;
  private whereFilters: Array<WhereFilter | WherePredicate<T>> = [];
  private groupByCols: string[] = [];
  private aggregateSpecs: AggregateSpec[] = [];
  private orderByCol?: string;
  private orderByDirection?: OrderDirection;

  constructor(csv: Csv<T>) {
    this.csv = csv;
  }

  where(
    filterOrPredicate: WhereFilter | WherePredicate<T>,
  ): QueryBuilder<T> {
    this.whereFilters.push(filterOrPredicate);
    return this;
  }

  groupBy(cols: string[]): QueryBuilder<T> {
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

  orderBy(col: string, direction: OrderDirection = "asc"): QueryBuilder<T> {
    this.orderByCol = col;
    this.orderByDirection = direction;
    return this;
  }

  execute(): Csv<T> {
    let result = this.csv;

    if (this.whereFilters.length > 0) {
      result = this.applyWhereFilters(result);
    }

    if (this.groupByCols.length > 0) {
      result = this.applyGroupBy(result);
    }

    if (this.orderByCol) {
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

    const groups = new Map<string, T[][]>();

    for (let i = 0; i < csv.nRows; i++) {
      const row = csv.aoa[i];
      const groupKey = groupByIndexes.map((idx) => String(row[idx])).join(
        "|||",
      );

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(row);
    }

    const resultRows: T[][] = [];
    const resultColHeaders: string[] = [
      ...this.groupByCols,
      ...this.aggregateSpecs.map((spec) => spec.outputCol),
    ];

    for (const [groupKey, groupRows] of groups.entries()) {
      const groupKeyParts = groupKey.split("|||");
      const aggregatedValues = this.aggregateSpecs.map((spec) => {
        const colIdx = colHeaders.indexOf(spec.col);
        if (colIdx === -1) {
          throw new Error(`Aggregate column not found: ${spec.col}`);
        }

        const values = groupRows.map((row) => Number(row[colIdx])).filter(
          (v) => !isNaN(v),
        );

        switch (spec.func) {
          case "SUM":
            return values.reduce((a, b) => a + b, 0) as T;
          case "AVG":
            return (values.reduce((a, b) => a + b, 0) / values.length) as T;
          case "COUNT":
            return values.length as T;
          case "MIN":
            return Math.min(...values) as T;
          case "MAX":
            return Math.max(...values) as T;
        }
      });

      resultRows.push([...(groupKeyParts as T[]), ...aggregatedValues]);
    }

    return new Csv({
      aoa: resultRows,
      colHeaders: resultColHeaders,
    });
  }

  private applyOrderBy(csv: Csv<T>): Csv<T> {
    if (!this.orderByCol) {
      return csv;
    }

    const colHeaders = csv.colHeaders;
    const colIdx = colHeaders.indexOf(this.orderByCol);
    if (colIdx === -1) {
      throw new Error(`Order by column not found: ${this.orderByCol}`);
    }

    const indexes = Array.from({ length: csv.nRows }, (_, i) => i);
    indexes.sort((a, b) => {
      const aVal = csv.aoa[a][colIdx];
      const bVal = csv.aoa[b][colIdx];

      const aNum = Number(aVal);
      const bNum = Number(bVal);

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return this.orderByDirection === "asc" ? aNum - bNum : bNum - aNum;
      }

      const aStr = String(aVal);
      const bStr = String(bVal);

      if (this.orderByDirection === "asc") {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });

    return csv.selectRows(indexes);
  }
}

export function query<T>(csv: Csv<T>): QueryBuilder<T> {
  return new QueryBuilder(csv);
}
