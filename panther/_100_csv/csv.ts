// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { parseCSV } from "./parse.ts";
import { stringifyCsv } from "./stringify.ts";
import type { CsvOptions } from "./types.ts";

export class Csv<T> {
  readonly colHeaders: string[];
  readonly rowHeaders: string[] | undefined;
  readonly nRows: number;
  readonly nCols: number;
  readonly aoa: T[][];

  // ================================================================================
  // CONSTRUCTOR
  // ================================================================================

  constructor(opts: CsvOptions<T>) {
    this.colHeaders = opts.colHeaders;
    this.rowHeaders = opts.rowHeaders;
    this.aoa = opts.aoa;

    this.nRows = this.aoa.length;
    this.nCols = this.aoa.length > 0 ? this.aoa[0].length : 0;

    this.validate();
  }

  // ================================================================================
  // STATIC FACTORY METHODS
  // ================================================================================

  static fromString(csvString: string): Csv<string> {
    const parsed = parseCSV(csvString);
    if (parsed.length === 0) {
      throw new Error("Cannot create Csv from empty CSV string");
    }

    const colHeaders = parsed[0].map((v) => String(v));
    const aoa = parsed.slice(1);

    return new Csv({ aoa, colHeaders });
  }

  static fromObjects(objects: Record<string, unknown>[]): Csv<string> {
    if (objects.length === 0) {
      throw new Error("Cannot create Csv from empty array");
    }

    const colHeaders = Object.keys(objects[0]);
    const aoa = objects.map((obj) =>
      colHeaders.map((key) => String(obj[key] ?? ""))
    );

    return new Csv({ aoa, colHeaders });
  }

  // ================================================================================
  // ACCESS
  // ================================================================================

  cell(row: number | string, col: number | string): T {
    const rowIndex = typeof row === "number" ? row : this.getRowIndex(row);
    const colIndex = typeof col === "number" ? col : this.getColIndex(col);
    if (rowIndex < 0 || rowIndex >= this.nRows) {
      throw new Error(`Row index ${rowIndex} out of bounds (0-${this.nRows - 1})`);
    }
    if (colIndex < 0 || colIndex >= this.nCols) {
      throw new Error(
        `Column index ${colIndex} out of bounds (0-${this.nCols - 1})`,
      );
    }
    return this.aoa[rowIndex][colIndex];
  }

  col(colIndexOrName: number | string): T[] {
    const colIndex = typeof colIndexOrName === "number"
      ? colIndexOrName
      : this.getColIndex(colIndexOrName);

    if (colIndex < 0 || colIndex >= this.nCols) {
      throw new Error(
        `Column index ${colIndex} out of bounds (0-${this.nCols - 1})`,
      );
    }

    return this.aoa.map((row) => row[colIndex]);
  }

  row(rowIndexOrName: number | string): T[] {
    const rowIndex = typeof rowIndexOrName === "number"
      ? rowIndexOrName
      : this.getRowIndex(rowIndexOrName);

    if (rowIndex < 0 || rowIndex >= this.nRows) {
      throw new Error(
        `Row index ${rowIndex} out of bounds (0-${this.nRows - 1})`,
      );
    }
    return [...this.aoa[rowIndex]];
  }

  // ================================================================================
  // SELECT
  // ================================================================================

  selectCols(colIndexesOrNames: (number | string)[]): Csv<T> {
    const colIndexes = colIndexesOrNames.map((c) =>
      typeof c === "number" ? c : this.getColIndex(c)
    );

    for (const idx of colIndexes) {
      if (idx < 0 || idx >= this.nCols) {
        throw new Error(
          `Column index ${idx} out of bounds (0-${this.nCols - 1})`,
        );
      }
    }

    const newData = this.aoa.map((row) => colIndexes.map((i) => row[i]));
    const newColHeaders = colIndexes.map((i) => this.colHeaders[i]);

    return new Csv({
      aoa: newData,
      colHeaders: newColHeaders,
      rowHeaders: this.rowHeaders,
    });
  }

  selectRows(
    indexesOrPredicate: number[] | ((row: T[], i: number) => boolean),
  ): Csv<T> {
    let rowIndexes: number[];

    if (typeof indexesOrPredicate === "function") {
      rowIndexes = [];
      for (let i = 0; i < this.nRows; i++) {
        if (indexesOrPredicate(this.aoa[i], i)) {
          rowIndexes.push(i);
        }
      }
    } else {
      rowIndexes = indexesOrPredicate;
    }

    for (const idx of rowIndexes) {
      if (idx < 0 || idx >= this.nRows) {
        throw new Error(`Row index ${idx} out of bounds (0-${this.nRows - 1})`);
      }
    }

    const newData = rowIndexes.map((i) => [...this.aoa[i]]);
    const newRowHeaders = this.rowHeaders
      ? rowIndexes.map((i) => this.rowHeaders![i])
      : undefined;

    return new Csv({
      aoa: newData,
      colHeaders: this.colHeaders,
      rowHeaders: newRowHeaders,
    });
  }

  // ================================================================================
  // TRANSFORM VALUES
  // ================================================================================

  mapCells<R>(fn: (val: T, rowIdx: number, colIdx: number) => R): Csv<R> {
    const newData = this.aoa.map((row, rowIdx) =>
      row.map((cell, colIdx) => fn(cell, rowIdx, colIdx))
    );

    return new Csv({
      aoa: newData,
      colHeaders: this.colHeaders,
      rowHeaders: this.rowHeaders,
    });
  }

  mapCols<R>(fn: (colVals: T[], colIdx: number) => R[]): Csv<R> {
    if (this.nRows === 0) {
      return new Csv({
        aoa: [],
        colHeaders: this.colHeaders,
        rowHeaders: this.rowHeaders,
      });
    }

    const newData: R[][] = [];
    for (let row = 0; row < this.nRows; row++) {
      newData.push([]);
    }

    for (let col = 0; col < this.nCols; col++) {
      const colVals = this.aoa.map((row) => row[col]);
      const transformedCol = fn(colVals, col);

      if (transformedCol.length !== this.nRows) {
        throw new Error(
          `mapCols function must return array of length ${this.nRows}, got ${transformedCol.length}`,
        );
      }

      for (let row = 0; row < this.nRows; row++) {
        newData[row][col] = transformedCol[row];
      }
    }

    return new Csv({
      aoa: newData,
      colHeaders: this.colHeaders,
      rowHeaders: this.rowHeaders,
    });
  }

  mapRows<R>(fn: (rowVals: T[], rowIdx: number) => R[]): Csv<R> {
    const newData = this.aoa.map((row, rowIdx) => fn(row, rowIdx));

    for (let i = 0; i < newData.length; i++) {
      if (newData[i].length !== this.nCols) {
        throw new Error(
          `mapRows function must return array of length ${this.nCols}, got ${
            newData[i].length
          }`,
        );
      }
    }

    return new Csv({
      aoa: newData,
      colHeaders: this.colHeaders,
      rowHeaders: this.rowHeaders,
    });
  }

  // ================================================================================
  // TRANSFORM STRUCTURE
  // ================================================================================

  transpose(): Csv<T> {
    if (!this.rowHeaders) {
      throw new Error("Cannot transpose: CSV requires rowHeaders to transpose");
    }

    if (this.nRows === 0) {
      return new Csv({
        aoa: [],
        colHeaders: this.rowHeaders,
        rowHeaders: this.colHeaders,
      });
    }

    const transposedData: T[][] = [];
    for (let col = 0; col < this.nCols; col++) {
      const newRow: T[] = [];
      for (let row = 0; row < this.nRows; row++) {
        newRow.push(this.aoa[row][col]);
      }
      transposedData.push(newRow);
    }

    return new Csv({
      aoa: transposedData,
      colHeaders: this.rowHeaders,
      rowHeaders: this.colHeaders,
    });
  }

  reorderCols(colIndexesOrNames: (number | string)[]): Csv<T> {
    return this.selectCols(colIndexesOrNames);
  }

  withColHeaders(headers: string[]): Csv<T> {
    if (headers.length !== this.nCols) {
      throw new Error(
        `Column headers length (${headers.length}) does not match number of columns (${this.nCols})`,
      );
    }
    return new Csv({
      aoa: this.aoa,
      colHeaders: headers,
      rowHeaders: this.rowHeaders,
    });
  }

  withRowHeaders(headers: string[]): Csv<T> {
    if (headers.length !== this.nRows) {
      throw new Error(
        `Row headers length (${headers.length}) does not match number of rows (${this.nRows})`,
      );
    }
    return new Csv({
      aoa: this.aoa,
      colHeaders: this.colHeaders,
      rowHeaders: headers,
    });
  }

  // ================================================================================
  // COMBINE
  // ================================================================================

  appendRows(other: Csv<T>): Csv<T> {
    if (this.nCols !== other.nCols) {
      throw new Error(
        `Cannot append rows: column count mismatch (${this.nCols} vs ${other.nCols})`,
      );
    }

    for (let i = 0; i < this.colHeaders.length; i++) {
      if (this.colHeaders[i] !== other.colHeaders[i]) {
        throw new Error(
          `Cannot append rows: column headers mismatch at index ${i} ("${
            this.colHeaders[i]
          }" vs "${other.colHeaders[i]}")`,
        );
      }
    }

    const newData = [...this.aoa, ...other.aoa];

    const newRowHeaders = this.rowHeaders && other.rowHeaders
      ? [...this.rowHeaders, ...other.rowHeaders]
      : undefined;

    return new Csv({
      aoa: newData,
      colHeaders: this.colHeaders,
      rowHeaders: newRowHeaders,
    });
  }

  appendCols(other: Csv<T>): Csv<T> {
    if (this.nRows !== other.nRows) {
      throw new Error(
        `Cannot append columns: row count mismatch (${this.nRows} vs ${other.nRows})`,
      );
    }

    if (this.rowHeaders && other.rowHeaders) {
      for (let i = 0; i < this.rowHeaders.length; i++) {
        if (this.rowHeaders[i] !== other.rowHeaders[i]) {
          throw new Error(
            `Cannot append columns: row headers mismatch at index ${i} ("${
              this.rowHeaders[i]
            }" vs "${other.rowHeaders[i]}")`,
          );
        }
      }
    }

    const newData = this.aoa.map((row, i) => [...row, ...other.aoa[i]]);
    const newColHeaders = [...this.colHeaders, ...other.colHeaders];

    return new Csv({
      aoa: newData,
      colHeaders: newColHeaders,
      rowHeaders: this.rowHeaders,
    });
  }

  // ================================================================================
  // EXPORT
  // ================================================================================

  toObjects(): Record<string, T>[] {
    return this.aoa.map((row) => {
      const obj: Record<string, T> = {};
      for (let i = 0; i < this.colHeaders.length; i++) {
        obj[this.colHeaders[i]] = row[i];
      }
      return obj;
    });
  }

  toArray(): T[][] {
    return this.aoa.map((row) => [...row]);
  }

  toArrayWithHeaders(): string[][] {
    const result: string[][] = [this.colHeaders];

    for (let i = 0; i < this.nRows; i++) {
      const row = this.aoa[i].map((v) => String(v));
      if (this.rowHeaders) {
        result.push([this.rowHeaders[i], ...row]);
      } else {
        result.push(row);
      }
    }

    if (this.rowHeaders) {
      result[0] = ["", ...this.colHeaders];
    }

    return result;
  }

  stringify(): string {
    const dataWithHeaders = this.toArrayWithHeaders();
    return stringifyCsv(dataWithHeaders);
  }

  // ================================================================================
  // TYPE CONVERSION
  // ================================================================================

  asNumbers(): Csv<number> {
    return this.mapCells((val) => {
      const num = Number(val);
      if (isNaN(num)) {
        throw new Error(`Cannot convert to number: ${val}`);
      }
      return num;
    });
  }

  asStrings(): Csv<string> {
    return this.mapCells((val) => String(val));
  }

  // ================================================================================
  // UTILITY
  // ================================================================================

  copy(): Csv<T> {
    return new Csv({
      aoa: this.aoa.map((row) => [...row]),
      colHeaders: [...this.colHeaders],
      rowHeaders: this.rowHeaders ? [...this.rowHeaders] : undefined,
    });
  }

  // ================================================================================
  // EXPLORATION
  // ================================================================================

  head(n: number = 5): Csv<T> {
    const count = Math.min(n, this.nRows);
    return this.selectRows(Array.from({ length: count }, (_, i) => i));
  }

  tail(n: number = 5): Csv<T> {
    const count = Math.min(n, this.nRows);
    const start = this.nRows - count;
    return this.selectRows(Array.from({ length: count }, (_, i) => start + i));
  }

  limit(n: number): Csv<T> {
    return this.head(n);
  }

  slice(start: number, end?: number): Csv<T> {
    const actualEnd = end ?? this.nRows;
    if (start < 0 || start > this.nRows) {
      throw new Error(`Start index ${start} out of bounds (0-${this.nRows})`);
    }
    if (actualEnd < start || actualEnd > this.nRows) {
      throw new Error(`End index ${actualEnd} out of bounds (${start}-${this.nRows})`);
    }
    const indexes = Array.from({ length: actualEnd - start }, (_, i) => start + i);
    return this.selectRows(indexes);
  }

  sample(n: number): Csv<T> {
    if (n <= 0) {
      throw new Error("Sample size must be positive");
    }
    if (n >= this.nRows) {
      return this.copy();
    }
    const indexes = Array.from({ length: this.nRows }, (_, i) => i);
    for (let i = indexes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    return this.selectRows(indexes.slice(0, n));
  }

  // ================================================================================
  // FLUENT TRANSFORMS
  // ================================================================================

  rename(mapping: Record<string, string>): Csv<T> {
    const newHeaders = this.colHeaders.map((h) => mapping[h] ?? h);
    return this.withColHeaders(newHeaders);
  }

  dropCols(cols: (string | number)[]): Csv<T> {
    const dropIndexes = new Set(
      cols.map((c) => (typeof c === "number" ? c : this.getColIndex(c)))
    );
    const keepIndexes = this.colHeaders
      .map((_, i) => i)
      .filter((i) => !dropIndexes.has(i));
    return this.selectCols(keepIndexes);
  }

  addCol(name: string, fn: (row: T[], rowIdx: number) => T): Csv<T> {
    if (this.colHeaders.includes(name)) {
      throw new Error(`Column "${name}" already exists`);
    }
    const newData = this.aoa.map((row, i) => [...row, fn(row, i)]);
    return new Csv({
      aoa: newData,
      colHeaders: [...this.colHeaders, name],
      rowHeaders: this.rowHeaders,
    });
  }

  sortBy(col: string | number, direction: "asc" | "desc" = "asc"): Csv<T> {
    return this.sortByMultiple([{ col, dir: direction }]);
  }

  sortByMultiple(
    specs: Array<{ col: string | number; dir?: "asc" | "desc" }>
  ): Csv<T> {
    if (specs.length === 0) {
      return this.copy();
    }

    const colIndexes = specs.map((s) => ({
      idx: typeof s.col === "number" ? s.col : this.getColIndex(s.col),
      dir: s.dir ?? "asc",
    }));

    const indexes = Array.from({ length: this.nRows }, (_, i) => i);
    indexes.sort((a, b) => {
      for (const { idx, dir } of colIndexes) {
        const aVal = this.aoa[a][idx];
        const bVal = this.aoa[b][idx];

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

    return this.selectRows(indexes);
  }

  unique(cols?: (string | number)[]): Csv<T> {
    const colIndexes = cols
      ? cols.map((c) => (typeof c === "number" ? c : this.getColIndex(c)))
      : this.colHeaders.map((_, i) => i);

    const seen = new Set<string>();
    const keepIndexes: number[] = [];

    for (let i = 0; i < this.nRows; i++) {
      const key = JSON.stringify(colIndexes.map((idx) => this.aoa[i][idx]));
      if (!seen.has(key)) {
        seen.add(key);
        keepIndexes.push(i);
      }
    }

    return this.selectRows(keepIndexes);
  }

  // ================================================================================
  // PIVOT / UNPIVOT
  // ================================================================================

  pivot(opts: {
    index: string | string[];
    columns: string;
    values: string;
    aggFunc?: "sum" | "avg" | "count" | "min" | "max" | "first";
  }): Csv<string> {
    const indexCols = Array.isArray(opts.index) ? opts.index : [opts.index];
    const indexIndexes = indexCols.map((c) => this.getColIndex(c));
    const columnsIndex = this.getColIndex(opts.columns);
    const valuesIndex = this.getColIndex(opts.values);
    const aggFunc = opts.aggFunc ?? "first";

    const uniqueColumnValues = [...new Set(this.aoa.map((row) => String(row[columnsIndex])))];
    uniqueColumnValues.sort();

    const groups = new Map<string, Map<string, T[]>>();

    for (const row of this.aoa) {
      const indexKey = JSON.stringify(indexIndexes.map((i) => row[i]));
      const columnValue = String(row[columnsIndex]);
      const value = row[valuesIndex];

      if (!groups.has(indexKey)) {
        groups.set(indexKey, new Map());
      }
      const group = groups.get(indexKey)!;
      if (!group.has(columnValue)) {
        group.set(columnValue, []);
      }
      group.get(columnValue)!.push(value);
    }

    const resultColHeaders = [...indexCols, ...uniqueColumnValues];
    const resultRows: string[][] = [];

    for (const [indexKey, columnMap] of groups.entries()) {
      const indexValues = JSON.parse(indexKey) as T[];
      const row: string[] = indexValues.map((v) => String(v));

      for (const colVal of uniqueColumnValues) {
        const values = columnMap.get(colVal) ?? [];
        row.push(this.aggregate(values, aggFunc));
      }

      resultRows.push(row);
    }

    return new Csv({
      aoa: resultRows,
      colHeaders: resultColHeaders,
    });
  }

  unpivot(opts: {
    index: string | string[];
    valueColumns: string[];
    varName?: string;
    valueName?: string;
  }): Csv<string> {
    const indexCols = Array.isArray(opts.index) ? opts.index : [opts.index];
    const indexIndexes = indexCols.map((c) => this.getColIndex(c));
    const valueColIndexes = opts.valueColumns.map((c) => this.getColIndex(c));
    const varName = opts.varName ?? "variable";
    const valueName = opts.valueName ?? "value";

    const resultColHeaders = [...indexCols, varName, valueName];
    const resultRows: string[][] = [];

    for (const row of this.aoa) {
      const indexValues = indexIndexes.map((i) => String(row[i]));

      for (let i = 0; i < opts.valueColumns.length; i++) {
        const colName = opts.valueColumns[i];
        const value = String(row[valueColIndexes[i]]);
        resultRows.push([...indexValues, colName, value]);
      }
    }

    return new Csv({
      aoa: resultRows,
      colHeaders: resultColHeaders,
    });
  }

  private aggregate(values: T[], func: string): string {
    if (values.length === 0) {
      return "";
    }

    const nums = values.map((v) => Number(v)).filter((n) => !isNaN(n));

    switch (func) {
      case "first":
        return String(values[0]);
      case "last":
        return String(values[values.length - 1]);
      case "count":
        return String(values.length);
      case "sum":
        return nums.length > 0 ? String(nums.reduce((a, b) => a + b, 0)) : "";
      case "avg":
        return nums.length > 0
          ? String(nums.reduce((a, b) => a + b, 0) / nums.length)
          : "";
      case "min":
        return nums.length > 0 ? String(Math.min(...nums)) : "";
      case "max":
        return nums.length > 0 ? String(Math.max(...nums)) : "";
      default:
        return String(values[0]);
    }
  }

  // ================================================================================
  // INTERNAL HELPERS
  // ================================================================================

  private validate(): void {
    if (this.colHeaders.length !== this.nCols) {
      throw new Error(
        `Column headers length (${this.colHeaders.length}) does not match number of columns (${this.nCols})`,
      );
    }

    const uniqueColHeaders = new Set(this.colHeaders);
    if (uniqueColHeaders.size !== this.colHeaders.length) {
      throw new Error("Column headers must be unique");
    }

    if (this.rowHeaders) {
      if (this.rowHeaders.length !== this.nRows) {
        throw new Error(
          `Row headers length (${this.rowHeaders.length}) does not match number of rows (${this.nRows})`,
        );
      }

      const uniqueRowHeaders = new Set(this.rowHeaders);
      if (uniqueRowHeaders.size !== this.rowHeaders.length) {
        throw new Error("Row headers must be unique");
      }
    }

    for (let i = 0; i < this.aoa.length; i++) {
      if (this.aoa[i].length !== this.nCols) {
        throw new Error(
          `Row ${i} has ${this.aoa[i].length} columns, expected ${this.nCols}`,
        );
      }
    }
  }

  private getColIndex(name: string): number {
    const index = this.colHeaders.indexOf(name);
    if (index === -1) {
      throw new Error(`Column not found: "${name}"`);
    }
    return index;
  }

  private getRowIndex(name: string): number {
    if (!this.rowHeaders) {
      throw new Error("Cannot lookup row by name: CSV has no row headers");
    }
    const index = this.rowHeaders.indexOf(name);
    if (index === -1) {
      throw new Error(`Row not found: "${name}"`);
    }
    return index;
  }
}
