// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  assertNotUndefined,
  assertUnique,
  createArray,
  getSortedAlphabetical,
  getUnique,
  getValidNumberOrThrowError,
  sum,
} from "./deps.ts";
// import { parseStrToAoA } from "./parse_csv.ts"; // Deprecated - parsing functionality removed
import { stringifyCsv, type StringifyOptions } from "./stringify_csv.ts";
import type { PointEstimateBounds } from "./types.ts";
import { copyHeadersNoneOrArray } from "./utils.ts";

//////////////////////////////////////////////////
//  _______             __                      //
// /       \           /  |                     //
// $$$$$$$  | __    __ $$ |  ______    _______  //
// $$ |__$$ |/  |  /  |$$ | /      \  /       | //
// $$    $$< $$ |  $$ |$$ |/$$$$$$  |/$$$$$$$/  //
// $$$$$$$  |$$ |  $$ |$$ |$$    $$ |$$      \  //
// $$ |  $$ |$$ \__$$ |$$ |$$$$$$$$/  $$$$$$  | //
// $$ |  $$ |$$    $$/ $$ |$$       |/     $$/  //
// $$/   $$/  $$$$$$/  $$/  $$$$$$$/ $$$$$$$/   //
//                                              //
//////////////////////////////////////////////////

// MUTATE_ methods only return void, and mutate the csv
// Write methods are immutable and return void
// All other methods are immutable and return a copy

export type CsvOptions<T> = {
  colHeaders?: "none" | string[];
  rowHeaders?: "none" | string[];
  aoa?: T[][];
};

type RowFilterFunc<T> = (row: T[], i_row: number, csv: Csv<T>) => boolean;
type RowFindFunc<T> = (row: T[], i_row: number, csv: Csv<T>) => boolean;

export class Csv<T> {
  private _colHeaders: "none" | string[];
  private _rowHeaders: "none" | string[];
  private _aoa: T[][];

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //   ______                                   __                                      __                          //
  //  /      \                                 /  |                                    /  |                         //
  // /$$$$$$  |  ______   _______    _______  _$$ |_     ______   __    __   _______  _$$ |_     ______    ______   //
  // $$ |  $$/  /      \ /       \  /       |/ $$   |   /      \ /  |  /  | /       |/ $$   |   /      \  /      \  //
  // $$ |      /$$$$$$  |$$$$$$$  |/$$$$$$$/ $$$$$$/   /$$$$$$  |$$ |  $$ |/$$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  | //
  // $$ |   __ $$ |  $$ |$$ |  $$ |$$      \   $$ | __ $$ |  $$/ $$ |  $$ |$$ |        $$ | __ $$ |  $$ |$$ |  $$/  //
  // $$ \__/  |$$ \__$$ |$$ |  $$ | $$$$$$  |  $$ |/  |$$ |      $$ \__$$ |$$ \_____   $$ |/  |$$ \__$$ |$$ |       //
  // $$    $$/ $$    $$/ $$ |  $$ |/     $$/   $$  $$/ $$ |      $$    $$/ $$       |  $$  $$/ $$    $$/ $$ |       //
  //  $$$$$$/   $$$$$$/  $$/   $$/ $$$$$$$/     $$$$/  $$/        $$$$$$/   $$$$$$$/    $$$$/   $$$$$$/  $$/        //
  //                                                                                                                //
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  constructor(opts?: Csv<T> | CsvOptions<T> | string[]) {
    if (opts === undefined) {
      this._colHeaders = "none";
      this._rowHeaders = "none";
      this._aoa = [];
      return;
    }
    if (opts instanceof Csv) {
      this._colHeaders = opts.colHeaders();
      this._rowHeaders = opts.rowHeaders();
      this._aoa = opts._aoa.map((row) => row.map((cell) => cell));
      this.validate();
      return;
    }
    if (opts instanceof Array) {
      this._colHeaders = [...opts];
      this._rowHeaders = "none";
      this._aoa = [];
      this.validate();
      return;
    }
    if (opts.aoa === undefined || opts.aoa.length === 0) {
      if (opts.rowHeaders instanceof Array) {
        throw new Error("Csv constructor cannot receive row headers if no aoa");
      }
      this._colHeaders = copyHeadersNoneOrArray(opts.colHeaders ?? "none");
      this._rowHeaders = "none";
      this._aoa = [];
      this.validate();
      return;
    }
    if (
      opts.rowHeaders instanceof Array &&
      opts.rowHeaders.length !== opts.aoa.length
    ) {
      throw new Error("Csv row headers not equal to aoa");
    }
    if (
      opts.colHeaders instanceof Array &&
      opts.colHeaders.length !== opts.aoa[0].length
    ) {
      throw new Error("Csv col headers not equal to aoa");
    }
    this._colHeaders = copyHeadersNoneOrArray(opts.colHeaders ?? "none");
    this._rowHeaders = copyHeadersNoneOrArray(opts.rowHeaders ?? "none");
    this._aoa = opts.aoa.map((row) => row.map((cell) => cell));
    this.validate();
  }

  ///////////////////////////////////////////////////////////
  //   ______    __                  __      __            //
  //  /      \  /  |                /  |    /  |           //
  // /$$$$$$  |_$$ |_     ______   _$$ |_   $$/   _______  //
  // $$ \__$$// $$   |   /      \ / $$   |  /  | /       | //
  // $$      \$$$$$$/    $$$$$$  |$$$$$$/   $$ |/$$$$$$$/  //
  //  $$$$$$  | $$ | __  /    $$ |  $$ | __ $$ |$$ |       //
  // /  \__$$ | $$ |/  |/$$$$$$$ |  $$ |/  |$$ |$$ \_____  //
  // $$    $$/  $$  $$/ $$    $$ |  $$  $$/ $$ |$$       | //
  //  $$$$$$/    $$$$/   $$$$$$$/    $$$$/  $$/  $$$$$$$/  //
  //                                                       //
  ///////////////////////////////////////////////////////////

  static fromString(
    _str: string,
    _opts?: {
      colHeaders?: "none" | "use-first-row";
      rowHeaders?: "none" | "use-first-col";
    },
  ): Csv<string> {
    throw new Error(
      "CSV parsing functionality has been deprecated. Please use a dedicated CSV parsing library like PapaParse instead.",
    );
    // const aoa = parseStrToAoA(str);
    // return this.fromAoA(aoa, opts);
  }

  static fromAoA(
    rawAoa: string[][],
    opts?: {
      colHeaders?: "none" | "use-first-row";
      rowHeaders?: "none" | "use-first-col";
    },
  ): Csv<string> {
    const goodOpts = {
      colHeaders: opts?.colHeaders ?? "use-first-row",
      rowHeaders: opts?.rowHeaders ?? "use-first-col",
    };
    if (rawAoa.length === 0) {
      throw new Error("CSV has no rows");
    }
    if (rawAoa[0].length === 0) {
      throw new Error("CSV has no columns");
    }
    if (goodOpts.colHeaders === "use-first-row" && rawAoa.length === 1) {
      throw new Error(
        "CSV does not have enough rows when using first row as col headers",
      );
    }
    if (goodOpts.colHeaders === "none" && goodOpts.rowHeaders === "none") {
      return new Csv<string>({
        aoa: rawAoa.map((row) => row.map((cell) => cell)),
        colHeaders: "none",
        rowHeaders: "none",
      });
    }
    if (
      goodOpts.colHeaders === "use-first-row" &&
      goodOpts.rowHeaders === "none"
    ) {
      return new Csv<string>({
        aoa: rawAoa.slice(1).map((row) => row.map((cell) => cell)),
        colHeaders: rawAoa.at(0)!.map((header) => header.trim()),
        rowHeaders: "none",
      });
    }
    if (
      goodOpts.colHeaders === "none" &&
      goodOpts.rowHeaders === "use-first-col"
    ) {
      return new Csv<string>({
        aoa: rawAoa.map((row) => row.slice(1).map((cell) => cell)),
        colHeaders: "none",
        rowHeaders: rawAoa.map((row) => row.at(0)!.trim()),
      });
    }
    return new Csv<string>({
      aoa: rawAoa.slice(1).map((row) => row.slice(1).map((cell) => cell)),
      colHeaders: rawAoa
        .at(0)!
        .slice(1)
        .map((header) => header.trim()),
      rowHeaders: rawAoa.slice(1).map((row) => row.at(0)!.trim()),
    });
  }

  static fromObjectArray(arr: Record<string, unknown>[]): Csv<string> {
    if (arr.length === 0) {
      throw new Error("Array is of length 0");
    }
    const colHeaders: string[] = [];
    for (const k in arr[0]) {
      colHeaders.push(k);
    }
    if (colHeaders.length === 0) {
      throw new Error("Array has object with no properties");
    }
    const aoa = arr.map((obj) => {
      const row: string[] = [];
      colHeaders.forEach((colHeader) => {
        const cell = obj[colHeader];
        // if (!cell || typeof cell !== dataType) {
        //   throw new Error("Bad, undefined, or inconsistent cell values");
        // }
        row.push(String(cell));
      });
      return row;
    });
    return new Csv({
      colHeaders,
      rowHeaders: "none",
      aoa,
    });
  }

  ///////////////////////////////////////////////////////////////////////////////
  //  __       __              __      __                        __            //
  // /  \     /  |            /  |    /  |                      /  |           //
  // $$  \   /$$ |  ______   _$$ |_   $$ |____    ______    ____$$ |  _______  //
  // $$$  \ /$$$ | /      \ / $$   |  $$      \  /      \  /    $$ | /       | //
  // $$$$  /$$$$ |/$$$$$$  |$$$$$$/   $$$$$$$  |/$$$$$$  |/$$$$$$$ |/$$$$$$$/  //
  // $$ $$ $$/$$ |$$    $$ |  $$ | __ $$ |  $$ |$$ |  $$ |$$ |  $$ |$$      \  //
  // $$ |$$$/ $$ |$$$$$$$$/   $$ |/  |$$ |  $$ |$$ \__$$ |$$ \__$$ | $$$$$$  | //
  // $$ | $/  $$ |$$       |  $$  $$/ $$ |  $$ |$$    $$/ $$    $$ |/     $$/  //
  // $$/      $$/  $$$$$$$/    $$$$/  $$/   $$/  $$$$$$/   $$$$$$$/ $$$$$$$/   //
  //                                                                           //
  ///////////////////////////////////////////////////////////////////////////////

  //////////////////////////////////////////
  //  ______             ______           //
  // /      |           /      \          //
  // $$$$$$/  _______  /$$$$$$  |______   //
  //   $$ |  /       \ $$ |_ $$//      \  //
  //   $$ |  $$$$$$$  |$$   |  /$$$$$$  | //
  //   $$ |  $$ |  $$ |$$$$/   $$ |  $$ | //
  //  _$$ |_ $$ |  $$ |$$ |    $$ \__$$ | //
  // / $$   |$$ |  $$ |$$ |    $$    $$/  //
  // $$$$$$/ $$/   $$/ $$/      $$$$$$/   //
  //                                      //
  //////////////////////////////////////////

  dataType():
    | "string"
    | "number"
    | "bigint"
    | "boolean"
    | "symbol"
    | "undefined"
    | "object"
    | "function" {
    return typeof this._aoa[0]?.[0];
  }

  colHeaders(): "none" | string[] {
    if (this._colHeaders === "none") {
      return "none";
    }
    return [...this._colHeaders];
  }

  rowHeaders(): "none" | string[] {
    if (this._rowHeaders === "none") {
      return "none";
    }
    return [...this._rowHeaders];
  }

  colHeadersOrThrowIfNone(): string[] {
    if (this._colHeaders === "none") {
      throw new Error("Col headers are none");
    }
    return [...this._colHeaders];
  }

  rowHeadersOrThrowIfNone(): string[] {
    if (this._rowHeaders === "none") {
      throw new Error("Row headers are none");
    }
    return [...this._rowHeaders];
  }

  aoa(): T[][] {
    return this._aoa.map((row) => row.map((cell) => cell));
  }

  nCols(): number {
    if (this._colHeaders === "none") {
      if (this._aoa.length === 0) {
        return 0;
      }
      return this._aoa[0].length;
    }
    if (this._aoa.length === 0) {
      return this._colHeaders.length;
    }
    if (this._colHeaders.length !== this._aoa[0].length) {
      throw new Error("Csv has bad column headers, no equal to aoa");
    }
    return this._colHeaders.length;
  }

  nRows(): number {
    if (this._rowHeaders === "none") {
      return this._aoa.length;
    }
    if (this._rowHeaders.length !== this._aoa.length) {
      throw new Error("Csv has bad row headers, no equal to aoa");
    }
    return this._rowHeaders.length;
  }

  //////////////////////////////////////////////////////////////////////
  //  __    __            __                                          //
  // /  |  /  |          /  |                                         //
  // $$ |  $$ |  ______  $$ |  ______    ______    ______    _______  //
  // $$ |__$$ | /      \ $$ | /      \  /      \  /      \  /       | //
  // $$    $$ |/$$$$$$  |$$ |/$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$$/  //
  // $$$$$$$$ |$$    $$ |$$ |$$ |  $$ |$$    $$ |$$ |  $$/ $$      \  //
  // $$ |  $$ |$$$$$$$$/ $$ |$$ |__$$ |$$$$$$$$/ $$ |       $$$$$$  | //
  // $$ |  $$ |$$       |$$ |$$    $$/ $$       |$$ |      /     $$/  //
  // $$/   $$/  $$$$$$$/ $$/ $$$$$$$/   $$$$$$$/ $$/       $$$$$$$/   //
  //                         $$ |                                     //
  //                         $$ |                                     //
  //                         $$/                                      //
  //                                                                  //
  //////////////////////////////////////////////////////////////////////

  getColHeaderIndex(numberOrHeader: number | string): number {
    return this.getHeaderIndex(numberOrHeader, "cols");
  }

  getRowHeaderIndex(numberOrHeader: number | string | RowFindFunc<T>): number {
    if (typeof numberOrHeader === "function") {
      for (let i = 0; i < this._aoa.length; i++) {
        const row = this._aoa[i];
        if (numberOrHeader(row, i, this)) {
          return i;
        }
      }
      throw new Error("Could not find row");
    }
    return this.getHeaderIndex(numberOrHeader, "rows");
  }

  getColHeaderIndexes(numbersOrHeaders: number[] | string[]): number[] {
    return this.getHeaderIndexes(numbersOrHeaders, "cols");
  }

  getRowHeaderIndexes(
    numbersOrHeaders: number[] | string[] | RowFilterFunc<T>,
  ): number[] {
    if (typeof numbersOrHeaders === "function") {
      return this.getRowsAsMappedArray((row, i_row, csv) =>
        numbersOrHeaders(row, i_row, csv) ? i_row : -1
      ).filter((i_row) => i_row >= 0);
    }
    return this.getHeaderIndexes(numbersOrHeaders, "rows");
  }

  private getHeaderIndexes(
    numbersOrHeaders: number[] | string[],
    colsOrRows: "cols" | "rows",
  ): number[] {
    return numbersOrHeaders.map((numberOrHeader) =>
      this.getHeaderIndex(numberOrHeader, colsOrRows)
    );
  }

  private getHeaderIndex(
    numberOrHeader: number | string,
    colsOrRows: "cols" | "rows",
  ): number {
    if (typeof numberOrHeader === "number") {
      const index = numberOrHeader - 1;
      if (colsOrRows === "cols") {
        this.validateColIndex(index);
      } else {
        this.validateRowIndex(index);
      }
      return index;
    }
    if (colsOrRows === "cols") {
      const index = this.colHeadersOrThrowIfNone().indexOf(numberOrHeader);
      this.validateColIndex(index);
      return index;
    }
    if (colsOrRows === "rows") {
      const index = this.rowHeadersOrThrowIfNone().indexOf(numberOrHeader);
      this.validateRowIndex(index);
      return index;
    }
    throw new Error("Should not happen");
  }

  ///////////////////////////////////////////////////////////////////////////////////////////
  //  ______  __                                     __                                    //
  // /      |/  |                                   /  |                                   //
  // $$$$$$/_$$ |_     ______    ______   ______   _$$ |_     ______    ______    _______  //
  //   $$ |/ $$   |   /      \  /      \ /      \ / $$   |   /      \  /      \  /       | //
  //   $$ |$$$$$$/   /$$$$$$  |/$$$$$$  |$$$$$$  |$$$$$$/   /$$$$$$  |/$$$$$$  |/$$$$$$$/  //
  //   $$ |  $$ | __ $$    $$ |$$ |  $$/ /    $$ |  $$ | __ $$ |  $$ |$$ |  $$/ $$      \  //
  //  _$$ |_ $$ |/  |$$$$$$$$/ $$ |     /$$$$$$$ |  $$ |/  |$$ \__$$ |$$ |       $$$$$$  | //
  // / $$   |$$  $$/ $$       |$$ |     $$    $$ |  $$  $$/ $$    $$/ $$ |      /     $$/  //
  // $$$$$$/  $$$$/   $$$$$$$/ $$/       $$$$$$$/    $$$$/   $$$$$$/  $$/       $$$$$$$/   //
  //                                                                                       //
  ///////////////////////////////////////////////////////////////////////////////////////////

  forEachRow(func: (row: T[], i_row: number, csv: Csv<T>) => void) {
    this._aoa.forEach((row, i_row) => {
      func(row, i_row, this);
    });
  }

  //////////////////////////////////////////////////////////////////////////
  //  __     __           __  __        __              __                //
  // /  |   /  |         /  |/  |      /  |            /  |               //
  // $$ |   $$ | ______  $$ |$$/   ____$$ |  ______   _$$ |_     ______   //
  // $$ |   $$ |/      \ $$ |/  | /    $$ | /      \ / $$   |   /      \  //
  // $$  \ /$$/ $$$$$$  |$$ |$$ |/$$$$$$$ | $$$$$$  |$$$$$$/   /$$$$$$  | //
  //  $$  /$$/  /    $$ |$$ |$$ |$$ |  $$ | /    $$ |  $$ | __ $$    $$ | //
  //   $$ $$/  /$$$$$$$ |$$ |$$ |$$ \__$$ |/$$$$$$$ |  $$ |/  |$$$$$$$$/  //
  //    $$$/   $$    $$ |$$ |$$ |$$    $$ |$$    $$ |  $$  $$/ $$       | //
  //     $/     $$$$$$$/ $$/ $$/  $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$$/  //
  //                                                                      //
  //////////////////////////////////////////////////////////////////////////

  assertNumberCsv(): asserts this is Csv<number> {
    assert(this.dataType() === "number", "Must be csv data type number");
  }

  assertStringCsv(): asserts this is Csv<string> {
    assert(this.dataType() === "string", "Must be csv data type string");
  }

  validate() {
    if (this._colHeaders instanceof Array) {
      assert(
        this._aoa.length === 0 ||
          this._colHeaders.length === this._aoa[0].length,
      );
      assertUnique(this._colHeaders);
    }
    if (this._rowHeaders instanceof Array) {
      assert(this._rowHeaders.length === this._aoa.length);
      assertUnique(this._rowHeaders);
    }
  }

  validateColIndex(colIndex: number) {
    if (colIndex < 0 || colIndex >= this.nCols()) {
      throw new Error("Col index is not right for this csv: " + colIndex);
    }
  }

  validateColHeader(colHeader: string) {
    if (!this.colHeadersOrThrowIfNone().includes(colHeader)) {
      throw new Error("Col header does not exist in this csv: " + colHeader);
    }
  }

  validateRowIndex(rowIndex: number) {
    if (rowIndex < 0 || rowIndex >= this.nRows()) {
      throw new Error("Row index is not right for this csv");
    }
  }

  validateRowHeader(rowHeader: string) {
    if (!this.rowHeadersOrThrowIfNone().includes(rowHeader)) {
      throw new Error("Row header does not exist in this csv: " + rowHeader);
    }
  }

  /////////////////////////////////////////////////////////////////////
  //  __       __              __                  __                //
  // /  \     /  |            /  |                /  |               //
  // $$  \   /$$ | __    __  _$$ |_     ______   _$$ |_     ______   //
  // $$$  \ /$$$ |/  |  /  |/ $$   |   /      \ / $$   |   /      \  //
  // $$$$  /$$$$ |$$ |  $$ |$$$$$$/    $$$$$$  |$$$$$$/   /$$$$$$  | //
  // $$ $$ $$/$$ |$$ |  $$ |  $$ | __  /    $$ |  $$ | __ $$    $$ | //
  // $$ |$$$/ $$ |$$ \__$$ |  $$ |/  |/$$$$$$$ |  $$ |/  |$$$$$$$$/  //
  // $$ | $/  $$ |$$    $$/   $$  $$/ $$    $$ |  $$  $$/ $$       | //
  // $$/      $$/  $$$$$$/     $$$$/   $$$$$$$/    $$$$/   $$$$$$$/  //
  //                                                                 //
  /////////////////////////////////////////////////////////////////////

  MUTATE_updateColHeaders(newColHeaders: string[] | "none") {
    if (newColHeaders === "none") {
      this._colHeaders = "none";
    } else {
      assert(
        this.nRows() === 0 || this.nCols() === newColHeaders.length,
        "New col headers not correct length",
      );
      this._colHeaders = [...newColHeaders];
    }
    this.validate();
  }

  withUpdatedColHeaders(newColHeaders: string[] | "none"): Csv<T> {
    const newCsv = this.getCopy();
    newCsv.MUTATE_updateColHeaders(newColHeaders);
    return newCsv;
  }

  withMappedColHeaders(
    func: (colHeader: string, i_colHeader: number) => string,
  ): Csv<T> {
    const newCsv = this.getCopy();
    const colHeaders = this.colHeadersOrThrowIfNone();
    newCsv.MUTATE_updateColHeaders(colHeaders.map(func));
    return newCsv;
  }

  MUTATE_updateRowHeaders(newRowHeaders: string[] | "none") {
    if (newRowHeaders === "none") {
      this._rowHeaders = "none";
    } else {
      assert(
        this.nRows() === newRowHeaders.length,
        "New row headers not correct length",
      );
      this._rowHeaders = [...newRowHeaders];
    }
    this.validate();
  }

  withUpdatedRowHeaders(newRowHeaders: string[] | "none"): Csv<T> {
    const newCsv = this.getCopy();
    newCsv.MUTATE_updateRowHeaders(newRowHeaders);
    return newCsv;
  }

  withMappedRowHeaders(
    func: (rowHeader: string, i_rowHeader: number) => string,
  ): Csv<T> {
    const newCsv = this.getCopy();
    const rowHeaders = this.rowHeadersOrThrowIfNone();
    newCsv.MUTATE_updateRowHeaders(rowHeaders.map(func));
    return newCsv;
  }

  withColAsRowHeaders(colNumberOrHeader: number | string): Csv<T> {
    assert(this._rowHeaders === "none", "Already has row headers");
    const newRowHeaders = this.getColVals(colNumberOrHeader).map(String);
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    const newColHeaders = this._colHeaders === "none"
      ? "none"
      : this._colHeaders.filter((_, i) => i !== colIndex);
    const newCsv = new Csv({
      rowHeaders: newRowHeaders,
      colHeaders: newColHeaders,
      aoa: this._aoa.map((row) => row.filter((_, i) => i !== colIndex)),
    });
    newCsv.validate();
    return newCsv;
  }

  MUTATE_updateCol(
    colNumberOrHeader: number | string,
    mapFunc: (cell: T, row: T[], csv: Csv<T>) => T,
  ) {
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    this._aoa.forEach((row) => {
      row[colIndex] = mapFunc(row[colIndex], row, this);
    });
    this.validate();
  }

  //////////////////////////////////////////////////////////////////////////////////////
  //   ______         __        __                                                    //
  //  /      \       /  |      /  |                                                   //
  // /$$$$$$  |  ____$$ |  ____$$ |        ______    ______   __   __   __   _______  //
  // $$ |__$$ | /    $$ | /    $$ |       /      \  /      \ /  | /  | /  | /       | //
  // $$    $$ |/$$$$$$$ |/$$$$$$$ |      /$$$$$$  |/$$$$$$  |$$ | $$ | $$ |/$$$$$$$/  //
  // $$$$$$$$ |$$ |  $$ |$$ |  $$ |      $$ |  $$/ $$ |  $$ |$$ | $$ | $$ |$$      \  //
  // $$ |  $$ |$$ \__$$ |$$ \__$$ |      $$ |      $$ \__$$ |$$ \_$$ \_$$ | $$$$$$  | //
  // $$ |  $$ |$$    $$ |$$    $$ |      $$ |      $$    $$/ $$   $$   $$/ /     $$/  //
  // $$/   $$/  $$$$$$$/  $$$$$$$/       $$/        $$$$$$/   $$$$$/$$$$/  $$$$$$$/   //
  //                                                                                  //
  //////////////////////////////////////////////////////////////////////////////////////

  MUTATE_addRow(rowOrRowVal: T | T[], rowHeader?: string): void {
    if (
      rowOrRowVal instanceof Array &&
      (this.nRows() > 0 || this._colHeaders !== "none") &&
      rowOrRowVal.length !== this.nCols()
    ) {
      throw new Error("New row not equal in length to csv number of cols");
    }
    if (rowHeader === undefined) {
      if (this._rowHeaders !== "none") {
        throw new Error("Csv needs row header");
      }
    } else {
      if (this._rowHeaders === "none") {
        if (this.nRows() > 0) {
          throw new Error("Csv does not have row headers");
        } else {
          this._rowHeaders = [];
        }
      }
      this._rowHeaders.push(rowHeader);
    }
    if (rowOrRowVal instanceof Array) {
      this._aoa.push([...rowOrRowVal]);
    } else {
      this._aoa.push(
        new Array(this.nCols()).fill(0).map(() => structuredClone(rowOrRowVal)),
      );
    }
    this.validate();
  }

  withAddedRow(rowOrRowVal: T | T[], rowHeader?: string): Csv<T> {
    const newCsv = this.getCopy();
    newCsv.MUTATE_addRow(rowOrRowVal, rowHeader);
    return newCsv;
  }

  MUTATE_addRows(
    nRows: number,
    func: (index: number) => { row: T[]; rowHeader?: string },
  ): void {
    createArray(nRows).forEach((index) => {
      const v = func(index);
      if (
        (this.nRows() > 0 || this._colHeaders !== "none") &&
        v.row.length !== this.nCols()
      ) {
        throw new Error("New row not equal in length to csv number of cols");
      }
      if (v.rowHeader === undefined) {
        if (this._rowHeaders !== "none") {
          throw new Error("Csv needs row header");
        }
      } else {
        if (this._rowHeaders === "none") {
          if (this.nRows() > 0) {
            throw new Error("Csv does not have row headers");
          } else {
            this._rowHeaders = [];
          }
        }
        this._rowHeaders.push(v.rowHeader);
      }
      this._aoa.push([...v.row]);
    });
    this.validate();
  }

  withAddedRows(
    nRows: number,
    func: (index: number) => { row: T[]; rowHeader?: string },
  ): Csv<T> {
    const newCsv = this.getCopy();
    newCsv.MUTATE_addRows(nRows, func);
    return newCsv;
  }

  ////////////////////////////////////////////////////////////////////////////
  //   ______         __        __                            __            //
  //  /      \       /  |      /  |                          /  |           //
  // /$$$$$$  |  ____$$ |  ____$$ |        _______   ______  $$ |  _______  //
  // $$ |__$$ | /    $$ | /    $$ |       /       | /      \ $$ | /       | //
  // $$    $$ |/$$$$$$$ |/$$$$$$$ |      /$$$$$$$/ /$$$$$$  |$$ |/$$$$$$$/  //
  // $$$$$$$$ |$$ |  $$ |$$ |  $$ |      $$ |      $$ |  $$ |$$ |$$      \  //
  // $$ |  $$ |$$ \__$$ |$$ \__$$ |      $$ \_____ $$ \__$$ |$$ | $$$$$$  | //
  // $$ |  $$ |$$    $$ |$$    $$ |      $$       |$$    $$/ $$ |/     $$/  //
  // $$/   $$/  $$$$$$$/  $$$$$$$/        $$$$$$$/  $$$$$$/  $$/ $$$$$$$/   //
  //                                                                        //
  ////////////////////////////////////////////////////////////////////////////

  MUTATE_addCol(colOrColVal: T | T[], colHeader?: string): void {
    if (colOrColVal instanceof Array && colOrColVal.length !== this.nRows()) {
      throw new Error("New cols not equal in length to csv number of rows");
    }
    if (colHeader === undefined) {
      if (this._colHeaders !== "none") {
        throw new Error("Csv needs col header");
      }
    } else {
      if (this._colHeaders === "none") {
        if (this.nCols() > 0) {
          throw new Error("Csv does not have col headers");
        } else {
          this._colHeaders = [];
        }
      }
      this._colHeaders.push(colHeader);
    }
    this._aoa.forEach((row, i_row) => {
      row.push(colOrColVal instanceof Array ? colOrColVal[i_row] : colOrColVal);
    });
    this.validate();
  }

  withAddedCol(colOrColVal: T | T[], colHeader?: string): Csv<T> {
    const newCsv = this.getCopy();
    newCsv.MUTATE_addCol(colOrColVal, colHeader);
    return newCsv;
  }

  withTotalRow(): Csv<number> {
    this.assertNumberCsv();
    const totalRow = (this as Csv<number>)
      .collapseAllAsNumbers(sum)
      .withUpdatedRowHeaders(["Total"]);
    return (this as Csv<number>).joinRowsWithMatchedColHeaders(totalRow);
  }

  withTotalRowAndColumn(): Csv<number> {
    this.assertNumberCsv();
    const totalRow = (this as Csv<number>)
      .collapseAllAsNumbers(sum)
      .withUpdatedRowHeaders(["Total"]);
    const finalCsv = (this as Csv<number>).joinRowsWithMatchedColHeaders(
      totalRow,
    );
    const rowTotals = finalCsv.getRowsAsMappedArray((row) => sum(row));
    return finalCsv.withAddedCol(rowTotals, "Total");
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  _______                                                                                   __            //
  // /       \                                                                                 /  |           //
  // $$$$$$$  |  ______   _____  ____    ______   __     __  ______          _______   ______  $$ |  _______  //
  // $$ |__$$ | /      \ /     \/    \  /      \ /  \   /  |/      \        /       | /      \ $$ | /       | //
  // $$    $$< /$$$$$$  |$$$$$$ $$$$  |/$$$$$$  |$$  \ /$$//$$$$$$  |      /$$$$$$$/ /$$$$$$  |$$ |/$$$$$$$/  //
  // $$$$$$$  |$$    $$ |$$ | $$ | $$ |$$ |  $$ | $$  /$$/ $$    $$ |      $$ |      $$ |  $$ |$$ |$$      \  //
  // $$ |  $$ |$$$$$$$$/ $$ | $$ | $$ |$$ \__$$ |  $$ $$/  $$$$$$$$/       $$ \_____ $$ \__$$ |$$ | $$$$$$  | //
  // $$ |  $$ |$$       |$$ | $$ | $$ |$$    $$/    $$$/   $$       |      $$       |$$    $$/ $$ |/     $$/  //
  // $$/   $$/  $$$$$$$/ $$/  $$/  $$/  $$$$$$/      $/     $$$$$$$/        $$$$$$$/  $$$$$$/  $$/ $$$$$$$/   //
  //                                                                                                          //
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////

  MUTATE_removeCol(colNumberOrHeader: number | string): void {
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    if (this._colHeaders !== "none") {
      this._colHeaders = this._colHeaders.filter((_, i) => i !== colIndex);
    }
    this._aoa = this._aoa.map((row) => {
      return row.filter((_, i) => i !== colIndex);
    });
    this.validate();
  }

  withRemovedCol(colNumberOrHeader: number | string): Csv<T> {
    const newCsv = this.getCopy();
    newCsv.MUTATE_removeCol(colNumberOrHeader);
    return newCsv;
  }

  ////////////////////////////////////////////////////////////////////////////
  //   ______               __                                __            //
  //  /      \             /  |                              /  |           //
  // /$$$$$$  |  ______   _$$ |_          __     __  ______  $$ |  _______  //
  // $$ | _$$/  /      \ / $$   |        /  \   /  |/      \ $$ | /       | //
  // $$ |/    |/$$$$$$  |$$$$$$/         $$  \ /$$/ $$$$$$  |$$ |/$$$$$$$/  //
  // $$ |$$$$ |$$    $$ |  $$ | __        $$  /$$/  /    $$ |$$ |$$      \  //
  // $$ \__$$ |$$$$$$$$/   $$ |/  |        $$ $$/  /$$$$$$$ |$$ | $$$$$$  | //
  // $$    $$/ $$       |  $$  $$/          $$$/   $$    $$ |$$ |/     $$/  //
  //  $$$$$$/   $$$$$$$/    $$$$/            $/     $$$$$$$/ $$/ $$$$$$$/   //
  //                                                                        //
  ////////////////////////////////////////////////////////////////////////////

  getCellVal(
    colNumberOrHeader: number | string,
    rowNumberOrHeader: number | string,
  ): T {
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    const rowIndex = this.getHeaderIndex(rowNumberOrHeader, "rows");
    const val = this._aoa[rowIndex][colIndex];
    assertNotUndefined(val, "Cell value is undefined for some reason");
    return val;
  }

  getCellValRowFilterFunc(
    colNumberOrHeader: number | string,
    rowIndexFindIndexFunc: RowFilterFunc<T>,
  ): T {
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    const rowIndex = this._aoa.findIndex((row, i_row) =>
      rowIndexFindIndexFunc(row, i_row, this)
    );
    assert(rowIndex !== -1, "Can't find row");
    const val = this._aoa[rowIndex][colIndex];
    assertNotUndefined(val, "Cell value is undefined for some reason");
    return val;
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //   ______               __                                __                                                                   //
  //  /      \             /  |                              /  |                                                                  //
  // /$$$$$$  |  ______   _$$ |_           _______   ______  $$ |        ______    ______    ______   ______   __    __   _______  //
  // $$ | _$$/  /      \ / $$   |         /       | /      \ $$ |       /      \  /      \  /      \ /      \ /  |  /  | /       | //
  // $$ |/    |/$$$$$$  |$$$$$$/         /$$$$$$$/ /$$$$$$  |$$ |       $$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$  |$$ |  $$ |/$$$$$$$/  //
  // $$ |$$$$ |$$    $$ |  $$ | __       $$ |      $$ |  $$ |$$ |       /    $$ |$$ |  $$/ $$ |  $$/ /    $$ |$$ |  $$ |$$      \  //
  // $$ \__$$ |$$$$$$$$/   $$ |/  |      $$ \_____ $$ \__$$ |$$ |      /$$$$$$$ |$$ |      $$ |     /$$$$$$$ |$$ \__$$ | $$$$$$  | //
  // $$    $$/ $$       |  $$  $$/       $$       |$$    $$/ $$ |      $$    $$ |$$ |      $$ |     $$    $$ |$$    $$ |/     $$/  //
  //  $$$$$$/   $$$$$$$/    $$$$/         $$$$$$$/  $$$$$$/  $$/        $$$$$$$/ $$/       $$/       $$$$$$$/  $$$$$$$ |$$$$$$$/   //
  //                                                                                                          /  \__$$ |           //
  //                                                                                                          $$    $$/            //
  //                                                                                                           $$$$$$/             //
  //                                                                                                                               //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  getColVals(colNumberOrHeader: number | string): T[] {
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    return this._aoa.map((row) => row[colIndex]);
  }

  getColValsWithFilter(
    colNumberOrHeader: number | string,
    filterFunc: RowFilterFunc<T>,
  ): T[] {
    const colIndex = this.getHeaderIndex(colNumberOrHeader, "cols");
    return this._aoa
      .filter((row, i_row) => filterFunc(row, i_row, this))
      .map((row) => row[colIndex]);
  }

  getColValsAsUniqueAndSortedArrayOfStrings(
    colNumberOrHeader: number | string,
  ): string[] {
    assert(this.dataType() === "string", "Must be csv data type of string");
    return getSortedAlphabetical(
      getUnique(this.getColVals(colNumberOrHeader) as string[]),
    );
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //   ______               __                                                                                                     //
  //  /      \             /  |                                                                                                    //
  // /$$$$$$  |  ______   _$$ |_           ______    ______   __   __   __         ______    ______    ______   ______   __    __  //
  // $$ | _$$/  /      \ / $$   |         /      \  /      \ /  | /  | /  |       /      \  /      \  /      \ /      \ /  |  /  | //
  // $$ |/    |/$$$$$$  |$$$$$$/         /$$$$$$  |/$$$$$$  |$$ | $$ | $$ |       $$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$  |$$ |  $$ | //
  // $$ |$$$$ |$$    $$ |  $$ | __       $$ |  $$/ $$ |  $$ |$$ | $$ | $$ |       /    $$ |$$ |  $$/ $$ |  $$/ /    $$ |$$ |  $$ | //
  // $$ \__$$ |$$$$$$$$/   $$ |/  |      $$ |      $$ \__$$ |$$ \_$$ \_$$ |      /$$$$$$$ |$$ |      $$ |     /$$$$$$$ |$$ \__$$ | //
  // $$    $$/ $$       |  $$  $$/       $$ |      $$    $$/ $$   $$   $$/       $$    $$ |$$ |      $$ |     $$    $$ |$$    $$ | //
  //  $$$$$$/   $$$$$$$/    $$$$/        $$/        $$$$$$/   $$$$$/$$$$/         $$$$$$$/ $$/       $$/       $$$$$$$/  $$$$$$$ | //
  //                                                                                                                    /  \__$$ | //
  //                                                                                                                    $$    $$/  //
  //                                                                                                                     $$$$$$/   //
  //                                                                                                                               //
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  getRowVals(rowNumberOrHeader: number | string): T[] {
    const colIndex = this.getHeaderIndex(rowNumberOrHeader, "rows");
    return [...this._aoa[colIndex]];
  }

  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //   ______               __                                                    __                                //
  //  /      \             /  |                                                  /  |                               //
  // /$$$$$$  |  ______   _$$ |_          __     __  ______    ______    _______ $$/   ______   _______    _______  //
  // $$ | _$$/  /      \ / $$   |        /  \   /  |/      \  /      \  /       |/  | /      \ /       \  /       | //
  // $$ |/    |/$$$$$$  |$$$$$$/         $$  \ /$$//$$$$$$  |/$$$$$$  |/$$$$$$$/ $$ |/$$$$$$  |$$$$$$$  |/$$$$$$$/  //
  // $$ |$$$$ |$$    $$ |  $$ | __        $$  /$$/ $$    $$ |$$ |  $$/ $$      \ $$ |$$ |  $$ |$$ |  $$ |$$      \  //
  // $$ \__$$ |$$$$$$$$/   $$ |/  |        $$ $$/  $$$$$$$$/ $$ |       $$$$$$  |$$ |$$ \__$$ |$$ |  $$ | $$$$$$  | //
  // $$    $$/ $$       |  $$  $$/          $$$/   $$       |$$ |      /     $$/ $$ |$$    $$/ $$ |  $$ |/     $$/  //
  //  $$$$$$/   $$$$$$$/    $$$$/            $/     $$$$$$$/ $$/       $$$$$$$/  $$/  $$$$$$/  $$/   $$/ $$$$$$$/   //
  //                                                                                                                //
  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  getCopy(): Csv<T> {
    return new Csv(this);
  }

  getAsObject(): {
    colHeaders: "none" | string[];
    rowHeaders: "none" | string[];
    aoa: T[][];
  } {
    return {
      colHeaders: this.colHeaders(),
      rowHeaders: this.rowHeaders(),
      aoa: this.aoa(),
    };
  }

  getNumbers(): Csv<number> {
    return this.getMappedCells(getValidNumberOrThrowError);
  }

  getStrings(): Csv<string> {
    return this.getMappedCells(String);
  }

  getMappedCells<R>(
    func: (cell: T, i_row: number, i_pane: number, csv: Csv<T>) => R,
  ): Csv<R> {
    return new Csv<R>({
      colHeaders: this.colHeaders(),
      rowHeaders: this.rowHeaders(),
      aoa: this._aoa.map((row, i_row) =>
        row.map((cell, i_pane) => func(cell, i_row, i_pane, this))
      ),
    });
  }

  getMappedRows<R>(
    func: (row: T[], i_row: number, csv: Csv<T>) => R[],
  ): Csv<R> {
    return new Csv<R>({
      colHeaders: this.colHeaders(),
      rowHeaders: this.rowHeaders(),
      aoa: this._aoa.map((row, i_row) => {
        const newRow = func(row, i_row, this);
        assert(
          newRow.length === row.length,
          "Rows must be the same length as original",
        );
        return newRow;
      }),
    });
  }

  getCompleteAoA(colHeaderForNewFirstCol?: string): (T | string)[][] {
    if (this._colHeaders === "none" && colHeaderForNewFirstCol !== undefined) {
      throw new Error(
        "There are no col headers, so don't need the function argument colHeaderForNewFirstCol",
      );
    }

    const hasColHeaders = this._colHeaders !== "none";
    const hasRowHeaders = this._rowHeaders !== "none";

    // Calculate dimensions
    const totalRows = this._aoa.length + (hasColHeaders ? 1 : 0);
    const totalCols = (this._aoa[0]?.length || 0) + (hasRowHeaders ? 1 : 0);

    // Pre-allocate result array
    const result: (T | string)[][] = new Array(totalRows);

    // Build result in a single pass
    let resultRowIndex = 0;

    // Add column headers row if needed
    if (hasColHeaders) {
      const headerRow: (T | string)[] = new Array(totalCols);
      let colIndex = 0;

      if (hasRowHeaders) {
        headerRow[colIndex++] = colHeaderForNewFirstCol ?? "";
      }

      const colHeaders = this._colHeaders as string[];
      for (let i = 0; i < colHeaders.length; i++) {
        headerRow[colIndex++] = colHeaders[i];
      }

      result[resultRowIndex++] = headerRow;
    }

    // Add data rows
    for (let i = 0; i < this._aoa.length; i++) {
      const sourceRow = this._aoa[i];
      const resultRow: (T | string)[] = new Array(totalCols);
      let colIndex = 0;

      if (hasRowHeaders) {
        resultRow[colIndex++] = (this._rowHeaders as string[])[i];
      }

      for (let j = 0; j < sourceRow.length; j++) {
        resultRow[colIndex++] = sourceRow[j];
      }

      result[resultRowIndex++] = resultRow;
    }

    return result;
  }

  //////////////////////////////////////////////////////////////////////////////////
  //   ______    __                __                      __   ______            //
  //  /      \  /  |              /  |                    /  | /      \           //
  // /$$$$$$  |_$$ |_     ______  $$/  _______    ______  $$/ /$$$$$$  |__    __  //
  // $$ \__$$// $$   |   /      \ /  |/       \  /      \ /  |$$ |_ $$//  |  /  | //
  // $$      \$$$$$$/   /$$$$$$  |$$ |$$$$$$$  |/$$$$$$  |$$ |$$   |   $$ |  $$ | //
  //  $$$$$$  | $$ | __ $$ |  $$/ $$ |$$ |  $$ |$$ |  $$ |$$ |$$$$/    $$ |  $$ | //
  // /  \__$$ | $$ |/  |$$ |      $$ |$$ |  $$ |$$ \__$$ |$$ |$$ |     $$ \__$$ | //
  // $$    $$/  $$  $$/ $$ |      $$ |$$ |  $$ |$$    $$ |$$ |$$ |     $$    $$ | //
  //  $$$$$$/    $$$$/  $$/       $$/ $$/   $$/  $$$$$$$ |$$/ $$/       $$$$$$$ | //
  //                                            /  \__$$ |             /  \__$$ | //
  //                                            $$    $$/              $$    $$/  //
  //                                             $$$$$$/                $$$$$$/   //
  //                                                                              //
  //////////////////////////////////////////////////////////////////////////////////

  stringify(options?: StringifyOptions): string {
    return stringifyCsv(this.getCompleteAoA(), options);
  }

  //////////////////////////////////////////////
  //     _____                                //
  //    /     |                               //
  //    $$$$$ |  _______   ______   _______   //
  //       $$ | /       | /      \ /       \  //
  //  __   $$ |/$$$$$$$/ /$$$$$$  |$$$$$$$  | //
  // /  |  $$ |$$      \ $$ |  $$ |$$ |  $$ | //
  // $$ \__$$ | $$$$$$  |$$ \__$$ |$$ |  $$ | //
  // $$    $$/ /     $$/ $$    $$/ $$ |  $$ | //
  //  $$$$$$/  $$$$$$$/   $$$$$$/  $$/   $$/  //
  //                                          //
  //////////////////////////////////////////////

  getAsObjectArray(colHeadersToTake?: string[]): Record<string, T>[] {
    if (this._colHeaders === "none") {
      throw new Error("Need col headers to get as json array");
    }
    const colHeaders = colHeadersToTake?.map((colHeader) => {
      if (!this._colHeaders.includes(colHeader)) {
        throw new Error("No header in this csv called " + colHeader);
      }
      return colHeader;
    }) ?? this.colHeadersOrThrowIfNone();
    return this.aoa().map<Record<string, T>>((row) => {
      return colHeaders.reduce<Record<string, T>>((obj, colHeader, i_col) => {
        obj[colHeader] = row[i_col];
        return obj;
      }, {});
    });
  }

  getRowsAsMappedArray<R>(
    func: (row: T[], i_row: number, csv: Csv<T>) => R,
  ): R[] {
    return this.aoa().map<R>((row, i_row) => func(row, i_row, this));
  }

  getSingleRowAsObjectWithColHeadersAsProps(
    rowNumberOrHeader: number | string | RowFindFunc<T>,
  ): Record<string, T> {
    const rowIndex = this.getRowHeaderIndex(rowNumberOrHeader);
    return this.colHeadersOrThrowIfNone().reduce<Record<string, T>>(
      (obj, colHeader, i_col) => {
        obj[colHeader] = this._aoa[rowIndex][i_col];
        return obj;
      },
      {},
    );
  }

  getSingleColAsObjectWithRowHeadersAsProps(
    colNumberOrHeader: number | string,
  ): Record<string, T> {
    const colIndex = this.getColHeaderIndex(colNumberOrHeader);
    return this.rowHeadersOrThrowIfNone().reduce<Record<string, T>>(
      (obj, rowHeader, i_row) => {
        obj[rowHeader] = this._aoa[i_row][colIndex];
        return obj;
      },
      {},
    );
  }

  getAsObjectWithRowHeadersAsProps<R>(
    func: (row: T[], i_row: number, csv: Csv<T>) => R,
  ): Record<string, R> {
    if (this._rowHeaders === "none") {
      throw new Error("Need row headers to get as object");
    }
    return this.aoa().reduce<Record<string, R>>((obj, row, i_row) => {
      const rowHeader = this.rowHeadersOrThrowIfNone()[i_row];
      obj[rowHeader] = func(row, i_row, this);
      return obj;
    }, {});
  }

  getAsNestedObjectWithRowHeadersAsFirstLevelPropsAndColHeadersAsSecondLevelProps(): Record<
    string,
    Record<string, T>
  > {
    return this.getAsObjectWithRowHeadersAsProps((_, i_row, csv) => {
      return csv.getSingleRowAsObjectWithColHeadersAsProps(i_row + 1);
    });
  }

  ////////////////////////////////////////////////////////////////////////////////////////////
  //  ________                                                                              //
  // /        |                                                                             //
  // $$$$$$$$/______   ______   _______    _______   ______    ______    _______   ______   //
  //    $$ | /      \ /      \ /       \  /       | /      \  /      \  /       | /      \  //
  //    $$ |/$$$$$$  |$$$$$$  |$$$$$$$  |/$$$$$$$/ /$$$$$$  |/$$$$$$  |/$$$$$$$/ /$$$$$$  | //
  //    $$ |$$ |  $$/ /    $$ |$$ |  $$ |$$      \ $$ |  $$ |$$ |  $$ |$$      \ $$    $$ | //
  //    $$ |$$ |     /$$$$$$$ |$$ |  $$ | $$$$$$  |$$ |__$$ |$$ \__$$ | $$$$$$  |$$$$$$$$/  //
  //    $$ |$$ |     $$    $$ |$$ |  $$ |/     $$/ $$    $$/ $$    $$/ /     $$/ $$       | //
  //    $$/ $$/       $$$$$$$/ $$/   $$/ $$$$$$$/  $$$$$$$/   $$$$$$/  $$$$$$$/   $$$$$$$/  //
  //                                               $$ |                                     //
  //                                               $$ |                                     //
  //                                               $$/                                      //
  //                                                                                        //
  ////////////////////////////////////////////////////////////////////////////////////////////

  getTransposed(transpose?: boolean): Csv<T> {
    if (transpose === false) {
      return this.getCopy();
    }
    if (this._aoa.length === 0) {
      throw new Error("CSV has no rows");
    }
    return new Csv({
      aoa: this._aoa[0].map((_, i) => this._aoa.map((row) => row[i])),
      colHeaders: this.rowHeaders(),
      rowHeaders: this.colHeaders(),
    });
  }

  ////////////////////////////////////////////////////////////
  //   ______             __                        __      //
  //  /      \           /  |                      /  |     //
  // /$$$$$$  |  ______  $$ |  ______    _______  _$$ |_    //
  // $$ \__$$/  /      \ $$ | /      \  /       |/ $$   |   //
  // $$      \ /$$$$$$  |$$ |/$$$$$$  |/$$$$$$$/ $$$$$$/    //
  //  $$$$$$  |$$    $$ |$$ |$$    $$ |$$ |        $$ | __  //
  // /  \__$$ |$$$$$$$$/ $$ |$$$$$$$$/ $$ \_____   $$ |/  | //
  // $$    $$/ $$       |$$ |$$       |$$       |  $$  $$/  //
  //  $$$$$$/   $$$$$$$/ $$/  $$$$$$$/  $$$$$$$/    $$$$/   //
  //                                                        //
  ////////////////////////////////////////////////////////////

  getSelectedCols(colsToTake: number[] | string[] | undefined): Csv<T> {
    if (colsToTake === undefined || colsToTake.length === 0) {
      return this.getCopy();
    }
    const colIndexesToTake = this.getColHeaderIndexes(colsToTake);
    colIndexesToTake.forEach((colIndex) => this.validateColIndex(colIndex));
    return new Csv({
      aoa: this._aoa.map((row) => {
        return colIndexesToTake.map((i_col) => row[i_col]);
      }),
      colHeaders: this._colHeaders === "none"
        ? "none"
        : colIndexesToTake.map((i_col) => this._colHeaders[i_col]),
      rowHeaders: this.rowHeaders(),
    });
  }

  getSelectedRows(
    rowsToTake: number[] | string[] | RowFilterFunc<T> | undefined,
  ): Csv<T> {
    if (rowsToTake === undefined || rowsToTake.length === 0) {
      return this.getCopy();
    }
    const rowIndexesToTake = this.getRowHeaderIndexes(rowsToTake);
    rowIndexesToTake.forEach((rowIndex) => this.validateRowIndex(rowIndex));
    return new Csv({
      aoa: rowIndexesToTake.map((i_row) => {
        return this._aoa[i_row].map((cell) => cell);
      }),
      colHeaders: this.colHeaders(),
      rowHeaders: this._rowHeaders === "none"
        ? "none"
        : rowIndexesToTake.map((i_row) => this._rowHeaders[i_row]),
    });
  }

  //////////////////////////////////////////////
  //   ______                         __      //
  //  /      \                       /  |     //
  // /$$$$$$  |  ______    ______   _$$ |_    //
  // $$ \__$$/  /      \  /      \ / $$   |   //
  // $$      \ /$$$$$$  |/$$$$$$  |$$$$$$/    //
  //  $$$$$$  |$$ |  $$ |$$ |  $$/   $$ | __  //
  // /  \__$$ |$$ \__$$ |$$ |        $$ |/  | //
  // $$    $$/ $$    $$/ $$ |        $$  $$/  //
  //  $$$$$$/   $$$$$$/  $$/          $$$$/   //
  //                                          //
  //////////////////////////////////////////////

  getSortedRowsByCol(
    col: number | string | undefined,
    directionOrSortFunc?: "descending" | "ascending" | ((a: T, b: T) => number),
  ): Csv<T> {
    if (col === undefined) {
      return this.getCopy();
    }
    if (typeof col === "string" && this._colHeaders === "none") {
      throw new Error("Cannot sort by col header if col headers are none");
    }
    const colIndex = this.getHeaderIndex(col, "cols");
    const rowsIndexesToTake = this._aoa.map((_, i_row) => i_row);
    const sortFunc =
      directionOrSortFunc === undefined || directionOrSortFunc === "descending"
        ? (a: number, b: number) =>
          Number(this._aoa[b][colIndex]) - Number(this._aoa[a][colIndex])
        : directionOrSortFunc === "ascending"
        ? (a: number, b: number) =>
          Number(this._aoa[a][colIndex]) - Number(this._aoa[b][colIndex])
        : (a: number, b: number) =>
          directionOrSortFunc(this._aoa[a][colIndex], this._aoa[b][colIndex]);
    rowsIndexesToTake.sort(sortFunc);
    return this.getSelectedRows(rowsIndexesToTake.map((v) => v + 1));
  }

  getSortedColsByRow(
    row: number | string | undefined,
    directionOrSortFunc?: "descending" | "ascending" | ((a: T, b: T) => number),
  ): Csv<T> {
    if (row === undefined) {
      return this.getCopy();
    }
    if (typeof row === "string" && this._rowHeaders === "none") {
      throw new Error("Cannot sort by row header if row headers are none");
    }
    const rowIndex = this.getHeaderIndex(row, "rows");
    this.validateRowIndex(rowIndex);
    const colIndexesToTake = this._aoa[0].map((_, i_col) => i_col);
    const sortFunc =
      directionOrSortFunc === undefined || directionOrSortFunc === "descending"
        ? (a: number, b: number) =>
          Number(this._aoa[rowIndex][b]) - Number(this._aoa[rowIndex][a])
        : directionOrSortFunc === "ascending"
        ? (a: number, b: number) =>
          Number(this._aoa[rowIndex][a]) - Number(this._aoa[rowIndex][b])
        : (a: number, b: number) =>
          directionOrSortFunc(this._aoa[rowIndex][a], this._aoa[rowIndex][b]);
    colIndexesToTake.sort(sortFunc);
    return this.getSelectedCols(colIndexesToTake.map((v) => v + 1));
  }

  ////////////////////////////////////////////////////////
  //   ______                   __                      //
  //  /      \                 /  |                     //
  // /$$$$$$  |  ______    ____$$ |  ______    ______   //
  // $$ |  $$ | /      \  /    $$ | /      \  /      \  //
  // $$ |  $$ |/$$$$$$  |/$$$$$$$ |/$$$$$$  |/$$$$$$  | //
  // $$ |  $$ |$$ |  $$/ $$ |  $$ |$$    $$ |$$ |  $$/  //
  // $$ \__$$ |$$ |      $$ \__$$ |$$$$$$$$/ $$ |       //
  // $$    $$/ $$ |      $$    $$ |$$       |$$ |       //
  //  $$$$$$/  $$/        $$$$$$$/  $$$$$$$/ $$/        //
  //                                                    //
  ////////////////////////////////////////////////////////

  orderCols(colNumbersOrHeaders: string[] | number[]): Csv<T> {
    const specifiedIndexs = this.getColHeaderIndexes(colNumbersOrHeaders);
    const allColIndexes = createArray(this.nCols());
    const remainingColNumbers = allColIndexes.filter(
      (i) => !specifiedIndexs.includes(i),
    );
    const newNumbers = [...specifiedIndexs, ...remainingColNumbers].map(
      (i) => i + 1,
    );
    return this.getSelectedCols(newNumbers);
  }

  //////////////////////////////////////////////////////////////////////////
  //   ______             __  __                                          //
  //  /      \           /  |/  |                                         //
  // /$$$$$$  |  ______  $$ |$$ |  ______    ______    _______   ______   //
  // $$ |  $$/  /      \ $$ |$$ | /      \  /      \  /       | /      \  //
  // $$ |      /$$$$$$  |$$ |$$ | $$$$$$  |/$$$$$$  |/$$$$$$$/ /$$$$$$  | //
  // $$ |   __ $$ |  $$ |$$ |$$ | /    $$ |$$ |  $$ |$$      \ $$    $$ | //
  // $$ \__/  |$$ \__$$ |$$ |$$ |/$$$$$$$ |$$ |__$$ | $$$$$$  |$$$$$$$$/  //
  // $$    $$/ $$    $$/ $$ |$$ |$$    $$ |$$    $$/ /     $$/ $$       | //
  //  $$$$$$/   $$$$$$/  $$/ $$/  $$$$$$$/ $$$$$$$/  $$$$$$$/   $$$$$$$/  //
  //                                       $$ |                           //
  //                                       $$ |                           //
  //                                       $$/                            //
  //                                                                      //
  //////////////////////////////////////////////////////////////////////////

  collapseAllAsNumbers(
    reducerFunc: (filteredColValues: T[]) => number,
  ): Csv<number> {
    const newRow: number[] = [];
    const colHeaders = this.colHeadersOrThrowIfNone();
    colHeaders.forEach((colNumberOrHeader) => {
      const colVals = this.getColVals(colNumberOrHeader);
      const v = reducerFunc(colVals);
      newRow.push(v);
    });
    return new Csv<number>({
      colHeaders,
      rowHeaders: "none",
      aoa: [newRow],
    });
  }

  collapse(
    stratifierColNumbersOrHeaders: string[] | number[],
    reducerFuncs: {
      colNumbersOrHeaders: string[] | number[];
      reducerFunc: (filteredColValues: T[]) => string;
    }[],
  ): Csv<string> {
    const thisCsvColHeaders = this.colHeadersOrThrowIfNone();
    assert(
      stratifierColNumbersOrHeaders.length <= 2,
      "Cannot have more than two cols to aggregate by at present",
    );
    assert(this.dataType() === "string", "Must be csv data type string");
    const stratifierColIndexes = this.getColHeaderIndexes(
      stratifierColNumbersOrHeaders,
    );
    const uniqueStratifierVals = stratifierColIndexes.map((i_col) => {
      return this.getColValsAsUniqueAndSortedArrayOfStrings(i_col + 1);
    });
    const newColHeaders: string[] = [];
    newColHeaders.push(
      ...stratifierColIndexes.map((i_col) => thisCsvColHeaders[i_col]),
    );
    reducerFuncs.forEach((rf) => {
      const colIndexes = this.getColHeaderIndexes(rf.colNumbersOrHeaders);
      const colHeaders = colIndexes.map((i_col) => thisCsvColHeaders[i_col]);
      newColHeaders.push(...colHeaders);
    });
    const collapsedCsv = new Csv<string>({
      colHeaders: newColHeaders,
      rowHeaders: "none",
    });
    if (stratifierColIndexes.length === 0) {
      const newRow: string[] = [];
      reducerFuncs.forEach((rf) => {
        rf.colNumbersOrHeaders.forEach((colNumberOrHeader) => {
          const colVals = this.getColVals(colNumberOrHeader);
          const v = rf.reducerFunc(colVals);
          newRow.push(v);
        });
      });
      collapsedCsv._aoa.push(newRow);
      collapsedCsv.validate();
      return collapsedCsv;
    }
    if (stratifierColIndexes.length === 1) {
      const indexStrat0 = stratifierColIndexes[0];
      uniqueStratifierVals[0].forEach((strat0) => {
        const filterFunc = (row: T[]) => {
          return row[indexStrat0] === strat0;
        };
        const newRow: string[] = [strat0];
        reducerFuncs.forEach((rf) => {
          rf.colNumbersOrHeaders.forEach((colNumberOrHeader) => {
            const filteredVals = this.getColValsWithFilter(
              colNumberOrHeader,
              filterFunc,
            );
            const v = rf.reducerFunc(filteredVals);
            newRow.push(v);
          });
        });
        collapsedCsv._aoa.push(newRow);
      });
      collapsedCsv.validate();
      return collapsedCsv;
    }
    if (stratifierColIndexes.length === 2) {
      const indexStrat0 = stratifierColIndexes[0];
      const indexStrat1 = stratifierColIndexes[1];
      uniqueStratifierVals[0].forEach((strat0) => {
        uniqueStratifierVals[1].forEach((strat1) => {
          const filterFunc = (row: T[]) => {
            return row[indexStrat0] === strat0 && row[indexStrat1] === strat1;
          };
          const newRow: string[] = [strat0, strat1];
          reducerFuncs.forEach((rf) => {
            rf.colNumbersOrHeaders.forEach((colNumberOrHeader) => {
              const filteredVals = this.getColValsWithFilter(
                colNumberOrHeader,
                filterFunc,
              );
              const v = rf.reducerFunc(filteredVals);
              newRow.push(v);
            });
          });
          collapsedCsv._aoa.push(newRow);
        });
      });
      collapsedCsv.validate();
      return collapsedCsv;
    }
    throw new Error("Should not happen");
  }

  ////////////////////////////////////////
  //     _____            __            //
  //    /     |          /  |           //
  //    $$$$$ |  ______  $$/  _______   //
  //       $$ | /      \ /  |/       \  //
  //  __   $$ |/$$$$$$  |$$ |$$$$$$$  | //
  // /  |  $$ |$$ |  $$ |$$ |$$ |  $$ | //
  // $$ \__$$ |$$ \__$$ |$$ |$$ |  $$ | //
  // $$    $$/ $$    $$/ $$ |$$ |  $$ | //
  //  $$$$$$/   $$$$$$/  $$/ $$/   $$/  //
  //                                    //
  ////////////////////////////////////////

  joinColsWithRowsSameOrder(otherCsv: Csv<T>): Csv<T> {
    const otherCsvColHeaders = otherCsv.colHeaders();
    const otherCsvAoa = otherCsv.aoa();
    assert(
      this.nRows() === otherCsv.nRows(),
      "Csvs have different number of rows",
    );
    assert(
      this._colHeaders === "none" || otherCsvColHeaders !== "none",
      "If first csv has col headers, second csv must also have col headers",
    );
    const newColHeaders = otherCsvColHeaders === "none"
      ? "none"
      : [...this.colHeadersOrThrowIfNone(), ...otherCsvColHeaders];
    const newAoa = this._aoa.map((row, i_row) => {
      return [...row, ...otherCsvAoa[i_row]];
    });
    return new Csv<T>({
      colHeaders: newColHeaders,
      rowHeaders: this._rowHeaders,
      aoa: newAoa,
    });
  }

  joinColsWithMatchedRowHeaders(otherCsv: Csv<T>): Csv<T> {
    const otherCsvColHeaders = otherCsv.colHeaders();
    const otherCsvRowHeaders = otherCsv.rowHeaders();
    const otherCsvAoa = otherCsv.aoa();
    assert(
      this.nRows() === otherCsv.nRows(),
      "Csvs have different number of rows",
    );
    assert(
      this._colHeaders === "none" || otherCsvColHeaders !== "none",
      "If first csv has col headers, second csv must also have col headers",
    );
    assert(
      this._rowHeaders !== "none" && otherCsvRowHeaders !== "none",
      "Both csvs must have row headers",
    );
    const newColHeaders = otherCsvColHeaders === "none"
      ? "none"
      : [...this.colHeadersOrThrowIfNone(), ...otherCsvColHeaders];
    const thisCsvRowHeaders = this.rowHeadersOrThrowIfNone();
    const newAoa = this._aoa.map((row, i_row) => {
      const rowHeader = thisCsvRowHeaders[i_row];
      const otherCsvRowIndex = otherCsvRowHeaders.indexOf(rowHeader);
      assert(
        otherCsvRowIndex >= 0,
        `Row header in first csv (${rowHeader}) is not in second csv`,
      );
      return [...row, ...otherCsvAoa[otherCsvRowIndex]];
    });
    return new Csv<T>({
      colHeaders: newColHeaders,
      rowHeaders: this._rowHeaders,
      aoa: newAoa,
    });
  }

  joinRowsWithMatchedColHeaders(otherCsv: Csv<T>): Csv<T> {
    const otherCsvColHeaders = otherCsv.colHeaders();
    const otherCsvRowHeaders = otherCsv.rowHeaders();
    const otherCsvAoa = otherCsv.aoa();
    assert(
      this.nCols() === otherCsv.nCols(),
      "Csvs have different number of cols",
    );
    assert(
      this._rowHeaders === "none" || otherCsvRowHeaders !== "none",
      "If first csv has row headers, second csv must also have row headers",
    );
    assert(
      this._colHeaders !== "none" && otherCsvColHeaders !== "none",
      "Both csvs must have col headers",
    );
    const newRowHeaders = otherCsvRowHeaders === "none"
      ? "none"
      : [...this.rowHeadersOrThrowIfNone(), ...otherCsvRowHeaders];
    const thisCsvColHeaders = this.colHeadersOrThrowIfNone();
    const otherCsvColIndexes = thisCsvColHeaders.map((colHeader) => {
      const otherCsvColIndex = otherCsvColHeaders.indexOf(colHeader);
      assert(
        otherCsvColIndex >= 0,
        `Col header in first csv (${colHeader}) is not in second csv`,
      );
      return otherCsvColIndex;
    });
    const newAoa = [
      ...this._aoa,
      ...otherCsvAoa.map((row) => {
        return otherCsvColIndexes.map((ci) => row[ci]);
      }),
    ];
    return new Csv<T>({
      colHeaders: this._colHeaders,
      rowHeaders: newRowHeaders,
      aoa: newAoa,
    });
  }

  ////////////////////////////////////////////////////////////////////////////
  //  _______                       __                                      //
  // /       \                     /  |                                     //
  // $$$$$$$  |  ______    _______ $$ |____    ______    ______    ______   //
  // $$ |__$$ | /      \  /       |$$      \  /      \  /      \  /      \  //
  // $$    $$< /$$$$$$  |/$$$$$$$/ $$$$$$$  | $$$$$$  |/$$$$$$  |/$$$$$$  | //
  // $$$$$$$  |$$    $$ |$$      \ $$ |  $$ | /    $$ |$$ |  $$ |$$    $$ | //
  // $$ |  $$ |$$$$$$$$/  $$$$$$  |$$ |  $$ |/$$$$$$$ |$$ |__$$ |$$$$$$$$/  //
  // $$ |  $$ |$$       |/     $$/ $$ |  $$ |$$    $$ |$$    $$/ $$       | //
  // $$/   $$/  $$$$$$$/ $$$$$$$/  $$/   $$/  $$$$$$$/ $$$$$$$/   $$$$$$$/  //
  //                                                   $$ |                 //
  //                                                   $$ |                 //
  //                                                   $$/                  //
  //                                                                        //
  ////////////////////////////////////////////////////////////////////////////

  reshapeWide(
    colNumberOrHeaderFromWhichToCreateCols: number | string,
    colNumberOrHeaderFromWhichToCreateRows: number | string,
    colNumberOrHeaderForVals: number | string,
    missingValue?: T,
  ): Csv<T> {
    assert(this.dataType() === "string", "Must be csv data type of string");
    const colHeaderIndex = this.getColHeaderIndex(
      colNumberOrHeaderFromWhichToCreateCols,
    );
    const newColHeaders = this.getColValsAsUniqueAndSortedArrayOfStrings(
      colNumberOrHeaderFromWhichToCreateCols,
    );
    const rowHeaderIndex = this.getColHeaderIndex(
      colNumberOrHeaderFromWhichToCreateRows,
    );
    const newRowHeaders = this.getColValsAsUniqueAndSortedArrayOfStrings(
      colNumberOrHeaderFromWhichToCreateRows,
    );
    const valIndex = this.getColHeaderIndex(colNumberOrHeaderForVals);
    const newAoa = newRowHeaders.map((rowHeader) => {
      return newColHeaders.map((colHeader) => {
        const valRow = this._aoa.find(
          (row) =>
            row[rowHeaderIndex] === rowHeader &&
            row[colHeaderIndex] === colHeader,
        );
        const val = valRow?.[valIndex] ?? missingValue;
        assertNotUndefined(
          val,
          "Missing value for " + rowHeader + ", " + colHeader + ", " + valIndex,
        );
        return val;
      });
    });
    return new Csv<T>({
      colHeaders: newColHeaders,
      rowHeaders: newRowHeaders,
      aoa: newAoa,
    });
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  __    __                                            __                __              __                //
  // /  |  /  |                                          /  |              /  |            /  |               //
  // $$ |  $$ | _______    _______   ______    ______   _$$ |_     ______  $$/  _______   _$$ |_    __    __  //
  // $$ |  $$ |/       \  /       | /      \  /      \ / $$   |   /      \ /  |/       \ / $$   |  /  |  /  | //
  // $$ |  $$ |$$$$$$$  |/$$$$$$$/ /$$$$$$  |/$$$$$$  |$$$$$$/    $$$$$$  |$$ |$$$$$$$  |$$$$$$/   $$ |  $$ | //
  // $$ |  $$ |$$ |  $$ |$$ |      $$    $$ |$$ |  $$/   $$ | __  /    $$ |$$ |$$ |  $$ |  $$ | __ $$ |  $$ | //
  // $$ \__$$ |$$ |  $$ |$$ \_____ $$$$$$$$/ $$ |        $$ |/  |/$$$$$$$ |$$ |$$ |  $$ |  $$ |/  |$$ \__$$ | //
  // $$    $$/ $$ |  $$ |$$       |$$       |$$ |        $$  $$/ $$    $$ |$$ |$$ |  $$ |  $$  $$/ $$    $$ | //
  //  $$$$$$/  $$/   $$/  $$$$$$$/  $$$$$$$/ $$/          $$$$/   $$$$$$$/ $$/ $$/   $$/    $$$$/   $$$$$$$ | //
  //                                                                                               /  \__$$ | //
  //                                                                                               $$    $$/  //
  //                                                                                                $$$$$$/   //
  //                                                                                                          //
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////

  getWithPointEstimateBounds<
    T extends "none" | "from-adjacent-cols" | "from-adjacent-rows" | undefined,
    R = T extends undefined ? Csv<T> : Csv<PointEstimateBounds>,
  >(from: T): R {
    this.assertNumberCsv();
    if (from === undefined) {
      return this.getCopy() as R;
    }
    if (from === "none") {
      return this.getMappedCells((cell) => {
        return { pe: cell, lb: undefined, ub: undefined };
      }) as R;
    }
    if (from === "from-adjacent-cols") {
      assert(this.nRows() > 0, "AoA must have rows");
      const nFinalCols = this.nCols() / 3;
      assert(
        nFinalCols === Math.round(nFinalCols),
        "Bad number of cols to take uncertainty bounds. Must be factor of three.",
      );
      return new Csv({
        colHeaders: this._colHeaders === "none"
          ? "none"
          : createArray(nFinalCols, (i) => this._colHeaders[i * 3]),
        rowHeaders: this.rowHeaders(),
        aoa: this._aoa.map<PointEstimateBounds[]>((row) => {
          return createArray<PointEstimateBounds>(nFinalCols, (i) => {
            const pe = Number(row[i * 3]);
            const lb = Number(row[i * 3 + 1]);
            const ub = Number(row[i * 3 + 2]);
            assert(
              pe !== undefined && lb !== undefined && ub !== undefined,
              "Problem with undefined in point estimate bounds",
            );
            if (pe >= 0 && lb === -1 && ub === -1) {
              return { pe, lb: undefined, ub: undefined };
            }
            if (lb > pe) {
              console.log("Lower bounds is greater than point estimate");
              // throw new Error("Lower bounds is greater than point estimate");
            }
            if (ub < pe) {
              console.log("Upper bounds is less than point estimate");
              // throw new Error("Upper bounds is less than point estimate");
            }
            return { pe, lb, ub };
          });
        }),
      }) as R;
    }
    if (from === "from-adjacent-rows") {
      const nFinalRows = this.nRows() / 3;
      assert(
        nFinalRows === Math.round(nFinalRows),
        "Bad number of rows to take uncertainty bounds. Must be factor of three.",
      );
      return new Csv({
        colHeaders: this.colHeaders(),
        rowHeaders: this._rowHeaders === "none"
          ? "none"
          : createArray<string>(nFinalRows, (i) => this._rowHeaders[i * 3]),
        aoa: createArray<PointEstimateBounds[]>(nFinalRows, (i) => {
          const peRow = this._aoa[i * 3];
          const lbRow = this._aoa[i * 3 + 1];
          const ubRow = this._aoa[i * 3 + 2];
          return peRow.map<PointEstimateBounds>((cell, i_pane) => {
            const pe = Number(cell);
            const lb = Number(lbRow[i_pane]);
            const ub = Number(ubRow[i_pane]);
            assert(
              pe !== undefined && lb !== undefined && ub !== undefined,
              "Problem with undefined in point estimate bounds",
            );
            if (pe >= 0 && lb === -1 && ub === -1) {
              return { pe, lb: undefined, ub: undefined };
            }
            if (lb > pe) {
              console.log("Lower bounds is greater than point estimate");
              // throw new Error("Lower bounds is greater than point estimate");
            }
            if (ub < pe) {
              console.log("Upper bounds is less than point estimate");
              // throw new Error("Upper bounds is less than point estimate");
            }
            return { pe, lb, ub };
          });
        }),
      }) as R;
    }
    throw new Error("Should not be possible");
  }

  /////////////////////////////////////////////////////
  //  __       __            __    __                //
  // /  |  _  /  |          /  |  /  |               //
  // $$ | / \ $$ |  ______  $$/  _$$ |_     ______   //
  // $$ |/$  \$$ | /      \ /  |/ $$   |   /      \  //
  // $$ /$$$  $$ |/$$$$$$  |$$ |$$$$$$/   /$$$$$$  | //
  // $$ $$/$$ $$ |$$ |  $$/ $$ |  $$ | __ $$    $$ | //
  // $$$$/  $$$$ |$$ |      $$ |  $$ |/  |$$$$$$$$/  //
  // $$$/    $$$ |$$ |      $$ |  $$  $$/ $$       | //
  // $$/      $$/ $$/       $$/    $$$$/   $$$$$$$/  //
  //                                                 //
  /////////////////////////////////////////////////////

  print(nRows?: number): void {
    if (nRows === undefined) {
      console.log(this.stringify());
      return;
    }
    console.log(
      this.getSelectedRows(createArray(nRows, (i) => i + 1)).stringify(),
    );
  }

  write(writerFunc: (str: string) => void): void {
    writerFunc(this.stringify());
  }
}
