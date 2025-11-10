// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv } from "./csv_class.ts";
import { assert, assertNotUndefined, createArray } from "./deps.ts";

export function combineCsvsUsingSingleRows<T>(
  csvArray: Csv<T>[],
  rowNumberOrHeader: number | string,
  newRowHeaders?: string[],
): Csv<T> {
  assert(
    newRowHeaders === undefined || newRowHeaders.length === csvArray.length,
    "New row headers must be same length as csv array",
  );
  const firstCsv = csvArray.at(0);
  assertNotUndefined(firstCsv, "Must have at least one csv");
  const firstCsvNCols = firstCsv.nCols();
  const firstCsvColHeaders = firstCsv.colHeaders();
  const newAoa: T[][] = [];
  csvArray.forEach((csv) => {
    assert(firstCsvNCols === csv.nCols(), "Csvs have different number of cols");
    if (firstCsvColHeaders === "none") {
      const newRow = csv.getRowVals(rowNumberOrHeader);
      newAoa.push(newRow);
    } else {
      const row = csv.getRowVals(rowNumberOrHeader);
      const colIndexes = csv.getColHeaderIndexes(firstCsvColHeaders);
      const newRow = colIndexes.map((i) => row[i]);
      newAoa.push(newRow);
    }
  });
  return new Csv({
    colHeaders: firstCsvColHeaders,
    rowHeaders: newRowHeaders ?? "none",
    aoa: newAoa,
  });
}

export function combineCsvsUsingSingleCols<T>(
  csvArray: Csv<T>[],
  colNumberOrHeader: number | string,
  newColHeaders?: string[],
): Csv<T> {
  assert(
    newColHeaders === undefined || newColHeaders.length === csvArray.length,
    "New col headers must be same length as csv array",
  );
  const firstCsv = csvArray.at(0);
  assertNotUndefined(firstCsv, "Must have at least one csv");
  const firstCsvNRows = firstCsv.nRows();
  const firstCsvRowHeaders = firstCsv.rowHeaders();
  const newAoa: T[][] = createArray(firstCsvNRows, []);
  csvArray.forEach((csv) => {
    assert(firstCsvNRows === csv.nRows(), "Csvs have different number of rows");
    if (firstCsvRowHeaders === "none") {
      const newCol = csv.getColVals(colNumberOrHeader);
      assert(newCol.length === newAoa.length);
      newCol.forEach((cell, i_row) => {
        newAoa[i_row].push(cell);
      });
    } else {
      const col = csv.getColVals(colNumberOrHeader);
      const rowIndexes = csv.getRowHeaderIndexes(firstCsvRowHeaders);
      const newCol = rowIndexes.map((i) => col[i]);
      assert(newCol.length === newAoa.length);
      newCol.forEach((cell, i_row) => {
        newAoa[i_row].push(cell);
      });
    }
  });
  return new Csv({
    colHeaders: newColHeaders ?? "none",
    rowHeaders: firstCsvRowHeaders,
    aoa: newAoa,
  });
}
