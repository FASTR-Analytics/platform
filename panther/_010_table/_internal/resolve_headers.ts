// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedTableStyle,
  TableHeaderInfo,
  TableHeaderInfoFunc,
  TableHeaderSampleN,
} from "../deps.ts";
import type { ResolvedTableHeaders, TableDataTransformed } from "../types.ts";
import {
  buildExcludedColIndices,
  buildExcludedRowIndices,
} from "./excluded_indices.ts";

type SliceCell = { value: number | undefined; excluded: boolean };

// Boundary guard for every nMatrix read: schema-parsed data legally carries
// null (JSON round-trip of undefined; zValueCell accepts it) and hand-authored
// data can carry NaN/Infinity — none of which may reach a digest or a
// TableCellInfo.sampleN typed `number`.
export function normalizeN(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function digestSlice(cells: SliceCell[]): TableHeaderSampleN | undefined {
  const included: number[] = [];
  for (const cell of cells) {
    if (!cell.excluded && cell.value !== undefined) {
      included.push(cell.value);
    }
  }
  if (included.length === 0) {
    return undefined;
  }
  let min = included[0];
  let max = included[0];
  for (const v of included) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return {
    first: included[0],
    min,
    max,
    varies: min !== max,
    slice: cells.map((c) => c.value),
  };
}

// The label-resolution prelude (plus sampleN digests) shared by BOTH measure
// entry points (measureTable and getMinComfortableWidth) and by the public
// resolveTableHeaders export. Must be pure and must NEVER mutate `d`:
// pre-transformed data reaches here by reference and the pipeline runs many
// times per autofit run — in-place resolution would re-apply the formatter.
export function resolveTableHeadersTransformed(
  d: TableDataTransformed,
  s: MergedTableStyle,
): ResolvedTableHeaders {
  const nRows = d.rowGroups.reduce((t, rg) => t + rg.rows.length, 0);
  const nCols = d.colGroups.reduce((t, cg) => t + cg.cols.length, 0);

  const rowSampleN: (TableHeaderSampleN | undefined)[] = [];
  const colSampleN: (TableHeaderSampleN | undefined)[] = [];
  const rowGroupSampleN: (TableHeaderSampleN | undefined)[] = [];
  const colGroupSampleN: (TableHeaderSampleN | undefined)[] = [];

  const nMatrix = d.nMatrix;
  if (nMatrix) {
    // Loud contract, matching aoa's own behaviour on shape mismatch: a
    // misaligned hand-authored/deserialized matrix must not render
    // plausible-looking wrong n values.
    if (
      nMatrix.length !== d.aoa.length ||
      nMatrix.some((row, i) => row.length !== d.aoa[i].length)
    ) {
      throw new Error(
        `nMatrix dimensions must match aoa (aoa ${d.aoa.length} rows)`,
      );
    }
    const excludedRows = buildExcludedRowIndices(
      d.rowGroups,
      d.liveDomainExcludeIds,
    );
    const excludedCols = buildExcludedColIndices(
      d.colGroups,
      d.liveDomainExcludeIds,
    );

    // Slices follow display order (groups flattened), which for hand-authored
    // data may differ from index order.
    const rowIndexOrder: number[] = [];
    for (const rg of d.rowGroups) {
      for (const row of rg.rows) {
        rowIndexOrder.push(row.index);
      }
    }
    const colIndexOrder: number[] = [];
    for (const cg of d.colGroups) {
      for (const col of cg.cols) {
        colIndexOrder.push(col.index);
      }
    }

    const colCells = (colIndex: number): SliceCell[] =>
      rowIndexOrder.map((ri) => ({
        value: normalizeN(nMatrix[ri]?.[colIndex]),
        excluded: excludedRows.has(ri),
      }));
    const rowCells = (rowIndex: number): SliceCell[] =>
      colIndexOrder.map((ci) => ({
        value: normalizeN(nMatrix[rowIndex]?.[ci]),
        excluded: excludedCols.has(ci),
      }));

    d.colGroups.forEach((cg, gi) => {
      for (const col of cg.cols) {
        colSampleN[col.index] = digestSlice(colCells(col.index));
      }
      colGroupSampleN[gi] = digestSlice(
        cg.cols.flatMap((col) => colCells(col.index)),
      );
    });
    d.rowGroups.forEach((rg, gi) => {
      for (const row of rg.rows) {
        rowSampleN[row.index] = digestSlice(rowCells(row.index));
      }
      rowGroupSampleN[gi] = digestSlice(
        rg.rows.flatMap((row) => rowCells(row.index)),
      );
    });
  }

  const colFormatter = s.tableColHeaders.textFormatter;
  const rowFormatter = s.tableRowHeaders.textFormatter;

  const resolveLabel = (
    formatter: TableHeaderInfoFunc<string> | "none",
    id: string | undefined,
    label: string,
    index: number | undefined,
    itemCount: number,
    isGroupHeader: boolean,
    sampleN: TableHeaderSampleN | undefined,
  ): string => {
    if (formatter === "none") {
      return label;
    }
    const info: TableHeaderInfo = {
      id,
      label,
      index,
      itemCount,
      isGroupHeader,
      ...(sampleN !== undefined ? { sampleN } : {}),
    };
    return formatter(info);
  };

  const data: TableDataTransformed = {
    ...d,
    colGroups: d.colGroups.map((cg, gi) => ({
      id: cg.id,
      label: cg.label === undefined ? undefined : resolveLabel(
        colFormatter,
        cg.id,
        cg.label,
        undefined,
        nCols,
        true,
        colGroupSampleN[gi],
      ),
      cols: cg.cols.map((col) => ({
        id: col.id,
        label: col.label === undefined ? undefined : resolveLabel(
          colFormatter,
          col.id,
          col.label,
          col.index,
          nCols,
          false,
          colSampleN[col.index],
        ),
        index: col.index,
      })),
    })),
    rowGroups: d.rowGroups.map((rg, gi) => ({
      id: rg.id,
      label: rg.label === undefined ? undefined : resolveLabel(
        rowFormatter,
        rg.id,
        rg.label,
        undefined,
        nRows,
        true,
        rowGroupSampleN[gi],
      ),
      rows: rg.rows.map((row) => ({
        id: row.id,
        label: row.label === undefined ? undefined : resolveLabel(
          rowFormatter,
          row.id,
          row.label,
          row.index,
          nRows,
          false,
          rowSampleN[row.index],
        ),
        index: row.index,
      })),
    })),
  };

  return { data, rowSampleN, colSampleN, rowGroupSampleN, colGroupSampleN };
}
